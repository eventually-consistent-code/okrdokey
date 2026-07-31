/**
 * Purpose: Drizzle table definitions — the entire database schema in
 *          TypeScript. drizzle-kit generates SQL migrations from this file;
 *          never hand-edit the generated SQL.
 * Author(s): John Reed
 */

import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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

// Links an external OIDC identity (issuer + subject) to a local account.
// One row per provider identity — a user can have several, but each
// (issuer, sub) pair maps to exactly one user.
export const oidcIdentities = sqliteTable(
  'oidc_identities',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    issuer: text('issuer').notNull(),
    subject: text('subject').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [uniqueIndex('oidc_identities_issuer_subject_idx').on(t.issuer, t.subject)],
);

// Server-side sessions — revocation is a DELETE, "log out everywhere" works
export const sessions = sqliteTable('sessions', {
  sid: text('sid').primaryKey(),
  data: text('data').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
});
