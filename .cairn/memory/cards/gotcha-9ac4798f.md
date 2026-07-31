---
type: gotcha
provenanceFiles: [packages/api/drizzle/0006_lively_zeigeist.sql]
provenanceCommits: [7db4d33]
created: 2026-07-31
confidence: high
---
drizzle-kit's generated SQLite table rebuild can be wrong when adding columns: it emitted `INSERT INTO __new_check_ins (...) SELECT ..., "source", "api_token_id" FROM check_ins` — selecting the NEW columns from the OLD table, which fails with SQLITE_ERROR at migrate time. Fix: hand-correct the generated INSERT's SELECT list to literals for the new columns ('ui', NULL); the snapshot stays consistent and `drizzle-kit check` remains clean. This is the one legitimate reason to edit generated migration SQL.
