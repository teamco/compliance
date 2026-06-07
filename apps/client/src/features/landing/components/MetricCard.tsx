import { cn } from '@/lib/utils';

const toneClass: Record<string, string> = {
  green: 'text-green-400 bg-green-500/10 border-green-500/20',
  amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  purple: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
};

interface MetricCardProps {
  label: string;
  value: string;
  tone?: keyof typeof toneClass;
}

export function MetricCard({ label, value, tone = 'green' }: MetricCardProps) {
  return (
    <div className="rounded-xl border border-border bg-background/60 p-4">
      <div className={cn('mb-3 inline-flex rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider', toneClass[tone])}>
        Live
      </div>
      <div className="text-2xl font-semibold text-foreground tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
