/**
 * Purpose: Template library tests — every template must interpolate into a
 *          request the real schema accepts.
 * Author(s): John Reed
 */

import { describe, expect, it } from 'vitest';

import {
  createKeyResultRequestSchema,
  fillTemplate,
  KR_TEMPLATES,
  OBJECTIVE_SUGGESTIONS,
} from '../src/index.js';

describe('KR templates', () => {
  it('ships 18 templates across 6 functions', () => {
    expect(KR_TEMPLATES).toHaveLength(18);
    expect(new Set(KR_TEMPLATES.map((t) => t.fn)).size).toBe(6);
  });

  it('every template fills into a schema-valid request', () => {
    for (const t of KR_TEMPLATES) {
      const req = fillTemplate(t, { baseline: 5, target: 2 });
      const parsed = createKeyResultRequestSchema.safeParse(req);
      expect(parsed.success, `${t.id} failed: ${JSON.stringify(parsed)}`).toBe(true);
    }
  });

  it('interpolates both slots and keeps decreasing-is-good ranges', () => {
    const latency = KR_TEMPLATES.find((t) => t.id === 'eng-latency');
    const req = fillTemplate(latency!, { baseline: 500, target: 200 });
    expect(req.title).toBe('Reduce p95 API latency from 500ms to 200ms');
    expect(req).toMatchObject({ baseline: 500, target: 200, type: 'numeric' });
  });

  it('boolean templates get the fixed 0→1 range', () => {
    const soc2 = KR_TEMPLATES.find((t) => t.id === 'ops-compliance');
    const req = fillTemplate(soc2!, { baseline: 0, target: 0 });
    expect(req).toMatchObject({ type: 'boolean', baseline: 0, target: 1 });
  });

  it('objective suggestions cover every function, 3 each', () => {
    for (const list of Object.values(OBJECTIVE_SUGGESTIONS)) {
      expect(list).toHaveLength(3);
    }
  });
});
