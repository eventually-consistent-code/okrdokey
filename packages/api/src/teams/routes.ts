/**
 * Purpose: Teams CRUD + membership routes. Creator becomes admin, admins
 *          manage the roster, anyone can leave — but the last admin can never
 *          be demoted or removed, so no team is ever orphaned.
 * Author(s): John Reed
 */

import {
  addMemberRequestSchema,
  createTeamRequestSchema,
  errorResponseSchema,
  teamDetailResponseSchema,
  teamMemberSchema,
  teamResponseSchema,
  updateMemberRoleRequestSchema,
} from '@okrdokey/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { SessionUser } from '../auth/plugin.js';
import { teamMembers, teams, users } from '../db/schema.js';
import { requireTeamRole } from './guards.js';

const teamParamsSchema = z.object({ teamId: z.string() });
const memberParamsSchema = z.object({ teamId: z.string(), userId: z.string() });

// How many admins does this team have left?
function adminCount(app: FastifyInstance, teamId: string): number {
  return app.db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.role, 'admin')))
    .all().length;
}

export function registerTeamRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  app.decorateRequest('teamRole', null);

  r.route({
    method: 'POST',
    url: '/teams',
    schema: {
      description: 'Create a team — the creator becomes its admin',
      tags: ['teams'],
      security: [{ cookieAuth: [] }],
      body: createTeamRequestSchema,
      response: { 201: teamResponseSchema, 401: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const user = req.user as SessionUser;
      const now = new Date();
      const team = { id: crypto.randomUUID(), name: req.body.name, createdAt: now, updatedAt: now };

      app.db.insert(teams).values(team).run();
      app.db
        .insert(teamMembers)
        .values({ teamId: team.id, userId: user.id, role: 'admin', createdAt: now })
        .run();

      return reply.status(201).send({
        id: team.id,
        name: team.name,
        role: 'admin' as const,
        createdAt: now.toISOString(),
      });
    },
  });

  r.route({
    method: 'GET',
    url: '/teams',
    schema: {
      description: 'Teams the current user belongs to, with their role in each',
      tags: ['teams'],
      security: [{ cookieAuth: [] }],
      response: { 200: z.array(teamResponseSchema), 401: errorResponseSchema },
    },
    handler: (req) => {
      const user = req.user as SessionUser;
      const rows = app.db
        .select({
          id: teams.id,
          name: teams.name,
          role: teamMembers.role,
          createdAt: teams.createdAt,
        })
        .from(teamMembers)
        .innerJoin(teams, eq(teamMembers.teamId, teams.id))
        .where(eq(teamMembers.userId, user.id))
        .all();

      return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
    },
  });

  r.route({
    method: 'GET',
    url: '/teams/:teamId',
    preHandler: requireTeamRole('member'),
    schema: {
      description: 'Team detail with the full member list — members only',
      tags: ['teams'],
      security: [{ cookieAuth: [] }],
      params: teamParamsSchema,
      response: {
        200: teamDetailResponseSchema,
        401: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
    handler: (req) => {
      // guard already proved membership, so the team row exists
      const team = app.db.select().from(teams).where(eq(teams.id, req.params.teamId)).get();
      if (!team) throw new Error('team vanished mid-request');

      const members = app.db
        .select({
          userId: teamMembers.userId,
          email: users.email,
          displayName: users.displayName,
          role: teamMembers.role,
        })
        .from(teamMembers)
        .innerJoin(users, eq(teamMembers.userId, users.id))
        .where(eq(teamMembers.teamId, team.id))
        .all();

      return {
        id: team.id,
        name: team.name,
        role: req.teamRole ?? ('member' as const),
        createdAt: team.createdAt.toISOString(),
        members,
      };
    },
  });

  r.route({
    method: 'POST',
    url: '/teams/:teamId/members',
    preHandler: requireTeamRole('admin'),
    schema: {
      description: 'Add a member by email — admin only',
      tags: ['teams'],
      security: [{ cookieAuth: [] }],
      params: teamParamsSchema,
      body: addMemberRequestSchema,
      response: {
        201: teamMemberSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        409: errorResponseSchema,
      },
    },
    handler: async (req, reply) => {
      const { teamId } = req.params;
      const target = app.db.select().from(users).where(eq(users.email, req.body.email)).get();
      if (!target) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'NotFoundError',
          message: 'no such user',
        });
      }

      const existing = app.db
        .select()
        .from(teamMembers)
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, target.id)))
        .get();
      if (existing) {
        return reply.status(409).send({
          statusCode: 409,
          error: 'ConflictError',
          message: 'already a member',
        });
      }

      app.db
        .insert(teamMembers)
        .values({ teamId, userId: target.id, role: req.body.role, createdAt: new Date() })
        .run();

      return reply.status(201).send({
        userId: target.id,
        email: target.email,
        displayName: target.displayName,
        role: req.body.role,
      });
    },
  });

  r.route({
    method: 'PATCH',
    url: '/teams/:teamId/members/:userId',
    preHandler: requireTeamRole('admin'),
    schema: {
      description: "Change a member's role — admin only; the last admin cannot be demoted",
      tags: ['teams'],
      security: [{ cookieAuth: [] }],
      params: memberParamsSchema,
      body: updateMemberRoleRequestSchema,
      response: {
        200: teamMemberSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        409: errorResponseSchema,
      },
    },
    handler: async (req, reply) => {
      const { teamId, userId } = req.params;
      const membership = app.db
        .select()
        .from(teamMembers)
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
        .get();
      if (!membership) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'NotFoundError',
          message: 'member not found',
        });
      }

      // A team with zero admins is unrecoverable — refuse to create one
      if (
        membership.role === 'admin' &&
        req.body.role === 'member' &&
        adminCount(app, teamId) <= 1
      ) {
        return reply.status(409).send({
          statusCode: 409,
          error: 'ConflictError',
          message: 'cannot demote the last admin',
        });
      }

      app.db
        .update(teamMembers)
        .set({ role: req.body.role })
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
        .run();

      const target = app.db.select().from(users).where(eq(users.id, userId)).get();
      if (!target) throw new Error('member user vanished mid-request');

      return reply.send({
        userId: target.id,
        email: target.email,
        displayName: target.displayName,
        role: req.body.role,
      });
    },
  });

  r.route({
    method: 'DELETE',
    url: '/teams/:teamId/members/:userId',
    preHandler: requireTeamRole('member'),
    schema: {
      description:
        'Remove a member — admins remove anyone, members may remove themselves (leave); the last admin cannot be removed',
      tags: ['teams'],
      security: [{ cookieAuth: [] }],
      params: memberParamsSchema,
      response: {
        204: z.null(),
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        409: errorResponseSchema,
      },
    },
    handler: async (req, reply) => {
      const { teamId, userId } = req.params;
      const user = req.user as SessionUser;

      // Self-removal is leaving; removing anyone else takes admin
      if (userId !== user.id && req.teamRole !== 'admin') {
        return reply.status(403).send({
          statusCode: 403,
          error: 'ForbiddenError',
          message: 'admin role required',
        });
      }

      const membership = app.db
        .select()
        .from(teamMembers)
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
        .get();
      if (!membership) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'NotFoundError',
          message: 'member not found',
        });
      }

      if (membership.role === 'admin' && adminCount(app, teamId) <= 1) {
        return reply.status(409).send({
          statusCode: 409,
          error: 'ConflictError',
          message: 'cannot remove the last admin',
        });
      }

      app.db
        .delete(teamMembers)
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
        .run();

      return reply.status(204).send(null);
    },
  });
}
