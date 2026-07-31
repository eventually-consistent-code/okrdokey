# Phase 2: Auth and Teams — Verification

Verified: 2026-07-31 (goal-backward, standard depth)

## What the phase promised (CONTEXT.md + PLAN.md)

Multi-user auth with real session revocation, Argon2id passwords,
default-deny authorization, teams with a role model that doesn't leak
existence, generic free OIDC with verified-email linking, and all of it
visible in /docs — issues #2 (REQ-04), #3 (REQ-05), #13 (REQ-13).

## What was checked, and results

| Check | Result |
|---|---|
| Vitest suite | 6 files, 52/52 — auth cycle, revocation, enumeration-proof 401s, CSRF origin check, teams role matrix (20 tests), OIDC mock-provider flows (9 tests), session-store unit tests, foundation tests |
| ESLint / tsc | 0 errors each |
| drizzle-kit check | clean (migrations 0000–0003 agree with schema) |
| Default-deny promise | unmarked route 401s, unknown path still 404s (no route-existence leak) — tested |
| Revocation promise | logout kills the server-side row; reused cookie 401s — tested |
| Teams promises | creator=admin, member/admin/non-member matrix, 404-not-403 for non-members, last-admin demote/remove 409 — tested |
| OIDC promises | new-user, verified-email linking, identity reuse (no dup users), `email_verified:false` → 403, state mismatch → 400, unconfigured → 404 + password auth unaffected — tested against a jose-signed mock provider |
| Tracker | issue_list(phase 2, open) = empty; #2/#3/#13 closed with evidence; LEDGER.md has all three with commit ranges |

## TDD evidence

No `tdd:` frontmatter — no RED/GREEN pairs required.

## Deviations

- **Verify-time test addition**: T1 promised session-store unit tests;
  integration flows covered set/get/destroy but expiry + sweep() were
  untested. Added `test/session-store.test.ts` during verification
  (commit 41a8ade) — all pass; no production code changed.
- **Fail-loud partial OIDC config** (subagent deviation, kept): a partial
  OIDC env set throws at boot instead of silently running password-only.
  Better than the spec.
- **cookieOf helper retype**: wave-1 test helper failed typecheck under
  fresh node_modules (light-my-request headers admit `number`); fixed
  during wave 2 by both subagents, `OutgoingHttpHeaders` version kept.
- **Parallel-worktree migration collision**: both wave-2 agents generated
  an `0002_*` migration; teams' kept, OIDC's regenerated as 0003 on the
  merged schema. drizzle-kit check confirms coherence.
- **CI green-on-GitHub for this phase** pending next push (ship gate),
  same as phase 1; all CI steps pass locally.

## Verdict

PASS — the phase delivers what it promised. Next: `/cairn:ship` or
`/cairn:plan 3`.
