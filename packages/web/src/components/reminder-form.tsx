/**
 * Purpose: Reminder cadence config — preset rhythms over raw cron, timezone,
 *          optional Slack-compatible webhook URL.
 * Author(s): John Reed
 */

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { Button, Card, Field } from './bits.js';
import { useReminders, useUpsertReminder } from '../queries.js';

const PRESETS = [
  { label: 'weekly (Mon 9am)', cron: '0 9 * * 1' },
  { label: 'biweekly-ish (1st & 15th, 9am)', cron: '0 9 1,15 * *' },
  { label: 'daily (weekdays 9am)', cron: '0 9 * * 1-5' },
];

export function ReminderForm({ teamId }: { teamId?: string }): ReactNode {
  const reminders = useReminders();
  const upsert = useUpsertReminder();
  const existing = reminders.data?.find((r) => (teamId ? r.teamId === teamId : r.teamId === null));

  const [cron, setCron] = useState(PRESETS[0]?.cron ?? '0 9 * * 1');
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [webhookUrl, setWebhookUrl] = useState('');

  useEffect(() => {
    if (existing) {
      setCron(existing.cronExpr);
      setTimezone(existing.timezone);
      setWebhookUrl(existing.webhookUrl ?? '');
    }
  }, [existing]);

  const save = async (): Promise<void> => {
    await upsert.mutateAsync({
      teamId,
      cronExpr: cron,
      timezone,
      webhookUrl: webhookUrl.trim() || undefined,
      enabled: true,
    });
  };

  return (
    <Card>
      <p className="mb-1 font-semibold">Check-in reminders</p>
      <p className="mb-3 text-xs text-ink-soft">
        the rhythm that keeps OKRs from dying quietly — nudges go to the webhook (Slack works)…
      </p>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.cron}
              type="button"
              onClick={() => setCron(p.cron)}
              className={`border px-3 py-1.5 text-sm ${cron === p.cron ? 'border-ink font-semibold' : 'border-line opacity-60'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <Field label="Cron" value={cron} onChange={(e) => setCron(e.target.value)} />
          <Field label="Timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
        </div>
        <Field
          label="Webhook URL (optional)"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          placeholder="https://hooks.slack.com/services/…"
        />
        {existing ? (
          <p className="ledger-num text-xs text-ink-soft">
            next nudge: {new Date(existing.nextDueAt).toLocaleString()}
          </p>
        ) : null}
        {upsert.isError ? (
          <p className="text-xs text-rag-red">could not save — check the cron expression</p>
        ) : null}
        <Button onClick={() => void save()} disabled={upsert.isPending}>
          save reminder
        </Button>
      </div>
    </Card>
  );
}
