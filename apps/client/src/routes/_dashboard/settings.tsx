import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useIsAdmin } from '@icore/template-shared';
import { AppearanceTab } from '../../components/settings/AppearanceTab';
import { NotificationTab } from '../../components/settings/NotificationTab';

const ADMIN_TABS = new Set(['audit-log', 'export', 'webhooks', 'retention', 'api-keys']);

function SettingsPage() {
  const { t } = useTranslation();
  const isAdmin = useIsAdmin();

  const [activeTab, setActiveTab] = useState<string>(() => {
    const hash = window.location.hash.slice(1);
    return hash || 'appearance';
  });

  function switchTab(tab: string) {
    setActiveTab(tab);
    history.replaceState(null, '', `/settings#${tab}`);
  }

  const tabs = [
    { id: 'appearance', label: t('settings.tabs.appearance') },
    { id: 'notification', label: t('settings.tabs.notification') },
    ...(isAdmin
      ? [
          { id: 'audit-log', label: t('settings.tabs.auditLog') },
          { id: 'export', label: t('settings.tabs.export') },
          { id: 'webhooks', label: t('settings.tabs.webhooks') },
          { id: 'retention', label: t('settings.tabs.retention') },
          { id: 'api-keys', label: t('settings.tabs.apiKeys') },
        ]
      : []),
  ];

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-6 text-2xl font-bold text-foreground">{t('settings.title')}</h1>

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => switchTab(tab.id)}
            className={[
              '-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'border-green-500 text-green-500'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'appearance' && <AppearanceTab />}
      {activeTab === 'notification' && <NotificationTab />}
      {ADMIN_TABS.has(activeTab) && (
        <p className="text-sm text-muted-foreground">{t('common.soon')}</p>
      )}
    </div>
  );
}

export const Route = createFileRoute('/_dashboard/settings')({
  component: SettingsPage,
});
