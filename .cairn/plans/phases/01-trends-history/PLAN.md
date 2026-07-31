---
issues: [20]
---
# Phase 1 (v3): Trends & History — Plan

## Tasks

### T1 — History endpoint + share trends (backend)
Shared schemas: objectiveHistoryResponseSchema (points + perKr), and
publicSummaryResponseSchema gains per-KR `trend: number[]` (12 points,
values only). GET /objectives/:objectiveId/history — event-based score
series: fetch all KR check-ins, merge by createdAt (tiebreak rowid),
step per-KR values (numeric pre-first = baseline; percent/boolean = 0),
emit objective score per event via scoring.ts functions. share.ts
inlines KR trends mirroring the KPI pattern. Done when: tests cover
single-KR series, multi-KR merge ordering, decreasing-is-good numeric,
percent/boolean, empty history (points: []), 404 no-leak, and the
share payload trend (values only — no notes/ids).

### T2 — Charts (web)
TimeLine SVG primitive (time-spaced x, min/max-normalized y, start/end
date labels, <2 points → same "not enough" message as Sparkline).
Objective page: score-over-time chart from useObjectiveHistory above
the KR list. Cycles page: "compare cycles" section — last 4 cycles
via existing useSummary per cycle, avg-score bars + status counts.
Share page: KR sparklines from the new trend arrays. Done when:
component tests cover TimeLine rendering + empty state, compare view
with 2 cycles, share sparkline presence; lint/typecheck clean.

### T3 — Gates + docs
Full suite + e2e + production-container smoke (rebuilt image). README
"What you get" bullet for trends. Done when: all green, no chunk-size
warning regressions.

## Order

T1 → T2 → T3. Single issue (#20), single session, no waves.
