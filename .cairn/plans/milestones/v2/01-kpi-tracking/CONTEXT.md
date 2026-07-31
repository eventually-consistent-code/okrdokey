# Phase 1 (v2): KPI Tracking — Context

## Locked decisions

- **KPIs are cycle-less, team-level only.** Fields: name, unit, direction
  `gte | lte | range`, threshold_low/threshold_high, denormalized
  current_value + current_health, archived_at (archive-not-delete, same
  as objectives). Personal KPIs deferred.
- **Own tables, borrowed pattern**: `kpis` + append-only `kpi_readings`
  (value, note, nullable author, source enum reused, api_token_id) with
  denorm-in-transaction. check_ins is NOT polymorphed.
- **Health formula (pinned)**: three states computed server-side —
  gte: healthy v ≥ x; warning v ≥ x − 0.1·|x|; else breach.
  lte: healthy v ≤ x; warning v ≤ x + 0.1·|x|; else breach.
  range a..b: healthy a ≤ v ≤ b; warning within 0.1·(b−a) outside a
  bound; else breach. |threshold| = 0 → band 0 (met/not-met). Pure
  module, unit-tested like scoring.ts.
- **metric_links migration**: kr_links renamed with subject pair —
  key_result_id nullable-unique, kpi_id nullable-unique, CHECK exactly
  one set. New mode `count` (raw done-count → KPI value); percent-closed
  remains KR-only. Sync sweep, providers, watermark, encrypted secrets
  all reused — no second scheduler path. Migration is a SQLite table
  rebuild: verify the generated backfill by hand (card gotcha-9ac4798f).
- **Machine updates**: `POST /kpis/:id/readings` gains
  `config.allowApiToken` (same blast-radius rule); connector syncs write
  readings with source github|jira.
- **Roles**: team admin creates/edits/archives/links KPIs; any member
  records a reading; non-members 404 (no-leak convention).
- **UI**: KPI strip on team dashboard + public share page (health dot,
  value+unit, 12-reading sparkline via existing component); team KPI
  view for CRUD/readings/link config (reuse link-card with provider
  modes constrained). No /my/kpis page.
- **Verification posture**: includes production-container journey
  (card decision-66c0ad59).

Rationale and sources: RESEARCH.md.
