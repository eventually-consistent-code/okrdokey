---
type: gotcha
provenanceFiles: [packages/api/src/auth/routes.ts, .cairn/plans/milestones/v2/04-polish/CONTEXT.md]
provenanceCommits: [08ef69d, 08ef69d]
created: 2026-07-31
scopePhase: 4
confidence: high
---
@fastify/rate-limit (11.2.0) `groupId` does NOT merge counters under the default in-memory store: two routes sharing the same groupId and client IP still decrement independent per-route buckets. Proved empirically via x-ratelimit-remaining headers — login counted 4,3,2 while signup independently counted 4,3 with identical groupId+IP; the "6th call across both routes 429s" expectation never fires. If a shared budget across routes is required, don't rely on groupId with the memory store — either accept per-route buckets (and document them) or use a custom store. Also: the plugin's per-IP keying rides request.ip, so tests hitting limited routes from one inject()-default IP must vary x-forwarded-for (works because trustProxy is on) or they throttle themselves.
