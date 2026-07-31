---
type: gotcha
provenanceFiles: [e2e/ai-draft.spec.ts, e2e/mock-anthropic.cjs]
provenanceCommits: [88a3f2f, 88a3f2f]
created: 2026-07-31
scopePhase: 3
confidence: high
---
Playwright specs share one webServer instance, so instance-global resources race across parallel spec files: two specs both creating cycle "2026-Q3" collided on the app's cycles-are-instance-wide uniqueness ("cycle already exists"), failing both — each spec's fresh signup does NOT isolate shared-namespace data. Give each spec file unique global-resource names (2026-Q3 vs 2026-Q4). Related e2e hygiene that keeps biting: delete the throwaway DB (/tmp/okrdokey-e2e.sqlite) before runs, run from the repo root, and when a spec needs a mock upstream, register it as a second entry in playwright.config webServer[] (URL-matched by prefix — SDKs append query params like ?beta=true, so mocks must match paths with startsWith, not equality).
