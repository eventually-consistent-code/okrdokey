/**
 * Purpose: AI drafting tests against a mock Anthropic server — key
 *          lifecycle, resolution precedence, structured-output happy path,
 *          invalid-output retry → 502, typed-error mappings, rate limits,
 *          personal-objective instance-key path, /ai/status states.
 * Author(s): John Reed
 */

import type { OutgoingHttpHeaders } from 'node:http';

import Fastify, { type FastifyInstance } from 'fastify';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';

const SECRET = 'test-secret-at-least-32-chars-long!!';
const GOOD_KEY = 'sk-ant-test-good-key-aaaaaaaaaaaa';
const BAD_KEY = 'sk-ant-test-bad-key-bbbbbbbbbbbbb';

let mock: FastifyInstance;
let mockUrl: string;
// mutable mock behavior per test
let mockMode: 'ok' | 'tasks' | 'auth-error' | 'overloaded' = 'ok';

const GOOD_SUGGESTIONS = {
  suggestions: [
    { title: 'Grow weekly active users from 100 to 250', type: 'numeric', unit: 'users', baseline: 100, target: 250, rationale: 'Usage is the outcome; baseline is a placeholder — replace with your real number.' },
    { title: 'Reduce churn from 5% to 2%', type: 'numeric', unit: '%', baseline: 5, target: 2, rationale: 'Decreasing-is-good outcome.' },
    { title: 'Raise NPS from 30 to 45', type: 'numeric', unit: 'pts', baseline: 30, target: 45, rationale: 'Verifiable satisfaction metric.' },
  ],
};

// schema-valid but semantically bad (baseline === target) — only 1 survives
// the validSuggestions filter, so draft retries once then 502s
const BAD_SUGGESTIONS = {
  suggestions: [
    { title: 'Launch the newsletter', type: 'numeric', unit: null, baseline: 10, target: 10, rationale: 'task' },
    { title: 'Ship the redesign', type: 'numeric', unit: null, baseline: 5, target: 5, rationale: 'task' },
    { title: 'Grow signups from 0 to 50', type: 'numeric', unit: null, baseline: 0, target: 50, rationale: 'ok' },
  ],
};

function structuredResponse(payload: unknown): unknown {
  return {
    id: 'msg_mock',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-4-8',
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 100, output_tokens: 100 },
  };
}

beforeAll(async () => {
  mock = Fastify({ logger: false });
  mock.get('/v1/models', async (req, reply) => {
    const key = req.headers['x-api-key'];
    if (key === GOOD_KEY) return { data: [{ id: 'claude-opus-4-8' }] };
    return reply.status(401).send({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
  });
  mock.post('/v1/messages', async (req, reply) => {
    const key = req.headers['x-api-key'];
    if (mockMode === 'auth-error' || key !== GOOD_KEY) {
      return reply.status(401).send({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
    }
    if (mockMode === 'overloaded') {
      return reply.status(529).send({ type: 'error', error: { type: 'overloaded_error', message: 'overloaded' } });
    }
    if (mockMode === 'tasks') return structuredResponse(BAD_SUGGESTIONS);
    // improve-kr prompts contain "Critique it" — answer with the feedback shape
    const body = req.body as { messages?: { content?: string }[] };
    const userText = String(body.messages?.[0]?.content ?? '');
    if (userText.includes('Critique it')) {
      return structuredResponse({
        critique: ['"Launch" is a task, not an outcome', 'No metric attached'],
        rewrite: GOOD_SUGGESTIONS.suggestions[0],
      });
    }
    return structuredResponse(GOOD_SUGGESTIONS);
  });
  await mock.listen({ port: 0, host: '127.0.0.1' });
  const addr = mock.server.address();
  mockUrl = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});

afterAll(async () => {
  await mock.close();
});

function cookieOf(res: { headers: OutgoingHttpHeaders }): string {
  const raw = res.headers['set-cookie'];
  const header = Array.isArray(raw) ? raw[0] : raw;
  return String(header).split(';')[0] ?? '';
}

interface Ctx {
  app: FastifyInstance;
  admin: string;
  member: string;
  teamId: string;
  teamObjectiveId: string;
  personalObjectiveId: string;
}

async function makeApp(instanceKey: string | null): Promise<Ctx> {
  const app = await buildApp({
    dbPath: ':memory:',
    sessionSecret: SECRET,
    ai: { enabled: true, model: 'claude-opus-4-8', instanceKey, baseUrl: mockUrl },
  });
  await app.ready();

  const mk = async (email: string): Promise<string> =>
    cookieOf(
      await app.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: { email, password: 'correct-horse-battery', displayName: email.split('@')[0] },
      }),
    );
  const admin = await mk('a@x.com');
  const member = await mk('m@x.com');
  const teamId = (
    await app.inject({ method: 'POST', url: '/teams', payload: { name: 'AI' }, headers: { cookie: admin } })
  ).json<{ id: string }>().id;
  await app.inject({
    method: 'POST',
    url: `/teams/${teamId}/members`,
    payload: { email: 'm@x.com', role: 'member' },
    headers: { cookie: admin },
  });
  const cycleId = (
    await app.inject({ method: 'POST', url: '/cycles', payload: { name: '2026-Q3' }, headers: { cookie: admin } })
  ).json<{ id: string }>().id;
  const teamObjectiveId = (
    await app.inject({
      method: 'POST',
      url: '/objectives',
      payload: { title: 'Grow the product', cycleId, teamId },
      headers: { cookie: admin },
    })
  ).json<{ id: string }>().id;
  const personalObjectiveId = (
    await app.inject({
      method: 'POST',
      url: '/objectives',
      payload: { title: 'Personal growth', cycleId },
      headers: { cookie: admin },
    })
  ).json<{ id: string }>().id;
  return { app, admin, member, teamId, teamObjectiveId, personalObjectiveId };
}

beforeEach(() => {
  mockMode = 'ok';
});

describe('key lifecycle (admin only)', () => {
  let ctx: Ctx;
  beforeAll(async () => {
    ctx = await makeApp(null);
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('member cannot set a key (404)', async () => {
    const res = await ctx.app.inject({
      method: 'PUT',
      url: `/teams/${ctx.teamId}/ai-key`,
      payload: { key: GOOD_KEY },
      headers: { cookie: ctx.member },
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejected key never saves (validated against the API)', async () => {
    const res = await ctx.app.inject({
      method: 'PUT',
      url: `/teams/${ctx.teamId}/ai-key`,
      payload: { key: BAD_KEY },
      headers: { cookie: ctx.admin },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ message: string }>().message).toMatch(/rejected/);
  });

  it('good key saves; GET shows last-4 only; DELETE revokes', async () => {
    const put = await ctx.app.inject({
      method: 'PUT',
      url: `/teams/${ctx.teamId}/ai-key`,
      payload: { key: GOOD_KEY },
      headers: { cookie: ctx.admin },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ keyLast4: GOOD_KEY.slice(-4) });
    expect(put.body).not.toContain(GOOD_KEY);

    const get = await ctx.app.inject({
      method: 'GET',
      url: `/teams/${ctx.teamId}/ai-key`,
      headers: { cookie: ctx.admin },
    });
    expect(get.body).not.toContain(GOOD_KEY.slice(0, -4));

    const del = await ctx.app.inject({
      method: 'DELETE',
      url: `/teams/${ctx.teamId}/ai-key`,
      headers: { cookie: ctx.admin },
    });
    expect(del.statusCode).toBe(204);
  });
});

describe('status + drafting', () => {
  let ctx: Ctx;
  beforeAll(async () => {
    ctx = await makeApp(GOOD_KEY); // instance key present
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('/ai/status reports instance key; team key wins after set', async () => {
    let res = await ctx.app.inject({
      method: 'GET',
      url: `/ai/status?objectiveId=${ctx.teamObjectiveId}`,
      headers: { cookie: ctx.admin },
    });
    expect(res.json()).toEqual({ enabled: true, keySource: 'instance' });

    await ctx.app.inject({
      method: 'PUT',
      url: `/teams/${ctx.teamId}/ai-key`,
      payload: { key: GOOD_KEY },
      headers: { cookie: ctx.admin },
    });
    res = await ctx.app.inject({
      method: 'GET',
      url: `/ai/status?objectiveId=${ctx.teamObjectiveId}`,
      headers: { cookie: ctx.admin },
    });
    expect(res.json()).toEqual({ enabled: true, keySource: 'team' });

    // personal objective never uses the team key
    res = await ctx.app.inject({
      method: 'GET',
      url: `/ai/status?objectiveId=${ctx.personalObjectiveId}`,
      headers: { cookie: ctx.admin },
    });
    expect(res.json()).toEqual({ enabled: true, keySource: 'instance' });
  });

  it('drafts 3 valid suggestions with rationale', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/ai/draft-krs',
      payload: { objectiveId: ctx.teamObjectiveId, context: 'we care about retention' },
      headers: { cookie: ctx.member },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ suggestions: { title: string; rationale: string }[] }>();
    expect(body.suggestions).toHaveLength(3);
    expect(body.suggestions[1]?.title).toMatch(/churn/i);
  });

  it('personal objective drafts via the instance key', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/ai/draft-krs',
      payload: { objectiveId: ctx.personalObjectiveId },
      headers: { cookie: ctx.admin },
    });
    expect(res.statusCode).toBe(200);
  });

  it('mostly-invalid model output retries then 502s', async () => {
    mockMode = 'tasks';
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/ai/draft-krs',
      payload: { objectiveId: ctx.teamObjectiveId },
      headers: { cookie: ctx.member },
    });
    expect(res.statusCode).toBe(502);
    expect(res.json<{ message: string }>().message).toMatch(/could not produce/);
  });

  it('upstream auth error maps to plain language', async () => {
    mockMode = 'auth-error';
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/ai/draft-krs',
      payload: { objectiveId: ctx.teamObjectiveId },
      headers: { cookie: ctx.member },
    });
    expect(res.statusCode).toBe(502);
    expect(res.json<{ message: string }>().message).toMatch(/key was rejected/);
  });

  it('improve-kr returns critique bullets + a valid rewrite', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/ai/improve-kr',
      payload: { objectiveId: ctx.teamObjectiveId, title: 'Launch newsletter', type: 'numeric', baseline: 0, target: 5 },
      headers: { cookie: ctx.member },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ critique: string[]; rewrite: { title: string } }>();
    expect(body.critique[0]).toMatch(/task/);
    expect(body.rewrite.title).toMatch(/weekly active users/i);
  });

  it('no key anywhere → 409 with settings hint', async () => {
    const bare = await makeApp(null);
    const res = await bare.app.inject({
      method: 'POST',
      url: '/ai/draft-krs',
      payload: { objectiveId: bare.teamObjectiveId },
      headers: { cookie: bare.admin },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ message: string }>().message).toMatch(/Team Settings/);
    await bare.app.close();
  });

  it('user rate limit exhausts at 10/hour', async () => {
    const fresh = await makeApp(GOOD_KEY);
    let last = 0;
    for (let i = 0; i < 11; i += 1) {
      const res = await fresh.app.inject({
        method: 'POST',
        url: '/ai/draft-krs',
        payload: { objectiveId: fresh.teamObjectiveId },
        headers: { cookie: fresh.admin },
      });
      last = res.statusCode;
    }
    expect(last).toBe(429);
    await fresh.app.close();
  });
});
