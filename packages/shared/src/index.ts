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
