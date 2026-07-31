/**
 * Purpose: KPI integration tests — lifecycle, computed health transitions,
 *          role matrix, token push, and connector sync writing readings.
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
let member: string;
let outsider: string;
let teamId: string;
let kpiId: string;
let token: string;

beforeAll(async () => {
  app = await buildApp({ dbPath: ':memory:', sessionSecret: SECRET });
  await app.ready();

  const mk = async (email: string, name: string): Promise<string> =>
    cookieOf(
      await app.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: { email, password: 'correct-horse-battery', displayName: name },
      }),
    );
  admin = await mk('kadmin@example.com', 'KA');
  member = await mk('kmember@example.com', 'KM');
  outsider = await mk('kout@example.com', 'KO');

  teamId = (
    await app.inject({ method: 'POST', url: '/teams', payload: { name: 'SRE' }, headers: { cookie: admin } })
  ).json<{ id: string }>().id;
  await app.inject({
    method: 'POST',
    url: `/teams/${teamId}/members`,
    payload: { email: 'kmember@example.com', role: 'member' },
    headers: { cookie: admin },
  });
  token = (
    await app.inject({
      method: 'POST',
      url: `/teams/${teamId}/tokens`,
      payload: { name: 'metrics-pusher' },
      headers: { cookie: admin },
    })
  ).json<{ token: string }>().token;
});

afterAll(async () => {
  await app.close();
});

describe('KPI lifecycle + roles', () => {
  it('admin creates a KPI (uptime >= 99.9)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/teams/${teamId}/kpis`,
      payload: { name: 'Uptime', unit: '%', direction: 'gte', thresholdLow: 99.9 },
      headers: { cookie: admin },
    });
    expect(res.statusCode).toBe(201);
    kpiId = res.json<{ id: string }>().id;
    expect(res.json()).toMatchObject({ currentHealth: null, currentValue: 0 });
  });

  it('member cannot create; outsider cannot even list (404)', async () => {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/teams/${teamId}/kpis`,
          payload: { name: 'X', direction: 'gte', thresholdLow: 1 },
          headers: { cookie: member },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: `/teams/${teamId}/kpis`, headers: { cookie: outsider } }))
        .statusCode,
    ).toBe(404);
  });

  it('range thresholds validated (low < high)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/teams/${teamId}/kpis`,
      payload: { name: 'Latency', direction: 'range', thresholdLow: 300, thresholdHigh: 100 },
      headers: { cookie: admin },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('readings + computed health', () => {
  it('member records a reading; health computes healthy', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/kpis/${kpiId}/readings`,
      payload: { value: 99.95, note: 'all quiet' },
      headers: { cookie: member },
    });
    expect(res.statusCode).toBe(201);
    const list = await app.inject({ method: 'GET', url: `/teams/${teamId}/kpis`, headers: { cookie: member } });
    expect(list.json<{ currentHealth: string; currentValue: number }[]>()[0]).toMatchObject({
      currentValue: 99.95,
      currentHealth: 'healthy',
    });
  });

  it('health flips warning then breach as value degrades', async () => {
    await app.inject({
      method: 'POST',
      url: `/kpis/${kpiId}/readings`,
      payload: { value: 92 },
      headers: { cookie: member },
    });
    let list = await app.inject({ method: 'GET', url: `/teams/${teamId}/kpis`, headers: { cookie: member } });
    expect(list.json<{ currentHealth: string }[]>()[0]?.currentHealth).toBe('warning');

    await app.inject({
      method: 'POST',
      url: `/kpis/${kpiId}/readings`,
      payload: { value: 80 },
      headers: { cookie: member },
    });
    list = await app.inject({ method: 'GET', url: `/teams/${teamId}/kpis`, headers: { cookie: member } });
    expect(list.json<{ currentHealth: string }[]>()[0]?.currentHealth).toBe('breach');
  });

  it('token push writes a source=api reading', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/kpis/${kpiId}/readings`,
      payload: { value: 99.99 },
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ source: 'api', authorUserId: null });

    const history = await app.inject({
      method: 'GET',
      url: `/kpis/${kpiId}/readings`,
      headers: { cookie: member },
    });
    const rows = history.json<{ source: string; value: number }[]>();
    expect(rows[0]).toMatchObject({ source: 'api', value: 99.99 });
    expect(rows).toHaveLength(4);
  });
});

describe('KPI connector link + sync', () => {
  let countKpiId: string;

  it('admin links a KPI with mode count; KR modes rejected', async () => {
    countKpiId = (
      await app.inject({
        method: 'POST',
        url: `/teams/${teamId}/kpis`,
        payload: { name: 'Open bugs', direction: 'lte', thresholdHigh: 10 },
        headers: { cookie: admin },
      })
    ).json<{ id: string }>().id;

    const bad = await app.inject({
      method: 'PUT',
      url: `/kpis/${countKpiId}/link`,
      payload: {
        provider: 'github',
        config: { repo: 'octo/repo', label: 'bug' },
        mode: 'percent-closed',
        secret: 'ghp_x',
      },
      headers: { cookie: admin },
    });
    expect(bad.statusCode).toBe(400);

    const ok = await app.inject({
      method: 'PUT',
      url: `/kpis/${countKpiId}/link`,
      payload: {
        provider: 'github',
        config: { repo: 'octo/repo', label: 'bug' },
        mode: 'count',
        secret: 'ghp_x',
      },
      headers: { cookie: admin },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ kpiId: countKpiId, keyResultId: null, mode: 'count' });
  });

  it('sync writes a source-marked reading and recomputes health', async () => {
    app.db.update(metricLinks).set({ syncDueAt: new Date(0) }).where(eq(metricLinks.kpiId, countKpiId)).run();
    const adapter = vi.fn(async (): Promise<LinkProgress> => Promise.resolve({ done: 14, total: 20 }));
    await runSync(app, new Date(), { adapters: { github: adapter }, sessionSecret: SECRET });

    const history = await app.inject({
      method: 'GET',
      url: `/kpis/${countKpiId}/readings`,
      headers: { cookie: member },
    });
    expect(history.json<{ value: number; source: string }[]>()[0]).toMatchObject({
      value: 14,
      source: 'github',
    });

    // 14 open bugs vs lte 10 → outside the 10% band (11) → breach
    const list = await app.inject({ method: 'GET', url: `/teams/${teamId}/kpis`, headers: { cookie: member } });
    const kpi = list.json<{ id: string; currentHealth: string }[]>().find((k) => k.id === countKpiId);
    expect(kpi?.currentHealth).toBe('breach');
  });

  it('archive hides from default list', async () => {
    await app.inject({ method: 'POST', url: `/kpis/${countKpiId}/archive`, headers: { cookie: admin } });
    const list = await app.inject({ method: 'GET', url: `/teams/${teamId}/kpis`, headers: { cookie: member } });
    expect(list.json<{ id: string }[]>().map((k) => k.id)).not.toContain(countKpiId);
  });
});
