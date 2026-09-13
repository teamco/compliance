import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AssessmentType, AssessmentTypeInput } from '@icore/shared';

export function useAssessmentTypes(orgId?: string) {
  return useQuery<AssessmentType[]>({
    queryKey: ['assessment-types', orgId],
    queryFn: () =>
      api<AssessmentType[]>(`/notes/assessment-types?orgId=${encodeURIComponent(orgId ?? '')}`),
    enabled: !!orgId,
  });
}

export function useCreateAssessmentType(orgId: string) {
  const qc = useQueryClient();
  return useMutation<AssessmentType, Error, AssessmentTypeInput>({
    mutationFn: (data) =>
      api<AssessmentType>(`/notes/assessment-types?orgId=${encodeURIComponent(orgId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assessment-types', orgId] }),
  });
}

export function useArchiveAssessmentType(orgId: string) {
  const qc = useQueryClient();
  return useMutation<AssessmentType, Error, string>({
    mutationFn: (id) =>
      api<AssessmentType>(`/notes/assessment-types/${id}/archive`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assessment-types', orgId] }),
  });
}
