# Phase 2: Auth and Teams — Research

One research subagent, standard depth. Versions verified against npm
2026-07-30.

## Findings

**Sessions — `@fastify/session` v11 + `@fastify/cookie` v11 + custom Drizzle
store.** Server-side sessions give instant logout/revocation ("log out
everywhere" is a DELETE) — stateless secure-session/JWT can't without a
denylist that reinvents the store. Connect-compatible store contract is
`set/get/destroy`; the off-the-shelf better-sqlite3 store is stale (0.1.0),
so a ~40-line Drizzle-backed store on the existing connection — testable,
no new native deps, sessions live in the same single SQLite file. Cookie
sessions are right for the future same-origin SPA (no tokens in JS).

**Passwords — `argon2` 0.45.x (Argon2id).** OWASP first choice. N-API
glibc prebuilds work on trixie-slim exactly like better-sqlite3's.
Parameters (OWASP recommended tier): memoryCost 47104 (46 MiB), timeCost 1,
parallelism 1. bcrypt has the 72-byte truncation footgun; scrypt means
hand-rolled PHC encoding.

**OIDC — `openid-client` v6 (6.8.x).** Fetch-based functional rewrite on
oauth4webapi: `discovery()`, `buildAuthorizationUrl()`,
`authorizationCodeGrant()`, PKCE helpers. Generic provider from one issuer
URL env var. Flow: login route stashes PKCE verifier + state in session →
302 to provider (`scope=openid email profile`) → callback validates
state/PKCE/ID token → match `email` claim (require `email_verified: true`)
→ link `oidc_identities` row (issuer+sub unique) or create user →
regenerate session. @fastify/oauth2 is OAuth2-only (no ID-token
validation); raw oauth4webapi is lower-level for no benefit.

**Teams model — three tables + nullable team_id.** `users`, `teams`,
`team_members (team_id, user_id, role 'admin'|'member', composite PK)`.
OKRs get `owner_user_id` + nullable `team_id`; NULL = personal. Simplest
queries, no phantom personal-team rows. Auto-personal-team pattern only
pays off when personal OKRs need sharing — YAGNI.

**Authorization — default-deny global hook.** One `onRequest` hook loads
the session user, 401s unless route sets `config: { public: true }` —
forgetting config fails closed. Named preHandler guards
(`requireTeamRole('admin')`) for resource checks. No RBAC library at this
scale.

**CSRF — SameSite=Lax + HttpOnly + Origin/Sec-Fetch-Site check** on unsafe
methods in the auth hook. Skip @fastify/csrf-protection — token round-trips
complicate API clients; add only if cross-subdomain deploys appear. OWASP
endorses SameSite + Origin verification as layered defense.

**Type-provider notes.** fastify-type-provider-zod 7 doesn't validate
cookies (body/query/params/headers only) — session cookie stays in plugin
layer. /docs auth: `components.securitySchemes.cookieAuth` (apiKey, in:
cookie) in swagger config + `security: [{ cookieAuth: [] }]` on protected
route schemas. Register order: cookie → session → swagger → routes.

## Sources

- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [openid-client v6](https://github.com/panva/openid-client) + [docs](https://github.com/panva/openid-client/blob/main/docs/README.md)
- npm registry version checks (2026-07-30)
