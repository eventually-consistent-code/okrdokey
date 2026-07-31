# OKRdokey Runbook

Everything an operator needs to run OKRdokey in production — deploy,
upgrade, backup, break-glass. If you've ever wondered "what happens if I
lose this file?", the answer is in here…

## Contents

- [Architecture in one paragraph](#architecture-in-one-paragraph)
- [Deploy](#deploy)
- [Reverse proxy + TLS](#reverse-proxy--tls)
- [The session secret](#the-session-secret)
- [Backup and restore](#backup-and-restore)
- [Upgrades](#upgrades)
- [Health and monitoring](#health-and-monitoring)
- [The scheduler](#the-scheduler)
- [Rate limits](#rate-limits)
- [SSO (OIDC) operations](#sso-oidc-operations)
- [AI drafting operations](#ai-drafting-operations)
- [Troubleshooting](#troubleshooting)
- [Disaster recovery](#disaster-recovery)

## Architecture in one paragraph

One Node process (Fastify) serves the API and the built web SPA on one
port. State is one SQLite file (WAL mode) plus an in-process scheduler
that ticks every minute for reminder webhooks, connector sync, and an
hourly session sweep. No Redis, no Postgres, no background workers —
if the container is up, everything is up. That's the deal: you trade
horizontal scale (which a small team doesn't need) for an ops story
that fits in this file.

## Deploy

### docker compose (recommended)

```bash
git clone https://github.com/eventually-consistent-code/okrdokey.git
cd okrdokey
docker compose up -d
```

First boot generates a session secret into `./data/.session-secret`
(mode 600) and applies database migrations automatically. The stack is
one service; `restart: unless-stopped` is already set.

### Plain docker

```bash
docker build -t okrdokey .
docker run -d --name okrdokey \
  -p 3000:3000 \
  -v /srv/okrdokey/data:/data \
  --restart unless-stopped \
  okrdokey
```

The image expects a volume at `/data` (database + generated secret live
there). Environment variables go on `docker run -e` or the compose
`environment:` block — the full table is in the
[README](../README.md#configuration).

### Sizing

Any box that runs Docker. Idle footprint is a single Node process and a
SQLite file; hundreds of users on one small VM is the expected shape.
There is no multi-process mode — don't run two containers against one
database file (the rate-limit counters are per-process and SQLite WAL
doesn't love concurrent writers across containers).

## Reverse proxy + TLS

Terminate TLS at your proxy and forward to port 3000. The app trusts
`x-forwarded-proto` (`trustProxy` is on) and switches session cookies to
`Secure` automatically when the connection is encrypted — plain-HTTP
localhost keeps working for kick-the-tires runs.

Caddy (two lines, auto-TLS):

```
okr.example.com {
    reverse_proxy localhost:3000
}
```

nginx:

```nginx
server {
    listen 443 ssl;
    server_name okr.example.com;
    # ssl_certificate ...; ssl_certificate_key ...;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

`X-Forwarded-For` matters: rate limiting keys on the client IP, and
without the header every visitor shares your proxy's bucket. Set
`APP_URL=https://okr.example.com` when using OIDC so the redirect URI
builds correctly.

## The session secret

The secret signs session cookies **and** derives (via HKDF) the
AES-256-GCM key that encrypts secrets at rest — connector credentials
(GitHub/Jira) and team Anthropic API keys.

- **Where it lives:** `SESSION_SECRET` env var if you set one, otherwise
  the auto-generated `/data/.session-secret` (in the data volume, so it
  survives container replacement).
- **Losing it:** everyone is logged out (annoying) and every encrypted
  credential becomes undecryptable (worse) — connector links and team AI
  keys must be re-entered. The database itself is fine.
- **Rotating it:** same consequences as losing it, by design. Rotate by
  setting a new `SESSION_SECRET` (or deleting `/data/.session-secret`
  and restarting), then re-enter connector credentials and team AI keys
  in the UI. There is no dual-key re-encryption window — this is a
  small-team tool, not a KMS.
- **Back it up with the database.** A database restore without the
  matching secret is a partial restore.

## Backup and restore

Everything is in two files in the data volume:

| File | What |
|---|---|
| `okrdokey.sqlite` (+ `-wal`, `-shm`) | All application data |
| `.session-secret` | Cookie signing + encryption key (if auto-generated) |

**Cold backup (simplest, seconds of downtime):**

```bash
docker compose stop
cp -a ./data ./backups/okrdokey-$(date +%F)
docker compose start
```

**Hot backup (no downtime):** use SQLite's online backup — it takes a
consistent snapshot while the app runs:

```bash
sqlite3 ./data/okrdokey.sqlite ".backup ./backups/okrdokey-$(date +%F).sqlite"
cp ./data/.session-secret ./backups/  # don't forget the secret
```

Do **not** plain-`cp` the live database without the `-wal` file — you'll
get a snapshot missing recent writes.

**Application-level export** (third backup path): any signed-in user
can pull `GET /export` — a JSON document of everything they can see,
check-in history included. It restores by hand or via the CSV import,
not byte-for-byte — the SQLite copy above is the real backup; the
export is the your-data-leaves-with-you guarantee.

**Restore:**

```bash
docker compose stop
cp ./backups/okrdokey-2026-07-31.sqlite ./data/okrdokey.sqlite
rm -f ./data/okrdokey.sqlite-wal ./data/okrdokey.sqlite-shm
cp ./backups/.session-secret ./data/
docker compose start
```

Migrations re-apply on boot if the backup predates an upgrade — restoring
an old database into a new version is supported; the reverse (new
database, old version) is not.

## Upgrades

```bash
git pull
docker compose up -d --build
```

Migrations run automatically on boot, forward-only. Take a backup first
(see above) — that's your rollback path: roll back = restore the backup
AND check out the matching older commit. Watch the first boot:

```bash
docker compose logs -f | head -50
```

A healthy boot logs migration application (if any) and
`docs live at http://localhost:3000/docs`.

## Health and monitoring

- **`GET /health`** returns `{"status":"ok","version":"…"}` — no auth,
  not rate-limited. Point your uptime monitor here.
- **Docker healthcheck** is built into the image (30s interval against
  `/health`) — `docker ps` shows healthy/unhealthy, and orchestrators
  that respect it will restart a wedged container.
- **Logs** are JSON (pino) on stdout — `docker compose logs -f`, or ship
  them wherever with a logging driver. `LOG_LEVEL=debug` for more,
  `warn` for less. AI prompt bodies and every kind of key are redacted
  at the logger level; they never appear at any log level.
- Reminder webhook delivery failures and connector sync errors are
  logged and retried on later ticks — they never crash the process.

## The scheduler

One in-process cron ticking every minute (started after listen; never
runs under tests):

| Cadence | Job |
|---|---|
| every minute | reminder webhooks due (`next_due_at` watermark) |
| every minute | GitHub/Jira connector sync due (`sync_due_at` watermark) |
| top of the hour | expired session row sweep (logs count when > 0) |

Watermarks live in the database, so a restart never double-fires or
skips work — a reminder due while the container was down fires on the
next tick after boot.

## Rate limits

Per client IP, in-memory, per-process:

| Surface | Limit | Why |
|---|---|---|
| `POST /auth/login` | 5/min | credential guessing |
| `POST /auth/signup` | 5/min | account spam |
| `GET /public/:token/summary` | 60/min | share-token brute force (misses count) |
| AI drafting | 10/user/hr + 30/team/hr | upstream cost control (these two live in SQLite and survive restarts) |

Everything else is unlimited. Limits reset on container restart (except
the AI counters). If legitimate users hit auth limits, check that
`X-Forwarded-For` is actually reaching the app — see
[Reverse proxy](#reverse-proxy--tls).

## SSO (OIDC) operations

Set `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` (all three
— a partial set refuses to boot, on purpose) and `APP_URL`. Register the
redirect URI `https://<your-host>/auth/oidc/callback` with your
provider. Discovery handles the rest; Authentik, Keycloak, Authelia, and
Google are all just "point at the issuer URL".

Removing the vars removes the SSO routes; password auth is always
available either way. Accounts are matched by email, but only when the
provider vouches for it (`email_verified: true`) — a user who signed up
with a password logs in via SSO into the same account; an unverified
provider email never hijacks an existing account.

## AI drafting operations

- **Off switch:** `AI_FEATURES=off` removes every AI route and UI
  affordance instance-wide.
- **Key precedence:** team key (Team Settings, encrypted at rest) over
  instance `ANTHROPIC_API_KEY`; personal objectives use the instance key
  only.
- **Cost exposure:** each draft request is one model call capped at 1024
  output tokens, rate-limited 10/user/hr + 30/team/hr. Worst-case spend
  is arithmetic, not a surprise.
- **Upstream failures** (bad key, Anthropic rate limit, overload) map to
  plain-language errors in the UI; the server logs ids and counts, never
  prompt bodies or keys.
- **Model choice:** `AI_MODEL` (default `claude-opus-4-8`). No
  restart-free switching — it's an env var.

## Troubleshooting

**Logged out constantly / login loops behind a proxy** — the proxy isn't
sending `X-Forwarded-Proto: https`, so cookies aren't marked Secure (or
the browser refuses them). Fix the proxy headers; see
[Reverse proxy](#reverse-proxy--tls).

**Everyone rate-limited on login** — all traffic appears as one IP.
`X-Forwarded-For` isn't reaching the app; fix the proxy headers.

**`SESSION_SECRET must be set (32+ chars) in production`** — you set
`NODE_ENV=production` outside Docker without a secret. Set one, or use
the container entrypoint which generates it.

**Connector links or team AI keys suddenly failing after a restore or
secret change** — encrypted-at-rest data no longer matches the secret.
Re-enter the credentials; see [The session secret](#the-session-secret).

**`ERR_DLOPEN_FAILED` / better-sqlite3 errors on a custom base image** —
the prebuilt binaries need glibc 2.38+. Stick with the shipped
`node:22-trixie-slim` base (alpine/musl and older Debian won't work
without a compile step).

**Database is locked** — something else has the SQLite file open (a
second container, a stray `sqlite3` shell). One writer only.

**Webhook reminders not arriving** — check the logs for delivery errors
(the payload endpoint must answer 2xx), confirm the reminder's cron
expression and timezone in team settings, and remember delivery pauses
while the container is down and resumes on the next tick.

## Disaster recovery

Total host loss. You need: the latest backup of `okrdokey.sqlite` +
`.session-secret`, and this repository.

```bash
git clone https://github.com/eventually-consistent-code/okrdokey.git
cd okrdokey
mkdir -p data
cp /your/backups/okrdokey-latest.sqlite data/okrdokey.sqlite
cp /your/backups/.session-secret data/
docker compose up -d
```

Time to recover: minutes. If you have the database but not the secret,
you're still up — users log in again, admins re-enter connector
credentials and AI keys. If you have neither, there is nothing to
recover; take backups.
