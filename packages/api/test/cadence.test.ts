/**
 * Purpose: Cadence engine tests — watermark math (due/not-due/missed-window
 *          collapse), webhook delivery against a real local receiver, the
 *          retry → dead-letter path, disabled skip, and the reminder config
 *          access matrix.
 * Author(s): John Reed
 */

import type { OutgoingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';

import { eq } from 'drizzle-orm';
import Fastify, { type FastifyInstance } from 'fastify';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { runTick } from '../src/cadence/engine.js';
import { reminders, webhookDeliveries } from '../src/db/schema.js';

let app: FastifyInstance;
let receiver: FastifyInstance;
let receiverUrl: string;

// The local webhook receiver — flips between 200 and 500 per test
let receiverStatus = 200;
const received: { text: string }[] = [];

const noSleep = async (): Promise<void> => {};

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

// Watermark surgery — tests move next_due_at around instead of waiting
function setWatermark(reminderId: string, when: Date): void {
  app.db.update(reminders).set({ nextDueAt: when }).where(eq(reminders.id, reminderId)).run();
}

function reminderRow(reminderId: string): typeof reminders.$inferSelect {
  const row = app.db.select().from(reminders).where(eq(reminders.id, reminderId)).get();
  if (!row) throw new Error('reminder vanished');
  return row;
}

function deliveriesFor(reminderId: string): (typeof webhookDeliveries.$inferSelect)[] {
  return app.db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.reminderId, reminderId))
    .all();
}

let alice: string; // team admin
let bob: string; // team member
let mallory: string; // outsider
let teamId: string;

beforeAll(async () => {
  app = await buildApp({ dbPath: ':memory:', sessionSecret: 'test-secret-at-least-32-chars-long!!' });
  await app.ready();

  receiver = Fastify({ logger: false });
  receiver.post('/hook', (req, reply) => {
    received.push(req.body as { text: string });
    return reply.status(receiverStatus).send({});
  });
  await receiver.listen({ port: 0, host: '127.0.0.1' });
  const addr = receiver.server.address() as AddressInfo;
  receiverUrl = `http://127.0.0.1:${addr.port}/hook`;

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

  // A little scope so the nudge counts something real: one team objective,
  // two KRs
  const cycle = await app.inject({
    method: 'POST',
    url: '/cycles',
    payload: { name: '2026-Q3' },
    headers: { cookie: alice },
  });
  const cycleId = cycle.json<{ id: string }>().id;
  const obj = await app.inject({
    method: 'POST',
    url: '/objectives',
    payload: { title: 'Ship the beta', cycleId, teamId },
    headers: { cookie: alice },
  });
  const objId = obj.json<{ id: string }>().id;
  for (const title of ['Signups', 'Uptime']) {
    await app.inject({
      method: 'POST',
      url: `/objectives/${objId}/key-results`,
      payload: { title, type: 'numeric', baseline: 0, target: 100 },
      headers: { cookie: alice },
    });
  }
});

afterAll(async () => {
  await app.close();
  await receiver.close();
});

describe('reminder config routes', () => {
  it('team admin upserts a team reminder; PUT again replaces, not duplicates', async () => {
    const first = await app.inject({
      method: 'PUT',
      url: '/reminders',
      payload: { teamId, cronExpr: '0 9 * * 1', timezone: 'UTC' },
      headers: { cookie: alice },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ teamId, userId: null, enabled: true });

    const second = await app.inject({
      method: 'PUT',
      url: '/reminders',
      payload: { teamId, cronExpr: '0 10 * * 2', timezone: 'America/New_York' },
      headers: { cookie: alice },
    });
    expect(second.json<{ id: string }>().id).toBe(first.json<{ id: string }>().id);
    expect(second.json()).toMatchObject({ cronExpr: '0 10 * * 2', timezone: 'America/New_York' });

    const list = await app.inject({ method: 'GET', url: '/reminders', headers: { cookie: alice } });
    expect(list.json<unknown[]>()).toHaveLength(1);
  });

  it('member (non-admin) gets 403 for team scope; outsider gets 404', async () => {
    const asBob = await app.inject({
      method: 'PUT',
      url: '/reminders',
      payload: { teamId, cronExpr: '0 9 * * 1' },
      headers: { cookie: bob },
    });
    expect(asBob.statusCode).toBe(403);

    const asMallory = await app.inject({
      method: 'PUT',
      url: '/reminders',
      payload: { teamId, cronExpr: '0 9 * * 1' },
      headers: { cookie: mallory },
    });
    expect(asMallory.statusCode).toBe(404);
  });

  it('personal reminder needs no team; only mine shows in my list', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/reminders',
      payload: { cronExpr: '0 17 * * 5', timezone: 'UTC' },
      headers: { cookie: bob },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ teamId: null });

    // Bob is a member, not an admin — his list is just his personal reminder
    const list = await app.inject({ method: 'GET', url: '/reminders', headers: { cookie: bob } });
    const rows = list.json<{ teamId: string | null }[]>();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.teamId).toBeNull();
  });

  it('bad cron or bad timezone → 400', async () => {
    for (const payload of [
      { cronExpr: 'not a cron' },
      { cronExpr: '0 9 * * 1', timezone: 'Mars/Olympus_Mons' },
    ]) {
      const res = await app.inject({
        method: 'PUT',
        url: '/reminders',
        payload,
        headers: { cookie: alice },
      });
      expect(res.statusCode).toBe(400);
    }
  });

  it('delete: member 403 on team reminder, outsider 404, admin 204', async () => {
    const list = await app.inject({ method: 'GET', url: '/reminders', headers: { cookie: alice } });
    const teamReminderId = list.json<{ id: string; teamId: string | null }[]>()
      .find((row) => row.teamId === teamId)?.id;
    expect(teamReminderId).toBeDefined();

    expect(
      (await app.inject({ method: 'DELETE', url: `/reminders/${teamReminderId}`, headers: { cookie: bob } }))
        .statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ method: 'DELETE', url: `/reminders/${teamReminderId}`, headers: { cookie: mallory } }))
        .statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'DELETE', url: `/reminders/${teamReminderId}`, headers: { cookie: alice } }))
        .statusCode,
    ).toBe(204);
  });

  it('config routes 401 without a session', async () => {
    for (const [method, url] of [
      ['PUT', '/reminders'],
      ['GET', '/reminders'],
      ['DELETE', '/reminders/x'],
    ] as const) {
      expect((await app.inject({ method, url })).statusCode).toBe(401);
    }
  });
});

describe('cadence engine — watermark math + delivery', () => {
  let reminderId: string;

  beforeAll(async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/reminders',
      payload: { teamId, cronExpr: '0 9 * * 1', timezone: 'UTC', webhookUrl: receiverUrl },
      headers: { cookie: alice },
    });
    reminderId = res.json<{ id: string }>().id;
  });

  it('not due → nothing fires', async () => {
    receiverStatus = 200;
    received.length = 0;
    setWatermark(reminderId, new Date('2026-08-10T09:00:00Z'));

    await runTick(app, new Date('2026-08-09T09:00:00Z'), { sleep: noSleep });
    expect(received).toHaveLength(0);
    expect(deliveriesFor(reminderId)).toHaveLength(0);
  });

  it('due → fires once, delivers, advances to next occurrence after now', async () => {
    receiverStatus = 200;
    received.length = 0;
    // Monday 2026-08-10 09:00 UTC came and went; tick runs at 09:03
    setWatermark(reminderId, new Date('2026-08-10T09:00:00Z'));
    const now = new Date('2026-08-10T09:03:00Z');

    await runTick(app, now, { sleep: noSleep });

    expect(received).toHaveLength(1);
    expect(received[0]?.text).toBe('OKRdokey: check-in time — 2 key results awaiting update');

    const rows = deliveriesFor(reminderId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ attempts: 1, deliveryFailedAt: null, lastError: null });
    expect(rows[0]?.deliveredAt).not.toBeNull();

    // Next Monday 09:00 UTC — strictly after now
    expect(reminderRow(reminderId).nextDueAt.toISOString()).toBe('2026-08-17T09:00:00.000Z');
  });

  it('missed windows collapse to a single firing', async () => {
    receiverStatus = 200;
    received.length = 0;
    // Server slept through three Mondays; watermark still points at the first
    setWatermark(reminderId, new Date('2026-08-10T09:00:00Z'));
    const now = new Date('2026-08-25T12:00:00Z'); // a Tuesday, 3 Mondays later

    await runTick(app, now, { sleep: noSleep });

    expect(received).toHaveLength(1); // one catch-up nudge, not three
    expect(reminderRow(reminderId).nextDueAt.toISOString()).toBe('2026-08-31T09:00:00.000Z');
  });

  it('receiver 500s → 3 attempts, then dead-letter with evidence', async () => {
    receiverStatus = 500;
    received.length = 0;
    setWatermark(reminderId, new Date('2026-08-31T09:00:00Z'));

    await runTick(app, new Date('2026-08-31T09:01:00Z'), { sleep: noSleep });

    expect(received).toHaveLength(3); // every attempt reached the receiver
    const dead = deliveriesFor(reminderId).find((row) => row.deliveryFailedAt !== null);
    expect(dead).toMatchObject({ attempts: 3, deliveredAt: null, lastError: 'HTTP 500' });

    // Watermark still advances — a dead webhook must not wedge the schedule
    expect(reminderRow(reminderId).nextDueAt.toISOString()).toBe('2026-09-07T09:00:00.000Z');
  });

  it('disabled reminders are skipped even when due', async () => {
    receiverStatus = 200;
    received.length = 0;
    setWatermark(reminderId, new Date('2026-09-07T09:00:00Z'));
    app.db.update(reminders).set({ enabled: false }).where(eq(reminders.id, reminderId)).run();

    await runTick(app, new Date('2026-09-07T10:00:00Z'), { sleep: noSleep });
    expect(received).toHaveLength(0);
    // Watermark untouched — re-enabling picks up where it left off
    expect(reminderRow(reminderId).nextDueAt.toISOString()).toBe('2026-09-07T09:00:00.000Z');

    app.db.update(reminders).set({ enabled: true }).where(eq(reminders.id, reminderId)).run();
  });

  it('reminder without a webhook just advances (no delivery row)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/reminders',
      payload: { cronExpr: '0 8 * * *', timezone: 'UTC' }, // personal, no webhookUrl
      headers: { cookie: alice },
    });
    const personalId = res.json<{ id: string }>().id;
    setWatermark(personalId, new Date('2026-08-10T08:00:00Z'));

    await runTick(app, new Date('2026-08-10T08:30:00Z'), { sleep: noSleep });

    expect(deliveriesFor(personalId)).toHaveLength(0);
    expect(reminderRow(personalId).nextDueAt.toISOString()).toBe('2026-08-11T08:00:00.000Z');
  });
});
