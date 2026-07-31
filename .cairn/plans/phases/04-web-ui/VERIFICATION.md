# Phase 4: Web UI — Verification

Verified: 2026-07-31 (goal-backward, standard depth)

## What the phase promised (CONTEXT.md + PLAN.md)

A web UI covering every flow, served by the same Fastify process with the
existing API contract untouched, plus a public read-only share-link
dashboard with a no-leak payload — issues #7 (REQ-06), #12 (REQ-12).

## What was checked, and results

| Check | Result |
|---|---|
| Vitest | 15 files, 141/141 (node + happy-dom projects) |
| Playwright e2e vs BUILT app | 2/2 — full user journey incl. SPA-fallback refresh; anonymous context reads the share page |
| ESLint / tsc / drizzle-kit check | 0 / 0 / clean (migrations through 0005) |
| API contract untouched | the 123 pre-phase tests run unmodified inside the new guard encapsulation |
| Production container journey (plain http) | signup → me → team → cycle → objective → share token → anonymous public summary with `cache-control: no-store` — all green after fix below |
| No-leak payload | tests assert raw public body contains no notes, emails, or internal ids |
| Tracker | issue_list(phase 4, open) = empty; #7/#12 closed with evidence; LEDGER.md complete |

## Defect found by verification (traced, fixed, closed)

**trace-ed2e2c78 / issue #17**: production hard-coded `Secure` session
cookies → on the docker-compose-up plain-http path, signup returned 200
but every later call 401'd (browser/curl refuse to send Secure cookies
over http). Invisible to vitest/Playwright (non-production env) — only
the production-container smoke caught it. Fix: cookie `secure: 'auto'` +
fastify `trustProxy: true` (TLS-terminating proxies still get Secure via
x-forwarded-proto). Commit db170fa; re-verified end-to-end in the
container. A second suspected failure (share PUT) was the verification
curl harness itself (json content-type with empty body) — not an app bug.

## TDD evidence

No `tdd:` frontmatter — none required.

## Deviations

- SPA browser routes moved to `/o/:id`, `/my/…` after the deep-link smoke
  found path collisions with API endpoints — API paths stayed canonical.
- Docker entrypoint mints a persistent session secret in the data volume
  on first boot (zero-config compose up; prod still rejects weak secrets).
- Image 516MB — slimming still in README TODO.
- CI e2e job added; its first GitHub run happens at ship (gate as usual).

## Verdict

PASS — after the traced cookie fix, the phase delivers what it promised,
confirmed by tests, e2e, and a production-container journey.
Next: `/cairn:ship` or `/cairn:plan 5`.
