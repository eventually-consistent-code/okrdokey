---
status: resolved
issue: 17
created: 2026-07-31
resolved: 2026-07-31
---
# Trace: Fresh docker container over plain http://localhost cannot keep a session — signup returns 200 but every authenticated call after it is 401, so login is impossible on a bare self-host without TLS

## evidence — 2026-07-31
Phase-4 verification container smoke: signup 200, but team create / share enable / public summary chain returned 401s → token variable empty → /public/undefined/summary 404. Reproduced only under NODE_ENV=production (container); vitest + Playwright (non-production) pass. Session cookie is set with secure:true when NODE_ENV=production (auth/plugin.ts), so curl and browsers refuse to send it back over plain http://localhost:3000.

## hypothesis — 2026-07-31
Cookie `secure: true` hard-coded for production is wrong for the docker-compose-up-on-localhost story. Fix: `secure: 'auto'` (@fastify/session sets Secure only when the connection is actually encrypted) + fastify `trustProxy: true` so x-forwarded-proto from a reverse proxy still yields Secure cookies behind TLS.

## test — 2026-07-31
After secure:'auto' + trustProxy: fresh production container over plain http — signup → /auth/me 200, team/cycle/objective creation works, share token minted, anonymous /public/:token/summary returns the team payload with cache-control: no-store. Full vitest suite 141/141 still green (https deploys still get Secure via x-forwarded-proto). Note: a second suspected failure (share PUT 404→400) was the verification curl harness sending a json content-type with no body — not an app defect.

## verdict — 2026-07-31
Root cause confirmed: hard-coded secure:true production cookie made sessions impossible over plain http (the docker-compose-up localhost path). Fixed with cookie secure:'auto' plus fastify trustProxy:true so TLS-terminated proxy deploys still emit Secure cookies. Verified end-to-end in the production container.

## resolution — 2026-07-31
Cookie secure:'auto' + fastify trustProxy:true (commit db170fa). Production container verified end-to-end over plain http; TLS deploys keep Secure cookies via x-forwarded-proto. Suite 141/141 green.
