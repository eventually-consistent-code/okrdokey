---
issues: [7, 12]
wave_1: [7]
wave_2: [12]
---
# Phase 4: Web UI — Plan

## Tasks

### T1 — Backend serving restructure + web scaffold (issue #7)
Move API routes into an encapsulated Fastify context carrying the
default-deny hook; register `@fastify/static` + SPA fallback (GET+html →
index.html) outside it; `ALLOWED_ORIGINS` env extends the CSRF Origin
check. Scaffold `packages/web`: Vite 8 + React 19 + Tailwind v4 +
TanStack Router/Query, dev proxy to :3000, typed `apiFetch` parsing
shared Zod schemas with global 401 redirect. Done when: existing 123
tests green UNTOUCHED, vite dev serves a logged-out shell, `vite build`
output served by Fastify with /docs + API routes still working.

### T2 — Auth + app shell (issue #7)
Login/signup pages (shared-schema forms), OIDC button shown only when
`GET /auth/oidc/login` exists, session-guarded layout (nav: dashboard,
teams, cycles, settings), logout, toasts. Done when: full auth cycle
works in the browser and guarded routes bounce to /login.

### T3 — OKR flows (issue #7)
Dashboard (cycle picker, status donut, objective cards with score/status),
objective detail (KR list with per-KR score, check-in history sparkline,
check-in dialog: value + RAG + note — sub-30s flow), objective/KR
create/edit/archive forms. Done when: every REQ-01/02/03 flow is
clickable end-to-end against the dev API.

### T4 — Teams, cycles, reminders UI (issue #7)
Teams list/detail (members, roles, add/remove), cycle admin
(create/quarter shortcut), reminder config form (cron presets: weekly/
biweekly dropdown, timezone select, webhook URL). Done when: role-gated
actions render per membership and reminder upsert round-trips.

### T5 — Share-link backend + public dashboard (issue #12)
`share_tokens` table + migration; admin routes enable/rotate/disable;
`GET /public/:token/summary` outside auth scope (no-store, no notes, no
emails); SPA `/share/:token` read-only dashboard reusing summary
components; share-link settings card in team detail. Done when: public
page renders without a session, token rotation kills old links, API
tests cover the no-leak field set.

### T6 — Component tests + Playwright smoke + Docker (issue #7)
Component tests: check-in dialog, apiFetch 401 path, status donut math.
Playwright e2e against built server: signup → team → cycle → objective →
KR → check-in → dashboard → share link public view. Dockerfile gains web
build stage; CI gains e2e job. Done when: e2e green locally + in CI,
`docker compose up` serves the full UI.

## Order

T1 → T2 → T3 → T4 → T6 (issue #7 chain); T5 (issue #12) parallel after T2.

Wave 2 note: #12's backend piece adds a migration — #7's later tasks must
not touch schema.ts (they have no reason to).
