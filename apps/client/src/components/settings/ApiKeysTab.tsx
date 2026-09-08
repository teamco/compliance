import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Key, Plus, Trash2 } from 'lucide-react';
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '../../queries/admin';
import type { ApiKeyWithSecret } from '../../queries/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

export function ApiKeysTab() {
  const { t } = useTranslation();
  const { data: keys, isPending } = useApiKeys();
  const { mutate: createKey, isPending: creating } = useCreateApiKey();
  const { mutate: revokeKey } = useRevokeApiKey();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [newKey, setNewKey] = useState<ApiKeyWithSecret | null>(null);

  function handleCreate() {
    if (!name.trim()) return;
    createKey(
      { name: name.trim(), expiresAt: expiresAt || undefined },
      {
        onSuccess: (key) => {
          setNewKey(key);
          setName('');
          setExpiresAt('');
          setShowForm(false);
        },
      },
    );
  }

  if (isPending) return <div className="text-sm text-muted-foreground">{t('common.loading')}</div>;

  return (
    <div className="max-w-2xl space-y-6">
      {newKey && (
        <div className="rounded-md border border-green-500/30 bg-green-500/5 px-4 py-3">
          <p className="mb-1 text-xs font-semibold text-green-500">
            {t('settings.apiKeys.copyWarning')}
          </p>
          <code className="block break-all rounded bg-background px-2 py-1.5 text-xs font-mono text-foreground border border-border">
            {newKey.fullKey}
          </code>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(newKey.fullKey);
            }}
            className="mt-2 text-xs text-green-500 hover:text-green-400 cursor-pointer"
          >
            {t('common.copy')}
          </button>
          <button
            type="button"
            onClick={() => setNewKey(null)}
            className="ml-4 mt-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            {t('common.dismiss')}
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{t('settings.apiKeys.title')}</h2>
        <Button size="sm" onClick={() => setShowForm((v) => !v)} className="gap-1.5">
          <Plus size={13} />
          {t('settings.apiKeys.create')}
        </Button>
      </div>

      {showForm && (
        <div className="rounded-md border border-border p-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">
              {t('settings.apiKeys.name')}
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('settings.apiKeys.namePlaceholder')}
              className="text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">
              {t('settings.apiKeys.expiresAt')}
            </label>
            <Input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="text-xs"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={!name.trim() || creating}>
              {creating ? t('common.saving') : t('common.create')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}

      {keys?.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('settings.apiKeys.empty')}</p>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          {keys?.map((key) => (
            <div
              key={key.id}
              className={[
                'flex items-center gap-3 px-4 py-3 border-b border-border last:border-0',
                key.revokedAt ? 'opacity-50' : '',
              ].join(' ')}
            >
              <Key size={14} className="shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{key.name}</p>
                <p className="text-xs text-muted-foreground font-mono">{key.keyPrefix}••••••••</p>
              </div>
              <div className="text-right text-xs text-muted-foreground shrink-0">
                <p>
                  {t('settings.apiKeys.created')} {formatDate(key.createdAt)}
                </p>
                {key.expiresAt && (
                  <p>
                    {t('settings.apiKeys.expires')} {formatDate(key.expiresAt)}
                  </p>
                )}
                {key.revokedAt && <p className="text-red-400">{t('settings.apiKeys.revoked')}</p>}
              </div>
              {!key.revokedAt && (
                <button
                  type="button"
                  onClick={() => revokeKey(key.id)}
                  className="shrink-0 rounded-md p-1 text-muted-foreground/50 hover:text-red-400 transition-colors cursor-pointer"
                  title={t('settings.apiKeys.revoke')}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
