# Phase 1 (v2): KPI Tracking — Research

One research subagent, standard depth. Verified 2026-07-31.

## Findings

**Semantics survey.** Perdoo: KPIs are cycle-less "business as usual"
metrics, team/company-owned with a lead, unit, target type (stay above /
stay below / increase to / decrease to), health flagged when unhealthy.
Operately's most-requested issue (#3393) asks for everlasting metrics +
historical chart + values surfaced in check-ins — HISTORY is the ask,
not elaborate targeting. Minimal v1: name, unit, direction
(gte | lte | range), threshold(s), current value, computed health,
TEAM-LEVEL ONLY (personal KPIs deferred, same as personal-team split).

**Storage — own tables, proven pattern.** Do NOT polymorph check_ins
(key_result_id is NOT NULL FK; RAG confidence is authored sentiment,
KPI health is computed — different animals). Copy the pattern instead:
append-only `kpi_readings` + denormalized current_value/current_health
on `kpis`, one transaction.

**Health — three states, 10% warning band.** Met → healthy; not met but
within 10% of threshold (relative to |threshold|) → warning; else breach.
Exact: gte: healthy v>=x, warning v>=x−0.1|x|; lte mirrored; range a..b:
healthy inside, warning within 0.1(b−a) outside a bound. |x|=0 degrades
to met/not-met. Computed server-side per reading, stored denormalized.

**Auto-update — migrate kr_links → metric_links.** Subject pair
(key_result_id nullable-unique, kpi_id nullable-unique, CHECK exactly
one set); columns otherwise unchanged; add mode `count` (raw count as
KPI value; percent-closed stays KR-only). One sync sweep, one provider
codebase, one watermark discipline. ⚠ SQLite rename+alter = table
rebuild — watch the drizzle backfill gotcha (memory card gotcha-9ac4798f).

**UI — KPI strip beside OKRs.** Strip on the team dashboard (health dot,
value+unit, sparkline) + team KPI management view; NO separate /my/kpis
(team-only ownership leaves it empty). Public share page includes the
strip — stability metrics are exactly what stakeholders check.

**Trend.** Existing Sparkline component, last 12 readings (≈ a quarter
of weekly readings). Threshold reference line: later, not v1.

## Sources

- https://support.perdoo.com/en/articles/5627060-setting-targets-for-your-kpis
- https://support.perdoo.com/en/articles/4640875-goal-statuses · https://support.perdoo.com/en/articles/5645323-kpi-boards
- https://github.com/operately/operately/issues/3393
