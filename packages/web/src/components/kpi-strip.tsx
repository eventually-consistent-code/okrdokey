/**
 * Purpose: The KPI strip — stability metrics beside the OKRs. Health dot,
 *          big ledger numeral, trend sparkline. Same component feeds the
 *          team page and the public share page.
 * Author(s): John Reed
 */

import type { KpiHealthState } from '@okrdokey/shared';
import type { ReactNode } from 'react';

import { Card } from './bits.js';
import { Sparkline, type SparkTone } from './charts.js';

const HEALTH_COLOR: Record<KpiHealthState, string> = {
  healthy: 'bg-rag-green',
  warning: 'bg-rag-yellow',
  breach: 'bg-rag-red',
};

const HEALTH_TONE: Record<KpiHealthState, SparkTone> = {
  healthy: 'green',
  warning: 'yellow',
  breach: 'red',
};

export interface KpiStripItem {
  name: string;
  unit: string | null;
  currentValue: number;
  currentHealth: KpiHealthState | null;
  trend: number[];
}

export function HealthDot({ health }: { health: KpiHealthState | null }): ReactNode {
  if (!health) {
    return <span className="inline-block size-2.5 rounded-full border border-line bg-paper" title="no readings yet" />;
  }
  return <span className={`inline-block size-2.5 rounded-full ${HEALTH_COLOR[health]}`} title={health} />;
}

export function KpiStrip({ items }: { items: KpiStripItem[] }): ReactNode {
  if (items.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
      {items.map((k) => (
        <Card key={k.name} className="rise">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
            <HealthDot health={k.currentHealth} />
            {k.name}
          </p>
          <p className="ledger-num mt-1 text-2xl font-semibold">
            {k.currentValue}
            <span className="text-sm text-ink-soft">{k.unit ?? ''}</span>
          </p>
          <div className="mt-2">
            <Sparkline values={k.trend} tone={k.currentHealth ? HEALTH_TONE[k.currentHealth] : null} />
          </div>
        </Card>
      ))}
    </div>
  );
}
