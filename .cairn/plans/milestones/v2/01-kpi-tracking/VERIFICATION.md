# Phase 1 (v2): KPI Tracking — Verification

Verified: 2026-07-31 (goal-backward, standard depth)

## What the phase promised (CONTEXT.md + PLAN.md)

Cycle-less team KPIs with computed three-state health, append-only
readings, machine updates through the shared token/connector plumbing,
and a KPI strip beside the OKRs including the public share page —
issue #15.

## What was checked, and results

| Check | Result |
|---|---|
| Vitest | 21 files, 185/185 — 21 new (health-formula band edges + zero-threshold, lifecycle/roles, health transitions, token push, KPI connector sync, public no-leak) |
| Playwright e2e | 2/2 incl. the KPI journey (create → reading → health renders → anonymous share strip) |
| ESLint / tsc / drizzle-kit check | 0 / 0 / clean (migration 0007) |
| Migration over populated v1 db | proof script: v1 metric link survives 0007 byte-identical; exactly-one-subject CHECK rejects both-null AND both-set; kpi-subject links insert |
| Production-container journey (per decision-66c0ad59) | create KPI (health null) → reading 99.95 → healthy → reading 91 → warning (band edge 89.91 ✓) → token push source=api heals it → public summary carries the strip with the full trend |
| Formula correctness live | warning band math confirmed against the pinned formula in a running container, not just unit tests |
| Public no-leak | reading notes absent from the share payload (asserted on raw body) |
| Tracker | issue_list(v2 phase 1, open) = empty; #15 closed with evidence; LEDGER.md complete |

## Retro cards in action

- gotcha-9ac4798f fired EXACTLY as written: migration 0007's generated
  backfill selected kpi_id from the old table — caught by inspection
  before any test ran, corrected to NULL.
- decision-66c0ad59 drove the container journey above.

## TDD evidence

No `tdd:` frontmatter — none required.

## Deviations

- Physical table name stays `kr_links` (logical rename to metricLinks in
  code only) — avoids drizzle-kit's interactive rename prompt and a
  risky rebuild; recorded in schema comment.
- KPI links accept mode `count` only (CONTEXT allowed considering
  percent-closed; kept minimal).
- Team-page strip omits sparkline trend (rows below carry the data);
  share page has the full trend strip.
- CI green-on-GitHub pending push (ship gate, as always).

## Verdict

PASS — the phase delivers what it promised, confirmed by tests, e2e,
migration proof over v1 data, and a live production-container journey.
Next: `/cairn:ship`, then `/cairn:plan 2` (wizard lite).
