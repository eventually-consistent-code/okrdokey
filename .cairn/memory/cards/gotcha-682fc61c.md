---
type: gotcha
provenanceFiles: [.cairn/plans/milestones/v1/01-foundation/RESEARCH.md, packages/api/package.json]
provenanceCommits: [c13d965, 581e95b]
created: 2026-07-31
confidence: high
---
Research subagents inflate library versions: phase-1 research reported "Drizzle v1, now stable" when the real npm latest was drizzle-orm 0.45.x / drizzle-kit 0.31.x (install failed on the imaginary ^1.0.0). Treat versions in research briefs as hypotheses — run `npm view <pkg> version` before pinning anything. Later-phase research that explicitly npm-verified stayed accurate.
