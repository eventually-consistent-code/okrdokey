/**
 * Purpose: Cycle lifecycle — close a cycle, and roll unfinished work
 *          forward. Rollover clones caller-visible objectives that still
 *          have road left (not archived, score < 1) into the target
 *          cycle: numeric KRs restart at their current value with the
 *          same target, percent/boolean reset, done KRs stay behind with
 *          their history. Connector links never carry — they hold
 *          encrypted secrets and sync state bound to the old KR — the
 *          response names those KRs so re-linking is deliberate.
 * Author(s): John Reed
 */

import {
  errorResponseSchema,
  rolloverRequestSchema,
  rolloverResponseSchema,
  type RolloverResponse,
} from '@okrdokey/shared';
import { eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { cycles, keyResults, metricLinks, objectives, teamMembers } from '../db/schema.js';
import { krScore, objectiveScore } from './scoring.js';

export function registerLifecycleRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.route({
    method: 'POST',
    url: '/cycles/:cycleId/close',
    schema: {
      description: 'Close a cycle — scores freeze in place, the dashboard picker moves on',
      tags: ['cycles'],
      security: [{ cookieAuth: [] }],
      params: z.object({ cycleId: z.string() }),
      response: {
        200: z.object({ id: z.string(), status: z.literal('closed') }),
        404: errorResponseSchema,
        409: errorResponseSchema,
      },
    },
    // eslint-disable-next-line @typescript-eslint/require-await -- reply-branching handlers must be async for the type provider
    handler: async (req, reply) => {
      const cycle = app.db.select().from(cycles).where(eq(cycles.id, req.params.cycleId)).get();
      if (!cycle) {
        return reply
          .status(404)
          .send({ statusCode: 404, error: 'NotFoundError', message: 'no such cycle' });
      }
      if (cycle.status === 'closed') {
        return reply
          .status(409)
          .send({ statusCode: 409, error: 'ConflictError', message: 'cycle is already closed' });
      }
      app.db.update(cycles).set({ status: 'closed' }).where(eq(cycles.id, cycle.id)).run();
      return { id: cycle.id, status: 'closed' as const };
    },
  });

  r.route({
    method: 'POST',
    url: '/cycles/:cycleId/rollover',
    schema: {
      description:
        'Close this cycle and carry unfinished objectives into the target cycle. Numeric KRs restart at their current value; done KRs and check-in history stay behind; connector links must be re-created on the clones.',
      tags: ['cycles'],
      security: [{ cookieAuth: [] }],
      params: z.object({ cycleId: z.string() }),
      body: rolloverRequestSchema,
      response: { 200: rolloverResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema },
    },
    // eslint-disable-next-line @typescript-eslint/require-await -- reply-branching handlers must be async for the type provider
    handler: async (req, reply) => {
      const user = req.user as { id: string };
      const source = app.db.select().from(cycles).where(eq(cycles.id, req.params.cycleId)).get();
      if (!source) {
        return reply
          .status(404)
          .send({ statusCode: 404, error: 'NotFoundError', message: 'no such cycle' });
      }
      const target = app.db
        .select()
        .from(cycles)
        .where(eq(cycles.id, req.body.targetCycleId))
        .get();
      if (!target) {
        return reply
          .status(404)
          .send({ statusCode: 404, error: 'NotFoundError', message: 'no such target cycle' });
      }
      if (target.id === source.id || target.status === 'closed') {
        return reply.status(409).send({
          statusCode: 409,
          error: 'ConflictError',
          message: 'target must be a different, open cycle',
        });
      }

      const myTeams = app.db
        .select({ teamId: teamMembers.teamId })
        .from(teamMembers)
        .where(eq(teamMembers.userId, user.id))
        .all()
        .map((m) => m.teamId);

      // same visibility rule as the summary — a rollover never touches
      // objectives its caller can't see
      const visible = app.db
        .select()
        .from(objectives)
        .where(eq(objectives.cycleId, source.id))
        .all()
        .filter(
          (o) =>
            o.archivedAt === null &&
            (o.teamId === null ? o.ownerUserId === user.id : myTeams.includes(o.teamId)),
        );

      const result: RolloverResponse = {
        clonedObjectives: 0,
        clonedKeyResults: 0,
        skippedObjectives: 0,
        skippedKeyResults: 0,
        hadLinks: [],
      };
      const now = new Date();

      app.db.transaction(() => {
        for (const o of visible) {
          const krs = app.db
            .select()
            .from(keyResults)
            .where(eq(keyResults.objectiveId, o.id))
            .all();
          const score = objectiveScore(krs.map((kr) => krScore(kr)));
          if (score >= 1) {
            result.skippedObjectives += 1;
            continue;
          }

          const newObjId = crypto.randomUUID();
          app.db
            .insert(objectives)
            .values({
              id: newObjId,
              title: o.title,
              description: o.description,
              ownerUserId: o.ownerUserId,
              teamId: o.teamId,
              cycleId: target.id,
              archivedAt: null,
              createdAt: now,
              updatedAt: now,
            })
            .run();
          result.clonedObjectives += 1;

          const carried = krs.filter((kr) => krScore(kr) < 1);
          result.skippedKeyResults += krs.length - carried.length;

          const linked =
            carried.length === 0
              ? []
              : app.db
                  .select({ keyResultId: metricLinks.keyResultId })
                  .from(metricLinks)
                  .where(
                    inArray(
                      metricLinks.keyResultId,
                      carried.map((k) => k.id),
                    ),
                  )
                  .all()
                  .map((l) => l.keyResultId);

          for (const kr of carried) {
            const fresh =
              kr.type === 'numeric'
                ? { baseline: kr.currentValue, target: kr.target, currentValue: kr.currentValue }
                : kr.type === 'percent'
                  ? { baseline: 0, target: 100, currentValue: 0 }
                  : { baseline: 0, target: 1, currentValue: 0 };
            app.db
              .insert(keyResults)
              .values({
                id: crypto.randomUUID(),
                objectiveId: newObjId,
                title: kr.title,
                type: kr.type,
                unit: kr.unit,
                ...fresh,
                currentConfidence: null,
                createdAt: now,
                updatedAt: now,
              })
              .run();
            result.clonedKeyResults += 1;
            if (linked.includes(kr.id)) {
              result.hadLinks.push({ title: kr.title });
            }
          }

          if (req.body.archiveSource) {
            app.db
              .update(objectives)
              .set({ archivedAt: now, updatedAt: now })
              .where(eq(objectives.id, o.id))
              .run();
          }
        }

        if (source.status === 'open') {
          app.db.update(cycles).set({ status: 'closed' }).where(eq(cycles.id, source.id)).run();
        }
      });

      req.log.info(
        { source: source.id, target: target.id, cloned: result.clonedObjectives },
        'cycle rolled over',
      );
      return result;
    },
  });
}
