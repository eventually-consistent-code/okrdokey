/**
 * Purpose: Data in, data out. Export everything the caller can see —
 *          JSON for completeness (archived included: it's a backup),
 *          CSV in exactly the import columns so a round-trip works by
 *          construction. Import is one CSV, one row per KR, names not
 *          ids, dry-run first, and all-or-nothing on write.
 * Author(s): John Reed
 */

import {
  errorResponseSchema,
  exportResponseSchema,
  IMPORT_COLUMNS,
  importRequestSchema,
  importResponseSchema,
  type ExportResponse,
  type ImportResponse,
} from '@okrdokey/shared';
import { asc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { checkIns, cycles, keyResults, kpiReadings, kpis, objectives, teamMembers, teams } from '../db/schema.js';
import { parseCsv, toCsv } from '../lib/csv.js';

const COLUMNS = [...IMPORT_COLUMNS];

interface Visible {
  myTeams: Map<string, string>; // teamId → name
  objectives: (typeof objectives.$inferSelect)[];
  cycleNames: Map<string, string>; // cycleId → name
}

// Everything the caller can see: personal + my-team objectives,
// archived INCLUDED (export is a backup, not a dashboard)
function visibleData(app: FastifyInstance, userId: string): Visible {
  const myTeams = new Map(
    app.db
      .select({ teamId: teamMembers.teamId, name: teams.name })
      .from(teamMembers)
      .innerJoin(teams, eq(teams.id, teamMembers.teamId))
      .where(eq(teamMembers.userId, userId))
      .all()
      .map((t) => [t.teamId, t.name]),
  );
  const objs = app.db
    .select()
    .from(objectives)
    .all()
    .filter((o) => (o.teamId === null ? o.ownerUserId === userId : myTeams.has(o.teamId)));
  const cycleNames = new Map(
    app.db
      .select({ id: cycles.id, name: cycles.name })
      .from(cycles)
      .all()
      .map((c) => [c.id, c.name]),
  );
  return { myTeams, objectives: objs, cycleNames };
}

function exportObjectives(app: FastifyInstance, v: Visible): ExportResponse['objectives'] {
  return v.objectives.map((o) => {
    const krs = app.db.select().from(keyResults).where(eq(keyResults.objectiveId, o.id)).all();
    return {
      title: o.title,
      description: o.description,
      teamName: o.teamId === null ? null : (v.myTeams.get(o.teamId) ?? null),
      cycleName: v.cycleNames.get(o.cycleId) ?? '',
      archivedAt: o.archivedAt ? o.archivedAt.toISOString() : null,
      keyResults: krs.map((kr) => ({
        title: kr.title,
        type: kr.type,
        unit: kr.unit,
        baseline: kr.baseline,
        target: kr.target,
        currentValue: kr.currentValue,
        currentConfidence: kr.currentConfidence,
        checkIns: app.db
          .select()
          .from(checkIns)
          .where(eq(checkIns.keyResultId, kr.id))
          .orderBy(asc(checkIns.createdAt), asc(sql`rowid`))
          .all()
          .map((c) => ({
            value: c.value,
            confidence: c.confidence,
            note: c.note,
            source: c.source,
            createdAt: c.createdAt.toISOString(),
          })),
      })),
    };
  });
}

export function registerPortingRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.route({
    method: 'GET',
    url: '/export',
    schema: {
      description:
        'Everything you can see, as JSON — objectives with KRs and full check-in history, cycles, team KPIs with readings. Archived included: this is a backup.',
      tags: ['data'],
      security: [{ cookieAuth: [] }],
      response: { 200: exportResponseSchema },
    },
    handler: (req) => {
      const user = req.user as { id: string };
      const v = visibleData(app, user.id);
      const myKpis = app.db
        .select()
        .from(kpis)
        .all()
        .filter((k) => v.myTeams.has(k.teamId))
        .map((k) => ({
          name: k.name,
          unit: k.unit,
          teamName: v.myTeams.get(k.teamId) ?? '',
          currentValue: k.currentValue,
          readings: app.db
            .select()
            .from(kpiReadings)
            .where(eq(kpiReadings.kpiId, k.id))
            .orderBy(asc(kpiReadings.createdAt), asc(sql`rowid`))
            .all()
            .map((rd) => ({ value: rd.value, createdAt: rd.createdAt.toISOString() })),
        }));

      return {
        exportedAt: new Date().toISOString(),
        cycles: app.db
          .select()
          .from(cycles)
          .all()
          .map((c) => ({ id: c.id, name: c.name, startsOn: c.startsOn, endsOn: c.endsOn, status: c.status })),
        objectives: exportObjectives(app, v),
        kpis: myKpis,
      };
    },
  });

  r.route({
    method: 'GET',
    url: '/export.csv',
    schema: {
      description:
        'Objectives + key results as CSV in exactly the import columns — export here, import there, round-trip by construction.',
      tags: ['data'],
      security: [{ cookieAuth: [] }],
    },
    handler: (req, reply) => {
      const user = req.user as { id: string };
      const v = visibleData(app, user.id);
      const rows: (string | number | null)[][] = [];
      for (const o of exportObjectives(app, v)) {
        if (o.keyResults.length === 0) {
          rows.push([o.title, o.description, o.teamName, o.cycleName, '', '', '', '', '']);
        }
        for (const kr of o.keyResults) {
          rows.push([
            o.title,
            o.description,
            o.teamName,
            o.cycleName,
            kr.title,
            kr.type,
            kr.unit,
            kr.baseline,
            kr.target,
          ]);
        }
      }
      return reply
        .type('text/csv; charset=utf-8')
        .header('content-disposition', 'attachment; filename="okrdokey-export.csv"')
        .send(toCsv(COLUMNS, rows));
    },
  });

  r.route({
    method: 'POST',
    url: '/import/objectives',
    schema: {
      description:
        'Import objectives + key results from CSV (one row per KR; consecutive rows sharing objective_title+team_name+cycle_name group into one objective). dryRun=true previews without writing. Any error writes nothing.',
      tags: ['data'],
      security: [{ cookieAuth: [] }],
      querystring: z.object({ dryRun: z.coerce.boolean().default(false) }),
      body: importRequestSchema,
      response: { 200: importResponseSchema, 400: errorResponseSchema },
    },
    // eslint-disable-next-line @typescript-eslint/require-await -- reply-branching handlers must be async for the type provider
    handler: async (req) => {
      const user = req.user as { id: string };
      const { records, errors: parseErrors } = parseCsv(req.body.csv, COLUMNS);
      const errors: ImportResponse['errors'] = [...parseErrors];

      const myTeams = new Map(
        app.db
          .select({ teamId: teamMembers.teamId, name: teams.name })
          .from(teamMembers)
          .innerJoin(teams, eq(teams.id, teamMembers.teamId))
          .where(eq(teamMembers.userId, user.id))
          .all()
          .map((t) => [t.name, t.teamId]),
      );
      const cycleIds = new Map(
        app.db
          .select({ id: cycles.id, name: cycles.name })
          .from(cycles)
          .all()
          .map((c) => [c.name, c.id]),
      );

      interface Group {
        line: number;
        title: string;
        description: string | null;
        teamName: string | null;
        cycleName: string;
        krs: { line: number; title: string; type: string; unit: string | null; baseline: string; target: string }[];
      }
      const groups: Group[] = [];
      for (const rec of records) {
        const f = rec.fields;
        const title = (f.objective_title ?? '').trim();
        if (!title) {
          errors.push({ line: rec.line, message: 'objective_title is required' });
          continue;
        }
        const teamName = (f.team_name ?? '').trim() || null;
        const cycleName = (f.cycle_name ?? '').trim();
        const last = groups.at(-1);
        const sameGroup =
          last && last.title === title && last.teamName === teamName && last.cycleName === cycleName;
        const group: Group = sameGroup
          ? last
          : {
              line: rec.line,
              title,
              description: (f.objective_description ?? '').trim() || null,
              teamName,
              cycleName,
              krs: [],
            };
        if (!sameGroup) groups.push(group);

        const krTitle = (f.kr_title ?? '').trim();
        if (krTitle) {
          group.krs.push({
            line: rec.line,
            title: krTitle,
            type: (f.kr_type ?? '').trim(),
            unit: (f.kr_unit ?? '').trim() || null,
            baseline: (f.kr_baseline ?? '').trim(),
            target: (f.kr_target ?? '').trim(),
          });
        }
      }

      // validate groups
      interface ReadyKr {
        title: string;
        type: 'numeric' | 'percent' | 'boolean';
        unit: string | null;
        baseline: number;
        target: number;
      }
      interface ReadyGroup extends Omit<Group, 'krs'> {
        teamId: string | null;
        cycleId: string;
        krs: ReadyKr[];
      }
      const ready: ReadyGroup[] = [];
      for (const g of groups) {
        const cycleId = cycleIds.get(g.cycleName);
        if (!cycleId) {
          errors.push({ line: g.line, message: `unknown cycle "${g.cycleName}"` });
          continue;
        }
        let teamId: string | null = null;
        if (g.teamName !== null) {
          const t = myTeams.get(g.teamName);
          if (!t) {
            errors.push({ line: g.line, message: `not a member of team "${g.teamName}"` });
            continue;
          }
          teamId = t;
        }
        const krs: ReadyKr[] = [];
        let bad = false;
        for (const kr of g.krs) {
          if (kr.type !== 'numeric' && kr.type !== 'percent' && kr.type !== 'boolean') {
            errors.push({ line: kr.line, message: `kr_type must be numeric|percent|boolean, got "${kr.type}"` });
            bad = true;
            continue;
          }
          const baseline = kr.type === 'numeric' ? Number(kr.baseline) : kr.type === 'percent' ? 0 : 0;
          const target = kr.type === 'numeric' ? Number(kr.target) : kr.type === 'percent' ? 100 : 1;
          if (kr.type === 'numeric' && (Number.isNaN(baseline) || Number.isNaN(target))) {
            errors.push({ line: kr.line, message: 'kr_baseline/kr_target must be numbers' });
            bad = true;
            continue;
          }
          if (kr.type === 'numeric' && baseline === target) {
            errors.push({ line: kr.line, message: 'kr_baseline and kr_target need a real gap' });
            bad = true;
            continue;
          }
          krs.push({ title: kr.title, type: kr.type, unit: kr.unit, baseline, target });
        }
        if (!bad) ready.push({ ...g, teamId, cycleId, krs });
      }

      const response: ImportResponse = {
        dryRun: req.query.dryRun,
        creates: {
          objectives: ready.length,
          keyResults: ready.reduce((n, g) => n + g.krs.length, 0),
        },
        preview: ready.map((g) => ({
          title: g.title,
          teamName: g.teamName,
          cycleName: g.cycleName,
          keyResults: g.krs.length,
        })),
        errors,
      };

      // any error → write nothing; dry-run → write nothing
      if (req.query.dryRun || errors.length > 0) {
        return response;
      }

      const now = new Date();
      app.db.transaction(() => {
        for (const g of ready) {
          const objId = crypto.randomUUID();
          app.db
            .insert(objectives)
            .values({
              id: objId,
              title: g.title,
              description: g.description,
              ownerUserId: user.id,
              teamId: g.teamId,
              cycleId: g.cycleId,
              archivedAt: null,
              createdAt: now,
              updatedAt: now,
            })
            .run();
          for (const kr of g.krs) {
            app.db
              .insert(keyResults)
              .values({
                id: crypto.randomUUID(),
                objectiveId: objId,
                title: kr.title,
                type: kr.type,
                unit: kr.unit,
                baseline: kr.baseline,
                target: kr.target,
                currentValue: kr.baseline,
                currentConfidence: null,
                createdAt: now,
                updatedAt: now,
              })
              .run();
          }
        }
      });

      req.log.info(
        { objectives: response.creates.objectives, keyResults: response.creates.keyResults },
        'csv import committed',
      );
      return response;
    },
  });
}
