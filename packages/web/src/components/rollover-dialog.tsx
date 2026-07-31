/**
 * Purpose: Roll a cycle forward — pick an open target, choose whether the
 *          source objectives archive, see exactly what carried and which
 *          KRs need their connector links re-created.
 * Author(s): John Reed
 */

import { rolloverResponseSchema, type CycleResponse, type RolloverResponse } from '@okrdokey/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog } from 'radix-ui';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { apiFetch, ApiError } from '../api.js';
import { Button, Card } from './bits.js';

export function RolloverDialog({
  source,
  cycles,
  onClose,
}: {
  source: CycleResponse;
  cycles: CycleResponse[];
  onClose: () => void;
}): ReactNode {
  const qc = useQueryClient();
  const targets = cycles.filter((c) => c.id !== source.id && c.status === 'open');
  const [targetId, setTargetId] = useState(targets[0]?.id ?? '');
  const [archiveSource, setArchiveSource] = useState(true);
  const [result, setResult] = useState<RolloverResponse | null>(null);

  const roll = useMutation({
    mutationFn: () =>
      apiFetch(`/cycles/${source.id}/rollover`, rolloverResponseSchema, {
        method: 'POST',
        body: JSON.stringify({ targetCycleId: targetId, archiveSource }),
      }),
    onSuccess: (r) => {
      setResult(r);
      void qc.invalidateQueries({ queryKey: ['cycles'] });
      void qc.invalidateQueries({ queryKey: ['objectives'] });
      void qc.invalidateQueries({ queryKey: ['summary'] });
    },
  });

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-ink/30" />
        <Dialog.Content className="fixed left-1/2 top-1/4 w-[min(30rem,92vw)] -translate-x-1/2 border border-line bg-paper-raised p-5 shadow-card">
          <Dialog.Title className="mb-1 text-lg font-bold">
            Roll {source.name} forward
          </Dialog.Title>

          {result ? (
            <div className="space-y-3">
              <Card>
                <p className="ledger-num text-sm">
                  {result.clonedObjectives} objectives · {result.clonedKeyResults} key results
                  carried
                </p>
                <p className="text-xs text-ink-soft">
                  {result.skippedObjectives} finished objectives and {result.skippedKeyResults} done
                  key results stayed behind with their history.
                </p>
              </Card>
              {result.hadLinks.length > 0 ? (
                <Card>
                  <p className="mb-1 text-sm font-semibold text-rag-yellow">
                    re-link these key results
                  </p>
                  <p className="mb-2 text-xs text-ink-soft">
                    Connector links don't carry over — recreate them on the new copies:
                  </p>
                  <ul className="space-y-1 text-xs">
                    {result.hadLinks.map((l, i) => (
                      <li key={i}>· {l.title}</li>
                    ))}
                  </ul>
                </Card>
              ) : null}
              <div className="flex justify-end">
                <Button onClick={onClose}>done</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-ink-soft">
                Closes {source.name}. Unfinished objectives copy into the target with fresh
                baselines — numeric key results restart at their current value. Done work and all
                check-in history stay here.
              </p>

              {targets.length === 0 ? (
                <p className="text-sm text-rag-red">no open target cycle — create one first</p>
              ) : (
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
                    Target cycle
                  </span>
                  <select
                    className="w-full border border-line bg-paper-raised px-3 py-2 text-sm"
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                  >
                    {targets.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={archiveSource}
                  onChange={(e) => setArchiveSource(e.target.checked)}
                />
                archive the old copies here
              </label>

              {roll.error instanceof ApiError ? (
                <p className="text-xs text-rag-red">{roll.error.message}</p>
              ) : null}

              <div className="flex justify-between">
                <Button variant="ghost" onClick={onClose}>
                  cancel
                </Button>
                <Button onClick={() => roll.mutate()} disabled={!targetId || roll.isPending}>
                  {roll.isPending ? 'rolling…' : 'roll forward'}
                </Button>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
