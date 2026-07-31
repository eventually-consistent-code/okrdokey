/**
 * Purpose: Score-over-time from the data we already keep. Every check-in
 *          stores the absolute value with a timestamp, so an objective's
 *          series is exactly rebuildable: merge all KR check-ins by time,
 *          step each KR's value, score each event through scoring.ts —
 *          the one place scoring lives. Uses CURRENT baseline/target, so
 *          a numeric KR edited mid-flight makes earlier points
 *          approximate (documented on the endpoint).
 * Author(s): John Reed
 */

import {
  errorResponseSchema,
  objectiveHistoryResponseSchema,
  type ObjectiveHistoryResponse,
} from '@okrdokey/shared';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { checkIns, keyResults } from '../db/schema.js';
import { accessibleObjective } from './access.js';
import { krScore, objectiveScore, round2 } from './scoring.js';

// Value a KR holds before its first check-in
function startingValue(kr: { type: string; baseline: number }): number {
  return kr.type === 'numeric' ? kr.baseline : 0;
}

/**
 * Build the full event-based series for one objective.
 *
 * :param app: fastify instance (db)
 * :param objectiveId: the objective
 * :returns points (objective score per check-in event) + perKr series
 */
export function buildObjectiveHistory(
  app: FastifyInstance,
  objectiveId: string,
): ObjectiveHistoryResponse {
  const krs = app.db
    .select()
    .from(keyResults)
    .where(eq(keyResults.objectiveId, objectiveId))
    .all();
  if (krs.length === 0) {
    return { points: [], perKr: [] };
  }

  const events = app.db
    .select()
    .from(checkIns)
    .where(
      inArray(
        checkIns.keyResultId,
        krs.map((k) => k.id),
      ),
    )
    .orderBy(asc(checkIns.createdAt), asc(sql`rowid`))
    .all();

  // step each KR from its starting value through its check-ins
  const current = new Map<string, number>(krs.map((k) => [k.id, startingValue(k)]));
  const byId = new Map(krs.map((k) => [k.id, k]));
  const points: ObjectiveHistoryResponse['points'] = [];
  const perKr = new Map<string, ObjectiveHistoryResponse['perKr'][number]>(
    krs.map((k) => [k.id, { keyResultId: k.id, title: k.title, points: [] }]),
  );

  for (const ev of events) {
    current.set(ev.keyResultId, ev.value);
    const kr = byId.get(ev.keyResultId);
    if (!kr) continue;
    const score = round2(
      objectiveScore(krs.map((k) => krScore({ ...k, currentValue: current.get(k.id) ?? 0 }))),
    );
    const createdAt = ev.createdAt.toISOString();
    points.push({ createdAt, score });
    perKr.get(ev.keyResultId)?.points.push({
      createdAt,
      value: ev.value,
      score: round2(krScore({ ...kr, currentValue: ev.value })),
    });
  }

  return { points, perKr: [...perKr.values()] };
}

/**
 * Last N objective-score points as a bare number array — the inline
 * trend shape dashboards and share pages draw without extra requests.
 */
export function objectiveTrend(app: FastifyInstance, objectiveId: string, limit = 12): number[] {
  return buildObjectiveHistory(app, objectiveId)
    .points.slice(-limit)
    .map((p) => p.score);
}

export function registerHistoryRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.route({
    method: 'GET',
    url: '/objectives/:objectiveId/history',
    schema: {
      description:
        'Score-over-time for an objective, one point per check-in event. Series uses current baseline/target — a numeric KR edited after check-ins makes earlier points approximate.',
      tags: ['objectives'],
      security: [{ cookieAuth: [] }],
      params: z.object({ objectiveId: z.string() }),
      response: { 200: objectiveHistoryResponseSchema, 404: errorResponseSchema },
    },
    // eslint-disable-next-line @typescript-eslint/require-await -- reply-branching handlers must be async for the type provider
    handler: async (req, reply) => {
      const user = req.user as { id: string };
      const obj = accessibleObjective(app, req.params.objectiveId, user.id);
      if (!obj) {
        return reply
          .status(404)
          .send({ statusCode: 404, error: 'NotFoundError', message: 'no such objective' });
      }
      return buildObjectiveHistory(app, obj.id);
    },
  });
}
