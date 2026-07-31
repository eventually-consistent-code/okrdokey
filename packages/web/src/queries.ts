/**
 * Purpose: Every query/mutation the UI runs, in one place, typed by the
 *          shared schemas. Components never call fetch directly.
 * Author(s): John Reed
 */

import {
  checkInResponseSchema,
  createCheckInRequestSchema,
  createObjectiveRequestSchema,
  cycleResponseSchema,
  cycleSummaryResponseSchema,
  keyResultResponseSchema,
  krLinkResponseSchema,
  objectiveResponseSchema,
  reminderResponseSchema,
  teamDetailResponseSchema,
  teamResponseSchema,
  upsertKrLinkRequestSchema,
  userResponseSchema,
  type CreateCheckInRequest,
  type CreateKeyResultRequest,
  type CreateObjectiveRequest,
  type UpsertKrLinkRequest,
  type UpsertReminderRequest,
} from '@okrdokey/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { ApiError, apiFetch, UnauthorizedError } from './api.js';

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => apiFetch('/auth/me', userResponseSchema),
    retry: (count, err) => !(err instanceof UnauthorizedError) && count < 2,
    staleTime: 60_000,
  });
}

export function useCycles() {
  return useQuery({
    queryKey: ['cycles'],
    queryFn: () => apiFetch('/cycles', z.array(cycleResponseSchema)),
  });
}

export function useObjectives(cycleId?: string) {
  return useQuery({
    queryKey: ['objectives', cycleId ?? 'all'],
    queryFn: () =>
      apiFetch(
        cycleId ? `/objectives?cycleId=${cycleId}` : '/objectives',
        z.array(objectiveResponseSchema),
      ),
  });
}

export function useObjective(id: string) {
  return useQuery({
    queryKey: ['objective', id],
    queryFn: () => apiFetch(`/objectives/${id}`, objectiveResponseSchema),
  });
}

export function useSummary(cycleId: string | undefined) {
  return useQuery({
    queryKey: ['summary', cycleId],
    queryFn: () => apiFetch(`/cycles/${cycleId}/summary`, cycleSummaryResponseSchema),
    enabled: !!cycleId,
  });
}

export function useCheckIns(krId: string) {
  return useQuery({
    queryKey: ['check-ins', krId],
    queryFn: () => apiFetch(`/key-results/${krId}/check-ins`, z.array(checkInResponseSchema)),
  });
}

export function useTeams() {
  return useQuery({
    queryKey: ['teams'],
    queryFn: () => apiFetch('/teams', z.array(teamResponseSchema)),
  });
}

export function useTeam(id: string) {
  return useQuery({
    queryKey: ['team', id],
    queryFn: () => apiFetch(`/teams/${id}`, teamDetailResponseSchema),
  });
}

export function useReminders() {
  return useQuery({
    queryKey: ['reminders'],
    queryFn: () => apiFetch('/reminders', z.array(reminderResponseSchema)),
  });
}

// Mutations — each invalidates what it touches

export function useCheckInMutation(krId: string, objectiveId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCheckInRequest) =>
      apiFetch(`/key-results/${krId}/check-ins`, checkInResponseSchema, {
        method: 'POST',
        body: JSON.stringify(createCheckInRequestSchema.parse(body)),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['objective', objectiveId] });
      void qc.invalidateQueries({ queryKey: ['check-ins', krId] });
      void qc.invalidateQueries({ queryKey: ['summary'] });
      void qc.invalidateQueries({ queryKey: ['objectives'] });
    },
  });
}

export function useCreateObjective() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateObjectiveRequest) =>
      apiFetch('/objectives', objectiveResponseSchema, {
        method: 'POST',
        body: JSON.stringify(createObjectiveRequestSchema.parse(body)),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['objectives'] });
      void qc.invalidateQueries({ queryKey: ['summary'] });
    },
  });
}

export function useCreateKeyResult(objectiveId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateKeyResultRequest) =>
      apiFetch(`/objectives/${objectiveId}/key-results`, keyResultResponseSchema, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['objective', objectiveId] }),
  });
}

export function useArchiveObjective() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/objectives/${id}/archive`, objectiveResponseSchema, { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['objectives'] }),
  });
}

export function useUpsertReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpsertReminderRequest) =>
      apiFetch('/reminders', reminderResponseSchema, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['reminders'] }),
  });
}

// KR ↔ tracker links — 404 on GET just means "not linked yet", not an error

export function useKrLink(krId: string) {
  return useQuery({
    queryKey: ['kr-link', krId],
    queryFn: async () => {
      try {
        return await apiFetch(`/key-results/${krId}/link`, krLinkResponseSchema);
      } catch (err) {
        if (err instanceof ApiError && err.statusCode === 404) return null;
        throw err;
      }
    },
  });
}

export function useUpsertKrLink(krId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpsertKrLinkRequest) =>
      apiFetch(`/key-results/${krId}/link`, krLinkResponseSchema, {
        method: 'PUT',
        body: JSON.stringify(upsertKrLinkRequestSchema.parse(body)),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['kr-link', krId] }),
  });
}

export function useDeleteKrLink(krId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch(`/key-results/${krId}/link`, z.null(), { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['kr-link', krId] }),
  });
}
