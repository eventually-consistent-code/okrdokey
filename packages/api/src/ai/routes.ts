/**
 * Purpose: AI drafting endpoints — the coach, not the autopilot. Draft 2–3
 *          measurable KR suggestions from an objective, or critique a
 *          user-typed KR against the same checklist the wizard teaches.
 *          Server-side proxy: the browser never sees a key.
 * Author(s): John Reed
 */

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import {
  aiKrSuggestionSchema,
  aiStatusResponseSchema,
  createKeyResultRequestSchema,
  draftKrsRequestSchema,
  draftKrsResponseSchema,
  errorResponseSchema,
  improveKrRequestSchema,
  improveKrResponseSchema,
} from '@okrdokey/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { AiConfig } from '../config.js';
import { keyResults } from '../db/schema.js';
import { accessibleObjective, type ObjectiveRow } from '../okr/access.js';
import { resolveAiKey, stampKeyUsed } from './keys.js';
import { consumeAiBudget } from './rate-limit.js';

const MAX_TOKENS = 1024;
const TIMEOUT_MS = 60_000;

// The wrapper object structured outputs require (array roots unsupported)
const draftWrapperSchema = z.object({ suggestions: z.array(aiKrSuggestionSchema) });
const improveWrapperSchema = z.object({
  critique: z.array(z.string()).min(1).max(5),
  rewrite: aiKrSuggestionSchema,
});

// Parse failures (malformed/truncated model JSON, schema mismatch) throw
// AnthropicError — the BASE class of APIError, not a subclass. Those are
// invalid output, not upstream failures: they count as zero suggestions so
// the retry covers them. Real API errors (401/429/529) propagate.
function isInvalidOutputError(err: unknown): boolean {
  return err instanceof Anthropic.AnthropicError && !(err instanceof Anthropic.APIError);
}

const COACH_RULES = `You are an OKR coach inside OKRdokey. The one lesson you enforce: a key result is a NUMBER THAT CHANGES, not a task you finish.

Hard rules:
- Never suggest activity phrasing ("launch", "ship", "create", "implement") as a key result. Those are tasks.
- Every suggestion is metric + baseline + target. Types: "numeric" (baseline→target, any direction — decreasing-is-good like churn 5→2 is legal and encouraged where it fits), "percent" (percent-complete 0→100), "boolean" (true done/not-done gates only — use sparingly).
- Baselines you invent are PLACEHOLDER GUESSES. Say so in the rationale: the user must replace them with their real number.
- Rationale: one sentence on why this is an outcome, not a task.
- Do not duplicate existing key results you are shown.`;

function buildClient(ai: AiConfig, key: string): Anthropic {
  return new Anthropic({
    apiKey: key,
    baseURL: ai.baseUrl ?? undefined,
    timeout: TIMEOUT_MS,
  });
}

function notFound(reply: FastifyReply, what: string): FastifyReply {
  return reply
    .status(404)
    .send({ statusCode: 404, error: 'NotFoundError', message: `no such ${what}` });
}

// Anthropic typed errors → plain language the UI can show verbatim
function mapAiError(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof Anthropic.AuthenticationError) {
    return reply.status(502).send({
      statusCode: 502,
      error: 'AiKeyRejectedError',
      message: 'Your Anthropic API key was rejected — check it in Team Settings',
    });
  }
  if (err instanceof Anthropic.RateLimitError) {
    return reply.status(502).send({
      statusCode: 502,
      error: 'AiRateLimitedError',
      message: 'Anthropic rate limit hit — try again in a minute',
    });
  }
  if (err instanceof Anthropic.APIError) {
    return reply.status(502).send({
      statusCode: 502,
      error: 'AiUpstreamError',
      message: 'Anthropic is unavailable right now — try again shortly',
    });
  }
  return reply.status(502).send({
    statusCode: 502,
    error: 'AiUpstreamError',
    message: 'drafting failed — try again',
  });
}

function objectiveContext(app: FastifyInstance, obj: ObjectiveRow): string {
  const existing = app.db
    .select()
    .from(keyResults)
    .where(eq(keyResults.objectiveId, obj.id))
    .all();
  const lines = existing.map((k) => `- ${k.title} (${k.type}, ${k.baseline}→${k.target})`);
  return `Objective: "${obj.title}"${obj.description ? `\nDescription: ${obj.description}` : ''}${
    lines.length ? `\nExisting key results (do not duplicate):\n${lines.join('\n')}` : ''
  }`;
}

// Keep only suggestions the real request schema would accept
function validSuggestions(
  raw: z.infer<typeof aiKrSuggestionSchema>[],
): z.infer<typeof aiKrSuggestionSchema>[] {
  return raw.filter((s) => {
    const asRequest = {
      title: s.title,
      type: s.type,
      unit: s.unit ?? undefined,
      baseline: s.type === 'percent' ? 0 : s.type === 'boolean' ? 0 : s.baseline,
      target: s.type === 'percent' ? 100 : s.type === 'boolean' ? 1 : s.target,
    };
    if (s.type === 'numeric' && s.baseline === s.target) return false;
    return createKeyResultRequestSchema.safeParse(asRequest).success;
  });
}

export interface AiRouteOptions {
  ai: AiConfig;
  sessionSecret: string;
}

export function registerAiRoutes(app: FastifyInstance, opts: AiRouteOptions): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.route({
    method: 'GET',
    url: '/ai/status',
    schema: {
      description: 'Whether AI drafting is available, and which key would serve it',
      tags: ['ai'],
      security: [{ cookieAuth: [] }],
      querystring: z.object({ objectiveId: z.string().optional() }),
      response: { 200: aiStatusResponseSchema },
    },
    handler: (req) => {
      const user = req.user as { id: string };
      if (!opts.ai.enabled) return { enabled: false, keySource: null };

      let teamId: string | null = null;
      if (req.query.objectiveId) {
        const obj = accessibleObjective(app, req.query.objectiveId, user.id);
        teamId = obj?.teamId ?? null;
      }
      const resolved = resolveAiKey(app, opts.ai, opts.sessionSecret, teamId);
      return { enabled: resolved !== null, keySource: resolved?.source ?? null };
    },
  });

  r.route({
    method: 'POST',
    url: '/ai/draft-krs',
    schema: {
      description:
        'Draft 2–3 measurable key-result SUGGESTIONS for an objective. They prefill the form — nothing is created.',
      tags: ['ai'],
      security: [{ cookieAuth: [] }],
      body: draftKrsRequestSchema,
      response: {
        200: draftKrsResponseSchema,
        404: errorResponseSchema,
        409: errorResponseSchema,
        429: errorResponseSchema,
        502: errorResponseSchema,
      },
    },
    handler: async (req, reply) => {
      const user = req.user as { id: string };
      const obj = accessibleObjective(app, req.body.objectiveId, user.id);
      if (!obj) return notFound(reply, 'objective');

      const resolved = resolveAiKey(app, opts.ai, opts.sessionSecret, obj.teamId);
      if (!resolved) {
        return reply.status(409).send({
          statusCode: 409,
          error: 'AiNotConfiguredError',
          message: 'No Anthropic API key configured — add one in Team Settings',
        });
      }
      if (!consumeAiBudget(app, user.id, obj.teamId)) {
        return reply.status(429).send({
          statusCode: 429,
          error: 'AiBudgetError',
          message: 'AI drafting limit reached — try again next hour',
        });
      }

      const client = buildClient(opts.ai, resolved.key);
      const prompt = `${objectiveContext(app, obj)}${
        req.body.context ? `\nUser notes: ${req.body.context}` : ''
      }\n\nSuggest exactly 3 measurable key results for this objective.`;

      const attempt = async (): Promise<z.infer<typeof aiKrSuggestionSchema>[]> => {
        try {
          const response = await client.beta.messages.parse({
            model: opts.ai.model,
            max_tokens: MAX_TOKENS,
            system: COACH_RULES,
            messages: [{ role: 'user', content: prompt }],
            output_format: zodOutputFormat(draftWrapperSchema),
          });
          return validSuggestions(response.parsed_output?.suggestions ?? []);
        } catch (err) {
          if (isInvalidOutputError(err)) return [];
          throw err;
        }
      };

      try {
        let valid = await attempt();
        if (valid.length < 2) valid = await attempt(); // one retry per CONTEXT
        if (valid.length < 2) {
          return reply.status(502).send({
            statusCode: 502,
            error: 'AiUpstreamError',
            message: 'The model could not produce usable suggestions — try adding context',
          });
        }
        if (resolved.teamId) stampKeyUsed(app, resolved.teamId);
        req.log.info(
          { teamId: obj.teamId, userId: user.id, suggestions: valid.length },
          'ai draft served',
        );
        return { suggestions: valid.slice(0, 3) };
      } catch (err) {
        return mapAiError(reply, err);
      }
    },
  });

  r.route({
    method: 'POST',
    url: '/ai/improve-kr',
    schema: {
      description: 'Critique a draft key result against the measurable-outcome checklist + one rewrite',
      tags: ['ai'],
      security: [{ cookieAuth: [] }],
      body: improveKrRequestSchema,
      response: {
        200: improveKrResponseSchema,
        404: errorResponseSchema,
        409: errorResponseSchema,
        429: errorResponseSchema,
        502: errorResponseSchema,
      },
    },
    handler: async (req, reply) => {
      const user = req.user as { id: string };
      const obj = accessibleObjective(app, req.body.objectiveId, user.id);
      if (!obj) return notFound(reply, 'objective');

      const resolved = resolveAiKey(app, opts.ai, opts.sessionSecret, obj.teamId);
      if (!resolved) {
        return reply.status(409).send({
          statusCode: 409,
          error: 'AiNotConfiguredError',
          message: 'No Anthropic API key configured — add one in Team Settings',
        });
      }
      if (!consumeAiBudget(app, user.id, obj.teamId)) {
        return reply.status(429).send({
          statusCode: 429,
          error: 'AiBudgetError',
          message: 'AI drafting limit reached — try again next hour',
        });
      }

      const client = buildClient(opts.ai, resolved.key);
      const draft = `${req.body.title} (type ${req.body.type}${
        req.body.baseline !== undefined && req.body.target !== undefined
          ? `, ${req.body.baseline}→${req.body.target}`
          : ''
      })`;
      try {
        let parsed: z.infer<typeof improveWrapperSchema> | null;
        try {
          const response = await client.beta.messages.parse({
            model: opts.ai.model,
            max_tokens: MAX_TOKENS,
            system: COACH_RULES,
            messages: [
              {
                role: 'user',
                content: `${objectiveContext(app, obj)}\n\nThe user drafted this key result:\n${draft}\n\nCritique it against the checklist (1–5 short bullets) and provide ONE improved rewrite.`,
              },
            ],
            output_format: zodOutputFormat(improveWrapperSchema),
          });
          parsed = response.parsed_output;
        } catch (err) {
          if (!isInvalidOutputError(err)) throw err;
          parsed = null;
        }
        if (!parsed || validSuggestions([parsed.rewrite]).length === 0) {
          return reply.status(502).send({
            statusCode: 502,
            error: 'AiUpstreamError',
            message: 'The model could not produce usable feedback — try again',
          });
        }
        if (resolved.teamId) stampKeyUsed(app, resolved.teamId);
        req.log.info({ teamId: obj.teamId, userId: user.id }, 'ai feedback served');
        return { critique: parsed.critique.slice(0, 5), rewrite: parsed.rewrite };
      } catch (err) {
        return mapAiError(reply, err);
      }
    },
  });
}
