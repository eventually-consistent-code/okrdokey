/**
 * Purpose: Auth wiring, split in two. sessionPlugin (global): cookie +
 *          session store + request.user decoration. addAuthGuard (scoped):
 *          the default-deny hook — registered ONLY on the API context so
 *          static assets and the SPA fallback stay reachable. Forgetting to
 *          mark an API route public still fails CLOSED.
 * Author(s): John Reed
 */

import cookie from '@fastify/cookie';
import session from '@fastify/session';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

import { users } from '../db/schema.js';
import { DrizzleSessionStore } from './session-store.js';

export interface SessionPluginOptions {
  sessionSecret: string;
}

export interface AuthGuardOptions {
  // extra origins allowed by the CSRF check (dev: the vite server)
  allowedOrigins?: string[];
}

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  createdAt: Date;
}

declare module 'fastify' {
  interface Session {
    userId?: string;
    oidc?: { state: string; verifier: string };
  }
  interface FastifyRequest {
    user: SessionUser | null;
  }
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Cross-site writes get rejected before any handler runs (CSRF layer;
// SameSite=Lax on the cookie is the other layer)
function crossSiteWrite(req: FastifyRequest, allowedOrigins: string[]): boolean {
  if (!UNSAFE_METHODS.has(req.method)) return false;

  const secFetchSite = req.headers['sec-fetch-site'];
  if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
    if (!req.headers.origin || !allowedOrigins.includes(req.headers.origin)) return true;
  }

  const origin = req.headers.origin;
  if (origin) {
    if (allowedOrigins.includes(origin)) return false;
    try {
      return new URL(origin).host !== req.headers.host;
    } catch {
      return true;
    }
  }
  return false;
}

async function sessionPluginImpl(
  app: FastifyInstance,
  opts: SessionPluginOptions,
): Promise<void> {
  await app.register(cookie);
  await app.register(session, {
    secret: opts.sessionSecret,
    store: new DrizzleSessionStore(app.db),
    cookieName: 'sessionId',
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      // 'auto' = Secure only when the connection is actually encrypted —
      // keeps docker-compose-up-on-localhost working while TLS deploys
      // (direct or via trusted proxy) still get Secure cookies
      secure: 'auto',
      maxAge: 1000 * 60 * 60 * 24 * 14,
    },
    saveUninitialized: false,
  });

  app.decorateRequest('user', null);
}

export const sessionPlugin = fp(sessionPluginImpl, { name: 'session' });

// Default-deny guard — add to the API context ONLY. Routes opt out with
// config: { public: true }.
export function addAuthGuard(api: FastifyInstance, opts: AuthGuardOptions = {}): void {
  const allowedOrigins = opts.allowedOrigins ?? [];

  api.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    if (crossSiteWrite(req, allowedOrigins)) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'ForbiddenError',
        message: 'cross-site request rejected',
      });
    }

    // unmatched routes fall through to fastify's 404 — a 401 would leak
    // which paths exist
    if (!req.routeOptions.url) return;

    const routeConfig = req.routeOptions.config as { public?: boolean } | undefined;
    const isPublic = routeConfig?.public === true;

    if (req.session.userId) {
      const row = api.db.select().from(users).where(eq(users.id, req.session.userId)).get();
      if (row) {
        req.user = {
          id: row.id,
          email: row.email,
          displayName: row.displayName,
          createdAt: row.createdAt,
        };
      }
    }

    if (!isPublic && !req.user) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'UnauthorizedError',
        message: 'authentication required',
      });
    }
  });
}
