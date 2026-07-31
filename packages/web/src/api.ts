/**
 * Purpose: The one typed door to the API. Every response gets parsed with
 *          the shared Zod schema at the boundary — API/UI drift dies here,
 *          not three components deep. 401s throw UnauthorizedError and the
 *          query layer routes them to /login.
 * Author(s): John Reed
 */

import type { z } from 'zod';

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class UnauthorizedError extends ApiError {
  constructor() {
    super(401, 'authentication required');
    this.name = 'UnauthorizedError';
  }
}

export async function apiFetch<S extends z.ZodType>(
  path: string,
  schema: S,
  init?: RequestInit,
): Promise<z.output<S>> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    ...init,
  });

  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(res.status, body?.message ?? `request failed (${res.status})`);
  }
  if (res.status === 204) return schema.parse(null);
  return schema.parse(await res.json());
}
