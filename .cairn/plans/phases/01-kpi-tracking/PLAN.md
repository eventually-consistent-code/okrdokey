---
issues: [15]
---
# Phase 1 (v2): KPI Tracking — Plan

## Tasks

### T1 — Schema + health module
`kpis` + `kpi_readings` tables; kr_links → `metric_links` rename with
subject pair (nullable-unique key_result_id / kpi_id, CHECK exactly one)
and mode `count`; ONE migration — inspect the generated SQLite rebuild
backfill by hand (gotcha-9ac4798f) and prove it against a seeded v1 db
(existing links must survive the rename with data intact). Pure
`kpiHealth()` module with the pinned formula. Done when: migration
applies over a populated v1 database, drizzle-kit check clean, health
unit tests cover all three directions + band edges + zero-threshold.

### T2 — KPI routes + machine updates
Shared Zod schemas; routes: team-scoped KPI CRUD (admin) + archive,
`POST /kpis/:id/readings` (member; allowApiToken for team tokens;
confidence-free — health is computed), `GET /kpis/:id/readings`
(newest-first). Sync engine: subject dispatch in the sweep — KR links
write check-ins (unchanged), KPI links write readings with provider
source; link routes accept kpi subject + `count` mode validation.
Done when: reading lifecycle + health recompute + token push + KPI
connector sync (fake adapter) integration-tested; all existing 164
tests still green (kr_links rename is invisible to v1 behavior).

### T3 — UI
KPI strip component (health dot, value+unit, 12-reading sparkline) on
team dashboard; team KPI management view (create/edit/archive, reading
entry, link config via existing link-card constrained to count mode for
KPIs); public share page gains the strip (read-only, no notes). Done
when: flows clickable end-to-end in dev; share page shows KPIs without
a session.

### T4 — Tests + e2e + verify prep
Component tests (strip health rendering, reading entry); Playwright e2e
extended: create KPI → reading → health flips on threshold breach →
appears on share page. Production-container smoke script updated to
include a KPI journey (decision-66c0ad59). Done when: full suite + e2e
green locally.

## Order

T1 → T2 → T3 → T4. Single issue (#15) — no waves; parallel fan-out buys
nothing here and the metric_links rename makes serialization the safe
call.
