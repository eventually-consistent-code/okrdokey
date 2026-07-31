/**
 * Purpose: OIDC SSO routes — login kicks off the authorization code flow
 *          (PKCE + state), callback validates everything and maps the external
 *          identity to a local account. Linking by email happens ONLY when the
 *          provider vouches for it (email_verified: true).
 * Author(s): John Reed
 */

import { errorResponseSchema } from '@okrdokey/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import * as oidc from 'openid-client';
import { z } from 'zod';

import type { OidcConfig } from '../config.js';
import { oidcIdentities, users } from '../db/schema.js';

// Providers tack extra params onto the callback (iss, session_state, ...) —
// take them all, openid-client validates what matters
const callbackQuerySchema = z.looseObject({
  code: z.string().optional(),
  state: z.string().optional(),
});

// Finds the local user for a validated set of ID token claims — by existing
// identity link first, then by verified email, else a brand-new account.
// Returns the user id to log in as.
function resolveUser(
  app: FastifyInstance,
  claims: { iss: string; sub: string; email: string; name?: string },
): string {
  const identity = app.db
    .select()
    .from(oidcIdentities)
    .where(and(eq(oidcIdentities.issuer, claims.iss), eq(oidcIdentities.subject, claims.sub)))
    .get();
  if (identity) return identity.userId;

  const now = new Date();
  let userId: string;

  const existing = app.db.select().from(users).where(eq(users.email, claims.email)).get();
  if (existing) {
    // same verified email → link the identity to the existing account
    userId = existing.id;
  } else {
    // first visit — provision an account with no password (OIDC-only)
    userId = crypto.randomUUID();
    app.db
      .insert(users)
      .values({
        id: userId,
        email: claims.email,
        displayName: claims.name ?? claims.email.split('@')[0] ?? claims.email,
        passwordHash: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  app.db
    .insert(oidcIdentities)
    .values({
      id: crypto.randomUUID(),
      userId,
      issuer: claims.iss,
      subject: claims.sub,
      createdAt: now,
    })
    .run();

  return userId;
}

// Registered from app.ts only when config.oidc is present — absent config
// means these routes simply don't exist (404), password auth untouched
export function registerOidcRoutes(app: FastifyInstance, cfg: OidcConfig): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // Discovery is lazy (first login request) and cached for the process —
  // boot never blocks on the identity provider being reachable
  let discovered: oidc.Configuration | undefined;
  async function provider(): Promise<oidc.Configuration> {
    if (!discovered) {
      const issuer = new URL(cfg.issuerUrl);
      discovered = await oidc.discovery(
        issuer,
        cfg.clientId,
        cfg.clientSecret,
        undefined,
        // plain-http issuers only exist in dev/test (mock providers)
        issuer.protocol === 'http:' ? { execute: [oidc.allowInsecureRequests] } : undefined,
      );
    }
    return discovered;
  }

  r.route({
    method: 'GET',
    url: '/auth/oidc/login',
    config: { public: true },
    schema: {
      description:
        'Start OIDC single sign-on — redirects to the identity provider (authorization code flow with PKCE)',
      tags: ['auth'],
    },
    handler: async (req, reply) => {
      const config = await provider();

      // fresh PKCE verifier + state for every attempt, stashed server-side
      const verifier = oidc.randomPKCECodeVerifier();
      const challenge = await oidc.calculatePKCECodeChallenge(verifier);
      const state = oidc.randomState();
      req.session.oidc = { state, verifier };

      const redirectTo = oidc.buildAuthorizationUrl(config, {
        redirect_uri: cfg.redirectUri,
        scope: 'openid email profile',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
      });
      return reply.redirect(redirectTo.href, 302);
    },
  });

  r.route({
    method: 'GET',
    url: '/auth/oidc/callback',
    config: { public: true },
    schema: {
      description:
        'OIDC provider redirect target — validates state, PKCE, and the ID token, then logs the user in (linking or creating an account by verified email)',
      tags: ['auth'],
      querystring: callbackQuerySchema,
      response: { 400: errorResponseSchema, 403: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const stash = req.session.oidc;
      // one-shot: whatever happens next, this verifier/state pair is spent
      req.session.oidc = undefined;
      if (!stash) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'BadRequestError',
          message: 'no OIDC login in progress',
        });
      }

      const config = await provider();

      // validates state, exchanges the code (PKCE), verifies the ID token
      let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
      try {
        tokens = await oidc.authorizationCodeGrant(config, new URL(req.url, cfg.redirectUri), {
          pkceCodeVerifier: stash.verifier,
          expectedState: stash.state,
          idTokenExpected: true,
        });
      } catch (err) {
        req.log.warn({ err }, 'oidc callback rejected');
        return reply.status(400).send({
          statusCode: 400,
          error: 'BadRequestError',
          message: 'OIDC callback rejected — state mismatch or invalid grant',
        });
      }

      const claims = tokens.claims();
      const email = claims?.email;
      // the provider must vouch for the email before we trust it for linking
      if (!claims || typeof email !== 'string' || claims.email_verified !== true) {
        return reply.status(403).send({
          statusCode: 403,
          error: 'ForbiddenError',
          message: 'OIDC provider did not supply a verified email',
        });
      }

      const userId = resolveUser(app, {
        iss: claims.iss,
        sub: claims.sub,
        email,
        name: typeof claims.name === 'string' && claims.name ? claims.name : undefined,
      });

      // logged in — fresh session id (fixation defense), same as password login
      await req.session.regenerate();
      req.session.userId = userId;
      return reply.redirect('/', 302);
    },
  });
}
