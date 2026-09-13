import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createIcoreI18n, ICORE_LOCALES } from '@icore/template-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Assessment, AssessmentType } from '@icore/shared';

// Mock ResizeObserver which cmdk (used by Combobox) requires
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

// Mock scrollIntoView which cmdk uses
Element.prototype.scrollIntoView = vi.fn();

const mockNavigate = vi.fn();

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

let mockCurrentUserId = 'Alice';
const mockNotifyError = vi.fn();
const mockNotifySuccess = vi.fn();

vi.mock('@icore/template-shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@icore/template-shared')>();
  return {
    ...actual,
    useAuthStore: (selector: (s: { user: { id: string; email: string } }) => unknown) =>
      selector({ user: { id: mockCurrentUserId, email: 'user@example.com' } }),
    useNotify: () => ({
      success: mockNotifySuccess,
      error: mockNotifyError,
      info: vi.fn(),
      warning: vi.fn(),
    }),
  };
});

vi.mock('@/stores/active-org', () => ({
  useActiveOrgStore: () => ({ activeOrgId: 'org1' }),
}));

vi.mock('@/queries/assets', () => ({
  useAssets: () => ({ data: [] }),
}));

vi.mock('@/queries/vendors', () => ({
  useVendors: () => ({ data: [] }),
}));

vi.mock('@/queries/org-members', () => ({
  useOrgMembers: () => ({
    data: [
      { userId: 'Alice', displayName: 'Alice', email: 'alice@x.com', role: 'owner' },
      { userId: 'Erin', displayName: 'Erin', email: 'erin@x.com', role: 'member' },
    ],
  }),
}));

const mockTypes: AssessmentType[] = [
  {
    id: 'type-1',
    orgId: 'org1',
    name: 'Vendor Risk Assessment',
    itemNounSingular: 'Risk',
    itemNounPlural: 'Risks',
    archived: false,
    createdAt: '2026-01-01T00:00:00Z',
  },
];

const mockCreateTypeMutate = vi.fn();
const mockArchiveTypeMutate = vi.fn();

vi.mock('@/queries/assessment-types', () => ({
  useAssessmentTypes: () => ({ data: mockTypes }),
  useCreateAssessmentType: () => ({ mutate: mockCreateTypeMutate, isPending: false }),
  useArchiveAssessmentType: () => ({ mutate: mockArchiveTypeMutate, isPending: false }),
}));

function buildAssessment(overrides: Partial<Assessment> = {}): Assessment {
  return {
    id: 'a1',
    assessmentCode: 'ASMT-001',
    orgId: 'org1',
    userId: 'user1',
    title: 'Q1 Vendor Review',
    assessmentTypeId: 'type-1',
    ownerId: 'Alice',
    assetIds: [],
    vendorIds: [],
    methodologyId: 'method-1',
    status: 'in_progress',
    itemCount: 2,
    highestInherentScore: 16,
    highestInherentLabel: 'critical',
    highestResidualScore: 6,
    highestResidualLabel: 'medium',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const mockAssessments: Assessment[] = [
  buildAssessment({
    id: 'a1',
    assessmentCode: 'ASMT-001',
    title: 'Q1 Vendor Review',
    ownerId: 'Alice',
    status: 'in_progress',
  }),
  buildAssessment({
    id: 'a2',
    assessmentCode: 'ASMT-002',
    title: 'Annual Cyber Assessment',
    ownerId: 'Bob',
    status: 'pending_review',
    dueDate: '2099-01-01T00:00:00Z',
    highestInherentScore: 9,
    highestInherentLabel: 'high',
    highestResidualScore: 4,
    highestResidualLabel: 'low',
  }),
  buildAssessment({
    id: 'a3',
    assessmentCode: 'ASMT-003',
    title: 'Retired Assessment',
    ownerId: 'Carol',
    status: 'archived',
    dueDate: '2020-01-01T00:00:00Z',
  }),
  buildAssessment({
    id: 'a4',
    assessmentCode: 'ASMT-004',
    title: 'Overdue Assessment',
    ownerId: 'Alice',
    status: 'draft',
    dueDate: '2020-01-01T00:00:00Z',
    highestInherentScore: undefined,
    highestInherentLabel: undefined,
    highestResidualScore: undefined,
    highestResidualLabel: undefined,
  }),
];

const mockCreateMutate = vi.fn();
const mockDeleteMutate = vi.fn();

vi.mock('@/queries/assessments', () => ({
  useAssessments: () => ({ data: mockAssessments, isPending: false }),
  useCreateAssessment: () => ({ mutate: mockCreateMutate, isPending: false }),
  useDeleteAssessment: () => ({ mutate: mockDeleteMutate, isPending: false }),
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

async function renderAssessmentsPage() {
  const { AssessmentsPage } = await import('../-assessments.page');
  render(wrap(<AssessmentsPage />));
}

describe('AssessmentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentUserId = 'Alice';
  });

  it('renders the KPI summary line with correct counts', async () => {
    await renderAssessmentsPage();

    // active (non-archived) = a1, a2, a4 = 3; pendingReview = a2 = 1; overdue (dueDate in past) = a4 = 1
    expect(screen.getByText(/3 Active Assessments/)).toBeDefined();
    expect(screen.getByText(/1 Pending Review/)).toBeDefined();
    expect(screen.getByText(/1 Overdue/)).toBeDefined();
  });

  it('renders assessment rows with code/title/type/owner/inherent/residual/status', async () => {
    await renderAssessmentsPage();

    const row = screen.getByText('ASMT-001').closest('tr') as HTMLElement;
    expect(within(row).getByText('Q1 Vendor Review')).toBeDefined();
    expect(within(row).getByText('Vendor Risk Assessment')).toBeDefined();
    expect(within(row).getByText('Alice')).toBeDefined();
    expect(within(row).getByText('16')).toBeDefined();
    expect(within(row).getByText('6')).toBeDefined();
    expect(within(row).getByText('In Progress')).toBeDefined();
  });

  it('opens the create Dialog when clicking New Assessment', async () => {
    await renderAssessmentsPage();

    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'New Assessment' }));
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('submits the create form with valid required fields', async () => {
    await renderAssessmentsPage();

    fireEvent.click(screen.getByRole('button', { name: 'New Assessment' }));
    const dialog = screen.getByRole('dialog');

    // Combobox order in the dialog = Type (native select), Owner, Approver.
    const [typeSelect, ownerCombobox] = within(dialog).getAllByRole('combobox');

    fireEvent.change(within(dialog).getByLabelText('Title'), {
      target: { value: 'New Vendor Assessment' },
    });
    fireEvent.change(typeSelect, { target: { value: 'type-1' } });
    fireEvent.click(ownerCombobox);
    fireEvent.click(screen.getByText('Erin'));

    fireEvent.click(within(dialog).getByRole('button', { name: 'New Assessment' }));

    expect(mockCreateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'New Vendor Assessment',
        assessmentTypeId: 'type-1',
        ownerId: 'Erin',
      }),
      expect.any(Object),
    );
  });

  it('blocks submission when title, type, or owner are missing', async () => {
    await renderAssessmentsPage();

    fireEvent.click(screen.getByRole('button', { name: 'New Assessment' }));
    const dialog = screen.getByRole('dialog');

    fireEvent.change(within(dialog).getByLabelText('Title'), {
      target: { value: 'New Vendor Assessment' },
    });
    // type and owner left unset

    fireEvent.click(within(dialog).getByRole('button', { name: 'New Assessment' }));

    expect(mockCreateMutate).not.toHaveBeenCalled();
  });

  it('navigates to the detail route when a row is clicked', async () => {
    await renderAssessmentsPage();

    fireEvent.click(screen.getByText('ASMT-001'));

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/assessments/$id',
      params: { id: 'a1' },
    });
  });

  it('only renders the delete button for draft assessments owned by the current user', async () => {
    await renderAssessmentsPage();

    // Only a4 (draft, owned by Alice) should show a delete button.
    expect(screen.getAllByText('Delete')).toHaveLength(1);
    const row = screen.getByText('ASMT-004').closest('tr') as HTMLElement;
    expect(within(row).getByText('Delete')).toBeDefined();
  });

  it('opens the delete AlertDialog and confirming calls the delete mutation', async () => {
    await renderAssessmentsPage();

    const [deleteButton] = screen.getAllByText('Delete');
    fireEvent.click(deleteButton);

    const alertDialog = screen.getByRole('alertdialog');
    expect(alertDialog).toBeDefined();

    fireEvent.click(within(alertDialog).getByRole('button', { name: 'Delete' }));

    expect(mockDeleteMutate).toHaveBeenCalledWith('a4', expect.any(Object));
  });

  it('does not navigate the row when the delete button is clicked (stopPropagation)', async () => {
    await renderAssessmentsPage();

    const [deleteButton] = screen.getAllByText('Delete');
    fireEvent.click(deleteButton);

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows an error toast when the delete mutation fails', async () => {
    mockDeleteMutate.mockImplementation((_id, opts) => {
      opts?.onError?.();
    });
    await renderAssessmentsPage();

    const [deleteButton] = screen.getAllByText('Delete');
    fireEvent.click(deleteButton);

    const alertDialog = screen.getByRole('alertdialog');
    fireEvent.click(within(alertDialog).getByRole('button', { name: 'Delete' }));

    expect(mockNotifyError).toHaveBeenCalled();
  });
});
