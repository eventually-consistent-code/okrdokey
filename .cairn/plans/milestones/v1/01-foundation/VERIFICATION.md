# Phase 1: Foundation — Verification

Verified: 2026-07-30 (goal-backward, standard depth)

## What the phase promised (CONTEXT.md + PLAN.md)

A TypeScript API foundation where the OpenAPI spec cannot drift from the
routes, persistence with reviewable migrations, a test harness that drives
the real app, CI, and a one-command self-host deploy — issues #1 (REQ-07)
and #11 (REQ-11).

## What was checked, and results

| Check | Result |
|---|---|
| ESLint (type-aware, all packages) | 0 errors |
| tsc --noEmit (all workspaces) | 0 errors |
| Vitest suite | 2 files, 7/7 passed — health, OpenAPI spec content, migration bootstrap, shared error shape, schema unit tests |
| drizzle-kit check (schema ↔ migrations) | "Everything's fine" — no drift |
| Container smoke (fresh dir, `docker run` of compose-built image) | /health 200 `{"status":"ok","version":"0.1.0"}`; /docs 200; spec paths include /health; SQLite file created in mounted volume; Docker healthcheck reports healthy |
| Spec-sync mechanism | /docs/json generated from the same Zod schemas that validate requests (fastify-type-provider-zod + jsonSchemaTransform) — no hand-written spec exists in the repo |
| Tracker | issue_list(phase 1, open) = empty; both issues closed with evidence comments; LEDGER.md carries both entries with commit ranges |

## TDD evidence

PLAN.md has no `tdd:` frontmatter — no RED/GREEN pairs required.

## Deviations

- **CI green-on-GitHub not yet observed**: the workflow (T6) is committed and
  every step it runs (`npm ci`-equivalent install, lint, typecheck, vitest,
  drizzle-kit check) passes locally, but the repo hasn't been pushed — the
  first Actions run happens at `/cairn:ship`. If it fails there, that's a
  ship-gate failure, not a silent skip.
- **Image size 467MB** — accepted for v1, slimming tracked in README TODO.
- **Runtime base is node:22-trixie-slim** (not bookworm): better-sqlite3 v13
  prebuilds require glibc ≥ 2.38. Recorded in the T7 commit message.
- **Stack versions vs research**: RESEARCH.md said "Drizzle v1" — actual
  published latest is drizzle-orm 0.45.x / drizzle-kit 0.31.x; pinned to
  those. No functional impact.

## Verdict

PASS — the phase delivers what it promised. Next: `/cairn:ship` (which also
gives CI its first real run) or `/cairn:plan 2`.
