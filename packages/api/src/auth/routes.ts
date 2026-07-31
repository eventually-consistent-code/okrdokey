/**
 * Purpose: Password auth routes — signup, login, logout, me. Argon2id for
 *          hashing, session regenerated on every privilege change, and one
 *          uniform "invalid credentials" answer so the API never leaks which
 *          emails exist.
 * Author(s): John Reed
 */

import { errorResponseSchema, loginRequestSchema, signupRequestSchema, userResponseSchema } from '@okrdokey/shared';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { users } from '../db/schema.js';
import type { SessionUser } from './plugin.js';

// OWASP recommended tier for Argon2id
const ARGON2_OPTS = {
  type: argon2.argon2id,
  memoryCost: 47104,
  timeCost: 1,
  parallelism: 1,
} as const;

function toUserResponse(user: SessionUser): {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
} {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt.toISOString(),
  };
}

export function registerAuthRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.route({
    method: 'POST',
    url: '/auth/signup',
    config: { public: true },
    schema: {
      description: 'Create an account and start a session',
      tags: ['auth'],
      body: signupRequestSchema,
      response: { 201: userResponseSchema, 409: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const { email, password, displayName } = req.body;
      const existing = app.db.select().from(users).where(eq(users.email, email)).get();
      if (existing) {
        return reply.status(409).send({
          statusCode: 409,
          error: 'ConflictError',
          message: 'account already exists',
        });
      }

      const now = new Date();
      const user = {
        id: crypto.randomUUID(),
        email,
        displayName,
        passwordHash: await argon2.hash(password, ARGON2_OPTS),
        createdAt: now,
        updatedAt: now,
      };
      app.db.insert(users).values(user).run();

      await req.session.regenerate();
      req.session.userId = user.id;
      return reply.status(201).send(toUserResponse({ ...user, createdAt: now }));
    },
  });

  r.route({
    method: 'POST',
    url: '/auth/login',
    config: { public: true },
    schema: {
      description: 'Log in with email + password',
      tags: ['auth'],
      body: loginRequestSchema,
      response: { 200: userResponseSchema, 401: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const { email, password } = req.body;
      const row = app.db.select().from(users).where(eq(users.email, email)).get();

      // Same answer whether the email is unknown or the password is wrong
      const ok = row?.passwordHash ? await argon2.verify(row.passwordHash, password) : false;
      if (!row || !ok) {
        return reply.status(401).send({
          statusCode: 401,
          error: 'UnauthorizedError',
          message: 'invalid credentials',
        });
      }

      await req.session.regenerate();
      req.session.userId = row.id;
      return reply.send(
        toUserResponse({
          id: row.id,
          email: row.email,
          displayName: row.displayName,
          createdAt: row.createdAt,
        }),
      );
    },
  });

  r.route({
    method: 'POST',
    url: '/auth/logout',
    schema: {
      description: 'End the current session',
      tags: ['auth'],
      security: [{ cookieAuth: [] }],
      response: { 204: z.null() },
    },
    handler: async (req, reply) => {
      await req.session.destroy();
      return reply.status(204).send(null);
    },
  });

  r.route({
    method: 'GET',
    url: '/auth/me',
    schema: {
      description: 'Current user',
      tags: ['auth'],
      security: [{ cookieAuth: [] }],
      response: { 200: userResponseSchema, 401: errorResponseSchema },
    },
    handler: (req) => {
      // hook guarantees user is set on protected routes
      return toUserResponse(req.user as SessionUser);
    },
  });
}
