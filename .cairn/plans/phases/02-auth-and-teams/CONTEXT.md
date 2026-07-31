# Phase 2: Auth and Teams — Context

## Locked decisions

- **Sessions**: `@fastify/session` v11 + `@fastify/cookie` v11, custom
  Drizzle-backed store in the main SQLite db. Server-side = real revocation.
  Cookie: HttpOnly, SameSite=Lax, Secure in production.
- **Passwords**: `argon2` (Argon2id) — memoryCost 47104, timeCost 1,
  parallelism 1 (OWASP recommended tier).
- **OIDC**: `openid-client` v6, generic provider via env vars
  (`OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`); PKCE + state;
  account linking by `email` claim ONLY when `email_verified: true`;
  `oidc_identities` table unique on (issuer, sub). OIDC optional — absent env
  vars = password-only, no errors.
- **Teams**: `users` / `teams` / `team_members(team_id, user_id, role)` with
  roles `admin` | `member`. Personal OKRs = nullable `team_id` (no phantom
  personal teams).
- **Authorization**: default-deny global `onRequest` hook; public routes opt
  out via `config: { public: true }`. Resource guards as named preHandlers
  (`requireTeamRole`). Session regenerated on login (fixation defense).
- **CSRF**: SameSite=Lax + Origin/Sec-Fetch-Site check on unsafe methods in
  the hook. No token plugin.
- **OpenAPI**: cookieAuth security scheme (apiKey, in: cookie) declared in
  swagger config; protected routes carry `security` in their schema.
- **Register order**: cookie → session → auth hook → swagger → routes.

Rationale and sources: RESEARCH.md.
