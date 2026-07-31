/**
 * Purpose: Every query/mutation the UI runs, in one place, typed by the
 *          shared schemas. Components never call fetch directly.
 * Author(s): John Reed
 */

import {
  aiKeyResponseSchema,
  healthResponseSchema,
  objectiveHistoryResponseSchema,
  aiStatusResponseSchema,
  checkInResponseSchema,
  createCheckInRequestSchema,
  createObjectiveRequestSchema,
  cycleResponseSchema,
  cycleSummaryResponseSchema,
  keyResultResponseSchema,
  kpiReadingResponseSchema,
  kpiResponseSchema,
  krLinkResponseSchema,
  objectiveResponseSchema,
  reminderResponseSchema,
  teamDetailResponseSchema,
  teamResponseSchema,
  draftKrsResponseSchema,
  improveKrResponseSchema,
  upsertKrLinkRequestSchema,
  userResponseSchema,
  type CreateCheckInRequest,
  type CreateKpiReadingRequest,
  type CreateKpiRequest,
  type CreateKeyResultRequest,
  type CreateObjectiveRequest,
  type DraftKrsRequest,
  type ImproveKrRequest,
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
      void qc.invalidateQueries({ queryKey: ['objective-history', objectiveId] });
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

// KPIs — cycle-less team stability metrics

export function useKpis(teamId: string) {
  return useQuery({
    queryKey: ['kpis', teamId],
    queryFn: () => apiFetch(`/teams/${teamId}/kpis`, z.array(kpiResponseSchema)),
  });
}

export function useKpiReadings(kpiId: string) {
  return useQuery({
    queryKey: ['kpi-readings', kpiId],
    queryFn: () => apiFetch(`/kpis/${kpiId}/readings`, z.array(kpiReadingResponseSchema)),
  });
}

export function useCreateKpi(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateKpiRequest) =>
      apiFetch(`/teams/${teamId}/kpis`, kpiResponseSchema, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['kpis', teamId] }),
  });
}

export function useRecordKpiReading(kpiId: string, teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateKpiReadingRequest) =>
      apiFetch(`/kpis/${kpiId}/readings`, kpiReadingResponseSchema, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['kpis', teamId] });
      void qc.invalidateQueries({ queryKey: ['kpi-readings', kpiId] });
    },
  });
}

export function useArchiveKpi(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (kpiId: string) =>
      apiFetch(`/kpis/${kpiId}/archive`, kpiResponseSchema, { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['kpis', teamId] }),
  });
}

// SMTP configured on this instance? (health carries the flag)
export function useEmailFeature() {
  return useQuery({
    queryKey: ['email-feature'],
    queryFn: async () => {
      const h = await apiFetch('/health', healthResponseSchema);
      return h.email;
    },
    staleTime: 300_000,
  });
}

export function useObjectiveHistory(objectiveId: string) {
  return useQuery({
    queryKey: ['objective-history', objectiveId],
    queryFn: () => apiFetch(`/objectives/${objectiveId}/history`, objectiveHistoryResponseSchema),
  });
}

// AI drafting — 404 on /ai/status means the feature is off entirely (routes
// not registered); enabled:false means on but no key resolves yet (teaser)

export function useAiStatus(objectiveId?: string) {
  return useQuery({
    queryKey: ['ai-status', objectiveId ?? 'none'],
    queryFn: async () => {
      try {
        return await apiFetch(
          objectiveId ? `/ai/status?objectiveId=${objectiveId}` : '/ai/status',
          aiStatusResponseSchema,
        );
      } catch (err) {
        if (err instanceof ApiError && err.statusCode === 404) return null;
        throw err;
      }
    },
    staleTime: 60_000,
  });
}

export function useDraftKrs() {
  return useMutation({
    mutationFn: (body: DraftKrsRequest) =>
      apiFetch('/ai/draft-krs', draftKrsResponseSchema, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });
}

export function useImproveKr() {
  return useMutation({
    mutationFn: (body: ImproveKrRequest) =>
      apiFetch('/ai/improve-kr', improveKrResponseSchema, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });
}

// Team AI key — 404 on GET just means "no key set yet"

export function useTeamAiKey(teamId: string) {
  return useQuery({
    queryKey: ['team-ai-key', teamId],
    queryFn: async () => {
      try {
        return await apiFetch(`/teams/${teamId}/ai-key`, aiKeyResponseSchema);
      } catch (err) {
        if (err instanceof ApiError && err.statusCode === 404) return null;
        throw err;
      }
    },
  });
}

export function useSetTeamAiKey(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) =>
      apiFetch(`/teams/${teamId}/ai-key`, aiKeyResponseSchema, {
        method: 'PUT',
        body: JSON.stringify({ key }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['team-ai-key', teamId] });
      void qc.invalidateQueries({ queryKey: ['ai-status'] });
    },
  });
}

export function useDeleteTeamAiKey(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch(`/teams/${teamId}/ai-key`, z.null(), { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['team-ai-key', teamId] });
      void qc.invalidateQueries({ queryKey: ['ai-status'] });
    },
  });
}
