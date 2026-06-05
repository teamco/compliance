import { BarChart2 } from 'lucide-react';

export function EmptyState({ label = 'No data for this period' }: { label?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
      <BarChart2 className="h-8 w-8 opacity-40" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
