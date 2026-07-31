/**
 * Purpose: Jira Cloud adapter — two approximate-count calls turn one JQL query
 *          into KR progress: total = the user's JQL, done = same JQL AND
 *          statusCategory = Done. The old /rest/api/3/search was removed
 *          mid-2025; NEVER call it.
 * Author(s): John Reed
 */

import { jiraLinkConfigSchema } from '@okrdokey/shared';

import type { ConnectorAdapter } from './types.js';

const TIMEOUT_MS = 10_000;
const SNIPPET_CHARS = 120; // Jira 400 bodies carry the actual JQL complaint — keep a taste of it

// One POST to /rest/api/3/search/approximate-count → the matching issue count
async function approximateCount(baseUrl: string, auth: string, jql: string): Promise<number> {
  const res = await fetch(`${baseUrl}/rest/api/3/search/approximate-count`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${auth}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ jql }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    // surface the status AND what Jira actually said (bad JQL 400s are useful)
    const snippet = (await res.text()).slice(0, SNIPPET_CHARS);
    throw new Error(`Jira ${res.status}: ${snippet}`);
  }

  const body = (await res.json()) as { count: number };
  return body.count;
}

export const jiraAdapter: ConnectorAdapter = async (input) => {
  const config = jiraLinkConfigSchema.parse(input.config);
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const auth = Buffer.from(`${config.email}:${input.secret}`).toString('base64');

  const total = await approximateCount(baseUrl, auth, config.jql);
  const done = await approximateCount(baseUrl, auth, `(${config.jql}) AND statusCategory = Done`);

  // approximate-count has no conditional-request story — no ETag to hand back
  return { done, total, etag: null };
};
