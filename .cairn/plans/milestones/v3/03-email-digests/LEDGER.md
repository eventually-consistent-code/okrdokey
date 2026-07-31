# Phase 3: email digests — Ledger

<!-- append-only; one line per verified task; server appends, never rewrites -->

- [x] T1–T4 — Email digests complete: nodemailer + all-or-nothing SMTP config, one additive migration (reminders.email_enabled, digest_schedules, email_deliveries), per-recipient mailer with retry + dead-letter log, weekly digest builder + tick, reminder email branch, admin CRUD + test-send preview, /health email flag, digest card + reminder toggle UI, mock-SMTP container smoke proving the real transport. 270 vitest + 4 e2e. — commits f749a45..c172948 — 23 closed 2026-07-31
