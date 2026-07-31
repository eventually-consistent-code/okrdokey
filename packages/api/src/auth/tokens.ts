/**
 * Purpose: Team-scoped API tokens — mint (plaintext shown exactly once),
 *          list, revoke. Only the sha256 hash ever hits the database.
 * Author(s): John Reed
 */

import { createHash, randomBytes } from 'node:crypto';

import {
  apiTokenCreatedResponseSchema,
  apiTokenResponseSchema,
  createApiTokenRequestSchema,
  errorResponseSchema,
} from '@okrdokey/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { apiTokens, teamMembers } from '../db/schema.js';

export const TOKEN_PREFIX = 'okr_';

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function mintToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString('base64url');
}

function isTeamAdmin(app: FastifyInstance, teamId: string, userId: string): boolean {
  const m = app.db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
    .get();
  return m?.role === 'admin';
}

type TokenRow = typeof apiTokens.$inferSelect;

function toResponse(t: TokenRow): z.infer<typeof apiTokenResponseSchema> {
  return {
    id: t.id,
    teamId: t.teamId,
    name: t.name,
    createdAt: t.createdAt.toISOString(),
    lastUsedAt: t.lastUsedAt ? t.lastUsedAt.toISOString() : null,
    revokedAt: t.revokedAt ? t.revokedAt.toISOString() : null,
  };
}

export function registerTokenRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.route({
    method: 'POST',
    url: '/teams/:teamId/tokens',
    schema: {
      description:
        'Mint a team API token. The plaintext token appears in THIS response only — store it; we keep just a hash.',
      tags: ['tokens'],
      security: [{ cookieAuth: [] }],
      params: z.object({ teamId: z.string() }),
      body: createApiTokenRequestSchema,
      response: { 201: apiTokenCreatedResponseSchema, 404: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const user = req.user as { id: string };
      const { teamId } = req.params;
      if (!isTeamAdmin(app, teamId, user.id)) {
        return reply
          .status(404)
          .send({ statusCode: 404, error: 'NotFoundError', message: 'no such team' });
      }

      const token = mintToken();
      const row: TokenRow = {
        id: crypto.randomUUID(),
        teamId,
        name: req.body.name,
        tokenHash: hashToken(token),
        createdByUserId: user.id,
        createdAt: new Date(),
        lastUsedAt: null,
        revokedAt: null,
      };
      app.db.insert(apiTokens).values(row).run();
      return reply.status(201).send({ ...toResponse(row), token });
    },
  });

  r.route({
    method: 'GET',
    url: '/teams/:teamId/tokens',
    schema: {
      description: 'List team API tokens (hashes stay home)',
      tags: ['tokens'],
      security: [{ cookieAuth: [] }],
      params: z.object({ teamId: z.string() }),
      response: { 200: z.array(apiTokenResponseSchema), 404: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const user = req.user as { id: string };
      const { teamId } = req.params;
      if (!isTeamAdmin(app, teamId, user.id)) {
        return reply
          .status(404)
          .send({ statusCode: 404, error: 'NotFoundError', message: 'no such team' });
      }
      return app.db
        .select()
        .from(apiTokens)
        .where(eq(apiTokens.teamId, teamId))
        .all()
        .map(toResponse);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/teams/:teamId/tokens/:tokenId',
    schema: {
      description: 'Revoke a token — takes effect immediately',
      tags: ['tokens'],
      security: [{ cookieAuth: [] }],
      params: z.object({ teamId: z.string(), tokenId: z.string() }),
      response: { 204: z.null(), 404: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const user = req.user as { id: string };
      const { teamId, tokenId } = req.params;
      if (!isTeamAdmin(app, teamId, user.id)) {
        return reply
          .status(404)
          .send({ statusCode: 404, error: 'NotFoundError', message: 'no such team' });
      }
      const row = app.db
        .select()
        .from(apiTokens)
        .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.teamId, teamId)))
        .get();
      if (!row) {
        return reply
          .status(404)
          .send({ statusCode: 404, error: 'NotFoundError', message: 'no such token' });
      }
      app.db
        .update(apiTokens)
        .set({ revokedAt: new Date() })
        .where(eq(apiTokens.id, tokenId))
        .run();
      return reply.status(204).send(null);
    },
  });
}
