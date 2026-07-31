/**
 * Purpose: Team Settings panel for the BYO Anthropic key — admin enters a
 *          key (validated server-side before it saves), sees last-4 +
 *          last-used only, and can revoke. The key itself never comes back.
 * Author(s): John Reed
 */

import type { ReactNode } from 'react';
import { useState } from 'react';

import { Button, Card } from './bits.js';
import { ApiError } from '../api.js';
import { useAiStatus, useDeleteTeamAiKey, useSetTeamAiKey, useTeamAiKey } from '../queries.js';

export function AiKeyCard({ teamId }: { teamId: string }): ReactNode {
  const status = useAiStatus();
  const current = useTeamAiKey(teamId);
  const save = useSetTeamAiKey(teamId);
  const revoke = useDeleteTeamAiKey(teamId);
  const [key, setKey] = useState('');

  // feature off (routes not registered), still loading, or status errored —
  // no panel unless we positively know the feature is on
  if (!status.data) return null;

  const row = current.data;
  const err = save.error ?? revoke.error;

  return (
    <Card>
      <p className="mb-1 font-semibold">AI drafting</p>
      <p className="mb-3 text-xs text-ink-soft">
        Bring your own Anthropic API key and this team gets AI-drafted key result suggestions.
        The key is encrypted at rest and never shown again — only its last four characters.
      </p>

      {row ? (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="ledger-num text-sm" data-testid="ai-key-masked">
              sk-ant-…{row.keyLast4}
            </p>
            <p className="text-xs text-ink-soft">
              added {new Date(row.createdAt).toLocaleDateString()}
              {row.lastUsedAt ? ` · last used ${new Date(row.lastUsedAt).toLocaleDateString()}` : ' · not used yet'}
            </p>
          </div>
          <Button variant="danger" onClick={() => revoke.mutate()} disabled={revoke.isPending}>
            revoke
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            className="flex-1 border border-line bg-paper-raised px-3 py-2 text-sm outline-none focus:border-ember"
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="sk-ant-…"
            autoComplete="off"
            data-testid="ai-key-input"
          />
          <Button
            onClick={() => save.mutate(key, { onSuccess: () => setKey('') })}
            disabled={key.trim().length < 20 || save.isPending}
          >
            {save.isPending ? 'checking…' : 'save key'}
          </Button>
        </div>
      )}

      {err instanceof ApiError ? <p className="mt-2 text-xs text-rag-red">{err.message}</p> : null}
    </Card>
  );
}
