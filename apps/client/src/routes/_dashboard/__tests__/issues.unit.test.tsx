import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createIcoreI18n, ICORE_LOCALES } from '@icore/template-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const createMutate = vi.fn();

vi.mock('@icore/template-shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@icore/template-shared')>();
  return {
    ...actual,
    useDraft: () => ({ showDialog: false, confirmLeave: vi.fn(), cancelLeave: vi.fn() }),
  };
});

vi.mock('@/queries/issues', () => ({
  useIssues: () => ({ data: [], isPending: false }),
  useCreateIssue: () => ({ mutate: createMutate, isPending: false }),
  useUpdateIssue: () => ({ mutate: vi.fn() }),
  useDeleteIssue: () => ({ mutate: vi.fn() }),
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

describe('IssuesPage — New Issue dialog', () => {
  beforeEach(() => {
    createMutate.mockClear();
  });

  it('renders all 6 fields in order when the dialog opens', async () => {
    const { IssuesPage } = await import('../issues');
    render(wrap(<IssuesPage />));
    fireEvent.click(screen.getByText('New Issue'));

    const labels = screen.getAllByText(
      /^(Title|Severity|Description|Issue Reporter|Affected Asset\(s\)|Issue Owner)$/,
    );
    expect(labels.map((l) => l.textContent)).toEqual([
      'Title',
      'Severity',
      'Description',
      'Issue Reporter',
      'Affected Asset(s)',
      'Issue Owner',
    ]);
  });

  it('does not submit without a Reporter and Owner selected', async () => {
    const { IssuesPage } = await import('../issues');
    render(wrap(<IssuesPage />));
    fireEvent.click(screen.getByText('New Issue'));

    fireEvent.change(screen.getByPlaceholderText('Brief description of the issue'), {
      target: { value: 'Some title' },
    });
    fireEvent.change(screen.getByPlaceholderText('Detailed description, impact, and context'), {
      target: { value: 'Some description' },
    });
    fireEvent.click(screen.getByText('Create'));

    expect(createMutate).not.toHaveBeenCalled();
  });
});
