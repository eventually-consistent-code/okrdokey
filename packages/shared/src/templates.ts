/**
 * Purpose: The KR template library — 18 curated shapes across six functions,
 *          each with a coaching note, plus objective title suggestions. This
 *          is the wizard's whole brain: static, typed, ~4KB, no API. The one
 *          lesson it teaches: a key result is a number that changes, not a
 *          task you finish.
 * Author(s): John Reed
 */

import type { CreateKeyResultRequest } from './index.js';

export type TemplateFn = 'engineering' | 'product' | 'sales' | 'marketing' | 'support' | 'ops';

export const TEMPLATE_FN_LABELS: Record<TemplateFn, string> = {
  engineering: 'Engineering',
  product: 'Product',
  sales: 'Sales / Growth',
  marketing: 'Marketing',
  support: 'Support / CS',
  ops: 'Ops / People',
};

export interface KrTemplate {
  id: string;
  fn: TemplateFn;
  /** {baseline}/{target} interpolate from the wizard's measure step */
  title: string;
  type: 'numeric' | 'percent' | 'boolean';
  unit?: string;
  /** coaching metadata only — scoring already handles decreasing-is-good */
  direction: 'increase' | 'decrease' | 'complete';
  /** one-line coaching note shown on the template card */
  coach: string;
}

export const KR_TEMPLATES: KrTemplate[] = [
  // engineering
  { id: 'eng-latency', fn: 'engineering', title: 'Reduce p95 API latency from {baseline}ms to {target}ms', type: 'numeric', unit: 'ms', direction: 'decrease', coach: 'Latency is what users feel — an outcome, not a refactor task.' },
  { id: 'eng-deploys', fn: 'engineering', title: 'Increase deploy frequency from {baseline} to {target} per week', type: 'numeric', unit: '/wk', direction: 'increase', coach: 'Frequency is a countable proxy for delivery health you can verify weekly.' },
  { id: 'eng-p1bugs', fn: 'engineering', title: 'Cut open P1 bugs from {baseline} to {target}', type: 'numeric', unit: 'bugs', direction: 'decrease', coach: 'A shrinking count beats "improve quality" — anyone can verify it.' },
  // product
  { id: 'prod-wau', fn: 'product', title: 'Grow weekly active users from {baseline} to {target}', type: 'numeric', unit: 'users', direction: 'increase', coach: 'Usage, not shipped features — features are the how, WAU is the result.' },
  { id: 'prod-activation', fn: 'product', title: 'Raise new-user activation rate from {baseline}% to {target}%', type: 'numeric', unit: '%', direction: 'increase', coach: 'Measures whether onboarding works, not whether you rebuilt it.' },
  { id: 'prod-retention', fn: 'product', title: 'Lift 30-day retention from {baseline}% to {target}%', type: 'numeric', unit: '%', direction: 'increase', coach: 'Retention proves value delivered — the outcome behind most roadmaps.' },
  // sales / growth
  { id: 'sales-mrr', fn: 'sales', title: 'Grow MRR from {baseline} to {target}', type: 'numeric', unit: '$', direction: 'increase', coach: 'Revenue is the ultimate outcome metric — a baseline makes progress honest.' },
  { id: 'sales-pipeline', fn: 'sales', title: 'Increase qualified pipeline from {baseline} to {target} opportunities', type: 'numeric', unit: 'opps', direction: 'increase', coach: 'A leading indicator — pipeline today predicts revenue next quarter.' },
  { id: 'sales-winrate', fn: 'sales', title: 'Improve win rate from {baseline}% to {target}%', type: 'numeric', unit: '%', direction: 'increase', coach: 'Rates beat raw counts when volume varies — measures selling, not luck.' },
  // marketing
  { id: 'mkt-leads', fn: 'marketing', title: 'Grow qualified leads from {baseline} to {target} per month', type: 'numeric', unit: '/mo', direction: 'increase', coach: '"Launch campaign" is a task; leads generated is what the campaign is for.' },
  { id: 'mkt-conversion', fn: 'marketing', title: 'Raise visitor-to-signup conversion from {baseline}% to {target}%', type: 'numeric', unit: '%', direction: 'increase', coach: 'A rate isolates message quality from traffic volume.' },
  { id: 'mkt-traffic', fn: 'marketing', title: 'Grow organic traffic from {baseline} to {target} visits per month', type: 'numeric', unit: 'visits/mo', direction: 'increase', coach: 'Countable, verifiable, and compounding — the classic content outcome.' },
  // support / CS
  { id: 'cs-frt', fn: 'support', title: 'Cut median first-response time from {baseline}h to {target}h', type: 'numeric', unit: 'h', direction: 'decrease', coach: 'What the customer experiences — not tickets closed by heroics.' },
  { id: 'cs-csat', fn: 'support', title: 'Raise CSAT from {baseline}% to {target}%', type: 'numeric', unit: '%', direction: 'increase', coach: 'Satisfaction is the outcome; response time is just one lever.' },
  { id: 'cs-churn', fn: 'support', title: 'Reduce monthly churn from {baseline}% to {target}%', type: 'numeric', unit: '%', direction: 'decrease', coach: 'Down-metrics are outcomes too — keeping customers counts double.' },
  // ops / people
  { id: 'ops-hiring', fn: 'ops', title: 'Fill {target} open roles this quarter', type: 'numeric', unit: 'hires', direction: 'increase', coach: 'Baseline 0, target N — progress is visible every week.' },
  { id: 'ops-engagement', fn: 'ops', title: 'Raise employee engagement score from {baseline} to {target}', type: 'numeric', unit: 'pts', direction: 'increase', coach: 'Survey scores make "improve culture" measurable and verifiable.' },
  { id: 'ops-compliance', fn: 'ops', title: 'Complete SOC 2 certification', type: 'boolean', direction: 'complete', coach: 'Boolean KRs are for true done/not-done gates — use sparingly; most goals deserve a number.' },
];

export const OBJECTIVE_SUGGESTIONS: Record<TemplateFn, string[]> = {
  engineering: ['Make the platform fast and boringly reliable', 'Ship with confidence, not crossed fingers', 'Pay down the tech debt slowing every release'],
  product: ['Make new users successful in their first week', 'Turn signups into habits', 'Build the feature customers actually retain for'],
  sales: ['Build a repeatable revenue engine', 'Win more of the deals we start', 'Grow revenue without growing burn'],
  marketing: ['Become the obvious choice in our niche', 'Fill the top of the funnel with the right people', 'Make our content do the selling'],
  support: ['Make support a reason customers stay', 'Answer fast, resolve faster', 'Turn detractors into promoters'],
  ops: ['Build the team without breaking the culture', 'Make the company audit-ready by default', 'Run operations people brag about'],
};

// Interpolates the measure-step values into a ready CreateKeyResultRequest.
// percent/boolean keep their fixed ranges (the API normalizes anyway — this
// keeps the preview honest).
export function fillTemplate(
  t: KrTemplate,
  values: { baseline: number; target: number },
): CreateKeyResultRequest {
  const title = t.title
    .replace('{baseline}', String(values.baseline))
    .replace('{target}', String(values.target));
  if (t.type === 'percent') {
    return { title, type: 'percent', unit: t.unit, baseline: 0, target: 100 };
  }
  if (t.type === 'boolean') {
    return { title, type: 'boolean', unit: t.unit, baseline: 0, target: 1 };
  }
  return { title, type: 'numeric', unit: t.unit, baseline: values.baseline, target: values.target };
}
