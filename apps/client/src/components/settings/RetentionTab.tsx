import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useRetentionPrefs, useUpdateRetentionPrefs } from '../../queries/admin';
import type { RetentionPrefsPayload } from '../../queries/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function RetentionTab() {
  const { t } = useTranslation();
  const { data: prefs, isPending } = useRetentionPrefs();
  const { mutate: updatePrefs, isPending: saving } = useUpdateRetentionPrefs();

  const [form, setForm] = useState<RetentionPrefsPayload>({
    auditLogDays: 90,
    chatHistoryDays: 365,
    notificationDays: 30,
  });

  useEffect(() => {
    if (prefs) setForm(prefs);
  }, [prefs]);

  function handleChange(key: keyof RetentionPrefsPayload, value: string) {
    const num = Math.max(1, parseInt(value, 10) || 1);
    setForm((prev) => ({ ...prev, [key]: num }));
  }

  function handleSave() {
    updatePrefs(form);
  }

  if (isPending) return <div className="text-sm text-muted-foreground">{t('common.loading')}</div>;

  const fields: { key: keyof RetentionPrefsPayload; labelKey: string; descKey: string }[] = [
    {
      key: 'auditLogDays',
      labelKey: 'settings.retention.auditLog',
      descKey: 'settings.retention.auditLogDesc',
    },
    {
      key: 'chatHistoryDays',
      labelKey: 'settings.retention.chatHistory',
      descKey: 'settings.retention.chatHistoryDesc',
    },
    {
      key: 'notificationDays',
      labelKey: 'settings.retention.notifications',
      descKey: 'settings.retention.notificationsDesc',
    },
  ];

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="mb-1 text-sm font-semibold text-foreground">
          {t('settings.retention.title')}
        </h2>
        <p className="text-xs text-muted-foreground">{t('settings.retention.subtitle')}</p>
      </div>

      <div className="space-y-4">
        {fields.map(({ key, labelKey, descKey }) => (
          <div
            key={key}
            className="flex items-center justify-between rounded-md border border-border px-4 py-3"
          >
            <div>
              <p className="text-sm font-medium text-foreground">{t(labelKey)}</p>
              <p className="text-xs text-muted-foreground">{t(descKey)}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Input
                type="number"
                min={1}
                value={form[key]}
                onChange={(e) => handleChange(key, e.target.value)}
                className="w-20 text-xs text-right"
              />
              <span className="text-xs text-muted-foreground">{t('settings.retention.days')}</span>
            </div>
          </div>
        ))}
      </div>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? t('common.saving') : t('common.save')}
      </Button>
    </div>
  );
}
