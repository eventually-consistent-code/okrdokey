---
issues: [2, 3, 13]
wave_1: [2]
wave_2: [3, 13]
---
# Phase 2: Auth and Teams — Plan

## Tasks

### T1 — Auth schema + session store (issue #2)
Drizzle tables: `users` (id, email unique, display name, password_hash
nullable — OIDC-only users have none, timestamps), `sessions` (sid PK, data
JSON, expires_at). Generated migration. Drizzle-backed connect-style session
store (`set/get/destroy` + expiry sweep). Done when: migration applies clean
and store passes unit tests.

### T2 — Session plugin + default-deny auth hook (issue #2)
Register cookie → session (HttpOnly, SameSite=Lax, Secure in prod, store
from T1). Global `onRequest` hook: load session user; 401 unless
`config: { public: true }`; Origin/Sec-Fetch-Site check on unsafe methods.
`request.user` typed decoration. Done when: unauthenticated request to a
protected route 401s, public routes (health, docs) still open.

### T3 — Password auth routes (issue #2)
`POST /auth/signup` (email + password + name, argon2id hash, session
regenerate), `POST /auth/login` (verify, regenerate), `POST /auth/logout`
(destroy), `GET /auth/me`. Zod schemas in packages/shared. Uniform 401 on
bad credentials (no user-enumeration in error text). Done when: full
signup→login→me→logout cycle passes integration tests.

### T4 — Teams CRUD + membership (issue #3)
Tables `teams`, `team_members(team_id, user_id, role, PK(team_id,user_id))`.
Routes: create team (creator = admin), list my teams, get team (members
only), add/remove member (admin only), change role (admin only), leave.
`requireTeamRole` preHandler guard. Done when: role matrix covered by
integration tests (member can't add; admin can; non-member 404/403).

### T5 — OIDC login (issue #13)
`openid-client` v6: `GET /auth/oidc/login` (discovery cached at boot, PKCE
verifier + state in session, 302) and `GET /auth/oidc/callback`
(`authorizationCodeGrant` validates, require `email_verified`, link or
create user, `oidc_identities` unique (issuer, sub), session regenerate).
Absent OIDC env vars → routes 404, password auth unaffected. Done when:
flow passes tests against a mock OIDC provider (local fastify instance
serving discovery/token/jwks).

### T6 — OpenAPI security + docs (issue #2)
cookieAuth security scheme in swagger config; `security` on protected route
schemas; auth + team routes visible in /docs with request/response shapes.
Done when: /docs/json shows securitySchemes and per-route security.

## Order

T1 → T2 → T3 → T4 / T5 (parallel after T3) → T6.

T1/T2/T3/T6 advance issue #2; T4 advances #3; T5 advances #13.
