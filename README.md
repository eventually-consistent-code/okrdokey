# OKRdokey

OKRdokey — a simple, self-hostable OKR tracker for small teams.

Spreadsheet-simple, docker-compose-up, your data. The bar we're trying to
beat isn't the enterprise OKR platforms — it's the Google Sheet nobody
updates…

## Contents

- [What you get](#what-you-get)
- [Quickstart (Docker)](#quickstart-docker)
- [Configuration](#configuration)
  - [SSO (OIDC)](#sso-oidc)
- [Development](#development)
- [API tokens](#api-tokens)
- [Connectors (GitHub + Jira)](#connectors-github--jira)
- [AI drafting](#ai-drafting-optional-bring-your-own-key)
- [Operations runbook](docs/RUNBOOK.md) — deploy, TLS, backup/restore,
  upgrades, monitoring, troubleshooting, disaster recovery
- [License](#license)

## What you get

- **Objectives + key results** with baselines, targets, and three KR types
  (numeric — decreasing-is-good works too, percent-complete, done/not-done).
  Scores roll up: KR progress → objective score → cycle dashboard.
- **Check-ins with confidence** — every update carries a red/yellow/green
  read, and objective status (on-track / at-risk / behind) is computed from
  progress vs. time elapsed, never hand-picked.
- **Teams and cycles** — quarterly cycles fill their own dates
  (`2026-Q4` → Oct 1–Dec 31), objectives are team-owned or personal.
- **Check-in cadence nudges** — per-team reminder schedules (cron + IANA
  timezone) delivered to a webhook (Slack-compatible payload).
- **Auto-updating KRs** — push values from scripts/CI with `okr_…` API
  tokens, or link a KR to a GitHub milestone / Jira JQL count and let the
  sync loop move the number as work closes.
- **Cycle rollover** — quarter ends: one click closes the cycle and
  carries unfinished objectives forward with fresh baselines; done work
  and check-in history stay put.
- **CSV import/export** — bring objectives in from a spreadsheet
  (dry-run preview first), take everything out as JSON or CSV. The
  escape hatch works in both directions, on purpose.
- **Trends & history** — score-over-time charts and RAG-colored trend
  lines rebuilt from your check-in history (no extra data entry), mini
  trends on the dashboard, cycle-over-cycle comparison.
- **KPIs beside OKRs** — steady-state metrics (uptime, NPS, MRR) with
  target bands and computed health, so "keep it green" numbers don't
  masquerade as objectives.
- **Guided KR wizard** — a 3-step teaching path with 18 templates that
  keeps "launch the thing" tasks from sneaking in as key results.
- **AI drafting (optional, BYO key)** — draft 2–3 measurable KR suggestions
  from an objective, or get a critique + rewrite of one you typed. A coach,
  not an autopilot.
- **Public read-only dashboards** — share a team's cycle behind an
  unguessable link, revocable any time.
- **SSO via any OIDC provider** (Authentik, Keycloak, Authelia, Google…) —
  free, not enterprise-gated. Password auth stays on either way.
- **One container, one SQLite file** — no external services, no Redis, no
  Postgres. Backup is one file copy.

Interactive API docs (OpenAPI, generated from the same schemas that
validate every request) live at `/docs` on any running instance.

## Quickstart (Docker)

```bash
git clone https://github.com/eventually-consistent-code/okrdokey.git
cd okrdokey
docker compose up
```

That's it. The app is on http://localhost:3000, API docs at
http://localhost:3000/docs. A session secret is generated on first boot
and persisted in the data volume — zero config required.

Your data lives in `./data/okrdokey.sqlite` — one file. **Backup = copy that
file.** (Stop the container first, or copy the `-wal` file along with it.)

Running this for real? The **[operations runbook](docs/RUNBOOK.md)** covers
deploy shapes, reverse-proxy/TLS setup, backup and restore done right,
upgrades, monitoring, and what to do when things break.

## Configuration

Everything is environment variables, all optional:

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `3000` | Listen port |
| `HOST` | `0.0.0.0` | Bind address |
| `DB_PATH` | `./data/okrdokey.sqlite` | SQLite file location |
| `SESSION_SECRET` | auto-generated in Docker | Cookie signing + secret encryption key (32+ chars required in production) |
| `APP_URL` | `http://localhost:<port>` | Public URL — used to build the OIDC redirect |
| `ALLOWED_ORIGINS` | (empty) | Extra origins the CSRF check trusts, comma-separated (dev: the Vite server) |
| `OIDC_ISSUER_URL` | (unset) | OIDC discovery URL — set all three OIDC vars or none |
| `OIDC_CLIENT_ID` | (unset) | OIDC client id |
| `OIDC_CLIENT_SECRET` | (unset) | OIDC client secret |
| `OIDC_REDIRECT_URI` | `<APP_URL>/auth/oidc/callback` | Override if your proxy rewrites paths |
| `ANTHROPIC_API_KEY` | (unset) | Instance-wide AI key — fallback for teams without one |
| `AI_MODEL` | `claude-opus-4-8` | Model used for AI drafting |
| `AI_FEATURES` | `on` | Set to `off` to remove every AI route and UI affordance |
| `LOG_LEVEL` | `info` | Pino log level |

Deploy behind a TLS-terminating reverse proxy and cookies come out right
automatically — the app trusts `x-forwarded-proto` and uses `Secure`
cookies whenever the connection is actually encrypted.

Built-in abuse limits (per IP): login and signup 5/min each, public
dashboards 60/min, AI drafting 10/user/hr + 30/team/hr. Nothing else is
throttled.

### SSO (OIDC)

Point the three `OIDC_*` vars at any OpenID Connect provider and a "log
in with SSO" path appears next to password login. Discovery does the
rest — no per-provider adapters. Partial config (one or two vars) is
treated as a mistake and refuses to boot rather than half-working.

## Development

Requires Node 22+.

```bash
npm ci
npm run dev        # API with watch reload (port 3000)
npm run dev --workspace packages/web   # Vite dev server with API proxy
npm test           # vitest across all packages (mock AI server included)
npm run e2e        # Playwright against the real built app
npm run lint       # eslint (type-aware)
npm run typecheck  # tsc across workspaces
```

Layout: npm workspaces monorepo — `packages/api` (Fastify + Drizzle +
SQLite), `packages/web` (React SPA, served by the API in production),
`packages/shared` (Zod schemas — the single source of truth for
request/response types; one schema drives validation, OpenAPI, and the
web client).

Database migrations are generated from the TypeScript schema
(`packages/api/src/db/schema.ts`):

```bash
npm run db:generate --workspace packages/api   # emit SQL migration
npm run db:migrate  --workspace packages/api   # apply (also runs on boot)
```

Tests never call Anthropic — a mock server stands in everywhere,
including the container smoke test. e2e wants a clean slate: delete
`/tmp/okrdokey-e2e.sqlite` between runs and start from the repo root.

## API tokens

Team admins can mint `okr_…` API tokens (team settings) and push key-result
values from scripts or CI:

```bash
curl -X POST -H "Authorization: Bearer okr_..." \
     -H "content-type: application/json" \
     -d '{"value": 42}' \
     http://localhost:3000/key-results/<id>/check-ins
```

Tokens are shown once, stored hashed, revocable, and only work on the push
endpoint — a leaked token can't read or change anything else.

Scanning your repos for leaked tokens? Add this to your gitleaks config:

```toml
[[rules]]
id = "okrdokey-api-token"
description = "OKRdokey API token"
regex = '''okr_[A-Za-z0-9_-]{43}'''
```

## Connectors (GitHub + Jira)

Link a key result to a GitHub milestone (closed/total issues) or a Jira
JQL count and the sync loop updates the KR as work moves — no manual
check-ins for numbers a tracker already knows. Connector credentials are
encrypted at rest with a key derived from `SESSION_SECRET`.

## AI drafting (optional, bring your own key)

The guided KR wizard can draft 2–3 measurable key-result suggestions from an
objective, and critique a key result you typed yourself. It's a coach, not an
autopilot — suggestions only prefill the form, and every baseline it invents
is a placeholder you replace with your real number.

Two ways to turn it on:

- **Per team** — a team admin pastes an Anthropic API key in Team Settings.
  The key is validated against the API before it saves, encrypted at rest,
  and never shown again (last four characters only).
- **Instance-wide** — set `ANTHROPIC_API_KEY` on the server. Personal
  objectives always use the instance key; team objectives prefer the team
  key when one is set.

Guardrails: requests are proxied server-side (keys never reach the browser),
prompt bodies are never logged, and drafting is capped at 10 requests per
user and 30 per team per hour.

## License

Apache-2.0.

## TODO:

# - more connectors as folks ask (GitLab? Linear?)

More to come...
