import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../main';

export type Theme = 'dark' | 'light' | 'system';
export type Language = 'en' | 'ru' | 'he' | 'es';

export interface NotificationPrefsPayload {
  channels: { inApp: boolean; push: boolean };
  events: {
    workflowSubmitted: { inApp: boolean; push: boolean };
    workflowApproved: { inApp: boolean; push: boolean };
    workflowRejected: { inApp: boolean; push: boolean };
    workflowPublished: { inApp: boolean; push: boolean };
    aiStandardsGenerated: { inApp: boolean; push: boolean };
    aiGapAnalysisDone: { inApp: boolean; push: boolean };
    systemNewFramework: { inApp: boolean; push: boolean };
  };
}

export interface UserPrefsPayload {
  theme: Theme;
  language: Language;
  notificationPrefs: NotificationPrefsPayload;
}

export interface PushSubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefsPayload = {
  channels: { inApp: true, push: false },
  events: {
    workflowSubmitted: { inApp: true, push: false },
    workflowApproved: { inApp: true, push: false },
    workflowRejected: { inApp: true, push: false },
    workflowPublished: { inApp: true, push: false },
    aiStandardsGenerated: { inApp: true, push: false },
    aiGapAnalysisDone: { inApp: true, push: false },
    systemNewFramework: { inApp: false, push: false },
  },
};

export const DEFAULT_USER_PREFS: UserPrefsPayload = {
  theme: 'system',
  language: 'en',
  notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
};

export function useUserPrefs() {
  return useQuery<UserPrefsPayload>({
    queryKey: ['settings', 'prefs'],
    queryFn: () => api<UserPrefsPayload>('/settings/me'),
  });
}

export function useUpdatePrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<UserPrefsPayload>) =>
      api<UserPrefsPayload>('/settings/me', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: (data) => qc.setQueryData(['settings', 'prefs'], data),
  });
}

export function useSavePushSubscription() {
  return useMutation({
    mutationFn: (sub: PushSubscriptionPayload) =>
      api<{ ok: boolean }>('/settings/push', {
        method: 'POST',
        body: JSON.stringify(sub),
      }),
  });
}

export function useRemovePushSubscription() {
  return useMutation({
    mutationFn: (endpoint: string) =>
      api<{ ok: boolean }>('/settings/push', {
        method: 'DELETE',
        body: JSON.stringify({ endpoint }),
      }),
  });
}
