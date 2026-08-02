import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createIcoreI18n, ICORE_LOCALES } from '@icore/template-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock ResizeObserver which cmdk (used by Combobox) requires
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

// Mock scrollIntoView which cmdk uses
Element.prototype.scrollIntoView = vi.fn();

const createMutate = vi.fn();

vi.mock('@/queries/exceptions', () => ({
  useExceptions: () => ({ data: [], isPending: false }),
  useCreateException: () => ({ mutate: createMutate, isPending: false }),
  useApproveException: () => ({ mutate: vi.fn() }),
  useRejectException: () => ({ mutate: vi.fn() }),
  useDeleteException: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/queries/notes', () => ({
  useFrameworks: () => ({
    data: [
      {
        id: 'fw1',
        slug: 'soc2',
        name: 'SOC 2',
        description: '',
        version: '1',
        category: 'security',
      },
    ],
  }),
  useFrameworkStandards: () => ({
    data: [
      {
        code: 'STD-1',
        title: 'Access Control',
        objective: '',
        scope: '',
        requirements: [],
        frameworkMappings: [],
      },
    ],
  }),
  useFrameworkControls: () => ({
    data: [
      {
        id: 'c1',
        frameworkId: 'fw1',
        code: 'AC-1',
        title: 'Access Control',
        description: '',
        category: '',
      },
    ],
  }),
}));

vi.mock('@/queries/org-members', () => ({
  useOrgMembers: () => ({
    data: [{ userId: 'u1', displayName: 'Alice', email: 'alice@x.com', role: 'owner' }],
  }),
}));

vi.mock('@/stores/active-org', () => ({
  useActiveOrgStore: () => ({ activeOrgId: 'org1' }),
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: { component: React.ComponentType }) => ({ options: opts }),
  lazyRouteComponent: (importer: () => unknown) => importer,
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

describe('ExceptionsPage — New Exception dialog', () => {
  beforeEach(() => {
    createMutate.mockClear();
  });

  it('renders all 8 fields in order when the dialog opens', async () => {
    const { ExceptionsPage } = await import('../exceptions');
    render(wrap(<ExceptionsPage />));
    fireEvent.click(screen.getByText('New Exception'));

    const labels = screen.getAllByText(
      /^(Title|Framework|Standard|Control Code|Statement|Justification|Owner|Compensating Controls)$/,
    );
    expect(labels.map((l) => l.textContent)).toEqual([
      'Title',
      'Framework',
      'Standard',
      'Control Code',
      'Statement',
      'Justification',
      'Owner',
      'Compensating Controls',
    ]);
  });

  it('resets Standard and Control code comboboxes when Framework changes', async () => {
    const { ExceptionsPage } = await import('../exceptions');
    render(wrap(<ExceptionsPage />));
    fireEvent.click(screen.getByText('New Exception'));

    const comboboxes = screen.getAllByRole('combobox');
    fireEvent.click(comboboxes[0]); // first combobox in field order = Framework
    fireEvent.click(screen.getByText('SOC2 — SOC 2'));

    // After picking a framework, Standard/Control comboboxes show their placeholders again (reset).
    expect(screen.getByText('Select standard…')).toBeTruthy();
    expect(screen.getByText('Select control…')).toBeTruthy();
  });
});
