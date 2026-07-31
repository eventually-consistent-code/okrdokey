/**
 * Purpose: Shared Zod schemas and their inferred types — the single source of
 *          truth for request/response shapes across the API and (later) the
 *          web UI. Every route schema lives here, nowhere else.
 * Author(s): John Reed
 */

import { z } from 'zod';

// Health

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

// Errors

export const errorResponseSchema = z.object({
  statusCode: z.number(),
  error: z.string(),
  message: z.string(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

// Auth

export const signupRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(10).max(128),
  displayName: z.string().min(1).max(80),
});

export type SignupRequest = z.infer<typeof signupRequestSchema>;

export const loginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(128),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const userResponseSchema = z.object({
  id: z.string(),
  email: z.email(),
  displayName: z.string(),
  createdAt: z.iso.datetime(),
});

export type UserResponse = z.infer<typeof userResponseSchema>;

// Teams

export const teamRoleSchema = z.enum(['admin', 'member']);

export type TeamRole = z.infer<typeof teamRoleSchema>;

export const createTeamRequestSchema = z.object({
  name: z.string().min(1).max(80),
});

export type CreateTeamRequest = z.infer<typeof createTeamRequestSchema>;

// A team as the current user sees it — role is THEIR role, not a team field
export const teamResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: teamRoleSchema,
  createdAt: z.iso.datetime(),
});

export type TeamResponse = z.infer<typeof teamResponseSchema>;

export const teamMemberSchema = z.object({
  userId: z.string(),
  email: z.email(),
  displayName: z.string(),
  role: teamRoleSchema,
});

export type TeamMember = z.infer<typeof teamMemberSchema>;

export const teamDetailResponseSchema = teamResponseSchema.extend({
  members: z.array(teamMemberSchema),
});

export type TeamDetailResponse = z.infer<typeof teamDetailResponseSchema>;

export const addMemberRequestSchema = z.object({
  email: z.email(),
  role: teamRoleSchema.default('member'),
});

export type AddMemberRequest = z.infer<typeof addMemberRequestSchema>;

export const updateMemberRoleRequestSchema = z.object({
  role: teamRoleSchema,
});

export type UpdateMemberRoleRequest = z.infer<typeof updateMemberRoleRequestSchema>;

// Cycles

export const cycleStatusSchema = z.enum(['open', 'closed']);

export const createCycleRequestSchema = z.object({
  name: z.string().min(1).max(40),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
});

export type CreateCycleRequest = z.infer<typeof createCycleRequestSchema>;

export const cycleResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  status: cycleStatusSchema,
});

export type CycleResponse = z.infer<typeof cycleResponseSchema>;

// Key results

export const krTypeSchema = z.enum(['percent', 'numeric', 'boolean']);
export const confidenceSchema = z.enum(['red', 'yellow', 'green']);

export type Confidence = z.infer<typeof confidenceSchema>;

export const createKeyResultRequestSchema = z.object({
  title: z.string().min(1).max(160),
  type: krTypeSchema,
  unit: z.string().max(16).optional(),
  baseline: z.number().default(0),
  target: z.number(),
});

export type CreateKeyResultRequest = z.infer<typeof createKeyResultRequestSchema>;

export const updateKeyResultRequestSchema = createKeyResultRequestSchema.partial();

export type UpdateKeyResultRequest = z.infer<typeof updateKeyResultRequestSchema>;

export const keyResultResponseSchema = z.object({
  id: z.string(),
  objectiveId: z.string(),
  title: z.string(),
  type: krTypeSchema,
  unit: z.string().nullable(),
  baseline: z.number(),
  target: z.number(),
  currentValue: z.number(),
  currentConfidence: confidenceSchema.nullable(),
  score: z.number(),
});

export type KeyResultResponse = z.infer<typeof keyResultResponseSchema>;

// Objectives

export const createObjectiveRequestSchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().max(2000).optional(),
  cycleId: z.string(),
  teamId: z.string().optional(),
});

export type CreateObjectiveRequest = z.infer<typeof createObjectiveRequestSchema>;

export const updateObjectiveRequestSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  description: z.string().max(2000).nullable().optional(),
  cycleId: z.string().optional(),
});

export type UpdateObjectiveRequest = z.infer<typeof updateObjectiveRequestSchema>;

export const objectiveResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  ownerUserId: z.string(),
  teamId: z.string().nullable(),
  cycleId: z.string(),
  archivedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  score: z.number(),
  status: z.enum(['on-track', 'at-risk', 'behind']),
  keyResults: z.array(keyResultResponseSchema),
});

export type ObjectiveResponse = z.infer<typeof objectiveResponseSchema>;

export const listObjectivesQuerySchema = z.object({
  cycleId: z.string().optional(),
  teamId: z.string().optional(),
  mine: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  includeArchived: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export type ListObjectivesQuery = z.infer<typeof listObjectivesQuerySchema>;

// Check-ins

export const checkInSourceSchema = z.enum(['ui', 'api', 'github', 'jira']);

export type CheckInSource = z.infer<typeof checkInSourceSchema>;

// confidence optional: machine callers may omit it (KR confidence untouched)
export const createCheckInRequestSchema = z.object({
  value: z.number(),
  confidence: confidenceSchema.optional(),
  note: z.string().max(1000).optional(),
});

export type CreateCheckInRequest = z.infer<typeof createCheckInRequestSchema>;

export const checkInResponseSchema = z.object({
  id: z.string(),
  keyResultId: z.string(),
  value: z.number(),
  confidence: confidenceSchema,
  note: z.string().nullable(),
  authorUserId: z.string().nullable(),
  source: checkInSourceSchema,
  createdAt: z.iso.datetime(),
});

export type CheckInResponse = z.infer<typeof checkInResponseSchema>;

// Reminders

export const upsertReminderRequestSchema = z.object({
  teamId: z.string().optional(), // absent → personal reminder
  cronExpr: z.string().min(1).max(120),
  timezone: z.string().min(1).max(64).default('UTC'),
  webhookUrl: z.url().optional(),
  enabled: z.boolean().default(true),
});

export type UpsertReminderRequest = z.infer<typeof upsertReminderRequestSchema>;

export const reminderResponseSchema = z.object({
  id: z.string(),
  teamId: z.string().nullable(),
  userId: z.string().nullable(),
  cronExpr: z.string(),
  timezone: z.string(),
  webhookUrl: z.string().nullable(),
  enabled: z.boolean(),
  nextDueAt: z.iso.datetime(),
});

export type ReminderResponse = z.infer<typeof reminderResponseSchema>;

// Scoring + cycle summary

export const objectiveStatusSchema = z.enum(['on-track', 'at-risk', 'behind']);

export type ObjectiveStatus = z.infer<typeof objectiveStatusSchema>;

// How many objectives sit in each status bucket
export const statusCountsSchema = z.object({
  'on-track': z.number(),
  'at-risk': z.number(),
  behind: z.number(),
});

export type StatusCounts = z.infer<typeof statusCountsSchema>;

// One objective as the summary sees it — scores only, no KR payload.
// trend = last 12 event scores so dashboards draw lines without extra calls
export const summaryObjectiveSchema = z.object({
  id: z.string(),
  title: z.string(),
  teamId: z.string().nullable(),
  ownerUserId: z.string(),
  score: z.number(),
  status: objectiveStatusSchema,
  trend: z.array(z.number()).default([]),
});

export type SummaryObjective = z.infer<typeof summaryObjectiveSchema>;

export const summaryTeamSchema = z.object({
  teamId: z.string(),
  name: z.string(),
  avgScore: z.number(),
  counts: statusCountsSchema,
});

export type SummaryTeam = z.infer<typeof summaryTeamSchema>;

export const cycleSummaryResponseSchema = z.object({
  cycle: cycleResponseSchema,
  elapsed: z.number(),
  objectives: z.array(summaryObjectiveSchema),
  teams: z.array(summaryTeamSchema),
  personal: z.object({ avgScore: z.number(), counts: statusCountsSchema }),
});

export type CycleSummaryResponse = z.infer<typeof cycleSummaryResponseSchema>;

// Objective history — score-over-time reconstructed from check-ins.
// Series uses CURRENT baseline/target; a numeric KR edited after
// check-ins makes earlier points approximate.

export const historyPointSchema = z.object({
  createdAt: z.iso.datetime(),
  score: z.number(),
});

export const krHistorySchema = z.object({
  keyResultId: z.string(),
  title: z.string(),
  points: z.array(
    z.object({ createdAt: z.iso.datetime(), value: z.number(), score: z.number() }),
  ),
});

export const objectiveHistoryResponseSchema = z.object({
  points: z.array(historyPointSchema),
  perKr: z.array(krHistorySchema),
});

export type ObjectiveHistoryResponse = z.infer<typeof objectiveHistoryResponseSchema>;

// Public share link

export const shareTokenResponseSchema = z.object({
  token: z.string(),
  url: z.string(),
  createdAt: z.iso.datetime(),
});

export type ShareTokenResponse = z.infer<typeof shareTokenResponseSchema>;

// Read-only public view — deliberately narrow: no notes, no emails, no ids
// beyond what the page needs
export const publicKeyResultSchema = z.object({
  title: z.string(),
  unit: z.string().nullable(),
  currentValue: z.number(),
  target: z.number(),
  score: z.number(),
  currentConfidence: confidenceSchema.nullable(),
  trend: z.array(z.number()).default([]),
});

export const publicObjectiveSchema = z.object({
  title: z.string(),
  score: z.number(),
  status: objectiveStatusSchema,
  keyResults: z.array(publicKeyResultSchema),
});

export const publicSummaryResponseSchema = z.object({
  teamName: z.string(),
  kpis: z.array(z.lazy(() => publicKpiSchema)).default([]),
  cycles: z.array(
    z.object({
      cycle: cycleResponseSchema.pick({ name: true, startsOn: true, endsOn: true }),
      elapsed: z.number(),
      objectives: z.array(publicObjectiveSchema),
    }),
  ),
});

export type PublicSummaryResponse = z.infer<typeof publicSummaryResponseSchema>;

// API tokens

export const createApiTokenRequestSchema = z.object({
  name: z.string().min(1).max(60),
});

export type CreateApiTokenRequest = z.infer<typeof createApiTokenRequestSchema>;

export const apiTokenResponseSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  name: z.string(),
  createdAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
});

export type ApiTokenResponse = z.infer<typeof apiTokenResponseSchema>;

// the ONLY response that ever carries the plaintext token
export const apiTokenCreatedResponseSchema = apiTokenResponseSchema.extend({
  token: z.string(),
});

export type ApiTokenCreatedResponse = z.infer<typeof apiTokenCreatedResponseSchema>;

// KR links (work-tracker bindings)

export const krLinkProviderSchema = z.enum(['github', 'jira']);
export const krLinkModeSchema = z.enum(['percent-closed', 'count-closed', 'count']);

export const githubLinkConfigSchema = z.union([
  z.object({ repo: z.string().regex(/^[^/\s]+\/[^/\s]+$/), milestoneNumber: z.number().int().positive() }),
  z.object({ repo: z.string().regex(/^[^/\s]+\/[^/\s]+$/), label: z.string().min(1) }),
]);

export const jiraLinkConfigSchema = z.object({
  baseUrl: z.url(),
  email: z.email(),
  jql: z.string().min(1).max(500),
});

export const upsertKrLinkRequestSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('github'),
    config: githubLinkConfigSchema,
    mode: krLinkModeSchema,
    secret: z.string().min(1),
    syncIntervalMinutes: z.number().int().min(5).max(1440).default(15),
  }),
  z.object({
    provider: z.literal('jira'),
    config: jiraLinkConfigSchema,
    mode: krLinkModeSchema,
    secret: z.string().min(1),
    syncIntervalMinutes: z.number().int().min(5).max(1440).default(15),
  }),
]);

export type UpsertKrLinkRequest = z.infer<typeof upsertKrLinkRequestSchema>;

export const krLinkResponseSchema = z.object({
  id: z.string(),
  keyResultId: z.string().nullable(),
  kpiId: z.string().nullable(),
  provider: krLinkProviderSchema,
  config: z.unknown(),
  mode: krLinkModeSchema,
  syncIntervalMinutes: z.number(),
  lastSyncedAt: z.iso.datetime().nullable(),
  lastError: z.string().nullable(),
  consecutiveFailures: z.number(),
});

export type KrLinkResponse = z.infer<typeof krLinkResponseSchema>;

// KPIs — cycle-less stability metrics, team-owned, computed health

export const kpiDirectionSchema = z.enum(['gte', 'lte', 'range']);
export const kpiHealthSchema = z.enum(['healthy', 'warning', 'breach']);

export type KpiHealthState = z.infer<typeof kpiHealthSchema>;

export const createKpiRequestSchema = z
  .object({
    name: z.string().min(1).max(120),
    unit: z.string().max(16).optional(),
    direction: kpiDirectionSchema,
    thresholdLow: z.number().optional(),
    thresholdHigh: z.number().optional(),
  })
  .refine(
    (k) =>
      k.direction === 'gte'
        ? k.thresholdLow !== undefined
        : k.direction === 'lte'
          ? k.thresholdHigh !== undefined
          : k.thresholdLow !== undefined && k.thresholdHigh !== undefined && k.thresholdLow < k.thresholdHigh,
    { message: 'thresholds must match direction (gte: low; lte: high; range: low < high)' },
  );

export type CreateKpiRequest = z.infer<typeof createKpiRequestSchema>;

export const kpiResponseSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  name: z.string(),
  unit: z.string().nullable(),
  direction: kpiDirectionSchema,
  thresholdLow: z.number().nullable(),
  thresholdHigh: z.number().nullable(),
  currentValue: z.number(),
  currentHealth: kpiHealthSchema.nullable(),
  archivedAt: z.iso.datetime().nullable(),
});

export type KpiResponse = z.infer<typeof kpiResponseSchema>;

export const createKpiReadingRequestSchema = z.object({
  value: z.number(),
  note: z.string().max(1000).optional(),
});

export type CreateKpiReadingRequest = z.infer<typeof createKpiReadingRequestSchema>;

export const kpiReadingResponseSchema = z.object({
  id: z.string(),
  kpiId: z.string(),
  value: z.number(),
  note: z.string().nullable(),
  authorUserId: z.string().nullable(),
  source: checkInSourceSchema,
  createdAt: z.iso.datetime(),
});

export type KpiReadingResponse = z.infer<typeof kpiReadingResponseSchema>;

// Public KPI strip — same no-leak stance as the rest of the share payload
export const publicKpiSchema = z.object({
  name: z.string(),
  unit: z.string().nullable(),
  currentValue: z.number(),
  currentHealth: kpiHealthSchema.nullable(),
  trend: z.array(z.number()), // oldest-first, last 12 readings
});

export type PublicKpi = z.infer<typeof publicKpiSchema>;

// Template library (wizard-lite) — see templates.ts
export * from './templates.js';

// AI drafting — BYO-key coach, suggestions never auto-create

export const setAiKeyRequestSchema = z.object({
  key: z.string().min(20).max(300),
});

export type SetAiKeyRequest = z.infer<typeof setAiKeyRequestSchema>;

export const aiKeyResponseSchema = z.object({
  teamId: z.string(),
  keyLast4: z.string(),
  createdAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime().nullable(),
});

export type AiKeyResponse = z.infer<typeof aiKeyResponseSchema>;

export const aiStatusResponseSchema = z.object({
  enabled: z.boolean(),
  keySource: z.enum(['team', 'instance']).nullable(),
});

export type AiStatusResponse = z.infer<typeof aiStatusResponseSchema>;

// One suggested KR — same field semantics as createKeyResultRequestSchema,
// plus the coaching rationale. Baselines are placeholder guesses.
export const aiKrSuggestionSchema = z.object({
  title: z.string().min(1).max(160),
  type: krTypeSchema,
  unit: z.string().max(16).nullable(),
  baseline: z.number(),
  target: z.number(),
  rationale: z.string().max(300),
});

export type AiKrSuggestion = z.infer<typeof aiKrSuggestionSchema>;

export const draftKrsRequestSchema = z.object({
  objectiveId: z.string(),
  context: z.string().max(2000).optional(),
});

export type DraftKrsRequest = z.infer<typeof draftKrsRequestSchema>;

export const draftKrsResponseSchema = z.object({
  suggestions: z.array(aiKrSuggestionSchema).min(2).max(3),
});

export type DraftKrsResponse = z.infer<typeof draftKrsResponseSchema>;

export const improveKrRequestSchema = z.object({
  objectiveId: z.string(),
  title: z.string().min(1).max(160),
  type: krTypeSchema,
  baseline: z.number().optional(),
  target: z.number().optional(),
});

export type ImproveKrRequest = z.infer<typeof improveKrRequestSchema>;

export const improveKrResponseSchema = z.object({
  critique: z.array(z.string()).min(1).max(5),
  rewrite: aiKrSuggestionSchema,
});

export type ImproveKrResponse = z.infer<typeof improveKrResponseSchema>;
