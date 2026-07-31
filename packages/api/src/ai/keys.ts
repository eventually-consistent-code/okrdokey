/**
 * Purpose: BYO Anthropic key management — team keys encrypted at rest,
 *          instance env key as fallback. Team objectives resolve team >
 *          instance; personal objectives use the instance key only.
 * Author(s): John Reed
 */

import {
  aiKeyResponseSchema,
  errorResponseSchema,
  setAiKeyRequestSchema,
} from '@okrdokey/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { AiConfig } from '../config.js';
import { teamAiKeys, teamMembers } from '../db/schema.js';
import { decryptSecret, encryptSecret } from '../lib/secrets.js';

export interface ResolvedKey {
  key: string;
  source: 'team' | 'instance';
  teamId: string | null; // set when source is team — for last-used stamping
}

// team > instance for team objectives; instance only for personal
export function resolveAiKey(
  app: FastifyInstance,
  ai: AiConfig,
  sessionSecret: string,
  teamId: string | null,
): ResolvedKey | null {
  if (!ai.enabled) return null;
  if (teamId) {
    const row = app.db.select().from(teamAiKeys).where(eq(teamAiKeys.teamId, teamId)).get();
    if (row) {
      return { key: decryptSecret(row.keyCiphertext, sessionSecret), source: 'team', teamId };
    }
  }
  if (ai.instanceKey) return { key: ai.instanceKey, source: 'instance', teamId: null };
  return null;
}

export function stampKeyUsed(app: FastifyInstance, teamId: string): void {
  const row = app.db.select().from(teamAiKeys).where(eq(teamAiKeys.teamId, teamId)).get();
  if (row && (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000)) {
    app.db
      .update(teamAiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(teamAiKeys.teamId, teamId))
      .run();
  }
}

// Cheap authenticated ping — GET /v1/models costs zero tokens
async function validateKey(key: string, baseUrl: string | null): Promise<boolean> {
  const url = `${baseUrl ?? 'https://api.anthropic.com'}/v1/models`;
  try {
    const res = await fetch(url, {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function isTeamAdmin(app: FastifyInstance, teamId: string, userId: string): boolean {
  const m = app.db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
    .get();
  return m?.role === 'admin';
}

export interface AiKeyRouteOptions {
  ai: AiConfig;
  sessionSecret: string;
}

export function registerAiKeyRoutes(app: FastifyInstance, opts: AiKeyRouteOptions): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.route({
    method: 'PUT',
    url: '/teams/:teamId/ai-key',
    schema: {
      description:
        'Set the team Anthropic API key (admin). Validated against the API before saving; stored encrypted; shown as last-4 only.',
      tags: ['ai'],
      security: [{ cookieAuth: [] }],
      params: z.object({ teamId: z.string() }),
      body: setAiKeyRequestSchema,
      response: { 200: aiKeyResponseSchema, 400: errorResponseSchema, 404: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const user = req.user as { id: string };
      const { teamId } = req.params;
      if (!isTeamAdmin(app, teamId, user.id)) {
        return reply
          .status(404)
          .send({ statusCode: 404, error: 'NotFoundError', message: 'no such team' });
      }

      const { key } = req.body;
      if (!(await validateKey(key, opts.ai.baseUrl))) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'BadRequestError',
          message: 'Anthropic rejected this key — check it and try again',
        });
      }

      const now = new Date();
      app.db
        .insert(teamAiKeys)
        .values({
          teamId,
          keyCiphertext: encryptSecret(key, opts.sessionSecret),
          keyLast4: key.slice(-4),
          createdByUserId: user.id,
          createdAt: now,
          lastUsedAt: null,
        })
        .onConflictDoUpdate({
          target: teamAiKeys.teamId,
          set: {
            keyCiphertext: encryptSecret(key, opts.sessionSecret),
            keyLast4: key.slice(-4),
            createdByUserId: user.id,
            createdAt: now,
            lastUsedAt: null,
          },
        })
        .run();
      return { teamId, keyLast4: key.slice(-4), createdAt: now.toISOString(), lastUsedAt: null };
    },
  });

  r.route({
    method: 'GET',
    url: '/teams/:teamId/ai-key',
    schema: {
      description: 'Current team AI key metadata (admin) — the key itself never returns',
      tags: ['ai'],
      security: [{ cookieAuth: [] }],
      params: z.object({ teamId: z.string() }),
      response: { 200: aiKeyResponseSchema, 404: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const user = req.user as { id: string };
      const { teamId } = req.params;
      if (!isTeamAdmin(app, teamId, user.id)) {
        return reply
          .status(404)
          .send({ statusCode: 404, error: 'NotFoundError', message: 'no such team' });
      }
      const row = app.db.select().from(teamAiKeys).where(eq(teamAiKeys.teamId, teamId)).get();
      if (!row) {
        return reply
          .status(404)
          .send({ statusCode: 404, error: 'NotFoundError', message: 'no team key set' });
      }
      return {
        teamId,
        keyLast4: row.keyLast4,
        createdAt: row.createdAt.toISOString(),
        lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
      };
    },
  });

  r.route({
    method: 'DELETE',
    url: '/teams/:teamId/ai-key',
    schema: {
      description: 'Revoke the team AI key (admin) — instance key (if any) takes over',
      tags: ['ai'],
      security: [{ cookieAuth: [] }],
      params: z.object({ teamId: z.string() }),
      response: { 204: z.null(), 404: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const user = req.user as { id: string };
      const { teamId } = req.params;
      if (!isTeamAdmin(app, teamId, user.id)) {
        return reply
          .status(404)
          .send({ statusCode: 404, error: 'NotFoundError', message: 'no such team' });
      }
      app.db.delete(teamAiKeys).where(eq(teamAiKeys.teamId, teamId)).run();
      return reply.status(204).send(null);
    },
  });
}
