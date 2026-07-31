# Phase 1 (v3): Trends & History — Context

## Locked decisions

- **Zero new tables, zero migrations** — this phase only surfaces data
  that already exists. Any task that wants a schema change is out of
  scope by definition.
- **One new endpoint**: `GET /objectives/:objectiveId/history` →
  `{ points: [{createdAt, score}], perKr: [{keyResultId, title,
  points: [{createdAt, value, score}]}] }`. Exact event-based
  reconstruction server-side (scoring.ts stays the only place scoring
  lives — locked contract, never duplicated in the browser). No
  downsampling (volumes ~1 check-in/KR/week). Access via
  accessibleObjective (same 404-no-leak as everything else).
- **Approximation is documented, not flagged**: the series uses
  CURRENT baseline/target; a numeric KR edited after check-ins makes
  history approximate. OpenAPI description states this; no
  `approximate` boolean (edit detection via updatedAt is unreliable —
  any edit trips it).
- **Per-KR sparklines**: existing GET /key-results/:id/check-ins —
  no new API. Objective page already renders them; upgrade rendering
  only if free.
- **Charts stay hand-rolled SVG, zero chart deps.** New primitive:
  `TimeLine` (time-spaced x-axis polyline with start/end date labels)
  alongside the existing index-spaced Sparkline. StatusDonut untouched.
- **Objective progress chart**: objective page gets a score-over-time
  TimeLine from /history, with per-KR series toggleable only if
  trivial — the objective line is the requirement.
- **Cycle-over-cycle compare**: client-side on the cycles page —
  GET /cycles + GET /cycles/:id/summary per cycle (existing
  endpoints), last 4 non-empty cycles, bar-style comparison of avg
  scores + status counts. No new backend.
- **Public share**: extend publicSummaryResponseSchema with a per-KR
  12-point `trend` array (values only — no notes, no authors, no
  internal ids), exactly mirroring the existing KPI trend pattern in
  share.ts. Payload extension, not a new endpoint.
- **Machined-metal retheme (#24, added 2026-07-31)**: the UI is a
  fully-owned custom theme (Tailwind v4 tokens, no framework) — the
  retheme is a token-values + texture swap, NOT a component rewrite.
  Locked direction: brushed-steel surfaces (subtle vertical-grain
  linear gradients), fine mesh grate texture on the page background
  (SVG data-URI pattern replacing the ruled-paper lines), palette
  silver/grey/blue — dark steel text on light brushed panels with a
  steel-blue accent replacing ember. Semantic token NAMES stay
  (paper/ink/ember/line/rag-*) so components don't churn; only values
  and textures change. RAG red/yellow/green must keep AA contrast on
  the new surfaces. Zero new dependencies — gradients and inline SVG
  patterns only. Fonts: display face may swap to a more machined
  grotesque if it carries the aesthetic; ledger mono stays. The
  frontend-design skill drives the execution pass at work time.
- **Verification posture**: vitest for the history endpoint (series
  correctness incl. pre-first-check-in baseline behavior, multi-KR
  merge ordering, percent/boolean normalization), component tests for
  TimeLine + compare view, container smoke re-run, e2e untouched
  unless a flow breaks.
