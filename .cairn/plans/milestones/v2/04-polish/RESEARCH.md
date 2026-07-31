# Phase 4: Polish — Research

Researched 2026-07-31 (one subagent, standard depth). Numbers measured
against the real lockfile and the built `okrdokey-smoke` image.

## Docker image (516MB → ~495MB)

The Dockerfile is already a three-stage build with `--omit=dev` — the
big wins are banked (full install 333MB vs prod 144MB). What remains:
the deps stage installs ALL workspaces, so the runtime carries the web
package's production deps (react-dom 8M, tanstack 11M, radix-ui 6M,
react-hook-form 3M, fontsource 3M…) that only exist as a built dist.
Scoping the install to the api+shared workspaces measures 109MB vs
144MB — ~35MB off with a one-line change:

```dockerfile
RUN npm ci --omit=dev --ignore-scripts -w packages/api -w packages/shared && npm cache clean --force
```

tsx is a production dep of packages/api (runtime needs it), and
better-sqlite3 (27M), drizzle-orm (17M), @anthropic-ai/sdk (11M) all
survive the scoped install. Bundling stays off the table (swagger-ui
ERR_AMBIGUOUS_MODULE_SYNTAX, prior phase). node:22-alpine would save
~100MB more but swaps glibc prebuilds for musl — separate risk, out of
scope for polish.

## Rate limiting

`@fastify/rate-limit@11.2.0` (latest; README compat table: >=10.x ↔
fastify ^5.x — we pin fastify ^5.11.0). Register `global: false`, then
per-route `config: { rateLimit: { max, timeWindow } }`. Default
keyGenerator uses `request.ip`, which already resolves through
`trustProxy: true` — no custom generator. Default in-memory LRU store
matches the single-process deployment. `groupId` shares one bucket
across login+signup.

## Session sweep

`DrizzleSessionStore.sweep()` already exists (session-store.ts:71-74,
deletes rows with `expires_at < now`, returns changes) — nothing calls
it. Hook: `startScheduler()`'s every-minute croner tick in
cadence/engine.ts. The store instance is constructed inline in
auth/plugin.ts and not exposed — decorate or run the same one-line
delete against app.db in the tick.

## Web bundle

One chunk: 497 KiB raw / 148 KiB gzip — react 19 + router + query +
radix + zod baseline, no outlier dependency, no heavy route to
lazy-load. Vite 8 is rolldown-based (manualChunks deprecated). Cheap
fix is honest: raise `chunkSizeWarningLimit` to 600 with a comment
stating the gzip number.
