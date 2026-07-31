---
type: decision
provenanceFiles: [e2e/mock-smtp.cjs, e2e/mock-anthropic.cjs, packages/api/src/cadence/mailer.ts]
provenanceCommits: [c172948, 88a3f2f, 3626905]
created: 2026-07-31
confidence: high
---
External-service seam playbook, proven across two milestones (Anthropic in v2, SMTP in v3): three layers, each with a distinct job. (1) UNIT: inject the client at buildApp options — a capturing wrapper over a no-network transport (nodemailer jsonTransport; a mutable-mode Fastify mock for HTTP APIs) so tests assert on captured sends without sockets. (2) CONTAINER SMOKE: a dep-free .cjs protocol mock (node:http speaking the API's wire shape for Anthropic; node:net speaking minimal SMTP 220/250/354 for mail) run BESIDE the production image on a docker network, with the app pointed at it via env (BASE_URL_OVERRIDE / SMTP_HOST) — this exercises the real client library, real sockets, real config plumbing in the shipped artifact. (3) UI GATING: the feature's presence rides a /health flag (or route-registration 404s) so the web probes cleanly instead of parsing error messages. Recurring trap at layer 2: SDKs append query params — mocks must match paths by prefix, never equality.
