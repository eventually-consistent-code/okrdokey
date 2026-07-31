/**
 * Purpose: Email stack tests — SMTP config matrix, mailer delivery +
 *          dead-letter bookkeeping, digest content, digest tick
 *          watermarks, reminder email branch, schedule CRUD + test-send
 *          auth, and the health feature flag.
 * Author(s): John Reed
 */

import type { OutgoingHttpHeaders } from 'node:http';

import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { runDigestTick, buildDigest } from '../src/cadence/digest.js';
import { runTick } from '../src/cadence/engine.js';
import { buildJsonMailer, sendEmail, type Mailer } from '../src/cadence/mailer.js';
import { loadConfig } from '../src/config.js';
import { digestSchedules, emailDeliveries, reminders } from '../src/db/schema.js';

const noSleep = (): Promise<void> => Promise.resolve();

describe('smtp config matrix', () => {
  const base = { NODE_ENV: 'test', SESSION_SECRET: 'x'.repeat(40) };

  it('absent → undefined; partial → throw; full → shaped', () => {
    expect(loadConfig({ ...base }).smtp).toBeUndefined();
    expect(() => loadConfig({ ...base, SMTP_HOST: 'mail.local' })).toThrow(/partial/);
    expect(() => loadConfig({ ...base, SMTP_HOST: 'mail.local', SMTP_FROM: 'okr@x', SMTP_USER: 'u' })).toThrow(/auth is partial/);
    expect(
      loadConfig({ ...base, SMTP_HOST: 'mail.local', SMTP_FROM: 'okr@x', SMTP_PORT: '2525' }).smtp,
    ).toEqual({ host: 'mail.local', from: 'okr@x', port: 2525, secure: false, auth: undefined });
  });
});

// capture sent messages through nodemailer's jsonTransport
function capturingMailer(): { mailer: Mailer; sent: { to: string; subject: string; text: string }[] } {
  const sent: { to: string; subject: string; text: string }[] = [];
  const json = buildJsonMailer();
  const mailer: Mailer = {
    from: json.from,
    transport: {
      sendMail: async (opts: { to: string; subject: string; text: string }) => {
        sent.push({ to: opts.to, subject: opts.subject, text: opts.text });
        await json.transport.sendMail({ ...opts, from: json.from });
      },
    } as unknown as Mailer['transport'],
  };
  return { mailer, sent };
}

function failingMailer(): Mailer {
  return {
    from: 'test@okrdokey.local',
    transport: {
      sendMail: () => Promise.reject(new Error('connection refused')),
    } as unknown as Mailer['transport'],
  };
}

let app: FastifyInstance;
let admin: string;
let member: string;
let teamId: string;

function cookieOf(res: { headers: OutgoingHttpHeaders }): string {
  const raw = res.headers['set-cookie'];
  const header = Array.isArray(raw) ? raw[0] : raw;
  return String(header).split(';')[0] ?? '';
}

beforeAll(async () => {
  const cap = capturingMailer();
  app = await buildApp({
    dbPath: ':memory:',
    sessionSecret: 'test-secret-at-least-32-chars-long!!',
    mailer: cap.mailer,
  });
  // expose capture list to tests
  (app as unknown as { __sent: typeof cap.sent }).__sent = cap.sent;
  await app.ready();

  const mk = async (email: string): Promise<string> =>
    cookieOf(
      await app.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: { email, password: 'correct-horse-battery', displayName: email.split('@')[0] },
      }),
    );
  admin = await mk('boss@x.com');
  member = await mk('crew@x.com');
  teamId = (
    await app.inject({ method: 'POST', url: '/teams', payload: { name: 'Mailers' }, headers: { cookie: admin } })
  ).json<{ id: string }>().id;
  await app.inject({
    method: 'POST',
    url: `/teams/${teamId}/members`,
    payload: { email: 'crew@x.com', role: 'member' },
    headers: { cookie: admin },
  });

  const cycleId = (
    await app.inject({ method: 'POST', url: '/cycles', payload: { name: '2026-Q3' }, headers: { cookie: admin } })
  ).json<{ id: string }>().id;
  const objId = (
    await app.inject({
      method: 'POST',
      url: '/objectives',
      payload: { title: 'Grow the fleet', cycleId, teamId },
      headers: { cookie: admin },
    })
  ).json<{ id: string }>().id;
  const krId = (
    await app.inject({
      method: 'POST',
      url: `/objectives/${objId}/key-results`,
      payload: { title: 'Ships 2→10', type: 'numeric', baseline: 2, target: 10 },
      headers: { cookie: admin },
    })
  ).json<{ id: string }>().id;
  await app.inject({
    method: 'POST',
    url: `/key-results/${krId}/check-ins`,
    payload: { value: 6, confidence: 'green' },
    headers: { cookie: admin },
  });
});

afterAll(async () => {
  await app.close();
});

function sentList(): { to: string; subject: string; text: string }[] {
  return (app as unknown as { __sent: { to: string; subject: string; text: string }[] }).__sent;
}

describe('health flag', () => {
  it('reports email: true when a mailer is present', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.json<{ email: boolean }>().email).toBe(true);
  });

  it('reports email: false without SMTP, and digest routes 404', async () => {
    const dark = await buildApp({ dbPath: ':memory:', sessionSecret: 'test-secret-at-least-32-chars-long!!' });
    await dark.ready();
    expect((await dark.inject({ method: 'GET', url: '/health' })).json<{ email: boolean }>().email).toBe(false);
    const c = cookieOf(
      await dark.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: { email: 'd@x.com', password: 'correct-horse-battery', displayName: 'd' },
      }),
    );
    const res = await dark.inject({ method: 'GET', url: '/teams/whatever/digest', headers: { cookie: c } });
    expect(res.statusCode).toBe(404);
    await dark.close();
  });
});

describe('mailer', () => {
  it('books a delivered send', async () => {
    const ok = await sendEmail(app, (app as { mailer: Mailer | null }).mailer as Mailer, {
      kind: 'test',
      sourceId: 'unit',
      to: ['a@x.com'],
      subject: 's',
      text: 't',
      html: '<p>t</p>',
    });
    expect(ok).toBe(true);
    const row = app.db.select().from(emailDeliveries).where(eq(emailDeliveries.sourceId, 'unit')).get();
    expect(row?.deliveredAt).not.toBeNull();
    expect(row?.attempts).toBe(1);
  });

  it('dead-letters after 3 attempts', async () => {
    const ok = await sendEmail(app, failingMailer(), {
      kind: 'test',
      sourceId: 'unit-fail',
      to: ['a@x.com'],
      subject: 's',
      text: 't',
      html: '<p>t</p>',
    }, noSleep);
    expect(ok).toBe(false);
    const row = app.db.select().from(emailDeliveries).where(eq(emailDeliveries.sourceId, 'unit-fail')).get();
    expect(row?.attempts).toBe(3);
    expect(row?.deliveryFailedAt).not.toBeNull();
    expect(row?.lastError).toMatch(/connection refused/);
  });
});

describe('digest content', () => {
  it('carries roll-up, objectives, and this-week checkers; machine check-ins excluded', () => {
    const content = buildDigest(app, teamId, new Date());
    expect(content).not.toBeNull();
    expect(content?.recipients.sort()).toEqual(['boss@x.com', 'crew@x.com']);
    expect(content?.text).toContain('Grow the fleet');
    expect(content?.text).toContain('0.50'); // (6-2)/(10-2)
    expect(content?.text).toContain('boss'); // checked in this week
    expect(content?.subject).toContain('Mailers');
  });
});

describe('digest schedule CRUD + tick', () => {
  it('member cannot set the schedule (404); admin can; bad cron 400s', async () => {
    const memberTry = await app.inject({
      method: 'PUT',
      url: `/teams/${teamId}/digest`,
      payload: { cronExpr: '0 9 * * 1', timezone: 'UTC' },
      headers: { cookie: member },
    });
    expect(memberTry.statusCode).toBe(404);

    const bad = await app.inject({
      method: 'PUT',
      url: `/teams/${teamId}/digest`,
      payload: { cronExpr: 'not a cron', timezone: 'UTC' },
      headers: { cookie: admin },
    });
    expect(bad.statusCode).toBe(400);

    const ok = await app.inject({
      method: 'PUT',
      url: `/teams/${teamId}/digest`,
      payload: { cronExpr: '0 9 * * 1', timezone: 'UTC' },
      headers: { cookie: admin },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json<{ nextDueAt: string }>().nextDueAt).toBeTruthy();
  });

  it('due schedule sends to the roster and advances the watermark', async () => {
    const before = sentList().length;
    // force due now
    app.db
      .update(digestSchedules)
      .set({ nextDueAt: new Date(Date.now() - 60_000) })
      .where(eq(digestSchedules.teamId, teamId))
      .run();
    const mailer = (app as { mailer: Mailer | null }).mailer as Mailer;
    await runDigestTick(app, mailer, new Date());

    const delivered = sentList().slice(before);
    expect(delivered.map((s) => s.to).sort()).toEqual(['boss@x.com', 'crew@x.com']);
    expect(delivered[0]?.subject).toContain('Mailers');

    const row = app.db.select().from(digestSchedules).where(eq(digestSchedules.teamId, teamId)).get();
    expect(row && row.nextDueAt.getTime()).toBeGreaterThan(Date.now());

    // not due again — nothing new sends
    const count = sentList().length;
    await runDigestTick(app, mailer, new Date());
    expect(sentList().length).toBe(count);
  });

  it('test-send goes to the caller only', async () => {
    const before = sentList().length;
    const res = await app.inject({
      method: 'POST',
      url: `/teams/${teamId}/digest/test`,
      headers: { cookie: admin },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ sent: true });
    const delivered = sentList().slice(before);
    expect(delivered.map((s) => s.to)).toEqual(['boss@x.com']);

    const memberTry = await app.inject({
      method: 'POST',
      url: `/teams/${teamId}/digest/test`,
      headers: { cookie: member },
    });
    expect(memberTry.statusCode).toBe(404);
  });
});

describe('reminder email branch', () => {
  it('email-enabled reminder mails the roster on tick', async () => {
    await app.inject({
      method: 'PUT',
      url: '/reminders',
      payload: { teamId, cronExpr: '0 9 * * 1', timezone: 'UTC', emailEnabled: true },
      headers: { cookie: admin },
    });
    app.db.update(reminders).set({ nextDueAt: new Date(Date.now() - 60_000) }).where(eq(reminders.teamId, teamId)).run();

    const before = sentList().length;
    const mailer = (app as { mailer: Mailer | null }).mailer as Mailer;
    await runTick(app, new Date(), { mailer, sleep: noSleep });

    const delivered = sentList().slice(before);
    expect(delivered.map((s) => s.to).sort()).toEqual(['boss@x.com', 'crew@x.com']);
    expect(delivered[0]?.subject).toMatch(/check-in time/);
  });
});
