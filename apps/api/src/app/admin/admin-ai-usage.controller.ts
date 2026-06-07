import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { NotesClientService } from '@icore/notes-client';
import type { AiUsageSummaryRpc, AiUsageTimeseriesPoint } from '@icore/shared';

export type AiUsageRange = '24h' | '7d' | '30d' | '90d';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function rangeToSince(range: AiUsageRange): string {
  const now = Date.now();
  const ms = { '24h': 864e5, '7d': 6048e5, '30d': 2592e6, '90d': 7776e6 }[range];
  return new Date(now - ms).toISOString();
}

function parseRange(raw: string): AiUsageRange {
  if (raw === '24h' || raw === '7d' || raw === '30d' || raw === '90d') return raw;
  throw new BadRequestException(`Invalid range: ${raw}`);
}

function mapSummary(rpc: AiUsageSummaryRpc) {
  return {
    total_calls: rpc.total_calls,
    total_tokens: rpc.total_input_tokens + rpc.total_output_tokens,
    total_cost_usd: 0,
    by_provider: rpc.by_provider.map((r) => ({
      label: r.provider,
      calls: r.calls,
      tokens: r.input_tokens + r.output_tokens,
    })),
    by_operation: rpc.by_operation.map((r) => ({
      label: r.operation,
      calls: r.calls,
      tokens: r.input_tokens + r.output_tokens,
    })),
    by_key_source: rpc.by_key_source.map((r) => ({
      label: r.key_source,
      calls: r.calls,
      tokens: r.input_tokens + r.output_tokens,
    })),
    users: rpc.by_user.map((u) => ({
      id: u.user_id,
      email: u.email,
      full_name: u.full_name,
      calls: u.calls,
      tokens: u.input_tokens + u.output_tokens,
    })),
  };
}

function mapTimeseries(points: AiUsageTimeseriesPoint[]) {
  return {
    timestamps: points.map((p) => p.date),
    calls: points.map((p) => p.calls),
    tokens: points.map((p) => p.input_tokens + p.output_tokens),
  };
}

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/ai-usage')
export class AdminAiUsageController {
  constructor(private readonly notes: NotesClientService) {}

  @Get('summary')
  @ApiOperation({ summary: 'AI usage summary for a time range (admin only)' })
  @ApiQuery({ name: 'range', enum: ['24h', '7d', '30d', '90d'], required: false })
  @ApiQuery({ name: 'userId', required: false })
  async summary(@Query('range') range = '7d', @Query('userId') userId?: string) {
    const resolvedUserId = userId || undefined;
    if (resolvedUserId && !UUID_RE.test(resolvedUserId))
      throw new BadRequestException('Invalid userId');
    const since = rangeToSince(parseRange(range));
    const rpc = await this.notes.getAiUsageSummary(since, resolvedUserId);
    return mapSummary(rpc);
  }

  @Get('timeseries')
  @ApiOperation({ summary: 'AI usage timeseries (admin only)' })
  @ApiQuery({ name: 'range', enum: ['24h', '7d', '30d', '90d'], required: false })
  @ApiQuery({ name: 'userId', required: false })
  async timeseries(@Query('range') range = '30d', @Query('userId') userId?: string) {
    const resolvedUserId = userId || undefined;
    if (resolvedUserId && !UUID_RE.test(resolvedUserId))
      throw new BadRequestException('Invalid userId');
    const since = rangeToSince(parseRange(range));
    const points = await this.notes.getAiUsageTimeseries(since, resolvedUserId);
    return mapTimeseries(points);
  }
}
