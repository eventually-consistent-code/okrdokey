/**
 * Purpose: OKR CRUD integration tests — cycles, objectives (personal vs
 *          team scoping, archive), key results (type normalization) against
 *          the real app on in-memory SQLite.
 * Author(s): John Reed
 */

import type { OutgoingHttpHeaders } from 'node:http';

import type { FastifyInstance } from 'fastify';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { quarterRange } from '../src/okr/cycles.js';

let app: FastifyInstance;

function cookieOf(res: { headers: OutgoingHttpHeaders }): string {
  const raw = res.headers['set-cookie'];
  const header = Array.isArray(raw) ? raw[0] : raw;
  return String(header).split(';')[0] ?? '';
}

async function signup(email: string, displayName: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/signup',
    payload: { email, password: 'correct-horse-battery', displayName },
  });
  return cookieOf(res);
}

let alice: string; // team admin
let bob: string; // team member
let mallory: string; // outsider
let teamId: string;
let cycleId: string;

beforeAll(async () => {
  app = await buildApp({ dbPath: ':memory:', sessionSecret: 'test-secret-at-least-32-chars-long!!' });
  await app.ready();

  alice = await signup('alice@example.com', 'Alice');
  bob = await signup('bob@example.com', 'Bob');
  mallory = await signup('mallory@example.com', 'Mallory');

  const team = await app.inject({
    method: 'POST',
    url: '/teams',
    payload: { name: 'Platform' },
    headers: { cookie: alice },
  });
  teamId = team.json<{ id: string }>().id;
  await app.inject({
    method: 'POST',
    url: `/teams/${teamId}/members`,
    payload: { email: 'bob@example.com', role: 'member' },
    headers: { cookie: alice },
  });

  const cycle = await app.inject({
    method: 'POST',
    url: '/cycles',
    payload: { name: '2026-Q3' },
    headers: { cookie: alice },
  });
  cycleId = cycle.json<{ id: string }>().id;
});

afterAll(async () => {
  await app.close();
});

describe('cycles', () => {
  it('quarterRange computes correct quarter bounds', () => {
    expect(quarterRange('2026-Q3')).toEqual({ startsOn: '2026-07-01', endsOn: '2026-09-30' });
    expect(quarterRange('2026-Q1')).toEqual({ startsOn: '2026-01-01', endsOn: '2026-03-31' });
    expect(quarterRange('whenever')).toBeNull();
  });

  it('seeded quarter got its range', async () => {
    const res = await app.inject({ method: 'GET', url: `/cycles/${cycleId}`, headers: { cookie: alice } });
    expect(res.json()).toMatchObject({ name: '2026-Q3', startsOn: '2026-07-01', endsOn: '2026-09-30' });
  });

  it('non-quarter name without dates → 400; duplicate name → 409', async () => {
    const bad = await app.inject({ method: 'POST', url: '/cycles', payload: { name: 'H2 push' }, headers: { cookie: alice } });
    expect(bad.statusCode).toBe(400);
    const dup = await app.inject({ method: 'POST', url: '/cycles', payload: { name: '2026-Q3' }, headers: { cookie: alice } });
    expect(dup.statusCode).toBe(409);
  });

  it('arbitrary date-range cycle works', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/cycles',
      payload: { name: '6-week sprint', startsOn: '2026-08-01', endsOn: '2026-09-11' },
      headers: { cookie: alice },
    });
    expect(res.statusCode).toBe(201);
  });
});

describe('objectives — scoping', () => {
  let personalId: string;
  let teamObjId: string;

  it('creates a personal objective', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/objectives',
      payload: { title: 'Learn woodworking', cycleId },
      headers: { cookie: alice },
    });
    expect(res.statusCode).toBe(201);
    personalId = res.json<{ id: string }>().id;
    expect(res.json()).toMatchObject({ teamId: null });
  });

  it('creates a team objective as a member', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/objectives',
      payload: { title: 'Ship self-host beta', cycleId, teamId },
      headers: { cookie: bob },
    });
    expect(res.statusCode).toBe(201);
    teamObjId = res.json<{ id: string }>().id;
  });

  it('outsider cannot create into the team (404, no existence leak)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/objectives',
      payload: { title: 'sneaky', cycleId, teamId },
      headers: { cookie: mallory },
    });
    expect(res.statusCode).toBe(404);
  });

  it("others cannot read someone's personal objective", async () => {
    const res = await app.inject({ method: 'GET', url: `/objectives/${personalId}`, headers: { cookie: bob } });
    expect(res.statusCode).toBe(404);
  });

  it('team members see team objectives; outsiders 404', async () => {
    expect((await app.inject({ method: 'GET', url: `/objectives/${teamObjId}`, headers: { cookie: alice } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/objectives/${teamObjId}`, headers: { cookie: mallory } })).statusCode).toBe(404);
  });

  it('list scopes to mine + my teams; mallory sees nothing', async () => {
    const forBob = await app.inject({ method: 'GET', url: '/objectives', headers: { cookie: bob } });
    const titles = forBob.json<{ title: string }[]>().map((o) => o.title);
    expect(titles).toContain('Ship self-host beta');
    expect(titles).not.toContain('Learn woodworking');

    const forMallory = await app.inject({ method: 'GET', url: '/objectives', headers: { cookie: mallory } });
    expect(forMallory.json<unknown[]>()).toHaveLength(0);
  });

  it('archive hides from default list, includeArchived shows it', async () => {
    await app.inject({ method: 'POST', url: `/objectives/${personalId}/archive`, headers: { cookie: alice } });
    const dflt = await app.inject({ method: 'GET', url: '/objectives', headers: { cookie: alice } });
    expect(dflt.json<{ id: string }[]>().map((o) => o.id)).not.toContain(personalId);
    const withArchived = await app.inject({
      method: 'GET',
      url: '/objectives?includeArchived=true',
      headers: { cookie: alice },
    });
    expect(withArchived.json<{ id: string }[]>().map((o) => o.id)).toContain(personalId);
  });
});

describe('key results', () => {
  let objId: string;
  let krId: string;

  beforeAll(async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/objectives',
      payload: { title: 'Reduce churn', cycleId, teamId },
      headers: { cookie: alice },
    });
    objId = res.json<{ id: string }>().id;
  });

  it('numeric KR keeps baseline/target; decreasing-is-good allowed', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/objectives/${objId}/key-results`,
      payload: { title: 'Churn 5% → 2%', type: 'numeric', unit: '%', baseline: 5, target: 2 },
      headers: { cookie: alice },
    });
    expect(res.statusCode).toBe(201);
    krId = res.json<{ id: string }>().id;
    expect(res.json()).toMatchObject({ baseline: 5, target: 2, currentValue: 5 });
  });

  it('percent KR normalizes to 0..100', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/objectives/${objId}/key-results`,
      payload: { title: 'Docs coverage', type: 'percent', baseline: 30, target: 80 },
      headers: { cookie: alice },
    });
    expect(res.json()).toMatchObject({ baseline: 0, target: 100, currentValue: 0 });
  });

  it('numeric with baseline == target → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/objectives/${objId}/key-results`,
      payload: { title: 'No span', type: 'numeric', baseline: 10, target: 10 },
      headers: { cookie: alice },
    });
    expect(res.statusCode).toBe(400);
  });

  it('member can update; outsider 404s; delete works', async () => {
    const upd = await app.inject({
      method: 'PATCH',
      url: `/key-results/${krId}`,
      payload: { title: 'Churn 5% → 2.5%', target: 2.5 },
      headers: { cookie: bob },
    });
    expect(upd.statusCode).toBe(200);
    expect(upd.json()).toMatchObject({ target: 2.5 });

    expect(
      (await app.inject({ method: 'PATCH', url: `/key-results/${krId}`, payload: { title: 'x' }, headers: { cookie: mallory } }))
        .statusCode,
    ).toBe(404);

    const del = await app.inject({ method: 'DELETE', url: `/key-results/${krId}`, headers: { cookie: alice } });
    expect(del.statusCode).toBe(204);
  });
});

describe('auth sweep', () => {
  it('everything 401s without a session', async () => {
    for (const [method, url] of [
      ['POST', '/objectives'],
      ['GET', '/objectives'],
      ['POST', '/cycles'],
      ['GET', '/cycles'],
    ] as const) {
      const res = await app.inject({ method, url });
      expect(res.statusCode).toBe(401);
    }
  });
});
