/**
 * Purpose: The dashboard — cycle picker, status donut, objective ledger.
 *          This is the page that has to beat the spreadsheet.
 * Author(s): John Reed
 */

import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { Button, Card, Score, StatusStamp } from '../components/bits.js';
import { StatusDonut } from '../components/charts.js';
import { NewObjectiveDialog } from '../components/new-objective.js';
import { useCycles, useSummary } from '../queries.js';

export function DashboardPage(): ReactNode {
  const cycles = useCycles();
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const cycleId = picked ?? cycles.data?.find((c) => c.status === 'open')?.id ?? cycles.data?.[0]?.id;
  const summary = useSummary(cycleId);
  const [creating, setCreating] = useState(false);

  if (cycles.isLoading) return <p className="text-sm text-ink-soft">loading…</p>;
  if (!cycles.data?.length) {
    return (
      <Card className="rise">
        <p className="mb-2 font-semibold">No cycles yet.</p>
        <p className="mb-3 text-sm text-ink-soft">
          A cycle is the quarter (or any date range) your objectives live in — make one first…
        </p>
        <Link to="/my/cycles">
          <Button>create a cycle</Button>
        </Link>
      </Card>
    );
  }

  const s = summary.data;
  const counts: [number, number, number] = s
    ? [
        s.objectives.filter((o) => o.status === 'on-track').length,
        s.objectives.filter((o) => o.status === 'at-risk').length,
        s.objectives.filter((o) => o.status === 'behind').length,
      ]
    : [0, 0, 0];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Cycle
          </label>
          <select
            className="border border-line bg-paper-raised px-3 py-1.5 text-sm"
            value={cycleId}
            onChange={(e) => setPicked(e.target.value)}
          >
            {cycles.data.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <Button onClick={() => setCreating(true)}>+ objective</Button>
      </div>

      {s ? (
        <div className="grid gap-6 md:grid-cols-[auto_1fr]">
          <Card className="rise flex items-center gap-4">
            <StatusDonut counts={counts} />
            <div className="space-y-1 text-sm">
              <p>
                <span className="ledger-num font-semibold">{counts[0]}</span> on-track
              </p>
              <p>
                <span className="ledger-num font-semibold">{counts[1]}</span> at-risk
              </p>
              <p>
                <span className="ledger-num font-semibold">{counts[2]}</span> behind
              </p>
              <p className="pt-1 text-xs text-ink-soft">
                cycle <span className="ledger-num">{Math.round(s.elapsed * 100)}%</span> elapsed
              </p>
            </div>
          </Card>

          <div className="space-y-2">
            {s.objectives.length === 0 ? (
              <Card className="rise">
                <p className="text-sm text-ink-soft">
                  Nothing in this cycle yet — add the first objective and give it a measurable key
                  result…
                </p>
              </Card>
            ) : (
              s.objectives.map((o, i) => (
                <Link
                  key={o.id}
                  to="/o/$objectiveId"
                  params={{ objectiveId: o.id }}
                  className="block"
                >
                  <Card
                    className="rise flex items-center justify-between gap-4 transition-colors hover:border-ember"
                  >
                    <div style={{ animationDelay: `${i * 40}ms` }}>
                      <p className="font-semibold">{o.title}</p>
                      <p className="text-xs text-ink-soft">{o.teamId ? 'team' : 'personal'}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusStamp status={o.status} />
                      <Score value={o.score} />
                    </div>
                  </Card>
                </Link>
              ))
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-ink-soft">loading summary…</p>
      )}

      {creating && cycleId ? (
        <NewObjectiveDialog cycleId={cycleId} onClose={() => setCreating(false)} />
      ) : null}
    </div>
  );
}
