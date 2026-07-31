/**
 * Purpose: GitHub adapter tests against a local mock of the GitHub API —
 *          milestone math, label search shape, ETag 304 round-trip, auth
 *          failure, and one full pass through runSync.
 * Author(s): John Reed
 */

import type { OutgoingHttpHeaders } from 'node:http';

import Fastify, { type FastifyInstance } from 'fastify';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { githubAdapter } from '../src/connectors/github.js';
import { adapters } from '../src/connectors/registry.js';
import { runSync } from '../src/connectors/sync.js';

const SECRET = 'test-secret-at-least-32-chars-long!!';
const GOOD_PAT = 'github_pat_good';
const MILESTONE_ETAG = 'W/"milestone-v1"';

let mock: FastifyInstance;
let milestoneHits = 0;

// A tiny GitHub. Milestone endpoint honors If-None-Match; search endpoint
// answers by state; anything with a bad token gets the classic 401.
async function startMock(): Promise<void> {
  mock = Fastify();

  mock.get('/repos/:owner/:repo/milestones/:num', (req, reply) => {
    milestoneHits += 1;
    if (req.headers.authorization !== `Bearer ${GOOD_PAT}`) {
      return reply.status(401).send({ message: 'Bad credentials' });
    }
    if (req.headers['if-none-match'] === MILESTONE_ETAG) {
      return reply.status(304).send();
    }
    return reply
      .header('etag', MILESTONE_ETAG)
      .send({ open_issues: 2, closed_issues: 6, title: 'v1.0' });
  });

  mock.get('/search/issues', (req, reply) => {
    if (req.headers.authorization !== `Bearer ${GOOD_PAT}`) {
      return reply.status(401).send({ message: 'Bad credentials' });
    }
    const q = String((req.query as { q?: string }).q ?? '');
    return reply.send({ total_count: q.includes('state:closed') ? 9 : 3 });
  });

  await mock.listen({ port: 0, host: '127.0.0.1' });
  const addr = mock.server.address();
  if (typeof addr === 'object' && addr) {
    process.env.GITHUB_API_BASE = `http://127.0.0.1:${addr.port}`;
  }
}

beforeAll(async () => {
  await startMock();
});

afterAll(async () => {
  delete process.env.GITHUB_API_BASE;
  await mock.close();
});

describe('github adapter', () => {
  it('milestone config: open/closed counts map to done/total, ETag captured', async () => {
    const progress = await githubAdapter({
      config: { repo: 'octo/rocket', milestoneNumber: 1 },
      secret: GOOD_PAT,
      etag: null,
    });
    expect(progress).toMatchObject({ done: 6, total: 8, etag: MILESTONE_ETAG });
    expect(progress.notModified).toBeUndefined();
  });

  it('label config: two search counts, closed = done, open + closed = total', async () => {
    const progress = await githubAdapter({
      config: { repo: 'octo/rocket', label: 'q3-launch' },
      secret: GOOD_PAT,
      etag: null,
    });
    expect(progress).toMatchObject({ done: 9, total: 12 });
    expect(progress.etag).toBeUndefined(); // search has no ETag story
  });

  it('ETag round-trip: second read with the stored ETag comes back 304 → notModified', async () => {
    const first = await githubAdapter({
      config: { repo: 'octo/rocket', milestoneNumber: 1 },
      secret: GOOD_PAT,
      etag: null,
    });
    const second = await githubAdapter({
      config: { repo: 'octo/rocket', milestoneNumber: 1 },
      secret: GOOD_PAT,
      etag: first.etag ?? null,
    });
    expect(second).toMatchObject({ done: 0, total: 0, notModified: true, etag: MILESTONE_ETAG });
  });

  it('401 from GitHub throws with the status in the message', async () => {
    await expect(
      githubAdapter({
        config: { repo: 'octo/rocket', milestoneNumber: 1 },
        secret: 'nope',
        etag: null,
      }),
    ).rejects.toThrow(/401/);
  });

  it('bad config shape is rejected before any request goes out', async () => {
    const before = milestoneHits;
    await expect(
      githubAdapter({ config: { repo: 'not a repo' }, secret: GOOD_PAT, etag: null }),
    ).rejects.toThrow();
    expect(milestoneHits).toBe(before);
  });
});

describe('github adapter through runSync', () => {
  let app: FastifyInstance;
  let cookie: string;
  let krId: string;

  function cookieOf(res: { headers: OutgoingHttpHeaders }): string {
    const raw = res.headers['set-cookie'];
    const header = Array.isArray(raw) ? raw[0] : raw;
    return String(header).split(';')[0] ?? '';
  }

  beforeAll(async () => {
    app = await buildApp({ dbPath: ':memory:', sessionSecret: SECRET });
    await app.ready();
    const signup = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email: 'gh@example.com', password: 'correct-horse-battery', displayName: 'G' },
    });
    cookie = cookieOf(signup);

    const teamId = (
      await app.inject({
        method: 'POST',
        url: '/teams',
        payload: { name: 'GH' },
        headers: { cookie },
      })
    ).json<{ id: string }>().id;
    const cycleId = (
      await app.inject({
        method: 'POST',
        url: '/cycles',
        payload: { name: 'Q3', startsOn: '2026-07-01', endsOn: '2026-09-30' },
        headers: { cookie },
      })
    ).json<{ id: string }>().id;
    const objectiveId = (
      await app.inject({
        method: 'POST',
        url: '/objectives',
        payload: { title: 'Ship v1', cycleId, teamId },
        headers: { cookie },
      })
    ).json<{ id: string }>().id;
    krId = (
      await app.inject({
        method: 'POST',
        url: `/objectives/${objectiveId}/key-results`,
        payload: { title: 'v1 milestone done', type: 'percent', baseline: 0, target: 100 },
        headers: { cookie },
      })
    ).json<{ id: string }>().id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('sweeps a due github link via the registry adapter and writes a source-marked check-in', async () => {
    const linked = await app.inject({
      method: 'PUT',
      url: `/key-results/${krId}/link`,
      payload: {
        provider: 'github',
        config: { repo: 'octo/rocket', milestoneNumber: 1 },
        mode: 'percent-closed',
        secret: GOOD_PAT,
      },
      headers: { cookie },
    });
    expect(linked.statusCode).toBe(200);

    // the real registry, the real adapter, the mock GitHub
    await runSync(app, new Date(), { adapters, sessionSecret: SECRET });

    const history = await app.inject({
      method: 'GET',
      url: `/key-results/${krId}/check-ins`,
      headers: { cookie },
    });
    // 6 closed of 8 → 75
    expect(history.json<{ value: number; source: string }[]>()[0]).toMatchObject({
      value: 75,
      source: 'github',
    });

    const linkRes = await app.inject({
      method: 'GET',
      url: `/key-results/${krId}/link`,
      headers: { cookie },
    });
    expect(linkRes.json()).toMatchObject({ lastError: null, consecutiveFailures: 0 });
    expect(linkRes.json<{ lastSyncedAt: string | null }>().lastSyncedAt).not.toBeNull();
  });
});
