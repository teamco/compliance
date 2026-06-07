import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  type AiUsageRange,
  useAiUsageSummary,
  useAiUsageTimeseries,
} from '@/queries/admin-ai-usage';
import { ActivityChart } from './activity-chart';
import { BreakdownTable } from './breakdown-table';
import { ByUserTable } from './by-user-table';
import { RangeSelector } from './range-selector';
import { StatCard } from './stat-card';
import { UserFilterSelect } from './user-filter-select';

export function AdminAiUsageContent() {
  const [range, setRange] = useState<AiUsageRange>('7d');
  const [userId, setUserId] = useState<string>('all');

  const { data: summary, isLoading: summaryLoading } = useAiUsageSummary(range);
  const { data: timeseries, isLoading: timeseriesLoading } = useAiUsageTimeseries(
    range,
    userId === 'all' ? undefined : userId,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">AI Usage</h1>
          <p className="text-sm text-muted-foreground">
            Monitor Anthropic API consumption across the platform
          </p>
        </div>
        <RangeSelector value={range} onChange={setRange} />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          title="Total Calls"
          value={summaryLoading ? '—' : (summary?.total_calls ?? 0).toLocaleString()}
          loading={summaryLoading}
        />
        <StatCard
          title="Total Tokens"
          value={summaryLoading ? '—' : (summary?.total_tokens ?? 0).toLocaleString()}
          loading={summaryLoading}
        />
        <StatCard
          title="Estimated Cost"
          value={summaryLoading ? '—' : `$${(summary?.total_cost_usd ?? 0).toFixed(2)}`}
          loading={summaryLoading}
        />
        <StatCard
          title="Active Users"
          value={summaryLoading ? '—' : (summary?.users?.length ?? 0).toLocaleString()}
          loading={summaryLoading}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Activity</CardTitle>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {[
                { op: 'chat',               model: 'claude-sonnet-4-6' },
                { op: 'standards.generate', model: 'claude-opus-4-8'   },
                { op: 'gap.analyze',        model: 'claude-sonnet-4-6' },
              ].map(({ op, model }) => (
                <span key={op} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground font-mono">
                  <span className="text-foreground/70">{op}</span>
                  <span className="text-muted-foreground/50">·</span>
                  <span>{model}</span>
                </span>
              ))}
            </div>
          </div>
          <UserFilterSelect users={summary?.users ?? []} value={userId} onChange={setUserId} />
        </CardHeader>
        <CardContent className="h-64">
          <ActivityChart data={timeseries} loading={timeseriesLoading} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <BreakdownTable
              title="By Provider"
              rows={summary?.by_provider}
              loading={summaryLoading}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <BreakdownTable
              title="By Operation"
              rows={summary?.by_operation}
              loading={summaryLoading}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <BreakdownTable
              title="By Key Source"
              rows={summary?.by_key_source}
              loading={summaryLoading}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <ByUserTable users={summary?.users} loading={summaryLoading} />
        </CardContent>
      </Card>
    </div>
  );
}
