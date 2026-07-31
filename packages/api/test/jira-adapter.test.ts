/**
 * Purpose: Jira adapter tests against a local mock Jira — two-call count math,
 *          Basic auth correctness, bad-JQL 400 surfaced, 401 rejection, and one
 *          full runSync pass writing a source='jira' check-in.
 * Author(s): John Reed
 */

import type { OutgoingHttpHeaders } from 'node:http';

import Fastify, { type FastifyInstance } from 'fastify';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { jiraAdapter } from '../src/connectors/jira.js';
import { runSync } from '../src/connectors/sync.js';
import { metricLinks } from '../src/db/schema.js';

const SECRET = 'test-secret-at-least-32-chars-long!!';
const JIRA_EMAIL = 'bot@example.com';
const JIRA_TOKEN = 'jira-api-token-123';
const GOOD_AUTH = `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString('base64')}`;

// Mock Jira: knobs the tests twist between cases
const mock = {
  totalCount: 8,
  doneCount: 6,
  badJql: false,
  seenJql: [] as string[],
  seenAuth: [] as string[],
};

let jira: FastifyInstance;
let baseUrl: string;

function cookieOf(res: { headers: OutgoingHttpHeaders }): string {
  const raw = res.headers['set-cookie'];
  const header = Array.isArray(raw) ? raw[0] : raw;
  return String(header).split(';')[0] ?? '';
}

beforeAll(async () => {
  jira = Fastify();
  jira.post('/rest/api/3/search/approximate-count', async (req, reply) => {
    const auth = req.headers.authorization ?? '';
    mock.seenAuth.push(auth);
    if (auth !== GOOD_AUTH) {
      return reply.status(401).send({ errorMessages: ['Client must be authenticated'] });
    }
    if (mock.badJql) {
      return reply.status(400).send({
        errorMessages: ["Error in the JQL Query: Expecting operator but got 'zzz'."],
      });
    }
    const { jql } = req.body as { jql: string };
    mock.seenJql.push(jql);
    // the done query carries the statusCategory clause; the total one doesn't
    const count = jql.includes('statusCategory = Done') ? mock.doneCount : mock.totalCount;
    return { count };
  });
  await jira.listen({ port: 0, host: '127.0.0.1' });
  const address = jira.server.address();
  if (typeof address === 'string' || address === null) throw new Error('mock jira has no port');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await jira.close();
});

beforeEach(() => {
  mock.badJql = false;
  mock.seenJql = [];
  mock.seenAuth = [];
});

describe('jira adapter', () => {
  it('two approximate-count calls → {done, total}, no etag', async () => {
    const progress = await jiraAdapter({
      config: { baseUrl, email: JIRA_EMAIL, jql: 'project = OKR' },
      secret: JIRA_TOKEN,
      etag: null,
    });
    expect(progress).toEqual({ done: 6, total: 8, etag: null });

    // total = the raw JQL; done = wrapped + statusCategory clause
    expect(mock.seenJql).toEqual([
      'project = OKR',
      '(project = OKR) AND statusCategory = Done',
    ]);
  });

  it('sends Basic base64(email:token)', async () => {
    await jiraAdapter({
      config: { baseUrl, email: JIRA_EMAIL, jql: 'project = OKR' },
      secret: JIRA_TOKEN,
      etag: null,
    });
    expect(mock.seenAuth).toEqual([GOOD_AUTH, GOOD_AUTH]);
  });

  it('bad JQL 400 → error carries the status and the Jira complaint', async () => {
    mock.badJql = true;
    await expect(
      jiraAdapter({
        config: { baseUrl, email: JIRA_EMAIL, jql: 'project = OKR zzz' },
        secret: JIRA_TOKEN,
        etag: null,
      }),
    ).rejects.toThrow(/Jira 400: .*Expecting operator/);
  });

  it('wrong token → 401 error', async () => {
    await expect(
      jiraAdapter({
        config: { baseUrl, email: JIRA_EMAIL, jql: 'project = OKR' },
        secret: 'wrong-token',
        etag: null,
      }),
    ).rejects.toThrow(/Jira 401/);
  });

  it('runSync with the real adapter writes source=jira check-ins (percent + count)', async () => {
    const app = await buildApp({ dbPath: ':memory:', sessionSecret: SECRET });
    await app.ready();
    try {
      const signup = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: { email: 'jira@example.com', password: 'correct-horse-battery', displayName: 'J' },
      });
      const cookie = cookieOf(signup);

      const teamId = (
        await app.inject({ method: 'POST', url: '/teams', payload: { name: 'Jira team' }, headers: { cookie } })
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
          payload: { title: 'Jira synced', cycleId, teamId },
          headers: { cookie },
        })
      ).json<{ id: string }>().id;

      const makeKr = async (title: string, type: 'percent' | 'numeric'): Promise<string> =>
        (
          await app.inject({
            method: 'POST',
            url: `/objectives/${objectiveId}/key-results`,
            payload:
              type === 'percent'
                ? { title, type: 'percent', baseline: 0, target: 100 }
                : { title, type: 'numeric', baseline: 0, target: 20 },
            headers: { cookie },
          })
        ).json<{ id: string }>().id;

      const linkKr = async (krId: string, mode: 'percent-closed' | 'count-closed'): Promise<void> => {
        const res = await app.inject({
          method: 'PUT',
          url: `/key-results/${krId}/link`,
          payload: {
            provider: 'jira',
            config: { baseUrl, email: JIRA_EMAIL, jql: 'project = OKR' },
            mode,
            secret: JIRA_TOKEN,
          },
          headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
      };

      const percentKrId = await makeKr('Percent KR', 'percent');
      const countKrId = await makeKr('Count KR', 'numeric');
      await linkKr(percentKrId, 'percent-closed');
      await linkKr(countKrId, 'count-closed');

      await runSync(app, new Date(), { adapters: { jira: jiraAdapter }, sessionSecret: SECRET });

      // percent-closed: 6/8 → 75; count-closed: raw done count
      const percentHistory = await app.inject({
        method: 'GET',
        url: `/key-results/${percentKrId}/check-ins`,
        headers: { cookie },
      });
      expect(percentHistory.json<{ value: number; source: string }[]>()[0]).toMatchObject({
        value: 75,
        source: 'jira',
      });

      const countHistory = await app.inject({
        method: 'GET',
        url: `/key-results/${countKrId}/check-ins`,
        headers: { cookie },
      });
      expect(countHistory.json<{ value: number; source: string }[]>()[0]).toMatchObject({
        value: 6,
        source: 'jira',
      });

      // healthy sweep — no errors left on the links
      const rows = app.db.select().from(metricLinks).all();
      expect(rows.every((r) => r.lastError === null && r.consecutiveFailures === 0)).toBe(true);
    } finally {
      await app.close();
    }
  });
});
