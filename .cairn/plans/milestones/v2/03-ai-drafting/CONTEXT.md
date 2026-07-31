# Phase 3 (v2): AI Drafting — Context

## Locked decisions (post plan-checker pass)

- **Scope**: two interactions only — (a) draft KR suggestions from an
  existing objective (+optional freeform context), (b) critique/improve
  a user-typed KR in the context of an objective (objectiveId required
  on both requests). NO objective generation. Suggestions prefill the
  wizard/form, never auto-create.
- **Provider**: Anthropic only, official `@anthropic-ai/sdk` (new api
  dependency), model `claude-opus-4-8` (env `AI_MODEL` override).
- **Config**: single AI block in AppConfig/config.ts — `aiEnabled`
  (AI_FEATURES !== 'off'), `aiModel`, `anthropicApiKey` (instance),
  `anthropicBaseUrl` (override for tests/container mock; consumed by
  BOTH the client factory and key validation). No scattered env reads.
- **Key resolution**: TEAM objectives — team encrypted key (existing
  AES-GCM/HKDF helper, `team_ai_keys` table) falls back to instance
  key. PERSONAL objectives — instance key only, user counter only.
  Validate on save via `GET /v1/models` against the configured base
  URL. Key routes are team-ADMIN-only; masked last-4 + last-used +
  source badge; revoke = delete.
- **Capability endpoint**: `GET /ai/status?objectiveId=` → { enabled,
  keySource: 'team' | 'instance' | null } — what the wizard teaser
  renders from.
- **Proxy**: server-side only; never `dangerouslyAllowBrowser`.
- **Structured output**: `client.beta.messages.parse()` +
  `zodOutputFormat` (beta namespace — verify exact binding at T2 start
  per the claude-api skill). Root schema is a WRAPPER OBJECT
  `{ suggestions: [...] }` (array roots unsupported). Server
  re-validates each suggestion against createKeyResultRequestSchema.
- **Suggestion count**: 2–3. Model asked for 3; invalid ones dropped;
  if <2 survive → ONE retry, then 502 in the standard error shape with
  a plain-language message.
- **Guardrails (pinned)**: max_tokens 1024 server-fixed; 60s timeout;
  rate limits 10/user/hr + 30/team/hr (team scope skipped for personal
  objectives) via `ai_rate_counters` table — PK (scope, scope_id,
  window_start), FIXED hourly windows, stale rows pruned on write.
  429/409 responses use errorResponseSchema shape. Typed-error →
  plain-language mapping (401 key rejected / 429 honor retry-after /
  529 overloaded).
- **Log redaction**: pino redact paths are instance-global — configured
  in buildApp's logger options (T1 touches app.ts), covering the AI
  route request bodies + key fields. AI handlers log team/user id,
  usage tokens, latency only.
- **Prompt discipline**: one server module; coaching rules encoded (no
  activity phrasing, metric+baseline+target, decreasing-is-good legal,
  baselines flagged as placeholder guesses); existing KRs as no-dupe
  context.
- **UI**: "Draft with AI" third path in wizard step 1 (cards prefill
  steps 2–3); "Get AI feedback" on the measure step; disabled-teaser +
  settings link driven by /ai/status; "Suggestions" label + "AI can be
  wrong — check the numbers" microcopy. Team Settings AI key panel.
- **OpenAPI**: all new routes carry Zod request/response schemas —
  visible in /docs like everything else.
- **No schema coupling to OKR core**: new tables only.
- **Verification posture**: mock Anthropic server in ALL tests (typed
  error paths included); container smoke runs the mock as a
  compose-network service (host.docker.internal absent on Linux CI);
  env docs (ANTHROPIC_API_KEY, AI_MODEL, AI_FEATURES) land in README +
  docker-compose comments. NO live Anthropic calls in CI.

Rationale and sources: RESEARCH.md. Plan-checker findings applied:
personal-objective key/counter model, 2–3 suggestion contract, global
redaction, config block, /ai/status, counter table spec, beta
namespace + wrapper, dependency add, admin-only keys, error shapes,
compose-network mock, env docs.
