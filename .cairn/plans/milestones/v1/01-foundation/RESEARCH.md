# Phase 1: Foundation — Research

Stack research brief (mid-2026 ecosystem), one subagent, standard depth.

## Findings

**HTTP framework — Fastify.** Route schemas drive validation, response
serialization, AND OpenAPI generation (`@fastify/swagger` +
`@fastify/swagger-ui`) from one definition, so the spec can't drift from the
routes. Hono's edge/cross-runtime strengths buy nothing on a self-hosted Node
box and its session ecosystem is thinner; Express 5 lacks the schema→OpenAPI
story; NestJS is overweight for this scope. `@fastify/session` +
`@fastify/cookie` cover session auth cleanly.

**Schema/validation — Zod v4 via `fastify-type-provider-zod`.** One Zod schema
per route yields static TS types, runtime validation, and JSON Schema for the
swagger plugin — the "OpenAPI kept in sync" requirement falls out for free.
Zod over TypeBox: ecosystem lingua franca, and the same schemas get reused by
the React UI later.

**ORM — Drizzle (v1, stable).** Schema in TypeScript, `drizzle-kit generate`
emits reviewable SQL migrations with tracked state — best migrations story
without Prisma's codegen weight. Kysely has no built-in migrations. Caveat:
do NOT split SQLite-dev/Postgres-prod — dialect differences make dual-dialect
a false economy. One database everywhere.

**Database — SQLite (better-sqlite3), sole target.** Small-team OKR tracker is
low-write, low-concurrency — squarely SQLite territory. Self-host story:
one container, one volume, backup = copy one file. Hosted multi-tenant future
would be a deliberate migration, not a day-one hedge.

**Repo layout — npm workspaces monorepo from day one.** `packages/api`,
`packages/shared` (Zod schemas + inferred types), `apps/web` added in Phase 4.
Shared package exists precisely so the web UI imports the same
request/response schemas. No turborepo/nx until build times hurt.

**Tests + lint — Vitest, ESLint flat config.** Vitest: better watch/coverage
DX, one runner shared with the future web package. ESLint (typescript-eslint,
type-aware) over Biome: `no-floating-promises` and friends matter in an async
server; Biome's type-aware coverage still trails. Prettier for formatting.

**CI — one GitHub Actions workflow.** push/PR to main: checkout → setup-node
(Node 22 LTS, npm cache) → `npm ci` → lint → `tsc --noEmit` → `vitest run` →
drizzle-kit migration check. SQLite = no service containers.

## Sources

- [NestJS vs Fastify vs Hono 2026 (Encore)](https://encore.dev/articles/nestjs-vs-fastify-vs-hono)
- [OpenAPI for Node.js 2026 (PkgPulse)](https://www.pkgpulse.com/guides/swagger-ui-express-vs-hono-zod-openapi-vs-fastify-2026)
- [Drizzle v1 vs Prisma 6 vs Kysely 2026 (PkgPulse)](https://www.pkgpulse.com/guides/drizzle-orm-v1-vs-prisma-6-vs-kysely-2026)
- [ORMs 2026 comparison (SciHub101)](https://scihub101.com/web-development/orms-prisma-vs-drizzle-vs-kysely-2026)
- [Biome vs ESLint 2026 (PkgPulse)](https://www.pkgpulse.com/guides/biome-vs-eslint-vs-oxlint-2026)
