import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createIcoreI18n, ICORE_LOCALES } from '@icore/template-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Finding, InternalControl } from '@icore/shared';

class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView = vi.fn();

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    Link: ({
      children,
      to,
      params,
      className,
    }: {
      children: React.ReactNode;
      to: string;
      params?: Record<string, string>;
      className?: string;
    }) => (
      <a href={`${to}`.replace('$id', params?.id ?? '')} className={className}>
        {children}
      </a>
    ),
  };
});

const mockFinding: Finding = {
  id: 'finding1',
  orgId: 'org1',
  code: 'FIND-000101',
  controlId: 'ctrl1',
  assessmentId: 'asm1',
  title: 'Missing evidence',
  description: 'desc',
  severity: 'high',
  status: 'open',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const mockControls: InternalControl[] = [
  {
    id: 'ctrl1',
    orgId: 'org1',
    code: 'POL-001',
    title: 'Policy Review',
    description: 'd',
    owner: 'Sec',
  },
];

const mockCreateIssueMutate = vi.fn();
const mockLinkIssueMutate = vi.fn();
const mockCreateRiskMutate = vi.fn();
const mockLinkRiskMutate = vi.fn();

vi.mock('@/queries/frameworks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/queries/frameworks')>();
  return {
    ...actual,
    useControlFindings: () => ({ data: [mockFinding] }),
    useCreateIssueFromFinding: () => ({ mutate: mockCreateIssueMutate, isPending: false }),
    useLinkFindingToIssue: () => ({ mutate: mockLinkIssueMutate, isPending: false }),
    useCreateRiskFromFinding: () => ({ mutate: mockCreateRiskMutate, isPending: false }),
    useLinkFindingToRisk: () => ({ mutate: mockLinkRiskMutate, isPending: false }),
    useCreateExceptionFromFinding: () => ({ mutate: vi.fn(), isPending: false }),
    useResolveFindingViaException: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

vi.mock('@/queries/issues', () => ({
  useIssues: () => ({ data: [{ id: 'issue1', title: 'Existing issue' }] }),
}));
vi.mock('@/queries/risks', () => ({
  useRisks: () => ({ data: [] }),
  useRiskTaxonomy: () => ({ data: [{ id: 'cat1', name: 'Category 1' }] }),
}));
vi.mock('@/queries/exceptions', () => ({
  useExceptions: () => ({ data: [] }),
}));
vi.mock('@/queries/org-members', () => ({
  useOrgMembers: () => ({
    data: [{ userId: 'user1', displayName: 'Alice', email: 'a@x.com', role: 'owner' }],
  }),
}));

const i18n = createIcoreI18n({ resources: ICORE_LOCALES });

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>
    </QueryClientProvider>
  );
}

describe('LinkedFindingSection', () => {
  beforeEach(() => vi.clearAllMocks());

  async function renderSection() {
    const { LinkedFindingSection } = await import('../LinkedFindingSection');
    render(
      wrap(
        <LinkedFindingSection
          findingId="finding1"
          controlId="ctrl1"
          orgId="org1"
          frameworkId="fw1"
          internalControls={mockControls}
        />,
      ),
    );
  }

  it('shows the finding code, severity and status', async () => {
    await renderSection();
    expect(screen.getByText('FIND-000101')).toBeDefined();
    expect(screen.getByText(/open/i)).toBeDefined();
  });

  it('shows Create/Link Issue buttons with Cancel in the footer when unlinked', async () => {
    await renderSection();
    fireEvent.click(screen.getByRole('button', { name: /create new issue/i }));
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDefined();
  });

  it('calls createIssueFromFinding with the finding pre-filled', async () => {
    await renderSection();
    fireEvent.click(screen.getByRole('button', { name: /create new issue/i }));
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'Alice' }));
    fireEvent.click(screen.getByRole('button', { name: /create new issue/i }));
    expect(mockCreateIssueMutate).toHaveBeenCalled();
  });

  it('calls createRiskFromFinding with the picked category, owner, and scores', async () => {
    await renderSection();
    fireEvent.click(screen.getByRole('button', { name: /create new risk/i }));

    const [categorySelect, ownerCombobox, likelihoodSelect, impactSelect] =
      screen.getAllByRole('combobox');

    fireEvent.change(categorySelect, { target: { value: 'cat1' } });

    fireEvent.click(ownerCombobox);
    fireEvent.click(screen.getByRole('option', { name: 'Alice' }));

    fireEvent.change(likelihoodSelect, { target: { value: '3' } });
    fireEvent.change(impactSelect, { target: { value: '4' } });

    fireEvent.click(screen.getByRole('button', { name: /create new risk/i }));

    expect(mockCreateRiskMutate).toHaveBeenCalledWith(
      {
        title: mockFinding.title,
        description: mockFinding.description,
        taxonomyCategoryId: 'cat1',
        ownerId: 'user1',
        inherentLikelihood: 3,
        inherentImpact: 4,
      },
      expect.any(Object),
    );
  });
});
