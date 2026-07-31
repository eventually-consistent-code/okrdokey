# Phase 2: cycle data lifecycle — Ledger

<!-- append-only; one line per verified task; server appends, never rewrites -->

- [x] T1–T4 — Lifecycle complete: cycle close + transactional rollover (fresh baselines, skip rules, link-drop reporting, caller-visibility scoping), zero-dep CSV export/import with dry-run + all-or-nothing writes + round-trip by construction, rollover dialog + your-data card, e2e rollover journey. 256 vitest + 4 e2e + container smoke. Zero migrations. — commits 220052f..36bb0e3 — 21 closed 2026-07-31
- [x] T2 (#22) — Import/export share the T1–T4 commit range — CSV in/out closed under #22 with round-trip + dry-run + all-or-nothing evidence — commits 220052f..36bb0e3 — 22 closed 2026-07-31
