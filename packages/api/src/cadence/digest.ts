/**
 * Purpose: Weekly team digest — content built from current state (team
 *          roll-up, per-objective scores/statuses, who checked in this
 *          week), delivered per-recipient over the mailer, scheduled on
 *          the same watermark pattern reminders use. Routes register
 *          only when SMTP is configured — no config, no surface.
 * Author(s): John Reed
 */

import {
  digestScheduleRequestSchema,
  digestScheduleResponseSchema,
  errorResponseSchema,
} from '@okrdokey/shared';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  checkIns,
  cycles,
  digestSchedules,
  keyResults,
  objectives,
  teamMembers,
  teams,
  users,
} from '../db/schema.js';
import { krScore, objectiveScore, objectiveStatus, cycleElapsedFraction, round2, worstConfidence } from '../okr/scoring.js';
import { type Mailer, sendEmail } from './mailer.js';
import { nextOccurrence } from './reminders.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface DigestContent {
  teamName: string;
  subject: string;
  text: string;
  html: string;
  recipients: string[];
}

interface DigestObjective {
  title: string;
  score: number;
  status: string;
}

/**
 * Build one team's digest — open cycles only, current state, plus who
 * checked in during the trailing week (machine check-ins excluded).
 *
 * :param app: fastify instance (db)
 * :param teamId: the team
 * :param now: the clock, injected for testability
 * :returns content + roster, or null when the team doesn't exist
 */
export function buildDigest(app: FastifyInstance, teamId: string, now: Date): DigestContent | null {
  const team = app.db.select().from(teams).where(eq(teams.id, teamId)).get();
  if (!team) return null;

  const roster = app.db
    .select({ email: users.email, name: users.displayName, userId: users.id })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(eq(teamMembers.teamId, teamId))
    .all();

  const openCycles = app.db.select().from(cycles).where(eq(cycles.status, 'open')).all();
  const scored: DigestObjective[] = [];
  const krIds: string[] = [];
  for (const cycle of openCycles) {
    const objs = app.db
      .select()
      .from(objectives)
      .where(and(eq(objectives.cycleId, cycle.id), eq(objectives.teamId, teamId)))
      .all()
      .filter((o) => o.archivedAt === null);
    const elapsed = cycleElapsedFraction(cycle, now);
    for (const o of objs) {
      const krs = app.db.select().from(keyResults).where(eq(keyResults.objectiveId, o.id)).all();
      krIds.push(...krs.map((k) => k.id));
      const score = objectiveScore(krs.map((kr) => krScore(kr)));
      scored.push({
        title: o.title,
        score: round2(score),
        status: objectiveStatus(score, elapsed, worstConfidence(krs.map((k) => k.currentConfidence))),
      });
    }
  }

  const avg = scored.length === 0 ? 0 : round2(scored.reduce((s, o) => s + o.score, 0) / scored.length);
  const counts = {
    'on-track': scored.filter((o) => o.status === 'on-track').length,
    'at-risk': scored.filter((o) => o.status === 'at-risk').length,
    behind: scored.filter((o) => o.status === 'behind').length,
  };

  // who checked in this week — humans only
  const weekAgo = new Date(now.getTime() - WEEK_MS);
  const checkers =
    krIds.length === 0
      ? []
      : [
          ...new Set(
            app.db
              .select({ authorUserId: checkIns.authorUserId })
              .from(checkIns)
              .where(and(inArray(checkIns.keyResultId, krIds), gte(checkIns.createdAt, weekAgo)))
              .all()
              .map((c) => c.authorUserId)
              .filter((id): id is string => id !== null),
          ),
        ].map((id) => roster.find((m) => m.userId === id)?.name ?? 'someone');

  const statusLine = `${counts['on-track']} on-track · ${counts['at-risk']} at-risk · ${counts.behind} behind`;
  const objLines = scored.map((o) => `  ${o.score.toFixed(2)}  [${o.status}]  ${o.title}`);
  const checkerLine =
    checkers.length > 0 ? `Checked in this week: ${checkers.join(', ')}` : 'No check-ins this week — the numbers are getting stale…';

  const text = [
    `${team.name} — OKR digest`,
    ``,
    `Average score ${avg.toFixed(2)} · ${statusLine}`,
    ``,
    ...(objLines.length > 0 ? objLines : ['  (no active objectives)']),
    ``,
    checkerLine,
  ].join('\n');

  const html = [
    `<h2 style="font-family:sans-serif">${escapeHtml(team.name)} — OKR digest</h2>`,
    `<p style="font-family:sans-serif">Average score <strong>${avg.toFixed(2)}</strong> · ${statusLine}</p>`,
    scored.length > 0
      ? `<ul style="font-family:monospace">${scored
          .map((o) => `<li>${o.score.toFixed(2)} [${o.status}] ${escapeHtml(o.title)}</li>`)
          .join('')}</ul>`
      : `<p style="font-family:sans-serif">(no active objectives)</p>`,
    `<p style="font-family:sans-serif">${escapeHtml(checkerLine)}</p>`,
  ].join('\n');

  return {
    teamName: team.name,
    subject: `[OKRdokey] ${team.name} weekly digest — ${avg.toFixed(2)} avg, ${statusLine}`,
    text,
    html,
    recipients: roster.map((m) => m.email),
  };
}

function escapeHtml(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/**
 * Fire due digest schedules — same watermark discipline as reminders:
 * missed windows collapse, dead crons park the schedule disabled.
 */
export async function runDigestTick(app: FastifyInstance, mailer: Mailer, now: Date): Promise<void> {
  const due = app.db
    .select()
    .from(digestSchedules)
    .where(and(eq(digestSchedules.enabled, true), lte(digestSchedules.nextDueAt, now)))
    .all();

  for (const schedule of due) {
    const content = buildDigest(app, schedule.teamId, now);
    if (content && content.recipients.length > 0) {
      await sendEmail(app, mailer, {
        kind: 'digest',
        sourceId: schedule.teamId,
        to: content.recipients,
        subject: content.subject,
        text: content.text,
        html: content.html,
      });
    }
    const next = nextOccurrence(schedule.cronExpr, schedule.timezone, now);
    if (next) {
      app.db
        .update(digestSchedules)
        .set({ nextDueAt: next })
        .where(eq(digestSchedules.teamId, schedule.teamId))
        .run();
    } else {
      app.db
        .update(digestSchedules)
        .set({ enabled: false })
        .where(eq(digestSchedules.teamId, schedule.teamId))
        .run();
    }
  }
}

function isTeamAdmin(app: FastifyInstance, teamId: string, userId: string): boolean {
  const m = app.db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
    .get();
  return m?.role === 'admin';
}

export function registerDigestRoutes(app: FastifyInstance, mailer: Mailer): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.route({
    method: 'PUT',
    url: '/teams/:teamId/digest',
    schema: {
      description: 'Set the weekly digest schedule (admin) — cron + IANA timezone',
      tags: ['digest'],
      security: [{ cookieAuth: [] }],
      params: z.object({ teamId: z.string() }),
      body: digestScheduleRequestSchema,
      response: { 200: digestScheduleResponseSchema, 400: errorResponseSchema, 404: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const user = req.user as { id: string };
      const { teamId } = req.params;
      if (!isTeamAdmin(app, teamId, user.id)) {
        return reply
          .status(404)
          .send({ statusCode: 404, error: 'NotFoundError', message: 'no such team' });
      }
      const next = nextOccurrence(req.body.cronExpr, req.body.timezone, new Date());
      if (!next) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'BadRequestError',
          message: 'cron expression or timezone is invalid (or never fires)',
        });
      }
      app.db
        .insert(digestSchedules)
        .values({
          teamId,
          cronExpr: req.body.cronExpr,
          timezone: req.body.timezone,
          enabled: req.body.enabled,
          nextDueAt: next,
          createdAt: new Date(),
        })
        .onConflictDoUpdate({
          target: digestSchedules.teamId,
          set: {
            cronExpr: req.body.cronExpr,
            timezone: req.body.timezone,
            enabled: req.body.enabled,
            nextDueAt: next,
          },
        })
        .run();
      return {
        teamId,
        cronExpr: req.body.cronExpr,
        timezone: req.body.timezone,
        enabled: req.body.enabled,
        nextDueAt: next.toISOString(),
      };
    },
  });

  r.route({
    method: 'GET',
    url: '/teams/:teamId/digest',
    schema: {
      description: 'Current digest schedule (admin)',
      tags: ['digest'],
      security: [{ cookieAuth: [] }],
      params: z.object({ teamId: z.string() }),
      response: { 200: digestScheduleResponseSchema, 404: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const user = req.user as { id: string };
      const { teamId } = req.params;
      if (!isTeamAdmin(app, teamId, user.id)) {
        return reply
          .status(404)
          .send({ statusCode: 404, error: 'NotFoundError', message: 'no such team' });
      }
      const row = app.db.select().from(digestSchedules).where(eq(digestSchedules.teamId, teamId)).get();
      if (!row) {
        return reply
          .status(404)
          .send({ statusCode: 404, error: 'NotFoundError', message: 'no digest schedule set' });
      }
      return {
        teamId,
        cronExpr: row.cronExpr,
        timezone: row.timezone,
        enabled: row.enabled,
        nextDueAt: row.nextDueAt.toISOString(),
      };
    },
  });

  r.route({
    method: 'DELETE',
    url: '/teams/:teamId/digest',
    schema: {
      description: 'Remove the digest schedule (admin)',
      tags: ['digest'],
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
      app.db.delete(digestSchedules).where(eq(digestSchedules.teamId, teamId)).run();
      return reply.status(204).send(null);
    },
  });

  r.route({
    method: 'POST',
    url: '/teams/:teamId/digest/test',
    schema: {
      description: 'Send the digest to YOU, right now — preview without waiting for the schedule',
      tags: ['digest'],
      security: [{ cookieAuth: [] }],
      params: z.object({ teamId: z.string() }),
      response: {
        200: z.object({ sent: z.boolean() }),
        404: errorResponseSchema,
        502: errorResponseSchema,
      },
    },
    handler: async (req, reply) => {
      const user = req.user as { id: string };
      const { teamId } = req.params;
      if (!isTeamAdmin(app, teamId, user.id)) {
        return reply
          .status(404)
          .send({ statusCode: 404, error: 'NotFoundError', message: 'no such team' });
      }
      const me = app.db.select().from(users).where(eq(users.id, user.id)).get();
      const content = buildDigest(app, teamId, new Date());
      if (!content || !me) {
        return reply
          .status(404)
          .send({ statusCode: 404, error: 'NotFoundError', message: 'no such team' });
      }
      const ok = await sendEmail(app, mailer, {
        kind: 'test',
        sourceId: teamId,
        to: [me.email],
        subject: content.subject,
        text: content.text,
        html: content.html,
      });
      if (!ok) {
        return reply.status(502).send({
          statusCode: 502,
          error: 'EmailDeliveryError',
          message: 'the SMTP server rejected the message — check the server logs',
        });
      }
      return { sent: true };
    },
  });
}
