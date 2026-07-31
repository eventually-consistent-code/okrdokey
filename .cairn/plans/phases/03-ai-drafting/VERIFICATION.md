# Phase 3 (v2): AI Drafting — Verification

Verified 2026-07-31. Deep depth: goal-backward check + adversarial
verification subagent + full gate re-run after fixes. Commits under
verification: e069778 (backend), bfe1581 (web), 88a3f2f (tests/e2e/docs),
f774e0a (adversarial-finding fixes).

## What was checked

**Goal-backward against CONTEXT.md locked decisions:**

- Two interactions only (draft-krs, improve-kr), objectiveId required,
  suggestions prefill and never auto-create — confirmed in routes +
  wizard (creation goes through the same mutation as manual entry,
  behind the explicit review step).
- Anthropic-only via official SDK, `claude-opus-4-8` with AI_MODEL
  override, AI_FEATURES=off kill switch — confirmed in config.ts; off
  means routes never register (tested: /ai/status 404s).
- Key resolution: team > instance for team objectives; personal =
  instance only with user-scope counter only — tested both directions,
  including team-budget-exhausted admin still drafting on a personal
  objective.
- Server-side proxy only: no key material or Anthropic calls in
  packages/web/src (grepped); responses carry last-4 only (schema has
  no key field; tests assert body excludes the key); AES-256-GCM at
  rest via existing HKDF helper — ciphertext write/decrypt paths read.
- Guardrails: max_tokens 1024, 60s timeout, 10/user/hr + 30/team/hr
  fixed windows with peek-both-before-consume (no half-spent budgets),
  budget consumed once per request (retry does NOT double-consume),
  stale windows pruned.
- Log hygiene: instance-global pino redact of prompt bodies + key
  fields; handlers log ids/counts only. Production-container smoke
  includes a log scan proving neither the key nor prompt text appears.
- 2–3 suggestion contract with per-suggestion re-validation and
  one-retry-then-typed-502; OpenAPI schemas on all routes; admin-only
  key CRUD behind the uniform 404 pattern; membership enforced via
  accessibleObjective (owner-only personal, membership-checked team).

**Gates (all re-run after fixes):** 220 vitest (25 files) including the
mock-Anthropic API suite and web component tests; 3 Playwright e2e
including the full draft journey against the built app; production-
container journey on a rebuilt image with the mock as a docker-network
service (per decision-66c0ad59); lint + typecheck clean. Zero live
Anthropic calls anywhere in the test surface.

**Tracker:** issue #16 closed with evidence; `issue_list(phase 3, open)`
empty; ledger line present. No `tdd:` frontmatter in PLAN.md → TDD
evidence n/a.

## Adversarial findings (trace-3b954785 / #19 — all fixed in f774e0a)

1. Parse-throw invalid output (malformed/truncated model JSON) bypassed
   the one-retry promise — AnthropicError is APIError's base class, so
   it fell to the generic 502 with zero retries. Now classified as
   invalid output and retried once; real API errors still map typed.
2. Empty critique from the model 500'd on response serialization
   (wrapper allowed [], response schema required min 1). Wrapper now
   matches the contract; degrades to the typed "usable feedback" 502.
3. Claimed-but-missing test coverage (529/429 upstream mappings, team
   30/hr, improve-kr 409/429, /ai/status states, membership 404s,
   retry attempt-counting) — closed with 12 new assertions.

## Accepted deviations (noted, not blocking)

- Upstream 429: the SDK itself honors retry-after on its internal
  retries; our mapping then reports plain language. CONTEXT's "honor
  retry-after" is satisfied at the SDK layer, not re-surfaced to the
  client response.
- Handler logs omit usage tokens/latency (ids + counts only) — tighter
  than promised, not looser.
- Rate limiter is single-process-correct (synchronous better-sqlite3 on
  one event loop — no TOCTOU); a multi-process deployment could lose
  increments. Matches the shipped single-container deployment model.
- Per-suggestion re-validation is defense-in-depth: beyond the numeric
  baseline≠target rule, the structured-output schema already guarantees
  most of it. Percent/boolean bounds normalize identically server- and
  client-side, so nothing invalid can be created.
- Teaser microcopy paraphrases CONTEXT's wording ("AI can be wrong —
  check the numbers" appears as "placeholder guesses — replace with
  your real number" coaching in wizard + rationale text).

## Verdict

PASS — phase delivers what it promised. Next: /cairn:ship.
