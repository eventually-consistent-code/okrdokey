/**
 * Purpose: The sync sweep — same watermark discipline as reminders. Due
 *          links ask their adapter for progress, map it onto the KR, and
 *          write a normal source-marked check-in. Failures back off
 *          exponentially and leave evidence on the link.
 * Author(s): John Reed
 */

import { eq, lte } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { checkIns, keyResults, kpis, metricLinks } from '../db/schema.js';
import { decryptSecret } from '../lib/secrets.js';
import { recordKpiReading } from '../okr/kpis.js';
import type { AdapterRegistry, LinkProgress } from './types.js';

const MAX_BACKOFF_MULTIPLIER = 16; // interval × 16, ~4h at the 15m default

export interface SyncOptions {
  adapters: AdapterRegistry;
  sessionSecret: string;
}

// percent-closed → 0..100; count-closed/count → done count
function mapValue(
  mode: 'percent-closed' | 'count-closed' | 'count',
  progress: LinkProgress,
): number {
  if (mode !== 'percent-closed') return progress.done;
  if (progress.total <= 0) return 0;
  return Math.round((progress.done / progress.total) * 100);
}

async function syncOne(
  app: FastifyInstance,
  link: typeof metricLinks.$inferSelect,
  now: Date,
  opts: SyncOptions,
): Promise<void> {
  const adapter = opts.adapters[link.provider];
  const interval = link.syncIntervalMinutes * 60_000;

  try {
    if (!adapter) throw new Error(`no adapter registered for ${link.provider}`);

    const progress = await adapter({
      config: JSON.parse(link.config) as unknown,
      secret: decryptSecret(link.secretCiphertext, opts.sessionSecret),
      etag: link.etag,
    });

    if (!progress.notModified) {
      const value = mapValue(link.mode, progress);

      // Subject dispatch — a link points at EXACTLY one of KR or KPI
      if (link.keyResultId) {
        const kr = app.db
          .select()
          .from(keyResults)
          .where(eq(keyResults.id, link.keyResultId))
          .get();
        // no-op syncs don't spam the history
        if (kr && value !== kr.currentValue) {
          const row: typeof checkIns.$inferSelect = {
            id: crypto.randomUUID(),
            keyResultId: kr.id,
            value,
            confidence: kr.currentConfidence ?? 'green',
            note: null,
            authorUserId: null,
            source: link.provider,
            apiTokenId: null,
            createdAt: now,
          };
          app.db.transaction((tx) => {
            tx.insert(checkIns).values(row).run();
            tx.update(keyResults)
              .set({ currentValue: value, updatedAt: now })
              .where(eq(keyResults.id, kr.id))
              .run();
          });
        }
      } else if (link.kpiId) {
        const kpi = app.db.select().from(kpis).where(eq(kpis.id, link.kpiId)).get();
        if (kpi && value !== kpi.currentValue) {
          recordKpiReading(app, kpi, { value, source: link.provider });
        }
      }
    }

    app.db
      .update(metricLinks)
      .set({
        etag: progress.etag !== undefined ? progress.etag : link.etag,
        lastSyncedAt: now,
        lastError: null,
        consecutiveFailures: 0,
        syncDueAt: new Date(now.getTime() + interval),
      })
      .where(eq(metricLinks.id, link.id))
      .run();
  } catch (err) {
    const failures = link.consecutiveFailures + 1;
    const multiplier = Math.min(2 ** failures, MAX_BACKOFF_MULTIPLIER);
    app.db
      .update(metricLinks)
      .set({
        lastError: err instanceof Error ? err.message : String(err),
        consecutiveFailures: failures,
        syncDueAt: new Date(now.getTime() + interval * multiplier),
      })
      .where(eq(metricLinks.id, link.id))
      .run();
  }
}

// One pass: every link whose watermark is due, in sequence (self-host scale)
export async function runSync(
  app: FastifyInstance,
  now: Date,
  opts: SyncOptions,
): Promise<void> {
  const due = app.db.select().from(metricLinks).where(lte(metricLinks.syncDueAt, now)).all();
  for (const link of due) {
    await syncOne(app, link, now, opts);
  }
}
