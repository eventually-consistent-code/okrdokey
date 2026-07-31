/**
 * Purpose: Rate-limit tests — login/signup share a 5/min per-IP bucket,
 *          /public throttles at 60/min, and everything else stays
 *          unlimited (global: false actually holds).
 * Author(s): John Reed
 */

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';

let app: FastifyInstance;

const IP_A = { 'x-forwarded-for': '10.77.0.1' };
const IP_B = { 'x-forwarded-for': '10.77.0.2' };

beforeAll(async () => {
  app = await buildApp({ dbPath: ':memory:', sessionSecret: 'test-secret-at-least-32-chars-long!!' });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('auth rate limits (5/min per IP, per route)', () => {
  it('6th login from one IP gets 429; signup and other IPs unaffected', async () => {
    for (let i = 0; i < 5; i += 1) {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'ghost@example.com', password: 'wrong-password-entirely' },
        headers: IP_A,
      });
      expect(res.statusCode).toBe(401);
    }

    const blocked = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'ghost@example.com', password: 'wrong-password-entirely' },
      headers: IP_A,
    });
    expect(blocked.statusCode).toBe(429);

    // signup keeps its own bucket — still open from the same IP
    const signup = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email: 'rl-0@example.com', password: 'correct-horse-battery', displayName: 'rl' },
      headers: IP_A,
    });
    expect(signup.statusCode).toBe(201);

    const other = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'ghost@example.com', password: 'wrong-password-entirely' },
      headers: IP_B,
    });
    expect(other.statusCode).toBe(401);
  });

  it('signup throttles independently at 6', async () => {
    const ip = { 'x-forwarded-for': '10.77.0.3' };
    let last = 0;
    for (let i = 0; i < 6; i += 1) {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: { email: `rl-s-${i}@example.com`, password: 'correct-horse-battery', displayName: 'rl' },
        headers: ip,
      });
      last = res.statusCode;
    }
    expect(last).toBe(429);
  });
});

describe('public share rate limit (60/min per IP)', () => {
  it('61st hit throttles; misses count too (brute-force surface)', async () => {
    let last = 0;
    for (let i = 0; i < 61; i += 1) {
      const res = await app.inject({
        method: 'GET',
        url: '/public/not-a-real-token/summary',
        headers: IP_B,
      });
      last = res.statusCode;
    }
    expect(last).toBe(429);
  });
});

describe('global: false holds', () => {
  it('unlimited routes take more than 5 rapid hits from one IP', async () => {
    for (let i = 0; i < 10; i += 1) {
      const res = await app.inject({ method: 'GET', url: '/health', headers: IP_A });
      expect(res.statusCode).toBe(200);
    }
  });
});
