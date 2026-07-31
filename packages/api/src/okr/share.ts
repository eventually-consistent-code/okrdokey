/**
 * Purpose: Public share links — Oslo okr-tracker's transparency idea. Team
 *          admins mint/rotate/kill an unguessable token; the public endpoint
 *          serves a deliberately narrow read-only view: objectives, KRs,
 *          scores, statuses. No notes, no emails, no internal ids.
 * Author(s): John Reed
 */

import { randomBytes } from 'node:crypto';

import {
  errorResponseSchema,
  publicSummaryResponseSchema,
  shareTokenResponseSchema,
  type PublicSummaryResponse,
} from '@okrdokey/shared';
import { and, desc, eq, isNull, sql as rawSql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  cycles,
  keyResults,
  kpiReadings,
  kpis,
  objectives,
  shareTokens,
  teamMembers,
  teams,
} from '../db/schema.js';
import {
  cycleElapsedFraction,
  krScore,
  objectiveScore,
  objectiveStatus,
  round2,
  worstConfidence,
} from './scoring.js';

function newToken(): string {
  return randomBytes(16).toString('base64url');
}

function isTeamAdmin(app: FastifyInstance, teamId: string, userId: string): boolean {
  const m = app.db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
    .get();
  return m?.role === 'admin';
}

export function registerShareRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.route({
    method: 'PUT',
    url: '/teams/:teamId/share',
    schema: {
      description: 'Enable (or rotate) the public share link — old links die on rotate',
      tags: ['share'],
      security: [{ cookieAuth: [] }],
      params: z.object({ teamId: z.string() }),
      response: { 200: shareTokenResponseSchema, 404: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const user = req.user as { id: string };
      const { teamId } = req.params;
      if (!isTeamAdmin(app, teamId, user.id)) {
        return reply
          .status(404)
          .send({ statusCode: 404, error: 'NotFoundError', message: 'no such team' });
      }

      const row = { teamId, token: newToken(), createdAt: new Date() };
      app.db
        .insert(shareTokens)
        .values(row)
        .onConflictDoUpdate({
          target: shareTokens.teamId,
          set: { token: row.token, createdAt: row.createdAt },
        })
        .run();
      return {
        token: row.token,
        url: `/share/${row.token}`,
        createdAt: row.createdAt.toISOString(),
      };
    },
  });

  r.route({
    method: 'GET',
    url: '/teams/:teamId/share',
    schema: {
      description: 'Current share link, if enabled',
      tags: ['share'],
      security: [{ cookieAuth: [] }],
      params: z.object({ teamId: z.string() }),
      response: { 200: shareTokenResponseSchema, 404: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const user = req.user as { id: string };
      const { teamId } = req.params;
      if (!isTeamAdmin(app, teamId, user.id)) {
        return reply
          .status(404)
          .send({ statusCode: 404, error: 'NotFoundError', message: 'no such team' });
      }
      const row = app.db.select().from(shareTokens).where(eq(shareTokens.teamId, teamId)).get();
      if (!row) {
        return reply
          .status(404)
          .send({ statusCode: 404, error: 'NotFoundError', message: 'sharing not enabled' });
      }
      return {
        token: row.token,
        url: `/share/${row.token}`,
        createdAt: row.createdAt.toISOString(),
      };
    },
  });

  r.route({
    method: 'DELETE',
    url: '/teams/:teamId/share',
    schema: {
      description: 'Disable the public share link',
      tags: ['share'],
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
      app.db.delete(shareTokens).where(eq(shareTokens.teamId, teamId)).run();
      return reply.status(204).send(null);
    },
  });

  // The public window — no session, no auth, narrow payload, never cached
  r.route({
    method: 'GET',
    url: '/public/:token/summary',
    config: { public: true },
    schema: {
      description: 'Read-only team OKR dashboard behind an unguessable token',
      tags: ['share'],
      params: z.object({ token: z.string() }),
      response: { 200: publicSummaryResponseSchema, 404: errorResponseSchema },
    },
    handler: async (req, reply) => {
      void reply.header('cache-control', 'no-store');

      const share = app.db
        .select()
        .from(shareTokens)
        .where(eq(shareTokens.token, req.params.token))
        .get();
      if (!share) {
        return reply
          .status(404)
          .send({ statusCode: 404, error: 'NotFoundError', message: 'not found' });
      }
      const team = app.db.select().from(teams).where(eq(teams.id, share.teamId)).get();
      if (!team) {
        return reply
          .status(404)
          .send({ statusCode: 404, error: 'NotFoundError', message: 'not found' });
      }

      const now = new Date();
      const teamObjectives = app.db
        .select()
        .from(objectives)
        .where(and(eq(objectives.teamId, share.teamId), isNull(objectives.archivedAt)))
        .all();

      const byCycle = new Map<string, typeof teamObjectives>();
      for (const o of teamObjectives) {
        byCycle.set(o.cycleId, [...(byCycle.get(o.cycleId) ?? []), o]);
      }

      // KPI strip — current state + a short trend, nothing else
      const teamKpis = app.db
        .select()
        .from(kpis)
        .where(and(eq(kpis.teamId, share.teamId), isNull(kpis.archivedAt)))
        .all()
        .map((k) => {
          const trend = app.db
            .select({ value: kpiReadings.value })
            .from(kpiReadings)
            .where(eq(kpiReadings.kpiId, k.id))
            .orderBy(desc(kpiReadings.createdAt), desc(rawSql`rowid`))
            .limit(12)
            .all()
            .map((r) => r.value)
            .reverse();
          return {
            name: k.name,
            unit: k.unit,
            currentValue: k.currentValue,
            currentHealth: k.currentHealth,
            trend,
          };
        });

      const summary: PublicSummaryResponse = {
        teamName: team.name,
        kpis: teamKpis,
        cycles: [...byCycle.entries()].flatMap(([cycleId, objs]) => {
          const cycle = app.db.select().from(cycles).where(eq(cycles.id, cycleId)).get();
          if (!cycle) return [];
          const elapsed = cycleElapsedFraction(cycle, now);
          return [
            {
              cycle: { name: cycle.name, startsOn: cycle.startsOn, endsOn: cycle.endsOn },
              elapsed: round2(elapsed),
              objectives: objs.map((o) => {
                const krs = app.db
                  .select()
                  .from(keyResults)
                  .where(eq(keyResults.objectiveId, o.id))
                  .all();
                const scores = krs.map(krScore);
                const score = objectiveScore(scores);
                return {
                  title: o.title,
                  score: round2(score),
                  status: objectiveStatus(
                    score,
                    elapsed,
                    worstConfidence(krs.map((k) => k.currentConfidence)),
                  ),
                  keyResults: krs.map((k, i) => ({
                    title: k.title,
                    unit: k.unit,
                    currentValue: k.currentValue,
                    target: k.target,
                    score: round2(scores[i] ?? 0),
                    currentConfidence: k.currentConfidence,
                  })),
                };
              }),
            },
          ];
        }),
      };
      return summary;
    },
  });
}
