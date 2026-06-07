import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@icore/template-shared';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

type ExportType = 'standards' | 'organization' | 'audit-log';

const EXPORT_OPTIONS: { value: ExportType; labelKey: string; descKey: string }[] = [
  {
    value: 'standards',
    labelKey: 'settings.export.standards',
    descKey: 'settings.export.standardsDesc',
  },
  {
    value: 'organization',
    labelKey: 'settings.export.organization',
    descKey: 'settings.export.organizationDesc',
  },
  {
    value: 'audit-log',
    labelKey: 'settings.export.auditLog',
    descKey: 'settings.export.auditLogDesc',
  },
];

export function ExportTab() {
  const { t } = useTranslation();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [selected, setSelected] = useState<ExportType>('standards');
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/export?type=${selected}`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      if (!res.ok) throw new Error('export_failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selected}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="mb-1 text-sm font-semibold text-foreground">{t('settings.export.title')}</h2>
        <p className="text-xs text-muted-foreground">{t('settings.export.subtitle')}</p>
      </div>

      <div className="space-y-2">
        {EXPORT_OPTIONS.map(({ value, labelKey, descKey }) => (
          <label
            key={value}
            className={[
              'flex cursor-pointer items-start gap-3 rounded-md border px-4 py-3 transition-colors',
              selected === value
                ? 'border-green-500/50 bg-green-500/5'
                : 'border-border hover:border-border/80',
            ].join(' ')}
          >
            <input
              type="radio"
              name="export-type"
              value={value}
              checked={selected === value}
              onChange={() => setSelected(value)}
              className="mt-0.5 accent-green-500"
            />
            <div>
              <p className="text-sm font-medium text-foreground">{t(labelKey)}</p>
              <p className="text-xs text-muted-foreground">{t(descKey)}</p>
            </div>
          </label>
        ))}
      </div>

      <Button onClick={() => void handleExport()} disabled={loading} className="gap-2">
        <Download size={14} />
        {loading ? t('common.loading') : t('settings.export.download')}
      </Button>
    </div>
  );
}
