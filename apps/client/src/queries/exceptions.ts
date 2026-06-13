import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Exception, ExceptionInput, ExceptionPatch } from '@icore/shared';

export type { Exception, ExceptionInput, ExceptionPatch };

export function useExceptions(orgId: string) {
  return useQuery<Exception[]>({
    queryKey: ['exceptions', orgId],
    queryFn: () => api<Exception[]>(`/exceptions?orgId=${encodeURIComponent(orgId)}`),
    enabled: !!orgId,
  });
}

export function useCreateException(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Exception, Error, ExceptionInput>({
    mutationFn: (data) =>
      api<Exception>(`/exceptions?orgId=${encodeURIComponent(orgId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exceptions', orgId] }),
  });
}

export function useUpdateException(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Exception, Error, { id: string; patch: ExceptionPatch }>({
    mutationFn: ({ id, patch }) =>
      api<Exception>(`/exceptions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exceptions', orgId] }),
  });
}

export function useApproveException(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Exception, Error, string>({
    mutationFn: (id) => api<Exception>(`/exceptions/${id}/approve`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exceptions', orgId] }),
  });
}

export function useRejectException(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Exception, Error, string>({
    mutationFn: (id) => api<Exception>(`/exceptions/${id}/reject`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exceptions', orgId] }),
  });
}

export function useDeleteException(orgId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api<void>(`/exceptions/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exceptions', orgId] }),
  });
}
