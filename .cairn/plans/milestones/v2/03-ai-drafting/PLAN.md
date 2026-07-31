---
issues: [16]
---
# Phase 3 (v2): AI Drafting — Plan

Post plan-checker revision — all 12 findings applied (see CONTEXT.md).

## Tasks

### T1 — Config, keys, plumbing
Add `@anthropic-ai/sdk` to packages/api. AI block in config.ts
(aiEnabled, aiModel, anthropicApiKey, anthropicBaseUrl). Tables:
`team_ai_keys`, `ai_rate_counters` (PK scope+scope_id+window_start,
fixed hourly windows) — one migration, generated SQL inspected
(gotcha-9ac4798f). Global pino redact paths for AI routes in buildApp.
Key routes (team ADMIN only): PUT (validate via GET /v1/models against
configured base URL, encrypt, save), GET (masked last-4, last-used,
source), DELETE. Client factory: resolved key + baseUrl + model +
max_tokens 1024 + 60s timeout. Done when: key lifecycle, admin-only
403/404 matrix, resolution precedence (team > instance; personal =
instance only), and validation rejection all tested against a mock
Anthropic server.

### T2 — Endpoints
Shared Zod: aiKrSuggestionSchema, draftKrsRequest/Response (wrapper
object, 2–3 suggestions), improveKrRequest/Response (objectiveId
required), aiStatusResponse. Routes (all with OpenAPI schemas):
- `GET /ai/status?objectiveId=` → { enabled, keySource }
- `POST /ai/draft-krs` — beta.messages.parse + zodOutputFormat wrapper;
  existing KRs as no-dupe context; per-suggestion re-validation; <2
  valid → one retry → 502 (standard error shape)
- `POST /ai/improve-kr` — critique bullets + one rewrite
Rate limiting per CONTEXT (skip team counter for personal objectives);
429/409 in errorResponseSchema shape; typed-error mapping; membership
via owning objective (404-no-leak). Done when: mock-server tests cover
happy path, schema-invalid model output + retry + 502, 401/429/529
mappings, rate exhaustion, personal-objective instance-key path,
no-key 409 with settings hint, /ai/status all three states.

### T3 — UI
Wizard step 1 "Draft with AI" path (context textarea → 2–3 cards →
click prefills steps 2–3); "Get AI feedback" on measure step (bullets
+ apply-rewrite); Team Settings AI key panel (admin: entry/masked/
badge/revoke); teaser state from /ai/status; microcopy per CONTEXT.
Done when: flows clickable in dev against the mock; teaser renders
without a key; non-admin sees no key mutation UI.

### T4 — Tests, e2e, container, docs
Component tests: cards prefill, teaser, feedback apply. e2e: mock
Anthropic via anthropicBaseUrl env — settings key entry → wizard AI
path → pick card → KR created with suggested values. Container smoke:
mock as compose-network service; proves AI_FEATURES + key plumbing in
the production image. Env docs: ANTHROPIC_API_KEY / AI_MODEL /
AI_FEATURES in README + docker-compose comments. Done when: full suite
+ e2e green; zero live Anthropic calls in CI.

## Order

T1 → T2 → T3 → T4. Single issue (#16) — no waves; key plumbing is a
strict dependency of everything downstream.
