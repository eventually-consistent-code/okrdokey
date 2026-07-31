/**
 * Purpose: Inline new-KR form — type picker drives which numeric fields show.
 * Author(s): John Reed
 */

import type { ReactNode } from 'react';
import { useState } from 'react';

import { Button, Card, Field } from './bits.js';
import { useCreateKeyResult } from '../queries.js';

type KrType = 'percent' | 'numeric' | 'boolean';

export function NewKeyResultForm({
  objectiveId,
  onDone,
}: {
  objectiveId: string;
  onDone: () => void;
}): ReactNode {
  const create = useCreateKeyResult(objectiveId);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<KrType>('numeric');
  const [unit, setUnit] = useState('');
  const [baseline, setBaseline] = useState('0');
  const [target, setTarget] = useState('');

  const submit = async (): Promise<void> => {
    if (!title.trim()) return;
    await create.mutateAsync({
      title: title.trim(),
      type,
      unit: unit.trim() || undefined,
      baseline: type === 'numeric' ? Number(baseline) : 0,
      target: type === 'numeric' ? Number(target) : type === 'percent' ? 100 : 1,
    });
    onDone();
  };

  return (
    <Card>
      <p className="mb-3 font-semibold">New key result</p>
      <div className="space-y-3">
        <Field label="Title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <div className="flex gap-2">
          {(['numeric', 'percent', 'boolean'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`border px-3 py-1.5 text-sm ${type === t ? 'border-ink font-semibold' : 'border-line opacity-60'}`}
            >
              {t}
            </button>
          ))}
        </div>
        {type === 'numeric' ? (
          <div className="grid grid-cols-3 gap-2">
            <Field label="Baseline" type="number" step="any" value={baseline} onChange={(e) => setBaseline(e.target.value)} />
            <Field label="Target" type="number" step="any" value={target} onChange={(e) => setTarget(e.target.value)} />
            <Field label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="%, $, users" />
          </div>
        ) : null}
        {create.isError ? (
          <p className="text-xs text-rag-red">could not create — numeric needs baseline ≠ target</p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onDone}>
            cancel
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={create.isPending || !title.trim() || (type === 'numeric' && !target)}
          >
            add
          </Button>
        </div>
      </div>
    </Card>
  );
}
