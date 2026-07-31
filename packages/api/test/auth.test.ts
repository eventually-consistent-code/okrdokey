/**
 * Purpose: Auth integration tests — the whole signup → login → me → logout
 *          story against the real app on in-memory SQLite, plus the
 *          default-deny hook, uniform credential errors, CSRF origin check,
 *          and the OpenAPI security scheme.
 * Author(s): John Reed
 */

import type { OutgoingHttpHeaders } from 'node:http';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';

let app: FastifyInstance;

// pulls "sessionId=..." out of a set-cookie header for replay
function cookieOf(res: { headers: OutgoingHttpHeaders }): string {
  const raw = res.headers['set-cookie'];
  const header = Array.isArray(raw) ? raw[0] : raw;
  return String(header).split(';')[0] ?? '';
}

const jane = { email: 'jane@example.com', password: 'correct-horse-battery', displayName: 'Jane' };

// each auth call gets its own client IP — login/signup share a 5/min
// rate bucket per IP and this file makes 8 such calls against one app
let ipCounter = 0;
function xff(): Record<string, string> {
  ipCounter += 1;
  return { 'x-forwarded-for': `10.99.0.${ipCounter}` };
}

beforeAll(async () => {
  app = await buildApp({
    dbPath: ':memory:',
    sessionSecret: 'test-secret-at-least-32-chars-long!!',
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('default-deny hook', () => {
  it('401s protected routes without a session', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('leaves public routes open', async () => {
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/docs' })).statusCode).toBe(200);
  });
});

describe('signup → login → me → logout', () => {
  it('signs up and starts a session', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/signup', payload: jane, headers: xff() });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ email: jane.email, displayName: 'Jane' });
    expect(cookieOf(res)).toMatch(/^sessionId=/);
  });

  it('rejects duplicate signup', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/signup', payload: jane, headers: xff() });
    expect(res.statusCode).toBe(409);
  });

  it('logs in and serves /auth/me', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: jane.email, password: jane.password },
      headers: xff(),
    });
    expect(login.statusCode).toBe(200);

    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: cookieOf(login) },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ email: jane.email });
  });

  it('logout kills the session server-side', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: jane.email, password: jane.password },
      headers: xff(),
    });
    const cookie = cookieOf(login);

    const out = await app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie } });
    expect(out.statusCode).toBe(204);

    // same cookie must be dead now — server-side revocation, not client forget
    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(401);
  });

  it('answers bad password and unknown email identically', async () => {
    const badPass = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: jane.email, password: 'wrong-password-entirely' },
      headers: xff(),
    });
    const noUser = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'ghost@example.com', password: 'wrong-password-entirely' },
      headers: xff(),
    });
    expect(badPass.statusCode).toBe(401);
    expect(noUser.statusCode).toBe(401);
    expect(badPass.json()).toEqual(noUser.json());
  });
});

describe('CSRF origin check', () => {
  it('rejects cross-site writes', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: jane.email, password: jane.password },
      headers: { origin: 'https://evil.example.com', host: 'localhost:3000', ...xff() },
    });
    expect(res.statusCode).toBe(403);
  });

  it('allows same-origin writes', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: jane.email, password: jane.password },
      headers: { origin: 'http://localhost:3000', host: 'localhost:3000', ...xff() },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('OpenAPI security', () => {
  it('declares cookieAuth and marks protected routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs/json' });
    const spec = res.json<{
      components: { securitySchemes: Record<string, unknown> };
      paths: Record<string, { get?: { security?: unknown[] } }>;
    }>();
    expect(spec.components.securitySchemes).toHaveProperty('cookieAuth');
    expect(spec.paths['/auth/me']?.get?.security).toEqual([{ cookieAuth: [] }]);
  });
});
