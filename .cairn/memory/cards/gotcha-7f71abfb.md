---
type: gotcha
provenanceFiles: [packages/api/drizzle/meta/_journal.json, .cairn/plans/milestones/v1/03-okr-core/CONTEXT.md]
provenanceCommits: [462bf2f, 4bb0b5d]
created: 2026-07-31
confidence: high
---
Parallel worktree agents that each run `drizzle-kit generate` collide: both mint the same-numbered migration and conflict on meta/_journal.json (phase 3 produced dual 0002_* files; resolution was keep-one + regenerate the other as 0003 against the merged schema). The rule that eliminated it: ALL of a phase's schema lands in wave 1 before any parallel fan-out — wave-2 agents never touch schema.ts or generate migrations. Held clean through phases 4 and 5.
