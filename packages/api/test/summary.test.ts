/**
 * Purpose: Cycle summary integration tests — scores/statuses embedded in
 *          objective responses, the /cycles/:id/summary roll-ups, and
 *          visibility scoping, against the real app on in-memory SQLite.
 *
 *          KR progress is set by updating key_results.current_value directly
 *          via app.db — the check-in flow that normally denormalizes it is
 *          issue #5's work and is tested in its own suite.
 * Author(s): John Reed
 */

import type { OutgoingHttpHeaders } from 'node:http';

import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { keyResults } from '../src/db/schema.js';

let app: FastifyInstance;

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

// Create an objective and one numeric 0→100 KR; returns both ids
async function seedObjective(
  cookie: string,
  title: string,
  cycleId: string,
  teamId?: string,
): Promise<{ objectiveId: string; krId: string }> {
  const obj = await app.inject({
    method: 'POST',
    url: '/objectives',
    payload: { title, cycleId, ...(teamId ? { teamId } : {}) },
    headers: { cookie },
  });
  const objectiveId = obj.json<{ id: string }>().id;
  const kr = await app.inject({
    method: 'POST',
    url: `/objectives/${objectiveId}/key-results`,
    payload: { title: `${title} KR`, type: 'numeric', baseline: 0, target: 100 },
    headers: { cookie },
  });
  return { objectiveId, krId: kr.json<{ id: string }>().id };
}

// Bypass the check-in flow (issue #5) and set KR progress directly
function setProgress(krId: string, currentValue: number, confidence?: 'red' | 'yellow' | 'green'): void {
  app.db
    .update(keyResults)
    .set({ currentValue, ...(confidence ? { currentConfidence: confidence } : {}) })
    .where(eq(keyResults.id, krId))
    .run();
}

let alice: string; // team admin
let bob: string; // team member
let mallory: string; // outsider
let teamId: string;
let pastCycleId: string; // fully elapsed → elapsed = 1, statuses deterministic
let futureCycleId: string; // not started → elapsed = 0

// Seeded objectives (all in the past cycle unless noted)
let doneTeamObj: string; // score 1 → on-track
let riskyTeamObj: string; // score 0.8 → at-risk
let redTeamObj: string; // score 1 but red confidence → behind (cap)
let personalObj: string; // alice's, score 0 → behind
let futureObj: string; // future cycle, fresh → on-track

beforeAll(async () => {
  app = await buildApp({ dbPath: ':memory:', sessionSecret: 'test-secret-at-least-32-chars-long!!' });
  await app.ready();

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

  // A cycle entirely in the past pins elapsed at exactly 1 — status math
  // becomes deterministic without mocking the clock
  const past = await app.inject({
    method: 'POST',
    url: '/cycles',
    payload: { name: 'ancient history', startsOn: '2020-01-01', endsOn: '2020-03-31' },
    headers: { cookie: alice },
  });
  pastCycleId = past.json<{ id: string }>().id;
  const future = await app.inject({
    method: 'POST',
    url: '/cycles',
    payload: { name: 'far future', startsOn: '2099-01-01', endsOn: '2099-03-31' },
    headers: { cookie: alice },
  });
  futureCycleId = future.json<{ id: string }>().id;

  // Team objectives at known scores (elapsed 1 → delta = score − 1)
  const done = await seedObjective(alice, 'Shipped it', pastCycleId, teamId);
  doneTeamObj = done.objectiveId;
  setProgress(done.krId, 100); // score 1, delta 0 → on-track

  const risky = await seedObjective(bob, 'Almost there', pastCycleId, teamId);
  riskyTeamObj = risky.objectiveId;
  setProgress(risky.krId, 80); // score 0.8, delta −0.2 → at-risk

  const red = await seedObjective(alice, 'Numbers lie', pastCycleId, teamId);
  redTeamObj = red.objectiveId;
  setProgress(red.krId, 100, 'red'); // score 1 but red → capped to behind

  // Alice's personal objective, untouched KR → score 0 → behind
  const personal = await seedObjective(alice, 'Read more books', pastCycleId);
  personalObj = personal.objectiveId;

  // Archived objective must not appear anywhere in the summary
  const archived = await seedObjective(alice, 'Old news', pastCycleId, teamId);
  await app.inject({
    method: 'POST',
    url: `/objectives/${archived.objectiveId}/archive`,
    headers: { cookie: alice },
  });

  // Fresh objective in a future cycle: score 0, elapsed 0 → on-track
  const fresh = await seedObjective(alice, 'Not started yet', futureCycleId);
  futureObj = fresh.objectiveId;
});

afterAll(async () => {
  await app.close();
});

describe('score + status on objective responses', () => {
  it('objective GET carries score, status, and per-KR scores', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/objectives/${riskyTeamObj}`,
      headers: { cookie: alice },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ score: 0.8, status: 'at-risk' });
    expect(res.json<{ keyResults: { score: number }[] }>().keyResults[0]).toMatchObject({
      score: 0.8,
    });
  });

  it('red confidence drags a perfect score to behind', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/objectives/${redTeamObj}`,
      headers: { cookie: alice },
    });
    expect(res.json()).toMatchObject({ score: 1, status: 'behind' });
  });

  it('list responses carry them too', async () => {
    const res = await app.inject({ method: 'GET', url: '/objectives', headers: { cookie: bob } });
    const done = res.json<{ id: string; score: number; status: string }[]>().find((o) => o.id === doneTeamObj);
    expect(done).toMatchObject({ score: 1, status: 'on-track' });
  });

  it('fresh objective in a future cycle is on-track (0 expected, 0 delivered)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/objectives/${futureObj}`,
      headers: { cookie: alice },
    });
    expect(res.json()).toMatchObject({ score: 0, status: 'on-track' });
  });
});

describe('GET /cycles/:cycleId/summary', () => {
  it('404s on a cycle that does not exist', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/cycles/nope/summary',
      headers: { cookie: alice },
    });
    expect(res.statusCode).toBe(404);
  });

  it('reports the cycle, elapsed=1 for a past cycle, and every visible objective', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/cycles/${pastCycleId}/summary`,
      headers: { cookie: alice },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      cycle: { name: string };
      elapsed: number;
      objectives: { id: string; status: string; score: number }[];
    }>();
    expect(body.cycle).toMatchObject({ name: 'ancient history' });
    expect(body.elapsed).toBe(1);

    const byId = new Map(body.objectives.map((o) => [o.id, o]));
    expect(byId.get(doneTeamObj)).toMatchObject({ score: 1, status: 'on-track' });
    expect(byId.get(riskyTeamObj)).toMatchObject({ score: 0.8, status: 'at-risk' });
    expect(byId.get(redTeamObj)).toMatchObject({ score: 1, status: 'behind' });
    expect(byId.get(personalObj)).toMatchObject({ score: 0, status: 'behind' });
  });

  it('excludes archived objectives', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/cycles/${pastCycleId}/summary`,
      headers: { cookie: alice },
    });
    const titles = res.json<{ objectives: { title: string }[] }>().objectives.map((o) => o.title);
    expect(titles).not.toContain('Old news');
  });

  it('rolls up per team with avgScore and status counts', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/cycles/${pastCycleId}/summary`,
      headers: { cookie: alice },
    });
    const team = res
      .json<{ teams: { teamId: string; name: string; avgScore: number; counts: Record<string, number> }[] }>()
      .teams.find((t) => t.teamId === teamId);
    // (1 + 0.8 + 1) / 3 = 0.93 at 2dp
    expect(team).toMatchObject({
      name: 'Platform',
      avgScore: 0.93,
      counts: { 'on-track': 1, 'at-risk': 1, behind: 1 },
    });
  });

  it('rolls up my personal objectives separately', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/cycles/${pastCycleId}/summary`,
      headers: { cookie: alice },
    });
    expect(res.json<{ personal: unknown }>().personal).toMatchObject({
      avgScore: 0,
      counts: { 'on-track': 0, 'at-risk': 0, behind: 1 },
    });
  });

  it("scopes to visibility: bob never sees alice's personal objective", async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/cycles/${pastCycleId}/summary`,
      headers: { cookie: bob },
    });
    const body = res.json<{
      objectives: { id: string }[];
      personal: { avgScore: number; counts: Record<string, number> };
    }>();
    expect(body.objectives.map((o) => o.id)).not.toContain(personalObj);
    expect(body.objectives.map((o) => o.id)).toContain(doneTeamObj);
    expect(body.personal).toMatchObject({
      avgScore: 0,
      counts: { 'on-track': 0, 'at-risk': 0, behind: 0 },
    });
  });

  it('an outsider gets an empty summary, not an error', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/cycles/${pastCycleId}/summary`,
      headers: { cookie: mallory },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ objectives: unknown[]; teams: unknown[] }>();
    expect(body.objectives).toHaveLength(0);
    expect(body.teams).toHaveLength(0);
  });

  it('future cycle: elapsed 0, fresh objective on-track', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/cycles/${futureCycleId}/summary`,
      headers: { cookie: alice },
    });
    const body = res.json<{ elapsed: number; objectives: { id: string; status: string }[] }>();
    expect(body.elapsed).toBe(0);
    expect(body.objectives.find((o) => o.id === futureObj)).toMatchObject({
      score: 0,
      status: 'on-track',
    });
  });

  it('401s without a session', async () => {
    const res = await app.inject({ method: 'GET', url: `/cycles/${pastCycleId}/summary` });
    expect(res.statusCode).toBe(401);
  });
});
