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

export const createCheckInRequestSchema = z.object({
  value: z.number(),
  confidence: confidenceSchema,
  note: z.string().max(1000).optional(),
});

export type CreateCheckInRequest = z.infer<typeof createCheckInRequestSchema>;

export const checkInResponseSchema = z.object({
  id: z.string(),
  keyResultId: z.string(),
  value: z.number(),
  confidence: confidenceSchema,
  note: z.string().nullable(),
  authorUserId: z.string(),
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
