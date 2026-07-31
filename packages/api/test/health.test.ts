/**
 * Purpose: API integration tests — build the real app against an in-memory
 *          SQLite db (migrations included) and drive it with
 *          fastify.inject(); no sockets, no mocks.
 * Author(s): John Reed
 */

import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({ dbPath: ':memory:' });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('GET /health', () => {
  it('returns ok with a version', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', version: expect.any(String) as string, email: false });
  });
});

describe('OpenAPI spec', () => {
  it('documents /health from the Zod schema', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs/json' });
    expect(res.statusCode).toBe(200);
    const spec = res.json<{ paths: Record<string, unknown> }>();
    expect(Object.keys(spec.paths)).toContain('/health');
  });
});

describe('migration bootstrap', () => {
  it('created the meta table', () => {
    const rows = app.db.all(sql`SELECT name FROM sqlite_master WHERE type='table' AND name='meta'`);
    expect(rows).toHaveLength(1);
  });
});

describe('error shape', () => {
  it('404s in the shared error format', async () => {
    const res = await app.inject({ method: 'GET', url: '/no-such-route' });
    expect(res.statusCode).toBe(404);
    const body = res.json<{ statusCode: number; error: string; message: string }>();
    expect(body.statusCode).toBe(404);
    expect(typeof body.message).toBe('string');
  });
});
