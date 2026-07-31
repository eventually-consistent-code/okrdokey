/**
 * Purpose: Team KPI panel — the strip for everyone, management for admins:
 *          create (direction-aware thresholds), record a reading, archive.
 * Author(s): John Reed
 */

import type { KpiResponse } from '@okrdokey/shared';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { Button, Card, Field } from './bits.js';
import { HealthDot, KpiStrip } from './kpi-strip.js';
import { useArchiveKpi, useCreateKpi, useKpiReadings, useKpis, useRecordKpiReading } from '../queries.js';

function KpiRow({ kpi, teamId, isAdmin }: { kpi: KpiResponse; teamId: string; isAdmin: boolean }): ReactNode {
  const record = useRecordKpiReading(kpi.id, teamId);
  const archive = useArchiveKpi(teamId);
  const readings = useKpiReadings(kpi.id);
  const [value, setValue] = useState('');

  const thresholdText =
    kpi.direction === 'gte'
      ? `stay ≥ ${kpi.thresholdLow}`
      : kpi.direction === 'lte'
        ? `stay ≤ ${kpi.thresholdHigh}`
        : `stay ${kpi.thresholdLow}–${kpi.thresholdHigh}`;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-2 last:border-0">
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold">
          <HealthDot health={kpi.currentHealth} />
          {kpi.name}
        </p>
        <p className="ledger-num text-xs text-ink-soft">
          {kpi.currentValue}
          {kpi.unit ?? ''} · {thresholdText}
          {kpi.unit ?? ''} · {readings.data?.length ?? 0} readings
        </p>
      </div>
      <div className="flex items-center gap-2">
        <input
          className="w-24 border border-line bg-paper-raised px-2 py-1 text-sm ledger-num"
          type="number"
          step="any"
          placeholder="value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button
          variant="ghost"
          disabled={value === '' || record.isPending}
          onClick={() => {
            void record.mutateAsync({ value: Number(value) }).then(() => setValue(''));
          }}
        >
          record
        </Button>
        {isAdmin ? (
          <Button variant="danger" onClick={() => void archive.mutateAsync(kpi.id)}>
            archive
          </Button>
        ) : null}
      </div>
    </li>
  );
}

export function KpiPanel({ teamId, isAdmin }: { teamId: string; isAdmin: boolean }): ReactNode {
  const kpisQuery = useKpis(teamId);
  const create = useCreateKpi(teamId);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [direction, setDirection] = useState<'gte' | 'lte' | 'range'>('gte');
  const [low, setLow] = useState('');
  const [high, setHigh] = useState('');

  const items = (kpisQuery.data ?? []).map((k) => ({
    name: k.name,
    unit: k.unit,
    currentValue: k.currentValue,
    currentHealth: k.currentHealth,
    trend: [] as number[], // strip on the team page leans on the rows below
  }));

  const submit = async (): Promise<void> => {
    await create.mutateAsync({
      name: name.trim(),
      unit: unit.trim() || undefined,
      direction,
      thresholdLow: direction !== 'lte' ? Number(low) : undefined,
      thresholdHigh: direction !== 'gte' ? Number(high) : undefined,
    });
    setAdding(false);
    setName('');
    setLow('');
    setHigh('');
  };

  return (
    <Card>
      <p className="mb-1 font-semibold">KPIs</p>
      <p className="mb-3 text-xs text-ink-soft">
        stability metrics — the numbers that should stay put while the OKRs move…
      </p>
      {items.length > 0 ? <div className="mb-3"><KpiStrip items={items} /></div> : null}
      <ul>
        {kpisQuery.data?.map((k) => (
          <KpiRow key={k.id} kpi={k} teamId={teamId} isAdmin={isAdmin} />
        ))}
      </ul>
      {isAdmin ? (
        adding ? (
          <div className="mt-3 space-y-3">
            <div className="grid gap-2 md:grid-cols-2">
              <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Uptime" autoFocus />
              <Field label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="%" />
            </div>
            <div className="flex gap-2">
              {(['gte', 'lte', 'range'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDirection(d)}
                  className={`border px-3 py-1.5 text-sm ${direction === d ? 'border-ink font-semibold' : 'border-line opacity-60'}`}
                >
                  {d === 'gte' ? 'stay above' : d === 'lte' ? 'stay below' : 'stay between'}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {direction !== 'lte' ? (
                <Field label={direction === 'range' ? 'Low' : 'Threshold'} type="number" step="any" value={low} onChange={(e) => setLow(e.target.value)} />
              ) : null}
              {direction !== 'gte' ? (
                <Field label={direction === 'range' ? 'High' : 'Threshold'} type="number" step="any" value={high} onChange={(e) => setHigh(e.target.value)} />
              ) : null}
            </div>
            {create.isError ? <p className="text-xs text-rag-red">could not create — check thresholds</p> : null}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setAdding(false)}>
                cancel
              </Button>
              <Button onClick={() => void submit()} disabled={!name.trim() || create.isPending}>
                create KPI
              </Button>
            </div>
          </div>
        ) : (
          <Button className="mt-3" onClick={() => setAdding(true)}>
            + KPI
          </Button>
        )
      ) : null}
    </Card>
  );
}
