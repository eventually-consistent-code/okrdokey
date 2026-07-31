---
issues: [18]
---
# Phase 4: Polish — Plan

## Tasks

### T1 — Image slimming
Deps stage installs only api+shared workspaces (one-line Dockerfile
change; drop the now-unneeded web package.json COPY from that stage).
Remove the README TODO line. Done when: image rebuilds, size reported
(~495MB, from 516MB), and the production-container AI smoke passes on
the rebuilt image.

### T2 — Rate limiting
Add `@fastify/rate-limit@11.2.0`; register `global: false` in buildApp;
per-route config on GET /public/:token (60/min) and POST /auth/login +
/auth/signup (5/min, shared groupId 'auth'). Done when: tests prove the
6th login attempt in a window 429s, signup shares the bucket, /public
throttles at 61, and normal API routes stay unlimited.

### T3 — Session sweep
Decorate app with the session store instance; hourly branch in the
croner tick calls store.sweep(); log swept count when > 0. Done when: a
test seeds expired + live session rows and sweep removes exactly the
expired ones; scheduler wiring compiles under the existing tick test.

### T4 — Bundle warning + docs
chunkSizeWarningLimit 600 with justification comment in vite.config.ts.
Done when: `npm run build` emits no chunk-size warning; lint/typecheck
clean.

## Order

T1–T4 independent; run sequentially in one session (small phase, no
waves).
