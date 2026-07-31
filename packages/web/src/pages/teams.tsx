/**
 * Purpose: Teams — list, detail with member roster + role controls, and the
 *          reminder cadence form (the webhook nudge config).
 * Author(s): John Reed
 */

import {
  teamMemberSchema,
  teamResponseSchema,
  type TeamDetailResponse,
} from '@okrdokey/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { z } from 'zod';

import { apiFetch, ApiError } from '../api.js';
import { Button, Card } from '../components/bits.js';
import { ReminderForm } from '../components/reminder-form.js';
import { ShareCard } from '../components/share-card.js';
import { useMe, useTeam, useTeams } from '../queries.js';

export function TeamsPage(): ReactNode {
  const teams = useTeams();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const create = useMutation({
    mutationFn: (teamName: string) =>
      apiFetch('/teams', teamResponseSchema, {
        method: 'POST',
        body: JSON.stringify({ name: teamName }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['teams'] }),
  });

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold tracking-tight">Teams</h1>
      <div className="grid gap-3 md:grid-cols-2">
        {teams.data?.map((t) => (
          <Link key={t.id} to="/my/teams/$teamId" params={{ teamId: t.id }}>
            <Card className="rise transition-colors hover:border-ember">
              <p className="font-semibold">{t.name}</p>
              <p className="text-xs text-ink-soft">your role: {t.role}</p>
            </Card>
          </Link>
        ))}
      </div>
      <Card>
        <p className="mb-2 font-semibold">New team</p>
        <div className="flex gap-2">
          <input
            className="flex-1 border border-line bg-paper-raised px-3 py-2 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Platform"
          />
          <Button
            onClick={() => {
              void create.mutateAsync(name).then(() => setName(''));
            }}
            disabled={!name.trim() || create.isPending}
          >
            create
          </Button>
        </div>
      </Card>
    </div>
  );
}

function MemberRow({
  team,
  member,
  isAdmin,
  selfId,
}: {
  team: TeamDetailResponse;
  member: z.infer<typeof teamMemberSchema>;
  isAdmin: boolean;
  selfId: string;
}): ReactNode {
  const qc = useQueryClient();
  const invalidate = (): void => void qc.invalidateQueries({ queryKey: ['team', team.id] });

  const setRole = useMutation({
    mutationFn: (role: 'admin' | 'member') =>
      apiFetch(`/teams/${team.id}/members/${member.userId}`, teamMemberSchema, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: () =>
      apiFetch(`/teams/${team.id}/members/${member.userId}`, z.null(), { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  const err = setRole.error ?? remove.error;

  return (
    <li className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-0">
      <div>
        <p className="text-sm font-semibold">{member.displayName}</p>
        <p className="text-xs text-ink-soft">
          {member.email} · {member.role}
        </p>
        {err instanceof ApiError ? <p className="text-xs text-rag-red">{err.message}</p> : null}
      </div>
      {isAdmin || member.userId === selfId ? (
        <div className="flex gap-2">
          {isAdmin ? (
            <Button
              variant="ghost"
              onClick={() => void setRole.mutateAsync(member.role === 'admin' ? 'member' : 'admin')}
            >
              make {member.role === 'admin' ? 'member' : 'admin'}
            </Button>
          ) : null}
          <Button variant="danger" onClick={() => void remove.mutateAsync()}>
            {member.userId === selfId ? 'leave' : 'remove'}
          </Button>
        </div>
      ) : null}
    </li>
  );
}

export function TeamPage(): ReactNode {
  const { teamId } = useParams({ from: '/app/my/teams/$teamId' });
  const team = useTeam(teamId);
  const me = useMe();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');

  const add = useMutation({
    mutationFn: (memberEmail: string) =>
      apiFetch(`/teams/${teamId}/members`, teamMemberSchema, {
        method: 'POST',
        body: JSON.stringify({ email: memberEmail, role: 'member' }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['team', teamId] }),
  });

  if (team.isLoading) return <p className="text-sm text-ink-soft">loading…</p>;
  const t = team.data;
  if (!t || !me.data) return <p className="text-sm text-ink-soft">team not found.</p>;
  const isAdmin = t.role === 'admin';

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold tracking-tight">{t.name}</h1>

      <Card>
        <p className="mb-2 font-semibold">Members</p>
        <ul>
          {t.members.map((m) => (
            <MemberRow key={m.userId} team={t} member={m} isAdmin={isAdmin} selfId={me.data.id} />
          ))}
        </ul>
        {isAdmin ? (
          <div className="mt-3 flex gap-2">
            <input
              className="flex-1 border border-line bg-paper-raised px-3 py-2 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@example.com"
              type="email"
            />
            <Button
              onClick={() => {
                void add.mutateAsync(email).then(() => setEmail(''));
              }}
              disabled={!email.trim() || add.isPending}
            >
              add member
            </Button>
          </div>
        ) : null}
        {add.error instanceof ApiError ? (
          <p className="mt-2 text-xs text-rag-red">{add.error.message}</p>
        ) : null}
      </Card>

      {isAdmin ? <ReminderForm teamId={t.id} /> : null}
      {isAdmin ? <ShareCard teamId={t.id} /> : null}
    </div>
  );
}
