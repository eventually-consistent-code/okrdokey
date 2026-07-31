# Phase 3 (v3): Email Digests — Context

## Locked decisions

- **Library**: nodemailer 9.0.3 (zero runtime deps) + @types/nodemailer
  (version re-checked at install per gotcha-682fc61c). The ONLY new
  dependency this phase.
- **Config**: smtp block on AppConfig, OIDC-style all-or-nothing:
  SMTP_HOST + SMTP_FROM required together; SMTP_PORT default 587;
  SMTP_SECURE default false (STARTTLS); SMTP_USER/SMTP_PASS optional
  as a pair (unauthenticated LAN relays are legitimate); partial sets
  refuse to boot. No SMTP config = zero email surface anywhere (routes
  404, UI hides — same pattern as AI_FEATURES).
- **Two features, two homes**:
  - Check-in reminder emails: reminders gains `email_enabled` (bool,
    default false) beside webhookUrl; engine grows a symmetric email
    branch. Recipients derive from scope (team roster / the one user)
    — no address storage.
  - Weekly team digest: new `digest_schedules` table (teamId PK,
    cronExpr, timezone, enabled, nextDueAt, createdAt) fired from the
    same minute tick; default schedule Monday 09:00 in the team's
    chosen timezone.
- **Delivery bookkeeping**: new `email_deliveries` table mirroring
  webhookDeliveries (parallel table, NOT polymorphic): id, kind
  ('reminder'|'digest'), sourceId, recipientCount, attempts,
  deliveredAt, deliveryFailedAt, lastError, createdAt. Same 3-attempt
  [1s,5s,25s] retry constants. Message bodies are never stored.
- **One migration** for all three changes (ALTER reminders + 2 new
  tables) — generated SQL INSPECTED for the rebuild-backfill bug
  (gotcha-9ac4798f).
- **Digest content v1 = current state**: team roll-up (avg + status
  counts), per-objective title/score/status, "who checked in this
  week" from checkIns.authorUserId (machine sources excluded), open
  cycles only. Requires extracting summarizeTeam(app, cycleId, teamId)
  from the summary route body — scoring primitives already exported.
  Week-over-week deltas explicitly deferred.
- **Format**: plain text + minimal inline HTML (no template engine, no
  CSS frameworks — hand-built strings, both parts on every send).
- **Test-send endpoint**: POST /teams/:teamId/digest/test (admin) sends
  the digest immediately to the caller only — powers the UI "send me a
  preview" button AND the container smoke (no waiting on cron).
- **Unit tests**: nodemailer jsonTransport injected via an app option
  (never dangling real sockets in vitest). **Container smoke**: real
  SMTP transport against a dep-free node:net mock (e2e/mock-smtp.cjs),
  mirroring the mock-anthropic pattern.
- **Recipients privacy**: emails only ever go TO team members; no CC
  leakage — one send per recipient or BCC, decide at impl (prefer
  per-recipient sends; volumes tiny).
- **UI**: team page digest card (enable toggle, day-of-week + hour
  pickers that compose the cron, "send me a preview" button, admin
  only); reminder form gains an email toggle beside the webhook field.
- **Verification posture**: engine tests for digest due/advance +
  reminder email branch (fake now injection like existing cadence
  tests), content builder tests, delivery bookkeeping incl. failure
  dead-letter, config partial-set rejection, test-send auth matrix;
  container smoke proves a real message lands in the mock SMTP from
  the production image.
