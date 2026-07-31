/**
 * Purpose: New-objective dialog — title, optional team, lands in the picked
 *          cycle. Radix Dialog under our ledger styling.
 * Author(s): John Reed
 */

import { Dialog } from 'radix-ui';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { Button, Field } from './bits.js';
import { useCreateObjective, useTeams } from '../queries.js';

export function NewObjectiveDialog({
  cycleId,
  onClose,
}: {
  cycleId: string;
  onClose: () => void;
}): ReactNode {
  const teams = useTeams();
  const create = useCreateObjective();
  const [title, setTitle] = useState('');
  const [teamId, setTeamId] = useState('');

  const submit = async (): Promise<void> => {
    if (!title.trim()) return;
    await create.mutateAsync({ title: title.trim(), cycleId, teamId: teamId || undefined });
    onClose();
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-ink/30" />
        <Dialog.Content className="fixed left-1/2 top-1/3 w-[min(28rem,90vw)] -translate-x-1/2 border border-line bg-paper-raised p-5 shadow-card">
          <Dialog.Title className="mb-3 text-lg font-bold">New objective</Dialog.Title>
          <div className="space-y-3">
            <Field
              label="What are you trying to change?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Reduce churn"
              autoFocus
            />
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
                Team (blank = personal)
              </span>
              <select
                className="w-full border border-line bg-paper-raised px-3 py-2 text-sm"
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
              >
                <option value="">personal</option>
                {teams.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            {create.isError ? (
              <p className="text-xs text-rag-red">could not create — try again</p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                cancel
              </Button>
              <Button onClick={() => void submit()} disabled={create.isPending || !title.trim()}>
                create
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
