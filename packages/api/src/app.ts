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

import rateLimit from '@fastify/rate-limit';
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

import { registerAiKeyRoutes } from './ai/keys.js';
import { registerAiRoutes } from './ai/routes.js';
import { registerOidcRoutes } from './auth/oidc.js';
import { addAuthGuard, sessionPlugin } from './auth/plugin.js';
import { registerAuthRoutes } from './auth/routes.js';
import { registerTokenRoutes } from './auth/tokens.js';
import { registerDigestRoutes } from './cadence/digest.js';
import { buildMailer, type Mailer } from './cadence/mailer.js';
import { registerReminderRoutes } from './cadence/reminders.js';
import type { AiConfig, OidcConfig, SmtpConfig } from './config.js';
import { registerLinkRoutes } from './connectors/links.js';
import { createDb, type Db } from './db/index.js';
import { registerCheckInRoutes } from './okr/check-ins.js';
import { registerCycleRoutes } from './okr/cycles.js';
import { registerHistoryRoutes } from './okr/history.js';
import { registerLifecycleRoutes } from './okr/lifecycle.js';
import { registerPortingRoutes } from './okr/porting.js';
import { registerKpiRoutes } from './okr/kpis.js';
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
  ai?: AiConfig;
  smtp?: SmtpConfig;
  mailer?: Mailer; // test seam — overrides the SMTP transport
}

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    mailer: Mailer | null;
  }
}

// Builds the whole app — swagger, error handling, routes, db — ready to listen
export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      process.env.NODE_ENV === 'test'
        ? false
        : {
            level: process.env.LOG_LEVEL ?? 'info',
            // AI prompts and keys never reach the logs — redaction is
            // instance-global in pino, so it lives here, not per-route
            redact: {
              paths: [
                'req.body.context',
                'req.body.title',
                'req.body.key',
                '*.apiKey',
                '*.anthropicKey',
              ],
              remove: true,
            },
          },
    // reverse proxies terminate TLS for most self-hosts; trust their
    // x-forwarded-proto so secure:'auto' cookies come out right
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Database — one connection for the process, migrations applied on open
  const dbHandle = createDb(opts.dbPath);
  app.decorate('db', dbHandle.db);
  // one mailer for the process — null means email features are dark
  app.decorate('mailer', opts.mailer ?? (opts.smtp ? buildMailer(opts.smtp) : null));
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
          bearerAuth: { type: 'http', scheme: 'bearer', description: 'okr_ team API token' },
        },
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  // Rate limiting — global:false means nothing is limited unless a route
  // opts in via config.rateLimit (public share + login/signup only).
  // Default keyGenerator uses request.ip, which trustProxy resolves; the
  // default in-memory store matches the one-process deployment.
  await app.register(rateLimit, { global: false });

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
      handler: () => ({ status: 'ok' as const, version: API_VERSION, email: app.mailer !== null }),
    });

    registerAuthRoutes(api);
    registerTeamRoutes(api);
    registerCycleRoutes(api);
    registerLifecycleRoutes(api);
    registerPortingRoutes(api);
    registerOkrRoutes(api);
    registerHistoryRoutes(api);
    registerCheckInRoutes(api);
    registerReminderRoutes(api);
    if (api.mailer) {
      registerDigestRoutes(api, api.mailer);
    }
    registerSummaryRoutes(api);
    registerShareRoutes(api);
    registerKpiRoutes(api);
    registerTokenRoutes(api);
    registerLinkRoutes(api, {
      sessionSecret: opts.sessionSecret ?? 'dev-only-secret-do-not-use-in-production!!',
    });
    if (opts.ai?.enabled) {
      const aiOpts = {
        ai: opts.ai,
        sessionSecret: opts.sessionSecret ?? 'dev-only-secret-do-not-use-in-production!!',
      };
      registerAiKeyRoutes(api, aiOpts);
      registerAiRoutes(api, aiOpts);
    }

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
