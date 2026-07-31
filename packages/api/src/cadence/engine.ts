/**
 * Purpose: Cadence engine — the every-minute tick that fires due reminders.
 *          Correctness lives in SQLite (next_due_at watermark), not in the
 *          timer: restarts can't lose a firing, and missed windows collapse
 *          into a single catch-up nudge. Webhook is the only channel in v1.
 * Author(s): John Reed
 */

import { Cron } from 'croner';
import { and, eq, isNull, lte } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { adapters } from '../connectors/registry.js';
import { runSync } from '../connectors/sync.js';
import { keyResults, objectives, reminders, teamMembers, users, webhookDeliveries } from '../db/schema.js';
import { runDigestTick } from './digest.js';
import { sendEmail, type Mailer } from './mailer.js';

// Constants

const DELIVERY_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;
// Exp backoff schedule between attempts (the last slot is headroom — with
// 3 attempts only 1s and 5s ever elapse)
const BACKOFF_MS = [1_000, 5_000, 25_000];

export type SleepFn = (ms: number) => Promise<void>;

const realSleep: SleepFn = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export interface TickOptions {
  sleep?: SleepFn; // tests inject a no-op so retries don't actually wait
  mailer?: Mailer; // present only when SMTP is configured
}

// Recipients for a reminder's scope — team roster, or the one user
function reminderRecipients(
  app: FastifyInstance,
  reminder: typeof reminders.$inferSelect,
): string[] {
  if (reminder.teamId) {
    return app.db
      .select({ email: users.email })
      .from(teamMembers)
      .innerJoin(users, eq(users.id, teamMembers.userId))
      .where(eq(teamMembers.teamId, reminder.teamId))
      .all()
      .map((m) => m.email);
  }
  if (reminder.userId) {
    const u = app.db.select({ email: users.email }).from(users).where(eq(users.id, reminder.userId)).get();
    return u ? [u.email] : [];
  }
  return [];
}

// How many KRs sit in the reminder's scope — team objectives for a team
// reminder, the owner's personal objectives otherwise. Archived stay out.
function awaitingCount(app: FastifyInstance, reminder: typeof reminders.$inferSelect): number {
  const objs = app.db
    .select({ id: objectives.id })
    .from(objectives)
    .where(
      and(
        reminder.teamId
          ? eq(objectives.teamId, reminder.teamId)
          : and(eq(objectives.ownerUserId, reminder.userId ?? ''), isNull(objectives.teamId)),
        isNull(objectives.archivedAt),
      ),
    )
    .all();

  let count = 0;
  for (const obj of objs) {
    count += app.db
      .select({ id: keyResults.id })
      .from(keyResults)
      .where(eq(keyResults.objectiveId, obj.id))
      .all().length;
  }
  return count;
}

// POSTs the payload with timeout + retries; writes the outcome onto the
// delivery row — delivered_at on success, dead-letter columns on exhaustion
async function deliver(
  app: FastifyInstance,
  deliveryId: string,
  url: string,
  payload: string,
  sleep: SleepFn,
): Promise<void> {
  let lastError = 'unknown error';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload,
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      });
      if (res.ok) {
        app.db
          .update(webhookDeliveries)
          .set({ attempts: attempt, deliveredAt: new Date() })
          .where(eq(webhookDeliveries.id, deliveryId))
          .run();
        return;
      }
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    if (attempt < MAX_ATTEMPTS) {
      await sleep(BACKOFF_MS[attempt - 1] ?? 0);
    }
  }

  // Out of attempts — dead-letter, keep the evidence
  app.db
    .update(webhookDeliveries)
    .set({ attempts: MAX_ATTEMPTS, deliveryFailedAt: new Date(), lastError })
    .where(eq(webhookDeliveries.id, deliveryId))
    .run();
}

// One pass over the watermarks: fire everything due at `now`, then advance
// each fired reminder to its next occurrence AFTER now — however many
// windows were missed, exactly one nudge goes out
export async function runTick(
  app: FastifyInstance,
  now: Date,
  opts: TickOptions = {},
): Promise<void> {
  const sleep = opts.sleep ?? realSleep;

  const due = app.db
    .select()
    .from(reminders)
    .where(and(eq(reminders.enabled, true), lte(reminders.nextDueAt, now)))
    .all();

  for (const reminder of due) {
    if (reminder.webhookUrl) {
      const n = awaitingCount(app, reminder);
      const payload = JSON.stringify({
        text: `OKRdokey: check-in time — ${n} key results awaiting update`,
      });
      const deliveryId = crypto.randomUUID();
      app.db
        .insert(webhookDeliveries)
        .values({
          id: deliveryId,
          reminderId: reminder.id,
          payload,
          attempts: 0,
          deliveredAt: null,
          deliveryFailedAt: null,
          lastError: null,
          createdAt: new Date(),
        })
        .run();
      await deliver(app, deliveryId, reminder.webhookUrl, payload, sleep);
    }

    if (reminder.emailEnabled && opts.mailer) {
      const n = awaitingCount(app, reminder);
      const to = reminderRecipients(app, reminder);
      if (to.length > 0) {
        await sendEmail(
          app,
          opts.mailer,
          {
            kind: 'reminder',
            sourceId: reminder.id,
            to,
            subject: `[OKRdokey] check-in time — ${n} key results awaiting update`,
            text: `Check-in time: ${n} key results are awaiting an update.\n\nTakes thirty seconds — new value, confidence color, done.`,
            html: `<p style="font-family:sans-serif">Check-in time: <strong>${n}</strong> key results are awaiting an update.</p><p style="font-family:sans-serif">Takes thirty seconds — new value, confidence color, done.</p>`,
          },
          sleep,
        );
      }
    }

    // No webhook configured → nothing to send in v1; just advance. A cron
    // that stops producing runs parks the reminder as disabled.
    const next = new Cron(reminder.cronExpr, { timezone: reminder.timezone }).nextRun(now);
    if (next) {
      app.db.update(reminders).set({ nextDueAt: next }).where(eq(reminders.id, reminder.id)).run();
    } else {
      app.db.update(reminders).set({ enabled: false }).where(eq(reminders.id, reminder.id)).run();
    }
  }
}

// Kicks off the every-minute tick. Called from main.ts AFTER listen —
// buildApp stays pure so tests never grow a timer. No-op under test.
export function startScheduler(
  app: FastifyInstance,
  sessionSecret: string,
  mailer?: Mailer,
): Cron | null {
  if (process.env.NODE_ENV === 'test') return null;

  const job = new Cron('* * * * *', () => {
    const now = new Date();
    runTick(app, now, { mailer }).catch((err: unknown) => {
      app.log.error(err, 'cadence tick failed');
    });
    if (mailer) {
      runDigestTick(app, mailer, now).catch((err: unknown) => {
        app.log.error(err, 'digest tick failed');
      });
    }
    runSync(app, now, { adapters, sessionSecret }).catch((err: unknown) => {
      app.log.error(err, 'connector sync failed');
    });
    // top of the hour: clear out expired session rows
    if (now.getMinutes() === 0) {
      try {
        const swept = app.sessionStore.sweep();
        if (swept > 0) app.log.info({ swept }, 'expired sessions swept');
      } catch (err) {
        app.log.error(err, 'session sweep failed');
      }
    }
  });
  app.log.info('cadence scheduler started (every minute)');
  return job;
}
