---
type: gotcha
provenanceFiles: [packages/api/src/auth/plugin.ts, .cairn/trace/archive/trace-ed2e2c78.md]
provenanceCommits: [db170fa, 0ed8996]
created: 2026-07-31
confidence: high
---
Hard-coding Secure session cookies for NODE_ENV=production silently breaks plain-http self-hosts: signup/login return 200 but the browser/curl never sends the cookie back, so every subsequent call 401s. Fix: cookie `secure: 'auto'` (@fastify/session marks Secure only on encrypted connections) + fastify `trustProxy: true` so TLS-terminating reverse proxies still produce Secure cookies via x-forwarded-proto. Crucially, vitest and Playwright both run non-production and were blind to it — only the production-container smoke test surfaced it (trace-ed2e2c78, tracker issue #17).
