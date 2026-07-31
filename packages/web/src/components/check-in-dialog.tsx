/**
 * Purpose: The check-in dialog — THE sub-30-second flow the whole product
 *          bets on. Value, one of three confidence dots, optional note, done.
 * Author(s): John Reed
 */

import type { Confidence, KeyResultResponse } from '@okrdokey/shared';
import { Dialog } from 'radix-ui';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { Button, Field } from './bits.js';
import { useCheckInMutation } from '../queries.js';

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  green: 'on it',
  yellow: 'wobbly',
  red: 'in trouble',
};

const CONFIDENCE_RING: Record<Confidence, string> = {
  green: 'ring-rag-green bg-rag-green',
  yellow: 'ring-rag-yellow bg-rag-yellow',
  red: 'ring-rag-red bg-rag-red',
};

export function CheckInDialog({
  kr,
  objectiveId,
  onClose,
}: {
  kr: KeyResultResponse;
  objectiveId: string;
  onClose: () => void;
}): ReactNode {
  const checkIn = useCheckInMutation(kr.id, objectiveId);
  const [value, setValue] = useState(String(kr.currentValue));
  const [confidence, setConfidence] = useState<Confidence>('green');
  const [note, setNote] = useState('');

  const submit = async (): Promise<void> => {
    const num = Number(value);
    if (Number.isNaN(num)) return;
    await checkIn.mutateAsync({ value: num, confidence, note: note.trim() || undefined });
    onClose();
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-ink/30" />
        <Dialog.Content className="fixed left-1/2 top-1/3 w-[min(26rem,90vw)] -translate-x-1/2 border border-line bg-paper-raised p-5 shadow-card">
          <Dialog.Title className="mb-1 text-lg font-bold">Check in</Dialog.Title>
          <p className="mb-4 text-xs text-ink-soft">{kr.title}</p>
          <div className="space-y-4">
            <Field
              label={`Current value${kr.unit ? ` (${kr.unit})` : ''}`}
              type="number"
              step="any"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
            <div>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
                How's it feel?
              </span>
              <div className="flex gap-2" role="radiogroup" aria-label="confidence">
                {(['green', 'yellow', 'red'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={confidence === c}
                    onClick={() => setConfidence(c)}
                    className={`flex items-center gap-2 border px-3 py-1.5 text-sm transition-all ${
                      confidence === c ? 'border-ink font-semibold' : 'border-line opacity-60'
                    }`}
                  >
                    <span className={`size-2.5 rounded-full ${CONFIDENCE_RING[c].split(' ')[1]}`} />
                    {CONFIDENCE_LABEL[c]}
                  </button>
                ))}
              </div>
            </div>
            <Field
              label="Note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="good week…"
            />
            {checkIn.isError ? (
              <p className="text-xs text-rag-red">check-in failed — try again</p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                cancel
              </Button>
              <Button onClick={() => void submit()} disabled={checkIn.isPending}>
                save check-in
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
