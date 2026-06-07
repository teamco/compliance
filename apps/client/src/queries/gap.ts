import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  GapAnalysis,
  GapAnalysisResult,
  GapItem,
  GapSeverity,
  Recommendation,
  RecommendationEffort,
} from '@icore/shared';

export type {
  GapAnalysis,
  GapAnalysisResult,
  GapItem,
  GapSeverity,
  Recommendation,
  RecommendationEffort,
};

export type FindingStatus = 'compliant' | 'partial' | 'non-compliant';

export interface ControlFinding {
  controlId: string;
  status: FindingStatus;
  evidence?: string;
}

export interface GapAnalysisInput {
  controls: Array<{
    id: string;
    title: string;
    description: string;
    implementationGuidance: string;
  }>;
  findings: ControlFinding[];
}

export function useAnalyzeGap() {
  return useMutation<GapAnalysisResult, Error, GapAnalysisInput>({
    mutationFn: (body) =>
      api<GapAnalysisResult>('/ai/gap/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
  });
}

export function useGapAnalyses(orgId: string) {
  return useQuery<GapAnalysis[]>({
    queryKey: ['notes', 'gap', orgId],
    queryFn: () => api<GapAnalysis[]>(`/notes/gap?orgId=${encodeURIComponent(orgId)}`),
    enabled: !!orgId,
  });
}

export function useSaveGapAnalysis() {
  const qc = useQueryClient();
  return useMutation<
    GapAnalysis,
    Error,
    { orgId: string; docId?: string; result: GapAnalysisResult }
  >({
    mutationFn: (body) =>
      api<GapAnalysis>('/notes/gap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['notes', 'gap', vars.orgId] }),
  });
}
