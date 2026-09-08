import { Injectable } from '@nestjs/common';
import type { AiUsageDataSource } from '@idevconn/ai-usage/server';
import type {
  AiUsageBreakdownRow,
  AiUsageRange,
  AiUsageSummary,
  AiUsageTimeseries,
} from '@idevconn/ai-usage';
import { NotesClientService } from '@icore/notes-client';
import type { AiUsageSummaryRpc } from '@icore/shared';

const RANGE_MS: Record<AiUsageRange, number> = {
  '24h': 864e5,
  '7d': 6048e5,
  '30d': 2592e6,
  '90d': 7776e6,
};

function rangeToSince(range: AiUsageRange): string {
  return new Date(Date.now() - RANGE_MS[range]).toISOString();
}

function breakdown<K extends string>(
  rows: Array<{ calls: number; input_tokens: number; output_tokens: number } & Record<K, string>>,
  key: K,
): AiUsageBreakdownRow[] {
  return rows.map((r) => ({
    key: r[key],
    calls: r.calls,
    input_tokens: r.input_tokens,
    output_tokens: r.output_tokens,
  }));
}

@Injectable()
export class SupabaseAiUsageDataSource implements AiUsageDataSource {
  constructor(private readonly notes: NotesClientService) {}

  async getSummary(range: AiUsageRange, userId?: string): Promise<AiUsageSummary> {
    const rpc: AiUsageSummaryRpc = await this.notes.getAiUsageSummary(rangeToSince(range), userId);
    return {
      total_calls: rpc.total_calls,
      total_input_tokens: rpc.total_input_tokens,
      total_output_tokens: rpc.total_output_tokens,
      success_count: rpc.success_count,
      error_count: rpc.error_count,
      by_provider: breakdown(rpc.by_provider, 'provider'),
      by_operation: breakdown(rpc.by_operation, 'operation'),
      by_key_source: breakdown(rpc.by_key_source, 'key_source'),
      by_user: rpc.by_user.map((u) => ({
        user_id: u.user_id,
        email: u.email,
        full_name: u.full_name,
        calls: u.calls,
        input_tokens: u.input_tokens,
        output_tokens: u.output_tokens,
      })),
    };
  }

  async getTimeseries(range: AiUsageRange, userId?: string): Promise<AiUsageTimeseries> {
    const points = await this.notes.getAiUsageTimeseries(rangeToSince(range), userId);
    return {
      points: points.map((p) => ({
        date: p.date,
        calls: p.calls,
        input_tokens: p.input_tokens,
        output_tokens: p.output_tokens,
      })),
    };
  }
}
