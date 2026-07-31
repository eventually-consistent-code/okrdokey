# Phase 1: Foundation — Context

## Locked decisions

- **Runtime**: Node 22 LTS, TypeScript strict.
- **HTTP framework**: Fastify. Route schemas are the single source for
  validation, serialization, and OpenAPI (`@fastify/swagger` + swagger-ui).
- **Validation**: Zod v4 via `fastify-type-provider-zod`. Schemas live in
  `packages/shared` so the Phase 4 web UI imports the same types.
- **ORM**: Drizzle ORM v1 + `drizzle-kit` SQL migrations.
- **Database**: SQLite (better-sqlite3), sole target for dev AND prod. No
  Postgres hedge — one dialect everywhere; backup = copy one file.
- **Repo layout**: npm workspaces monorepo — `packages/api`,
  `packages/shared`, `apps/web` (Phase 4). No turborepo/nx yet.
- **Tests**: Vitest (unit + API integration against in-memory/throwaway
  SQLite).
- **Lint/format**: ESLint flat config with typescript-eslint type-aware rules
  + Prettier.
- **CI**: single GitHub Actions workflow — `npm ci`, lint, `tsc --noEmit`,
  `vitest run`, drizzle migration check.
- **License**: Apache-2.0 core; future paid features in proprietary `ee/`
  (GitLab/Operately open-core model). SSO and core OKR features never gated.
- **Deploy**: `docker compose up` is a first-class v1 requirement (REQ-11) —
  single container, single SQLite volume, migrations on boot.

Rationale and sources: see RESEARCH.md.
