/**
 * Purpose: API token + push endpoint tests — mint/list/revoke lifecycle,
 *          bearer-gated push creating source-marked check-ins, and the
 *          blast-radius rule (tokens work ONLY where allowApiToken is set).
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

let admin: string;
let teamId: string;
let krId: string;
let token: string;
let tokenId: string;

beforeAll(async () => {
  app = await buildApp({ dbPath: ':memory:', sessionSecret: 'test-secret-at-least-32-chars-long!!' });
  await app.ready();

  const a = await app.inject({
    method: 'POST',
    url: '/auth/signup',
    payload: { email: 'admin@example.com', password: 'correct-horse-battery', displayName: 'A' },
  });
  admin = cookieOf(a);
  teamId = (
    await app.inject({ method: 'POST', url: '/teams', payload: { name: 'Push' }, headers: { cookie: admin } })
  ).json<{ id: string }>().id;
  const cycleId = (
    await app.inject({ method: 'POST', url: '/cycles', payload: { name: '2026-Q3' }, headers: { cookie: admin } })
  ).json<{ id: string }>().id;
  const objectiveId = (
    await app.inject({
      method: 'POST',
      url: '/objectives',
      payload: { title: 'Automate everything', cycleId, teamId },
      headers: { cookie: admin },
    })
  ).json<{ id: string }>().id;
  krId = (
    await app.inject({
      method: 'POST',
      url: `/objectives/${objectiveId}/key-results`,
      payload: { title: 'Deploys 0 → 50', type: 'numeric', baseline: 0, target: 50 },
      headers: { cookie: admin },
    })
  ).json<{ id: string }>().id;
});

afterAll(async () => {
  await app.close();
});

describe('token lifecycle', () => {
  it('mints a token with the okr_ prefix, shown once', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/teams/${teamId}/tokens`,
      payload: { name: 'ci-pipeline' },
      headers: { cookie: admin },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ token: string; id: string }>();
    token = body.token;
    tokenId = body.id;
    expect(token).toMatch(/^okr_[A-Za-z0-9_-]{43}$/);
  });

  it('list never exposes token material', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/teams/${teamId}/tokens`,
      headers: { cookie: admin },
    });
    expect(res.body).not.toContain(token.slice(4, 20));
    expect(res.json<{ name: string }[]>()[0]?.name).toBe('ci-pipeline');
  });
});

describe('push endpoint (bearer)', () => {
  it('pushes a value; history shows source api with no author', async () => {
    const push = await app.inject({
      method: 'POST',
      url: `/key-results/${krId}/check-ins`,
      payload: { value: 20 },
      headers: { authorization: `Bearer ${token}` },
    });
    expect(push.statusCode).toBe(201);
    expect(push.json()).toMatchObject({ value: 20, source: 'api', authorUserId: null });

    const history = await app.inject({
      method: 'GET',
      url: `/key-results/${krId}/check-ins`,
      headers: { cookie: admin },
    });
    expect(history.json<{ source: string }[]>()[0]?.source).toBe('api');
  });

  it('machine push without confidence leaves KR confidence untouched', async () => {
    await app.inject({
      method: 'POST',
      url: `/key-results/${krId}/check-ins`,
      payload: { value: 25, confidence: 'yellow' },
      headers: { cookie: admin },
    });
    await app.inject({
      method: 'POST',
      url: `/key-results/${krId}/check-ins`,
      payload: { value: 30 },
      headers: { authorization: `Bearer ${token}` },
    });
    const obj = await app.inject({ method: 'GET', url: '/objectives', headers: { cookie: admin } });
    const kr = obj.json<{ keyResults: { id: string; currentValue: number; currentConfidence: string }[] }[]>()
      .flatMap((o) => o.keyResults)
      .find((k) => k.id === krId);
    expect(kr).toMatchObject({ currentValue: 30, currentConfidence: 'yellow' });
  });

  it('tokens are useless outside allowApiToken routes', async () => {
    for (const [method, url] of [
      ['GET', '/objectives'],
      ['GET', '/teams'],
      ['GET', `/key-results/${krId}/check-ins`],
    ] as const) {
      const res = await app.inject({ method, url, headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(401);
    }
  });

  it('garbage bearer 401s on the push route', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/key-results/${krId}/check-ins`,
      payload: { value: 1 },
      headers: { authorization: 'Bearer okr_definitely-not-real-aaaaaaaaaaaaaaaaaaaaaa' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('revoked token dies immediately', async () => {
    const revoke = await app.inject({
      method: 'DELETE',
      url: `/teams/${teamId}/tokens/${tokenId}`,
      headers: { cookie: admin },
    });
    expect(revoke.statusCode).toBe(204);
    const res = await app.inject({
      method: 'POST',
      url: `/key-results/${krId}/check-ins`,
      payload: { value: 40 },
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });
});
