/**
 * Purpose: One door to SMTP. Builds the transport from config (tests
 *          inject nodemailer's jsonTransport instead), sends
 *          per-recipient with the same 3-attempt backoff the webhook
 *          path uses, and books every send into email_deliveries —
 *          bodies never stored, recipients never logged.
 * Author(s): John Reed
 */

import { createTransport, type Transporter } from 'nodemailer';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import type { SmtpConfig } from '../config.js';
import { emailDeliveries } from '../db/schema.js';

// Same retry posture as webhook delivery
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [1_000, 5_000, 25_000];

export interface Mailer {
  from: string;
  transport: Transporter;
}

export function buildMailer(smtp: SmtpConfig): Mailer {
  return {
    from: smtp.from,
    transport: createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.auth,
    }),
  };
}

// Test seam — a mailer over nodemailer's jsonTransport (no sockets)
export function buildJsonMailer(from = 'test@okrdokey.local'): Mailer {
  return { from, transport: createTransport({ jsonTransport: true }) };
}

export interface SendArgs {
  kind: 'reminder' | 'digest' | 'test';
  sourceId: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Send one email to each recipient (no shared To/CC — addresses never
 * leak between teammates), with retries and a delivery-log row.
 *
 * :param app: fastify instance (db + log)
 * :param mailer: transport + from
 * :param args: kind/source for the log, recipients, content
 * :returns true when every recipient send succeeded
 */
export async function sendEmail(
  app: FastifyInstance,
  mailer: Mailer,
  args: SendArgs,
  sleepFn: (ms: number) => Promise<void> = sleep,
): Promise<boolean> {
  const deliveryId = crypto.randomUUID();
  app.db
    .insert(emailDeliveries)
    .values({
      id: deliveryId,
      kind: args.kind,
      sourceId: args.sourceId,
      recipientCount: args.to.length,
      attempts: 0,
      createdAt: new Date(),
    })
    .run();

  let lastError: string | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    app.db
      .update(emailDeliveries)
      .set({ attempts: attempt })
      .where(eq(emailDeliveries.id, deliveryId))
      .run();
    try {
      for (const to of args.to) {
        await mailer.transport.sendMail({
          from: mailer.from,
          to,
          subject: args.subject,
          text: args.text,
          html: args.html,
        });
      }
      app.db
        .update(emailDeliveries)
        .set({ deliveredAt: new Date() })
        .where(eq(emailDeliveries.id, deliveryId))
        .run();
      return true;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_ATTEMPTS) {
        await sleepFn(BACKOFF_MS[attempt - 1] ?? 1_000);
      }
    }
  }

  app.db
    .update(emailDeliveries)
    .set({ deliveryFailedAt: new Date(), lastError })
    .where(eq(emailDeliveries.id, deliveryId))
    .run();
  app.log.error({ kind: args.kind, sourceId: args.sourceId, lastError }, 'email delivery failed');
  return false;
}
