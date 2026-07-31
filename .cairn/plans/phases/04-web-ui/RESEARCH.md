# Phase 4: Web UI — Research

One research subagent, standard depth. Versions npm-verified 2026-07-31.

## Findings

**Framework — Vite + React SPA, served by Fastify.** Next standalone =
second Node server + ~150MB image growth; TanStack Start brings a Nitro
server. Both violate the one-container-one-process constraint. Vite static
build + `@fastify/static` adds zero runtime processes. New workspace
`packages/web`. react 19.2.8, vite 8.2.0, @vitejs/plugin-react 6.0.5.

**Routing — TanStack Router 1.170.x.** Typed paths/params without a
typegen step; `beforeLoad` + `redirect()` is a first-class auth guard.
React Router v8 fine but drags Remix conventions.

**Data — TanStack Query 5.101.x + typed apiFetch.** One
`apiFetch(path, schema, init)` with `credentials: 'same-origin'`; 401 →
global QueryCache onError → login redirect; mutations invalidate. PARSE
responses with the shared Zod schemas (cheap at this size, catches API/UI
drift at the boundary); z.infer supplies types.

**Styling — Tailwind v4 (CSS-first `@theme`) + Radix primitives**
(unified `radix-ui` package) for dialog/dropdown/toast only. Unstyled +
tree-shakeable keeps the look ours; Mantine/full-shadcn drag a house
style. Borrow shadcn source as reference (copy-paste, not a dep).

**Forms — react-hook-form 7.83 + @hookform/resolvers 5.5** (zodResolver
speaks Zod 4 via standard-schema). Shared request schemas plug in as-is.

**Charts — hand-rolled SVG.** Sparkline = `<polyline>`, status donut =
`stroke-dasharray` circle. ~60 lines, 0KB deps. recharts is 100KB+ gz for
two static charts.

**Dev/prod wiring — the two gotchas:**
1. Vite dev proxy keeps cookies working (host-scoped, port ignored) BUT
   forwards `Origin: http://localhost:5173` unchanged — our CSRF Origin
   check needs a dev-allowed origin env var.
2. The default-deny `onRequest` auth hook is GLOBAL — it would 401 static
   assets and the SPA fallback. Restructure: register static + fallback
   outside the auth encapsulation context (or allowlist non-API paths).
   `setNotFoundHandler` serving index.html only fires when no route
   matches, so registered API routes always win — no precedence issue.

**Share link.** SPA route `/share/:token` (public via fallback) calling
`GET /public/:token/summary` registered outside the auth scope. Token:
128-bit `crypto.randomBytes(16)` base64url, indexed, revocable by
rotation. `Cache-Control: no-store`; rate limit optional v1.

**Testing.** Vitest + Testing Library + happy-dom for components; ONE
Playwright smoke e2e against the real built server (login → objective →
check-in → dashboard → share link) — it exercises the SPA-fallback +
auth-scope wiring nothing else touches.

## Sources

- https://vitejs.dev/config/server-options#server-proxy · https://tanstack.com/router · https://tanstack.com/query
- https://tailwindcss.com/blog/tailwindcss-v4 · https://www.radix-ui.com · https://react-hook-form.com
- npm version checks (2026-07-31)
