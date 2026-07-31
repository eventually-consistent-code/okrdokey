/**
 * Purpose: KPI routes — cycle-less team stability metrics. Admin manages,
 *          members record readings, machines push through the same gate as
 *          check-ins. Health is computed on every write, never authored.
 * Author(s): John Reed
 */

import {
  createKpiReadingRequestSchema,
  createKpiRequestSchema,
  errorResponseSchema,
  kpiReadingResponseSchema,
  kpiResponseSchema,
} from '@okrdokey/shared';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { kpiReadings, kpis, teamMembers } from '../db/schema.js';
import { kpiHealth } from './health.js';

type KpiRow = typeof kpis.$inferSelect;
type ReadingRow = typeof kpiReadings.$inferSelect;

function toResponse(k: KpiRow): z.infer<typeof kpiResponseSchema> {
  return {
    id: k.id,
    teamId: k.teamId,
    name: k.name,
    unit: k.unit,
    direction: k.direction,
    thresholdLow: k.thresholdLow,
    thresholdHigh: k.thresholdHigh,
    currentValue: k.currentValue,
    currentHealth: k.currentHealth,
    archivedAt: k.archivedAt ? k.archivedAt.toISOString() : null,
  };
}

function readingToResponse(r: ReadingRow): z.infer<typeof kpiReadingResponseSchema> {
  return {
    id: r.id,
    kpiId: r.kpiId,
    value: r.value,
    note: r.note,
    authorUserId: r.authorUserId,
    source: r.source,
    createdAt: r.createdAt.toISOString(),
  };
}

function notFound(reply: FastifyReply, what: string): FastifyReply {
  return reply
    .status(404)
    .send({ statusCode: 404, error: 'NotFoundError', message: `no such ${what}` });
}

// role: null = not a member (404 territory)
function teamRole(app: FastifyInstance, teamId: string, userId: string): 'admin' | 'member' | null {
  const m = app.db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
    .get();
  return m?.role ?? null;
}

// Records a reading + recomputes denormalized value/health in one tx.
// Shared by the route below and the connector sync path.
export function recordKpiReading(
  app: FastifyInstance,
  kpi: KpiRow,
  input: {
    value: number;
    note?: string | null;
    authorUserId?: string | null;
    source: 'ui' | 'api' | 'github' | 'jira';
    apiTokenId?: string | null;
  },
): ReadingRow {
  const now = new Date();
  const health = kpiHealth({
    direction: kpi.direction,
    thresholdLow: kpi.thresholdLow,
    thresholdHigh: kpi.thresholdHigh,
    value: input.value,
  });
  const row: ReadingRow = {
    id: crypto.randomUUID(),
    kpiId: kpi.id,
    value: input.value,
    note: input.note ?? null,
    authorUserId: input.authorUserId ?? null,
    source: input.source,
    apiTokenId: input.apiTokenId ?? null,
    createdAt: now,
  };
  app.db.transaction((tx) => {
    tx.insert(kpiReadings).values(row).run();
    tx.update(kpis)
      .set({ currentValue: input.value, currentHealth: health, updatedAt: now })
      .where(eq(kpis.id, kpi.id))
      .run();
  });
  return row;
}

export function registerKpiRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.route({
    method: 'POST',
    url: '/teams/:teamId/kpis',
    schema: {
      description: 'Create a KPI (team admin) — a cycle-less stability metric',
      tags: ['kpis'],
      security: [{ cookieAuth: [] }],
      params: z.object({ teamId: z.string() }),
      body: createKpiRequestSchema,
      response: { 201: kpiResponseSchema, 404: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const user = req.user as { id: string };
      const { teamId } = req.params;
      if (teamRole(app, teamId, user.id) !== 'admin') return notFound(reply, 'team');

      const now = new Date();
      const { name, unit, direction, thresholdLow, thresholdHigh } = req.body;
      const row: KpiRow = {
        id: crypto.randomUUID(),
        teamId,
        name,
        unit: unit ?? null,
        direction,
        thresholdLow: thresholdLow ?? null,
        thresholdHigh: thresholdHigh ?? null,
        currentValue: 0,
        currentHealth: null,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      app.db.insert(kpis).values(row).run();
      return reply.status(201).send(toResponse(row));
    },
  });

  r.route({
    method: 'GET',
    url: '/teams/:teamId/kpis',
    schema: {
      description: 'Team KPIs (members; archived excluded by default)',
      tags: ['kpis'],
      security: [{ cookieAuth: [] }],
      params: z.object({ teamId: z.string() }),
      querystring: z.object({
        includeArchived: z
          .enum(['true', 'false'])
          .transform((v) => v === 'true')
          .optional(),
      }),
      response: { 200: z.array(kpiResponseSchema), 404: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const user = req.user as { id: string };
      const { teamId } = req.params;
      if (!teamRole(app, teamId, user.id)) return notFound(reply, 'team');

      const rows = app.db
        .select()
        .from(kpis)
        .where(
          req.query.includeArchived
            ? eq(kpis.teamId, teamId)
            : and(eq(kpis.teamId, teamId), isNull(kpis.archivedAt)),
        )
        .all();
      return rows.map(toResponse);
    },
  });

  r.route({
    method: 'POST',
    url: '/kpis/:kpiId/archive',
    schema: {
      description: 'Archive a KPI (team admin)',
      tags: ['kpis'],
      security: [{ cookieAuth: [] }],
      params: z.object({ kpiId: z.string() }),
      response: { 200: kpiResponseSchema, 404: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const user = req.user as { id: string };
      const kpi = app.db.select().from(kpis).where(eq(kpis.id, req.params.kpiId)).get();
      if (!kpi || teamRole(app, kpi.teamId, user.id) !== 'admin') return notFound(reply, 'kpi');

      app.db
        .update(kpis)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(eq(kpis.id, kpi.id))
        .run();
      const fresh = app.db.select().from(kpis).where(eq(kpis.id, kpi.id)).get();
      return toResponse(fresh as KpiRow);
    },
  });

  r.route({
    method: 'POST',
    url: '/kpis/:kpiId/readings',
    config: { allowApiToken: true },
    schema: {
      description:
        'Record a KPI reading (member session or team API token) — health recomputes on every write',
      tags: ['kpis'],
      security: [{ cookieAuth: [] }, { bearerAuth: [] }],
      params: z.object({ kpiId: z.string() }),
      body: createKpiReadingRequestSchema,
      response: { 201: kpiReadingResponseSchema, 404: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const kpi = app.db.select().from(kpis).where(eq(kpis.id, req.params.kpiId)).get();

      let allowed = false;
      if (kpi && req.user) allowed = teamRole(app, kpi.teamId, req.user.id) !== null;
      else if (kpi && req.apiToken) allowed = kpi.teamId === req.apiToken.teamId;
      if (!kpi || !allowed) return notFound(reply, 'kpi');

      const row = recordKpiReading(app, kpi, {
        value: req.body.value,
        note: req.body.note,
        authorUserId: req.user?.id ?? null,
        source: req.user ? 'ui' : 'api',
        apiTokenId: req.apiToken?.id ?? null,
      });
      return reply.status(201).send(readingToResponse(row));
    },
  });

  r.route({
    method: 'GET',
    url: '/kpis/:kpiId/readings',
    schema: {
      description: 'Reading history, newest first',
      tags: ['kpis'],
      security: [{ cookieAuth: [] }],
      params: z.object({ kpiId: z.string() }),
      response: { 200: z.array(kpiReadingResponseSchema), 404: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const user = req.user as { id: string };
      const kpi = app.db.select().from(kpis).where(eq(kpis.id, req.params.kpiId)).get();
      if (!kpi || !teamRole(app, kpi.teamId, user.id)) return notFound(reply, 'kpi');

      const rows = app.db
        .select()
        .from(kpiReadings)
        .where(eq(kpiReadings.kpiId, kpi.id))
        .orderBy(desc(kpiReadings.createdAt), desc(sql`rowid`))
        .all();
      return rows.map(readingToResponse);
    },
  });
}
