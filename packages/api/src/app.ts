/**
 * Purpose: Fastify app factory. Wires the Zod type provider, OpenAPI docs
 *          (generated from route schemas — never hand-written), the shared
 *          error shape, and every route. Tests build the same app the server
 *          runs; no divergence.
 * Author(s): John Reed
 */

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

import authPlugin from './auth/plugin.js';
import { registerAuthRoutes } from './auth/routes.js';
import { createDb, type Db } from './db/index.js';

const API_VERSION = '0.1.0';

export interface BuildAppOptions {
  dbPath: string;
  sessionSecret?: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
  }
}

// Builds the whole app — swagger, error handling, routes, db — ready to listen
export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      process.env.NODE_ENV === 'test' ? false : { level: process.env.LOG_LEVEL ?? 'info' },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Database — one connection for the process, migrations applied on open
  const dbHandle = createDb(opts.dbPath);
  app.decorate('db', dbHandle.db);
  app.addHook('onClose', () => {
    dbHandle.close();
  });

  // Auth — cookie, session store, default-deny hook (order matters: before
  // routes register)
  await app.register(authPlugin, {
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

  // Routes

  app.route({
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

  registerAuthRoutes(app);

  return app;
}
