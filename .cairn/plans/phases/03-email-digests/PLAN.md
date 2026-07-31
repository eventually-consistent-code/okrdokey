---
issues: [23]
---
# Phase 3 (v3): Email Digests — Plan

## Tasks

### T1 — Config, schema, mailer
nodemailer + types installed (npm-verified). Config smtp block per
CONTEXT (partial-set → throw; tests for all three states). Schema:
reminders.email_enabled + digest_schedules + email_deliveries in ONE
inspected migration. cadence/mailer.ts: transport from config (or
injected jsonTransport option on buildApp), sendEmail() with retry +
email_deliveries bookkeeping. Done when: config matrix tested, mailer
unit-tested via jsonTransport (success + dead-letter), migration SQL
clean.

### T2 — Digest + reminder email delivery
Extract summarizeTeam from summary.ts (route behavior unchanged —
existing tests stay green). cadence/digest.ts: buildDigest(team) —
text+html, roll-up + objectives + who-checked-in-this-week;
runDigestTick on the minute tick (due schedules → send to roster →
advance watermark). Engine reminder branch: email_enabled → send
reminder email to scope recipients. Digest schedule CRUD:
PUT/GET/DELETE /teams/:teamId/digest (admin, 404 pattern) + POST
/teams/:teamId/digest/test (send to caller now). Done when: tick tests
with injected now cover due/advance/disabled/no-smtp; content builder
tested (roll-up numbers, checker names, machine check-ins excluded);
test-send auth matrix; reminder email branch tested.

### T3 — Web UI
Team page digest card (admin): enable toggle, day-of-week + hour →
cron composition, timezone from reminder default, "send me a preview".
Reminder form email toggle. Both surfaces hidden when /teams/:id/digest
404s with feature-off (same probe pattern as AI). Done when: component
tests cover card render/toggle/preview call + hidden-when-off;
lint/typecheck clean.

### T4 — Smoke, docs, gates
e2e/mock-smtp.cjs (node:net, captures messages, serves them for
assertion). Container smoke extension: app + mock-smtp on the docker
network, configure digest, hit test-send, assert the mock received a
message containing the team name. README env table + runbook (SMTP
section: config, relay note, troubleshooting). Full suite + e2e +
rebuilt-image smoke.

## Order

T1 → T2 → T3 → T4, single session, no waves.
