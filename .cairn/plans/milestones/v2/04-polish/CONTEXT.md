# Phase 4: Polish — Context

## Locked decisions

- **Image slimming**: scope the Dockerfile deps stage to the api+shared
  workspaces (`npm ci --omit=dev --ignore-scripts -w packages/api -w
  packages/shared`) — drops the web package's runtime deps (~35MB,
  516→~495MB). NO bundling (swagger-ui ESM failure, prior phase). NO
  alpine swap (musl vs glibc prebuilt risk, gotcha-59e3c5c4) — out of
  scope.
- **Rate limiting**: `@fastify/rate-limit@11.2.0` pinned, registered
  `global: false` (nothing limited by default). Per-route config only:
  `/public/:token` GET 60/min per IP; `/auth/login` and `/auth/signup`
  each 5/min per IP (separate buckets — groupId does NOT merge counters
  under the in-memory store; observed empirically, decision updated
  2026-07-31). Default
  keyGenerator (trustProxy already set) + default in-memory store —
  matches single-process deployment.
- **Session sweep**: call the existing `DrizzleSessionStore.sweep()`
  hourly from the croner tick in cadence/engine.ts. Expose the store
  instance via app decoration (testable), don't duplicate the delete.
- **Bundle warning**: raise `chunkSizeWarningLimit` to 600 in
  packages/web/vite.config.ts with a comment recording 497 KiB raw /
  148 KiB gzip and why no split (no outlier dep, manualChunks
  deprecated under rolldown).
- **"Small UX debt" (issue #18 line)**: nothing enumerated anywhere in
  the tracker or plans — descoped from this phase. Anything real
  surfaces later via /cairn:mark. README TODO line "slim the Docker
  image down" gets removed as part of T1.
- **Verification posture**: container smoke re-run after the Dockerfile
  change (decision-66c0ad59); rate-limit and sweep get vitest coverage;
  no e2e changes needed.
