/**
 * Purpose: The public dashboard — what a share link opens. Read-only,
 *          no login, no nav into the app. Transparency without leakage.
 * Author(s): John Reed
 */

import { publicSummaryResponseSchema } from '@okrdokey/shared';
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { apiFetch } from '../api.js';
import { Card, RagDot, Score, StatusStamp } from '../components/bits.js';
import { Sparkline } from '../components/charts.js';
import { KpiStrip } from '../components/kpi-strip.js';

export function SharePage(): ReactNode {
  const { token } = useParams({ from: '/share/$token' });
  const summary = useQuery({
    queryKey: ['public-summary', token],
    queryFn: () => apiFetch(`/public/${token}/summary`, publicSummaryResponseSchema),
    retry: false,
  });

  if (summary.isLoading) {
    return <p className="mt-24 text-center text-sm text-ink-soft">loading…</p>;
  }
  if (!summary.data) {
    return (
      <p className="mt-24 text-center text-sm text-ink-soft">
        This link isn't live — the team may have rotated or disabled it.
      </p>
    );
  }
  const s = summary.data;

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16">
      <header className="mb-8 border-b-2 border-ink py-4">
        <p className="font-display text-2xl font-bold tracking-tight">
          {s.teamName} <span className="text-ink-soft">· OKRs</span>
        </p>
        <p className="text-xs text-ink-soft">
          public read-only view — powered by OKRdokey<span className="text-ember">.</span>
        </p>
      </header>

      {s.kpis.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">KPIs</h2>
          <KpiStrip items={s.kpis} />
        </section>
      ) : null}

      {s.cycles.length === 0 ? (
        <p className="text-sm text-ink-soft">nothing published yet…</p>
      ) : (
        s.cycles.map((c) => (
          <section key={c.cycle.name} className="mb-8">
            <h2 className="ledger-num mb-3 text-lg font-semibold">
              {c.cycle.name}{' '}
              <span className="text-xs font-normal text-ink-soft">
                {Math.round(c.elapsed * 100)}% elapsed
              </span>
            </h2>
            <div className="space-y-3">
              {c.objectives.map((o) => (
                <Card key={o.title} className="rise">
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-semibold">{o.title}</p>
                    <div className="flex items-center gap-3">
                      <StatusStamp status={o.status} />
                      <Score value={o.score} />
                    </div>
                  </div>
                  <ul className="mt-3 space-y-1">
                    {o.keyResults.map((kr) => (
                      <li key={kr.title} className="flex items-center justify-between gap-3 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <RagDot confidence={kr.currentConfidence} />
                          {kr.title}
                        </span>
                        <span className="flex shrink-0 items-center gap-3">
                          {kr.trend.length >= 2 ? (
                            <span className="w-20">
                              <Sparkline values={kr.trend} tone={kr.currentConfidence} />
                            </span>
                          ) : null}
                          <span className="ledger-num text-xs text-ink-soft">
                            {kr.currentValue}
                            {kr.unit ?? ''} / {kr.target}
                            {kr.unit ?? ''} · {kr.score.toFixed(2)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
