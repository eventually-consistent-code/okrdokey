---
status: resolved
issue: 27
created: 2026-07-31
resolved: 2026-07-31
---
# Trace: v3 P3 verify: (1) email.test.ts digest-content test TITLE claims "machine check-ins excluded" but the fixture contains no machine-source check-in — the exclusion is never exercised (title-level phantom coverage); (2) PLAN T2 done-when lists a disabled-schedule tick case that doesn't exist; (3) the reminder-form email toggle (T3 deliverable) has no component test.

## verdict — 2026-07-31
All three gaps closed in 0b3e1af: a planted github-source check-in now proves the exclusion the test title claimed (behavior was already correct — authorUserId null filters before name mapping), disabled schedules verifiably send nothing on tick, and the reminder email toggle is component-tested in both SMTP states. 272 vitest + 4 e2e green. Third consecutive verify where every finding was phantom coverage, zero behavior bugs.

## resolution — 2026-07-31
Coverage gaps closed in 0b3e1af (machine-exclusion proof, disabled-schedule tick, toggle visibility tests); behavior was already correct in all three. Gates green (272 vitest, 4 e2e).
