/**
 * Purpose: Weekly digest settings — day + hour compose the cron so nobody
 *          writes cron by hand, timezone defaults to the browser's, and
 *          "send me a preview" proves the SMTP path before the schedule
 *          ever fires. Renders only when the instance has SMTP.
 * Author(s): John Reed
 */

import { digestScheduleResponseSchema } from '@okrdokey/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { apiFetch, ApiError } from '../api.js';
import { Button, Card } from './bits.js';
import { useEmailFeature } from '../queries.js';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function DigestCard({ teamId }: { teamId: string }): ReactNode {
  const email = useEmailFeature();
  const qc = useQueryClient();
  const [day, setDay] = useState(1); // Monday
  const [hour, setHour] = useState(9);
  const [sent, setSent] = useState(false);

  const schedule = useQuery({
    queryKey: ['digest', teamId],
    queryFn: async () => {
      try {
        return await apiFetch(`/teams/${teamId}/digest`, digestScheduleResponseSchema);
      } catch (err) {
        if (err instanceof ApiError && err.statusCode === 404) return null;
        throw err;
      }
    },
    enabled: email.data === true,
  });

  const save = useMutation({
    mutationFn: () =>
      apiFetch(`/teams/${teamId}/digest`, digestScheduleResponseSchema, {
        method: 'PUT',
        body: JSON.stringify({
          cronExpr: `0 ${hour} * * ${day}`,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          enabled: true,
        }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['digest', teamId] }),
  });

  const remove = useMutation({
    mutationFn: () => apiFetch(`/teams/${teamId}/digest`, z.null(), { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['digest', teamId] }),
  });

  const preview = useMutation({
    mutationFn: () =>
      apiFetch(`/teams/${teamId}/digest/test`, z.object({ sent: z.boolean() }), {
        method: 'POST',
      }),
    onSuccess: () => setSent(true),
  });

  if (email.data !== true) return null;

  const row = schedule.data;
  const err = save.error ?? remove.error ?? preview.error;

  return (
    <Card>
      <p className="mb-1 font-semibold">Weekly digest</p>
      <p className="mb-3 text-xs text-ink-soft">
        one email a week — scores, statuses, who checked in. No dashboards to remember to open…
      </p>

      {row ? (
        <div className="flex items-center justify-between gap-3">
          <p className="ledger-num text-xs" data-testid="digest-active">
            {row.enabled ? 'on' : 'off'} · {row.cronExpr} ({row.timezone})
            {row.nextDueAt ? ` · next ${new Date(row.nextDueAt).toLocaleString()}` : ''}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => preview.mutate()} disabled={preview.isPending}>
              send me a preview
            </Button>
            <Button variant="danger" onClick={() => remove.mutate()} disabled={remove.isPending}>
              turn off
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <label className="block text-xs">
            <span className="mb-1 block font-semibold uppercase tracking-wide text-ink-soft">Day</span>
            <select
              className="border border-line bg-paper-raised px-2 py-2 text-sm"
              value={day}
              onChange={(e) => setDay(Number(e.target.value))}
            >
              {DAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-semibold uppercase tracking-wide text-ink-soft">Hour</span>
            <select
              className="border border-line bg-paper-raised px-2 py-2 text-sm"
              value={hour}
              onChange={(e) => setHour(Number(e.target.value))}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </label>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            enable weekly digest
          </Button>
        </div>
      )}

      {sent ? <p className="mt-2 text-xs text-rag-green">preview sent — check your inbox.</p> : null}
      {err instanceof ApiError ? <p className="mt-2 text-xs text-rag-red">{err.message}</p> : null}
    </Card>
  );
}
