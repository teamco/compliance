import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Zap } from 'lucide-react';
import {
  useWebhooks,
  useCreateWebhook,
  useUpdateWebhook,
  useDeleteWebhook,
  WEBHOOK_EVENT_LABELS,
} from '../../queries/admin';
import type { WebhookEvent } from '../../queries/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const ALL_EVENTS = Object.keys(WEBHOOK_EVENT_LABELS) as WebhookEvent[];

export function WebhooksTab() {
  const { t } = useTranslation();
  const { data: webhooks, isPending } = useWebhooks();
  const { mutate: createWebhook, isPending: creating } = useCreateWebhook();
  const { mutate: updateWebhook } = useUpdateWebhook();
  const { mutate: deleteWebhook } = useDeleteWebhook();

  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<WebhookEvent[]>([]);

  function toggleEvent(ev: WebhookEvent) {
    setSelectedEvents((prev) =>
      prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev],
    );
  }

  function handleCreate() {
    if (!url.trim() || selectedEvents.length === 0) return;
    createWebhook(
      { url: url.trim(), events: selectedEvents },
      {
        onSuccess: () => {
          setUrl('');
          setSelectedEvents([]);
          setShowForm(false);
        },
      },
    );
  }

  if (isPending) return <div className="text-sm text-muted-foreground">{t('common.loading')}</div>;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{t('settings.webhooks.title')}</h2>
        <Button size="sm" onClick={() => setShowForm((v) => !v)} className="gap-1.5">
          <Plus size={13} />
          {t('settings.webhooks.add')}
        </Button>
      </div>

      {showForm && (
        <div className="rounded-md border border-border p-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">
              {t('settings.webhooks.url')}
            </label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/webhook"
              className="text-xs font-mono"
            />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-foreground">{t('settings.webhooks.events')}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {ALL_EVENTS.map((ev) => (
                <label key={ev} className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedEvents.includes(ev)}
                    onChange={() => toggleEvent(ev)}
                    className="h-3.5 w-3.5 accent-green-500"
                  />
                  {WEBHOOK_EVENT_LABELS[ev]}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={!url.trim() || selectedEvents.length === 0 || creating}
            >
              {creating ? t('common.saving') : t('common.create')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}

      {webhooks?.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('settings.webhooks.empty')}</p>
      ) : (
        <div className="space-y-2">
          {webhooks?.map((wh) => (
            <div key={wh.id} className="rounded-md border border-border px-4 py-3">
              <div className="flex items-start gap-3">
                <Zap size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-foreground break-all">{wh.url}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {wh.events.map((ev) => (
                      <span
                        key={ev}
                        className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono"
                      >
                        {ev}
                      </span>
                    ))}
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground/60 font-mono">
                    secret: {wh.secret.slice(0, 8)}••••
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={wh.active}
                    onClick={() => updateWebhook({ id: wh.id, patch: { active: !wh.active } })}
                    className={[
                      'relative h-5 w-9 rounded-full transition-colors cursor-pointer',
                      wh.active ? 'bg-green-500' : 'bg-muted',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                        wh.active ? 'translate-x-[18px]' : 'translate-x-0.5',
                      ].join(' ')}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteWebhook(wh.id)}
                    className="rounded-md p-1 text-muted-foreground/50 hover:text-red-400 transition-colors cursor-pointer"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
