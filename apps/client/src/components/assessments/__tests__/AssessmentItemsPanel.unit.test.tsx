import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createIcoreI18n, ICORE_LOCALES } from '@icore/template-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  AssessmentItem,
  RiskMethodology,
  InternalControl,
  AssessmentItemControlMapping,
  RequirementEvidence,
} from '@icore/shared';

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

let mockItems: AssessmentItem[] = [
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

let mockMappings: AssessmentItemControlMapping[] = [];
let mockEvidence: RequirementEvidence[] = [];

const mockCreateItemMutate = vi.fn();
const mockUpdateItemMutate = vi.fn();
const mockDeleteItemMutate = vi.fn();
const mockAddMappingMutate = vi.fn();
const mockRemoveMappingMutate = vi.fn();
const mockCreateEvidenceMutate = vi.fn();

vi.mock('@/queries/assessments', () => ({
  useAssessmentItems: () => ({ data: mockItems }),
  useCreateAssessmentItem: () => ({ mutate: mockCreateItemMutate, isPending: false }),
  useUpdateAssessmentItem: () => ({ mutate: mockUpdateItemMutate, isPending: false }),
  useDeleteAssessmentItem: () => ({ mutate: mockDeleteItemMutate, isPending: false }),
  useAssessmentItemControlMappings: () => ({ data: mockMappings }),
  useAddAssessmentItemControlMapping: () => ({ mutate: mockAddMappingMutate, isPending: false }),
  useRemoveAssessmentItemControlMapping: () => ({
    mutate: mockRemoveMappingMutate,
    isPending: false,
  }),
  useAssessmentItemEvidence: () => ({ data: mockEvidence }),
  useCreateAssessmentItemEvidence: () => ({ mutate: mockCreateEvidenceMutate, isPending: false }),
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

async function renderPanel() {
  const { AssessmentItemsPanel } = await import('../AssessmentItemsPanel');
  const utils = render(wrap(<AssessmentItemsPanel orgId="org1" assessmentId="a1" />));
  return {
    ...utils,
    rerenderPanel: () =>
      utils.rerender(wrap(<AssessmentItemsPanel orgId="org1" assessmentId="a1" />)),
  };
}

describe('AssessmentItemsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockItems = [
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
    mockMappings = [];
    mockEvidence = [];
  });

  it('renders item rows and expands to show AssessmentItemControls', async () => {
    await renderPanel();

    expect(screen.getByText('Unpatched endpoints')).toBeDefined();
    expect(screen.queryByText('Linked Controls')).toBeNull();

    fireEvent.click(screen.getByText('Unpatched endpoints'));

    expect(screen.getByText('Linked Controls')).toBeDefined();
    expect(screen.getByText('Select a control…')).toBeDefined();
  });

  it('blocks Add Item submission without likelihood/impact selected', async () => {
    await renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Add Item' }));

    const dialog = screen.getByRole('dialog');
    // The Subject Label isn't associated via htmlFor/id, so select the input directly.
    const [subjectInput] = dialog.querySelectorAll('input');
    fireEvent.change(subjectInput, {
      target: { value: 'New risk item' },
    });
    // likelihood and impact left unselected

    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Item' }));

    expect(mockCreateItemMutate).not.toHaveBeenCalled();
  });

  it('submits Add Item with likelihood and impact selected', async () => {
    await renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Add Item' }));

    const dialog = screen.getByRole('dialog');
    const [likelihoodSelect, impactSelect] = within(dialog).getAllByRole('combobox');
    const [subjectInput] = dialog.querySelectorAll('input');

    fireEvent.change(subjectInput, {
      target: { value: 'New risk item' },
    });
    fireEvent.change(likelihoodSelect, { target: { value: '3' } });
    fireEvent.change(impactSelect, { target: { value: '4' } });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Item' }));

    expect(mockCreateItemMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'New risk item',
        inherentLikelihood: 3,
        inherentImpact: 4,
      }),
      expect.any(Object),
    );
  });

  it('expanding an item shows the evidence section', async () => {
    await renderPanel();

    fireEvent.click(screen.getByText('Unpatched endpoints'));

    expect(screen.getByText('Evidence')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Add Evidence' })).toBeDefined();
  });

  it('renders existing evidence for the expanded item', async () => {
    mockEvidence = [
      {
        id: 'ev-1',
        assessmentItemId: 'item-1',
        title: 'SOC2 Report',
        owner: 'Dana',
        evidenceType: 'document',
        source: 'vendor portal',
        collectionDate: '2026-01-01',
        periodCovered: '2025',
        expirationDate: '2027-01-01',
        verificationStatus: 'verified',
        url: 'https://example.com/soc2',
      },
    ];
    await renderPanel();

    fireEvent.click(screen.getByText('Unpatched endpoints'));

    expect(screen.getByText('SOC2 Report')).toBeDefined();
    expect(screen.getByText('verified')).toBeDefined();
  });

  it('requires a title before adding evidence, url is optional', async () => {
    await renderPanel();

    fireEvent.click(screen.getByText('Unpatched endpoints'));
    fireEvent.click(screen.getByRole('button', { name: 'Add Evidence' }));

    const submitButton = screen.getByRole('button', { name: 'Add Evidence' });
    expect(submitButton).toHaveProperty('disabled', true);

    const titleInput = screen.getByPlaceholderText('Evidence title…');
    fireEvent.change(titleInput, { target: { value: 'New Evidence' } });

    expect(submitButton).toHaveProperty('disabled', false);

    fireEvent.click(submitButton);

    expect(mockCreateEvidenceMutate).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'New Evidence', url: '' }),
      expect.any(Object),
    );
  });

  it('re-scores a single residual field after both fields have already persisted', async () => {
    mockMappings = [
      {
        id: 'map-1',
        itemId: 'item-1',
        controlId: 'c1',
        controlCode: 'IAM-001',
        controlTitle: 'Access Review',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ];
    const { rerenderPanel } = await renderPanel();

    fireEvent.click(screen.getByText('Unpatched endpoints'));

    const [, likelihoodSelect, impactSelect] = screen.getAllByRole('combobox');

    fireEvent.change(likelihoodSelect, { target: { value: '3' } });
    fireEvent.change(impactSelect, { target: { value: '4' } });

    expect(mockUpdateItemMutate).toHaveBeenCalledTimes(1);
    expect(mockUpdateItemMutate).toHaveBeenLastCalledWith(
      { id: 'item-1', patch: { residualLikelihood: 3, residualImpact: 4 } },
      expect.any(Object),
    );

    // Simulate the mutation succeeding, then the query refetch (which the real
    // useUpdateAssessmentItem hook triggers via invalidateQueries) landing the
    // persisted values back on the item.
    const [, firstOptions] = mockUpdateItemMutate.mock.calls[0];
    act(() => firstOptions.onSuccess());
    mockItems = [{ ...mockItems[0], residualLikelihood: 3, residualImpact: 4 }];
    rerenderPanel();

    fireEvent.change(screen.getAllByRole('combobox')[2], { target: { value: '5' } });

    expect(mockUpdateItemMutate).toHaveBeenCalledTimes(2);
    expect(mockUpdateItemMutate).toHaveBeenLastCalledWith(
      { id: 'item-1', patch: { residualLikelihood: 3, residualImpact: 5 } },
      expect.any(Object),
    );
  });
});
