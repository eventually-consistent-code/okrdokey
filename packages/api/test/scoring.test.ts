/**
 * Purpose: Pure unit tests for the pinned scoring formulas — KR score edges
 *          (decreasing-is-good, clamps, zero span), objective mean, elapsed
 *          fraction (inclusive dates, degenerate ranges), and the hybrid
 *          status thresholds with RAG downgrade caps.
 * Author(s): John Reed
 */

import { describe, expect, it } from 'vitest';

import {
  cycleElapsedFraction,
  krScore,
  objectiveScore,
  objectiveStatus,
  round2,
  worstConfidence,
} from '../src/okr/scoring.js';

describe('krScore', () => {
  it('numeric: linear between baseline and target', () => {
    expect(krScore({ type: 'numeric', baseline: 0, target: 100, currentValue: 50 })).toBe(0.5);
    expect(krScore({ type: 'numeric', baseline: 40, target: 60, currentValue: 45 })).toBe(0.25);
  });

  it('numeric: decreasing-is-good when target < baseline', () => {
    // churn 5% → 2%: currently 3.5 means halfway there
    expect(krScore({ type: 'numeric', baseline: 5, target: 2, currentValue: 3.5 })).toBe(0.5);
    expect(krScore({ type: 'numeric', baseline: 5, target: 2, currentValue: 2 })).toBe(1);
    // got worse than the baseline — clamps at 0, no negative scores
    expect(krScore({ type: 'numeric', baseline: 5, target: 2, currentValue: 7 })).toBe(0);
  });

  it('numeric: clamps at both ends', () => {
    expect(krScore({ type: 'numeric', baseline: 0, target: 100, currentValue: 150 })).toBe(1);
    expect(krScore({ type: 'numeric', baseline: 0, target: 100, currentValue: -10 })).toBe(0);
  });

  it('numeric: zero span (baseline === target) scores 0, never divides', () => {
    expect(krScore({ type: 'numeric', baseline: 10, target: 10, currentValue: 10 })).toBe(0);
  });

  it('percent: current/100, clamped', () => {
    expect(krScore({ type: 'percent', baseline: 0, target: 100, currentValue: 40 })).toBe(0.4);
    expect(krScore({ type: 'percent', baseline: 0, target: 100, currentValue: 150 })).toBe(1);
    expect(krScore({ type: 'percent', baseline: 0, target: 100, currentValue: -5 })).toBe(0);
  });

  it('boolean: done or not', () => {
    expect(krScore({ type: 'boolean', baseline: 0, target: 1, currentValue: 0 })).toBe(0);
    expect(krScore({ type: 'boolean', baseline: 0, target: 1, currentValue: 1 })).toBe(1);
  });
});

describe('objectiveScore', () => {
  it('unweighted mean of KR scores', () => {
    expect(objectiveScore([0.5, 1])).toBe(0.75);
    expect(objectiveScore([0, 0.5, 1])).toBe(0.5);
  });

  it('empty KR list scores 0', () => {
    expect(objectiveScore([])).toBe(0);
  });
});

describe('cycleElapsedFraction', () => {
  const cycle = { startsOn: '2026-01-01', endsOn: '2026-01-10' }; // 10 days inclusive

  it('midway through an inclusive range', () => {
    // 5 of 10 days gone at the stroke of Jan 6
    expect(cycleElapsedFraction(cycle, new Date('2026-01-06T00:00:00Z'))).toBe(0.5);
  });

  it('the end day still counts — not fully elapsed until endsOn is over', () => {
    expect(cycleElapsedFraction(cycle, new Date('2026-01-10T12:00:00Z'))).toBe(0.95);
  });

  it('clamps to 0 before the cycle and 1 after it', () => {
    expect(cycleElapsedFraction(cycle, new Date('2025-12-25T00:00:00Z'))).toBe(0);
    expect(cycleElapsedFraction(cycle, new Date('2026-02-01T00:00:00Z'))).toBe(1);
  });

  it('zero-length cycle reports fully elapsed', () => {
    expect(
      cycleElapsedFraction(
        { startsOn: '2026-01-01', endsOn: '2026-01-01' },
        new Date('2026-01-01T00:00:00Z'),
      ),
    ).toBe(1);
  });

  it('negative-length cycle reports fully elapsed, never divides badly', () => {
    expect(
      cycleElapsedFraction(
        { startsOn: '2026-01-10', endsOn: '2026-01-01' },
        new Date('2026-01-05T00:00:00Z'),
      ),
    ).toBe(1);
  });
});

describe('objectiveStatus — thresholds', () => {
  it('delta ≥ −0.10 is on-track, boundary included', () => {
    expect(objectiveStatus(0.5, 0.5, null)).toBe('on-track');
    expect(objectiveStatus(1, 0, null)).toBe('on-track');
    // exactly −0.10 behind schedule still counts as on-track
    expect(objectiveStatus(0.4, 0.5, null)).toBe('on-track');
  });

  it('−0.25 ≤ delta < −0.10 is at-risk, both boundaries checked', () => {
    // just past the on-track floor
    expect(objectiveStatus(0.39, 0.5, null)).toBe('at-risk');
    // exactly −0.25 is still at-risk, not behind
    expect(objectiveStatus(0.25, 0.5, null)).toBe('at-risk');
  });

  it('delta < −0.25 is behind', () => {
    expect(objectiveStatus(0.24, 0.5, null)).toBe('behind');
    expect(objectiveStatus(0, 1, null)).toBe('behind');
  });
});

describe('objectiveStatus — RAG caps (downward only)', () => {
  it('red caps to behind no matter how good the math looks', () => {
    expect(objectiveStatus(1, 0, 'red')).toBe('behind');
  });

  it('yellow caps on-track down to at-risk', () => {
    expect(objectiveStatus(1, 0, 'yellow')).toBe('at-risk');
  });

  it('yellow leaves at-risk and behind alone', () => {
    expect(objectiveStatus(0.3, 0.5, 'yellow')).toBe('at-risk');
    expect(objectiveStatus(0, 1, 'yellow')).toBe('behind');
  });

  it('confidence never improves a computed status', () => {
    // green optimism does not rescue a behind objective
    expect(objectiveStatus(0, 1, 'green')).toBe('behind');
    expect(objectiveStatus(0.3, 0.5, 'green')).toBe('at-risk');
  });

  it('no check-ins (null) means no cap', () => {
    expect(objectiveStatus(1, 0, null)).toBe('on-track');
  });
});

describe('worstConfidence', () => {
  it('red beats yellow beats green', () => {
    expect(worstConfidence(['green', 'yellow', 'red'])).toBe('red');
    expect(worstConfidence(['green', 'yellow', null])).toBe('yellow');
    expect(worstConfidence(['green', 'green'])).toBe('green');
  });

  it('no check-ins anywhere → null', () => {
    expect(worstConfidence([])).toBeNull();
    expect(worstConfidence([null, null])).toBeNull();
  });
});

describe('round2', () => {
  it('rounds to two decimals for payloads', () => {
    expect(round2(1 / 3)).toBe(0.33);
    expect(round2(0.005)).toBe(0.01);
    expect(round2(1)).toBe(1);
  });
});
