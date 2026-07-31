---
type: gotcha
provenanceFiles: [packages/api/src/ai/routes.ts, .cairn/plans/milestones/v2/03-ai-drafting/VERIFICATION.md]
provenanceCommits: [f774e0a, f21bf9c]
created: 2026-07-31
scopePhase: 3
confidence: high
---
Anthropic SDK (@anthropic-ai/sdk 0.115.x) structured-output parse failures — malformed/truncated model JSON or schema mismatch in `client.beta.messages.parse()` — throw `AnthropicError`, which is the BASE class of `APIError`, not a subclass. Error mapping built on `instanceof Anthropic.APIError` (and its Authentication/RateLimit subclasses) misses them, so parse-throws fall to generic catch-alls and bypass retry-on-invalid-output logic entirely. Concrete trigger: a low max_tokens truncating JSON mid-object (stop_reason max_tokens). Classify with `err instanceof AnthropicError && !(err instanceof APIError)` → treat as invalid model output (retry-eligible), while real API errors keep their typed mapping. Found by adversarial verification after 194 tests were green.
