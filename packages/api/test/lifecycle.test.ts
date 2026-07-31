/**
 * Purpose: Cycle close + rollover tests — skip rules, fresh baselines,
 *          link-drop reporting, visibility scoping, source archiving,
 *          conflict/404 paths.
 * Author(s): John Reed
 */

import type { OutgoingHttpHeaders } from 'node:http';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';

let app: FastifyInstance;
let cookie: string;
let q3: string;
let q4: string;

function cookieOf(res: { headers: OutgoingHttpHeaders }): string {
  const raw = res.headers['set-cookie'];
  const header = Array.isArray(raw) ? raw[0] : raw;
  return String(header).split(';')[0] ?? '';
}

async function signup(email: string): Promise<string> {
  return cookieOf(
    await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email, password: 'correct-horse-battery', displayName: email.split('@')[0] },
    }),
  );
}

async function makeCycle(name: string): Promise<string> {
  const payload = /^\d{4}-Q[1-4]$/.test(name)
    ? { name }
    : { name, startsOn: '2026-07-01', endsOn: '2026-09-30' };
  const res = await app.inject({ method: 'POST', url: '/cycles', payload, headers: { cookie } });
  return res.json<{ id: string }>().id;
}

async function makeObjective(title: string, cycleId: string, c = cookie): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/objectives',
    payload: { title, cycleId },
    headers: { cookie: c },
  });
  return res.json<{ id: string }>().id;
}

async function makeKr(objectiveId: string, body: Record<string, unknown>): Promise<string> {
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
    payload: { value, confidence: 'yellow' },
    headers: { cookie },
  });
}

async function objectivesIn(cycleId: string, c = cookie): Promise<{ title: string; keyResults: { title: string; baseline: number; target: number; currentValue: number; currentConfidence: string | null }[] }[]> {
  const res = await app.inject({ method: 'GET', url: `/objectives?cycleId=${cycleId}`, headers: { cookie: c } });
  return res.json();
}

beforeAll(async () => {
  app = await buildApp({ dbPath: ':memory:', sessionSecret: 'test-secret-at-least-32-chars-long!!' });
  await app.ready();
  cookie = await signup('roll@x.com');
  q3 = await makeCycle('2026-Q3');
  q4 = await makeCycle('2026-Q4');
});

afterAll(async () => {
  await app.close();
});

describe('cycle close', () => {
  it('closes an open cycle; double-close 409s; unknown 404s', async () => {
    const c = await makeCycle('close-me');
    const first = await app.inject({ method: 'POST', url: `/cycles/${c}/close`, headers: { cookie } });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ id: c, status: 'closed' });

    const again = await app.inject({ method: 'POST', url: `/cycles/${c}/close`, headers: { cookie } });
    expect(again.statusCode).toBe(409);

    const missing = await app.inject({ method: 'POST', url: '/cycles/nope/close', headers: { cookie } });
    expect(missing.statusCode).toBe(404);
  });
});

describe('rollover', () => {
  it('carries unfinished work with fresh baselines; done + archived stay behind', async () => {
    // unfinished objective: numeric mid-flight + percent + a done KR
    const carryId = await makeObjective('Carry me', q3);
    const numeric = await makeKr(carryId, { title: 'Users 0→100', type: 'numeric', baseline: 0, target: 100 });
    await checkIn(numeric, 40);
    await makeKr(carryId, { title: 'Rollout percent', type: 'percent', baseline: 0, target: 100 });
    const done = await makeKr(carryId, { title: 'Done 0→10', type: 'numeric', baseline: 0, target: 10 });
    await checkIn(done, 10);

    // finished objective: single KR at target — skipped entirely
    const doneObjId = await makeObjective('Finished', q3);
    const doneKr = await makeKr(doneObjId, { title: 'All done 0→5', type: 'numeric', baseline: 0, target: 5 });
    await checkIn(doneKr, 5);

    // archived objective — skipped
    const archivedId = await makeObjective('Archived', q3);
    await app.inject({ method: 'POST', url: `/objectives/${archivedId}/archive`, headers: { cookie } });

    const res = await app.inject({
      method: 'POST',
      url: `/cycles/${q3}/rollover`,
      payload: { targetCycleId: q4 },
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ clonedObjectives: number; clonedKeyResults: number; skippedObjectives: number; skippedKeyResults: number; hadLinks: unknown[] }>();
    expect(body.clonedObjectives).toBe(1);
    expect(body.clonedKeyResults).toBe(2); // numeric mid-flight + percent
    expect(body.skippedObjectives).toBe(1); // Finished
    expect(body.skippedKeyResults).toBe(1); // the done KR inside Carry me
    expect(body.hadLinks).toEqual([]);

    // the clone starts fresh: numeric baseline = old currentValue, confidence null
    const inQ4 = await objectivesIn(q4);
    const clone = inQ4.find((o) => o.title === 'Carry me');
    expect(clone).toBeDefined();
    const clonedNumeric = clone?.keyResults.find((k) => k.title === 'Users 0→100');
    expect(clonedNumeric).toMatchObject({ baseline: 40, target: 100, currentValue: 40, currentConfidence: null });
    const clonedPercent = clone?.keyResults.find((k) => k.title === 'Rollout percent');
    expect(clonedPercent).toMatchObject({ baseline: 0, target: 100, currentValue: 0 });
    expect(clone?.keyResults).toHaveLength(2);

    // source objectives archived (default), source cycle closed
    const q3Left = await objectivesIn(q3);
    expect(q3Left.find((o) => o.title === 'Carry me')).toBeUndefined(); // archived out of default list
    const cycle = (
      await app.inject({ method: 'GET', url: `/cycles/${q3}`, headers: { cookie } })
    ).json<{ status: string }>();
    expect(cycle.status).toBe('closed');
  });

  it("does not touch other users' objectives", async () => {
    const other = await signup('other@x.com');
    const src = await makeCycle('src-priv');
    const dst = await makeCycle('dst-priv');
    await makeObjective('Mine alone', src, other);

    const res = await app.inject({
      method: 'POST',
      url: `/cycles/${src}/rollover`,
      payload: { targetCycleId: dst },
      headers: { cookie }, // the FIRST user rolls over — sees nothing in src
    });
    expect(res.json<{ clonedObjectives: number }>().clonedObjectives).toBe(0);
    // the other user's objective is untouched, unarchived, still in src
    const still = await objectivesIn(src, other);
    expect(still.find((o) => o.title === 'Mine alone')).toBeDefined();
  });

  it('rejects closed or same-cycle targets and unknown cycles', async () => {
    const src = await makeCycle('src-t');
    const closed = await makeCycle('closed-t');
    await app.inject({ method: 'POST', url: `/cycles/${closed}/close`, headers: { cookie } });

    const sameRes = await app.inject({
      method: 'POST',
      url: `/cycles/${src}/rollover`,
      payload: { targetCycleId: src },
      headers: { cookie },
    });
    expect(sameRes.statusCode).toBe(409);

    const closedRes = await app.inject({
      method: 'POST',
      url: `/cycles/${src}/rollover`,
      payload: { targetCycleId: closed },
      headers: { cookie },
    });
    expect(closedRes.statusCode).toBe(409);

    const missing = await app.inject({
      method: 'POST',
      url: `/cycles/${src}/rollover`,
      payload: { targetCycleId: 'nope' },
      headers: { cookie },
    });
    expect(missing.statusCode).toBe(404);
  });

  it('reports KRs that had connector links without carrying them', async () => {
    const src = await makeCycle('src-links');
    const dst = await makeCycle('dst-links');
    const objId = await makeObjective('Linked work', src);
    const krId = await makeKr(objId, { title: 'Issues 0→20', type: 'numeric', baseline: 0, target: 20 });
    await checkIn(krId, 5);

    // plant a connector link row directly — adapter validation is not under test
    const { metricLinks } = await import('../src/db/schema.js');
    app.db
      .insert(metricLinks)
      .values({
        id: crypto.randomUUID(),
        keyResultId: krId,
        kpiId: null,
        provider: 'github',
        config: JSON.stringify({ owner: 'o', repo: 'r', milestone: 1 }),
        mode: 'count-closed',
        secretCiphertext: 'irrelevant-ciphertext',
        syncDueAt: new Date(),
        createdAt: new Date(),
      })
      .run();

    const res = await app.inject({
      method: 'POST',
      url: `/cycles/${src}/rollover`,
      payload: { targetCycleId: dst },
      headers: { cookie },
    });
    const body = res.json<{ hadLinks: { title: string }[]; clonedKeyResults: number }>();
    expect(body.hadLinks).toEqual([{ title: 'Issues 0→20' }]);
    expect(body.clonedKeyResults).toBe(1);
  });

  it('boolean KRs reset to not-done on rollover', async () => {
    const src = await makeCycle('src-bool');
    const dst = await makeCycle('dst-bool');
    const objId = await makeObjective('Gate work', src);
    // one done boolean (stays), one pending numeric (carries) — the
    // objective is unfinished so it rolls
    const gate = await makeKr(objId, { title: 'Cert passed', type: 'boolean', baseline: 0, target: 1 });
    await checkIn(gate, 1);
    const num = await makeKr(objId, { title: 'N 0→10', type: 'numeric', baseline: 0, target: 10 });
    await checkIn(num, 3);
    const pendingGate = await makeKr(objId, { title: 'Audit passed', type: 'boolean', baseline: 0, target: 1 });
    void pendingGate;

    const res = await app.inject({
      method: 'POST',
      url: `/cycles/${src}/rollover`,
      payload: { targetCycleId: dst },
      headers: { cookie },
    });
    const body = res.json<{ clonedKeyResults: number; skippedKeyResults: number }>();
    expect(body.clonedKeyResults).toBe(2); // numeric + pending boolean
    expect(body.skippedKeyResults).toBe(1); // the done boolean stays

    const clone = (await objectivesIn(dst)).find((o) => o.title === 'Gate work');
    const clonedBool = clone?.keyResults.find((k) => k.title === 'Audit passed');
    expect(clonedBool).toMatchObject({ baseline: 0, target: 1, currentValue: 0, currentConfidence: null });
  });

  it('archiveSource: false leaves source objectives active', async () => {
    const src = await makeCycle('src-keep');
    const dst = await makeCycle('dst-keep');
    await makeObjective('Keep me', src);

    await app.inject({
      method: 'POST',
      url: `/cycles/${src}/rollover`,
      payload: { targetCycleId: dst, archiveSource: false },
      headers: { cookie },
    });
    const still = await objectivesIn(src);
    expect(still.find((o) => o.title === 'Keep me')).toBeDefined();
  });
});
