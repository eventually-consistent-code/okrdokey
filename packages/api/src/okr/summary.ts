/**
 * Purpose: GET /cycles/:cycleId/summary — the whole cycle at a glance.
 *          Per-objective scores and statuses plus team and personal
 *          roll-ups, scoped to what the requesting user can already see
 *          (mine + my teams, same rule as the objectives list). Archived
 *          objectives sit this one out.
 * Author(s): John Reed
 */

import {
  cycleSummaryResponseSchema,
  errorResponseSchema,
  type StatusCounts,
  type SummaryObjective,
} from '@okrdokey/shared';
import { eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { cycles, keyResults, objectives, teamMembers, teams } from '../db/schema.js';
import { objectiveTrend } from './history.js';
import {
  cycleElapsedFraction,
  krScore,
  objectiveScore,
  objectiveStatus,
  round2,
  worstConfidence,
} from './scoring.js';

// Average + status buckets for one slice of objectives
function rollUp(list: SummaryObjective[]): { avgScore: number; counts: StatusCounts } {
  return {
    avgScore:
      list.length === 0 ? 0 : round2(list.reduce((sum, o) => sum + o.score, 0) / list.length),
    counts: {
      'on-track': list.filter((o) => o.status === 'on-track').length,
      'at-risk': list.filter((o) => o.status === 'at-risk').length,
      behind: list.filter((o) => o.status === 'behind').length,
    },
  };
}

export function registerSummaryRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.route({
    method: 'GET',
    url: '/cycles/:cycleId/summary',
    schema: {
      description:
        'Cycle summary — per-objective scores/statuses plus team and personal roll-ups, scoped to my visibility',
      tags: ['cycles'],
      security: [{ cookieAuth: [] }],
      params: z.object({ cycleId: z.string() }),
      response: { 200: cycleSummaryResponseSchema, 404: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const user = req.user as { id: string };

      const cycle = app.db.select().from(cycles).where(eq(cycles.id, req.params.cycleId)).get();
      if (!cycle) {
        return reply
          .status(404)
          .send({ statusCode: 404, error: 'NotFoundError', message: 'no such cycle' });
      }

      const myTeams = app.db
        .select({ teamId: teamMembers.teamId })
        .from(teamMembers)
        .where(eq(teamMembers.userId, user.id))
        .all()
        .map((m) => m.teamId);

      // Same visibility rule as the objectives list: mine + my teams,
      // archived excluded — a summary never widens what a user can see
      const visible = app.db
        .select()
        .from(objectives)
        .where(eq(objectives.cycleId, cycle.id))
        .all()
        .filter(
          (o) =>
            o.archivedAt === null &&
            (o.teamId === null ? o.ownerUserId === user.id : myTeams.includes(o.teamId)),
        );

      const elapsed = cycleElapsedFraction(cycle, new Date());

      const scored: SummaryObjective[] = visible.map((o) => {
        const krs = app.db.select().from(keyResults).where(eq(keyResults.objectiveId, o.id)).all();
        const score = objectiveScore(krs.map((kr) => krScore(kr)));
        return {
          id: o.id,
          title: o.title,
          teamId: o.teamId,
          ownerUserId: o.ownerUserId,
          score: round2(score),
          status: objectiveStatus(
            score,
            elapsed,
            worstConfidence(krs.map((kr) => kr.currentConfidence)),
          ),
          trend: objectiveTrend(app, o.id),
        };
      });

      // Team roll-ups — only teams that actually have visible objectives here
      const teamIds = [...new Set(scored.flatMap((o) => (o.teamId === null ? [] : [o.teamId])))];
      const teamRows =
        teamIds.length === 0
          ? []
          : app.db.select().from(teams).where(inArray(teams.id, teamIds)).all();
      const teamSummaries = teamRows.map((t) => ({
        teamId: t.id,
        name: t.name,
        ...rollUp(scored.filter((o) => o.teamId === t.id)),
      }));

      return {
        cycle: {
          id: cycle.id,
          name: cycle.name,
          startsOn: cycle.startsOn,
          endsOn: cycle.endsOn,
          status: cycle.status,
        },
        elapsed: round2(elapsed),
        objectives: scored,
        teams: teamSummaries,
        personal: rollUp(scored.filter((o) => o.teamId === null)),
      };
    },
  });
}
