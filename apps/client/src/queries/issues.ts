import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  Issue,
  IssueInput,
  IssuePatch,
  IssueValidation,
  IssueValidationSubmitInput,
} from '@icore/shared';

export type { Issue, IssueInput, IssuePatch, IssueValidation, IssueValidationSubmitInput };

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

export function useIssueValidations(issueId: string) {
  return useQuery<IssueValidation[]>({
    queryKey: ['issues', issueId, 'validations'],
    queryFn: () => api<IssueValidation[]>(`/notes/issues/${issueId}/validations`),
    enabled: !!issueId,
  });
}

export function usePendingIssueValidations(orgId: string) {
  return useQuery<IssueValidation[]>({
    queryKey: ['issue-validations', orgId, 'pending'],
    queryFn: () =>
      api<IssueValidation[]>(`/notes/issue-validations?orgId=${encodeURIComponent(orgId)}`),
    enabled: !!orgId,
  });
}

export function useSubmitIssueForValidation(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Issue, Error, { id: string; data: IssueValidationSubmitInput }>({
    mutationFn: ({ id, data }) =>
      api<Issue>(`/notes/issues/${id}/submit-for-validation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: (_result, { id }) => {
      qc.invalidateQueries({ queryKey: ['issues', orgId] });
      qc.invalidateQueries({ queryKey: ['issues', id, 'validations'] });
    },
  });
}

export function useReviewIssueValidation(orgId: string) {
  const qc = useQueryClient();
  return useMutation<
    IssueValidation,
    Error,
    { id: string; issueId: string; decision: 'approved' | 'rejected'; reviewNotes?: string }
  >({
    mutationFn: ({ id, decision, reviewNotes }) =>
      api<IssueValidation>(`/notes/issue-validations/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reviewNotes }),
      }),
    onSuccess: (_result, { issueId }) => {
      qc.invalidateQueries({ queryKey: ['issues', orgId] });
      qc.invalidateQueries({ queryKey: ['issues', issueId, 'validations'] });
    },
  });
}

export function useReassignIssueOwner(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Issue, Error, { id: string; newOwnerId: string }>({
    mutationFn: ({ id, newOwnerId }) =>
      api<Issue>(`/notes/issues/${id}/reassign-owner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newOwnerId }),
      }),
    onSuccess: (_result, { id }) => {
      qc.invalidateQueries({ queryKey: ['issues', orgId] });
      qc.invalidateQueries({ queryKey: ['issues', id, 'validations'] });
    },
  });
}

export function useReassignIssueValidator(orgId: string) {
  const qc = useQueryClient();
  return useMutation<
    IssueValidation,
    Error,
    { id: string; issueId: string; newValidatorId: string }
  >({
    mutationFn: ({ id, newValidatorId }) =>
      api<IssueValidation>(`/notes/issue-validations/${id}/reassign-validator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newValidatorId }),
      }),
    onSuccess: (_result, { issueId }) => {
      qc.invalidateQueries({ queryKey: ['issues', orgId] });
      qc.invalidateQueries({ queryKey: ['issues', issueId, 'validations'] });
    },
  });
}
