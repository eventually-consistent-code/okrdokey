/**
 * Purpose: Objective access rules in one place. Personal objective → owner
 *          only. Team objective → any member. Everyone else sees 404 (not
 *          403) so objective existence never leaks — same stance as teams.
 * Author(s): John Reed
 */

import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { objectives, teamMembers } from '../db/schema.js';

export type ObjectiveRow = typeof objectives.$inferSelect;

// Returns the objective when the user may touch it, null otherwise
export function accessibleObjective(
  app: FastifyInstance,
  objectiveId: string,
  userId: string,
): ObjectiveRow | null {
  const obj = app.db.select().from(objectives).where(eq(objectives.id, objectiveId)).get();
  if (!obj) return null;

  if (obj.teamId === null) {
    return obj.ownerUserId === userId ? obj : null;
  }

  const membership = app.db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, obj.teamId), eq(teamMembers.userId, userId)))
    .get();
  return membership ? obj : null;
}

// Membership check for creating a team objective
export function isTeamMember(app: FastifyInstance, teamId: string, userId: string): boolean {
  return (
    app.db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
      .get() !== undefined
  );
}
