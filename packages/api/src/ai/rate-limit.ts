/**
 * Purpose: AI drafting rate limits — fixed hourly windows in SQLite so
 *          restarts don't reset them. 10/user/hr, 30/team/hr; team scope
 *          skipped for personal objectives.
 * Author(s): John Reed
 */

import { and, eq, lt } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { aiRateCounters } from '../db/schema.js';

const USER_LIMIT = 10;
const TEAM_LIMIT = 30;
const HOUR_MS = 3_600_000;

function windowStart(now: Date): Date {
  return new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS);
}

function bump(
  app: FastifyInstance,
  scope: 'user' | 'team',
  scopeId: string,
  now: Date,
  limit: number,
): boolean {
  const ws = windowStart(now);
  const row = app.db
    .select()
    .from(aiRateCounters)
    .where(
      and(
        eq(aiRateCounters.scope, scope),
        eq(aiRateCounters.scopeId, scopeId),
        eq(aiRateCounters.windowStart, ws),
      ),
    )
    .get();
  if (row && row.count >= limit) return false;

  app.db
    .insert(aiRateCounters)
    .values({ scope, scopeId, windowStart: ws, count: 1 })
    .onConflictDoUpdate({
      target: [aiRateCounters.scope, aiRateCounters.scopeId, aiRateCounters.windowStart],
      set: { count: (row?.count ?? 0) + 1 },
    })
    .run();
  return true;
}

// True = allowed (and counted). Prunes stale windows on the way through.
export function consumeAiBudget(
  app: FastifyInstance,
  userId: string,
  teamId: string | null,
  now = new Date(),
): boolean {
  app.db
    .delete(aiRateCounters)
    .where(lt(aiRateCounters.windowStart, new Date(now.getTime() - 2 * HOUR_MS)))
    .run();

  // check both before consuming either — no half-spent budgets
  const ws = windowStart(now);
  const peek = (scope: 'user' | 'team', id: string, limit: number): boolean => {
    const row = app.db
      .select()
      .from(aiRateCounters)
      .where(
        and(
          eq(aiRateCounters.scope, scope),
          eq(aiRateCounters.scopeId, id),
          eq(aiRateCounters.windowStart, ws),
        ),
      )
      .get();
    return (row?.count ?? 0) < limit;
  };

  if (!peek('user', userId, USER_LIMIT)) return false;
  if (teamId && !peek('team', teamId, TEAM_LIMIT)) return false;

  bump(app, 'user', userId, now, USER_LIMIT);
  if (teamId) bump(app, 'team', teamId, now, TEAM_LIMIT);
  return true;
}
