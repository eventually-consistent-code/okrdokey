---
type: gotcha
provenanceFiles: [.cairn/plans/milestones/v3/03-email-digests/VERIFICATION.md]
provenanceCommits: [c560b21]
created: 2026-07-31
confidence: medium
---
`gh run list --limit 1` immediately after `git push` can sample the PREVIOUS run — the new run may not be registered yet, so the poll loop watches an old run to completion and reports a false green. This shipped a red run to main unnoticed: the ship watched run N-1 (green, prior commit) while run N (the pushed commit) failed; the failure only surfaced when the NEXT ship's sampling caught the backlog. Fix: resolve the run id by the pushed SHA before polling — `gh run list --json databaseId,headSha` and match `headSha` against `git rev-parse HEAD` (retry until it appears), then `gh run view <id>` to completion. A sleep-then-limit-1 is timing luck, not a fix.
