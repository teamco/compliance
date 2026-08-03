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

vi.mock('@icore/template-shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@icore/template-shared')>();
  return {
    ...actual,
    useDraft: () => ({ showDialog: false, confirmLeave: vi.fn(), cancelLeave: vi.fn() }),
  };
});

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
      {
        id: 'fw2',
        slug: 'iso27001',
        name: 'ISO 27001',
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

    // Combobox order in the field layout = Framework, Standard, Control Code, Owner.
    const comboboxes = () => screen.getAllByRole('combobox');

    // Pick a framework first, which enables the Standard/Control Code comboboxes.
    fireEvent.click(comboboxes()[0]);
    fireEvent.click(screen.getByText('SOC2 — SOC 2'));

    // Select a non-empty Standard value.
    fireEvent.click(comboboxes()[1]);
    fireEvent.click(screen.getByText('STD-1 — Access Control'));

    // Select a non-empty Control Code value.
    fireEvent.click(comboboxes()[2]);
    fireEvent.click(screen.getByText('AC-1 — Access Control'));

    // Sanity check: the selections actually took effect (comboboxes show the
    // selected labels, not their placeholders). Without this, the later "reset"
    // assertion below would be vacuously true even if nothing were ever selected.
    expect(screen.getByText('STD-1 — Access Control')).toBeTruthy();
    expect(screen.getByText('AC-1 — Access Control')).toBeTruthy();
    expect(screen.queryByText('Select standard…')).toBeNull();
    expect(screen.queryByText('Select control…')).toBeNull();

    // Now change the Framework selection to a *different* framework.
    fireEvent.click(comboboxes()[0]);
    fireEvent.click(screen.getByText('ISO27001 — ISO 27001'));

    // Standard/Control comboboxes must reset back to their placeholders — this is
    // the actual regression this test guards against.
    expect(screen.getByText('Select standard…')).toBeTruthy();
    expect(screen.getByText('Select control…')).toBeTruthy();
    expect(screen.queryByText('STD-1 — Access Control')).toBeNull();
    expect(screen.queryByText('AC-1 — Access Control')).toBeNull();
  });
});
