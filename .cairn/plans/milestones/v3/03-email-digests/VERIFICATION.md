# Phase 3 (v3): Email Digests — Verification

Verified 2026-07-31. Standard depth: line-by-line done-when audit (per
decision-dad3ba9e) + full gates including the mock-SMTP container
journey. Commits under verification: 3626905 (T1–T3), c172948 (T4),
0b3e1af (verify fixes).

## What was checked

- **One new dependency** (nodemailer 9.0.3, zero runtime deps of its
  own) — registry-verified before pinning (gotcha-682fc61c). One
  additive migration, inspected clean (no rebuild backfill).
- **Config matrix tested**: absent → dark, host-without-from → boot
  refusal, half an auth pair → boot refusal, full → shaped with
  587/STARTTLS defaults.
- **Mailer**: delivered send books attempts=1 + deliveredAt;
  dead-letter after exactly 3 attempts with lastError; per-recipient
  sends verified (each capture is a single address — no shared To);
  bodies never stored (schema has no body column).
- **Digest**: content carries roll-up, per-objective scores/statuses,
  who-checked-in-this-week with a PLANTED machine check-in proving the
  humans-only rule; due schedule mails the full roster and advances
  the watermark; second tick sends nothing (idempotent); disabled
  schedules verifiably fire nothing; bad cron 400s; member CRUD 404s;
  test-send goes to the caller only.
- **Reminder email branch**: email-enabled team reminder mails the
  roster on tick with the check-in subject.
- **Feature gating**: /health email flag both states; digest routes
  404 without SMTP; digest card and reminder toggle component-tested
  hidden/shown in both states.
- **Container journey**: mock SMTP (dep-free node:net) beside the
  production image — digest configured, test-send fired, message
  captured naming the team. Real transport, real socket, shipped
  image (decision-66c0ad59).

## Found and fixed during verify

- Three phantom-coverage spots (trace-28dc05ce / #27, fixed 0b3e1af):
  a test title claiming machine-check-in exclusion the fixture never
  exercised, a missing disabled-schedule tick case, an untested
  reminder email toggle. All three behaviors were already correct —
  third consecutive verify where every finding was proof-debt, not
  code-debt.

## Accepted deviations

- Week-over-week deltas deferred by design (CONTEXT records it).
- The scheduler's live minute-cron wiring is compile-checked, not
  tick-simulated (never runs under NODE_ENV=test by design — same
  posture as the session sweep in v2 P4).

## Gates

272 vitest (32 files), 4 Playwright e2e, container smoke with SMTP +
AI mocks, lint 0, typecheck 0, exit codes checked directly. Issue #23
closed with evidence; no open phase-3 issues; ledger line present.
No `tdd:` frontmatter → TDD n/a.

## Verdict

PASS — next: /cairn:ship, then /cairn:summit closes v3.
