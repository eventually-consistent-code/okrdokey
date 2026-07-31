---
type: gotcha
provenanceFiles: [packages/api/test/ai.test.ts]
provenanceCommits: [f774e0a]
created: 2026-07-31
scopePhase: 3
confidence: high
---
The Anthropic SDK honors a 429's `retry-after` header literally on its internal retries (default maxRetries 2). A mock Anthropic server returning 429 with `retry-after: 60` makes the SDK sleep a full minute per retry — tests hit their timeout looking "hung" rather than failing informatively. Mock 429 responses must OMIT retry-after so the SDK falls back to short exponential backoff (~1.5s total), keeping the typed-error-mapping test fast. Same class of trap for any SDK that respects backoff headers: mock error responses need production-shaped status codes but test-shaped timing headers.
