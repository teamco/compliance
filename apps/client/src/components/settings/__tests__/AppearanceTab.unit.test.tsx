import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createIcoreI18n, ICORE_LOCALES } from '@icore/template-shared';
import { AppearanceTab } from '../AppearanceTab';

const mutateFn = vi.fn();

vi.mock('../../../queries/settings', () => ({
  useUserPrefs: () => ({
    data: { theme: 'dark', language: 'en', notificationPrefs: {} },
    isPending: false,
  }),
  useUpdatePrefs: () => ({ mutate: mutateFn }),
}));

vi.mock('@icore/template-shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@icore/template-shared')>();
  return { ...actual, useThemeStore: vi.fn(() => ({ mode: 'dark' })) };
});

const i18n = createIcoreI18n({ resources: ICORE_LOCALES });
const wrap = (ui: React.ReactElement) => <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>;

describe('AppearanceTab', () => {
  it('renders all three theme options', () => {
    render(wrap(<AppearanceTab />));
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(3);
  });

  it('renders all four language options', () => {
    render(wrap(<AppearanceTab />));
    expect(screen.getByText('English')).toBeTruthy();
    expect(screen.getByText('Русский')).toBeTruthy();
    expect(screen.getByText('עברית')).toBeTruthy();
    expect(screen.getByText('Español')).toBeTruthy();
  });

  it('clicking Light button calls updatePrefs with theme light', () => {
    render(wrap(<AppearanceTab />));
    const lightBtn = screen.getByRole('button', { name: /light/i });
    fireEvent.click(lightBtn);
    expect(mutateFn).toHaveBeenCalledWith(expect.objectContaining({ theme: 'light' }));
  });
});
