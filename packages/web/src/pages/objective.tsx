/**
 * Purpose: Objective detail — the KR ledger. Each key result shows score,
 *          RAG dot, trend sparkline, and a one-click check-in.
 * Author(s): John Reed
 */

import type { KeyResultResponse } from '@okrdokey/shared';
import { useNavigate, useParams } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { Button, Card, RagDot, Score, StatusStamp } from '../components/bits.js';
import { Sparkline } from '../components/charts.js';
import { CheckInDialog } from '../components/check-in-dialog.js';
import { LinkCard } from '../components/link-card.js';
import { KrWizard } from '../components/kr-wizard.js';
import { NewKeyResultForm } from '../components/new-key-result.js';
import { useArchiveObjective, useCheckIns, useObjective } from '../queries.js';

function KeyResultRow({
  kr,
  objectiveId,
}: {
  kr: KeyResultResponse;
  objectiveId: string;
}): ReactNode {
  const history = useCheckIns(kr.id);
  const [checkingIn, setCheckingIn] = useState(false);
  const [linking, setLinking] = useState(false);
  // history arrives newest-first; the sparkline reads left-to-right in time
  const trend = (history.data ?? []).map((c) => c.value).reverse();

  return (
    <Card className="rise">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-semibold">
            <RagDot confidence={kr.currentConfidence} />
            {kr.title}
          </p>
          <p className="ledger-num mt-1 text-xs text-ink-soft">
            {kr.currentValue}
            {kr.unit ?? ''} · baseline {kr.baseline}
            {kr.unit ?? ''} → target {kr.target}
            {kr.unit ?? ''}
          </p>
          <div className="mt-2 max-w-xs">
            <Sparkline values={trend} tone={kr.currentConfidence} />
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Score value={kr.score} />
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setCheckingIn(true)}>
              check in
            </Button>
            <Button variant="ghost" onClick={() => setLinking(true)}>
              link
            </Button>
          </div>
        </div>
      </div>
      {checkingIn ? (
        <CheckInDialog kr={kr} objectiveId={objectiveId} onClose={() => setCheckingIn(false)} />
      ) : null}
      {linking ? <LinkCard kr={kr} onClose={() => setLinking(false)} /> : null}
    </Card>
  );
}

export function ObjectivePage(): ReactNode {
  const { objectiveId } = useParams({ from: '/app/o/$objectiveId' });
  const objective = useObjective(objectiveId);
  const archive = useArchiveObjective();
  const navigate = useNavigate();
  const [addingKr, setAddingKr] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  if (objective.isLoading) return <p className="text-sm text-ink-soft">loading…</p>;
  const o = objective.data;
  if (!o) return <p className="text-sm text-ink-soft">objective not found.</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{o.title}</h1>
          {o.description ? <p className="mt-1 text-sm text-ink-soft">{o.description}</p> : null}
        </div>
        <div className="flex items-center gap-3">
          <StatusStamp status={o.status} />
          <Score value={o.score} size="lg" />
        </div>
      </div>

      <div className="space-y-3">
        {o.keyResults.length === 0 ? (
          <Card>
            <p className="mb-3 text-sm text-ink-soft">
              An objective without key results is a wish — add something measurable…
            </p>
            <Button onClick={() => setWizardOpen(true)}>add your first key result — guided</Button>
          </Card>
        ) : (
          o.keyResults.map((kr) => <KeyResultRow key={kr.id} kr={kr} objectiveId={o.id} />)
        )}
      </div>

      {wizardOpen ? (
        <KrWizard
          objectiveId={o.id}
          existingKrCount={o.keyResults.length}
          onClose={() => setWizardOpen(false)}
        />
      ) : null}

      {addingKr ? (
        <NewKeyResultForm objectiveId={o.id} onDone={() => setAddingKr(false)} />
      ) : (
        <div className="flex gap-2">
          <Button onClick={() => setAddingKr(true)}>+ key result</Button>
          <Button variant="ghost" onClick={() => setWizardOpen(true)}>
            guide me
          </Button>
          {!o.archivedAt ? (
            <Button
              variant="danger"
              onClick={() => {
                void archive.mutateAsync(o.id).then(() => navigate({ to: '/' }));
              }}
            >
              archive
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
