/**
 * Purpose: Drizzle table definitions — the entire database schema in
 *          TypeScript. drizzle-kit generates SQL migrations from this file;
 *          never hand-edit the generated SQL.
 * Author(s): John Reed
 */

import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Schema version marker — proves the migration pipeline end-to-end.
export const meta = sqliteTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Accounts. password_hash is nullable — OIDC-only users never set one.
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Server-side sessions — revocation is a DELETE, "log out everywhere" works
export const sessions = sqliteTable('sessions', {
  sid: text('sid').primaryKey(),
  data: text('data').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
});

// Teams — the unit of shared OKRs. Personal OKRs will use a nullable team_id,
// so no phantom "personal team" rows ever exist.
export const teams = sqliteTable('teams', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Membership + role in one row; the composite PK stops duplicate joins cold
export const teamMembers = sqliteTable(
  'team_members',
  {
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    role: text('role', { enum: ['admin', 'member'] }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] })],
);
