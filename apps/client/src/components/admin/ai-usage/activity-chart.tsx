import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { AiUsageTimeseries } from '@/queries/admin-ai-usage';
import { ChartSkeleton } from './chart-skeleton';
import { EmptyState } from './empty-state';

interface ActivityChartProps {
  data: AiUsageTimeseries | undefined;
  loading: boolean;
}

export function ActivityChart({ data, loading }: ActivityChartProps) {
  if (loading) return <ChartSkeleton />;
  if (!data || data.timestamps.length === 0) return <EmptyState />;

  const chartData = data.timestamps.map((ts, i) => ({
    ts: ts.slice(0, 10),
    calls: data.calls[i],
    tokens: data.tokens[i],
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey="ts" tick={{ fontSize: 11 }} />
        <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="calls"
          stroke="#3b82f6"
          dot={false}
          name="Calls"
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="tokens"
          stroke="#f59e0b"
          dot={false}
          name="Tokens"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
