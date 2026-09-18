import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createIcoreI18n, ICORE_LOCALES } from '@icore/template-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  Assessment,
  AssessmentItem,
  AssessmentType,
  RiskMethodology,
  InternalControl,
  AssessmentItemControlMapping,
} from '@icore/shared';

const mockNavigate = vi.fn();

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useParams: () => ({ id: 'a1' }),
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/stores/active-org', () => ({
  useActiveOrgStore: () => ({ activeOrgId: 'org1' }),
}));

let mockCurrentUserId = 'Alice';

vi.mock('@icore/template-shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@icore/template-shared')>();
  return {
    ...actual,
    useAuthStore: (selector: (s: { user: { id: string; email: string } }) => unknown) =>
      selector({ user: { id: mockCurrentUserId, email: 'user@example.com' } }),
  };
});

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

vi.mock('@/queries/assessment-types', () => ({
  useAssessmentTypes: () => ({ data: mockTypes }),
}));

const mockMethodology: RiskMethodology = {
  id: 'method-1',
  orgId: 'org1',
  version: 1,
  isActive: true,
  scaleSize: 5,
  likelihoodLabels: ['Very Low', 'Low', 'Medium', 'High', 'Very High'],
  impactLabels: ['Very Low', 'Low', 'Medium', 'High', 'Very High'],
  thresholds: [
    { maxScore: 5, label: 'low' },
    { maxScore: 10, label: 'medium' },
    { maxScore: 15, label: 'high' },
    { maxScore: 25, label: 'critical' },
  ],
  appetiteThreshold: 10,
  createdAt: '2026-01-01T00:00:00Z',
};

vi.mock('@/queries/risks', () => ({
  useRiskMethodology: () => ({ data: mockMethodology }),
  useRiskTaxonomy: () => ({ data: [] }),
  useRisks: () => ({ data: [] }),
  useRisk: () => ({ data: undefined }),
  useUpdateRisk: () => ({ mutate: vi.fn(), isPending: false }),
}));

const mockControls: InternalControl[] = [
  {
    id: 'c1',
    orgId: 'org1',
    code: 'IAM-001',
    title: 'Access Review',
    description: 'Quarterly access review',
    owner: 'Dana',
  },
];

vi.mock('@/queries/controls', () => ({
  useInternalControlsList: () => ({ data: mockControls }),
}));

vi.mock('@/queries/org-members', () => ({
  useOrgMembers: () => ({
    data: [
      { userId: 'Alice', displayName: 'Alice', email: 'alice@x.com', role: 'owner' },
      { userId: 'Carol', displayName: 'Carol', email: 'carol@x.com', role: 'member' },
    ],
  }),
}));

let mockAssessment: Assessment = {
  id: 'a1',
  assessmentCode: 'ASMT-001',
  orgId: 'org1',
  userId: 'user1',
  title: 'Q1 Vendor Review',
  assessmentTypeId: 'type-1',
  ownerId: 'Alice',
  businessUnit: 'Procurement',
  approverId: 'Carol',
  assetIds: [],
  vendorIds: [],
  methodologyId: 'method-1',
  status: 'draft',
  itemCount: 1,
  highestInherentScore: 16,
  highestInherentLabel: 'critical',
  highestResidualScore: 6,
  highestResidualLabel: 'medium',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const mockItems: AssessmentItem[] = [
  {
    id: 'item-1',
    assessmentId: 'a1',
    orgId: 'org1',
    subject: 'Unpatched endpoints',
    description: 'Several endpoints missing critical patches',
    inherentLikelihood: 4,
    inherentImpact: 4,
    inherentScore: 16,
    inherentLabel: 'critical',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

const mockMappings: AssessmentItemControlMapping[] = [];

const mockStartMutate = vi.fn();
const mockSubmitMutate = vi.fn();
const mockApproveMutate = vi.fn();
const mockRequestChangesMutate = vi.fn();
const mockCompleteMutate = vi.fn();
const mockArchiveMutate = vi.fn();
const mockCreateItemMutate = vi.fn();
const mockUpdateItemMutate = vi.fn();
const mockDeleteItemMutate = vi.fn();
const mockReassignApproverMutate = vi.fn();

vi.mock('@/queries/assessments', () => ({
  useAssessment: () => ({ data: mockAssessment, isPending: false }),
  useAssessmentItems: () => ({ data: mockItems }),
  useCreateAssessmentItem: () => ({ mutate: mockCreateItemMutate, isPending: false }),
  useUpdateAssessmentItem: () => ({ mutate: mockUpdateItemMutate, isPending: false }),
  useDeleteAssessmentItem: () => ({ mutate: mockDeleteItemMutate, isPending: false }),
  useStartAssessment: () => ({ mutate: mockStartMutate, isPending: false }),
  useSubmitForReview: () => ({ mutate: mockSubmitMutate, isPending: false }),
  useApproveAssessment: () => ({ mutate: mockApproveMutate, isPending: false }),
  useRequestChanges: () => ({ mutate: mockRequestChangesMutate, isPending: false }),
  useCompleteAssessment: () => ({ mutate: mockCompleteMutate, isPending: false }),
  useArchiveAssessment: () => ({ mutate: mockArchiveMutate, isPending: false }),
  useReassignAssessmentApprover: () => ({ mutate: mockReassignApproverMutate, isPending: false }),
  useAssessmentItemControlMappings: () => ({ data: mockMappings }),
  useAssessmentItemEvidence: () => ({ data: [] }),
  useCreateAssessmentItemEvidence: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateRiskFromAssessmentItem: () => ({ mutate: vi.fn(), isPending: false }),
  useLinkAssessmentItemToRisk: () => ({ mutate: vi.fn(), isPending: false }),
  useUnlinkAssessmentItemFromRisk: () => ({ mutate: vi.fn(), isPending: false }),
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

async function renderDetailPage() {
  const { AssessmentDetailPage } = await import('../-assessment-detail.page');
  render(wrap(<AssessmentDetailPage />));
}

describe('AssessmentDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentUserId = 'Alice';
    mockAssessment = {
      ...mockAssessment,
      status: 'draft',
      ownerId: 'Alice',
      approverId: 'Carol',
    };
  });

  it('renders Overview tab fields from the fixture assessment', async () => {
    await renderDetailPage();

    expect(screen.getByText('ASMT-001')).toBeDefined();
    expect(screen.getByText('Q1 Vendor Review')).toBeDefined();
    expect(screen.getByText('Vendor Risk Assessment')).toBeDefined();
    expect(screen.getByText('Alice')).toBeDefined();
    expect(screen.getByText('Procurement')).toBeDefined();
    expect(screen.getByText('Carol')).toBeDefined();
    expect(screen.getByText('16')).toBeDefined();
    expect(screen.getByText('6')).toBeDefined();
    expect(screen.getByText('Draft')).toBeDefined();
  });

  it('shows Start for a draft assessment when current user is the owner', async () => {
    mockCurrentUserId = 'Alice';
    mockAssessment = { ...mockAssessment, status: 'draft', ownerId: 'Alice' };
    await renderDetailPage();

    const startButton = screen.getByRole('button', { name: 'Start' });
    fireEvent.click(startButton);
    expect(mockStartMutate).toHaveBeenCalled();
  });

  it('hides Start for a draft assessment when current user is not the owner', async () => {
    mockCurrentUserId = 'Someone Else';
    mockAssessment = { ...mockAssessment, status: 'draft', ownerId: 'Alice' };
    await renderDetailPage();

    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
  });

  it('shows Submit for Review for in_progress owner and calls the mutation', async () => {
    mockCurrentUserId = 'Alice';
    mockAssessment = { ...mockAssessment, status: 'in_progress', ownerId: 'Alice' };
    await renderDetailPage();

    fireEvent.click(screen.getByRole('button', { name: 'Submit for Review' }));
    expect(mockSubmitMutate).toHaveBeenCalled();
  });

  it('shows Approve/Request Changes only for pending_review AND matching approver', async () => {
    mockCurrentUserId = 'Carol';
    mockAssessment = { ...mockAssessment, status: 'pending_review', approverId: 'Carol' };
    await renderDetailPage();

    expect(screen.getByRole('button', { name: 'Approve' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Request Changes' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(mockApproveMutate).toHaveBeenCalled();
  });

  it('hides Approve/Request Changes when current user is not the approver', async () => {
    mockCurrentUserId = 'NotTheApprover';
    mockAssessment = { ...mockAssessment, status: 'pending_review', approverId: 'Carol' };
    await renderDetailPage();

    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Request Changes' })).toBeNull();
  });

  it('shows Complete for an approved assessment owner and calls the mutation', async () => {
    mockCurrentUserId = 'Alice';
    mockAssessment = { ...mockAssessment, status: 'approved', ownerId: 'Alice' };
    await renderDetailPage();

    fireEvent.click(screen.getByRole('button', { name: 'Complete' }));
    expect(mockCompleteMutate).toHaveBeenCalled();
  });

  it('shows Archive for a completed assessment owner and calls the mutation', async () => {
    mockCurrentUserId = 'Alice';
    mockAssessment = { ...mockAssessment, status: 'completed', ownerId: 'Alice' };
    await renderDetailPage();

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(mockArchiveMutate).toHaveBeenCalled();
  });

  it('renders AssessmentItemsPanel when the Items tab is active', async () => {
    await renderDetailPage();

    expect(screen.queryByText('Unpatched endpoints')).toBeNull();

    fireEvent.click(screen.getByText('Items'));

    // AssessmentItemsPanel's internals (expand, link control, residual scoring,
    // delete, evidence) are covered by AssessmentItemsPanel.unit.test.tsx.
    expect(screen.getByText('Unpatched endpoints')).toBeDefined();
  });

  it('shows a reassign control next to the Approver field for a manager', async () => {
    mockAssessment = { ...mockAssessment, status: 'pending_review', approverId: 'Carol' };
    await renderDetailPage();
    expect(screen.getByRole('button', { name: /reassign approver/i })).toBeDefined();
  });
});
