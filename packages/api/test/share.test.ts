/**
 * Purpose: Share-link tests — admin-only lifecycle, rotation killing old
 *          links, and the public payload's no-leak field set.
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
let member: string;
let teamId: string;
let token: string;

beforeAll(async () => {
  app = await buildApp({ dbPath: ':memory:', sessionSecret: 'test-secret-at-least-32-chars-long!!' });
  await app.ready();

  const a = await app.inject({
    method: 'POST',
    url: '/auth/signup',
    payload: { email: 'admin@example.com', password: 'correct-horse-battery', displayName: 'Admin' },
  });
  admin = cookieOf(a);
  const m = await app.inject({
    method: 'POST',
    url: '/auth/signup',
    payload: { email: 'member@example.com', password: 'correct-horse-battery', displayName: 'Member' },
  });
  member = cookieOf(m);

  const team = await app.inject({
    method: 'POST',
    url: '/teams',
    payload: { name: 'Platform' },
    headers: { cookie: admin },
  });
  teamId = team.json<{ id: string }>().id;
  await app.inject({
    method: 'POST',
    url: `/teams/${teamId}/members`,
    payload: { email: 'member@example.com', role: 'member' },
    headers: { cookie: admin },
  });

  const cycle = await app.inject({
    method: 'POST',
    url: '/cycles',
    payload: { name: '2026-Q3' },
    headers: { cookie: admin },
  });
  const cycleId = cycle.json<{ id: string }>().id;
  const obj = await app.inject({
    method: 'POST',
    url: '/objectives',
    payload: { title: 'Ship the beta', cycleId, teamId },
    headers: { cookie: admin },
  });
  const objectiveId = obj.json<{ id: string }>().id;
  const kr = await app.inject({
    method: 'POST',
    url: `/objectives/${objectiveId}/key-results`,
    payload: { title: 'Signups 0 → 100', type: 'numeric', baseline: 0, target: 100 },
    headers: { cookie: admin },
  });
  await app.inject({
    method: 'POST',
    url: `/key-results/${kr.json<{ id: string }>().id}/check-ins`,
    payload: { value: 40, confidence: 'green', note: 'SECRET INTERNAL NOTE' },
    headers: { cookie: admin },
  });
});

afterAll(async () => {
  await app.close();
});

describe('share lifecycle', () => {
  it('member cannot enable sharing (404)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/teams/${teamId}/share`,
      headers: { cookie: member },
    });
    expect(res.statusCode).toBe(404);
  });

  it('admin enables sharing and gets a token', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/teams/${teamId}/share`,
      headers: { cookie: admin },
    });
    expect(res.statusCode).toBe(200);
    token = res.json<{ token: string }>().token;
    expect(token.length).toBeGreaterThanOrEqual(20);
  });

  it('public summary needs no session and is never cached', async () => {
    const res = await app.inject({ method: 'GET', url: `/public/${token}/summary` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.json()).toMatchObject({ teamName: 'Platform' });
  });

  it('payload carries scores but leaks no notes, emails, or ids', async () => {
    const res = await app.inject({ method: 'GET', url: `/public/${token}/summary` });
    const body = res.body;
    expect(body).toContain('Ship the beta');
    expect(body).toContain('Signups 0 → 100');
    expect(body).not.toContain('SECRET INTERNAL NOTE');
    expect(body).not.toContain('@example.com');
    expect(body).not.toContain(teamId);
    const kr = res.json<{
      cycles: { objectives: { score: number; keyResults: { score: number }[] }[] }[];
    }>().cycles[0]?.objectives[0];
    expect(kr?.score).toBe(0.4);
  });

  it('rotation kills the old link', async () => {
    const rotated = await app.inject({
      method: 'PUT',
      url: `/teams/${teamId}/share`,
      headers: { cookie: admin },
    });
    const fresh = rotated.json<{ token: string }>().token;
    expect(fresh).not.toBe(token);

    expect((await app.inject({ method: 'GET', url: `/public/${token}/summary` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/public/${fresh}/summary` })).statusCode).toBe(200);
    token = fresh;
  });

  it('disable kills everything', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/teams/${teamId}/share`,
      headers: { cookie: admin },
    });
    expect(res.statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/public/${token}/summary` })).statusCode).toBe(404);
  });

  it('garbage tokens 404', async () => {
    expect(
      (await app.inject({ method: 'GET', url: '/public/not-a-real-token/summary' })).statusCode,
    ).toBe(404);
  });
});
