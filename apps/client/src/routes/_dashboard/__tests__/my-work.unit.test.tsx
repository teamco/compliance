import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createIcoreI18n, ICORE_LOCALES } from '@icore/template-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  Assessment,
  Exception,
  ExceptionRenewal,
  Issue,
  IssueValidation,
} from '@icore/shared';

const mockNavigate = vi.fn();

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@icore/template-shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@icore/template-shared')>();
  return {
    ...actual,
    useAuthStore: (selector: (s: { user: { id: string; email: string } }) => unknown) =>
      selector({ user: { id: 'me', email: 'me@example.com' } }),
  };
});

vi.mock('@/stores/active-org', () => ({
  useActiveOrgStore: () => ({ activeOrgId: 'org1' }),
}));

let mockIssues: Issue[] = [];
let mockExceptions: Exception[] = [];
let mockAssessments: Assessment[] = [];
let mockPendingValidations: IssueValidation[] = [];
let mockPendingRenewals: ExceptionRenewal[] = [];

vi.mock('@/queries/issues', () => ({
  useIssues: () => ({ data: mockIssues, isPending: false }),
  usePendingIssueValidations: () => ({ data: mockPendingValidations }),
}));

vi.mock('@/queries/exceptions', () => ({
  useExceptions: () => ({ data: mockExceptions, isPending: false }),
  usePendingExceptionRenewals: () => ({ data: mockPendingRenewals }),
}));

vi.mock('@/queries/assessments', () => ({
  useAssessments: () => ({ data: mockAssessments, isPending: false }),
}));

const NOW = new Date('2026-06-15T00:00:00.000Z');
const PAST = '2026-06-01T00:00:00.000Z';
const SOON = '2026-06-18T00:00:00.000Z';
const FAR = '2026-08-01T00:00:00.000Z';

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'issue-1',
    orgId: 'org1',
    userId: 'me',
    title: 'Overdue issue',
    description: 'D',
    severity: 'high',
    reporterId: null,
    ownerId: 'me',
    status: 'open',
    source: 'manual',
    sourceId: null,
    dueDate: PAST,
    resolvedAt: null,
    rootCause: null,
    rootCauseCategory: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeException(overrides: Partial<Exception> = {}): Exception {
  return {
    id: 'exception-1',
    orgId: 'org1',
    userId: 'me',
    controlCode: 'AC-1',
    frameworkId: 'fw1',
    title: 'Overdue exception',
    statement: 'S',
    justification: 'J',
    ownerId: 'me',
    status: 'approved',
    expiresAt: PAST,
    riskId: null,
    reviewFrequencyDays: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeAssessment(overrides: Partial<Assessment> = {}): Assessment {
  return {
    id: 'assessment-1',
    assessmentCode: 'ASM-1',
    orgId: 'org1',
    userId: 'me',
    title: 'Overdue assessment',
    assessmentTypeId: 'type-1',
    ownerId: 'me',
    assetIds: [],
    vendorIds: [],
    dueDate: PAST,
    methodologyId: 'method-1',
    status: 'in_progress',
    itemCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const i18n = createIcoreI18n({ resources: ICORE_LOCALES });

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient();
  return (
    <QueryClientProvider client={qc}>
      <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>
    </QueryClientProvider>
  );
}

describe('MyWorkPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mockNavigate.mockClear();
    mockIssues = [];
    mockExceptions = [];
    mockAssessments = [];
    mockPendingValidations = [];
    mockPendingRenewals = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the empty state when nothing is overdue, due soon, or pending review', async () => {
    const { MyWorkPage } = await import('../-my-work.page');
    render(wrap(<MyWorkPage />));

    expect(screen.getByText(/all caught up/i)).toBeTruthy();
  });

  it('buckets an overdue issue into Overdue and a due-soon exception into Due Soon', async () => {
    mockIssues = [makeIssue({ id: 'i1', title: 'Overdue issue', dueDate: PAST })];
    mockExceptions = [makeException({ id: 'e1', title: 'Due soon exception', expiresAt: SOON })];
    const { MyWorkPage } = await import('../-my-work.page');
    render(wrap(<MyWorkPage />));

    expect(screen.getByText('Overdue issue')).toBeTruthy();
    expect(screen.getByText('Due soon exception')).toBeTruthy();
  });

  it('excludes items not due within the next 7 days', async () => {
    mockAssessments = [makeAssessment({ id: 'a1', title: 'Far future assessment', dueDate: FAR })];
    const { MyWorkPage } = await import('../-my-work.page');
    render(wrap(<MyWorkPage />));

    expect(screen.queryByText('Far future assessment')).toBeNull();
  });

  it('excludes items owned by someone else', async () => {
    mockIssues = [makeIssue({ id: 'i1', title: 'Someone else issue', ownerId: 'someone-else' })];
    const { MyWorkPage } = await import('../-my-work.page');
    render(wrap(<MyWorkPage />));

    expect(screen.queryByText('Someone else issue')).toBeNull();
  });

  it('includes an issue the user reported but does not own', async () => {
    mockIssues = [
      makeIssue({
        id: 'i1',
        title: 'Reported issue',
        ownerId: 'someone-else',
        reporterId: 'me',
      }),
    ];
    const { MyWorkPage } = await import('../-my-work.page');
    render(wrap(<MyWorkPage />));

    expect(screen.getByText('Reported issue')).toBeTruthy();
  });

  it('excludes closed issues even if overdue', async () => {
    mockIssues = [makeIssue({ id: 'i1', title: 'Closed overdue issue', status: 'closed' })];
    const { MyWorkPage } = await import('../-my-work.page');
    render(wrap(<MyWorkPage />));

    expect(screen.queryByText('Closed overdue issue')).toBeNull();
  });

  it('excludes rejected exceptions from due tracking', async () => {
    mockExceptions = [makeException({ id: 'e1', title: 'Rejected exception', status: 'rejected' })];
    const { MyWorkPage } = await import('../-my-work.page');
    render(wrap(<MyWorkPage />));

    expect(screen.queryByText('Rejected exception')).toBeNull();
  });

  it('lists a pending issue validation joined to its issue title', async () => {
    mockIssues = [makeIssue({ id: 'i1', title: 'Under review issue', dueDate: null })];
    mockPendingValidations = [
      {
        id: 'val-1',
        issueId: 'i1',
        orgId: 'org1',
        requestedBy: 'me',
        validatorId: 'validator-1',
        status: 'pending',
        reviewNotes: null,
        reviewedAt: null,
        createdAt: '2026-06-10T00:00:00.000Z',
      },
    ];
    const { MyWorkPage } = await import('../-my-work.page');
    render(wrap(<MyWorkPage />));

    expect(screen.getByText('Under review issue')).toBeTruthy();
  });

  it('navigates to the assessment detail route when an assessment row is clicked', async () => {
    mockAssessments = [makeAssessment({ id: 'a1', title: 'Overdue assessment' })];
    const { MyWorkPage } = await import('../-my-work.page');
    render(wrap(<MyWorkPage />));

    fireEvent.click(screen.getByText('Overdue assessment'));
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/assessments/$id',
      params: { id: 'a1' },
    });
  });

  it('navigates to the exceptions list with an open search param when an exception row is clicked', async () => {
    mockExceptions = [makeException({ id: 'e1', title: 'Overdue exception' })];
    const { MyWorkPage } = await import('../-my-work.page');
    render(wrap(<MyWorkPage />));

    fireEvent.click(screen.getByText('Overdue exception'));
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/exceptions',
      search: { open: 'e1' },
    });
  });
});
