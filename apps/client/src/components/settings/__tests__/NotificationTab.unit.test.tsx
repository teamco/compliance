import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createIcoreI18n, ICORE_LOCALES } from '@icore/template-shared';
import { NotificationTab } from '../NotificationTab';

vi.mock('../../../queries/settings', () => {
  const defaultNotifPrefs = {
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
  return {
    DEFAULT_NOTIFICATION_PREFS: defaultNotifPrefs,
    useUserPrefs: vi.fn().mockReturnValue({
      data: {
        theme: 'system',
        language: 'en',
        notificationPrefs: defaultNotifPrefs,
      },
      isPending: false,
    }),
    useUpdatePrefs: vi.fn().mockReturnValue({ mutate: vi.fn(), isPending: false }),
    useSavePushSubscription: vi.fn().mockReturnValue({ mutateAsync: vi.fn() }),
    useRemovePushSubscription: vi.fn().mockReturnValue({ mutate: vi.fn() }),
  };
});

const i18n = createIcoreI18n({ resources: ICORE_LOCALES });
const wrap = (ui: React.ReactElement) => <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>;

describe('NotificationTab', () => {
  it('renders channels section', () => {
    render(wrap(<NotificationTab />));
    expect(screen.getAllByText(/in.?app/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/push/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders events matrix with at least one event label', () => {
    render(wrap(<NotificationTab />));
    expect(screen.getAllByText(/submitted|approved|rejected|published/i).length).toBeGreaterThanOrEqual(1);
  });

  it('shows enable push button when push not enabled', () => {
    render(wrap(<NotificationTab />));
    expect(screen.getByRole('button', { name: /enable push/i })).toBeTruthy();
  });
});
