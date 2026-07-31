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

## License

Apache-2.0.

## TODO:

# - auth + teams (phase 2)
# - OKR core: objectives, key results, check-in cadence, scoring (phase 3)
# - web UI + public read-only dashboard (phase 4)
# - KR auto-update API, GitHub + Jira connectors (phase 5)
# - slim the Docker image down

More to come...
