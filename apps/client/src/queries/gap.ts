import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type FindingStatus = 'compliant' | 'partial' | 'non-compliant';
export type GapSeverity = 'critical' | 'high' | 'medium' | 'low';
export type RecommendationEffort = 'low' | 'medium' | 'high';

export interface ControlFinding {
  controlId: string;
  status: FindingStatus;
  evidence?: string;
}

export interface GapItem {
  controlId: string;
  severity: GapSeverity;
  description: string;
}

export interface Recommendation {
  priority: number;
  action: string;
  effort: RecommendationEffort;
}

export interface GapAnalysisResult {
  summary: string;
  criticalGaps: GapItem[];
  recommendations: Recommendation[];
  riskScore: number;
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
