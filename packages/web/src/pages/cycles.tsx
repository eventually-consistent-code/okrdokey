/**
 * Purpose: Cycle admin — quarter-name shortcut front and center, custom
 *          ranges for the H1/6-week crowd.
 * Author(s): John Reed
 */

import { cycleResponseSchema } from '@okrdokey/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { apiFetch, ApiError } from '../api.js';
import { Button, Card, Field } from '../components/bits.js';
import { useCycles } from '../queries.js';

export function CyclesPage(): ReactNode {
  const cycles = useCycles();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');

  const create = useMutation({
    mutationFn: () =>
      apiFetch('/cycles', cycleResponseSchema, {
        method: 'POST',
        body: JSON.stringify({
          name,
          startsOn: startsOn || undefined,
          endsOn: endsOn || undefined,
        }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cycles'] });
      setName('');
      setStartsOn('');
      setEndsOn('');
    },
  });

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold tracking-tight">Cycles</h1>

      <div className="grid gap-3 md:grid-cols-3">
        {cycles.data?.map((c) => (
          <Card key={c.id} className="rise">
            <p className="ledger-num font-semibold">{c.name}</p>
            <p className="ledger-num text-xs text-ink-soft">
              {c.startsOn} → {c.endsOn}
            </p>
            <p className="mt-1 text-xs uppercase tracking-wide text-ink-soft">{c.status}</p>
          </Card>
        ))}
      </div>

      <Card>
        <p className="mb-1 font-semibold">New cycle</p>
        <p className="mb-3 text-xs text-ink-soft">
          a quarter name like <span className="ledger-num">2026-Q4</span> fills the dates itself…
        </p>
        <div className="grid gap-2 md:grid-cols-3">
          <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="2026-Q4" />
          <Field label="Starts (optional)" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          <Field label="Ends (optional)" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
        </div>
        {create.error instanceof ApiError ? (
          <p className="mt-2 text-xs text-rag-red">{create.error.message}</p>
        ) : null}
        <Button className="mt-3" onClick={() => void create.mutateAsync()} disabled={!name.trim() || create.isPending}>
          create cycle
        </Button>
      </Card>
    </div>
  );
}
