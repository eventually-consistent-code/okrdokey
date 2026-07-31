/**
 * Purpose: apiFetch contract tests — schema parsing at the boundary and the
 *          401 → UnauthorizedError path the whole auth story hangs on.
 * Author(s): John Reed
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ApiError, apiFetch, UnauthorizedError } from '../src/api.js';

const schema = z.object({ ok: z.boolean() });

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    ),
  );
}

describe('apiFetch', () => {
  it('parses a good response through the schema', async () => {
    stubFetch(200, { ok: true });
    await expect(apiFetch('/x', schema)).resolves.toEqual({ ok: true });
  });

  it('throws UnauthorizedError on 401', async () => {
    stubFetch(401, { statusCode: 401 });
    await expect(apiFetch('/x', schema)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('throws ApiError with the server message on other failures', async () => {
    stubFetch(409, { statusCode: 409, message: 'cycle already exists' });
    await expect(apiFetch('/x', schema)).rejects.toThrow('cycle already exists');
  });

  it('rejects drifted payloads instead of passing them through', async () => {
    stubFetch(200, { ok: 'yes-but-wrong-type' });
    await expect(apiFetch('/x', schema)).rejects.toThrow();
  });

  it('exposes status codes on ApiError', async () => {
    stubFetch(500, {});
    await expect(apiFetch('/x', schema)).rejects.toMatchObject({ statusCode: 500 });
    await expect(apiFetch('/x', schema)).rejects.toBeInstanceOf(ApiError);
  });
});
