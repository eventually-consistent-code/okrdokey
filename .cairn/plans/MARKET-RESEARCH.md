# OKRdokey — Market Research (2026-07-30)

Competitive sweep: top 5 commercial + top 5 open source OKR products.
Killer feature + top complaints per product, plus cross-market demand themes.
Four parallel research agents; sources inline.

## Commercial

### Quantive Results (ex-Gtmhub) — DEAD (acquired by WorkBoard, May 2025)
- **Killer idea:** Automated Key Results ("Insights") — KRs bind to live
  metrics from 170+ connectors (Jira, Salesforce, SQL); progress updates
  itself, no manual check-ins.
- **Complaints:** steep learning curve / clunky UI; integration setup pain
  despite being the headline feature; perf issues on large goal trees;
  features gated behind custom-quoted tiers; post-acquisition orphaning.
- **Price:** was ~$9/user/mo, enterprise custom.

### Perdoo
- **Killer idea:** KPIs tracked alongside OKRs (stability goals next to
  change goals) + visual Strategy Map linking strategy pillars → team OKRs.
  Generous free tier.
- **Complaints:** buried navigation; dated UI; 10-seat paid minimum; per-user
  price compounds past ~30 people; wants better mobile/integrations.
- **Price:** ~€8/user/mo, 10-seat min, free plan exists.

### Profit.co
- **Killer idea:** Guided step-by-step OKR creation wizard + ~400 KR/KPI
  templates and multiple measurement types (milestone, baseline, %) — the
  pick for OKR-novice orgs. White-glove onboarding.
- **Complaints:** cluttered/overwhelming UI; rollout complexity; learning
  curve despite wizard; suite bloat; pricing went opaque (contact sales).
- **Price:** was free ≤5 users / ~$9/user/mo Growth; now largely custom.

### Lattice (OKR module)
- **Killer idea:** OKRs embedded in HR/performance suite — goals surface in
  1:1s, reviews, comp cycles. Cascading company→team→individual visibility.
- **Complaints:** goal management clunky; feature sprawl / steep learning
  curve; modules feel disconnected; limited per-employee OKR customization;
  expensive ($4k annual minimum, annual-only).
- **Price:** OKR module $8/seat/mo; suite $11–20+/user/mo.

### Tability
- **Killer idea:** Check-in-first design — the weekly check-in cadence
  (automated reminders, red/yellow/green confidence scoring, AI drafting/
  summarizing) is the core object, not the goal tree. <5-min setup.
- **Complaints:** pricing model resentment; AI credit limits with no top-up;
  no free plan, trial needs credit card; SSO/SCIM + reporting paywalled;
  annual-only billing.
- **Price:** $6–10/user/mo, annual.

**Viva Goals:** retired 2025-12-31; Microsoft built no replacement. Users
migrated to Teamflect/WorkBoard/Tability/Perdoo; "all data became
inaccessible" is now the canonical SaaS-orphaning cautionary tale.

**Commercial segment insight:** universal complaint = bloat + learning curve
+ enterprise pricing creep (seat minimums, SSO paywalls, AI credit meters,
sales-call quotes). Simple self-hosted inverts this: flat/free, opinionated
minimal core, plus cheap versions of two killer mechanisms — guided KR
creation and API-driven auto-updating KRs.

## Open source

Ranked by stars + activity + adoption (verified via GitHub, 2026-07-30):

| # | Product | Stars | Health |
|---|---------|-------|--------|
| 1 | Plane | 55.3k | very active; goals/OKRs PAYWALLED in Pro; SSO pulled from free CE (#8047) |
| 2 | Leantime | 11.2k | active; bus factor 1 (PHP, founder = 92% of commits) |
| 3 | Operately | 504 | daily commits; Apache-2.0 open-core; closest OSS Tability/Perdoo replica |
| 4 | Focalboard | 26.3k | demoted to community-maintained; maintenance mode |
| 5 | oslokommune/okr-tracker | 90 | active, MIT, but Firebase/GCP-locked — not really self-hostable |

Dead/excluded: BurningOKR (stale 2024), hillfog (dead 2022, no license),
Koan (repo gone), Tability/datalligence (never open-sourced).

- **Plane killer:** Linear-grade UI polish + one-command Docker deploy; teams
  bend it into OKR use. Complaints: goals absent from CE; OIDC/SSO removed
  from free tier (+17👍) — open-core resentment is its top theme.
- **Leantime killer:** measurable goals (current/target metrics) linked to
  milestones, neurodivergent-friendly UX. Complaints: one milestone per goal
  (#2939); no multi-KR goals (#1853); auto-rollup broken (#3678); SQLite
  support wanted (#1690); module bloat (#398).
- **Operately killer:** purpose-built company OS — goals with champions/
  reviewers, scheduled async check-ins, retrospectives. Complaints: SSO
  (#3511), recurring tasks (#3972), KPI tracking beyond OKRs (#3393), search.
- **okr-tracker killer:** radical transparency — Oslo runs a PUBLIC read-only
  citizen-facing OKR dashboard; KPI values auto-push via API gateway.
  Complaints: login-free read access, quarter-to-quarter OKR moves, UX help
  text; Firebase lock-in blocks adoption.

**OSS segment insight:** barbell — huge PM suites with OKRs paywalled or
absent vs. tiny dedicated trackers that are stale or one-maintainer. Nobody
ships a lightweight, permissive-license, TypeScript, docker-one-liner OKR
tracker with check-in cadence + working auto-rollup. Most-demanded,
least-served: working rollup, multi-KR goals, free SSO/OIDC.

## Cross-market demand themes

1. **Simpler than a spreadsheet or it dies** — platforms "required more
   effort than the spreadsheet they replaced"; ghost town by week 3.
2. **Check-in friction is the #1 adoption killer** — automated rhythm or
   "OKRs die quietly."
3. **Small teams locked out** by per-editor pricing + mandatory enterprise
   workflow.
4. **True OSS OKR tool barely exists** — HN: "surprised not even one OKR
   tool is open source."
5. **SaaS shutdown burn** (Viva Goals, Ally, Koan, 7Geese, Gtmhub) → data
   ownership demand; concrete self-host argument.
6. **Chat integration that actually works** (Slack/Teams nudges + updates).
7. **AI asks = drafting help** (write good KRs), not more dashboards.

## Opportunity statement

Own "spreadsheet-simple, docker-compose-up, your data": 5-minute deploy,
sub-30-second weekly check-in with chat nudge, working score rollup, free
SSO — nothing enterprise. The bar to beat isn't Perdoo; it's the Google
Sheet nobody updates.
