/**
 * Purpose: Pure KPI health math — the pinned three-state formula. Met is
 *          healthy, within the 10% band is warning, past it is breach.
 *          No db, no fastify: plain inputs in, a word out.
 * Author(s): John Reed
 */

export type KpiDirection = 'gte' | 'lte' | 'range';
export type KpiHealth = 'healthy' | 'warning' | 'breach';

const BAND = 0.1;

export interface HealthInput {
  direction: KpiDirection;
  thresholdLow: number | null;
  thresholdHigh: number | null;
  value: number;
}

// gte: healthy v >= x, warning v >= x - 0.1|x|; lte mirrored;
// range a..b: healthy inside, warning within 0.1(b-a) outside a bound.
// |threshold| = 0 degrades to met/not-met (the band collapses).
export function kpiHealth({ direction, thresholdLow, thresholdHigh, value }: HealthInput): KpiHealth {
  if (direction === 'gte') {
    const x = thresholdLow ?? 0;
    if (value >= x) return 'healthy';
    if (value >= x - BAND * Math.abs(x)) return 'warning';
    return 'breach';
  }
  if (direction === 'lte') {
    const x = thresholdHigh ?? 0;
    if (value <= x) return 'healthy';
    if (value <= x + BAND * Math.abs(x)) return 'warning';
    return 'breach';
  }
  const a = thresholdLow ?? 0;
  const b = thresholdHigh ?? 0;
  if (value >= a && value <= b) return 'healthy';
  const band = BAND * (b - a);
  if (value >= a - band && value <= b + band) return 'warning';
  return 'breach';
}
