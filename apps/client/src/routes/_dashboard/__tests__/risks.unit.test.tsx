import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createIcoreI18n, ICORE_LOCALES } from '@icore/template-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Risk, RiskMethodology, RiskTaxonomyCategory } from '@icore/shared';

// ScrollableRow (wraps the filter row) requires ResizeObserver, which jsdom does not implement.
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

const mockNavigate = vi.fn();

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
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

const mockTaxonomy: RiskTaxonomyCategory[] = [
  {
    id: 'cat-1',
    orgId: 'org1',
    name: 'Cyber Security',
    archived: false,
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'cat-2',
    orgId: 'org1',
    name: 'Operational',
    archived: false,
    createdAt: '2026-01-01T00:00:00Z',
  },
];

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

function buildRisk(overrides: Partial<Risk> = {}): Risk {
  return {
    id: 'r1',
    riskId: 'RISK-001',
    orgId: 'org1',
    userId: 'user1',
    title: 'Ransomware exposure',
    riskStatement: 'Because of unpatched systems, ransomware could occur.',
    taxonomyCategoryId: 'cat-1',
    ownerId: 'Alice',
    source: 'manual',
    assetIds: [],
    vendorIds: [],
    methodologyId: 'method-1',
    inherentLikelihood: 4,
    inherentImpact: 4,
    inherentScore: 16,
    inherentLabel: 'critical',
    status: 'open',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const mockRisks: Risk[] = [
  buildRisk({
    id: 'r1',
    riskId: 'RISK-001',
    title: 'Ransomware exposure',
    taxonomyCategoryId: 'cat-1',
    ownerId: 'Alice',
    inherentLikelihood: 4,
    inherentImpact: 4,
    inherentScore: 16,
    inherentLabel: 'critical',
    aboveAppetite: true,
    status: 'open',
  }),
  buildRisk({
    id: 'r2',
    riskId: 'RISK-002',
    title: 'Vendor data leak',
    taxonomyCategoryId: 'cat-2',
    ownerId: 'Bob',
    inherentLikelihood: 3,
    inherentImpact: 3,
    inherentScore: 9,
    inherentLabel: 'high',
    aboveAppetite: false,
    status: 'monitoring',
  }),
  buildRisk({
    id: 'r3',
    riskId: 'RISK-003',
    title: 'Office flooding',
    taxonomyCategoryId: 'cat-2',
    ownerId: 'Alice',
    inherentLikelihood: 1,
    inherentImpact: 2,
    inherentScore: 2,
    inherentLabel: 'low',
    aboveAppetite: false,
    status: 'closed',
  }),
];

const mockCreateMutate = vi.fn();
const mockDeleteMutate = vi.fn();

vi.mock('@/queries/risks', () => ({
  useRisks: () => ({ data: mockRisks, isPending: false }),
  useRiskMethodology: () => ({ data: mockMethodology }),
  useRiskTaxonomy: () => ({ data: mockTaxonomy }),
  useCreateRisk: () => ({ mutate: mockCreateMutate, isPending: false }),
  useDeleteRisk: () => ({ mutate: mockDeleteMutate, isPending: false }),
  useUpsertRiskMethodology: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateRiskTaxonomyCategory: () => ({ mutate: vi.fn(), isPending: false }),
  useArchiveRiskTaxonomyCategory: () => ({ mutate: vi.fn(), isPending: false }),
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

async function renderRisksPage() {
  const { RisksPage } = await import('../-risks.page');
  render(wrap(<RisksPage />));
}

describe('RisksPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the KPI summary line with correct counts', async () => {
    await renderRisksPage();

    // active (non-closed) = r1, r2 = 2; critical = r1 = 1; high = r2 = 1; aboveAppetite = r1 = 1
    expect(screen.getByText(/2 Active Risks/)).toBeDefined();
    expect(screen.getByText(/1 Critical/)).toBeDefined();
    expect(screen.getByText(/1 High/)).toBeDefined();
    expect(screen.getByText(/1 Above Appetite/)).toBeDefined();
  });

  it('narrows the table via the category filter', async () => {
    await renderRisksPage();

    expect(screen.getByText('RISK-001')).toBeDefined();
    expect(screen.getByText('RISK-002')).toBeDefined();
    expect(screen.getByText('RISK-003')).toBeDefined();

    const [categorySelect] = screen.getAllByRole('combobox');
    fireEvent.change(categorySelect, { target: { value: 'cat-1' } });

    expect(screen.getByText('RISK-001')).toBeDefined();
    expect(screen.queryByText('RISK-002')).toBeNull();
    expect(screen.queryByText('RISK-003')).toBeNull();
  });

  it('narrows the table via the owner filter', async () => {
    await renderRisksPage();

    const [, ownerSelect] = screen.getAllByRole('combobox');
    fireEvent.change(ownerSelect, { target: { value: 'Bob' } });

    expect(screen.queryByText('RISK-001')).toBeNull();
    expect(screen.getByText('RISK-002')).toBeDefined();
    expect(screen.queryByText('RISK-003')).toBeNull();
  });

  it('narrows the table via the status filter', async () => {
    await renderRisksPage();

    const [, , statusSelect] = screen.getAllByRole('combobox');
    fireEvent.change(statusSelect, { target: { value: 'closed' } });

    expect(screen.queryByText('RISK-001')).toBeNull();
    expect(screen.queryByText('RISK-002')).toBeNull();
    expect(screen.getByText('RISK-003')).toBeDefined();
  });

  it('narrows the table with the above-appetite-only filter', async () => {
    await renderRisksPage();

    fireEvent.click(screen.getByLabelText('Above appetite only'));

    expect(screen.getByText('RISK-001')).toBeDefined();
    expect(screen.queryByText('RISK-002')).toBeNull();
    expect(screen.queryByText('RISK-003')).toBeNull();
  });

  it('sets and clears the heatmap coordinate filter on cell click', async () => {
    await renderRisksPage();

    // r1: inherentLikelihood=4, inherentImpact=4
    const cell = screen.getByTitle('Likelihood: High, Impact: High');
    fireEvent.click(cell);

    expect(screen.getByText('RISK-001')).toBeDefined();
    expect(screen.queryByText('RISK-002')).toBeNull();
    expect(screen.queryByText('RISK-003')).toBeNull();

    // clicking the same cell again clears the filter
    fireEvent.click(cell);

    expect(screen.getByText('RISK-001')).toBeDefined();
    expect(screen.getByText('RISK-002')).toBeDefined();
    expect(screen.getByText('RISK-003')).toBeDefined();
  });

  it('opens the create Dialog when clicking Add Risk', async () => {
    await renderRisksPage();

    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'New Risk' }));
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('submits the create form with valid required fields', async () => {
    await renderRisksPage();

    fireEvent.click(screen.getByRole('button', { name: 'New Risk' }));
    const dialog = screen.getByRole('dialog');

    const [categorySelect, likelihoodSelect, impactSelect] =
      within(dialog).getAllByRole('combobox');

    fireEvent.change(within(dialog).getByLabelText('Title'), {
      target: { value: 'Supply chain disruption' },
    });
    fireEvent.change(within(dialog).getByLabelText('Risk Statement'), {
      target: { value: 'Because of a single supplier, disruption could occur.' },
    });
    fireEvent.change(categorySelect, { target: { value: 'cat-1' } });
    fireEvent.change(within(dialog).getByLabelText('Owner'), {
      target: { value: 'Carol' },
    });
    fireEvent.change(likelihoodSelect, { target: { value: '3' } });
    fireEvent.change(impactSelect, { target: { value: '4' } });

    fireEvent.click(within(dialog).getByRole('button', { name: 'New Risk' }));

    expect(mockCreateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Supply chain disruption',
        riskStatement: 'Because of a single supplier, disruption could occur.',
        taxonomyCategoryId: 'cat-1',
        ownerId: 'Carol',
        inherentLikelihood: 3,
        inherentImpact: 4,
      }),
      expect.any(Object),
    );
  });

  it('blocks submission when likelihood or impact are unselected', async () => {
    await renderRisksPage();

    fireEvent.click(screen.getByRole('button', { name: 'New Risk' }));
    const dialog = screen.getByRole('dialog');

    const [categorySelect] = within(dialog).getAllByRole('combobox');

    fireEvent.change(within(dialog).getByLabelText('Title'), {
      target: { value: 'Supply chain disruption' },
    });
    fireEvent.change(within(dialog).getByLabelText('Risk Statement'), {
      target: { value: 'Because of a single supplier, disruption could occur.' },
    });
    fireEvent.change(categorySelect, { target: { value: 'cat-1' } });
    fireEvent.change(within(dialog).getByLabelText('Owner'), {
      target: { value: 'Carol' },
    });
    // likelihood and impact left unselected (default 0)

    fireEvent.click(within(dialog).getByRole('button', { name: 'New Risk' }));

    expect(mockCreateMutate).not.toHaveBeenCalled();
  });
});
