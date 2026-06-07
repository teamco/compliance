import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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

const OPERATION_LABEL_KEYS: Record<string, string> = {
  chat: 'settings.aiUsage.operationLabels.chat',
  'standards.generate': 'settings.aiUsage.operationLabels.standardsGenerate',
  'gap.analyze': 'settings.aiUsage.operationLabels.gapAnalyze',
};

export function AdminAiUsageContent() {
  const { t } = useTranslation();
  const [range, setRange] = useState<AiUsageRange>('7d');
  const [userId, setUserId] = useState<string>('all');

  const { data: summary, isLoading: summaryLoading } = useAiUsageSummary(range);
  const { data: timeseries, isLoading: timeseriesLoading } = useAiUsageTimeseries(
    range,
    userId === 'all' ? undefined : userId,
  );
  const operationLabel = (operation: string) => t(OPERATION_LABEL_KEYS[operation] ?? operation);

  return (
    <div className="space-y-6">
      <div className="flex justify-stretch sm:justify-end">
        <RangeSelector value={range} onChange={setRange} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        <CardHeader className="flex flex-col gap-4 space-y-0 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <CardTitle className="text-base">Activity</CardTitle>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {[
                { op: 'chat', model: 'claude-sonnet-4-6' },
                { op: 'standards.generate', model: 'claude-opus-4-8' },
                { op: 'gap.analyze', model: 'claude-sonnet-4-6' },
              ].map(({ op, model }) => (
                <span
                  key={op}
                  className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
                >
                  <span className="truncate text-foreground/70">{operationLabel(op)}</span>
                  <span className="text-muted-foreground/50">·</span>
                  <span className="truncate">{model}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="w-full shrink-0 md:w-auto">
            <UserFilterSelect users={summary?.users ?? []} value={userId} onChange={setUserId} />
          </div>
        </CardHeader>
        <CardContent>
          <ActivityChart data={timeseries} loading={timeseriesLoading} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="min-w-0">
          <CardContent className="pt-6">
            <BreakdownTable
              title="By Provider"
              rows={summary?.by_provider}
              loading={summaryLoading}
            />
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardContent className="pt-6">
            <BreakdownTable
              title={t('settings.aiUsage.byOperation')}
              rows={summary?.by_operation.map((row) => ({
                ...row,
                label: operationLabel(row.label),
              }))}
              loading={summaryLoading}
            />
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardContent className="pt-6">
            <BreakdownTable
              title="By Key Source"
              rows={summary?.by_key_source}
              loading={summaryLoading}
            />
          </CardContent>
        </Card>
      </div>

      <Card className="min-w-0">
        <CardContent className="pt-6">
          <ByUserTable users={summary?.users} loading={summaryLoading} />
        </CardContent>
      </Card>
    </div>
  );
}
