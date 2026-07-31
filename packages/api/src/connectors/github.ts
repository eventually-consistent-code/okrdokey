/**
 * Purpose: GitHub connector — answers "how much of this milestone/label is
 *          done" with plain fetch. Milestone reads ride ETags so the poll
 *          usually costs a 304 and nothing else; label reads lean on the
 *          search API's total_count.
 * Author(s): John Reed
 */

import { githubLinkConfigSchema } from '@okrdokey/shared';

import type { ConnectorAdapter, LinkProgress } from './types.js';

// Constants

const DEFAULT_BASE = 'https://api.github.com';
const BODY_SNIPPET_LENGTH = 120; // enough of GitHub's error to be useful in last_error

// tests point this at a local mock server
function apiBase(): string {
  return process.env.GITHUB_API_BASE ?? DEFAULT_BASE;
}

function baseHeaders(secret: string): Record<string, string> {
  return {
    authorization: `Bearer ${secret}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'okrdokey',
  };
}

// non-OK → an Error whose message lands in kr_links.last_error
async function raiseForStatus(res: Response): Promise<never> {
  const body = (await res.text().catch(() => '')).slice(0, BODY_SNIPPET_LENGTH);
  throw new Error(`GitHub responded ${res.status}: ${body}`);
}

// Milestone shape — one GET, open/closed counts come back directly

async function milestoneProgress(
  repo: string,
  milestoneNumber: number,
  secret: string,
  etag: string | null,
): Promise<LinkProgress> {
  const headers = baseHeaders(secret);
  if (etag) headers['if-none-match'] = etag;

  const res = await fetch(`${apiBase()}/repos/${repo}/milestones/${milestoneNumber}`, { headers });

  // 304 — nothing moved since last sync, skip the write entirely
  if (res.status === 304) return { done: 0, total: 0, notModified: true, etag };
  if (!res.ok) await raiseForStatus(res);

  const body = (await res.json()) as { open_issues: number; closed_issues: number };
  return {
    done: body.closed_issues,
    total: body.open_issues + body.closed_issues,
    etag: res.headers.get('etag'),
  };
}

// Label shape — search API, per_page=1, we only want total_count

async function searchCount(
  repo: string,
  label: string,
  state: 'open' | 'closed',
  secret: string,
): Promise<number> {
  const q = [`repo:${repo}`, 'is:issue', `label:"${label}"`, `state:${state}`].join('+');
  const res = await fetch(`${apiBase()}/search/issues?q=${q}&per_page=1`, {
    headers: baseHeaders(secret),
  });
  if (!res.ok) await raiseForStatus(res);
  const body = (await res.json()) as { total_count: number };
  return body.total_count;
}

// Main

export const githubAdapter: ConnectorAdapter = async (input) => {
  const config = githubLinkConfigSchema.parse(input.config);

  if ('milestoneNumber' in config) {
    return milestoneProgress(config.repo, config.milestoneNumber, input.secret, input.etag);
  }

  // no ETag support on search — two cheap counts every time
  const closed = await searchCount(config.repo, config.label, 'closed', input.secret);
  const open = await searchCount(config.repo, config.label, 'open', input.secret);
  return { done: closed, total: open + closed };
};
