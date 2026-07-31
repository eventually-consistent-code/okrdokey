/**
 * Purpose: Drizzle table definitions — the entire database schema in
 *          TypeScript. drizzle-kit generates SQL migrations from this file;
 *          never hand-edit the generated SQL.
 * Author(s): John Reed
 */

import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Schema version marker — proves the migration pipeline end-to-end.
// Real domain tables (users, teams, objectives, ...) land in later phases.
export const meta = sqliteTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});
