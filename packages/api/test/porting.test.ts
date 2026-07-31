/**
 * Purpose: Import/export tests — CSV escape/parse unit coverage, JSON
 *          export visibility, dry-run writes nothing, bad rows abort the
 *          whole import, non-member team errors, and the export→import
 *          round-trip.
 * Author(s): John Reed
 */

import type { OutgoingHttpHeaders } from 'node:http';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { parseCsv, toCsv } from '../src/lib/csv.js';

const HEADER =
  'objective_title,objective_description,team_name,cycle_name,kr_title,kr_type,kr_unit,kr_baseline,kr_target';
const COLS = HEADER.split(',');

describe('csv lib', () => {
  it('escapes commas, quotes, and emits RFC 4180', () => {
    const out = toCsv(['a', 'b'], [['plain', 'has,comma'], ['say "hi"', null]]);
    expect(out).toBe('a,b\nplain,"has,comma"\n"say ""hi""",\n');
  });

  it('parses quoted fields and reports malformed lines', () => {
    const { records, errors } = parseCsv('a,b\n"x,y",2\n"unterminated,3\nok,4\n', ['a', 'b']);
    expect(records.map((r) => r.fields)).toEqual([
      { a: 'x,y', b: '2' },
      { a: 'ok', b: '4' },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.line).toBe(3);
  });

  it('rejects a wrong header outright', () => {
    const { records, errors } = parseCsv('wrong,header\n1,2\n', ['a', 'b']);
    expect(records).toHaveLength(0);
    expect(errors[0]?.message).toMatch(/header must be exactly/);
  });
});

let app: FastifyInstance;
let cookie: string;

function cookieOf(res: { headers: OutgoingHttpHeaders }): string {
  const raw = res.headers['set-cookie'];
  const header = Array.isArray(raw) ? raw[0] : raw;
  return String(header).split(';')[0] ?? '';
}

beforeAll(async () => {
  app = await buildApp({ dbPath: ':memory:', sessionSecret: 'test-secret-at-least-32-chars-long!!' });
  await app.ready();
  cookie = cookieOf(
    await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email: 'port@x.com', password: 'correct-horse-battery', displayName: 'port' },
    }),
  );
  await app.inject({ method: 'POST', url: '/cycles', payload: { name: '2026-Q3' }, headers: { cookie } });
  await app.inject({ method: 'POST', url: '/cycles', payload: { name: '2026-Q4' }, headers: { cookie } });
});

afterAll(async () => {
  await app.close();
});

async function countObjectives(): Promise<number> {
  const res = await app.inject({ method: 'GET', url: '/objectives', headers: { cookie } });
  return res.json<unknown[]>().length;
}

describe('import', () => {
  it('dry-run previews and writes nothing', async () => {
    const csv = `${HEADER}\nGrow revenue,Our north star,,2026-Q3,MRR 10→50,numeric,k$,10,50\nGrow revenue,Our north star,,2026-Q3,"Churn, down",numeric,%,5,2\nShip v2,,,2026-Q3,,,,,\n`;
    const before = await countObjectives();
    const res = await app.inject({
      method: 'POST',
      url: '/import/objectives?dryRun=true',
      payload: { csv },
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ dryRun: boolean; creates: { objectives: number; keyResults: number }; errors: unknown[] }>();
    expect(body.dryRun).toBe(true);
    expect(body.creates).toEqual({ objectives: 2, keyResults: 2 });
    expect(body.errors).toHaveLength(0);
    expect(await countObjectives()).toBe(before);
  });

  it('commits a clean import: groups rows, quoted commas survive', async () => {
    const csv = `${HEADER}\nGrow revenue,Our north star,,2026-Q3,MRR 10→50,numeric,k$,10,50\nGrow revenue,Our north star,,2026-Q3,"Churn, down",numeric,%,5,2\n`;
    const res = await app.inject({
      method: 'POST',
      url: '/import/objectives',
      payload: { csv },
      headers: { cookie },
    });
    expect(res.json<{ creates: { objectives: number } }>().creates.objectives).toBe(1);

    const objs = (
      await app.inject({ method: 'GET', url: '/objectives', headers: { cookie } })
    ).json<{ title: string; keyResults: { title: string }[] }[]>();
    const mine = objs.find((o) => o.title === 'Grow revenue');
    expect(mine?.keyResults.map((k) => k.title).sort()).toEqual(['Churn, down', 'MRR 10→50']);
  });

  it('commits an objective row with empty KR columns', async () => {
    const csv = `${HEADER}\nBare objective,,,2026-Q4,,,,,\n`;
    const res = await app.inject({
      method: 'POST',
      url: '/import/objectives',
      payload: { csv },
      headers: { cookie },
    });
    expect(res.json<{ creates: { objectives: number; keyResults: number } }>().creates).toEqual({
      objectives: 1,
      keyResults: 0,
    });
    const objs = (
      await app.inject({ method: 'GET', url: '/objectives', headers: { cookie } })
    ).json<{ title: string; keyResults: unknown[] }[]>();
    const bare = objs.find((o) => o.title === 'Bare objective');
    expect(bare?.keyResults).toHaveLength(0);
  });

  it('any bad row aborts the whole import', async () => {
    const csv = `${HEADER}\nGood objective,,,2026-Q3,Fine 0→10,numeric,,0,10\nBad objective,,,2026-Q3,Broken,numeric,,5,5\n`;
    const before = await countObjectives();
    const res = await app.inject({
      method: 'POST',
      url: '/import/objectives',
      payload: { csv },
      headers: { cookie },
    });
    const body = res.json<{ errors: { message: string }[] }>();
    expect(body.errors[0]?.message).toMatch(/real gap/);
    expect(await countObjectives()).toBe(before); // nothing written, including the good row
  });

  it('unknown cycle and non-member team error per row', async () => {
    const csv = `${HEADER}\nA,,,2099-Q9,,,,,\nB,,Ghost Team,2026-Q3,,,,,\n`;
    const res = await app.inject({
      method: 'POST',
      url: '/import/objectives?dryRun=true',
      payload: { csv },
      headers: { cookie },
    });
    const body = res.json<{ errors: { message: string }[] }>();
    expect(body.errors.map((e) => e.message).join(' ')).toMatch(/unknown cycle/);
    expect(body.errors.map((e) => e.message).join(' ')).toMatch(/not a member of team/);
  });
});

describe('export', () => {
  it('JSON export carries objectives, KRs, check-in history', async () => {
    // add a check-in to the imported KR
    const objs = (
      await app.inject({ method: 'GET', url: '/objectives', headers: { cookie } })
    ).json<{ title: string; keyResults: { id: string; title: string }[] }[]>();
    const kr = objs.find((o) => o.title === 'Grow revenue')?.keyResults[0];
    await app.inject({
      method: 'POST',
      url: `/key-results/${kr?.id}/check-ins`,
      payload: { value: 20, confidence: 'green', note: 'moving' },
      headers: { cookie },
    });

    const res = await app.inject({ method: 'GET', url: '/export', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ cycles: unknown[]; objectives: { title: string; keyResults: { checkIns: { value: number }[] }[] }[] }>();
    expect(body.cycles.length).toBeGreaterThanOrEqual(2);
    const grow = body.objectives.find((o) => o.title === 'Grow revenue');
    const checkedIn = grow?.keyResults.flatMap((k) => k.checkIns).find((c) => c.value === 20);
    expect(checkedIn).toBeDefined();
  });

  it('CSV export round-trips through import into another cycle', async () => {
    const csvRes = await app.inject({ method: 'GET', url: '/export.csv', headers: { cookie } });
    expect(csvRes.statusCode).toBe(200);
    expect(csvRes.headers['content-type']).toContain('text/csv');
    const exported = csvRes.body;
    expect(exported.startsWith(HEADER)).toBe(true);

    // retarget every row at Q4 and import — round-trip by construction
    const retargeted = exported
      .split('\n')
      .map((line, i) => (i === 0 ? line : line.replace(',2026-Q3,', ',2026-Q4,')))
      .join('\n');
    const res = await app.inject({
      method: 'POST',
      url: '/import/objectives',
      payload: { csv: retargeted },
      headers: { cookie },
    });
    const body = res.json<{ creates: { objectives: number; keyResults: number }; errors: unknown[] }>();
    expect(body.errors).toHaveLength(0);
    expect(body.creates.objectives).toBeGreaterThanOrEqual(1);

    const q4Objs = (
      await app.inject({ method: 'GET', url: '/objectives', headers: { cookie } })
    ).json<{ title: string }[]>();
    expect(q4Objs.filter((o) => o.title === 'Grow revenue').length).toBe(2); // original + round-trip
  });
});

describe('csv parse restriction sanity', () => {
  it('columns constant matches the documented header', () => {
    expect(COLS).toHaveLength(9);
  });
});
