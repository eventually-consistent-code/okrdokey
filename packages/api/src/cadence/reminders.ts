/**
 * Purpose: Reminder config routes — who gets nudged, when, and where. One
 *          reminder per scope (a team, or personal when teamId is absent).
 *          Team configs are admin-only; the next_due_at watermark is computed
 *          here at write time so the engine only ever reads it.
 * Author(s): John Reed
 */

import {
  errorResponseSchema,
  reminderResponseSchema,
  upsertReminderRequestSchema,
} from '@okrdokey/shared';
import { Cron } from 'croner';
import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { reminders, teamMembers, webhookDeliveries } from '../db/schema.js';

type ReminderRow = typeof reminders.$inferSelect;

function toResponse(row: ReminderRow): z.infer<typeof reminderResponseSchema> {
  return {
    id: row.id,
    teamId: row.teamId,
    userId: row.userId,
    cronExpr: row.cronExpr,
    timezone: row.timezone,
    webhookUrl: row.webhookUrl,
    emailEnabled: row.emailEnabled,
    enabled: row.enabled,
    nextDueAt: row.nextDueAt.toISOString(),
  };
}

// Validates cron + IANA timezone in one shot and hands back the next firing
// strictly after `from`. Bad expression or bad timezone → null.
export function nextOccurrence(cronExpr: string, timezone: string, from: Date): Date | null {
  try {
    return new Cron(cronExpr, { timezone }).nextRun(from);
  } catch {
    return null;
  }
}

// Caller's role in a team, or null when they're not in it at all
function teamRoleOf(
  app: FastifyInstance,
  teamId: string,
  userId: string,
): 'admin' | 'member' | null {
  const row = app.db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
    .get();
  return row ? row.role : null;
}

function notFound(reply: FastifyReply, what: string): FastifyReply {
  return reply
    .status(404)
    .send({ statusCode: 404, error: 'NotFoundError', message: `no such ${what}` });
}

export function registerReminderRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.route({
    method: 'PUT',
    url: '/reminders',
    schema: {
      description:
        'Create or replace the reminder for a scope — a team (admin only) or personal when teamId is absent',
      tags: ['reminders'],
      security: [{ cookieAuth: [] }],
      body: upsertReminderRequestSchema,
      response: {
        200: reminderResponseSchema,
        400: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
    handler: async (req, reply) => {
      const user = req.user as { id: string };
      const { teamId, cronExpr, timezone, webhookUrl, emailEnabled, enabled } = req.body;

      // Team scope: unknown team and non-member answer identically (404,
      // teams-guard convention); members who aren't admins get the 403
      if (teamId) {
        const role = teamRoleOf(app, teamId, user.id);
        if (!role) return notFound(reply, 'team');
        if (role !== 'admin') {
          return reply
            .status(403)
            .send({ statusCode: 403, error: 'ForbiddenError', message: 'admin role required' });
        }
      }

      const now = new Date();
      const nextDueAt = nextOccurrence(cronExpr, timezone, now);
      if (!nextDueAt) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'BadRequestError',
          message: 'invalid cron expression or timezone (or a schedule that never fires)',
        });
      }

      // Upsert on the scope key — one reminder per team, one per person
      const existing = app.db
        .select()
        .from(reminders)
        .where(
          teamId
            ? eq(reminders.teamId, teamId)
            : and(eq(reminders.userId, user.id), isNull(reminders.teamId)),
        )
        .get();

      if (existing) {
        app.db
          .update(reminders)
          .set({ cronExpr, timezone, webhookUrl: webhookUrl ?? null, emailEnabled, enabled, nextDueAt })
          .where(eq(reminders.id, existing.id))
          .run();
        const fresh = app.db.select().from(reminders).where(eq(reminders.id, existing.id)).get();
        return toResponse(fresh as ReminderRow);
      }

      const row: ReminderRow = {
        id: crypto.randomUUID(),
        teamId: teamId ?? null,
        userId: teamId ? null : user.id,
        cronExpr,
        timezone,
        webhookUrl: webhookUrl ?? null,
        emailEnabled,
        enabled,
        nextDueAt,
        createdAt: now,
      };
      app.db.insert(reminders).values(row).run();
      return toResponse(row);
    },
  });

  r.route({
    method: 'GET',
    url: '/reminders',
    schema: {
      description: 'List reminders I can manage — my personal one plus my admin teams',
      tags: ['reminders'],
      security: [{ cookieAuth: [] }],
      response: { 200: z.array(reminderResponseSchema) },
    },
    handler: (req) => {
      const user = req.user as { id: string };
      const adminTeams = app.db
        .select({ teamId: teamMembers.teamId })
        .from(teamMembers)
        .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.role, 'admin')))
        .all()
        .map((m) => m.teamId);

      return app.db
        .select()
        .from(reminders)
        .all()
        .filter((row) =>
          row.teamId === null ? row.userId === user.id : adminTeams.includes(row.teamId),
        )
        .map(toResponse);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/reminders/:reminderId',
    schema: {
      description: 'Delete a reminder (personal owner, or team admin for team scope)',
      tags: ['reminders'],
      security: [{ cookieAuth: [] }],
      params: z.object({ reminderId: z.string() }),
      response: { 204: z.null(), 403: errorResponseSchema, 404: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const user = req.user as { id: string };
      const row = app.db
        .select()
        .from(reminders)
        .where(eq(reminders.id, req.params.reminderId))
        .get();
      if (!row) return notFound(reply, 'reminder');

      if (row.teamId === null) {
        // Personal — anyone but the owner sees the same 404 a bogus id gets
        if (row.userId !== user.id) return notFound(reply, 'reminder');
      } else {
        const role = teamRoleOf(app, row.teamId, user.id);
        if (!role) return notFound(reply, 'reminder');
        if (role !== 'admin') {
          return reply
            .status(403)
            .send({ statusCode: 403, error: 'ForbiddenError', message: 'admin role required' });
        }
      }

      // Delivery log rows reference the reminder — clear them in the same
      // transaction so the FK never trips
      app.db.transaction((tx) => {
        tx.delete(webhookDeliveries).where(eq(webhookDeliveries.reminderId, row.id)).run();
        tx.delete(reminders).where(eq(reminders.id, row.id)).run();
      });
      return reply.status(204).send(null);
    },
  });
}
