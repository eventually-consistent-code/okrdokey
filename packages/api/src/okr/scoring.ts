/**
 * Purpose: Pure OKR math — KR score, objective mean, cycle elapsed fraction,
 *          and the hybrid status formula with RAG downgrade caps. No db, no
 *          fastify: plain inputs in, numbers out. Thresholds here are the
 *          product's scoring contract — treat any change as a breaking one.
 * Author(s): John Reed
 */

import type { Confidence, ObjectiveStatus } from '@okrdokey/shared';

export type KrType = 'percent' | 'numeric' | 'boolean';
export type { ObjectiveStatus };

export interface ScorableKr {
  type: KrType;
  baseline: number;
  target: number;
  currentValue: number;
}

// Constants

const DAY_MS = 24 * 60 * 60 * 1000;

// Status thresholds — delta = score − elapsed (see CONTEXT.md, locked)
const ON_TRACK_FLOOR = -0.1;
const AT_RISK_FLOOR = -0.25;

// Helpers

// Scores never leave the unit interval
function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * Round to two decimals — response payloads only; keep raw floats for math.
 *
 * :param n: any number
 * :returns n rounded to 2dp
 */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Scoring

/**
 * Score one key result on 0..1.
 *
 * numeric: clamp01((current − baseline) / (target − baseline)) — decreasing-
 * is-good falls out for free when target < baseline. percent: current/100.
 * boolean: done or not, 0 or 1.
 *
 * :param kr: type + baseline/target/currentValue, plain values
 * :returns score in 0..1
 */
export function krScore(kr: ScorableKr): number {
  if (kr.type === 'boolean') {
    return kr.currentValue >= 1 ? 1 : 0;
  }
  if (kr.type === 'percent') {
    return clamp01(kr.currentValue / 100);
  }
  // Schema rejects baseline === target for numeric, but stay defensive —
  // a zero span scores zero rather than dividing by it
  if (kr.target === kr.baseline) {
    return 0;
  }
  return clamp01((kr.currentValue - kr.baseline) / (kr.target - kr.baseline));
}

/**
 * Objective score — unweighted mean of its KR scores.
 *
 * :param krScores: per-KR scores, each 0..1
 * :returns mean, or 0 for an objective with no KRs yet
 */
export function objectiveScore(krScores: number[]): number {
  if (krScores.length === 0) {
    return 0;
  }
  return krScores.reduce((sum, s) => sum + s, 0) / krScores.length;
}

/**
 * How far through the cycle we are, 0..1. Dates are inclusive — the end day
 * counts, so the span runs to the end of endsOn. Zero/negative-length cycles
 * report fully elapsed (1) rather than dividing by nothing.
 *
 * :param cycle: startsOn/endsOn as ISO dates (inclusive)
 * :param now: the clock, injected for testability
 * :returns elapsed fraction clamped to 0..1
 */
export function cycleElapsedFraction(
  cycle: { startsOn: string; endsOn: string },
  now: Date,
): number {
  const start = Date.parse(`${cycle.startsOn}T00:00:00Z`);
  const end = Date.parse(`${cycle.endsOn}T00:00:00Z`);
  if (end <= start) {
    return 1;
  }
  // +1 day: inclusive end — the cycle finishes at the END of endsOn
  const total = end + DAY_MS - start;
  return clamp01((now.getTime() - start) / total);
}

/**
 * Worst of the KRs' latest check-in confidences — red beats yellow beats
 * green. KRs with no check-in yet (null) are skipped; all-null means no
 * human signal at all, so no cap applies.
 *
 * :param confidences: current_confidence per KR, null when never checked in
 * :returns the worst confidence, or null when none exist
 */
export function worstConfidence(confidences: (Confidence | null)[]): Confidence | null {
  let worst: Confidence | null = null;
  for (const c of confidences) {
    if (c === 'red') {
      return 'red';
    }
    if (c === 'yellow') {
      worst = 'yellow';
    } else if (c === 'green' && worst === null) {
      worst = 'green';
    }
  }
  return worst;
}

/**
 * Hybrid status: math first, human signal second — and the human signal only
 * ever drags status DOWN. delta = score − elapsed; on-track when delta ≥
 * −0.10, at-risk when −0.25 ≤ delta < −0.10, behind below that. Then the
 * worst latest RAG confidence caps it: red → behind, yellow → at most
 * at-risk. Confidence never improves a computed status.
 *
 * :param score: objective score 0..1
 * :param elapsed: cycle elapsed fraction 0..1
 * :param worstLatestConfidence: worst KR confidence, null when no check-ins
 * :returns 'on-track' | 'at-risk' | 'behind'
 */
export function objectiveStatus(
  score: number,
  elapsed: number,
  worstLatestConfidence: Confidence | null,
): ObjectiveStatus {
  const delta = score - elapsed;
  let status: ObjectiveStatus =
    delta >= ON_TRACK_FLOOR ? 'on-track' : delta >= AT_RISK_FLOOR ? 'at-risk' : 'behind';

  if (worstLatestConfidence === 'red') {
    status = 'behind';
  } else if (worstLatestConfidence === 'yellow' && status === 'on-track') {
    status = 'at-risk';
  }
  return status;
}
