# Phase 3: OKR Core — Context

## Locked decisions

- **KR types**: `percent | numeric | boolean` + display `unit` string.
  Currency is numeric with a "$" unit, not a type.
- **KR score**: `clamp01((current − baseline) / (target − baseline))`.
  Decreasing-is-good supported implicitly (target < baseline). percent:
  baseline 0, target 100. boolean: 0 or 1.
- **Objective score**: unweighted mean of its KRs' scores, 0.0–1.0.
- **Status formula (hybrid)**: `expected = elapsed fraction of cycle`,
  `delta = objective score − expected`. on-track: delta ≥ −0.10; at-risk:
  −0.25 ≤ delta < −0.10; behind: delta < −0.25. Latest check-in RAG caps
  status DOWNWARD only (red → behind, yellow → at most at-risk); human
  signal never improves computed status.
- **Cycles**: first-class table (id, name, starts_on, ends_on, status).
  Quarter-seeding helper; arbitrary ranges allowed by schema.
- **Ownership/scoping**: objective has `owner_user_id` + nullable
  `team_id` (personal when NULL — phase 2 decision). Team objectives
  visible/editable per membership; write ops need membership, admin not
  required for CRUD in v1.
- **Archive, not delete**: objectives get `archived_at`; archived excluded
  from default lists and scoring.
- **Check-ins**: append-only log (value, confidence red|yellow|green,
  note, author, created_at); `current_value` + `current_confidence`
  denormalized on key_results in the same transaction. No edits of past
  check-ins in v1.
- **Cadence**: per-team (and per-user for personal) reminder config —
  cron-like weekly default, IANA timezone, optional webhook URL
  (Slack-compatible `{ text }` payload). croner 10.x drives an
  every-minute tick; due-ness lives in SQLite `next_due_at` watermark
  (restart-safe). Scheduler OFF under NODE_ENV=test.
- **Webhook delivery**: native fetch, 10s timeout, 3 attempts exp backoff
  (1s/5s/25s), dead-letter flag (`delivery_failed_at`, `last_error`).
- **All phase-3 schema lands in the first task** (issue #4) so the wave-2
  parallel work (#5, #6) never touches schema.ts — lesson from phase 2's
  migration collision.

Rationale and sources: RESEARCH.md.
