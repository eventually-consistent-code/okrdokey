/**
 * Purpose: Database connection factory. Opens (or creates) the SQLite file,
 *          applies pending migrations, and hands back a typed Drizzle client.
 *          One call gets a fully-migrated database — no separate setup step.
 * Author(s): John Reed
 */

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import * as schema from './schema.js';

export type Db = BetterSQLite3Database<typeof schema>;

export interface DbHandle {
  db: Db;
  close: () => void;
}

// Overridable for bundled deploys (Docker sets MIGRATIONS_DIR=/app/drizzle)
const MIGRATIONS_DIR =
  process.env.MIGRATIONS_DIR ??
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'drizzle');

// Opens the db (":memory:" works for tests), runs migrations, returns client
export function createDb(dbPath: string): DbHandle {
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });

  return { db, close: () => sqlite.close() };
}
