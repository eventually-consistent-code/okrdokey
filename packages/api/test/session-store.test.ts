/**
 * Purpose: Unit tests for the Drizzle session store — the contract
 *          @fastify/session depends on (set/get/destroy), plus expiry
 *          handling and the sweep.
 * Author(s): John Reed
 */

import type { Session } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';

import { DrizzleSessionStore } from '../src/auth/session-store.js';
import { createDb, type DbHandle } from '../src/db/index.js';

let handle: DbHandle;
let store: DrizzleSessionStore;

function asSession(data: Record<string, unknown>): Session {
  return data as unknown as Session;
}

function get(sid: string): Promise<Session | null | undefined> {
  return new Promise((resolve, reject) => {
    store.get(sid, (err, session) => (err ? reject(err instanceof Error ? err : new Error('store error')) : resolve(session)));
  });
}

function set(sid: string, session: Session): Promise<void> {
  return new Promise((resolve, reject) => {
    store.set(sid, session, (err) => (err ? reject(err instanceof Error ? err : new Error('store error')) : resolve()));
  });
}

function destroy(sid: string): Promise<void> {
  return new Promise((resolve, reject) => {
    store.destroy(sid, (err) => (err ? reject(err instanceof Error ? err : new Error('store error')) : resolve()));
  });
}

beforeEach(() => {
  handle = createDb(':memory:');
  store = new DrizzleSessionStore(handle.db);
});

describe('DrizzleSessionStore', () => {
  it('round-trips a session', async () => {
    await set('sid-1', asSession({ userId: 'u1' }));
    const got = await get('sid-1');
    expect(got).toMatchObject({ userId: 'u1' });
  });

  it('upserts on repeat set', async () => {
    await set('sid-1', asSession({ userId: 'u1' }));
    await set('sid-1', asSession({ userId: 'u2' }));
    expect(await get('sid-1')).toMatchObject({ userId: 'u2' });
  });

  it('returns null for a missing session', async () => {
    expect(await get('nope')).toBeNull();
  });

  it('destroy removes the session', async () => {
    await set('sid-1', asSession({ userId: 'u1' }));
    await destroy('sid-1');
    expect(await get('sid-1')).toBeNull();
  });

  it('treats an expired session as gone and cleans it up', async () => {
    await set('sid-old', asSession({ userId: 'u1', cookie: { expires: new Date(Date.now() - 1000) } }));
    expect(await get('sid-old')).toBeNull();
    // second read hits the already-deleted row path
    expect(await get('sid-old')).toBeNull();
  });

  it('sweep deletes only expired rows', async () => {
    await set('sid-old', asSession({ userId: 'u1', cookie: { expires: new Date(Date.now() - 1000) } }));
    await set('sid-live', asSession({ userId: 'u2' }));
    const removed = store.sweep();
    expect(removed).toBe(1);
    expect(await get('sid-live')).toMatchObject({ userId: 'u2' });
  });
});

describe('scheduler exposure', () => {
  it('buildApp decorates the instance with the session store', async () => {
    const { buildApp } = await import('../src/app.js');
    const app = await buildApp({ dbPath: ':memory:', sessionSecret: 'test-secret-at-least-32-chars-long!!' });
    await app.ready();
    expect(app.sessionStore).toBeInstanceOf(DrizzleSessionStore);
    expect(app.sessionStore.sweep()).toBe(0);
    await app.close();
  });
});
