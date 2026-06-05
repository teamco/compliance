import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AiUsageRange } from '@/queries/admin-ai-usage';

const RANGES: Array<{ value: AiUsageRange; label: string }> = [
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
];

interface RangeSelectorProps {
  value: AiUsageRange;
  onChange: (v: AiUsageRange) => void;
}

export function RangeSelector({ value, onChange }: RangeSelectorProps) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as AiUsageRange)}>
      <SelectTrigger className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {RANGES.map((r) => (
          <SelectItem key={r.value} value={r.value}>
            {r.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
