/**
 * Purpose: Drizzle table definitions — the entire database schema in
 *          TypeScript. drizzle-kit generates SQL migrations from this file;
 *          never hand-edit the generated SQL.
 * Author(s): John Reed
 */

import { sql } from 'drizzle-orm';
import { check, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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

// Cycles — first-class date ranges (quarters seeded, arbitrary allowed)
export const cycles = sqliteTable('cycles', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  startsOn: text('starts_on').notNull(), // ISO date, inclusive
  endsOn: text('ends_on').notNull(), // ISO date, inclusive
  status: text('status', { enum: ['open', 'closed'] })
    .notNull()
    .default('open'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Objectives — team_id NULL means personal. Archive, never delete.
export const objectives = sqliteTable('objectives', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  ownerUserId: text('owner_user_id')
    .notNull()
    .references(() => users.id),
  teamId: text('team_id').references(() => teams.id),
  cycleId: text('cycle_id')
    .notNull()
    .references(() => cycles.id),
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Key results — current_value/current_confidence are denormalized from the
// append-only check-in log, updated in the same transaction
export const keyResults = sqliteTable('key_results', {
  id: text('id').primaryKey(),
  objectiveId: text('objective_id')
    .notNull()
    .references(() => objectives.id),
  title: text('title').notNull(),
  type: text('type', { enum: ['percent', 'numeric', 'boolean'] }).notNull(),
  unit: text('unit'),
  baseline: integer('baseline', { mode: 'number' }).notNull().default(0),
  target: integer('target', { mode: 'number' }).notNull(),
  currentValue: integer('current_value', { mode: 'number' }).notNull().default(0),
  currentConfidence: text('current_confidence', { enum: ['red', 'yellow', 'green'] }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Check-ins — append-only; history is the truth, KR carries the cache.
// Machines check in too: author nullable, source says who wrote it.
export const checkIns = sqliteTable('check_ins', {
  id: text('id').primaryKey(),
  keyResultId: text('key_result_id')
    .notNull()
    .references(() => keyResults.id),
  value: integer('value', { mode: 'number' }).notNull(),
  confidence: text('confidence', { enum: ['red', 'yellow', 'green'] }).notNull(),
  note: text('note'),
  authorUserId: text('author_user_id').references(() => users.id),
  source: text('source', { enum: ['ui', 'api', 'github', 'jira'] })
    .notNull()
    .default('ui'),
  apiTokenId: text('api_token_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// API tokens — okr_-prefixed, only the sha256 ever touches disk
export const apiTokens = sqliteTable('api_tokens', {
  id: text('id').primaryKey(),
  teamId: text('team_id')
    .notNull()
    .references(() => teams.id),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  createdByUserId: text('created_by_user_id')
    .notNull()
    .references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
  revokedAt: integer('revoked_at', { mode: 'timestamp' }),
});

// KPIs — cycle-less stability metrics, team-owned. Health is COMPUTED
// (unlike KR confidence, which is authored sentiment).
export const kpis = sqliteTable('kpis', {
  id: text('id').primaryKey(),
  teamId: text('team_id')
    .notNull()
    .references(() => teams.id),
  name: text('name').notNull(),
  unit: text('unit'),
  direction: text('direction', { enum: ['gte', 'lte', 'range'] }).notNull(),
  thresholdLow: integer('threshold_low', { mode: 'number' }),
  thresholdHigh: integer('threshold_high', { mode: 'number' }),
  currentValue: integer('current_value', { mode: 'number' }).notNull().default(0),
  currentHealth: text('current_health', { enum: ['healthy', 'warning', 'breach'] }),
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// KPI readings — append-only, mirrors check_ins' shape minus confidence
export const kpiReadings = sqliteTable('kpi_readings', {
  id: text('id').primaryKey(),
  kpiId: text('kpi_id')
    .notNull()
    .references(() => kpis.id),
  value: integer('value', { mode: 'number' }).notNull(),
  note: text('note'),
  authorUserId: text('author_user_id').references(() => users.id),
  source: text('source', { enum: ['ui', 'api', 'github', 'jira'] })
    .notNull()
    .default('ui'),
  apiTokenId: text('api_token_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Metric ↔ work-tracker bindings — subject is EXACTLY one of KR or KPI;
// due-ness lives in SQLite like the reminders watermark. (Physical table
// name stays kr_links from v1 — logical rename only, no risky rebuild.)
export const metricLinks = sqliteTable(
  'kr_links',
  {
    id: text('id').primaryKey(),
    keyResultId: text('key_result_id')
      .unique()
      .references(() => keyResults.id),
    kpiId: text('kpi_id')
      .unique()
      .references(() => kpis.id),
    provider: text('provider', { enum: ['github', 'jira'] }).notNull(),
    config: text('config').notNull(),
    mode: text('mode', { enum: ['percent-closed', 'count-closed', 'count'] }).notNull(),
    secretCiphertext: text('secret_ciphertext').notNull(),
    etag: text('etag'),
    syncIntervalMinutes: integer('sync_interval_minutes', { mode: 'number' }).notNull().default(15),
    syncDueAt: integer('sync_due_at', { mode: 'timestamp' }).notNull(),
    lastSyncedAt: integer('last_synced_at', { mode: 'timestamp' }),
    lastError: text('last_error'),
    consecutiveFailures: integer('consecutive_failures', { mode: 'number' }).notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [check('metric_links_one_subject', sql`(${t.keyResultId} IS NULL) != (${t.kpiId} IS NULL)`)],
);

// Reminders — due-ness lives HERE, not in a timer; restarts can't lose it
export const reminders = sqliteTable('reminders', {
  id: text('id').primaryKey(),
  teamId: text('team_id').references(() => teams.id),
  userId: text('user_id').references(() => users.id),
  cronExpr: text('cron_expr').notNull(),
  timezone: text('timezone').notNull().default('UTC'),
  webhookUrl: text('webhook_url'),
  emailEnabled: integer('email_enabled', { mode: 'boolean' }).notNull().default(false),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  nextDueAt: integer('next_due_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Share tokens — one per team; rotating = delete + new row, old links die
export const shareTokens = sqliteTable('share_tokens', {
  teamId: text('team_id')
    .primaryKey()
    .references(() => teams.id),
  token: text('token').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Team AI keys — BYO Anthropic key, encrypted like connector credentials.
// One per team; instance env key is the fallback.
export const teamAiKeys = sqliteTable('team_ai_keys', {
  teamId: text('team_id')
    .primaryKey()
    .references(() => teams.id),
  keyCiphertext: text('key_ciphertext').notNull(),
  keyLast4: text('key_last4').notNull(),
  createdByUserId: text('created_by_user_id')
    .notNull()
    .references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
});

// AI rate counters — fixed hourly windows; stale rows pruned on write
export const aiRateCounters = sqliteTable(
  'ai_rate_counters',
  {
    scope: text('scope', { enum: ['user', 'team'] }).notNull(),
    scopeId: text('scope_id').notNull(),
    windowStart: integer('window_start', { mode: 'timestamp' }).notNull(),
    count: integer('count', { mode: 'number' }).notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.scope, t.scopeId, t.windowStart] })],
);

// Webhook deliveries — attempt log with a dead-letter flag
export const webhookDeliveries = sqliteTable('webhook_deliveries', {
  id: text('id').primaryKey(),
  reminderId: text('reminder_id')
    .notNull()
    .references(() => reminders.id),
  payload: text('payload').notNull(),
  attempts: integer('attempts', { mode: 'number' }).notNull().default(0),
  deliveredAt: integer('delivered_at', { mode: 'timestamp' }),
  deliveryFailedAt: integer('delivery_failed_at', { mode: 'timestamp' }),
  lastError: text('last_error'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
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

// Weekly digest schedules — one per team, same watermark pattern as
// reminders (due-ness lives in the row, restarts can't lose it)
export const digestSchedules = sqliteTable('digest_schedules', {
  teamId: text('team_id')
    .primaryKey()
    .references(() => teams.id),
  cronExpr: text('cron_expr').notNull(),
  timezone: text('timezone').notNull().default('UTC'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  nextDueAt: integer('next_due_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Email delivery log — mirrors webhook_deliveries; bodies never stored
export const emailDeliveries = sqliteTable('email_deliveries', {
  id: text('id').primaryKey(),
  kind: text('kind', { enum: ['reminder', 'digest', 'test'] }).notNull(),
  sourceId: text('source_id').notNull(),
  recipientCount: integer('recipient_count', { mode: 'number' }).notNull(),
  attempts: integer('attempts', { mode: 'number' }).notNull().default(0),
  deliveredAt: integer('delivered_at', { mode: 'timestamp' }),
  deliveryFailedAt: integer('delivery_failed_at', { mode: 'timestamp' }),
  lastError: text('last_error'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
