# Phase 4: polish — Ledger

<!-- append-only; one line per verified task; server appends, never rewrites -->

- [x] T1–T4 — Polish complete: container deps scoped to api+shared (516→488MB, smoke green), per-route rate limits (login/signup 5/min, public share 60/min, groupId non-merge discovered and documented), hourly session sweep wired to scheduler tick, bundle warning threshold documented at 600 (153KiB gzip) — commits 44dbce7..dc124ce — 18 closed 2026-07-31
