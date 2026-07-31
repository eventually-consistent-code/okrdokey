/**
 * Purpose: Team authorization guards — requireTeamRole preHandler factory.
 *          Non-members get a 404, never a 403, so the API doesn't confirm a
 *          team exists to people who aren't in it.
 * Author(s): John Reed
 */

import type { TeamRole } from '@okrdokey/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { teamMembers } from '../db/schema.js';
import type { SessionUser } from '../auth/plugin.js';

declare module 'fastify' {
  interface FastifyRequest {
    teamRole: TeamRole | null;
  }
}

// Builds a preHandler that checks the caller's membership row for
// :teamId. On success it stashes the caller's role on req.teamRole so
// handlers don't query twice.
export function requireTeamRole(required: TeamRole) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const { teamId } = req.params as { teamId: string };
    const user = req.user as SessionUser;

    const membership = req.server.db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, user.id)))
      .get();

    // Unknown team and not-a-member answer identically — no existence leak
    if (!membership) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'NotFoundError',
        message: 'team not found',
      });
    }

    if (required === 'admin' && membership.role !== 'admin') {
      return reply.status(403).send({
        statusCode: 403,
        error: 'ForbiddenError',
        message: 'admin role required',
      });
    }

    req.teamRole = membership.role;
  };
}
