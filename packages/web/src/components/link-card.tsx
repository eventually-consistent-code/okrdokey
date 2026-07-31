/**
 * Purpose: The tracker-link dialog — bind a KR to GitHub (milestone or
 *          label) or Jira and let the sync engine do the check-ins. Shows
 *          sync health (last error, failure streak) and offers unlink.
 * Author(s): John Reed
 */

import type { KeyResultResponse, UpsertKrLinkRequest } from '@okrdokey/shared';
import { Dialog } from 'radix-ui';
import type { ReactNode, SelectHTMLAttributes } from 'react';
import { useState } from 'react';

import { Button, Field } from './bits.js';
import { useDeleteKrLink, useKrLink, useUpsertKrLink } from '../queries.js';

type Provider = 'github' | 'jira';
type Mode = 'percent-closed' | 'count-closed';
type GithubShape = 'milestone' | 'label';

// a <select> dressed like a Field so the form reads as one piece
function SelectField({
  label,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode }): ReactNode {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
        {label}
      </span>
      <select
        className="w-full border border-line bg-paper-raised px-3 py-2 text-sm outline-none focus:border-ember"
        {...rest}
      >
        {children}
      </select>
    </label>
  );
}

// last synced / last error / failure streak, straight off the link response
function SyncHealth({
  link,
}: {
  link: NonNullable<ReturnType<typeof useKrLink>['data']>;
}): ReactNode {
  return (
    <div className="border border-line bg-paper px-3 py-2 text-xs">
      <p className="text-ink-soft">
        linked to <span className="font-semibold">{link.provider}</span> · syncs every{' '}
        {link.syncIntervalMinutes}m · last synced{' '}
        {link.lastSyncedAt ? new Date(link.lastSyncedAt).toLocaleString() : 'never'}
      </p>
      {link.lastError ? (
        <p className="mt-1 text-rag-red">
          {link.lastError} ({link.consecutiveFailures} consecutive{' '}
          {link.consecutiveFailures === 1 ? 'failure' : 'failures'})
        </p>
      ) : null}
    </div>
  );
}

export function LinkCard({
  kr,
  onClose,
}: {
  kr: KeyResultResponse;
  onClose: () => void;
}): ReactNode {
  const link = useKrLink(kr.id);
  const upsert = useUpsertKrLink(kr.id);
  const unlink = useDeleteKrLink(kr.id);

  const [provider, setProvider] = useState<Provider>('github');
  const [mode, setMode] = useState<Mode>('percent-closed');
  const [secret, setSecret] = useState('');
  const [interval, setInterval] = useState('15');
  // github fields
  const [shape, setShape] = useState<GithubShape>('milestone');
  const [repo, setRepo] = useState('');
  const [milestoneNumber, setMilestoneNumber] = useState('');
  const [label, setLabel] = useState('');
  // jira fields
  const [jiraBaseUrl, setJiraBaseUrl] = useState('');
  const [jiraEmail, setJiraEmail] = useState('');
  const [jql, setJql] = useState('');
  const [formError, setFormError] = useState('');

  const submit = async (): Promise<void> => {
    const syncIntervalMinutes = Number(interval) || 15;
    const body: UpsertKrLinkRequest =
      provider === 'github'
        ? {
            provider: 'github',
            config:
              shape === 'milestone'
                ? { repo, milestoneNumber: Number(milestoneNumber) }
                : { repo, label },
            mode,
            secret,
            syncIntervalMinutes,
          }
        : {
            provider: 'jira',
            config: { baseUrl: jiraBaseUrl, email: jiraEmail, jql },
            mode,
            secret,
            syncIntervalMinutes,
          };
    try {
      await upsert.mutateAsync(body);
      onClose();
    } catch {
      setFormError('link failed — check the fields and try again');
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-ink/30" />
        <Dialog.Content className="fixed left-1/2 top-1/4 w-[min(28rem,90vw)] -translate-x-1/2 border border-line bg-paper-raised p-5 shadow-card">
          <Dialog.Title className="mb-1 text-lg font-bold">Tracker link</Dialog.Title>
          <p className="mb-4 text-xs text-ink-soft">{kr.title}</p>

          <div className="space-y-4">
            {link.data ? (
              <>
                <SyncHealth link={link.data} />
                <div className="flex justify-end">
                  <Button
                    variant="danger"
                    disabled={unlink.isPending}
                    onClick={() => {
                      void unlink.mutateAsync().then(onClose);
                    }}
                  >
                    unlink
                  </Button>
                </div>
              </>
            ) : null}

            <SelectField
              label="Provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value as Provider)}
            >
              <option value="github">github</option>
              <option value="jira">jira</option>
            </SelectField>

            {provider === 'github' ? (
              <>
                <Field
                  label="Repository (owner/repo)"
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                  placeholder="octo/rocket"
                />
                <SelectField
                  label="Track by"
                  value={shape}
                  onChange={(e) => setShape(e.target.value as GithubShape)}
                >
                  <option value="milestone">milestone</option>
                  <option value="label">label</option>
                </SelectField>
                {shape === 'milestone' ? (
                  <Field
                    label="Milestone number"
                    type="number"
                    min={1}
                    value={milestoneNumber}
                    onChange={(e) => setMilestoneNumber(e.target.value)}
                  />
                ) : (
                  <Field
                    label="Label"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="q3-launch"
                  />
                )}
              </>
            ) : (
              <>
                <Field
                  label="Jira base URL"
                  value={jiraBaseUrl}
                  onChange={(e) => setJiraBaseUrl(e.target.value)}
                  placeholder="https://acme.atlassian.net"
                />
                <Field
                  label="Email"
                  type="email"
                  value={jiraEmail}
                  onChange={(e) => setJiraEmail(e.target.value)}
                />
                <Field
                  label="JQL"
                  value={jql}
                  onChange={(e) => setJql(e.target.value)}
                  placeholder='project = OKR AND labels = "q3"'
                />
              </>
            )}

            <SelectField
              label="Mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as Mode)}
            >
              <option value="percent-closed">percent closed</option>
              <option value="count-closed">count closed</option>
            </SelectField>

            <Field
              label={provider === 'github' ? 'Personal access token' : 'API token'}
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              autoComplete="off"
            />

            <Field
              label="Sync interval (minutes)"
              type="number"
              min={5}
              max={1440}
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
            />

            {formError ? <p className="text-xs text-rag-red">{formError}</p> : null}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                cancel
              </Button>
              <Button onClick={() => void submit()} disabled={upsert.isPending || !secret}>
                save link
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
