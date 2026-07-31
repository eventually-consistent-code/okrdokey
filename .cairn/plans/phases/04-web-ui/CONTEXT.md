# Phase 4: Web UI — Context

## Locked decisions

- **Stack**: Vite 8 + React 19 SPA in new workspace `packages/web`;
  production build served by `@fastify/static` from the SAME Fastify
  process — no second server, ever.
- **Routing**: TanStack Router (typed, `beforeLoad` auth guards).
- **Data**: TanStack Query + one typed `apiFetch` that PARSES responses
  with @okrdokey/shared Zod schemas; 401 → redirect to login; mutations
  invalidate queries.
- **Styling**: Tailwind v4 (CSS-first theme tokens) + Radix primitives
  (dialog/dropdown/toast), hand-styled — distinctive look, no component
  lib house style. Charts hand-rolled SVG (sparkline + status donut).
- **Forms**: react-hook-form + zodResolver on the shared request schemas.
- **Auth-scope restructure (backend)**: API routes move into an
  encapsulated plugin context carrying the default-deny hook; static
  assets + SPA fallback register OUTSIDE it. Behavior of every API route
  unchanged — existing 123 tests must stay green untouched.
- **CSRF dev accommodation**: `ALLOWED_ORIGINS` env (comma list) extends
  the Origin check — dev sets http://localhost:5173; prod default stays
  host-match only.
- **SPA fallback**: `setNotFoundHandler` returns index.html for
  GET+text/html only; JSON 404s unchanged for API consumers.
- **Share link (REQ-12)**: per-team public dashboard. `share_tokens`
  table (team_id unique, token base64url 128-bit, created_at); admin
  enable/rotate/disable; `GET /public/:token/summary` outside auth scope,
  `Cache-Control: no-store`; SPA route `/share/:token`. Read-only:
  objectives, KRs, scores, statuses — NO check-in notes, NO member emails.
- **UI screens (v1)**: login/signup (+OIDC button when configured),
  dashboard (cycle summary: statuses, donut, objective list), objective
  detail (KRs, sparkline of check-in history, check-in dialog — the
  sub-30s flow), teams (list/detail/members/reminder config), cycles
  admin, share-link settings.
- **Testing**: component tests (Testing Library + happy-dom) for the
  check-in dialog, apiFetch 401 path, and scoring display; ONE Playwright
  smoke e2e against the built server covering login → objective →
  check-in → dashboard → public share page. Playwright runs locally and
  in CI as a separate job.
- **Docker**: image gains the built SPA (vite build in a build stage);
  runtime unchanged.

Rationale and gotchas: RESEARCH.md.
