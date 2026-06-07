import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAiUsageSummary } from '../../queries/admin';
import type { AiUsageRange } from '../../queries/admin';

const RANGES: { value: AiUsageRange; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
];

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold text-foreground tabular-nums">{value}</p>
    </div>
  );
}

export function AiUsageTab() {
  const { t } = useTranslation();
  const [range, setRange] = useState<AiUsageRange>('7d');
  const { data, isPending } = useAiUsageSummary(range);

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{t('settings.aiUsage.title')}</h2>
        <div className="flex gap-1 rounded-md border border-border p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRange(r.value)}
              className={[
                'rounded px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
                range === r.value
                  ? 'bg-green-500 text-white'
                  : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {isPending ? (
        <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label={t('settings.aiUsage.calls')} value={data?.total_calls ?? 0} />
            <StatCard
              label={t('settings.aiUsage.tokens')}
              value={(data?.total_tokens ?? 0).toLocaleString()}
            />
            <StatCard
              label={t('settings.aiUsage.cost')}
              value={`$${(data?.total_cost_usd ?? 0).toFixed(4)}`}
            />
          </div>

          {(data?.by_operation?.length ?? 0) > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-foreground">
                {t('settings.aiUsage.byOperation')}
              </p>
              <div className="overflow-hidden rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground uppercase tracking-wider">
                        {t('settings.aiUsage.operation')}
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground uppercase tracking-wider">
                        {t('settings.aiUsage.calls')}
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground uppercase tracking-wider">
                        {t('settings.aiUsage.tokens')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.by_operation.map((row) => (
                      <tr key={row.operation} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 font-mono text-foreground">{row.operation}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {row.calls}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {row.tokens.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(data?.by_operation?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">{t('settings.aiUsage.empty')}</p>
          )}
        </>
      )}
    </div>
  );
}
