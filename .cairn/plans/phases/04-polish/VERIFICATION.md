# Phase 4: Polish — Verification

Verified 2026-07-31. Standard depth: goal-backward against CONTEXT.md
locked decisions + full gate run, including a fresh production-container
build carrying all phase commits (44dbce7..dc124ce).

## What was checked

- **Image slimming**: deps stage scoped to api+shared confirmed in the
  Dockerfile; rebuilt image measures 489MB (from 516MB — the ~35MB the
  research predicted, ±1MB layer noise). Non-goals honored: no bundling,
  no alpine swap. Production-container AI journey (signup → objective →
  /ai/status → draft → improve → log-leak scan) green on the rebuilt
  image (decision-66c0ad59).
- **Rate limits**: `@fastify/rate-limit@11.2.0`, `global: false` — only
  login, signup (5/min per IP each) and /public/:token/summary (60/min)
  opt in. Proven twice: vitest (6th login 429, signup bucket
  independent, other-IP unaffected, 61st public hit 429 with misses
  counting, /health takes 10 rapid hits) AND live in the production
  container (6 curl logins → 401×5 then 429). Deviation from the plan
  recorded in CONTEXT: groupId does not merge counters under the
  in-memory store, so login/signup keep separate buckets.
- **Session sweep**: store decorated on the app instance (test asserts
  exposure + sweep-on-empty), sweep() semantics unit-tested (expired
  rows only), hourly branch added to the croner tick with error
  isolation. The tick itself never runs under NODE_ENV=test by design —
  wiring is compile-checked and code-reviewed, not tick-simulated.
- **Bundle warning**: `npm run build` emits no chunk-size warning;
  threshold 600 with 497KiB/153KiB-gzip justification in the config
  comment.
- **Descope**: issue #18's "small UX debt" line had no enumerated items
  anywhere — descoped in CONTEXT, stated in the close comment.

## Gates

225 vitest (26 files, including the new rate-limit suite), 3 Playwright
e2e, container smoke + in-container rate-limit probe, lint 0,
typecheck 0. Issue #18 closed with evidence; `issue_list(phase 4,
open)` empty; ledger line present. No `tdd:` frontmatter → TDD n/a.

## Verdict

PASS — next: /cairn:ship, then /cairn:summit closes the v2 milestone.
