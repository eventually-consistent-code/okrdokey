# Phase 1 (v3): Trends & History — Research

Researched 2026-07-31 (one subagent, standard depth). All file:line
evidence checked against the working tree.

## What exists

- Charts are hand-rolled SVG, zero deps (charts.tsx: StatusDonut +
  Sparkline). Per-KR check-in sparklines ALREADY render on the
  objective page (objective.tsx:27-31 maps useCheckIns history).
  KPI trends already flow to the public share page as inline 12-point
  arrays (share.ts:192-215).
- GET /key-results/:id/check-ins returns full history, newest first,
  no pagination (volumes tiny: ~1/KR/week). Same shape for KPI
  readings.
- check_ins stores the normalized absolute value per event — a KR's
  score at any timestamp is rebuildable from the last check-in ≤ t
  (pre-first-check-in value = baseline for numeric, 0 otherwise).

## Score reconstruction caveats

- scoring.ts is a locked contract (krScore clamp01 + objectiveScore
  unweighted mean) — duplicating it client-side invites drift, so the
  series computes server-side.
- baseline/target ARE editable post-creation for numeric KRs
  (PATCH /key-results, routes.ts:312-319) with no history — a
  reconstructed series uses CURRENT baseline/target and is approximate
  after such an edit. Percent/boolean are pinned at creation and
  immune. KR deletion removes it from the mean going forward.

## Cycle-over-cycle

cycles carry starts/ends + open/closed status; no stored final score —
always computed on read. GET /cycles/:id/summary already returns
per-objective scores + team roll-ups scoped to the requester; a
compare view can call it once per cycle (2–5 requests, all existing
endpoints). For closed cycles elapsed clamps to 1 and scores reflect
last check-ins — honest as a final score.

## Recommendation (adopted)

One new endpoint: GET /objectives/:id/history — server-side exact
event-based series (merge all KR check-ins by createdAt, step each
KR's value, emit {t, score} per event; no downsampling needed at these
volumes). Per-KR sparklines need nothing new. Cycle compare is pure
client over existing endpoints. Public share gets per-KR trend arrays
mirroring the KPI pattern (payload extension, not a new endpoint).
