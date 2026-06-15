import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Issue, IssueInput, IssuePatch } from '@icore/shared';

export type { Issue, IssueInput, IssuePatch };

export function useIssues(orgId: string) {
  return useQuery<Issue[]>({
    queryKey: ['issues', orgId],
    queryFn: () => api<Issue[]>(`/notes/issues?orgId=${encodeURIComponent(orgId)}`),
    enabled: !!orgId,
  });
}

export function useCreateIssue(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Issue, Error, IssueInput>({
    mutationFn: (data) =>
      api<Issue>(`/notes/issues?orgId=${encodeURIComponent(orgId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['issues', orgId] }),
  });
}

export function useUpdateIssue(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Issue, Error, { id: string; patch: IssuePatch }>({
    mutationFn: ({ id, patch }) =>
      api<Issue>(`/notes/issues/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['issues', orgId] }),
  });
}

export function useDeleteIssue(orgId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api<void>(`/notes/issues/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['issues', orgId] }),
  });
}
