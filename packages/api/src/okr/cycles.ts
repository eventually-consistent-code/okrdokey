/**
 * Purpose: Cycle routes — first-class date ranges. Quarters get a seeding
 *          helper; the schema happily holds any range (H1, 6-week, whatever).
 * Author(s): John Reed
 */

import {
  createCycleRequestSchema,
  cycleResponseSchema,
  errorResponseSchema,
} from '@okrdokey/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { cycles } from '../db/schema.js';

type CycleRow = typeof cycles.$inferSelect;

function toResponse(c: CycleRow): z.infer<typeof cycleResponseSchema> {
  return { id: c.id, name: c.name, startsOn: c.startsOn, endsOn: c.endsOn, status: c.status };
}

// "2026-Q3" → the quarter's date range; returns null on a non-quarter name
export function quarterRange(name: string): { startsOn: string; endsOn: string } | null {
  const m = /^(\d{4})-Q([1-4])$/.exec(name);
  if (!m) return null;
  const year = Number(m[1]);
  const q = Number(m[2]);
  const startMonth = (q - 1) * 3; // 0-indexed
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 0)); // day 0 = last of prev month
  const iso = (d: Date): string => d.toISOString().slice(0, 10);
  return { startsOn: iso(start), endsOn: iso(end) };
}

export function registerCycleRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.route({
    method: 'POST',
    url: '/cycles',
    schema: {
      description:
        'Create a cycle. A quarter name like 2026-Q3 fills the date range automatically.',
      tags: ['cycles'],
      security: [{ cookieAuth: [] }],
      body: createCycleRequestSchema.partial({ startsOn: true, endsOn: true }),
      response: { 201: cycleResponseSchema, 400: errorResponseSchema, 409: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const { name } = req.body;
      let { startsOn, endsOn } = req.body;

      if (!startsOn || !endsOn) {
        const range = quarterRange(name);
        if (!range) {
          return reply.status(400).send({
            statusCode: 400,
            error: 'BadRequestError',
            message: 'startsOn/endsOn required unless name is a quarter like 2026-Q3',
          });
        }
        startsOn = startsOn ?? range.startsOn;
        endsOn = endsOn ?? range.endsOn;
      }
      if (endsOn < startsOn) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'BadRequestError',
          message: 'endsOn must not precede startsOn',
        });
      }
      if (app.db.select().from(cycles).where(eq(cycles.name, name)).get()) {
        return reply
          .status(409)
          .send({ statusCode: 409, error: 'ConflictError', message: 'cycle already exists' });
      }

      const row: CycleRow = {
        id: crypto.randomUUID(),
        name,
        startsOn,
        endsOn,
        status: 'open',
        createdAt: new Date(),
      };
      app.db.insert(cycles).values(row).run();
      return reply.status(201).send(toResponse(row));
    },
  });

  r.route({
    method: 'GET',
    url: '/cycles',
    schema: {
      description: 'List cycles',
      tags: ['cycles'],
      security: [{ cookieAuth: [] }],
      response: { 200: z.array(cycleResponseSchema) },
    },
    handler: () => app.db.select().from(cycles).all().map(toResponse),
  });

  r.route({
    method: 'GET',
    url: '/cycles/:cycleId',
    schema: {
      description: 'Get one cycle',
      tags: ['cycles'],
      security: [{ cookieAuth: [] }],
      params: z.object({ cycleId: z.string() }),
      response: { 200: cycleResponseSchema, 404: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const row = app.db.select().from(cycles).where(eq(cycles.id, req.params.cycleId)).get();
      if (!row) {
        return reply
          .status(404)
          .send({ statusCode: 404, error: 'NotFoundError', message: 'no such cycle' });
      }
      return toResponse(row);
    },
  });
}
