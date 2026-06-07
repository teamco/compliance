import { useTranslation } from 'react-i18next';
import {
  useUserPrefs,
  useUpdatePrefs,
  useSavePushSubscription,
  useRemovePushSubscription,
  DEFAULT_NOTIFICATION_PREFS,
} from '../../queries/settings';
import type { NotificationPrefsPayload } from '../../queries/settings';

type EventKey = keyof NotificationPrefsPayload['events'];

const EVENT_ROWS: { key: EventKey; labelKey: string }[] = [
  { key: 'workflowSubmitted', labelKey: 'settings.notifications.events.workflowSubmitted' },
  { key: 'workflowApproved', labelKey: 'settings.notifications.events.workflowApproved' },
  { key: 'workflowRejected', labelKey: 'settings.notifications.events.workflowRejected' },
  { key: 'workflowPublished', labelKey: 'settings.notifications.events.workflowPublished' },
  { key: 'aiStandardsGenerated', labelKey: 'settings.notifications.events.aiStandardsGenerated' },
  { key: 'aiGapAnalysisDone', labelKey: 'settings.notifications.events.aiGapAnalysisDone' },
  { key: 'systemNewFramework', labelKey: 'settings.notifications.events.systemNewFramework' },
];

export function NotificationTab() {
  const { t } = useTranslation();
  const { data: prefs, isPending } = useUserPrefs();
  const { mutate: updatePrefs, isPending: saving } = useUpdatePrefs();
  const { mutateAsync: savePushSub } = useSavePushSubscription();
  const { mutate: removePushSub } = useRemovePushSubscription();

  const notifPrefs = prefs?.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS;
  const pushEnabled = notifPrefs.channels.push;

  function toggleChannel(channel: 'inApp' | 'push', value: boolean) {
    updatePrefs({
      notificationPrefs: {
        ...notifPrefs,
        channels: { ...notifPrefs.channels, [channel]: value },
      },
    });
  }

  function toggleEvent(eventKey: EventKey, channel: 'inApp' | 'push', value: boolean) {
    updatePrefs({
      notificationPrefs: {
        ...notifPrefs,
        events: {
          ...notifPrefs.events,
          [eventKey]: { ...notifPrefs.events[eventKey], [channel]: value },
        },
      },
    });
  }

  async function handleEnablePush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
    });
    const subJson = sub.toJSON();
    await savePushSub({
      endpoint: sub.endpoint,
      keys: {
        p256dh: subJson.keys?.p256dh ?? '',
        auth: subJson.keys?.auth ?? '',
      },
    });
    toggleChannel('push', true);
  }

  function handleDisablePush() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!sub) return;
        removePushSub(sub.endpoint);
        return sub.unsubscribe();
      });
    toggleChannel('push', false);
  }

  if (isPending) {
    return <div className="text-sm text-muted-foreground">{t('common.loading')}</div>;
  }

  return (
    <div className="max-w-2xl space-y-8">
      <section>
        <h2 className="mb-1 text-sm font-semibold text-foreground">
          {t('settings.notifications.channels')}
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">
          {t('settings.notifications.channelsSubtitle')}
        </p>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-md border border-border px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                {t('settings.notifications.inApp')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('settings.notifications.inAppDesc')}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notifPrefs.channels.inApp}
              disabled={saving}
              onClick={() => toggleChannel('inApp', !notifPrefs.channels.inApp)}
              className={[
                'relative h-5 w-9 rounded-full transition-colors',
                notifPrefs.channels.inApp ? 'bg-green-500' : 'bg-muted',
              ].join(' ')}
            >
              <span
                className={[
                  'absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                  notifPrefs.channels.inApp ? 'translate-x-[18px]' : 'translate-x-0.5',
                ].join(' ')}
              />
            </button>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                {t('settings.notifications.push')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('settings.notifications.pushDesc')}
              </p>
            </div>
            {pushEnabled ? (
              <button
                type="button"
                onClick={handleDisablePush}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                {t('settings.notifications.disablePush')}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleEnablePush}
                className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-500 hover:bg-green-500/20 transition-colors"
              >
                {t('settings.notifications.enablePush')}
              </button>
            )}
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold text-foreground">
          {t('settings.notifications.events.title')}
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">
          {t('settings.notifications.events.subtitle')}
        </p>
        <div className="overflow-hidden rounded-md border border-border">
          <div className="grid grid-cols-[1fr_80px_80px] gap-0 border-b border-border bg-muted/30 px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <span>{t('settings.notifications.events.event')}</span>
            <span className="text-center">{t('settings.notifications.inApp')}</span>
            <span className="text-center">{t('settings.notifications.push')}</span>
          </div>
          {EVENT_ROWS.map(({ key, labelKey }) => (
            <div
              key={key}
              className="grid grid-cols-[1fr_80px_80px] gap-0 border-b border-border px-4 py-2.5 last:border-0"
            >
              <span className="text-sm text-foreground">{t(labelKey)}</span>
              {(['inApp', 'push'] as const).map((channel) => (
                <div key={channel} className="flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={notifPrefs.events[key][channel]}
                    disabled={saving || (channel === 'push' && !pushEnabled)}
                    onChange={(e) => toggleEvent(key, channel, e.target.checked)}
                    className="h-4 w-4 cursor-pointer accent-green-500 disabled:cursor-not-allowed disabled:opacity-40"
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
