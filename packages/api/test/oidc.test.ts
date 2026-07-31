/**
 * Purpose: OIDC SSO integration tests — a mock identity provider (second local
 *          Fastify instance serving discovery/jwks/token with jose-signed ID
 *          tokens) drives the real login/callback routes end to end: new-user
 *          provisioning, verified-email linking, identity reuse, and the
 *          refusal paths.
 * Author(s): John Reed
 */

import type { OutgoingHttpHeaders } from 'node:http';

import { and, eq } from 'drizzle-orm';
import Fastify, { type FastifyInstance } from 'fastify';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { oidcIdentities, users } from '../src/db/schema.js';

const CLIENT_ID = 'okrdokey-test';
const CLIENT_SECRET = 'test-client-secret';
const REDIRECT_URI = 'http://localhost:3000/auth/oidc/callback';

// claims the mock provider bakes into the next id_token — tests reassign this
let idTokenClaims: {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
} = { sub: 'someone', email: 'someone@example.com', email_verified: true };

let app: FastifyInstance;
let provider: FastifyInstance;
let issuer: string;

// pulls "sessionId=..." out of a set-cookie header for replay
function cookieOf(res: { headers: OutgoingHttpHeaders }): string {
  const raw = res.headers['set-cookie'];
  const header = Array.isArray(raw) ? raw[0] : raw;
  return String(header).split(';')[0] ?? '';
}

// mock provider: discovery + jwks + token endpoint, signing with a
// jose-generated RS256 keypair. /authorize never renders — tests drive the
// callback directly with a captured state.
async function startMockProvider(): Promise<{ provider: FastifyInstance; issuer: string }> {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };

  const mock = Fastify({ logger: false });
  let base = '';

  // openid-client POSTs the token request form-encoded — teach the mock to eat it
  mock.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_req, body, done) => {
      done(null, Object.fromEntries(new URLSearchParams(String(body))));
    },
  );

  mock.get('/.well-known/openid-configuration', () => ({
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    jwks_uri: `${base}/jwks`,
    response_types_supported: ['code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    token_endpoint_auth_methods_supported: ['client_secret_post'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: ['openid', 'email', 'profile'],
  }));

  mock.get('/jwks', () => ({ keys: [jwk] }));

  mock.post('/token', async () => {
    const { sub, ...rest } = idTokenClaims;
    const idToken = await new SignJWT({ ...rest })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(base)
      .setSubject(sub)
      .setAudience(CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
    return {
      access_token: 'mock-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      id_token: idToken,
    };
  });

  await mock.listen({ port: 0, host: '127.0.0.1' });
  const address = mock.server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('mock provider has no port');
  }
  base = `http://127.0.0.1:${address.port}`;
  return { provider: mock, issuer: base };
}

// runs GET /auth/oidc/login and hands back what the callback needs
async function startLogin(): Promise<{ cookie: string; state: string; location: URL }> {
  const res = await app.inject({ method: 'GET', url: '/auth/oidc/login' });
  expect(res.statusCode).toBe(302);
  const location = new URL(String(res.headers.location));
  const state = location.searchParams.get('state') ?? '';
  return { cookie: cookieOf(res), state, location };
}

// full round trip: login → provider (skipped) → callback with the real state
async function completeLogin(): Promise<{
  statusCode: number;
  cookie: string;
  location: string;
}> {
  const { cookie, state } = await startLogin();
  const res = await app.inject({
    method: 'GET',
    url: `/auth/oidc/callback?code=fake-code&state=${encodeURIComponent(state)}`,
    headers: { cookie },
  });
  return {
    statusCode: res.statusCode,
    cookie: cookieOf(res),
    location: String(res.headers.location),
  };
}

beforeAll(async () => {
  const started = await startMockProvider();
  provider = started.provider;
  issuer = started.issuer;

  app = await buildApp({
    dbPath: ':memory:',
    sessionSecret: 'test-secret-at-least-32-chars-long!!',
    oidc: {
      issuerUrl: issuer,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      redirectUri: REDIRECT_URI,
    },
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await provider.close();
});

describe('login redirect', () => {
  it('302s to the provider with PKCE + state', async () => {
    const { location, state, cookie } = await startLogin();
    expect(location.origin).toBe(issuer);
    expect(location.pathname).toBe('/authorize');
    expect(location.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(location.searchParams.get('scope')).toBe('openid email profile');
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('code_challenge')).toBeTruthy();
    expect(state).toBeTruthy();
    expect(cookie).toMatch(/^sessionId=/);
  });
});

describe('callback — happy paths', () => {
  it('creates a new user (no password) on first login', async () => {
    idTokenClaims = {
      sub: 'oidc-user-1',
      email: 'fresh@example.com',
      email_verified: true,
      name: 'Fresh User',
    };
    const done = await completeLogin();
    expect(done.statusCode).toBe(302);
    expect(done.location).toBe('/');

    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: done.cookie },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ email: 'fresh@example.com', displayName: 'Fresh User' });

    const row = app.db.select().from(users).where(eq(users.email, 'fresh@example.com')).get();
    expect(row?.passwordHash).toBeNull();
  });

  it('links by verified email to an existing password account', async () => {
    const signup = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email: 'bob@example.com', password: 'correct-horse-battery', displayName: 'Bob' },
    });
    expect(signup.statusCode).toBe(201);

    idTokenClaims = {
      sub: 'oidc-bob',
      email: 'bob@example.com',
      email_verified: true,
      name: 'Bobby',
    };
    const done = await completeLogin();
    expect(done.statusCode).toBe(302);

    // logged in as the ORIGINAL account — no duplicate, display name kept
    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: done.cookie },
    });
    expect(me.json()).toMatchObject({ email: 'bob@example.com', displayName: 'Bob' });

    const rows = app.db.select().from(users).where(eq(users.email, 'bob@example.com')).all();
    expect(rows).toHaveLength(1);
    const link = app.db
      .select()
      .from(oidcIdentities)
      .where(and(eq(oidcIdentities.issuer, issuer), eq(oidcIdentities.subject, 'oidc-bob')))
      .get();
    expect(link?.userId).toBe(rows[0]?.id);
  });

  it('second login reuses the identity — no duplicate user or link', async () => {
    idTokenClaims = {
      sub: 'oidc-user-1',
      email: 'fresh@example.com',
      email_verified: true,
      name: 'Fresh User',
    };
    const done = await completeLogin();
    expect(done.statusCode).toBe(302);

    const userRows = app.db.select().from(users).where(eq(users.email, 'fresh@example.com')).all();
    expect(userRows).toHaveLength(1);
    const links = app.db
      .select()
      .from(oidcIdentities)
      .where(and(eq(oidcIdentities.issuer, issuer), eq(oidcIdentities.subject, 'oidc-user-1')))
      .all();
    expect(links).toHaveLength(1);
  });
});

describe('callback — refusal paths', () => {
  it('403s on unverified email and creates nothing', async () => {
    idTokenClaims = { sub: 'oidc-shady', email: 'shady@example.com', email_verified: false };
    const done = await completeLogin();
    expect(done.statusCode).toBe(403);

    expect(
      app.db.select().from(users).where(eq(users.email, 'shady@example.com')).all(),
    ).toHaveLength(0);
    expect(
      app.db.select().from(oidcIdentities).where(eq(oidcIdentities.subject, 'oidc-shady')).all(),
    ).toHaveLength(0);
  });

  it('400s on state mismatch', async () => {
    const { cookie } = await startLogin();
    const res = await app.inject({
      method: 'GET',
      url: '/auth/oidc/callback?code=fake-code&state=not-the-state-we-issued',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
  });

  it('400s when no login is in progress (no stashed verifier)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/oidc/callback?code=fake-code&state=whatever',
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('unconfigured OIDC', () => {
  it('routes do not exist without config — password auth only', async () => {
    const plain = await buildApp({
      dbPath: ':memory:',
      sessionSecret: 'test-secret-at-least-32-chars-long!!',
    });
    await plain.ready();
    try {
      expect((await plain.inject({ method: 'GET', url: '/auth/oidc/login' })).statusCode).toBe(404);
      expect((await plain.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    } finally {
      await plain.close();
    }
  });
});

describe('OpenAPI docs', () => {
  it('shows both OIDC routes under the auth tag', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs/json' });
    const spec = res.json<{
      paths: Record<string, { get?: { tags?: string[]; description?: string } }>;
    }>();
    expect(spec.paths['/auth/oidc/login']?.get?.tags).toContain('auth');
    expect(spec.paths['/auth/oidc/callback']?.get?.tags).toContain('auth');
    expect(spec.paths['/auth/oidc/login']?.get?.description).toBeTruthy();
  });
});
