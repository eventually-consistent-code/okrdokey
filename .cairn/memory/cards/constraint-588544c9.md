---
type: constraint
provenanceFiles: [packages/api/src/connectors/jira.ts, .cairn/plans/milestones/v1/05-integrations/RESEARCH.md]
provenanceCommits: [15692ac, 2661f07]
created: 2026-07-31
confidence: high
---
Jira Cloud removed `/rest/api/3/search` (deprecated then deleted mid-2025). Current endpoints: `/rest/api/3/search/jql` (nextPageToken pagination; maxResults=0-for-total no longer exists) and `POST /rest/api/3/search/approximate-count` with `{"jql": "..."}` returning `{"count": n}` — the right call for progress counts. OKRdokey's Jira adapter does two approximate-count calls: total = user JQL, done = `(<jql>) AND statusCategory = Done`. Never reintroduce the removed endpoint.
