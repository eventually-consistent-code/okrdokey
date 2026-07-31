/**
 * Purpose: Unit tests for the shared Zod schemas — the contract both API and
 *          web UI depend on.
 * Author(s): John Reed
 */

import { describe, expect, it } from 'vitest';

import { errorResponseSchema, healthResponseSchema } from '../src/index.js';

describe('healthResponseSchema', () => {
  it('accepts a valid health payload', () => {
    const parsed = healthResponseSchema.parse({ status: 'ok', version: '0.1.0' });
    expect(parsed.status).toBe('ok');
  });

  it('rejects a bad status', () => {
    expect(() => healthResponseSchema.parse({ status: 'nope', version: '0.1.0' })).toThrow();
  });
});

describe('errorResponseSchema', () => {
  it('accepts the standard error shape', () => {
    const parsed = errorResponseSchema.parse({
      statusCode: 404,
      error: 'NotFoundError',
      message: 'no such thing',
    });
    expect(parsed.statusCode).toBe(404);
  });
});
