/**
 * Purpose: The 3-step KR wizard — the teaching path. Pick a shape (or let
 *          AI draft 2–3 from the objective), put numbers on it, review
 *          against the checklist. AI suggestions prefill the same steps —
 *          nothing is created until the user says so. Posts through the
 *          same mutation as the expert form; the wizard is UI, not API.
 * Author(s): John Reed
 */

import {
  fillTemplate,
  KR_TEMPLATES,
  TEMPLATE_FN_LABELS,
  type AiKrSuggestion,
  type CreateKeyResultRequest,
  type KrTemplate,
  type TemplateFn,
} from '@okrdokey/shared';
import { Dialog } from 'radix-ui';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';

import { Button, Card, Field } from './bits.js';
import { ApiError } from '../api.js';
import { useAiStatus, useCreateKeyResult, useDraftKrs, useImproveKr } from '../queries.js';

const FNS = Object.keys(TEMPLATE_FN_LABELS) as TemplateFn[];

// AI suggestions carry literal titles; normalize percent/boolean bounds the
// same way the server does before re-validating
function suggestionRequest(s: AiKrSuggestion, baseline: number, target: number): CreateKeyResultRequest {
  return {
    title: s.title,
    type: s.type,
    unit: s.unit ?? undefined,
    baseline: s.type === 'percent' ? 0 : s.type === 'boolean' ? 0 : baseline,
    target: s.type === 'percent' ? 100 : s.type === 'boolean' ? 1 : target,
  };
}

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
  const ai = useAiStatus(objectiveId);
  const draft = useDraftKrs();
  const improve = useImproveKr();
  const [step, setStep] = useState<'ai' | 1 | 2 | 3>(1);
  const [fn, setFn] = useState<TemplateFn>('engineering');
  const [template, setTemplate] = useState<KrTemplate | null>(null);
  const [aiPick, setAiPick] = useState<AiKrSuggestion | null>(null);
  const [aiContext, setAiContext] = useState('');
  const [baseline, setBaseline] = useState('');
  const [target, setTarget] = useState('');

  const activeType = aiPick?.type ?? template?.type;

  const request = useMemo(() => {
    if (aiPick) return suggestionRequest(aiPick, Number(baseline || 0), Number(target || 0));
    if (!template) return null;
    return fillTemplate(template, {
      baseline: Number(baseline || 0),
      target: Number(target || 0),
    });
  }, [template, aiPick, baseline, target]);

  const numericInvalid =
    activeType === 'numeric' && (target === '' || Number(baseline || 0) === Number(target));
  const tooMany = existingKrCount >= 4;

  // the title as the user currently sees it on the measure step
  const draftTitle = aiPick
    ? aiPick.title
    : (template?.title ?? '').replace('{baseline}', baseline || '…').replace('{target}', target || '…');

  const pickSuggestion = (s: AiKrSuggestion): void => {
    setAiPick(s);
    setTemplate(null);
    setBaseline(String(s.baseline));
    setTarget(String(s.target));
    improve.reset();
    setStep(2);
  };

  const submit = async (): Promise<void> => {
    if (!request) return;
    await create.mutateAsync(request);
    onClose();
  };

  const aiError = (err: unknown): string | null =>
    err instanceof ApiError ? err.message : err ? 'drafting failed — try again' : null;

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-ink/30" />
        <Dialog.Content className="fixed left-1/2 top-1/4 max-h-[70vh] w-[min(34rem,92vw)] -translate-x-1/2 overflow-y-auto border border-line bg-paper-raised p-5 shadow-card">
          <Dialog.Title className="mb-1 text-lg font-bold">
            {step === 'ai'
              ? 'Draft with AI'
              : step === 1
                ? 'What kind of result?'
                : step === 2
                  ? 'How will you measure it?'
                  : 'Review'}
          </Dialog.Title>
          <p className="mb-4 text-xs text-ink-soft">
            {step === 'ai'
              ? 'Suggestions prefill the form — you review every number before anything is created.'
              : step === 1
                ? 'A key result is a number that changes — not a task you finish…'
                : step === 2
                  ? "Don't know your baseline? Measuring it is a fine first key result."
                  : 'One last look before it goes in the ledger.'}
          </p>

          {step === 1 ? (
            <div className="space-y-3">
              {ai.data ? (
                ai.data.enabled ? (
                  <button
                    type="button"
                    data-testid="ai-draft-entry"
                    onClick={() => setStep('ai')}
                    className="w-full border border-ember/50 bg-paper p-3 text-left transition-colors hover:border-ember"
                  >
                    <p className="text-sm font-semibold">✦ Draft with AI</p>
                    <p className="mt-1 text-xs text-ink-soft">
                      2–3 measurable suggestions from your objective — placeholder numbers you replace with real ones.
                    </p>
                  </button>
                ) : (
                  <p className="border border-line bg-paper p-3 text-xs text-ink-soft" data-testid="ai-teaser">
                    ✦ AI drafting is available — a team admin can add an Anthropic API key in Team Settings to turn it on.
                  </p>
                )
              ) : null}
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
                      setAiPick(null);
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

          {step === 'ai' ? (
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  Anything the objective title doesn't say? (optional)
                </span>
                <textarea
                  className="w-full border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ember"
                  rows={3}
                  maxLength={2000}
                  value={aiContext}
                  onChange={(e) => setAiContext(e.target.value)}
                  placeholder="e.g. we're pre-launch, the metric that matters most is activation…"
                />
              </label>
              {draft.data ? (
                <div className="grid gap-2" data-testid="ai-suggestions">
                  {draft.data.suggestions.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => pickSuggestion(s)}
                      className="border border-line bg-paper p-3 text-left transition-colors hover:border-ember"
                    >
                      <p className="text-sm font-semibold">{s.title}</p>
                      <p className="ledger-num mt-1 text-xs text-ink-soft">
                        {s.type} · {s.baseline} → {s.target}
                        {s.unit ?? ''}
                      </p>
                      <p className="mt-1 text-xs text-ink-soft">{s.rationale}</p>
                    </button>
                  ))}
                  <p className="text-xs text-ink-soft">baselines are placeholder guesses — you'll set the real numbers next</p>
                </div>
              ) : null}
              {aiError(draft.error) ? <p className="text-xs text-rag-red">{aiError(draft.error)}</p> : null}
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep(1)}>
                  back
                </Button>
                <Button
                  onClick={() => draft.mutate({ objectiveId, context: aiContext.trim() || undefined })}
                  disabled={draft.isPending}
                >
                  {draft.isPending ? 'drafting…' : draft.data ? 'draft again' : 'draft suggestions'}
                </Button>
              </div>
            </div>
          ) : null}

          {step === 2 && (template ?? aiPick) ? (
            <div className="space-y-3">
              <Card>
                <p className="text-sm font-semibold">{draftTitle}</p>
              </Card>
              {activeType === 'numeric' ? (
                <div className="grid grid-cols-2 gap-2">
                  <Field label={`Baseline${(aiPick?.unit ?? template?.unit) ? ` (${aiPick?.unit ?? template?.unit})` : ''}`} type="number" step="any" value={baseline} onChange={(e) => setBaseline(e.target.value)} autoFocus />
                  <Field label={`Target${(aiPick?.unit ?? template?.unit) ? ` (${aiPick?.unit ?? template?.unit})` : ''}`} type="number" step="any" value={target} onChange={(e) => setTarget(e.target.value)} />
                </div>
              ) : (
                <p className="text-xs text-ink-soft">
                  {activeType === 'boolean'
                    ? 'Done/not-done results are usually tasks in disguise — sure a number wouldn\'t fit better? Sometimes (a certification, a launch gate) boolean is honest. Carry on if so…'
                    : 'Percent-complete runs 0→100 automatically.'}
                </p>
              )}
              {numericInvalid && target !== '' ? (
                <p className="text-xs text-rag-red">baseline and target need a real gap — no gap, no progress to measure</p>
              ) : null}

              {ai.data?.enabled ? (
                <div className="space-y-2">
                  <Button
                    variant="ghost"
                    data-testid="ai-feedback"
                    disabled={improve.isPending || !draftTitle.trim()}
                    onClick={() =>
                      improve.mutate({
                        objectiveId,
                        title: draftTitle,
                        type: activeType ?? 'numeric',
                        baseline: baseline === '' ? undefined : Number(baseline),
                        target: target === '' ? undefined : Number(target),
                      })
                    }
                  >
                    {improve.isPending ? 'thinking…' : '✦ get AI feedback'}
                  </Button>
                  {improve.data ? (
                    <Card className="space-y-2">
                      <ul className="space-y-1 text-xs">
                        {improve.data.critique.map((c, i) => (
                          <li key={i}>· {c}</li>
                        ))}
                      </ul>
                      <div className="border-t border-line pt-2">
                        <p className="text-sm font-semibold">{improve.data.rewrite.title}</p>
                        <p className="ledger-num text-xs text-ink-soft">
                          {improve.data.rewrite.type} · {improve.data.rewrite.baseline} → {improve.data.rewrite.target}
                          {improve.data.rewrite.unit ?? ''}
                        </p>
                        <Button
                          variant="ghost"
                          className="mt-2"
                          onClick={() => pickSuggestion(improve.data.rewrite)}
                        >
                          use this rewrite
                        </Button>
                      </div>
                    </Card>
                  ) : null}
                  {aiError(improve.error) ? <p className="text-xs text-rag-red">{aiError(improve.error)}</p> : null}
                </div>
              ) : null}

              <div className="flex justify-between">
                <Button
                  variant="ghost"
                  onClick={() => {
                    improve.reset();
                    setStep(aiPick ? 'ai' : 1);
                  }}
                >
                  back
                </Button>
                <Button onClick={() => setStep(3)} disabled={activeType === 'numeric' && (numericInvalid || target === '')}>
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
