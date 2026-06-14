import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Risk, RiskInput, RiskPatch } from '@icore/shared';

export type { Risk, RiskInput, RiskPatch };

export function useRisks(orgId: string) {
  return useQuery<Risk[]>({
    queryKey: ['risks', orgId],
    queryFn: () => api<Risk[]>(`/notes/risks?orgId=${encodeURIComponent(orgId)}`),
    enabled: !!orgId,
  });
}

export function useCreateRisk(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Risk, Error, RiskInput>({
    mutationFn: (data) =>
      api<Risk>(`/notes/risks?orgId=${encodeURIComponent(orgId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risks', orgId] }),
  });
}

export function useUpdateRisk(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Risk, Error, { id: string; patch: RiskPatch }>({
    mutationFn: ({ id, patch }) =>
      api<Risk>(`/notes/risks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risks', orgId] }),
  });
}

export function useDeleteRisk(orgId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api<void>(`/notes/risks/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risks', orgId] }),
  });
}
