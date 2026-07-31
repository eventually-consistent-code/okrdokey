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
- **Trend lines are RAG-colored (user feedback 2026-07-31)**: every
  progress/trend line takes its stroke from current state instead of
  the one hardcoded accent — KR sparklines by the KR's current
  confidence (last check-in red/yellow/green), the objective TimeLine
  by objective status (on-track→green, at-risk→yellow, behind→red),
  KPI sparklines by computed health (on-target→green, off→red).
  Chart primitives grow a `tone` prop mapping to the rag-* tokens;
  no state logic inside the primitives — callers decide. Accent stays
  the fallback for lines with no state (e.g. share page KPIs already
  passing health). Applies on both the current theme and the metal
  retheme (rag tokens re-tuned there for AA anyway).
- **Dashboard cards get trend lines too (user request 2026-07-31)**:
  each objective row on the dashboard shows a mini score-trend
  sparkline, RAG-colored by objective status. Data rides the cycle
  summary endpoint — each per-objective entry gains
  `trend: number[]` (last 12 event scores, same inline-array pattern
  as share KPIs) so the dashboard makes zero extra requests. No N+1
  history fetches.
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
