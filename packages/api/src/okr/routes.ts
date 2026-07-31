/**
 * Purpose: Objectives + key results CRUD. Personal (team_id null) vs team
 *          scoping runs through access.ts; archived objectives stay out of
 *          default lists; archive is the only "delete" objectives get.
 * Author(s): John Reed
 */

import {
  createKeyResultRequestSchema,
  createObjectiveRequestSchema,
  errorResponseSchema,
  keyResultResponseSchema,
  listObjectivesQuerySchema,
  objectiveResponseSchema,
  updateKeyResultRequestSchema,
  updateObjectiveRequestSchema,
} from '@okrdokey/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { cycles, keyResults, objectives, teamMembers } from '../db/schema.js';
import { accessibleObjective, isTeamMember, type ObjectiveRow } from './access.js';
import {
  cycleElapsedFraction,
  krScore,
  objectiveScore,
  objectiveStatus,
  round2,
  worstConfidence,
} from './scoring.js';

type KrRow = typeof keyResults.$inferSelect;

function krToResponse(kr: KrRow): z.infer<typeof keyResultResponseSchema> {
  return {
    id: kr.id,
    objectiveId: kr.objectiveId,
    title: kr.title,
    type: kr.type,
    unit: kr.unit,
    baseline: kr.baseline,
    target: kr.target,
    currentValue: kr.currentValue,
    currentConfidence: kr.currentConfidence,
    score: round2(krScore(kr)),
  };
}

function objToResponse(
  app: FastifyInstance,
  obj: ObjectiveRow,
): z.infer<typeof objectiveResponseSchema> {
  const krs = app.db.select().from(keyResults).where(eq(keyResults.objectiveId, obj.id)).all();

  // Score + status ride along on every objective response — raw score feeds
  // the status math, the 2dp rounding is presentation only
  const cycle = app.db.select().from(cycles).where(eq(cycles.id, obj.cycleId)).get();
  const score = objectiveScore(krs.map((kr) => krScore(kr)));
  const status = objectiveStatus(
    score,
    cycle ? cycleElapsedFraction(cycle, new Date()) : 1,
    worstConfidence(krs.map((kr) => kr.currentConfidence)),
  );

  return {
    id: obj.id,
    title: obj.title,
    description: obj.description,
    ownerUserId: obj.ownerUserId,
    teamId: obj.teamId,
    cycleId: obj.cycleId,
    archivedAt: obj.archivedAt ? obj.archivedAt.toISOString() : null,
    createdAt: obj.createdAt.toISOString(),
    score: round2(score),
    status,
    keyResults: krs.map(krToResponse),
  };
}

function notFound(reply: FastifyReply, what: string): FastifyReply {
  return reply
    .status(404)
    .send({ statusCode: 404, error: 'NotFoundError', message: `no such ${what}` });
}

export function registerOkrRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // Objectives

  r.route({
    method: 'POST',
    url: '/objectives',
    schema: {
      description: 'Create an objective (personal by default, team via teamId)',
      tags: ['okrs'],
      security: [{ cookieAuth: [] }],
      body: createObjectiveRequestSchema,
      response: { 201: objectiveResponseSchema, 404: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const user = req.user as { id: string };
      const { title, description, cycleId, teamId } = req.body;

      if (!app.db.select().from(cycles).where(eq(cycles.id, cycleId)).get()) {
        return notFound(reply, 'cycle');
      }
      if (teamId && !isTeamMember(app, teamId, user.id)) {
        return notFound(reply, 'team');
      }

      const now = new Date();
      const row: ObjectiveRow = {
        id: crypto.randomUUID(),
        title,
        description: description ?? null,
        ownerUserId: user.id,
        teamId: teamId ?? null,
        cycleId,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      app.db.insert(objectives).values(row).run();
      return reply.status(201).send(objToResponse(app, row));
    },
  });

  r.route({
    method: 'GET',
    url: '/objectives',
    schema: {
      description: 'List objectives visible to me (mine + my teams)',
      tags: ['okrs'],
      security: [{ cookieAuth: [] }],
      querystring: listObjectivesQuerySchema,
      response: { 200: z.array(objectiveResponseSchema) },
    },
    handler: (req) => {
      const user = req.user as { id: string };
      const q = req.query;

      const myTeams = app.db
        .select({ teamId: teamMembers.teamId })
        .from(teamMembers)
        .where(eq(teamMembers.userId, user.id))
        .all()
        .map((m) => m.teamId);

      let rows = app.db.select().from(objectives).all();
      rows = rows.filter(
        (o) =>
          (o.teamId === null ? o.ownerUserId === user.id : myTeams.includes(o.teamId)) &&
          (q.includeArchived ? true : o.archivedAt === null) &&
          (q.cycleId ? o.cycleId === q.cycleId : true) &&
          (q.teamId ? o.teamId === q.teamId : true) &&
          (q.mine ? o.ownerUserId === user.id : true),
      );
      return rows.map((o) => objToResponse(app, o));
    },
  });

  r.route({
    method: 'GET',
    url: '/objectives/:objectiveId',
    schema: {
      description: 'Get an objective with its key results',
      tags: ['okrs'],
      security: [{ cookieAuth: [] }],
      params: z.object({ objectiveId: z.string() }),
      response: { 200: objectiveResponseSchema, 404: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const user = req.user as { id: string };
      const obj = accessibleObjective(app, req.params.objectiveId, user.id);
      if (!obj) return notFound(reply, 'objective');
      return objToResponse(app, obj);
    },
  });

  r.route({
    method: 'PATCH',
    url: '/objectives/:objectiveId',
    schema: {
      description: 'Update an objective',
      tags: ['okrs'],
      security: [{ cookieAuth: [] }],
      params: z.object({ objectiveId: z.string() }),
      body: updateObjectiveRequestSchema,
      response: { 200: objectiveResponseSchema, 404: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const user = req.user as { id: string };
      const obj = accessibleObjective(app, req.params.objectiveId, user.id);
      if (!obj) return notFound(reply, 'objective');

      const { title, description, cycleId } = req.body;
      if (cycleId && !app.db.select().from(cycles).where(eq(cycles.id, cycleId)).get()) {
        return notFound(reply, 'cycle');
      }
      app.db
        .update(objectives)
        .set({
          ...(title !== undefined ? { title } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(cycleId !== undefined ? { cycleId } : {}),
          updatedAt: new Date(),
        })
        .where(eq(objectives.id, obj.id))
        .run();
      const fresh = app.db.select().from(objectives).where(eq(objectives.id, obj.id)).get();
      return objToResponse(app, fresh as ObjectiveRow);
    },
  });

  r.route({
    method: 'POST',
    url: '/objectives/:objectiveId/archive',
    schema: {
      description: 'Archive an objective (soft delete; reversible by design later)',
      tags: ['okrs'],
      security: [{ cookieAuth: [] }],
      params: z.object({ objectiveId: z.string() }),
      response: { 200: objectiveResponseSchema, 404: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const user = req.user as { id: string };
      const obj = accessibleObjective(app, req.params.objectiveId, user.id);
      if (!obj) return notFound(reply, 'objective');

      app.db
        .update(objectives)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(eq(objectives.id, obj.id))
        .run();
      const fresh = app.db.select().from(objectives).where(eq(objectives.id, obj.id)).get();
      return objToResponse(app, fresh as ObjectiveRow);
    },
  });

  // Key results (nested under an accessible objective)

  r.route({
    method: 'POST',
    url: '/objectives/:objectiveId/key-results',
    schema: {
      description: 'Add a key result to an objective',
      tags: ['okrs'],
      security: [{ cookieAuth: [] }],
      params: z.object({ objectiveId: z.string() }),
      body: createKeyResultRequestSchema,
      response: { 201: keyResultResponseSchema, 400: errorResponseSchema, 404: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const user = req.user as { id: string };
      const obj = accessibleObjective(app, req.params.objectiveId, user.id);
      if (!obj) return notFound(reply, 'objective');

      const { title, type, unit, baseline, target } = req.body;
      // percent/boolean get fixed ranges below; numeric needs a real span
      if (type === 'numeric' && baseline === target) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'BadRequestError',
          message: 'numeric key result needs baseline != target',
        });
      }

      const now = new Date();
      const row: KrRow = {
        id: crypto.randomUUID(),
        objectiveId: obj.id,
        title,
        type,
        unit: unit ?? null,
        baseline: type === 'percent' ? 0 : type === 'boolean' ? 0 : baseline,
        target: type === 'percent' ? 100 : type === 'boolean' ? 1 : target,
        currentValue: type === 'percent' ? 0 : type === 'boolean' ? 0 : baseline,
        currentConfidence: null,
        createdAt: now,
        updatedAt: now,
      };
      app.db.insert(keyResults).values(row).run();
      return reply.status(201).send(krToResponse(row));
    },
  });

  r.route({
    method: 'PATCH',
    url: '/key-results/:keyResultId',
    schema: {
      description: 'Update a key result',
      tags: ['okrs'],
      security: [{ cookieAuth: [] }],
      params: z.object({ keyResultId: z.string() }),
      body: updateKeyResultRequestSchema,
      response: { 200: keyResultResponseSchema, 404: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const user = req.user as { id: string };
      const kr = app.db
        .select()
        .from(keyResults)
        .where(eq(keyResults.id, req.params.keyResultId))
        .get();
      if (!kr || !accessibleObjective(app, kr.objectiveId, user.id)) {
        return notFound(reply, 'key result');
      }

      const { title, unit, baseline, target } = req.body;
      app.db
        .update(keyResults)
        .set({
          ...(title !== undefined ? { title } : {}),
          ...(unit !== undefined ? { unit } : {}),
          ...(baseline !== undefined && kr.type === 'numeric' ? { baseline } : {}),
          ...(target !== undefined && kr.type === 'numeric' ? { target } : {}),
          updatedAt: new Date(),
        })
        .where(eq(keyResults.id, kr.id))
        .run();
      const fresh = app.db.select().from(keyResults).where(eq(keyResults.id, kr.id)).get();
      return krToResponse(fresh as KrRow);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/key-results/:keyResultId',
    schema: {
      description: 'Delete a key result',
      tags: ['okrs'],
      security: [{ cookieAuth: [] }],
      params: z.object({ keyResultId: z.string() }),
      response: { 204: z.null(), 404: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const user = req.user as { id: string };
      const kr = app.db
        .select()
        .from(keyResults)
        .where(eq(keyResults.id, req.params.keyResultId))
        .get();
      if (!kr || !accessibleObjective(app, kr.objectiveId, user.id)) {
        return notFound(reply, 'key result');
      }
      app.db.delete(keyResults).where(eq(keyResults.id, kr.id)).run();
      return reply.status(204).send(null);
    },
  });
}
