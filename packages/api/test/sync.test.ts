/**
 * Purpose: Sync engine tests with a fake adapter — link CRUD, mapping modes,
 *          source-marked check-ins, no-op skip, backoff on failure, 304 path.
 * Author(s): John Reed
 */

import type { OutgoingHttpHeaders } from 'node:http';

import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import { runSync } from '../src/connectors/sync.js';
import type { LinkProgress } from '../src/connectors/types.js';
import { metricLinks } from '../src/db/schema.js';

const SECRET = 'test-secret-at-least-32-chars-long!!';

let app: FastifyInstance;

function cookieOf(res: { headers: OutgoingHttpHeaders }): string {
  const raw = res.headers['set-cookie'];
  const header = Array.isArray(raw) ? raw[0] : raw;
  return String(header).split(';')[0] ?? '';
}

let admin: string;
let percentKrId: string;
let countKrId: string;

async function makeKr(title: string, type: 'percent' | 'numeric', cookie: string): Promise<string> {
  const teamId = (
    await app.inject({ method: 'POST', url: '/teams', payload: { name: `T-${title}` }, headers: { cookie } })
  ).json<{ id: string }>().id;
  const cycleId = (
    await app.inject({ method: 'POST', url: '/cycles', payload: { name: `C-${title}`, startsOn: '2026-07-01', endsOn: '2026-09-30' }, headers: { cookie } })
  ).json<{ id: string }>().id;
  const objectiveId = (
    await app.inject({
      method: 'POST',
      url: '/objectives',
      payload: { title, cycleId, teamId },
      headers: { cookie },
    })
  ).json<{ id: string }>().id;
  return (
    await app.inject({
      method: 'POST',
      url: `/objectives/${objectiveId}/key-results`,
      payload:
        type === 'percent'
          ? { title: `${title} KR`, type: 'percent', baseline: 0, target: 100 }
          : { title: `${title} KR`, type: 'numeric', baseline: 0, target: 200 },
      headers: { cookie },
    })
  ).json<{ id: string }>().id;
}

async function link(krId: string, mode: 'percent-closed' | 'count-closed'): Promise<void> {
  const res = await app.inject({
    method: 'PUT',
    url: `/key-results/${krId}/link`,
    payload: {
      provider: 'github',
      config: { repo: 'octo/repo', milestoneNumber: 1 },
      mode,
      secret: 'ghp_fake',
    },
    headers: { cookie: admin },
  });
  expect(res.statusCode).toBe(200);
}

beforeAll(async () => {
  app = await buildApp({ dbPath: ':memory:', sessionSecret: SECRET });
  await app.ready();
  const a = await app.inject({
    method: 'POST',
    url: '/auth/signup',
    payload: { email: 'sync@example.com', password: 'correct-horse-battery', displayName: 'S' },
  });
  admin = cookieOf(a);
  percentKrId = await makeKr('Percent', 'percent', admin);
  countKrId = await makeKr('Count', 'numeric', admin);
  await link(percentKrId, 'percent-closed');
  await link(countKrId, 'count-closed');
});

afterAll(async () => {
  await app.close();
});

describe('sync engine', () => {
  it('maps percent-closed and count-closed and writes source-marked check-ins', async () => {
    const adapter = vi.fn(async (): Promise<LinkProgress> => Promise.resolve({ done: 3, total: 4 }));
    await runSync(app, new Date(), { adapters: { github: adapter }, sessionSecret: SECRET });
    expect(adapter).toHaveBeenCalledTimes(2);

    const percentHistory = await app.inject({
      method: 'GET',
      url: `/key-results/${percentKrId}/check-ins`,
      headers: { cookie: admin },
    });
    expect(percentHistory.json<{ value: number; source: string }[]>()[0]).toMatchObject({
      value: 75,
      source: 'github',
    });

    const countHistory = await app.inject({
      method: 'GET',
      url: `/key-results/${countKrId}/check-ins`,
      headers: { cookie: admin },
    });
    expect(countHistory.json<{ value: number }[]>()[0]).toMatchObject({ value: 3 });
  });

  it('no-op sync writes no new history; watermark still advances', async () => {
    const before = (
      await app.inject({ method: 'GET', url: `/key-results/${percentKrId}/check-ins`, headers: { cookie: admin } })
    ).json<unknown[]>().length;

    // force due again
    app.db.update(metricLinks).set({ syncDueAt: new Date(0) }).run();
    const adapter = vi.fn(async (): Promise<LinkProgress> => Promise.resolve({ done: 3, total: 4 }));
    await runSync(app, new Date(), { adapters: { github: adapter }, sessionSecret: SECRET });

    const after = (
      await app.inject({ method: 'GET', url: `/key-results/${percentKrId}/check-ins`, headers: { cookie: admin } })
    ).json<unknown[]>().length;
    expect(after).toBe(before);

    const row = app.db.select().from(metricLinks).where(eq(metricLinks.keyResultId, percentKrId)).get();
    expect(row?.syncDueAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('notModified (304) skips the write, keeps the etag fresh', async () => {
    app.db.update(metricLinks).set({ syncDueAt: new Date(0) }).run();
    const adapter = vi.fn(
      async (): Promise<LinkProgress> => Promise.resolve({ done: 0, total: 0, notModified: true, etag: 'W/"abc"' }),
    );
    await runSync(app, new Date(), { adapters: { github: adapter }, sessionSecret: SECRET });
    const row = app.db.select().from(metricLinks).where(eq(metricLinks.keyResultId, percentKrId)).get();
    expect(row?.etag).toBe('W/"abc"');
    expect(row?.lastError).toBeNull();
  });

  it('failure records last_error and backs off exponentially', async () => {
    app.db.update(metricLinks).set({ syncDueAt: new Date(0) }).run();
    const boom = vi.fn(async (): Promise<LinkProgress> => Promise.reject(new Error('GitHub says no')));
    const now = new Date();
    await runSync(app, now, { adapters: { github: boom }, sessionSecret: SECRET });

    const row = app.db.select().from(metricLinks).where(eq(metricLinks.keyResultId, percentKrId)).get();
    expect(row?.lastError).toBe('GitHub says no');
    expect(row?.consecutiveFailures).toBe(1);
    // first failure: interval × 2 (SQLite timestamps round to seconds)
    const expected = now.getTime() + row!.syncIntervalMinutes * 60_000 * 2;
    expect(Math.abs((row?.syncDueAt.getTime() ?? 0) - expected)).toBeLessThan(1500);

    // link API surfaces the health
    const linkRes = await app.inject({
      method: 'GET',
      url: `/key-results/${percentKrId}/link`,
      headers: { cookie: admin },
    });
    expect(linkRes.json()).toMatchObject({ lastError: 'GitHub says no', consecutiveFailures: 1 });
  });

  it('secrets round-trip encrypted — ciphertext in db, plaintext to adapter', async () => {
    const row = app.db.select().from(metricLinks).where(eq(metricLinks.keyResultId, countKrId)).get();
    expect(row?.secretCiphertext).not.toContain('ghp_fake');

    app.db.update(metricLinks).set({ syncDueAt: new Date(0) }).where(eq(metricLinks.keyResultId, countKrId)).run();
    let seenSecret = '';
    const adapter = vi.fn(async (input: { secret: string }): Promise<LinkProgress> => {
      seenSecret = input.secret;
      return Promise.resolve({ done: 3, total: 4 });
    });
    await runSync(app, new Date(), { adapters: { github: adapter }, sessionSecret: SECRET });
    expect(seenSecret).toBe('ghp_fake');
  });
});
