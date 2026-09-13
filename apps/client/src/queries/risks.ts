import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  Risk,
  RiskInput,
  RiskPatch,
  RiskMethodology,
  RiskMethodologyInput,
  RiskTaxonomyCategory,
  RiskTaxonomyCategoryInput,
  RiskControlMapping,
  RiskControlMappingInput,
  RiskAcceptance,
  RiskAcceptanceInput,
  RiskSnapshot,
  RequirementEvidence,
} from '@icore/shared';

export function useRisks(orgId?: string) {
  return useQuery<Risk[]>({
    queryKey: ['risks', orgId],
    queryFn: () => api<Risk[]>(`/notes/risks?orgId=${encodeURIComponent(orgId ?? '')}`),
    enabled: !!orgId,
  });
}

export function useRisk(id: string) {
  return useQuery<Risk>({
    queryKey: ['risks', id],
    queryFn: () => api<Risk>(`/notes/risks/${id}`),
    enabled: !!id,
  });
}

export function useCreateRisk(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Risk, Error, RiskInput>({
    mutationFn: (data) =>
      api<Risk>(`/notes/risks?orgId=${encodeURIComponent(orgId)}`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risks'] }),
  });
}

export function useUpdateRisk(id: string) {
  const qc = useQueryClient();
  return useMutation<Risk, Error, RiskPatch & { reason?: string }>({
    mutationFn: (patch) =>
      api<Risk>(`/notes/risks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['risks'] });
      qc.invalidateQueries({ queryKey: ['risks', id] });
      qc.invalidateQueries({ queryKey: ['risks', id, 'snapshots'] });
    },
  });
}

export function useDeleteRisk() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api<void>(`/notes/risks/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risks'] }),
  });
}

export function useRiskMethodology(orgId?: string) {
  return useQuery<RiskMethodology>({
    queryKey: ['risk-methodology', orgId],
    queryFn: () =>
      api<RiskMethodology>(`/notes/risks/methodology?orgId=${encodeURIComponent(orgId ?? '')}`),
    enabled: !!orgId,
  });
}

export function useUpsertRiskMethodology(orgId: string) {
  const qc = useQueryClient();
  return useMutation<RiskMethodology, Error, RiskMethodologyInput>({
    mutationFn: (data) =>
      api<RiskMethodology>(`/notes/risks/methodology?orgId=${encodeURIComponent(orgId)}`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risk-methodology', orgId] }),
  });
}

export function useRiskTaxonomy(orgId?: string) {
  return useQuery<RiskTaxonomyCategory[]>({
    queryKey: ['risk-taxonomy', orgId],
    queryFn: () =>
      api<RiskTaxonomyCategory[]>(`/notes/risks/taxonomy?orgId=${encodeURIComponent(orgId ?? '')}`),
    enabled: !!orgId,
  });
}

export function useCreateRiskTaxonomyCategory(orgId: string) {
  const qc = useQueryClient();
  return useMutation<RiskTaxonomyCategory, Error, RiskTaxonomyCategoryInput>({
    mutationFn: (data) =>
      api<RiskTaxonomyCategory>(`/notes/risks/taxonomy?orgId=${encodeURIComponent(orgId)}`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risk-taxonomy', orgId] }),
  });
}

export function useArchiveRiskTaxonomyCategory(orgId: string) {
  const qc = useQueryClient();
  return useMutation<RiskTaxonomyCategory, Error, string>({
    mutationFn: (id) =>
      api<RiskTaxonomyCategory>(`/notes/risks/taxonomy/${id}/archive`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risk-taxonomy', orgId] }),
  });
}

export function useRiskControlMappings(riskId: string) {
  return useQuery<RiskControlMapping[]>({
    queryKey: ['risks', riskId, 'mappings'],
    queryFn: () => api<RiskControlMapping[]>(`/notes/risks/${riskId}/mappings`),
    enabled: !!riskId,
  });
}

export function useAddRiskControlMapping(riskId: string) {
  const qc = useQueryClient();
  return useMutation<RiskControlMapping, Error, RiskControlMappingInput>({
    mutationFn: (data) =>
      api<RiskControlMapping>(`/notes/risks/${riskId}/mappings`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risks', riskId, 'mappings'] }),
  });
}

export function useRemoveRiskControlMapping(riskId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (mappingId) =>
      api<void>(`/notes/risks/${riskId}/mappings/${mappingId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risks', riskId, 'mappings'] }),
  });
}

export function useActiveRiskAcceptance(riskId: string) {
  return useQuery<RiskAcceptance | null>({
    queryKey: ['risks', riskId, 'acceptance'],
    queryFn: () => api<RiskAcceptance | null>(`/notes/risks/${riskId}/acceptance/active`),
    enabled: !!riskId,
  });
}

export function useCreateRiskAcceptance(orgId: string, riskId: string) {
  const qc = useQueryClient();
  return useMutation<RiskAcceptance, Error, RiskAcceptanceInput>({
    mutationFn: (data) =>
      api<RiskAcceptance>(`/notes/risks/${riskId}/acceptance?orgId=${encodeURIComponent(orgId)}`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risks', riskId, 'acceptance'] }),
  });
}

export function useReviewRiskAcceptance(riskId: string) {
  const qc = useQueryClient();
  return useMutation<RiskAcceptance, Error, { id: string; reviewNotes?: string }>({
    mutationFn: ({ id, reviewNotes }) =>
      api<RiskAcceptance>(`/notes/risk-acceptances/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ reviewNotes }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risks', riskId, 'acceptance'] }),
  });
}

export function useApproveRiskAcceptance(riskId: string) {
  const qc = useQueryClient();
  return useMutation<RiskAcceptance, Error, string>({
    mutationFn: (id) =>
      api<RiskAcceptance>(`/notes/risk-acceptances/${id}/approve`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risks', riskId, 'acceptance'] }),
  });
}

export function useRejectRiskAcceptance(riskId: string) {
  const qc = useQueryClient();
  return useMutation<RiskAcceptance, Error, string>({
    mutationFn: (id) =>
      api<RiskAcceptance>(`/notes/risk-acceptances/${id}/reject`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risks', riskId, 'acceptance'] }),
  });
}

export function useRiskSnapshots(riskId: string) {
  return useQuery<RiskSnapshot[]>({
    queryKey: ['risks', riskId, 'snapshots'],
    queryFn: () => api<RiskSnapshot[]>(`/notes/risks/${riskId}/snapshots`),
    enabled: !!riskId,
  });
}

export function useRiskEvidence(riskId: string) {
  return useQuery<RequirementEvidence[]>({
    queryKey: ['risks', riskId, 'evidence'],
    queryFn: () => api<RequirementEvidence[]>(`/notes/risks/${riskId}/evidence`),
    enabled: !!riskId,
  });
}

export function useCreateRiskEvidence(orgId: string, riskId: string) {
  const qc = useQueryClient();
  return useMutation<RequirementEvidence, Error, Omit<RequirementEvidence, 'id' | 'riskId'>>({
    mutationFn: (data) =>
      api<RequirementEvidence>(
        `/notes/risks/${riskId}/evidence?orgId=${encodeURIComponent(orgId)}`,
        { method: 'POST', body: JSON.stringify(data) },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risks', riskId, 'evidence'] }),
  });
}
