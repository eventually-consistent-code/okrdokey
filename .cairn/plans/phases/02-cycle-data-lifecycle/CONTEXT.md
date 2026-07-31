# Phase 2 (v3): Cycle & Data Lifecycle — Context

## Locked decisions

- **Cycle close**: POST /cycles/:cycleId/close sets status:'closed'
  (409 if already closed). Ungated like cycle create. Dashboard picker
  already prefers open cycles — no other behavior changes.
- **Rollover**: POST /cycles/:cycleId/rollover {targetCycleId,
  archiveSource?: true} — close source + clone in ONE better-sqlite3
  transaction. Clones only objectives VISIBLE TO THE CALLER (summary
  visibility rule). Skip: archived objectives, objectives at computed
  score >= 1; within carried objectives, KRs at score 1 stay behind.
  Fresh starts: numeric baseline = old currentValue (target unchanged),
  percent 0/100, boolean 0/1, currentConfidence null. Check-in history
  stays with the old KRs. Connector links are NOT carried (unique
  keyResultId + encrypted secrets + sync state); response lists
  {title} of KRs that had links so the UI prompts re-linking.
  archiveSource default true archives the source objectives.
- **Export**: GET /export → JSON composition of existing response
  shapes (cycles, objectives+KRs, check-ins, KPIs+readings), scoped to
  caller visibility, ARCHIVED INCLUDED (it is a backup). GET
  /export.csv → objectives+KRs flattened to exactly the import columns
  (round-trip by construction). Hand-rolled RFC 4180 emission.
- **Import**: POST /import/objectives, JSON body {csv: string},
  ?dryRun=true returns {creates, preview, errors} writing nothing.
  Columns: objective_title, objective_description, team_name,
  cycle_name, kr_title, kr_type, kr_unit, kr_baseline, kr_target.
  Consecutive rows sharing objective_title+team_name+cycle_name group
  into one objective. Names resolved server-side (team must be one the
  caller belongs to; cycle by unique name); unresolvable → row error.
  Any error → nothing written (all-or-nothing transaction). Strict
  parser: quoted fields supported, embedded newlines NOT (documented).
  Auth = same as create (member-level team, self personal).
- **Zero new deps**: CSV emission ~15 lines, strict parser ~40 lines,
  both hand-rolled with tests. csv-parse stays out until import scope
  grows freeform multi-line fields.
- **Schema change**: NONE — status enum already exists; no migrations.
- **Web**: cycles page — "close" + "roll over…" on open-cycle cards
  (dialog: pick target cycle from existing open ones, archiveSource
  checkbox, shows had-link warnings after); a "Your data" card on the
  cycles page with Export JSON / Export CSV buttons and an Import
  flow (paste CSV → dry-run preview table → confirm import).
- **Verification posture**: vitest for close/rollover semantics (skip
  rules, baseline resets, link-drop reporting, transaction atomicity,
  visibility scoping), import dry-run/commit/error/all-or-nothing,
  export→import round-trip test; component tests for the dialog +
  data card; e2e rollover journey; container smoke re-run.
