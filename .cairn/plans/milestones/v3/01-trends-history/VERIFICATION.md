# Phase 1 (v3): Trends & History — Verification

Verified 2026-07-31. Standard depth: goal-backward against CONTEXT.md
locked decisions + full gates. Commits under verification: b7bded9
(theme, shipped early per user request), 829b9c7 (history backend),
826319b (charts), 576bd60 (docs), 507b62e (verify fixes).

## What was checked

- **Zero migrations** held: no schema.ts change, no new drizzle files —
  the whole phase surfaces existing data.
- **History endpoint**: event-based series through scoring.ts only
  (no formula duplication anywhere in the web bundle); current
  baseline/target approximation documented in the OpenAPI description,
  no unreliable flag. 7 correctness tests: stepping, decreasing-is-good,
  multi-KR merge with unchecked-KR baseline behavior, percent
  contribution, empty, summary cap at 12, 404 no-leak.
- **Inline trends**: cycle-summary objectives and public-share KRs carry
  last-12 arrays (values only on share — narrow-payload rule tested);
  dashboard and share pages make zero extra requests.
- **Charts**: TimeLine time-spaces its x-axis (unit test proves 7-of-30
  days ≈ 23%, not an index midpoint), tone contract identical to
  Sparkline, hand-rolled SVG, zero chart deps in package.json.
- **RAG tones** (user feedback item): KR sparklines ← confidence,
  objective TimeLine ← status, KPI sparklines ← health, dashboard rows ←
  status. Tone→stroke mapping unit-tested; visual pass confirmed a
  wobbly check-in draws yellow.
- **Machined-metal theme (#24)**: shipped early, screenshot-passed over
  auth/dashboard/objective/teams; margin-collapse band caught and fixed
  then.
- **Compare strip**: component-tested — row per cycle, avg-score math
  (mean 0.8/0.4 → 0.60), no strip under two cycles.
- **e2e**: smoke asserts the progress chart appears after a second
  check-in and the dashboard row trend renders; share spec asserts the
  public sparkline with real check-in data.
- **Container journey**: full AI + core smoke re-run on the image built
  at T4 (decision-66c0ad59).

## Found and fixed during work + verify

- Check-in mutation never invalidated the cached history — chart only
  appeared after reload (caught by the extended e2e; fixed in 826319b).
- T2's claimed component coverage for the compare strip and share
  sparkline didn't exist — the phantom-coverage class decision-dad3ba9e
  warns about (trace-057c7ff0 / #25, fixed in 507b62e).

## Accepted deviations

- Dashboard-row and share-page sparklines are proven at e2e level, not
  component level — both pages are router-coupled; the e2e assertions
  exercise them against the real app.
- Per-KR series toggle on the objective TimeLine was "only if trivial"
  in CONTEXT — not built; the objective line was the requirement.

## Gates

238 vitest (28 files), 3 Playwright e2e, container smoke, lint 0,
typecheck 0, vitest exit codes checked directly (gotcha-681464b1).
Issues #20 + #24 closed with evidence; no open phase-1 issues; ledger
lines present. No `tdd:` frontmatter → TDD n/a.

## Verdict

PASS — next: /cairn:ship.
