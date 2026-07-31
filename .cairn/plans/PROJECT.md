# OKRdokey

## Vision

OKRdokey is a simple, self-hostable OKR (Objectives and Key Results) tracker
for small teams. Positioning (from market research, see MARKET-RESEARCH.md):
**"spreadsheet-simple, docker-compose-up, your data."** The bar to beat is
the Google Sheet nobody updates, not the enterprise platforms.

A TypeScript/Node REST API backs a web UI where people create objectives with
measurable key results, check in progress on an automated weekly cadence, and
see roll-up scores and on-track/at-risk status per quarter cycle. Multi-user
from day one; KR values can update themselves via API push or native
GitHub/Jira connectors — the killer mechanism of the commercial tier, minus
the connector-farm bloat.

**License/monetization:** Apache-2.0 core + proprietary `ee/` for future paid
features (GitLab/Operately model). SSO/OIDC and all core OKR features stay
free — never gate what the market resents being gated (Plane's OIDC paywall).
Monetize genuinely enterprise concerns later: SCIM, audit logs, hosted cloud.

## Non-goals (locked)

- No HR-suite features (reviews, 1:1s, comp) — Lattice's lane, source of bloat.
- No connector farm — API push + GitHub + Jira, done well. More only on demand.
- No approval workflows, mandatory fields, or cascading strategy maps.
- No per-seat gating, AI credit meters, or paywalled SSO.

## Requirements

- REQ-01: OKR CRUD — create/edit/archive objectives with key results (title, description, target/current value, unit, owner, cycle)
- REQ-02: Check-in cadence engine — scheduled reminder rhythm, sub-30-second check-in flow (new value + red/yellow/green confidence + optional note), timestamped history, outgoing webhook nudges (Slack-compatible)
- REQ-03: Scoring & status roll-up — KR scores aggregate to objective score (rollup that actually works); on-track/at-risk/behind; cycle (quarter) summary
- REQ-04: Multi-user auth — accounts, sessions, per-user ownership
- REQ-05: Teams — team membership, personal and team-level OKRs
- REQ-06: Web UI — browser frontend covering all flows
- REQ-07: Documented REST API + persistent storage — OpenAPI spec, SQLite-backed
- REQ-08: KR auto-update API — scoped API tokens; scripts/CI push KR values via one endpoint
- REQ-09: GitHub connector — bind a KR to issue/milestone progress; auto-sync
- REQ-10: Jira connector — bind a KR to JQL/epic progress; auto-sync
- REQ-11: One-command deploy — `docker compose up` = running app; single volume; backup = copy one file
- REQ-12: Public read-only dashboard — optional per-team share link, no login required (Oslo okr-tracker's transparency idea)
- REQ-13: OIDC SSO — generic OIDC alongside password login, free tier, always

## Backlog (tracked, unscheduled)

- Guided OKR wizard-lite (Profit.co's killer — templates + KR-type picker)
- KPI tracking beside OKRs (Perdoo's killer; Operately's most-requested)
- AI drafting help for writing good KRs (BYO API key — no credit meters)
