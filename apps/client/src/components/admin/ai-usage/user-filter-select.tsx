import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AiUsageSummary } from '@/queries/admin-ai-usage';

interface UserFilterSelectProps {
  users: AiUsageSummary['users'];
  value: string;
  onChange: (v: string) => void;
}

export function UserFilterSelect({ users, value, onChange }: UserFilterSelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full sm:w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All users</SelectItem>
        {users.map((u) => (
          <SelectItem key={u.id} value={u.id}>
            {u.full_name ?? u.email}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
