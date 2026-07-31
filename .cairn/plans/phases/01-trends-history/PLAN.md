---
issues: [20, 24]
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
inlines KR trends mirroring the KPI pattern. Cycle summary per-objective
entries gain `trend: number[]` (last 12 event scores from the same
series builder) so the dashboard needs no extra requests. Done when: tests cover
single-KR series, multi-KR merge ordering, decreasing-is-good numeric,
percent/boolean, empty history (points: []), 404 no-leak, and the
share payload trend (values only — no notes/ids).

### T2 — Charts (web)
TimeLine SVG primitive (time-spaced x, min/max-normalized y, start/end
date labels, <2 points → same "not enough" message as Sparkline).
RAG-colored trend lines: Sparkline + TimeLine grow a `tone`
('red'|'yellow'|'green', default accent) mapped to rag tokens; wire
callers — KR sparklines ← currentConfidence, objective TimeLine ←
status, KPI sparklines ← health. Dashboard objective rows render a
mini sparkline from the summary trend array, toned by status.
Objective page: score-over-time chart from useObjectiveHistory above
the KR list. Cycles page: "compare cycles" section — last 4 cycles
via existing useSummary per cycle, avg-score bars + status counts.
Share page: KR sparklines from the new trend arrays. Done when:
component tests cover TimeLine rendering + empty state, tone→stroke
mapping (red/yellow/green + default), dashboard row sparkline, compare view
with 2 cycles, share sparkline presence; lint/typecheck clean.

### T3 — Machined-metal retheme (#24)
Token-layer swap in styles.css: brushed-steel palette (silver/grey/
blue, steel-blue accent), metal-sheen surface gradients, fine-mesh
SVG background pattern, shadow tuning; keep token names so components
stand still. Sweep components for hardcoded warm-palette leftovers.
RAG dots/status colors re-tuned for AA contrast on steel. New charts
(T2) inherit the theme automatically. Done when: every page renders
the new look (dashboard, objective, cycles, teams, share, auth),
component tests still green (they assert behavior, not colors), and a
screenshot pass of each page confirms coherence.

### T4 — Gates + docs
Full suite + e2e + production-container smoke (rebuilt image). README
"What you get" bullet for trends. Done when: all green, no chunk-size
warning regressions.

## Order

T1 → T2 → T3 → T4. Issues #20 (T1–T2) + #24 (T3), single session,
no waves.
