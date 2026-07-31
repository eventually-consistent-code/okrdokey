---
type: gotcha
provenanceFiles: [packages/web/src/components/ai-key-card.tsx]
provenanceCommits: [1585ef0]
created: 2026-07-31
scopePhase: 3
confidence: high
---
TanStack react-query: `mutateAsync(...).then(...)` in an onClick without a `.catch` produces an unhandled promise rejection whenever the server returns an error status — the mutation's own error state captures it, but the returned promise ALSO rejects. In component tests this surfaces as vitest "Unhandled Errors" (failing CI even when every assertion passes). Prefer `mutate(payload, { onSuccess: ... })` for fire-and-forget UI handlers — errors flow only through mutation state (`save.error`), which the component already renders. Reserve mutateAsync for flows that genuinely await the result inside a try/catch.
