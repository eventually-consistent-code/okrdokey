/**
 * Purpose: Your data, in and out. Export buttons (full JSON backup, CSV
 *          in the import format), and a paste-CSV import flow that
 *          dry-runs first — preview + errors before anything writes.
 * Author(s): John Reed
 */

import { importResponseSchema, type ImportResponse } from '@okrdokey/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { apiFetch, ApiError } from '../api.js';
import { Button, Card } from './bits.js';

const CSV_HINT =
  'objective_title,objective_description,team_name,cycle_name,kr_title,kr_type,kr_unit,kr_baseline,kr_target';

export function DataCard(): ReactNode {
  const qc = useQueryClient();
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<ImportResponse | null>(null);
  const [imported, setImported] = useState<ImportResponse | null>(null);

  const run = useMutation({
    mutationFn: (dryRun: boolean) =>
      apiFetch(`/import/objectives${dryRun ? '?dryRun=true' : ''}`, importResponseSchema, {
        method: 'POST',
        body: JSON.stringify({ csv }),
      }),
    onSuccess: (r) => {
      if (r.dryRun) {
        setPreview(r);
        setImported(null);
      } else {
        setImported(r);
        setPreview(null);
        setCsv('');
        void qc.invalidateQueries({ queryKey: ['objectives'] });
        void qc.invalidateQueries({ queryKey: ['summary'] });
      }
    },
  });

  return (
    <Card className="rise space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">your data</p>

      <div className="flex flex-wrap gap-2">
        <a href="/export" download="okrdokey-export.json">
          <Button variant="ghost">export JSON (full backup)</Button>
        </a>
        <a href="/export.csv" download>
          <Button variant="ghost">export CSV</Button>
        </a>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-ink-soft">
          Import objectives from CSV — one row per key result, header exactly:
        </p>
        <p className="ledger-num break-all text-[10px] text-ink-soft">{CSV_HINT}</p>
        <textarea
          className="w-full border border-line bg-paper px-3 py-2 font-ledger text-xs"
          rows={5}
          value={csv}
          onChange={(e) => {
            setCsv(e.target.value);
            setPreview(null);
            setImported(null);
          }}
          placeholder={`${CSV_HINT}\nGrow revenue,,,2026-Q4,MRR 10→50,numeric,k$,10,50`}
          data-testid="import-csv"
        />
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={() => run.mutate(true)}
            disabled={!csv.trim() || run.isPending}
          >
            preview import
          </Button>
          {preview && preview.errors.length === 0 && preview.creates.objectives > 0 ? (
            <Button onClick={() => run.mutate(false)} disabled={run.isPending}>
              import {preview.creates.objectives} objectives / {preview.creates.keyResults} KRs
            </Button>
          ) : null}
        </div>
      </div>

      {run.error instanceof ApiError ? (
        <p className="text-xs text-rag-red">{run.error.message}</p>
      ) : null}

      {preview ? (
        <div className="space-y-1" data-testid="import-preview">
          {preview.preview.map((p, i) => (
            <p key={i} className="text-xs">
              · {p.title} — {p.keyResults} KRs → {p.cycleName}
              {p.teamName ? ` (${p.teamName})` : ''}
            </p>
          ))}
          {preview.errors.map((e, i) => (
            <p key={i} className="text-xs text-rag-red">
              line {e.line}: {e.message}
            </p>
          ))}
          {preview.errors.length > 0 ? (
            <p className="text-xs text-ink-soft">fix every error — an import with errors writes nothing</p>
          ) : null}
        </div>
      ) : null}

      {imported ? (
        <p className="text-xs text-rag-green" data-testid="import-done">
          imported {imported.creates.objectives} objectives / {imported.creates.keyResults} key
          results.
        </p>
      ) : null}
    </Card>
  );
}
