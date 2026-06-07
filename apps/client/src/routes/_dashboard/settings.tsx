import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useIsAdmin } from '@icore/template-shared';
import { AppearanceTab } from '../../components/settings/AppearanceTab';
import { NotificationTab } from '../../components/settings/NotificationTab';
import { AuditLogTab } from '../../components/settings/AuditLogTab';
import { ApiKeysTab } from '../../components/settings/ApiKeysTab';
import { WebhooksTab } from '../../components/settings/WebhooksTab';
import { ExportTab } from '../../components/settings/ExportTab';
import { RetentionTab } from '../../components/settings/RetentionTab';

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
          { id: 'api-keys', label: t('settings.tabs.apiKeys') },
          { id: 'webhooks', label: t('settings.tabs.webhooks') },
          { id: 'export', label: t('settings.tabs.export') },
          { id: 'retention', label: t('settings.tabs.retention') },
        ]
      : []),
  ];

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-6 text-2xl font-bold text-foreground">{t('settings.title')}</h1>

      <div className="mb-6 flex flex-wrap gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => switchTab(tab.id)}
            className={[
              '-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors cursor-pointer',
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
      {activeTab === 'audit-log' && <AuditLogTab />}
      {activeTab === 'api-keys' && <ApiKeysTab />}
      {activeTab === 'webhooks' && <WebhooksTab />}
      {activeTab === 'export' && <ExportTab />}
      {activeTab === 'retention' && <RetentionTab />}
    </div>
  );
}

export const Route = createFileRoute('/_dashboard/settings')({
  component: SettingsPage,
});
