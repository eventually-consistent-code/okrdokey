---
issues: [4, 5, 6]
wave_1: [4]
wave_2: [5, 6]
---
# Phase 3: OKR Core — Plan

## Tasks

### T1 — Full phase schema + cycles (issue #4)
ALL phase-3 Drizzle tables in one migration: `cycles`, `objectives`
(owner_user_id, nullable team_id, cycle_id, title, description,
archived_at), `key_results` (objective_id, title, type, unit, baseline,
target, current_value, current_confidence), `check_ins` (kr_id, value,
confidence, note, author_user_id, created_at), `reminders` (scope
team/user, cron expr, timezone, webhook_url, next_due_at, enabled),
`webhook_deliveries` (reminder_id, payload, attempts, delivered_at,
delivery_failed_at, last_error). Cycle CRUD routes + quarter-seed helper.
Done when: migration applies, cycles CRUD tested. Wave-2 tasks must NOT
touch schema.ts.

### T2 — Objectives + KRs CRUD (issue #4)
Routes: create/list/get/update/archive objectives (filter: cycle, team,
mine; membership enforced — non-member 404); nested KR create/update/
delete under an objective. Shared Zod schemas. Done when: CRUD + scoping
matrix integration-tested (personal vs team, non-member 404, archived
excluded from default list).

### T3 — Check-ins (issue #5)
`POST /key-results/:id/check-ins` (value + RAG confidence + note) —
append-only insert + denormalize current_value/current_confidence in one
transaction; `GET .../check-ins` history (newest first). Membership
enforced through the owning objective. Done when: history integrity +
denorm consistency tested (multiple check-ins, concurrent-ish updates).

### T4 — Cadence engine + webhook nudges (issue #5)
Reminder config routes (team admins / personal owner); croner-driven
every-minute tick reading `next_due_at <= now` from SQLite, firing
Slack-compatible webhook (`{ text }` — team's OKRs due for check-in),
advancing watermark per cron expr + IANA tz; delivery with 10s timeout,
3 retries exp backoff, dead-letter columns. Scheduler disabled in tests;
tick callable directly. Done when: watermark math (incl. missed-window
catch-up) + delivery retry/dead-letter tested with a local receiver.

### T5 — Scoring + cycle summary (issue #6)
Pure scoring module (packages/shared or api/src/scoring): KR score
formula, objective mean, hybrid status per CONTEXT.md thresholds + RAG
downgrade caps. Endpoints: score/status embedded in objective GET/list
responses; `GET /cycles/:id/summary` (per-objective scores, statuses,
team + personal breakdown, cycle progress fraction). Done when: formula
unit tests cover edges (target<baseline, zero-length cycle, no check-ins,
RAG caps) + summary integration test.

## Order

T1 → T2 → wave 2: T3+T4 (issue #5) ∥ T5 (issue #6).

T1/T2 advance #4; T3/T4 advance #5; T5 advances #6.
