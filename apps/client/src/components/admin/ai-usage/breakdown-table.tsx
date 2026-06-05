interface BreakdownRow {
  label: string;
  calls: number;
  tokens: number;
}

interface BreakdownTableProps {
  title: string;
  rows: BreakdownRow[] | undefined;
  loading?: boolean;
}

export function BreakdownTable({ title, rows, loading }: BreakdownTableProps) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-muted-foreground">{title}</h4>
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : !rows || rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No data</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[--color-border] text-xs text-muted-foreground">
              <th className="pb-1 text-left font-medium">Label</th>
              <th className="pb-1 text-right font-medium">Calls</th>
              <th className="pb-1 text-right font-medium">Tokens</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-[--color-border]/40 last:border-0">
                <td className="py-1.5">{row.label}</td>
                <td className="py-1.5 text-right tabular-nums">{row.calls.toLocaleString()}</td>
                <td className="py-1.5 text-right tabular-nums">{row.tokens.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
