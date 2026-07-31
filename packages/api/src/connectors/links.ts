/**
 * Purpose: KR ↔ work-tracker link CRUD. Credentials go in encrypted, never
 *          come back out; sync health (last error, failure count) is the
 *          readable part.
 * Author(s): John Reed
 */

import {
  errorResponseSchema,
  krLinkResponseSchema,
  upsertKrLinkRequestSchema,
} from '@okrdokey/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { keyResults, krLinks } from '../db/schema.js';
import { encryptSecret } from '../lib/secrets.js';
import { accessibleObjective } from '../okr/access.js';

type LinkRow = typeof krLinks.$inferSelect;

function toResponse(row: LinkRow): z.infer<typeof krLinkResponseSchema> {
  return {
    id: row.id,
    keyResultId: row.keyResultId,
    provider: row.provider,
    config: JSON.parse(row.config) as unknown,
    mode: row.mode,
    syncIntervalMinutes: row.syncIntervalMinutes,
    lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
    lastError: row.lastError,
    consecutiveFailures: row.consecutiveFailures,
  };
}

export interface LinkRouteOptions {
  sessionSecret: string;
}

export function registerLinkRoutes(app: FastifyInstance, opts: LinkRouteOptions): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  const accessibleKr = (
    krId: string,
    userId: string,
  ): typeof keyResults.$inferSelect | null => {
    const kr = app.db.select().from(keyResults).where(eq(keyResults.id, krId)).get();
    if (!kr || !accessibleObjective(app, kr.objectiveId, userId)) return null;
    return kr;
  };

  r.route({
    method: 'PUT',
    url: '/key-results/:keyResultId/link',
    schema: {
      description:
        'Bind this key result to a work tracker — its value then updates itself on a schedule',
      tags: ['links'],
      security: [{ cookieAuth: [] }],
      params: z.object({ keyResultId: z.string() }),
      body: upsertKrLinkRequestSchema,
      response: { 200: krLinkResponseSchema, 404: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const user = req.user as { id: string };
      const kr = accessibleKr(req.params.keyResultId, user.id);
      if (!kr) {
        return reply
          .status(404)
          .send({ statusCode: 404, error: 'NotFoundError', message: 'no such key result' });
      }

      const { provider, config, mode, secret, syncIntervalMinutes } = req.body;
      const now = new Date();
      const row: LinkRow = {
        id: crypto.randomUUID(),
        keyResultId: kr.id,
        provider,
        config: JSON.stringify(config),
        mode,
        secretCiphertext: encryptSecret(secret, opts.sessionSecret),
        etag: null,
        syncIntervalMinutes,
        syncDueAt: now, // first sync on the next tick
        lastSyncedAt: null,
        lastError: null,
        consecutiveFailures: 0,
        createdAt: now,
      };
      app.db
        .insert(krLinks)
        .values(row)
        .onConflictDoUpdate({
          target: krLinks.keyResultId,
          set: {
            provider: row.provider,
            config: row.config,
            mode: row.mode,
            secretCiphertext: row.secretCiphertext,
            etag: null,
            syncIntervalMinutes: row.syncIntervalMinutes,
            syncDueAt: now,
            lastError: null,
            consecutiveFailures: 0,
          },
        })
        .run();
      const fresh = app.db.select().from(krLinks).where(eq(krLinks.keyResultId, kr.id)).get();
      return toResponse(fresh as LinkRow);
    },
  });

  r.route({
    method: 'GET',
    url: '/key-results/:keyResultId/link',
    schema: {
      description: 'Current tracker binding (sync health included, secret not)',
      tags: ['links'],
      security: [{ cookieAuth: [] }],
      params: z.object({ keyResultId: z.string() }),
      response: { 200: krLinkResponseSchema, 404: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const user = req.user as { id: string };
      const kr = accessibleKr(req.params.keyResultId, user.id);
      const row = kr
        ? app.db.select().from(krLinks).where(eq(krLinks.keyResultId, kr.id)).get()
        : undefined;
      if (!kr || !row) {
        return reply
          .status(404)
          .send({ statusCode: 404, error: 'NotFoundError', message: 'no such link' });
      }
      return toResponse(row);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/key-results/:keyResultId/link',
    schema: {
      description: 'Unbind — the KR goes back to manual check-ins only',
      tags: ['links'],
      security: [{ cookieAuth: [] }],
      params: z.object({ keyResultId: z.string() }),
      response: { 204: z.null(), 404: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const user = req.user as { id: string };
      const kr = accessibleKr(req.params.keyResultId, user.id);
      if (!kr) {
        return reply
          .status(404)
          .send({ statusCode: 404, error: 'NotFoundError', message: 'no such key result' });
      }
      app.db.delete(krLinks).where(eq(krLinks.keyResultId, kr.id)).run();
      return reply.status(204).send(null);
    },
  });
}
