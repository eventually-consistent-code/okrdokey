/**
 * Purpose: The 3-step KR wizard — the teaching path. Pick a shape, put
 *          numbers on it, review against the checklist. Posts through the
 *          same mutation as the expert form; the wizard is UI, not API.
 * Author(s): John Reed
 */

import {
  fillTemplate,
  KR_TEMPLATES,
  TEMPLATE_FN_LABELS,
  type KrTemplate,
  type TemplateFn,
} from '@okrdokey/shared';
import { Dialog } from 'radix-ui';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';

import { Button, Card, Field } from './bits.js';
import { useCreateKeyResult } from '../queries.js';

const FNS = Object.keys(TEMPLATE_FN_LABELS) as TemplateFn[];

export function KrWizard({
  objectiveId,
  existingKrCount,
  onClose,
}: {
  objectiveId: string;
  existingKrCount: number;
  onClose: () => void;
}): ReactNode {
  const create = useCreateKeyResult(objectiveId);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fn, setFn] = useState<TemplateFn>('engineering');
  const [template, setTemplate] = useState<KrTemplate | null>(null);
  const [baseline, setBaseline] = useState('');
  const [target, setTarget] = useState('');

  const request = useMemo(() => {
    if (!template) return null;
    return fillTemplate(template, {
      baseline: Number(baseline || 0),
      target: Number(target || 0),
    });
  }, [template, baseline, target]);

  const numericInvalid =
    template?.type === 'numeric' && (target === '' || Number(baseline || 0) === Number(target));
  const tooMany = existingKrCount >= 4;

  const submit = async (): Promise<void> => {
    if (!request) return;
    await create.mutateAsync(request);
    onClose();
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-ink/30" />
        <Dialog.Content className="fixed left-1/2 top-1/4 max-h-[70vh] w-[min(34rem,92vw)] -translate-x-1/2 overflow-y-auto border border-line bg-paper-raised p-5 shadow-card">
          <Dialog.Title className="mb-1 text-lg font-bold">
            {step === 1 ? 'What kind of result?' : step === 2 ? 'How will you measure it?' : 'Review'}
          </Dialog.Title>
          <p className="mb-4 text-xs text-ink-soft">
            {step === 1
              ? 'A key result is a number that changes — not a task you finish…'
              : step === 2
                ? "Don't know your baseline? Measuring it is a fine first key result."
                : 'One last look before it goes in the ledger.'}
          </p>

          {step === 1 ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {FNS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFn(f)}
                    className={`border px-3 py-1.5 text-sm ${fn === f ? 'border-ink font-semibold' : 'border-line opacity-60'}`}
                  >
                    {TEMPLATE_FN_LABELS[f]}
                  </button>
                ))}
              </div>
              <div className="grid gap-2">
                {KR_TEMPLATES.filter((t) => t.fn === fn).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setTemplate(t);
                      setStep(2);
                    }}
                    className="border border-line bg-paper p-3 text-left transition-colors hover:border-ember"
                  >
                    <p className="text-sm font-semibold">{t.title.replace('{baseline}', '…').replace('{target}', '…')}</p>
                    <p className="mt-1 text-xs text-ink-soft">{t.coach}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {step === 2 && template ? (
            <div className="space-y-3">
              <Card>
                <p className="text-sm font-semibold">
                  {template.title.replace('{baseline}', baseline || '…').replace('{target}', target || '…')}
                </p>
              </Card>
              {template.type === 'numeric' ? (
                <div className="grid grid-cols-2 gap-2">
                  <Field label={`Baseline${template.unit ? ` (${template.unit})` : ''}`} type="number" step="any" value={baseline} onChange={(e) => setBaseline(e.target.value)} autoFocus />
                  <Field label={`Target${template.unit ? ` (${template.unit})` : ''}`} type="number" step="any" value={target} onChange={(e) => setTarget(e.target.value)} />
                </div>
              ) : (
                <p className="text-xs text-ink-soft">
                  {template.type === 'boolean'
                    ? 'Done/not-done results are usually tasks in disguise — sure a number wouldn\'t fit better? Sometimes (a certification, a launch gate) boolean is honest. Carry on if so…'
                    : 'Percent-complete runs 0→100 automatically.'}
                </p>
              )}
              {numericInvalid && target !== '' ? (
                <p className="text-xs text-rag-red">baseline and target need a real gap — no gap, no progress to measure</p>
              ) : null}
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep(1)}>
                  back
                </Button>
                <Button onClick={() => setStep(3)} disabled={template.type === 'numeric' && (numericInvalid || target === '')}>
                  review
                </Button>
              </div>
            </div>
          ) : null}

          {step === 3 && request ? (
            <div className="space-y-3">
              <Card>
                <p className="font-semibold">{request.title}</p>
                <p className="ledger-num mt-1 text-xs text-ink-soft">
                  {request.type} · {request.baseline} → {request.target}
                  {request.unit ?? ''}
                </p>
              </Card>
              <ul className="space-y-1 text-sm">
                <li>✓ measurable — it has a baseline and a target</li>
                <li>✓ outcome — a number that changes, not a task</li>
                <li className={tooMany ? 'text-rag-yellow' : ''}>
                  {tooMany
                    ? `⚠ this objective already has ${existingKrCount} key results — past 4, focus dilutes`
                    : `✓ this objective will have ${existingKrCount + 1} key result${existingKrCount ? 's' : ''} — 2–4 is the sweet spot`}
                </li>
              </ul>
              {create.isError ? <p className="text-xs text-rag-red">could not create — try again</p> : null}
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep(2)}>
                  back
                </Button>
                <Button onClick={() => void submit()} disabled={create.isPending}>
                  create key result
                </Button>
              </div>
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
