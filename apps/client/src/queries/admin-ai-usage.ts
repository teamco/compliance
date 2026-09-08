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

// Wire shape returned by @idevconn/ai-usage's AdminAiUsageController (backed
// by our SupabaseAiUsageDataSource) — kept separate from the shape above so
// the dashboard components below never need to change when the backend's
// canonical field names do.
interface RawBreakdownRow {
  key: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
}

interface RawSummary {
  total_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  by_provider: RawBreakdownRow[];
  by_operation: RawBreakdownRow[];
  by_key_source: RawBreakdownRow[];
  by_user: Array<{
    user_id: string;
    email: string | null;
    full_name?: string | null;
    calls: number;
    input_tokens: number;
    output_tokens: number;
  }>;
  total_cost_usd?: number;
}

interface RawTimeseries {
  points: Array<{ date: string; calls: number; input_tokens: number; output_tokens: number }>;
}

function mapBreakdown(rows: RawBreakdownRow[]): AiUsageSummary['by_provider'] {
  return rows.map((r) => ({
    label: r.key,
    calls: r.calls,
    tokens: r.input_tokens + r.output_tokens,
  }));
}

function mapSummary(raw: RawSummary): AiUsageSummary {
  return {
    total_calls: raw.total_calls,
    total_tokens: raw.total_input_tokens + raw.total_output_tokens,
    total_cost_usd: raw.total_cost_usd ?? 0,
    by_provider: mapBreakdown(raw.by_provider),
    by_operation: mapBreakdown(raw.by_operation),
    by_key_source: mapBreakdown(raw.by_key_source),
    users: raw.by_user.map((u) => ({
      id: u.user_id,
      email: u.email ?? '',
      full_name: u.full_name ?? null,
      calls: u.calls,
      tokens: u.input_tokens + u.output_tokens,
    })),
  };
}

function mapTimeseries(raw: RawTimeseries): AiUsageTimeseries {
  return {
    timestamps: raw.points.map((p) => p.date),
    calls: raw.points.map((p) => p.calls),
    tokens: raw.points.map((p) => p.input_tokens + p.output_tokens),
  };
}

export function useAiUsageSummary(range: AiUsageRange) {
  return useQuery<AiUsageSummary>({
    queryKey: ['admin', 'ai-usage', 'summary', range],
    queryFn: async () =>
      mapSummary(await api<RawSummary>(`/admin/ai-usage/summary?range=${range}`)),
  });
}

export function useAiUsageTimeseries(range: AiUsageRange, userId?: string) {
  return useQuery<AiUsageTimeseries>({
    queryKey: ['admin', 'ai-usage', 'timeseries', range, userId],
    queryFn: async () =>
      mapTimeseries(
        await api<RawTimeseries>(
          `/admin/ai-usage/timeseries?range=${range}${userId ? `&userId=${userId}` : ''}`,
        ),
      ),
  });
}
