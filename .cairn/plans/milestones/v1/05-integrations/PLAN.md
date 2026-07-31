---
issues: [8, 9, 10]
wave_1: [8]
wave_2: [9, 10]
---
# Phase 5: Integrations — Plan

## Tasks

### T1 — Schema + tokens + push endpoint (issue #8)
ALL phase-5 schema in one migration: `api_tokens`, `kr_links`, check_ins
alterations (nullable author_user_id, `source` enum default 'ui',
api_token_id). AES-GCM credential helper (HKDF from SESSION_SECRET).
Token routes: mint (admin, plaintext shown once)/list/revoke per team.
Bearer branch in the guard gated by `config.allowApiToken`; check-in POST
route opts in, `source: 'api'`, confidence optional for token callers.
OpenAPI curl example; gitleaks rule in README. Done when: token
lifecycle + push tested (mint → curl-style push → history shows source
api → revoked token 401s).

### T2 — Sync engine core (issue #8)
`kr_links` CRUD routes (team-scoped; config validated per provider),
sync sweep added to the croner tick (`sync_due_at <= now`), provider
adapter interface (`fetchProgress(link) → {done, total} | {count}`),
mode mapping (percent-closed / count-closed) writing through the
standard check-in transaction with the provider source, backoff +
last_error surfacing. Provider adapters stubbed. Done when: engine tests
green with a fake adapter (mapping math, backoff, watermark).

### T3 — GitHub adapter (issue #9)
Milestone (open/closed direct) + label-search (total_count) reads with
fine-grained PAT; ETag/If-None-Match on milestone (304 → skip write);
link config UI card on the KR row (repo + milestone/label picker-lite).
Done when: tests against a mock GitHub server cover both config shapes,
ETag 304 path, auth failure → last_error + backoff.

### T4 — Jira adapter (issue #10)
approximate-count ×2 (total, done) with Basic auth; link config UI
(baseUrl, email, token, JQL). Done when: tests against a mock Jira
server cover percent + count modes, bad JQL → last_error, 401 → backoff.

## Order

T1 → T2 → wave 2: T3 (issue #9) ∥ T4 (issue #10).

T1/T2 advance #8; T3 advances #9; T4 advances #10. Wave-2 tasks must NOT
touch schema.ts.
