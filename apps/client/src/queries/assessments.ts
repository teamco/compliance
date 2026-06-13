import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  RiskAssessment,
  RiskAssessmentInput,
  RiskAssessmentPatch,
  RiskAssessmentItem,
  RiskAssessmentItemInput,
  RiskAssessmentItemPatch,
} from '@icore/shared';

export type {
  RiskAssessment,
  RiskAssessmentInput,
  RiskAssessmentPatch,
  RiskAssessmentItem,
  RiskAssessmentItemInput,
  RiskAssessmentItemPatch,
};

export function useAssessments(orgId: string) {
  return useQuery<RiskAssessment[]>({
    queryKey: ['assessments', orgId],
    queryFn: () => api<RiskAssessment[]>(`/assessments?orgId=${encodeURIComponent(orgId)}`),
    enabled: !!orgId,
  });
}

export function useAssessment(id: string) {
  return useQuery<RiskAssessment>({
    queryKey: ['assessments', id],
    queryFn: () => api<RiskAssessment>(`/assessments/${id}`),
    enabled: !!id,
  });
}

export function useAssessmentItems(assessmentId: string) {
  return useQuery<RiskAssessmentItem[]>({
    queryKey: ['assessments', assessmentId, 'items'],
    queryFn: () => api<RiskAssessmentItem[]>(`/assessments/${assessmentId}/items`),
    enabled: !!assessmentId,
  });
}

export function useCreateAssessment(orgId: string) {
  const qc = useQueryClient();
  return useMutation<RiskAssessment, Error, RiskAssessmentInput>({
    mutationFn: (data) =>
      api<RiskAssessment>(`/assessments?orgId=${encodeURIComponent(orgId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assessments', orgId] }),
  });
}

export function useUpdateAssessment(orgId: string, id: string) {
  const qc = useQueryClient();
  return useMutation<RiskAssessment, Error, RiskAssessmentPatch>({
    mutationFn: (patch) =>
      api<RiskAssessment>(`/assessments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assessments', orgId] });
      qc.invalidateQueries({ queryKey: ['assessments', id] });
    },
  });
}

export function useDeleteAssessment(orgId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api<void>(`/assessments/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assessments', orgId] }),
  });
}

export function useAddAssessmentItem(assessmentId: string) {
  const qc = useQueryClient();
  return useMutation<RiskAssessmentItem, Error, RiskAssessmentItemInput>({
    mutationFn: (data) =>
      api<RiskAssessmentItem>(`/assessments/${assessmentId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assessments', assessmentId, 'items'] });
      qc.invalidateQueries({ queryKey: ['assessments', assessmentId] });
    },
  });
}

export function useUpdateAssessmentItem(assessmentId: string) {
  const qc = useQueryClient();
  return useMutation<RiskAssessmentItem, Error, { id: string; patch: RiskAssessmentItemPatch }>({
    mutationFn: ({ id, patch }) =>
      api<RiskAssessmentItem>(`/assessments/items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assessments', assessmentId, 'items'] });
      qc.invalidateQueries({ queryKey: ['assessments', assessmentId] });
    },
  });
}

export function useDeleteAssessmentItem(assessmentId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api<void>(`/assessments/items/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assessments', assessmentId, 'items'] });
      qc.invalidateQueries({ queryKey: ['assessments', assessmentId] });
    },
  });
}
