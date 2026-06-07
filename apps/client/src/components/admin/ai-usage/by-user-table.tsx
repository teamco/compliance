import type { AiUsageSummary } from '@/queries/admin-ai-usage';

interface ByUserTableProps {
  users: AiUsageSummary['users'] | undefined;
  loading?: boolean;
}

export function ByUserTable({ users, loading }: ByUserTableProps) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-muted-foreground">By User</h4>
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : !users || users.length === 0 ? (
        <p className="text-xs text-muted-foreground">No data</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-[--color-border] text-xs text-muted-foreground">
                <th className="pb-1 text-left font-medium">User</th>
                <th className="pb-1 text-right font-medium">Calls</th>
                <th className="pb-1 text-right font-medium">Tokens</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-[--color-border]/40 last:border-0">
                  <td className="max-w-80 py-1.5 pr-4">
                    <p className="truncate font-medium">{u.full_name ?? u.email}</p>
                    {u.full_name && (
                      <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                    )}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{u.calls.toLocaleString()}</td>
                  <td className="py-1.5 text-right tabular-nums">{u.tokens.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
