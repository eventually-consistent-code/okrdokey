---
type: gotcha
provenanceFiles: [packages/api/test/email.test.ts, .cairn/trace/archive/trace-28dc05ce.md]
provenanceCommits: [0b3e1af, 282332d]
created: 2026-07-31
confidence: high
---
Title-level phantom coverage: a test NAMED for a behavior its fixture never exercises — "machine check-ins excluded" passed green with zero machine check-ins in the fixture; the assertion existed, the scenario didn't. This is the subtlest member of the phantom-coverage family (decision-dad3ba9e): earlier members were declared-but-unassigned mock modes and done-when items with no test at all. Audit method that catches all three: for EVERY behavioral claim in a test title or a plan's done-when list, locate (a) the assertion that checks it AND (b) the fixture element that triggers it — a claim without both is phantom. Track record across v2–v3: five verify passes, three failed first on this audit, every single finding was proof-debt with zero behavior bugs underneath. The code keeps being right; the claims keep outpacing the evidence.
