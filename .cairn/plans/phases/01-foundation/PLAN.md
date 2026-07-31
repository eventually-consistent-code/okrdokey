---
issues: [1, 11]
---
# Phase 1: Foundation — Plan

## Tasks

### T1 — Monorepo scaffold
npm workspaces root with `packages/api` and `packages/shared`. Root
`tsconfig.base.json` (strict), ESLint flat config (typescript-eslint,
type-aware) + Prettier, shared scripts (`lint`, `typecheck`, `test`),
Apache-2.0 LICENSE file at root.
Done when: `npm ci && npm run lint && npm run typecheck` pass on a clean
checkout.

### T2 — Fastify app skeleton
`packages/api`: Fastify server bootstrap with `fastify-type-provider-zod`,
env-based config (port, db path), structured error handler, `GET /health`
route with Zod response schema. Done when: server starts and `/health`
returns 200 JSON.

### T3 — Drizzle + SQLite persistence
Drizzle ORM wired to better-sqlite3; `drizzle-kit` migration workflow
(generate/apply scripts); initial migration with a `meta` table (schema
version marker) proving the pipeline end-to-end. Done when: fresh checkout
can create the db from migrations with one script.

### T4 — OpenAPI from route schemas
`@fastify/swagger` + `@fastify/swagger-ui` fed by the Zod route schemas;
spec served at `/docs` (UI) and `/docs/json`. Done when: `/health` appears
in the generated spec with its response schema — no hand-written spec.

### T5 — Vitest harness
Vitest configured for the workspace; unit test example in `packages/shared`;
API integration test in `packages/api` using `fastify.inject()` against a
throwaway SQLite db (covers `/health` + migration bootstrap). Done when:
`npm test` runs both packages green.

### T6 — CI pipeline
GitHub Actions workflow on push/PR to main: checkout → setup-node (22,
npm cache) → `npm ci` → lint → typecheck → `vitest run` → drizzle migration
check. Done when: workflow green on GitHub for this phase's branch/commit.

### T7 — Docker one-command deploy
Dockerfile (multi-stage build) + `docker-compose.yml`: single container,
single SQLite volume, migrations run on boot, healthcheck on `/health`.
README quickstart + backup note (copy one file). Done when: fresh machine
`docker compose up` serves `/health` and `/docs`. (Issue #11, REQ-11.)

## Order

T1 → T2 → T3 → T4/T5 (parallel) → T6 → T7.

T1–T6 advance issue #1 (REQ-07); T7 advances issue #11 (REQ-11).
