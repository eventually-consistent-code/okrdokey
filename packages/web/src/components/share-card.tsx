/**
 * Purpose: Team-settings share card — enable, rotate, disable, copy the
 *          public link. Admin-only (parent gates rendering).
 * Author(s): John Reed
 */

import { shareTokenResponseSchema } from '@okrdokey/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { z } from 'zod';

import { apiFetch, ApiError } from '../api.js';
import { Button, Card } from './bits.js';

export function ShareCard({ teamId }: { teamId: string }): ReactNode {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);

  const share = useQuery({
    queryKey: ['share', teamId],
    queryFn: () => apiFetch(`/teams/${teamId}/share`, shareTokenResponseSchema),
    retry: (count, err) => !(err instanceof ApiError && err.statusCode === 404) && count < 2,
  });

  const invalidate = (): void => void qc.invalidateQueries({ queryKey: ['share', teamId] });
  const enable = useMutation({
    mutationFn: () => apiFetch(`/teams/${teamId}/share`, shareTokenResponseSchema, { method: 'PUT' }),
    onSuccess: invalidate,
  });
  const disable = useMutation({
    mutationFn: () => apiFetch(`/teams/${teamId}/share`, z.null(), { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  const link = share.data ? `${window.location.origin}${share.data.url}` : null;

  return (
    <Card>
      <p className="mb-1 font-semibold">Public dashboard</p>
      <p className="mb-3 text-xs text-ink-soft">
        a read-only page anyone with the link can see — scores and statuses, never notes or
        emails…
      </p>
      {link ? (
        <div className="space-y-2">
          <p className="ledger-num break-all border border-line bg-paper px-2 py-1 text-xs">{link}</p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                void navigator.clipboard.writeText(link).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              {copied ? 'copied.' : 'copy link'}
            </Button>
            <Button variant="ghost" onClick={() => void enable.mutateAsync()}>
              rotate (old link dies)
            </Button>
            <Button variant="danger" onClick={() => void disable.mutateAsync()}>
              disable
            </Button>
          </div>
        </div>
      ) : (
        <Button onClick={() => void enable.mutateAsync()} disabled={enable.isPending}>
          enable sharing
        </Button>
      )}
    </Card>
  );
}
