import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  Exception,
  ExceptionInput,
  ExceptionPatch,
  ExceptionRenewal,
  ExceptionRenewalRequestInput,
} from '@icore/shared';

export type {
  Exception,
  ExceptionInput,
  ExceptionPatch,
  ExceptionRenewal,
  ExceptionRenewalRequestInput,
};

export function useExceptions(orgId: string) {
  return useQuery<Exception[]>({
    queryKey: ['exceptions', orgId],
    queryFn: () => api<Exception[]>(`/notes/exceptions?orgId=${encodeURIComponent(orgId)}`),
    enabled: !!orgId,
  });
}

export function useCreateException(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Exception, Error, ExceptionInput>({
    mutationFn: (data) =>
      api<Exception>(`/notes/exceptions?orgId=${encodeURIComponent(orgId)}`, {
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
      api<Exception>(`/notes/exceptions/${id}`, {
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
    mutationFn: (id) => api<Exception>(`/notes/exceptions/${id}/approve`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exceptions', orgId] }),
  });
}

export function useRejectException(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Exception, Error, string>({
    mutationFn: (id) => api<Exception>(`/notes/exceptions/${id}/reject`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exceptions', orgId] }),
  });
}

export function useDeleteException(orgId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api<void>(`/notes/exceptions/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exceptions', orgId] }),
  });
}

export function useExceptionRenewals(exceptionId: string) {
  return useQuery<ExceptionRenewal[]>({
    queryKey: ['exceptions', exceptionId, 'renewals'],
    queryFn: () => api<ExceptionRenewal[]>(`/notes/exceptions/${exceptionId}/renewals`),
    enabled: !!exceptionId,
  });
}

export function usePendingExceptionRenewals(orgId: string) {
  return useQuery<ExceptionRenewal[]>({
    queryKey: ['exception-renewals', orgId, 'pending'],
    queryFn: () =>
      api<ExceptionRenewal[]>(`/notes/exception-renewals?orgId=${encodeURIComponent(orgId)}`),
    enabled: !!orgId,
  });
}

export function useRequestExceptionRenewal(orgId: string) {
  const qc = useQueryClient();
  return useMutation<ExceptionRenewal, Error, { id: string; data: ExceptionRenewalRequestInput }>({
    mutationFn: ({ id, data }) =>
      api<ExceptionRenewal>(`/notes/exceptions/${id}/renewals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: (_result, { id }) => {
      qc.invalidateQueries({ queryKey: ['exceptions', orgId] });
      qc.invalidateQueries({ queryKey: ['exceptions', id, 'renewals'] });
    },
  });
}

export function useReviewExceptionRenewal(orgId: string) {
  const qc = useQueryClient();
  return useMutation<
    ExceptionRenewal,
    Error,
    { id: string; exceptionId: string; decision: 'approved' | 'rejected'; reviewNotes?: string }
  >({
    mutationFn: ({ id, decision, reviewNotes }) =>
      api<ExceptionRenewal>(`/notes/exception-renewals/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reviewNotes }),
      }),
    onSuccess: (_result, { exceptionId }) => {
      qc.invalidateQueries({ queryKey: ['exceptions', orgId] });
      qc.invalidateQueries({ queryKey: ['exceptions', exceptionId, 'renewals'] });
    },
  });
}
