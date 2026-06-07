import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuditLog } from '../../queries/admin';

const ACTION_OPTIONS = [
  '',
  'workflow.submitted',
  'workflow.approved',
  'workflow.rejected',
  'workflow.published',
  'ai.standards.generated',
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

export function AuditLogTab() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const { data, isPending } = useAuditLog(page, action || undefined);

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

  if (isPending) return <div className="text-sm text-muted-foreground">{t('common.loading')}</div>;

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-semibold text-foreground">{t('settings.auditLog.title')}</h2>
        <select
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
          className="ml-auto rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-green-500"
        >
          <option value="">{t('settings.auditLog.allActions')}</option>
          {ACTION_OPTIONS.filter(Boolean).map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      {data?.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('settings.auditLog.empty')}</p>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground uppercase tracking-wider">
                  {t('settings.auditLog.time')}
                </th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground uppercase tracking-wider">
                  {t('settings.auditLog.action')}
                </th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground uppercase tracking-wider">
                  {t('settings.auditLog.resource')}
                </th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((log) => (
                <tr
                  key={log.id}
                  className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                >
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                    {formatDate(log.createdAt)}
                  </td>
                  <td className="px-3 py-2 font-mono text-foreground">{log.action}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {log.resourceType && <span>{log.resourceType}</span>}
                    {log.resourceId && (
                      <span className="ml-1 text-muted-foreground/60 font-mono">
                        {log.resourceId.slice(0, 8)}…
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{t('settings.auditLog.total', { count: data?.total ?? 0 })}</span>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-md border border-border px-2 py-1 hover:bg-muted disabled:opacity-40 cursor-pointer"
            >
              ‹
            </button>
            <span className="px-2 py-1">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-border px-2 py-1 hover:bg-muted disabled:opacity-40 cursor-pointer"
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
