/**
 * Purpose: Fastify app factory. Wires the Zod type provider, OpenAPI docs
 *          (generated from route schemas — never hand-written), the shared
 *          error shape, every API route inside a default-deny context, and
 *          the built web UI (static + SPA fallback) outside it. Tests build
 *          the same app the server runs; no divergence.
 * Author(s): John Reed
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { errorResponseSchema, healthResponseSchema } from '@okrdokey/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';

import { registerOidcRoutes } from './auth/oidc.js';
import { addAuthGuard, sessionPlugin } from './auth/plugin.js';
import { registerAuthRoutes } from './auth/routes.js';
import { registerReminderRoutes } from './cadence/reminders.js';
import type { OidcConfig } from './config.js';
import { createDb, type Db } from './db/index.js';
import { registerCheckInRoutes } from './okr/check-ins.js';
import { registerCycleRoutes } from './okr/cycles.js';
import { registerOkrRoutes } from './okr/routes.js';
import { registerShareRoutes } from './okr/share.js';
import { registerSummaryRoutes } from './okr/summary.js';
import { registerTeamRoutes } from './teams/routes.js';

const API_VERSION = '0.1.0';

const DEFAULT_WEB_DIST = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'dist');

export interface BuildAppOptions {
  dbPath: string;
  sessionSecret?: string;
  oidc?: OidcConfig;
  allowedOrigins?: string[];
  webDistPath?: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
  }
}

// Builds the whole app — swagger, error handling, routes, db — ready to listen
export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env.NODE_ENV === 'test' ? false : { level: process.env.LOG_LEVEL ?? 'info' },
    // reverse proxies terminate TLS for most self-hosts; trust their
    // x-forwarded-proto so secure:'auto' cookies come out right
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Database — one connection for the process, migrations applied on open
  const dbHandle = createDb(opts.dbPath);
  app.decorate('db', dbHandle.db);
  app.addHook('onClose', () => {
    dbHandle.close();
  });

  // Sessions are global (cookie parsing hurts nothing on static assets);
  // the default-deny guard is NOT — it lives on the API context below.
  await app.register(sessionPlugin, {
    sessionSecret: opts.sessionSecret ?? 'dev-only-secret-do-not-use-in-production!!',
  });

  // OpenAPI — generated from the Zod route schemas, served at /docs
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'OKRdokey API',
        description: 'Simple, self-hostable OKR tracker.',
        version: API_VERSION,
      },
      components: {
        securitySchemes: {
          cookieAuth: { type: 'apiKey', in: 'cookie', name: 'sessionId' },
        },
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  // Every error leaves in the same shared shape
  app.setErrorHandler((err: unknown, _req, reply) => {
    const error = err instanceof Error ? err : new Error(String(err));
    const maybeStatus = (error as { statusCode?: unknown }).statusCode;
    const statusCode = typeof maybeStatus === 'number' ? maybeStatus : 500;
    if (statusCode >= 500) {
      app.log.error(error);
    }
    return reply.status(statusCode).send({
      statusCode,
      error: error.name,
      message: statusCode >= 500 ? 'Internal Server Error' : error.message,
    });
  });

  // API context — everything in here sits behind the default-deny guard
  // eslint-disable-next-line @typescript-eslint/require-await -- fastify plugins must be async
  await app.register(async (api) => {
    addAuthGuard(api, { allowedOrigins: opts.allowedOrigins });

    api.route({
      method: 'GET',
      url: '/health',
      config: { public: true },
      schema: {
        description: 'Liveness check',
        tags: ['system'],
        response: {
          200: healthResponseSchema,
          500: errorResponseSchema,
        },
      },
      handler: () => ({ status: 'ok' as const, version: API_VERSION }),
    });

    registerAuthRoutes(api);
    registerTeamRoutes(api);
    registerCycleRoutes(api);
    registerOkrRoutes(api);
    registerCheckInRoutes(api);
    registerReminderRoutes(api);
    registerSummaryRoutes(api);
    registerShareRoutes(api);

    // OIDC is opt-in — no config, no routes (they 404), password auth untouched
    if (opts.oidc) {
      registerOidcRoutes(api, opts.oidc);
    }
  });

  // Web UI — built SPA served from the same process, outside the guard.
  // Missing dist (tests, API-only dev) just means no static routes.
  const webDist = opts.webDistPath ?? DEFAULT_WEB_DIST;
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist });
  }

  // SPA fallback: browsers get index.html, API consumers keep JSON 404s
  app.setNotFoundHandler((req, reply) => {
    const wantsHtml = req.method === 'GET' && (req.headers.accept ?? '').includes('text/html');
    if (wantsHtml && existsSync(join(webDist, 'index.html'))) {
      return reply.type('text/html').sendFile('index.html');
    }
    return reply
      .status(404)
      .send({ statusCode: 404, error: 'NotFoundError', message: 'not found' });
  });

  return app;
}
