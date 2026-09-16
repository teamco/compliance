import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  Assessment,
  AssessmentInput,
  AssessmentPatch,
  AssessmentItem,
  AssessmentItemInput,
  AssessmentItemPatch,
  AssessmentItemControlMapping,
  AssessmentItemControlMappingInput,
  RequirementEvidence,
  Risk,
} from '@icore/shared';

export type {
  Assessment,
  AssessmentInput,
  AssessmentPatch,
  AssessmentItem,
  AssessmentItemInput,
  AssessmentItemPatch,
  AssessmentItemControlMapping,
  AssessmentItemControlMappingInput,
};

export function useAssessments(orgId: string) {
  return useQuery<Assessment[]>({
    queryKey: ['assessments', orgId],
    queryFn: () => api<Assessment[]>(`/notes/assessments?orgId=${encodeURIComponent(orgId)}`),
    enabled: !!orgId,
  });
}

export function useAssessment(id: string) {
  return useQuery<Assessment>({
    queryKey: ['assessments', id],
    queryFn: () => api<Assessment>(`/notes/assessments/${id}`),
    enabled: !!id,
  });
}

export function useAssessmentItems(assessmentId: string) {
  return useQuery<AssessmentItem[]>({
    queryKey: ['assessments', assessmentId, 'items'],
    queryFn: () => api<AssessmentItem[]>(`/notes/assessments/${assessmentId}/items`),
    enabled: !!assessmentId,
  });
}

export function useCreateAssessment(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Assessment, Error, AssessmentInput>({
    mutationFn: (data) =>
      api<Assessment>(`/notes/assessments?orgId=${encodeURIComponent(orgId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assessments', orgId] }),
  });
}

export function useUpdateAssessment(orgId: string, id: string) {
  const qc = useQueryClient();
  return useMutation<Assessment, Error, AssessmentPatch>({
    mutationFn: (patch) =>
      api<Assessment>(`/notes/assessments/${id}`, {
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
    mutationFn: (id) => api<void>(`/notes/assessments/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assessments', orgId] }),
  });
}

function invalidateAssessment(qc: ReturnType<typeof useQueryClient>, orgId: string, id: string) {
  qc.invalidateQueries({ queryKey: ['assessments', orgId] });
  qc.invalidateQueries({ queryKey: ['assessments', id] });
}

export function useStartAssessment(orgId: string, id: string) {
  const qc = useQueryClient();
  return useMutation<Assessment, Error, void>({
    mutationFn: () => api<Assessment>(`/notes/assessments/${id}/start`, { method: 'POST' }),
    onSuccess: () => invalidateAssessment(qc, orgId, id),
  });
}

export function useSubmitForReview(orgId: string, id: string) {
  const qc = useQueryClient();
  return useMutation<Assessment, Error, void>({
    mutationFn: () =>
      api<Assessment>(`/notes/assessments/${id}/submit-for-review`, { method: 'POST' }),
    onSuccess: () => invalidateAssessment(qc, orgId, id),
  });
}

export function useApproveAssessment(orgId: string, id: string) {
  const qc = useQueryClient();
  return useMutation<Assessment, Error, void>({
    mutationFn: () => api<Assessment>(`/notes/assessments/${id}/approve`, { method: 'POST' }),
    onSuccess: () => invalidateAssessment(qc, orgId, id),
  });
}

export function useRequestChanges(orgId: string, id: string) {
  const qc = useQueryClient();
  return useMutation<Assessment, Error, { note: string }>({
    mutationFn: (body) =>
      api<Assessment>(`/notes/assessments/${id}/request-changes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => invalidateAssessment(qc, orgId, id),
  });
}

export function useCompleteAssessment(orgId: string, id: string) {
  const qc = useQueryClient();
  return useMutation<Assessment, Error, void>({
    mutationFn: () => api<Assessment>(`/notes/assessments/${id}/complete`, { method: 'POST' }),
    onSuccess: () => invalidateAssessment(qc, orgId, id),
  });
}

export function useArchiveAssessment(orgId: string, id: string) {
  const qc = useQueryClient();
  return useMutation<Assessment, Error, void>({
    mutationFn: () => api<Assessment>(`/notes/assessments/${id}/archive`, { method: 'POST' }),
    onSuccess: () => invalidateAssessment(qc, orgId, id),
  });
}

export function useCreateAssessmentItem(assessmentId: string) {
  const qc = useQueryClient();
  return useMutation<AssessmentItem, Error, AssessmentItemInput>({
    mutationFn: (data) =>
      api<AssessmentItem>(`/notes/assessments/${assessmentId}/items`, {
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
  return useMutation<AssessmentItem, Error, { id: string; patch: AssessmentItemPatch }>({
    mutationFn: ({ id, patch }) =>
      api<AssessmentItem>(`/notes/assessments/items/${id}`, {
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
    mutationFn: (id) => api<void>(`/notes/assessments/items/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assessments', assessmentId, 'items'] });
      qc.invalidateQueries({ queryKey: ['assessments', assessmentId] });
    },
  });
}

export function useAssessmentItemControlMappings(itemId: string) {
  return useQuery<AssessmentItemControlMapping[]>({
    queryKey: ['assessment-items', itemId, 'mappings'],
    queryFn: () =>
      api<AssessmentItemControlMapping[]>(`/notes/assessments/items/${itemId}/mappings`),
    enabled: !!itemId,
  });
}

export function useAddAssessmentItemControlMapping(itemId: string) {
  const qc = useQueryClient();
  return useMutation<AssessmentItemControlMapping, Error, AssessmentItemControlMappingInput>({
    mutationFn: (data) =>
      api<AssessmentItemControlMapping>(`/notes/assessments/items/${itemId}/mappings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assessment-items', itemId, 'mappings'] }),
  });
}

export function useRemoveAssessmentItemControlMapping(itemId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (mappingId) =>
      api<void>(`/notes/assessments/items/mappings/${mappingId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assessment-items', itemId, 'mappings'] }),
  });
}

export function useAssessmentItemEvidence(itemId: string) {
  return useQuery<RequirementEvidence[]>({
    queryKey: ['assessments', 'items', itemId, 'evidence'],
    queryFn: () => api<RequirementEvidence[]>(`/notes/assessments/items/${itemId}/evidence`),
    enabled: !!itemId,
  });
}

export function useCreateAssessmentItemEvidence(orgId: string, itemId: string) {
  const qc = useQueryClient();
  return useMutation<
    RequirementEvidence,
    Error,
    Omit<
      RequirementEvidence,
      'id' | 'assessmentItemId' | 'createdBy' | 'verificationStatus' | 'verifiedBy' | 'verifiedAt'
    >
  >({
    mutationFn: (data) =>
      api<RequirementEvidence>(
        `/notes/assessments/items/${itemId}/evidence?orgId=${encodeURIComponent(orgId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        },
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['assessments', 'items', itemId, 'evidence'] }),
  });
}

export function useCreateRiskFromAssessmentItem(itemId: string) {
  const qc = useQueryClient();
  return useMutation<Risk, Error, { taxonomyCategoryId: string }>({
    mutationFn: (data) =>
      api<Risk>(`/notes/assessments/items/${itemId}/create-risk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assessments'] });
      qc.invalidateQueries({ queryKey: ['risks'] });
    },
  });
}

export function useLinkAssessmentItemToRisk(itemId: string) {
  const qc = useQueryClient();
  return useMutation<AssessmentItem, Error, { riskId: string }>({
    mutationFn: (data) =>
      api<AssessmentItem>(`/notes/assessments/items/${itemId}/link-risk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assessments'] }),
  });
}

export function useUnlinkAssessmentItemFromRisk(itemId: string) {
  const qc = useQueryClient();
  return useMutation<AssessmentItem, Error, void>({
    mutationFn: () =>
      api<AssessmentItem>(`/notes/assessments/items/${itemId}/link-risk`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assessments'] }),
  });
}
