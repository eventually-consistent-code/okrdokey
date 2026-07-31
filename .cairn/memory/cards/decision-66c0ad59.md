---
type: decision
provenanceFiles: [.cairn/plans/milestones/v1/04-web-ui/VERIFICATION.md, .cairn/plans/milestones/v1/01-foundation/VERIFICATION.md]
provenanceCommits: [0ed8996, 988a05c]
created: 2026-07-31
confidence: high
---
Phase verification for this project must include a live production-container journey (docker build + run, real curl flows), not just the test suite. Rationale: env-gated behavior (NODE_ENV=production branches like Secure cookies, entrypoint secret bootstrap, migration-on-boot, glibc/native-module loading) is structurally invisible to vitest and Playwright, which run non-production. Two of v1's three worst bugs (Secure-cookie 401s, better-sqlite3 glibc crash) were caught ONLY by container smokes during verify.
