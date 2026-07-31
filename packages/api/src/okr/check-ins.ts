/**
 * Purpose: Check-in routes — the append-only progress log. Every check-in
 *          inserts a history row AND refreshes the KR's denormalized
 *          current_value/current_confidence in one SQLite transaction, so
 *          the cache can never drift from the log.
 * Author(s): John Reed
 */

import {
  checkInResponseSchema,
  createCheckInRequestSchema,
  errorResponseSchema,
} from '@okrdokey/shared';
import { desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { checkIns, keyResults } from '../db/schema.js';
import { accessibleObjective } from './access.js';

type CheckInRow = typeof checkIns.$inferSelect;

function toResponse(row: CheckInRow): z.infer<typeof checkInResponseSchema> {
  return {
    id: row.id,
    keyResultId: row.keyResultId,
    value: row.value,
    confidence: row.confidence,
    note: row.note,
    authorUserId: row.authorUserId,
    createdAt: row.createdAt.toISOString(),
  };
}

// Type-aware value normalization: percent lives on 0..100, boolean is 0|1,
// numeric is whatever the owner says it is
function normalizeValue(type: 'percent' | 'numeric' | 'boolean', value: number): number {
  if (type === 'percent') return Math.min(100, Math.max(0, value));
  if (type === 'boolean') return value === 0 ? 0 : 1;
  return value;
}

export function registerCheckInRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.route({
    method: 'POST',
    url: '/key-results/:keyResultId/check-ins',
    schema: {
      description: 'Record a check-in (append-only; also refreshes the KR cache)',
      tags: ['check-ins'],
      security: [{ cookieAuth: [] }],
      params: z.object({ keyResultId: z.string() }),
      body: createCheckInRequestSchema,
      response: { 201: checkInResponseSchema, 404: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const user = req.user as { id: string };
      const kr = app.db
        .select()
        .from(keyResults)
        .where(eq(keyResults.id, req.params.keyResultId))
        .get();
      // Access flows through the owning objective — outsiders get the same
      // 404 a bogus id gets
      if (!kr || !accessibleObjective(app, kr.objectiveId, user.id)) {
        return reply
          .status(404)
          .send({ statusCode: 404, error: 'NotFoundError', message: 'no such key result' });
      }

      const { confidence, note } = req.body;
      const value = normalizeValue(kr.type, req.body.value);
      const now = new Date();
      const row: CheckInRow = {
        id: crypto.randomUUID(),
        keyResultId: kr.id,
        value,
        confidence,
        note: note ?? null,
        authorUserId: user.id,
        createdAt: now,
      };

      // Log row + denormalized cache land together or not at all
      app.db.transaction((tx) => {
        tx.insert(checkIns).values(row).run();
        tx.update(keyResults)
          .set({ currentValue: value, currentConfidence: confidence, updatedAt: now })
          .where(eq(keyResults.id, kr.id))
          .run();
      });

      return reply.status(201).send(toResponse(row));
    },
  });

  r.route({
    method: 'GET',
    url: '/key-results/:keyResultId/check-ins',
    schema: {
      description: 'Check-in history for a key result, newest first',
      tags: ['check-ins'],
      security: [{ cookieAuth: [] }],
      params: z.object({ keyResultId: z.string() }),
      response: { 200: z.array(checkInResponseSchema), 404: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const user = req.user as { id: string };
      const kr = app.db
        .select()
        .from(keyResults)
        .where(eq(keyResults.id, req.params.keyResultId))
        .get();
      if (!kr || !accessibleObjective(app, kr.objectiveId, user.id)) {
        return reply
          .status(404)
          .send({ statusCode: 404, error: 'NotFoundError', message: 'no such key result' });
      }

      // rowid breaks same-millisecond ties — insertion order is the truth
      const rows = app.db
        .select()
        .from(checkIns)
        .where(eq(checkIns.keyResultId, kr.id))
        .orderBy(desc(checkIns.createdAt), desc(sql`rowid`))
        .all();
      return rows.map(toResponse);
    },
  });
}
