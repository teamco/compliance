import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createIcoreI18n, ICORE_LOCALES } from '@icore/template-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const createMutate = vi.fn();

vi.mock('@/queries/vendors', () => ({
  useVendors: () => ({ data: [], isPending: false }),
  useCreateVendor: () => ({ mutate: createMutate, isPending: false }),
}));

vi.mock('@/queries/org-members', () => ({
  useOrgMembers: () => ({
    data: [
      { userId: 'u1', displayName: 'Alice', email: 'alice@x.com', role: 'owner' },
      { userId: 'u2', displayName: 'Bob', email: 'bob@x.com', role: 'viewer' },
    ],
  }),
}));

vi.mock('@/stores/active-org', () => ({
  useActiveOrgStore: () => ({ activeOrgId: 'org1' }),
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: { component: React.ComponentType }) => ({ options: opts }),
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const i18n = createIcoreI18n({ resources: ICORE_LOCALES });

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient();
  return (
    <QueryClientProvider client={qc}>
      <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>
    </QueryClientProvider>
  );
}

describe('VendorsPage — Add Vendor dialog', () => {
  beforeEach(() => {
    createMutate.mockClear();
  });

  it('shows a Contract Owner combobox after the Name/Domain inputs', async () => {
    const { VendorsPage } = await import('../vendors');
    render(wrap(<VendorsPage />));
    fireEvent.click(screen.getByText('Add Vendor'));

    expect(screen.getByPlaceholderText('Vendor name')).toBeTruthy();
    expect(screen.getByPlaceholderText('Domain (e.g. example.com)')).toBeTruthy();
    expect(screen.getByText('Select contract owner…')).toBeTruthy();
  });

  it('does not submit without a Contract Owner selected', async () => {
    const { VendorsPage } = await import('../vendors');
    render(wrap(<VendorsPage />));
    fireEvent.click(screen.getByText('Add Vendor'));

    fireEvent.change(screen.getByPlaceholderText('Vendor name'), {
      target: { value: 'Acme Corp' },
    });
    fireEvent.change(screen.getByPlaceholderText('Domain (e.g. example.com)'), {
      target: { value: 'acme.com' },
    });
    const submitButtons = screen.getAllByText('Add Vendor');
    fireEvent.click(submitButtons[submitButtons.length - 1]);

    expect(createMutate).not.toHaveBeenCalled();
  });
});
