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
let mockMode: 'ok' | 'tasks' | 'auth-error' | 'overloaded' | 'rate-limited' | 'garbage' | 'empty-critique' = 'ok';
// counts POST /v1/messages hits — lets tests assert the retry actually fired
let messagesHits = 0;

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

function structuredResponse2(rawText: string): unknown {
  return {
    id: 'msg_mock',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-4-8',
    content: [{ type: 'text', text: rawText }],
    stop_reason: 'max_tokens',
    usage: { input_tokens: 100, output_tokens: 1024 },
  };
}

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
    messagesHits += 1;
    const key = req.headers['x-api-key'];
    if (mockMode === 'auth-error' || key !== GOOD_KEY) {
      return reply.status(401).send({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
    }
    if (mockMode === 'overloaded') {
      return reply.status(529).send({ type: 'error', error: { type: 'overloaded_error', message: 'overloaded' } });
    }
    // no retry-after header — the SDK honors it literally and would sleep 60s
    if (mockMode === 'rate-limited') {
      return reply
        .status(429)
        .send({ type: 'error', error: { type: 'rate_limit_error', message: 'rate limited' } });
    }
    // truncated/malformed JSON — the parse-throws class of invalid output
    if (mockMode === 'garbage') {
      return structuredResponse2('{"suggestions": [{"title": "Grow');
    }
    if (mockMode === 'empty-critique') {
      return structuredResponse({ critique: [], rewrite: GOOD_SUGGESTIONS.suggestions[0] });
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
  messagesHits = 0;
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

  it('mostly-invalid model output retries exactly once then 502s', async () => {
    mockMode = 'tasks';
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/ai/draft-krs',
      payload: { objectiveId: ctx.teamObjectiveId },
      headers: { cookie: ctx.member },
    });
    expect(res.statusCode).toBe(502);
    expect(res.json<{ message: string }>().message).toMatch(/could not produce/);
    expect(messagesHits).toBe(2); // the retry actually fired
  });

  it('malformed/truncated model JSON also gets the one retry then 502', async () => {
    mockMode = 'garbage';
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/ai/draft-krs',
      payload: { objectiveId: ctx.teamObjectiveId },
      headers: { cookie: ctx.member },
    });
    expect(res.statusCode).toBe(502);
    expect(res.json<{ message: string }>().message).toMatch(/could not produce/);
    expect(messagesHits).toBe(2);
  });

  it('upstream 529 overloaded maps to plain language', async () => {
    mockMode = 'overloaded';
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/ai/draft-krs',
      payload: { objectiveId: ctx.teamObjectiveId },
      headers: { cookie: ctx.member },
    });
    expect(res.statusCode).toBe(502);
    expect(res.json<{ message: string }>().message).toMatch(/unavailable right now/);
  });

  it('upstream 429 maps to plain language', async () => {
    mockMode = 'rate-limited';
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/ai/draft-krs',
      payload: { objectiveId: ctx.teamObjectiveId },
      headers: { cookie: ctx.member },
    });
    expect(res.statusCode).toBe(502);
    expect(res.json<{ message: string }>().message).toMatch(/rate limit/);
  });

  it('empty critique from the model is invalid output, not a 500', async () => {
    mockMode = 'empty-critique';
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/ai/improve-kr',
      payload: { objectiveId: ctx.teamObjectiveId, title: 'Launch newsletter', type: 'numeric' },
      headers: { cookie: ctx.member },
    });
    expect(res.statusCode).toBe(502);
    expect(res.json<{ message: string }>().message).toMatch(/usable feedback/);
  });

  it('non-member gets 404 on team objective; member gets 404 on another user\'s personal objective', async () => {
    const outsider = await ctx.app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email: 'x@x.com', password: 'correct-horse-battery', displayName: 'x' },
    });
    const cookie = String(outsider.headers['set-cookie']).split(';')[0] ?? '';
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/ai/draft-krs',
      payload: { objectiveId: ctx.teamObjectiveId },
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);

    const personal = await ctx.app.inject({
      method: 'POST',
      url: '/ai/draft-krs',
      payload: { objectiveId: ctx.personalObjectiveId },
      headers: { cookie: ctx.member },
    });
    expect(personal.statusCode).toBe(404);
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

  it('no key anywhere → 409 with settings hint on both endpoints; status says enabled:false', async () => {
    const bare = await makeApp(null);
    const res = await bare.app.inject({
      method: 'POST',
      url: '/ai/draft-krs',
      payload: { objectiveId: bare.teamObjectiveId },
      headers: { cookie: bare.admin },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ message: string }>().message).toMatch(/Team Settings/);

    const improve = await bare.app.inject({
      method: 'POST',
      url: '/ai/improve-kr',
      payload: { objectiveId: bare.teamObjectiveId, title: 'Launch newsletter', type: 'numeric' },
      headers: { cookie: bare.admin },
    });
    expect(improve.statusCode).toBe(409);

    const status = await bare.app.inject({
      method: 'GET',
      url: '/ai/status',
      headers: { cookie: bare.admin },
    });
    expect(status.json()).toEqual({ enabled: false, keySource: null });
    await bare.app.close();
  });

  it('AI_FEATURES=off leaves no AI routes at all', async () => {
    const off = await buildApp({ dbPath: ':memory:', sessionSecret: SECRET });
    await off.ready();
    const signup = await off.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email: 'off@x.com', password: 'correct-horse-battery', displayName: 'off' },
    });
    const cookie = String(signup.headers['set-cookie']).split(';')[0] ?? '';
    const res = await off.inject({ method: 'GET', url: '/ai/status', headers: { cookie } });
    expect(res.statusCode).toBe(404);
    await off.close();
  });

  it('user rate limit exhausts at 10/hour and also blocks improve-kr', async () => {
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

    const improve = await fresh.app.inject({
      method: 'POST',
      url: '/ai/improve-kr',
      payload: { objectiveId: fresh.teamObjectiveId, title: 'Launch newsletter', type: 'numeric' },
      headers: { cookie: fresh.admin },
    });
    expect(improve.statusCode).toBe(429);
    await fresh.app.close();
  });

  it('team rate limit exhausts at 30/hour across users', async () => {
    const fresh = await makeApp(GOOD_KEY);
    // three more members, 10 drafts each = 30 team-scope consumptions
    const cookies: string[] = [];
    for (const email of ['t1@x.com', 't2@x.com', 't3@x.com']) {
      const signup = await fresh.app.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: { email, password: 'correct-horse-battery', displayName: email },
      });
      cookies.push(String(signup.headers['set-cookie']).split(';')[0] ?? '');
      await fresh.app.inject({
        method: 'POST',
        url: `/teams/${fresh.teamId}/members`,
        payload: { email, role: 'member' },
        headers: { cookie: fresh.admin },
      });
    }
    for (const cookie of cookies) {
      for (let i = 0; i < 10; i += 1) {
        const res = await fresh.app.inject({
          method: 'POST',
          url: '/ai/draft-krs',
          payload: { objectiveId: fresh.teamObjectiveId },
          headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
      }
    }
    // admin has spent nothing user-scope — the team budget is what blocks
    const blocked = await fresh.app.inject({
      method: 'POST',
      url: '/ai/draft-krs',
      payload: { objectiveId: fresh.teamObjectiveId },
      headers: { cookie: fresh.admin },
    });
    expect(blocked.statusCode).toBe(429);

    // personal objectives skip the team scope — admin can still draft there
    const personal = await fresh.app.inject({
      method: 'POST',
      url: '/ai/draft-krs',
      payload: { objectiveId: fresh.personalObjectiveId },
      headers: { cookie: fresh.admin },
    });
    expect(personal.statusCode).toBe(200);
    await fresh.app.close();
  });
});
