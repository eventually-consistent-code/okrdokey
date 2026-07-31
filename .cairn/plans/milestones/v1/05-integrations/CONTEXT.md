# Phase 5: Integrations — Context

## Locked decisions

- **Token format**: `okr_` + 32 bytes base64url; sha256 hex stored, never
  plaintext; shown once at mint. Team-scoped, named, revocable;
  last_used_at throttled (>60s).
- **Token authority**: bearer branch inside the existing default-deny
  guard, honored ONLY on routes with `config: { allowApiToken: true }`.
  Tokens resolve to a team scope, not a user session.
- **Push endpoint**: the existing `POST /key-results/:id/check-ins` gains
  `allowApiToken` — machine pushes create normal append-only check-ins
  with `source: 'api'`. `confidence` becomes optional for token-auth
  callers; when absent the KR's current confidence is left untouched.
- **Check-in attribution**: `author_user_id` nullable, `source` enum
  `ui|api|github|jira` (default 'ui'), nullable `api_token_id`. No
  synthetic system user.
- **Bindings**: `kr_links` one-per-KR — provider `github|jira`, config
  JSON ({repo, milestoneNumber} | {repo, label} | {jql}), mode
  `percent-closed` | `count-closed`, encrypted credential, etag,
  sync_interval_minutes default 15, sync_due_at watermark, last_error,
  consecutive_failures. Team membership of the KR's objective governs
  link CRUD (admin for create/delete).
- **GitHub**: plain fetch; milestone endpoint (open/closed counts direct)
  + search total_count for labels; fine-grained PAT "Issues: Read-only";
  ETag/If-None-Match on milestone reads.
- **Jira**: plain fetch; `POST /rest/api/3/search/approximate-count` ×2
  (total; done via `statusCategory = Done`); Basic email:api_token.
  NEVER the removed `/rest/api/3/search`.
- **Credentials at rest**: AES-256-GCM (node:crypto), key =
  HKDF(SESSION_SECRET, salt, 'connector-credentials'). No new deps.
- **Sync**: same croner minute tick as reminders sweeps
  `kr_links WHERE sync_due_at <= now`; failure backoff
  interval × min(2^failures, 16) capped 4h; last_error surfaced. Synced
  values write through the standard check-in transaction, source-marked.
- **ALL phase-5 schema lands in the first task** (issue #8) — wave 2
  (#9, #10) never touches schema.ts (phase-3 lesson, held).
- **Docs**: OpenAPI curl example for the push endpoint; gitleaks custom
  rule snippet for `okr_` tokens in README/docs.

Rationale and sources: RESEARCH.md.
