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
