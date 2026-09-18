import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createIcoreI18n, ICORE_LOCALES } from '@icore/template-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Assessment, AssessmentItem, AssessmentType } from '@icore/shared';

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
const mockNotify = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
};

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
    useNotify: () => mockNotify,
  };
});

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
      { userId: 'Carol', displayName: 'Carol', email: 'carol@x.com', role: 'member' },
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

vi.mock('@/queries/assessment-types', () => ({
  useAssessmentTypes: () => ({ data: mockTypes }),
}));

vi.mock('@/queries/risks', () => ({
  useRiskMethodology: () => ({ data: undefined }),
  useRiskTaxonomy: () => ({ data: [] }),
  useRisks: () => ({ data: [] }),
  useRisk: () => ({ data: undefined }),
  useUpdateRisk: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/queries/controls', () => ({
  useInternalControlsList: () => ({ data: [] }),
}));

const createdAssessment: Assessment = {
  id: 'a1',
  assessmentCode: 'ASMT-001',
  orgId: 'org1',
  userId: 'user1',
  title: 'New Vendor Assessment',
  assessmentTypeId: 'type-1',
  ownerId: 'Alice',
  assetIds: [],
  vendorIds: [],
  methodologyId: 'method-1',
  status: 'draft',
  itemCount: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const oneItemFixture: AssessmentItem = {
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
};

let mockItems: AssessmentItem[] = [];

const mockCreateMutate = vi.fn((_data: unknown, opts?: { onSuccess?: (a: Assessment) => void }) => {
  opts?.onSuccess?.(createdAssessment);
});
const mockUpdateMutate = vi.fn();
const mockCreateItemMutate = vi.fn();
const mockUpdateItemMutate = vi.fn();
const mockDeleteItemMutate = vi.fn();
const mockAddMappingMutate = vi.fn();
const mockRemoveMappingMutate = vi.fn();
const mockCreateEvidenceMutate = vi.fn();
const mockSubmitMutate = vi.fn();

vi.mock('@/queries/assessments', () => ({
  useCreateAssessment: () => ({ mutate: mockCreateMutate, isPending: false }),
  useUpdateAssessment: () => ({ mutate: mockUpdateMutate, isPending: false }),
  useAssessmentItems: () => ({ data: mockItems }),
  useCreateAssessmentItem: () => ({ mutate: mockCreateItemMutate, isPending: false }),
  useUpdateAssessmentItem: () => ({ mutate: mockUpdateItemMutate, isPending: false }),
  useDeleteAssessmentItem: () => ({ mutate: mockDeleteItemMutate, isPending: false }),
  useAssessmentItemControlMappings: () => ({ data: [] }),
  useAddAssessmentItemControlMapping: () => ({ mutate: mockAddMappingMutate, isPending: false }),
  useRemoveAssessmentItemControlMapping: () => ({
    mutate: mockRemoveMappingMutate,
    isPending: false,
  }),
  useAssessmentItemEvidence: () => ({ data: [] }),
  useCreateAssessmentItemEvidence: () => ({ mutate: mockCreateEvidenceMutate, isPending: false }),
  useSubmitForReview: () => ({ mutate: mockSubmitMutate, isPending: false }),
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

const mockOnOpenChange = vi.fn();

async function renderWizard() {
  const { AssessmentWizard } = await import('../AssessmentWizard');
  render(wrap(<AssessmentWizard orgId="org1" open onOpenChange={mockOnOpenChange} />));
}

function fillDetailsRequiredFields() {
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'New Vendor Assessment' },
  });

  const [typeSelect] = screen.getAllByRole('combobox');
  fireEvent.change(typeSelect, { target: { value: 'type-1' } });

  const ownerCombobox = screen.getAllByRole('combobox')[1];
  fireEvent.click(ownerCombobox);
  fireEvent.click(screen.getByText('Alice'));
}

describe('AssessmentWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockItems = [];
  });

  it('disables Next on Details until title, type, and owner are filled', async () => {
    await renderWizard();

    expect(screen.getByRole('button', { name: 'Next' })).toHaveProperty('disabled', true);

    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'New Vendor Assessment' },
    });
    expect(screen.getByRole('button', { name: 'Next' })).toHaveProperty('disabled', true);

    const [typeSelect] = screen.getAllByRole('combobox');
    fireEvent.change(typeSelect, { target: { value: 'type-1' } });
    expect(screen.getByRole('button', { name: 'Next' })).toHaveProperty('disabled', true);

    const ownerCombobox = screen.getAllByRole('combobox')[1];
    fireEvent.click(ownerCombobox);
    fireEvent.click(screen.getByText('Alice'));

    expect(screen.getByRole('button', { name: 'Next' })).toHaveProperty('disabled', false);
  });

  it('calls useCreateAssessment on Details Next and advances to the Items step', async () => {
    await renderWizard();
    fillDetailsRequiredFields();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(mockCreateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'New Vendor Assessment',
        assessmentTypeId: 'type-1',
        ownerId: 'Alice',
      }),
      expect.any(Object),
    );
    expect(screen.getByRole('button', { name: 'Add Item' })).toBeDefined();
  });

  it('disables the Items step Next button when there are zero items', async () => {
    mockItems = [];
    await renderWizard();
    fillDetailsRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByRole('button', { name: 'Next' })).toHaveProperty('disabled', true);
    expect(screen.getByText('Add at least one item to continue')).toBeDefined();
  });

  it('enables the Items step Next button when there is at least one item', async () => {
    mockItems = [oneItemFixture];
    await renderWizard();
    fillDetailsRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByRole('button', { name: 'Next' })).toHaveProperty('disabled', false);
  });

  it('returns to Details from Items without creating the assessment again', async () => {
    mockItems = [oneItemFixture];
    await renderWizard();
    fillDetailsRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(mockCreateMutate).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(
      screen.getByText(
        'Type, owner, and approver cannot be changed after the assessment is created.',
      ),
    ).toBeDefined();
    expect(mockCreateMutate).toHaveBeenCalledTimes(1);
  });

  it('renders items from the fixture on the Review step', async () => {
    mockItems = [oneItemFixture];
    await renderWizard();
    fillDetailsRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // -> items
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // -> review

    expect(screen.getByText('Unpatched endpoints')).toBeDefined();
    expect(screen.getByText('Inherent: 16 (critical)')).toBeDefined();
  });

  it('finishes by closing and navigating to the detail route, without submitting for review', async () => {
    mockItems = [oneItemFixture];
    await renderWizard();
    fillDetailsRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // -> items
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // -> review

    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/assessments/$id',
      params: { id: 'a1' },
    });
    expect(mockSubmitMutate).not.toHaveBeenCalled();
  });

  it('shows an error notification when creating the assessment fails', async () => {
    mockCreateMutate.mockImplementationOnce((_data: unknown, opts?: { onError?: () => void }) => {
      opts?.onError?.();
    });
    await renderWizard();
    fillDetailsRequiredFields();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(mockNotify.error).toHaveBeenCalledWith('Something went wrong.');
    expect(screen.queryByRole('button', { name: 'Add Item' })).toBeNull();
  });

  it('shows an error notification and stays on Details when revisiting Details update fails', async () => {
    mockItems = [oneItemFixture];
    await renderWizard();
    fillDetailsRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // creates -> items
    fireEvent.click(screen.getByRole('button', { name: 'Back' })); // -> details

    mockUpdateMutate.mockImplementationOnce((_data: unknown, opts?: { onError?: () => void }) => {
      opts?.onError?.();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(mockNotify.error).toHaveBeenCalledWith('Something went wrong.');
    expect(screen.queryByRole('button', { name: 'Add Item' })).toBeNull();
  });
});
