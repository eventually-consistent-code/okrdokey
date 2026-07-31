/**
 * Purpose: Auth wiring — cookie + session plugins, the Drizzle session store,
 *          and the default-deny authorization hook. Forgetting to mark a route
 *          public fails CLOSED (401), never open.
 * Author(s): John Reed
 */

import cookie from '@fastify/cookie';
import session from '@fastify/session';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

import { users } from '../db/schema.js';
import { DrizzleSessionStore } from './session-store.js';

export interface AuthPluginOptions {
  sessionSecret: string;
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
function crossSiteWrite(req: FastifyRequest): boolean {
  if (!UNSAFE_METHODS.has(req.method)) return false;

  const secFetchSite = req.headers['sec-fetch-site'];
  if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') return true;

  const origin = req.headers.origin;
  if (origin) {
    try {
      return new URL(origin).host !== req.headers.host;
    } catch {
      return true;
    }
  }
  return false;
}

async function authPlugin(app: FastifyInstance, opts: AuthPluginOptions): Promise<void> {
  await app.register(cookie);
  await app.register(session, {
    secret: opts.sessionSecret,
    store: new DrizzleSessionStore(app.db),
    cookieName: 'sessionId',
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 14,
    },
    saveUninitialized: false,
  });

  app.decorateRequest('user', null);

  // Default-deny: every route is protected unless it opts out with
  // config: { public: true }. /docs stays open (swagger-ui registers its own
  // routes and can't carry our config).
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    if (crossSiteWrite(req)) {
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
    const isPublic = routeConfig?.public === true || req.url === '/docs' || req.url.startsWith('/docs/');

    if (req.session.userId) {
      const row = app.db.select().from(users).where(eq(users.id, req.session.userId)).get();
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

export default fp(authPlugin, { name: 'auth' });
