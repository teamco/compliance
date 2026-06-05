import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

export type AiUsageRange = '24h' | '7d' | '30d' | '90d';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/ai-usage')
export class AdminAiUsageController {
  @Get('summary')
  @ApiOperation({ summary: 'AI usage summary for a time range (admin only)' })
  @ApiQuery({ name: 'range', enum: ['24h', '7d', '30d', '90d'], required: false })
  summary(@Query('range') _range: AiUsageRange = '7d') {
    // TODO: query persisted usage records from DB once AI usage tracking is wired up
    return {
      total_calls: 0,
      total_tokens: 0,
      total_cost_usd: 0,
      by_provider: [],
      by_operation: [],
      by_key_source: [],
      users: [],
    };
  }

  @Get('timeseries')
  @ApiOperation({ summary: 'AI usage timeseries for activity chart (admin only)' })
  @ApiQuery({ name: 'range', enum: ['24h', '7d', '30d', '90d'], required: false })
  @ApiQuery({ name: 'userId', required: false })
  timeseries(@Query('range') _range: AiUsageRange = '7d', @Query('userId') _userId?: string) {
    return { timestamps: [], calls: [], tokens: [] };
  }
}
