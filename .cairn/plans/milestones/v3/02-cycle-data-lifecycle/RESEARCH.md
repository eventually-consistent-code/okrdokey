# Phase 2 (v3): Cycle & Data Lifecycle — Research

Researched 2026-07-31 (one subagent). file:line evidence verified.

## Cycle state

Cycles have create/list/get only — nothing ever writes status:'closed'
(insert hardcodes 'open', cycles.ts:86). One status consumer: dashboard
picker defaults to first open cycle (dashboard.tsx:19). Cycles page
card grid (cycles.tsx:87-97) is the natural home for close/rollover
actions.

## Rollover clone semantics

Copy per objective: title, description, ownerUserId, teamId; new
cycleId/id. Per KR: title, type, unit, target. Fresh starts match
creation pinning (routes.ts:278-280): percent → 0/100/current 0;
boolean → 0/1/0; numeric → NEW baseline = old currentValue, target
unchanged (score restarts at 0 over the remaining span). Trap: a
numeric KR at currentValue === target would violate baseline≠target —
but it scored 1.0 and the skip rule excludes it anyway.

Check-ins stay with the old KR automatically (fresh UUIDs). kr_links:
keyResultId is UNIQUE and rows carry encrypted secrets + sync state —
carrying is wrong; drop and report which KRs had links so the UI can
prompt re-linking. Skip rule: archivedAt !== null OR computed score >=
1 skips the objective; within carried objectives, KRs at score 1 stay
behind. Optionally archive the source objective (flag, default on).

## Import/export

Nothing CSV-shaped in the tree. Registry: csv-parse 7.0.1, papaparse
5.5.4 — but hand-rolling is defensible: RFC 4180 emission ~15 lines;
strict import parser (quoted fields, documented "no embedded newlines")
~40 lines; dry-run catches malformed rows loudly. One import file, one
row per KR: objective_title, objective_description, team_name,
cycle_name, kr_title, kr_type, kr_unit, kr_baseline, kr_target —
consecutive same-objective rows group; names not ids (resolved
server-side). Dry-run returns 200 with {creates, preview, errors};
write is all-or-nothing in one transaction.

Export inventory: every needed response schema already exists — JSON
export is composition, CSV is flattening.

## Auth

Everything session-authed by default-deny. Export: per-user visibility
(mine + my teams), archived INCLUDED (it is a backup). Import: same as
create — member-level for team objectives, self for personal. Cycle
close/rollover: ungated like cycle create, but rollover clones only
caller-visible objectives.
