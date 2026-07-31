# Phase 3: OKR Core — Research

One research subagent, standard depth. Versions verified July 2026.

## Findings

**KR measurement types.** Survey: Tability start→target numeric with unit
display; Perdoo metric vs milestone; Quantive attainment formula
`(actual−initial)/(target−initial)`; Profit.co maximalist (400 templates).
Minimal-sufficient v1: `percent | numeric | boolean` with display `unit`
string (currency is numeric + "$" unit, not a type). Score:
`clamp01((current − baseline) / (target − baseline))` — decreasing-is-good
(churn 5→2) falls out free when target < baseline; no direction flag.

**Objective scoring + status.** Convention: objective score = unweighted
mean of KR scores (weighted = paid-tier feature elsewhere; nullable weight
column later if wanted). Google grading 0.0–1.0, ~0.7 is the success line,
consistent 1.0 = sandbagging. Status derivation is the interesting split:
Tability = confidence-based (RAG), Quantive/Perdoo = time-vs-progress.
Hybrid recommended, precisely: `expected = elapsed fraction of cycle`,
`delta = score − expected`; on-track if delta ≥ −0.10, at-risk if
−0.25 ≤ delta < −0.10, behind if delta < −0.25; then latest check-in RAG
caps DOWNWARD only (red → behind, yellow → at most at-risk). Sane with
zero check-ins, respects owner judgment, never lets vibes inflate math.

**Cycles.** First-class `cycles` table (id, name, starts_on, ends_on,
status) like Tability/Perdoo — derived "2026-Q3" strings break on H1 or
6-week cycles and can't hold state. Quarters seeded via helper; custom
cycles later = feature flag, not migration.

**Scheduling (single Node process).** npm check: croner 10.0.1 (active,
zero-dep, TS-native, per-job IANA tz), node-cron 4.6.0, toad-scheduler
4.1.0, node-schedule stale. All in-process timers share one flaw: restarts
drop the firing moment. Fix: correctness lives in SQLite, not the timer —
reminder rows carry `next_due_at`; croner drives an every-minute tick
selecting `WHERE next_due_at <= now`, fires, advances. Missed windows
caught on next boot. (https://github.com/hexagon/croner)

**Webhook delivery.** Slack incoming-webhook payload = POST `{ text }`
(https://api.slack.com/messaging/webhooks). Native fetch +
`AbortSignal.timeout(10s)`, 3 attempts exponential backoff (1s/5s/25s),
then `delivery_failed_at` + `last_error` dead-letter flag on the row. No
queue lib (BullMQ needs Redis — off-stack).

**Check-in immutability.** Append-only `check_ins` log (kr, value, RAG
confidence, note, author, created_at) with `current_value` +
`current_confidence` denormalized onto key_results in the same
better-sqlite3 transaction. Latest-check-in subqueries make every roll-up
a lateral join; SQLite transactions make denorm trivially consistent.
Delete = recompute from remaining log.

## Sources

- https://www.tability.io/okrs · https://support.perdoo.com/en/articles/2519182-key-result · https://www.profit.co/blog/okr-university/key-result-types/
- https://www.whatmatters.com/faqs/how-to-grade-okrs · https://rework.withgoogle.com/en/guides/set-goals-with-okrs
- https://github.com/hexagon/croner · https://api.slack.com/messaging/webhooks
- npm version checks (2026-07)
