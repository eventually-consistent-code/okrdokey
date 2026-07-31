/**
 * Purpose: Unit tests for the pinned KPI health formula — all three
 *          directions, exact band edges, zero-threshold degradation.
 * Author(s): John Reed
 */

import { describe, expect, it } from 'vitest';

import { kpiHealth } from '../src/okr/health.js';

describe('kpiHealth — gte (uptime >= 99.9 style)', () => {
  const kpi = { direction: 'gte' as const, thresholdLow: 100, thresholdHigh: null };
  it('met is healthy', () => {
    expect(kpiHealth({ ...kpi, value: 100 })).toBe('healthy');
    expect(kpiHealth({ ...kpi, value: 150 })).toBe('healthy');
  });
  it('within 10% below is warning — band edge exactly', () => {
    expect(kpiHealth({ ...kpi, value: 95 })).toBe('warning');
    expect(kpiHealth({ ...kpi, value: 90 })).toBe('warning'); // exactly x - 0.1|x|
  });
  it('past the band is breach', () => {
    expect(kpiHealth({ ...kpi, value: 89.99 })).toBe('breach');
  });
});

describe('kpiHealth — lte (error rate <= 2% style)', () => {
  const kpi = { direction: 'lte' as const, thresholdLow: null, thresholdHigh: 2 };
  it('met is healthy', () => {
    expect(kpiHealth({ ...kpi, value: 2 })).toBe('healthy');
    expect(kpiHealth({ ...kpi, value: 0 })).toBe('healthy');
  });
  it('within 10% above is warning — band edge exactly', () => {
    expect(kpiHealth({ ...kpi, value: 2.2 })).toBe('warning'); // exactly x + 0.1|x|
  });
  it('past the band is breach', () => {
    expect(kpiHealth({ ...kpi, value: 2.21 })).toBe('breach');
  });
});

describe('kpiHealth — range (response time 100..300ms style)', () => {
  const kpi = { direction: 'range' as const, thresholdLow: 100, thresholdHigh: 300 };
  it('inside is healthy, bounds inclusive', () => {
    expect(kpiHealth({ ...kpi, value: 100 })).toBe('healthy');
    expect(kpiHealth({ ...kpi, value: 300 })).toBe('healthy');
  });
  it('within 10% of span outside a bound is warning', () => {
    expect(kpiHealth({ ...kpi, value: 80 })).toBe('warning'); // band = 20, exactly a - band
    expect(kpiHealth({ ...kpi, value: 320 })).toBe('warning');
  });
  it('past the band is breach', () => {
    expect(kpiHealth({ ...kpi, value: 79 })).toBe('breach');
    expect(kpiHealth({ ...kpi, value: 321 })).toBe('breach');
  });
});

describe('kpiHealth — zero-threshold degradation', () => {
  it('gte 0: band collapses to met/not-met', () => {
    const kpi = { direction: 'gte' as const, thresholdLow: 0, thresholdHigh: null };
    expect(kpiHealth({ ...kpi, value: 0 })).toBe('healthy');
    expect(kpiHealth({ ...kpi, value: -0.01 })).toBe('breach');
  });
  it('lte 0: same collapse', () => {
    const kpi = { direction: 'lte' as const, thresholdLow: null, thresholdHigh: 0 };
    expect(kpiHealth({ ...kpi, value: 0 })).toBe('healthy');
    expect(kpiHealth({ ...kpi, value: 0.01 })).toBe('breach');
  });
});
