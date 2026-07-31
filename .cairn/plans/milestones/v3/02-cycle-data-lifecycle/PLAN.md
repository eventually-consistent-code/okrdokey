---
issues: [21, 22]
---
# Phase 2 (v3): Cycle & Data Lifecycle — Plan

## Tasks

### T1 — Close + rollover backend (#21)
Shared schemas: rolloverRequest/Response (clonedObjectives,
clonedKeyResults, skipped, hadLinks: [{title}]). POST /cycles/:id/close
(409 on closed), POST /cycles/:id/rollover per CONTEXT — one
transaction, caller-visibility scoping, skip rules, fresh baselines,
link-drop reporting, archiveSource flag. Done when: tests cover close,
double-close 409, rollover skip rules (archived, score 1 objective,
score-1 KR inside carried objective), numeric baseline reset,
percent/boolean reset, confidence null, links dropped + reported,
source archived, other users' objectives untouched, unknown target 404.

### T2 — Export + import (#22)
lib/csv.ts: escape/emit + strict parse (quoted fields, no embedded
newlines) with unit tests. GET /export (JSON, caller-visible, archived
in), GET /export.csv (import columns). POST /import/objectives with
dryRun — grouping, name resolution, per-row errors, all-or-nothing.
Done when: round-trip test (create data → export.csv → import into a
fresh cycle → objects match), dry-run writes nothing, bad row aborts
whole import, non-member team name errors, empty-KR objective row
works.

### T3 — Web (#21+#22)
Cycle cards: close button + rollover dialog (target picker,
archiveSource checkbox, result summary incl. re-link prompts). "Your
data" card: export buttons (JSON/CSV download), import textarea →
dry-run preview table → confirm. Done when: component tests cover
rollover dialog happy path + had-links display, import preview +
error rows; lint/typecheck clean.

### T4 — Gates + docs (#21+#22)
e2e: rollover journey (objective w/ progress → close+rollover → new
cycle carries it fresh). README: import/export TODO line drops, data
section mentions export; runbook backup section links export as a
second backup path. Full suite + container smoke.

## Order

T1 → T2 → T3 → T4, single session, no waves.
