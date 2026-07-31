---
status: resolved
issue: 25
created: 2026-07-31
resolved: 2026-07-31
---
# Trace: v3 P1 verify: T2 done-when promises component tests for "compare view with 2 cycles" and "share sparkline presence" — neither was written (TimeLine + tone tests exist; dashboard sparkline is asserted in e2e only). Coverage gap vs plan text, not a behavior bug.

## evidence — 2026-07-31
PLAN.md T2 done-when: "component tests cover TimeLine rendering + empty state, tone→stroke mapping, dashboard row sparkline, compare view with 2 cycles, share sparkline presence". Delivered: TimeLine rendering/empty/tone (charts.test.tsx). Missing: compare view test, share sparkline presence test; dashboard row sparkline proven at e2e level (smoke asserts the trend img on the dashboard) but not component level. 236 vitest green — the gap is claimed-versus-written coverage, the phantom-coverage class decision-dad3ba9e warns about.

## hypothesis — 2026-07-31
Fix: (a) component test for the cycles compare strip — render CyclesPage under a QueryClientProvider with a URL-routed fetch stub serving 2 cycles + their summaries, assert both rows, bar widths, and status counts; (b) extend the share e2e to give the shared KR two check-ins and assert the trend img renders on the public page (share page is router-coupled, so e2e is the honest level for it — recorded as an accepted deviation); dashboard stays e2e-proven for the same reason.

## verdict — 2026-07-31
Confirmed coverage gap, closed in 507b62e: compare strip now component-tested (2-cycle rows, avg math, sub-2-cycle absence) and the public share trend asserted end-to-end with real check-in data. Dashboard/share sparklines proven at e2e level — accepted deviation, both pages router-coupled. 238 vitest + 3 e2e green.

## resolution — 2026-07-31
Coverage gap closed in 507b62e — compare-strip component tests + public-trend e2e assertion; e2e-level proof for the router-coupled pages recorded as accepted deviation. All gates green (238 vitest, 3 e2e).
