/**
 * Purpose: Check-in integration tests — append-only history order + integrity,
 *          denormalized KR cache consistency, percent clamping, and the access
 *          matrix (member ok, outsider 404, unauthenticated 401).
 * Author(s): John Reed
 */

import type { OutgoingHttpHeaders } from 'node:http';

import type { FastifyInstance } from 'fastify';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';

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
let objId: string;
let numericKrId: string;
let percentKrId: string;

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

  const obj = await app.inject({
    method: 'POST',
    url: '/objectives',
    payload: { title: 'Reduce churn', cycleId, teamId },
    headers: { cookie: alice },
  });
  objId = obj.json<{ id: string }>().id;

  const numeric = await app.inject({
    method: 'POST',
    url: `/objectives/${objId}/key-results`,
    payload: { title: 'Churn 5% → 2%', type: 'numeric', unit: '%', baseline: 5, target: 2 },
    headers: { cookie: alice },
  });
  numericKrId = numeric.json<{ id: string }>().id;

  const percent = await app.inject({
    method: 'POST',
    url: `/objectives/${objId}/key-results`,
    payload: { title: 'Docs coverage', type: 'percent', target: 100 },
    headers: { cookie: alice },
  });
  percentKrId = percent.json<{ id: string }>().id;
});

afterAll(async () => {
  await app.close();
});

describe('check-ins — history + denorm', () => {
  it('append-only log keeps every entry, newest first, and denorm follows the latest', async () => {
    const values = [4.5, 4.1, 3.2];
    for (const value of values) {
      const res = await app.inject({
        method: 'POST',
        url: `/key-results/${numericKrId}/check-ins`,
        payload: { value, confidence: 'yellow', note: `now at ${value}` },
        headers: { cookie: alice },
      });
      expect(res.statusCode).toBe(201);
    }
    const last = await app.inject({
      method: 'POST',
      url: `/key-results/${numericKrId}/check-ins`,
      payload: { value: 2.8, confidence: 'green' },
      headers: { cookie: bob },
    });
    expect(last.statusCode).toBe(201);
    expect(last.json()).toMatchObject({ value: 2.8, confidence: 'green', note: null });

    // History: all four rows survive, newest first, authorship intact
    const history = await app.inject({
      method: 'GET',
      url: `/key-results/${numericKrId}/check-ins`,
      headers: { cookie: bob },
    });
    const rows = history.json<{ value: number; authorUserId: string }[]>();
    expect(rows).toHaveLength(4);
    expect(rows.map((c) => c.value)).toEqual([2.8, 3.2, 4.1, 4.5]);
    expect(new Set(rows.map((c) => c.authorUserId)).size).toBe(2);

    // Denorm: the KR cache mirrors the latest check-in, not an average
    const obj = await app.inject({
      method: 'GET',
      url: `/objectives/${objId}`,
      headers: { cookie: alice },
    });
    const kr = obj
      .json<{ keyResults: { id: string; currentValue: number; currentConfidence: string }[] }>()
      .keyResults.find((k) => k.id === numericKrId);
    expect(kr).toMatchObject({ currentValue: 2.8, currentConfidence: 'green' });
  });

  it('percent KR clamps out-of-range values to 0..100', async () => {
    const over = await app.inject({
      method: 'POST',
      url: `/key-results/${percentKrId}/check-ins`,
      payload: { value: 130, confidence: 'green' },
      headers: { cookie: alice },
    });
    expect(over.json()).toMatchObject({ value: 100 });

    const under = await app.inject({
      method: 'POST',
      url: `/key-results/${percentKrId}/check-ins`,
      payload: { value: -20, confidence: 'red' },
      headers: { cookie: alice },
    });
    expect(under.json()).toMatchObject({ value: 0 });
  });

  it('note over 1000 chars → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/key-results/${numericKrId}/check-ins`,
      payload: { value: 3, confidence: 'green', note: 'x'.repeat(1001) },
      headers: { cookie: alice },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('check-ins — access', () => {
  it('outsider 404s on both routes (no existence leak)', async () => {
    const post = await app.inject({
      method: 'POST',
      url: `/key-results/${numericKrId}/check-ins`,
      payload: { value: 1, confidence: 'green' },
      headers: { cookie: mallory },
    });
    expect(post.statusCode).toBe(404);

    const get = await app.inject({
      method: 'GET',
      url: `/key-results/${numericKrId}/check-ins`,
      headers: { cookie: mallory },
    });
    expect(get.statusCode).toBe(404);
  });

  it('bogus key result id → 404 for a member too', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/key-results/nope/check-ins',
      headers: { cookie: alice },
    });
    expect(res.statusCode).toBe(404);
  });

  it('everything 401s without a session', async () => {
    for (const [method, url] of [
      ['POST', `/key-results/${numericKrId}/check-ins`],
      ['GET', `/key-results/${numericKrId}/check-ins`],
    ] as const) {
      const res = await app.inject({ method, url });
      expect(res.statusCode).toBe(401);
    }
  });
});
