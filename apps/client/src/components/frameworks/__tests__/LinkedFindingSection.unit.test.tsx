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
const mockCreateExceptionMutate = vi.fn();
const mockResolveMutate = vi.fn();

vi.mock('@/queries/frameworks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/queries/frameworks')>();
  return {
    ...actual,
    useControlFindings: () => ({ data: [mockFinding] }),
    useCreateIssueFromFinding: () => ({ mutate: mockCreateIssueMutate, isPending: false }),
    useLinkFindingToIssue: () => ({ mutate: mockLinkIssueMutate, isPending: false }),
    useCreateRiskFromFinding: () => ({ mutate: mockCreateRiskMutate, isPending: false }),
    useLinkFindingToRisk: () => ({ mutate: mockLinkRiskMutate, isPending: false }),
    useCreateExceptionFromFinding: () => ({ mutate: mockCreateExceptionMutate, isPending: false }),
    useResolveFindingViaException: () => ({ mutate: mockResolveMutate, isPending: false }),
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
  useExceptions: () => ({
    data: [
      { id: 'exc1', title: 'Approved one', status: 'approved' },
      { id: 'exc2', title: 'Pending one', status: 'pending' },
    ],
  }),
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

  it('shows the short "Link Existing (Approved)" trigger text, not the full dialog title text', async () => {
    await renderSection();
    expect(screen.getByRole('button', { name: 'Link Existing (Approved)' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Link Existing (Approved) Exception' })).toBeNull();
  });

  it('filters the Link Existing Exception combobox to approved exceptions only', async () => {
    await renderSection();
    fireEvent.click(screen.getByRole('button', { name: /link existing \(approved\)/i }));
    fireEvent.click(screen.getByRole('combobox'));

    expect(screen.getByRole('option', { name: 'Approved one' })).toBeDefined();
    expect(screen.queryByRole('option', { name: 'Pending one' })).toBeNull();
  });

  it('calls createExceptionFromFinding with control code, frameworkId, statement, justification and owner', async () => {
    await renderSection();
    fireEvent.click(screen.getByRole('button', { name: /create new exception/i }));

    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'Alice' }));

    const [statementTextarea, justificationTextarea] = screen.getAllByRole('textbox');
    fireEvent.change(statementTextarea, { target: { value: 'We accept this risk for now' } });
    fireEvent.change(justificationTextarea, {
      target: { value: 'Compensating control X is in place' },
    });

    fireEvent.click(screen.getByRole('button', { name: /create new exception/i }));

    expect(mockCreateExceptionMutate).toHaveBeenCalledWith(
      {
        controlCode: 'POL-001',
        frameworkId: 'fw1',
        title: mockFinding.title,
        statement: 'We accept this risk for now',
        justification: 'Compensating control X is in place',
        ownerId: 'user1',
      },
      expect.any(Object),
    );
  });

  it('calls resolveFindingViaException with the selected approved exception id', async () => {
    await renderSection();
    fireEvent.click(screen.getByRole('button', { name: /link existing \(approved\)/i }));
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'Approved one' }));

    fireEvent.click(screen.getByRole('button', { name: /link existing \(approved\) exception/i }));

    expect(mockResolveMutate).toHaveBeenCalledWith({ exceptionId: 'exc1' }, expect.any(Object));
  });
});
