# Phase 5: Integrations — Research

One research subagent, standard depth. Version/endpoint claims verified
2026-07-31.

## Findings

**API tokens.** `okr_` + 32 random bytes base64url (GitHub-style greppable
prefix; skip their CRC32). Store only sha256 hex — no stretching needed
for 256-bit random input. `api_tokens` table team-scoped with
name/created_by/last_used_at (throttle writes >60s)/revoked_at. Bearer
branch in the existing default-deny hook, honored ONLY on routes opted in
via `config: { allowApiToken: true }` — a leaked token can push KR values,
never drive the whole API. GitHub secret-scanning partner registry needs a
provider verification endpoint — not viable for self-hosted; ship a
gitleaks custom-rule snippet in docs instead.

**Machine check-in attribution.** `author_user_id` nullable + `source`
enum `ui|api|github|jira` + nullable `api_token_id`. No synthetic system
user (pollutes membership checks and rosters).

**GitHub.** Plain fetch (2 endpoints don't justify Octokit; its ETag
support is poor). Milestone: `GET /repos/{o}/{r}/milestones/{n}` returns
`open_issues`/`closed_issues` directly. Label: `GET /search/issues?q=...`
→ `total_count`. Fine-grained PAT, "Issues: Read-only". 5k req/hr (search
30/min) — 15-min polling is nothing. ETag + If-None-Match on milestone
reads; 304s skip work and don't count against the limit.

**Jira Cloud.** ⚠ Old `/rest/api/3/search` was REMOVED mid-2025. Counts:
`POST /rest/api/3/search/approximate-count` `{jql}` → `{count}` — two
calls per sync: total = user JQL, done = `(<jql>) AND statusCategory =
Done`. Basic auth email:api_token. Plain fetch.

**Binding model.** `kr_links` one-per-KR: provider, config JSON
(`{repo, milestoneNumber}` | `{repo, label}` | `{jql}`), mode, encrypted
secret, etag, sync_interval (15m default), sync_due_at, last_synced_at,
last_error, consecutive_failures. Modes v1: `percent-closed`
(closed/(open+closed)×100 → percent KR) and `count-closed` (closed count →
numeric KR). No custom formulas.

**Credentials.** AES-256-GCM via node:crypto (~30 lines, iv‖tag‖ct),
key = HKDF(SESSION_SECRET, 'connector-credentials'). Same-host compromise
gets both anyway; encryption protects the realistic leaks — db backups,
volume snapshots, stray file copies. Zero new deps.

**Sync scheduling.** Reuse the croner minute tick + `sync_due_at`
watermark (reminders pattern — restart-safe, no second scheduler).
Failure: increment counter, record last_error, back off
interval × min(2^failures, 16) capped ~4h; surface on the link API.
Synced writes go through the SAME append-check-in transaction as manual
ones, source-marked.

## Sources

- https://github.blog/engineering/behind-githubs-new-authentication-token-formats/
- https://docs.github.com/en/rest/issues/milestones · https://docs.github.com/en/code-security/reference/secret-security/supported-secret-scanning-patterns
- https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/ · https://confluence.atlassian.com/jirakb/run-jql-search-query-using-jira-cloud-rest-api-1289424308.html
- https://github.com/octokit/octokit.js/issues/2563
