/**
 * Purpose: Teams integration tests — the full role matrix against the real app
 *          on in-memory SQLite. Creator is admin, members can't manage the
 *          roster, non-members see 404 (not 403), leaving works, and the last
 *          admin can never be demoted or removed.
 * Author(s): John Reed
 */

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';

let app: FastifyInstance;

// pulls "sessionId=..." out of a set-cookie header for replay
function cookieOf(res: { headers: Record<string, number | string | string[] | undefined> }): string {
  const raw = res.headers['set-cookie'];
  const header = Array.isArray(raw) ? raw[0] : raw;
  return String(header).split(';')[0] ?? '';
}

const jane = { email: 'jane@example.com', password: 'correct-horse-battery', displayName: 'Jane' };
const bob = { email: 'bob@example.com', password: 'hunter2-but-longer!', displayName: 'Bob' };
const mallory = { email: 'mallory@example.com', password: 'sneaky-outsider-pw', displayName: 'Mallory' };

let janeCookie = '';
let bobCookie = '';
let malloryCookie = '';
let teamId = '';
let janeId = '';
let bobId = '';

beforeAll(async () => {
  app = await buildApp({ dbPath: ':memory:', sessionSecret: 'test-secret-at-least-32-chars-long!!' });
  await app.ready();

  // three accounts: creator, member-to-be, and an outsider
  for (const [person, setCookie] of [
    [jane, (c: string, id: string): void => { janeCookie = c; janeId = id; }],
    [bob, (c: string, id: string): void => { bobCookie = c; bobId = id; }],
    [mallory, (c: string): void => { malloryCookie = c; }],
  ] as const) {
    const res = await app.inject({ method: 'POST', url: '/auth/signup', payload: person });
    setCookie(cookieOf(res), res.json<{ id: string }>().id);
  }
});

afterAll(async () => {
  await app.close();
});

describe('auth required', () => {
  it('401s every team route without a session', async () => {
    expect((await app.inject({ method: 'POST', url: '/teams', payload: { name: 'X' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/teams' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/teams/whatever' })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'POST', url: '/teams/whatever/members', payload: { email: bob.email } }))
        .statusCode,
    ).toBe(401);
    expect(
      (await app.inject({ method: 'PATCH', url: '/teams/whatever/members/nobody', payload: { role: 'admin' } }))
        .statusCode,
    ).toBe(401);
    expect(
      (await app.inject({ method: 'DELETE', url: '/teams/whatever/members/nobody' })).statusCode,
    ).toBe(401);
  });
});

describe('create + list', () => {
  it('creates a team with the creator as admin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/teams',
      payload: { name: 'Growth' },
      headers: { cookie: janeCookie },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ id: string; name: string; role: string }>();
    expect(body).toMatchObject({ name: 'Growth', role: 'admin' });
    teamId = body.id;
  });

  it('lists my teams with my role', async () => {
    const res = await app.inject({ method: 'GET', url: '/teams', headers: { cookie: janeCookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([expect.objectContaining({ id: teamId, name: 'Growth', role: 'admin' })]);
  });

  it('lists nothing for a non-member', async () => {
    const res = await app.inject({ method: 'GET', url: '/teams', headers: { cookie: malloryCookie } });
    expect(res.json()).toEqual([]);
  });
});

describe('membership management', () => {
  it('404s "no such user" when adding an unknown email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/teams/${teamId}/members`,
      payload: { email: 'ghost@example.com' },
      headers: { cookie: janeCookie },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ message: 'no such user' });
  });

  it('admin adds a member (role defaults to member)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/teams/${teamId}/members`,
      payload: { email: bob.email },
      headers: { cookie: janeCookie },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ userId: bobId, email: bob.email, role: 'member' });
  });

  it('409s adding someone twice', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/teams/${teamId}/members`,
      payload: { email: bob.email },
      headers: { cookie: janeCookie },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe('team detail', () => {
  it('serves detail with the member list to members', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/teams/${teamId}`,
      headers: { cookie: bobCookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ role: string; members: { userId: string; role: string }[] }>();
    expect(body.role).toBe('member');
    expect(body.members).toHaveLength(2);
    expect(body.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: janeId, role: 'admin' }),
        expect.objectContaining({ userId: bobId, role: 'member' }),
      ]),
    );
  });

  it('404s (not 403) for a non-member — team existence stays private', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/teams/${teamId}`,
      headers: { cookie: malloryCookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it('404s for a team that does not exist', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/teams/no-such-team',
      headers: { cookie: janeCookie },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('role matrix — member cannot manage the roster', () => {
  it('member cannot add members', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/teams/${teamId}/members`,
      payload: { email: mallory.email },
      headers: { cookie: bobCookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it('member cannot change roles', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/teams/${teamId}/members/${janeId}`,
      payload: { role: 'member' },
      headers: { cookie: bobCookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it('member cannot remove someone else', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/teams/${teamId}/members/${janeId}`,
      headers: { cookie: bobCookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it('non-member gets 404 on roster routes, not 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/teams/${teamId}/members`,
      payload: { email: mallory.email },
      headers: { cookie: malloryCookie },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('last-admin protection', () => {
  it('409s demoting the last admin', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/teams/${teamId}/members/${janeId}`,
      payload: { role: 'member' },
      headers: { cookie: janeCookie },
    });
    expect(res.statusCode).toBe(409);
  });

  it('409s removing the last admin (even by herself)', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/teams/${teamId}/members/${janeId}`,
      headers: { cookie: janeCookie },
    });
    expect(res.statusCode).toBe(409);
  });

  it('admin promotes a member, then demotion of the other admin works', async () => {
    const promote = await app.inject({
      method: 'PATCH',
      url: `/teams/${teamId}/members/${bobId}`,
      payload: { role: 'admin' },
      headers: { cookie: janeCookie },
    });
    expect(promote.statusCode).toBe(200);
    expect(promote.json()).toMatchObject({ userId: bobId, role: 'admin' });

    // two admins now — demoting jane is fine
    const demote = await app.inject({
      method: 'PATCH',
      url: `/teams/${teamId}/members/${janeId}`,
      payload: { role: 'member' },
      headers: { cookie: bobCookie },
    });
    expect(demote.statusCode).toBe(200);
    expect(demote.json()).toMatchObject({ userId: janeId, role: 'member' });
  });
});

describe('leaving', () => {
  it('a member removes herself (leave)', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/teams/${teamId}/members/${janeId}`,
      headers: { cookie: janeCookie },
    });
    expect(res.statusCode).toBe(204);

    // jane is out — detail is a 404 for her now
    const detail = await app.inject({
      method: 'GET',
      url: `/teams/${teamId}`,
      headers: { cookie: janeCookie },
    });
    expect(detail.statusCode).toBe(404);
  });

  it('404s changing the role of someone who is not a member', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/teams/${teamId}/members/${janeId}`,
      payload: { role: 'admin' },
      headers: { cookie: bobCookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it('roster reflects the departure', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/teams/${teamId}`,
      headers: { cookie: bobCookie },
    });
    expect(res.json<{ members: unknown[] }>().members).toHaveLength(1);
  });
});
