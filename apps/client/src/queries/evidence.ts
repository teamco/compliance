import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { EvidencePatch, RequirementEvidence } from '@icore/shared';

export type { EvidencePatch, RequirementEvidence };

export function useUpdateEvidence() {
  const qc = useQueryClient();
  return useMutation<RequirementEvidence, Error, { id: string; patch: EvidencePatch }>({
    mutationFn: ({ id, patch }) =>
      api<RequirementEvidence>(`/notes/evidence/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }),
    onSuccess: () => qc.invalidateQueries({ predicate: (q) => q.queryKey.includes('evidence') }),
  });
}

export function useDeleteEvidence() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api<void>(`/notes/evidence/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ predicate: (q) => q.queryKey.includes('evidence') }),
  });
}

export function useReviewEvidence() {
  const qc = useQueryClient();
  return useMutation<
    RequirementEvidence,
    Error,
    { id: string; decision: 'verified' | 'rejected'; reviewNotes?: string }
  >({
    mutationFn: ({ id, decision, reviewNotes }) =>
      api<RequirementEvidence>(`/notes/evidence/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reviewNotes }),
      }),
    onSuccess: () => qc.invalidateQueries({ predicate: (q) => q.queryKey.includes('evidence') }),
  });
}
