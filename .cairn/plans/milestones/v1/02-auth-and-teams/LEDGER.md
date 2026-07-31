# Phase 2: auth and teams — Ledger

<!-- append-only; one line per verified task; server appends, never rewrites -->

- [x] 2 — Auth core: SQLite sessions, Argon2id, default-deny hook, CSRF origin check, auth routes, OpenAPI cookieAuth — 17 tests green — commits 27e8f4e..9108f88 — 2 closed 2026-07-30
- [x] 3 — Teams: tables, 6 routes, requireTeamRole guard, 404-no-leak, last-admin protection — 20 tests, merged from parallel worktree — commits 12703b7..94f0919 — 3 closed 2026-07-31
- [x] 13 — OIDC SSO: openid-client v6, PKCE, verified-email linking, mock-provider tests — 9 tests, merged from parallel worktree, migration 0003 — commits 12703b7..94f0919 — 13 closed 2026-07-31
