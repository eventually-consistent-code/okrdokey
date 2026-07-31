/**
 * Purpose: Drizzle-backed session store for @fastify/session — sessions live
 *          in the same single SQLite file as everything else, so backup stays
 *          "copy one file" and revocation is a DELETE.
 * Author(s): John Reed
 */

import type { SessionStore } from '@fastify/session';
import { eq, lt } from 'drizzle-orm';
import type { Session } from 'fastify';

import type { Db } from '../db/index.js';
import { sessions } from '../db/schema.js';

type Callback = (err?: unknown) => void;
type GetCallback = (err: unknown, session?: Session | null) => void;

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 14; // two weeks

// Connect-style store contract: set / get / destroy, callback flavored
export class DrizzleSessionStore implements SessionStore {
  constructor(private readonly db: Db) {}

  set(sid: string, session: Session, callback: Callback): void {
    try {
      const expires = (session as { cookie?: { expires?: string | Date | null } }).cookie
        ?.expires;
      const expiresAt = expires ? new Date(expires) : new Date(Date.now() + DEFAULT_TTL_MS);
      this.db
        .insert(sessions)
        .values({ sid, data: JSON.stringify(session), expiresAt })
        .onConflictDoUpdate({
          target: sessions.sid,
          set: { data: JSON.stringify(session), expiresAt },
        })
        .run();
      callback();
    } catch (err) {
      callback(err);
    }
  }

  get(sid: string, callback: GetCallback): void {
    try {
      const row = this.db.select().from(sessions).where(eq(sessions.sid, sid)).get();
      if (!row) {
        callback(null, null);
        return;
      }
      if (row.expiresAt.getTime() <= Date.now()) {
        // expired — clean it up on the way out
        this.db.delete(sessions).where(eq(sessions.sid, sid)).run();
        callback(null, null);
        return;
      }
      callback(null, JSON.parse(row.data) as Session);
    } catch (err) {
      callback(err);
    }
  }

  destroy(sid: string, callback: Callback): void {
    try {
      this.db.delete(sessions).where(eq(sessions.sid, sid)).run();
      callback();
    } catch (err) {
      callback(err);
    }
  }

  // Not part of the contract — periodic sweep for expired rows
  sweep(): number {
    const result = this.db.delete(sessions).where(lt(sessions.expiresAt, new Date())).run();
    return result.changes;
  }
}
