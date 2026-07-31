---
type: decision
provenanceFiles: [.cairn/plans/milestones/v2/03-ai-drafting/VERIFICATION.md, .cairn/trace/archive/trace-3b954785.md]
provenanceCommits: [f21bf9c, 3c9bb71]
created: 2026-07-31
scopePhase: 3
confidence: high
---
Adversarial verification (deep-mode verify subagent prompted to REFUTE, with file:line evidence required) earns its cost: after 194 tests were green and lint/typecheck clean, it found three real defects in the AI phase — a retry contract that didn't cover the throw-class of invalid output, a wrapper/response schema mismatch that turned a model quirk into a 500, and PHANTOM TEST COVERAGE (a mock mode declared and implemented but never assigned in any test; error mappings "covered" by dead code). Practices that came out of it: (1) count mock invocations to prove retries actually fire — a retry test that only asserts the final status passes identically with the retry deleted; (2) grep the test file for each declared mock mode actually being assigned; (3) verify claimed coverage lists against real assertions, not test-file header comments.
