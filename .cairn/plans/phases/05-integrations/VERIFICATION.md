# Phase 5: Integrations — Verification

Verified: 2026-07-31 (goal-backward, standard depth)

## What the phase promised (CONTEXT.md + PLAN.md)

The differentiator: scoped API tokens with a one-endpoint blast radius,
machine pushes as first-class check-ins, and GitHub/Jira connectors that
move KR values on a restart-safe schedule — issues #8 (REQ-08), #9
(REQ-09), #10 (REQ-10).

## What was checked, and results

| Check | Result |
|---|---|
| Vitest | 19 files, 164/164 — 23 new this phase (token lifecycle + blast radius, sync mapping/backoff/secret round-trip, GitHub adapter incl. ETag/304, Jira adapter incl. JQL error surfacing; both adapters integration-tested through the real runSync against mock servers) |
| Playwright e2e | 2/2 still green |
| ESLint / tsc / drizzle-kit check | 0 / 0 / clean (migrations through 0006) |
| Live push journey (running server) | mint token (okr_ prefix) → the README curl one-liner verbatim → check-in lands value=42, source=api, author=null → KR current/score/objective score all update |
| Blast radius live | same bearer on GET /objectives → 401 (tokens work only on the push endpoint) |
| Secret handling live | link PUT response carries no secret; sqlite LIKE probe confirms plaintext absent from the db file (AES-GCM ciphertext only) |
| Jira endpoint correctness | adapter uses /rest/api/3/search/approximate-count; the removed /rest/api/3/search never appears in the codebase |
| Tracker | issue_list(phase 5, open) = empty; #8/#9/#10 closed with evidence; LEDGER.md complete |

## Defect found and fixed during wave 1 (inline, not traced — caught pre-commit)

drizzle-kit's generated check_ins table rebuild selected the NEW columns
from the OLD table (SQLITE_ERROR on migrate). Backfill hand-corrected in
the generated SQL ('ui', NULL for the new columns); drizzle-kit check
clean. Caught by the test suite before any commit — never reached main.

## TDD evidence

No `tdd:` frontmatter — none required.

## Deviations

- Machine check-ins without confidence log the KR's current confidence
  (or green on a fresh KR) — the history row's confidence column is
  non-null by design; the KR's denormalized confidence is only moved
  when a caller explicitly sends one.
- Connector adapters are verified against local mock servers, not live
  GitHub/Jira — endpoint shapes pinned from verified docs (RESEARCH.md).
- CI green-on-GitHub for this phase pending push (ship gate, as always).

## Verdict

PASS — the phase delivers what it promised, confirmed by tests and a
live token→push→score journey. Next: `/cairn:ship`, then `/cairn:summit`.
