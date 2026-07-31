# OKRdokey

OKRdokey — a simple, self-hostable OKR tracker for small teams.

Spreadsheet-simple, docker-compose-up, your data. The bar we're trying to
beat isn't the enterprise OKR platforms — it's the Google Sheet nobody
updates…

## Quickstart (Docker)

```bash
git clone https://github.com/eventually-consistent-code/okrdokey.git
cd okrdokey
docker compose up
```

That's it. The API is on http://localhost:3000, interactive API docs at
http://localhost:3000/docs.

Your data lives in `./data/okrdokey.sqlite` — one file. **Backup = copy that
file.** (Stop the container first, or copy the `-wal` file along with it.)

## Development

Requires Node 22+.

```bash
npm ci
npm run dev        # API with watch reload
npm test           # vitest across all packages
npm run lint       # eslint (type-aware)
npm run typecheck  # tsc across workspaces
```

Layout: npm workspaces monorepo — `packages/api` (Fastify + Drizzle +
SQLite), `packages/shared` (Zod schemas — the single source of truth for
request/response types), `apps/web` coming in a later phase.

Database migrations are generated from the TypeScript schema
(`packages/api/src/db/schema.ts`):

```bash
npm run db:generate --workspace packages/api   # emit SQL migration
npm run db:migrate  --workspace packages/api   # apply (also runs on boot)
```

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

Environment knobs:

| Variable | Default | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | (unset) | Instance-wide Anthropic key — fallback for teams without one |
| `AI_MODEL` | `claude-opus-4-8` | Model used for drafting |
| `AI_FEATURES` | `on` | Set to `off` to remove every AI route and UI affordance |

Guardrails: requests are proxied server-side (keys never reach the browser),
prompt bodies are never logged, and drafting is capped at 10 requests per
user and 30 per team per hour.

## License

Apache-2.0.

## TODO:

# - auth + teams (phase 2)
# - OKR core: objectives, key results, check-in cadence, scoring (phase 3)
# - web UI + public read-only dashboard (phase 4)
# - KR auto-update API, GitHub + Jira connectors (phase 5)

More to come...
