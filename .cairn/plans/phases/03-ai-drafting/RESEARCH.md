# Phase 3 (v2): AI Drafting — Research

Deep depth: two parallel research agents (product/UX, key handling) +
the claude-api skill for API surface facts. Verified 2026-07-31.

## Product findings

**Market.** Tability's "Tabby AI" is the category leader — drafts AND a
coach mode that critiques existing OKRs. Quantive's AI is being phased
out post-acquisition; Perdoo markets itself as the no-AI-complexity
alternative. Consensus from practitioners: AI kills the blank-page
problem, but first drafts are reliably vague/task-shaped; one analysis
found 52% of 7,857 real KRs were tasks or KPIs in disguise — the exact
failure our wizard teaches against. Models can't supply strategic
context or honest baselines ("pleasing machines").

**v1 interaction set: (a) draft KRs from an objective + (b) improve
this KR. NO objective generation** — objectives are the strategy part
AI is worst at, and the KR is our teaching moment. (b) turns the AI
into the coach: it critiques against the same "a number that changes,
not a task" checklist the wizard teaches.

**Placement.** Third path in wizard step 1 ("Draft with AI" beside
templates/from-scratch), input = objective title auto-filled + optional
context textarea, output = exactly 3 suggestion cards (title, type
badge, baseline→target, rationale) that PREFILL the wizard — the user
still walks the form, teaching intact, never auto-created. "Get AI
feedback" affordance on the measure step for (b).

**Prompt outline.** Role: OKR coach; hard rule against activity
phrasing; context: objective title, team, cycle, existing KRs (no
dupes), freeform notes; output contract: 3 suggestions as JSON matching
the shared Zod KR shape + rationale; baselines flagged as placeholder
guesses ("replace with your real number").

**Expectation management.** "Suggestions" label + "AI can be wrong —
check the numbers" microcopy (industry norm).

## Key handling findings

**Scope survey.** n8n = in-app encrypted credentials; Langfuse =
per-project keys; Outline/Immich = instance env. **Hybrid recommended:
instance `ANTHROPIC_API_KEY` env fallback + optional per-team key**
stored with the existing AES-256-GCM/HKDF helper; team > instance
precedence. Single-team self-hosts get zero-schema simplicity;
multi-team installs get cost attribution. No per-user keys.

**Proxy.** Server-side only — the TS SDK blocks browser use by default
for exactly this reason (`dangerouslyAllowBrowser` is for per-user-key
apps). A shared team key in the browser = extractable + guardrails
unenforceable. SPA → Fastify → Anthropic.

**Guardrails (concrete).** 10 drafts/user/hr, 30/team/hr; server-fixed
max_tokens 1024; 60s timeout (SDK default 10min is too long); SDK's
2 auto-retries kept; Fastify log redaction on AI route payloads (log
team id + usage tokens + latency only); typed-error mapping to plain
language (401 → "key rejected — check Team Settings", 429 → honor
retry-after, 529 → "Anthropic overloaded").

**Key UX.** Validate on save via `GET /v1/models` (authenticated, free,
zero tokens); store encrypted (must replay — not hashed); masked last-4
+ last-used; revoke = delete. Team Settings panel; "using instance key"
badge when the fallback is live. **No key: teaser, not hidden** —
disabled button + settings link; `AI_FEATURES=off` kill switch.

## API surface (from the claude-api skill)

Official `@anthropic-ai/sdk`; model `claude-opus-4-8` (skill mandate;
env-overridable); structured outputs via `client.messages.parse()` +
`zodOutputFormat` — response validated against a Zod schema derived
from our shared KR request schema; typed error classes for the mapping
above; no assistant prefill (removed on current models).

## Sources

- https://www.tability.io/features/ai/okr-agent · https://guides.tability.io/docs/features/plans/goal-setting-ai
- https://www.rhythms.ai/blog/how-to-write-okrs-that-actually-drive-results-(with-25-examples) · https://saralobkovich.com/nobsokrs-blog/ai-can-write-your-okrs
- https://docs.n8n.io/integrations/builtin/credentials/anthropic/ · https://langfuse.com/faq/all/llm-connection · https://github.com/outline/outline/blob/main/.env.sample
- https://github.com/anthropics/anthropic-sdk-typescript · https://platform.claude.com/docs/en/api/errors
