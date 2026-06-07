import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type AiUsageRange = '24h' | '7d' | '30d' | '90d';

export interface AiUsageSummary {
  total_calls: number;
  total_tokens: number;
  total_cost_usd: number;
  by_provider: Array<{ label: string; calls: number; tokens: number }>;
  by_operation: Array<{ label: string; calls: number; tokens: number }>;
  by_key_source: Array<{ label: string; calls: number; tokens: number }>;
  users: Array<{
    id: string;
    email: string;
    full_name: string | null;
    calls: number;
    tokens: number;
  }>;
}

export interface AiUsageTimeseries {
  timestamps: string[];
  calls: number[];
  tokens: number[];
}

export function useAiUsageSummary(range: AiUsageRange) {
  return useQuery<AiUsageSummary>({
    queryKey: ['admin', 'ai-usage', 'summary', range],
    queryFn: () => api<AiUsageSummary>(`/admin/ai-usage/summary?range=${range}`),
  });
}

export function useAiUsageTimeseries(range: AiUsageRange, userId?: string) {
  return useQuery<AiUsageTimeseries>({
    queryKey: ['admin', 'ai-usage', 'timeseries', range, userId],
    queryFn: () =>
      api<AiUsageTimeseries>(
        `/admin/ai-usage/timeseries?range=${range}${userId ? `&userId=${userId}` : ''}`,
      ),
  });
}
