---
issues: [14]
---
# Phase 2 (v2): Wizard Lite — Plan

## Tasks

### T1 — Template library (shared)
`packages/shared/src/templates.ts`: KrTemplate type, 18 templates (6
functions × 3, content from research), OBJECTIVE_SUGGESTIONS, and a
`fillTemplate(t, {baseline, target})` helper mapping onto our
CreateKeyResultRequest shape (percent/boolean fixed ranges respected).
Unit tests: every template produces a valid CreateKeyResultRequest via
the Zod schema; interpolation edges. Done when: tests green, exported
from the shared index.

### T2 — Wizard dialog + placement
`kr-wizard.tsx`: 3-step Radix dialog per CONTEXT (category grid with
coach notes, measure step with prefills + boolean soft-hint, review
step with title preview + >4-KR amber warning). Posts via the existing
useCreateKeyResult. Placement: "guide me" beside + key result; primary
CTA in the zero-KR empty state. Objective dialog gains category picker
+ title suggestions (datalist). Done when: flows clickable in dev,
expert path untouched.

### T3 — Tests + e2e
Component tests: step progression, template prefill lands in the form
state, boolean hint renders, >4-KR warning math. e2e: guided path —
open wizard from empty state → pick engineering latency template →
fill 500→200 → review shows interpolated title → create → KR appears
with correct baseline/target. Done when: full suite + e2e green; API
test count unchanged (proving zero backend surface).

## Order

T1 → T2 → T3. Single issue (#14) — no waves; it's one frontend seam.
