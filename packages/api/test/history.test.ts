/**
 * Purpose: History endpoint tests — event-based series correctness
 *          (single KR, multi-KR merge order, decreasing-is-good, percent,
 *          empty), 404 no-leak, summary trend arrays, share KR trends.
 * Author(s): John Reed
 */

import type { OutgoingHttpHeaders } from 'node:http';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';

let app: FastifyInstance;
let cookie: string;
let cycleId: string;

function cookieOf(res: { headers: OutgoingHttpHeaders }): string {
  const raw = res.headers['set-cookie'];
  const header = Array.isArray(raw) ? raw[0] : raw;
  return String(header).split(';')[0] ?? '';
}

async function makeObjective(title: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/objectives',
    payload: { title, cycleId },
    headers: { cookie },
  });
  return res.json<{ id: string }>().id;
}

async function makeKr(
  objectiveId: string,
  body: Record<string, unknown>,
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: `/objectives/${objectiveId}/key-results`,
    payload: body,
    headers: { cookie },
  });
  return res.json<{ id: string }>().id;
}

async function checkIn(krId: string, value: number): Promise<void> {
  await app.inject({
    method: 'POST',
    url: `/key-results/${krId}/check-ins`,
    payload: { value, confidence: 'green' },
    headers: { cookie },
  });
}

beforeAll(async () => {
  app = await buildApp({ dbPath: ':memory:', sessionSecret: 'test-secret-at-least-32-chars-long!!' });
  await app.ready();
  cookie = cookieOf(
    await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email: 'h@x.com', password: 'correct-horse-battery', displayName: 'h' },
    }),
  );
  cycleId = (
    await app.inject({ method: 'POST', url: '/cycles', payload: { name: '2026-Q3' }, headers: { cookie } })
  ).json<{ id: string }>().id;
});

afterAll(async () => {
  await app.close();
});

describe('GET /objectives/:id/history', () => {
  it('empty objective → empty series', async () => {
    const objId = await makeObjective('Empty');
    const res = await app.inject({ method: 'GET', url: `/objectives/${objId}/history`, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ points: [], perKr: [] });
  });

  it('single increasing KR: one point per check-in, scores step up', async () => {
    const objId = await makeObjective('Grow');
    const krId = await makeKr(objId, { title: 'Users 0→100', type: 'numeric', baseline: 0, target: 100 });
    await checkIn(krId, 25);
    await checkIn(krId, 50);
    await checkIn(krId, 100);

    const body = (
      await app.inject({ method: 'GET', url: `/objectives/${objId}/history`, headers: { cookie } })
    ).json<{ points: { score: number }[]; perKr: { points: { value: number; score: number }[] }[] }>();

    expect(body.points.map((p) => p.score)).toEqual([0.25, 0.5, 1]);
    expect(body.perKr[0]?.points.map((p) => p.value)).toEqual([25, 50, 100]);
  });

  it('decreasing-is-good numeric scores correctly over time', async () => {
    const objId = await makeObjective('Shrink churn');
    const krId = await makeKr(objId, { title: 'Churn 5→2', type: 'numeric', baseline: 5, target: 2 });
    await checkIn(krId, 4);
    await checkIn(krId, 2);

    const body = (
      await app.inject({ method: 'GET', url: `/objectives/${objId}/history`, headers: { cookie } })
    ).json<{ points: { score: number }[] }>();
    expect(body.points.map((p) => p.score)).toEqual([0.33, 1]);
  });

  it('multi-KR: unchecked KR starts at baseline value; mean reflects both', async () => {
    const objId = await makeObjective('Two fronts');
    const a = await makeKr(objId, { title: 'A 0→10', type: 'numeric', baseline: 0, target: 10 });
    await makeKr(objId, { title: 'B percent', type: 'percent', baseline: 0, target: 100 });
    // only A checks in: B contributes 0 → objective = mean(A, 0)
    await checkIn(a, 10);

    const body = (
      await app.inject({ method: 'GET', url: `/objectives/${objId}/history`, headers: { cookie } })
    ).json<{ points: { score: number }[]; perKr: { title: string; points: unknown[] }[] }>();
    expect(body.points.map((p) => p.score)).toEqual([0.5]);
    // B appears in perKr with an empty series
    expect(body.perKr).toHaveLength(2);
    expect(body.perKr.find((k) => k.title === 'B percent')?.points).toHaveLength(0);
  });

  it("404s another user's personal objective (no-leak)", async () => {
    const objId = await makeObjective('Private');
    const other = cookieOf(
      await app.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: { email: 'h2@x.com', password: 'correct-horse-battery', displayName: 'h2' },
      }),
    );
    const res = await app.inject({
      method: 'GET',
      url: `/objectives/${objId}/history`,
      headers: { cookie: other },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('inline trend arrays', () => {
  it('cycle summary objectives carry last-12 score trends', async () => {
    const objId = await makeObjective('Trended');
    const krId = await makeKr(objId, { title: 'N 0→10', type: 'numeric', baseline: 0, target: 10 });
    for (let v = 1; v <= 14; v += 1) await checkIn(krId, v > 10 ? 10 : v);

    const summary = (
      await app.inject({ method: 'GET', url: `/cycles/${cycleId}/summary`, headers: { cookie } })
    ).json<{ objectives: { title: string; trend: number[] }[] }>();
    const mine = summary.objectives.find((o) => o.title === 'Trended');
    expect(mine?.trend).toHaveLength(12); // capped at 12
    expect(mine?.trend.at(-1)).toBe(1); // ends at the current score
  });

  it('public share KRs carry value trends, values only', async () => {
    // team + share token + team objective with check-ins
    const teamId = (
      await app.inject({ method: 'POST', url: '/teams', payload: { name: 'Sharers' }, headers: { cookie } })
    ).json<{ id: string }>().id;
    const objId = (
      await app.inject({
        method: 'POST',
        url: '/objectives',
        payload: { title: 'Shared obj', cycleId, teamId },
        headers: { cookie },
      })
    ).json<{ id: string }>().id;
    const krId = await makeKr(objId, { title: 'S 0→4', type: 'numeric', baseline: 0, target: 4 });
    await checkIn(krId, 1);
    await checkIn(krId, 3);

    const token = (
      await app.inject({ method: 'PUT', url: `/teams/${teamId}/share`, headers: { cookie } })
    ).json<{ token: string }>().token;

    const pub = (
      await app.inject({ method: 'GET', url: `/public/${token}/summary` })
    ).json<{ cycles: { objectives: { keyResults: { trend: number[] }[] }[] }[] }>();
    const kr = pub.cycles[0]?.objectives[0]?.keyResults[0];
    expect(kr?.trend).toEqual([1, 3]);
  });
});
