import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createIcoreI18n, ICORE_LOCALES } from '@icore/template-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  Risk,
  RiskTaxonomyCategory,
  RiskControlMapping,
  RiskAcceptance,
  RiskSnapshot,
  RequirementEvidence,
} from '@icore/shared';

// ScrollableRow (wraps the tab bar) requires ResizeObserver, which jsdom does not implement.
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useParams: () => ({ id: 'r1' }),
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

const mockRisk: Risk = {
  id: 'r1',
  riskId: 'RISK-001',
  orgId: 'org1',
  userId: 'user1',
  title: 'Ransomware exposure',
  riskStatement: 'Because of unpatched systems, ransomware could occur, resulting in downtime.',
  taxonomyCategoryId: 'cat-1',
  ownerId: 'Alice',
  businessUnit: 'IT Operations',
  source: 'manual',
  assetIds: [],
  vendorIds: [],
  methodologyId: 'method-1',
  inherentLikelihood: 4,
  inherentImpact: 4,
  inherentScore: 16,
  inherentLabel: 'critical',
  residualLikelihood: 2,
  residualImpact: 3,
  residualScore: 6,
  residualLabel: 'medium',
  aboveAppetite: true,
  treatmentStrategy: 'mitigate',
  treatmentOwner: 'Dana',
  treatmentPlan: 'Deploy EDR across all endpoints.',
  targetScore: 4,
  targetDate: '2026-12-31T00:00:00Z',
  status: 'open',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const mockTaxonomy: RiskTaxonomyCategory[] = [
  {
    id: 'cat-1',
    orgId: 'org1',
    name: 'Cyber Security',
    archived: false,
    createdAt: '2026-01-01T00:00:00Z',
  },
];

const mockMappings: RiskControlMapping[] = [
  {
    id: 'map-1',
    riskId: 'r1',
    controlId: 'c1',
    controlCode: 'IAM-001',
    controlTitle: 'Access Review',
    effectivenessNote: 'Reduces likelihood of unauthorized access',
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'map-2',
    riskId: 'r1',
    controlId: 'c2',
    controlCode: 'NET-002',
    controlTitle: 'Endpoint Detection',
    createdAt: '2026-01-01T00:00:00Z',
  },
];

const mockEvidence: RequirementEvidence[] = [
  {
    id: 'ev1',
    riskId: 'r1',
    title: 'EDR rollout report.pdf',
    owner: 'Dana',
    evidenceType: 'Deployment Report',
    source: 'Manual Upload',
    collectionDate: '2026-02-01',
    periodCovered: '2026-Q1',
    expirationDate: '2027-02-01',
    verificationStatus: 'verified',
  },
];

const mockSnapshots: RiskSnapshot[] = [
  {
    id: 'snap-1',
    riskId: 'r1',
    inherentScore: 16,
    inherentLabel: 'critical',
    residualScore: 8,
    residualLabel: 'high',
    changedBy: 'Alice',
    reason: 'Initial assessment',
    createdAt: '2026-01-05T10:00:00Z',
  },
  {
    id: 'snap-2',
    riskId: 'r1',
    inherentScore: 16,
    inherentLabel: 'critical',
    residualScore: 6,
    residualLabel: 'medium',
    changedBy: 'Dana',
    reason: 'EDR deployed',
    createdAt: '2026-02-10T10:00:00Z',
  },
];

let mockActiveAcceptance: RiskAcceptance | null = null;

const mockCreateAcceptanceMutate = vi.fn();
const mockApproveAcceptanceMutate = vi.fn();
const mockRejectAcceptanceMutate = vi.fn();
const mockUpdateMutate = vi.fn();

vi.mock('@/queries/risks', () => ({
  useRisk: () => ({ data: mockRisk, isPending: false }),
  useRiskTaxonomy: () => ({ data: mockTaxonomy }),
  useRiskControlMappings: () => ({ data: mockMappings }),
  useUpdateRisk: () => ({ mutate: mockUpdateMutate, isPending: false }),
  useActiveRiskAcceptance: () => ({ data: mockActiveAcceptance }),
  useCreateRiskAcceptance: () => ({ mutate: mockCreateAcceptanceMutate, isPending: false }),
  useApproveRiskAcceptance: () => ({ mutate: mockApproveAcceptanceMutate, isPending: false }),
  useRejectRiskAcceptance: () => ({ mutate: mockRejectAcceptanceMutate, isPending: false }),
  useRiskEvidence: () => ({ data: mockEvidence }),
  useRiskSnapshots: () => ({ data: mockSnapshots }),
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
  const { RiskDetailPage } = await import('../-risks-detail.page');
  render(wrap(<RiskDetailPage />));
}

describe('RiskDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveAcceptance = null;
  });

  it('renders Overview tab fields including inherent, residual, and appetite display', async () => {
    await renderDetailPage();

    expect(screen.getByText('RISK-001')).toBeDefined();
    expect(screen.getByText('Ransomware exposure')).toBeDefined();
    expect(
      screen.getByText(
        'Because of unpatched systems, ransomware could occur, resulting in downtime.',
      ),
    ).toBeDefined();
    expect(screen.getByText('Cyber Security')).toBeDefined();
    expect(screen.getByText('Alice')).toBeDefined();
    expect(screen.getByText('IT Operations')).toBeDefined();
    expect(screen.getByText('16 — critical (L:4 × I:4)')).toBeDefined();
    expect(screen.getByText('6 — medium (L:2 × I:3)')).toBeDefined();
    expect(screen.getByText('Above Appetite')).toBeDefined();
  });

  it('renders RiskControlMapping fixture rows on the Controls tab', async () => {
    await renderDetailPage();

    fireEvent.click(screen.getByText('Controls'));

    expect(screen.getByText('IAM-001')).toBeDefined();
    expect(screen.getByText('Access Review')).toBeDefined();
    expect(screen.getByText('Reduces likelihood of unauthorized access')).toBeDefined();
    expect(screen.getByText('NET-002')).toBeDefined();
    expect(screen.getByText('Endpoint Detection')).toBeDefined();
  });

  it("opens the acceptance Dialog from Treatment tab's Accept Risk button and submits it", async () => {
    await renderDetailPage();

    fireEvent.click(screen.getByText('Treatment'));
    fireEvent.click(screen.getByRole('button', { name: 'Accept Risk' }));

    const dialog = screen.getByRole('dialog');
    // The Label elements for these fields aren't associated via htmlFor/id, so
    // select the underlying textarea/input elements by their DOM position.
    const [justificationTextarea] = dialog.querySelectorAll('textarea');
    const [expiresAtInput, approverInput] = dialog.querySelectorAll('input');

    fireEvent.change(justificationTextarea, {
      target: { value: 'Residual risk within tolerable range given compensating controls.' },
    });
    fireEvent.change(expiresAtInput, { target: { value: '2026-12-31' } });
    fireEvent.change(approverInput, { target: { value: 'Carol' } });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Submit for Approval' }));

    expect(mockCreateAcceptanceMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        justification: 'Residual risk within tolerable range given compensating controls.',
        expiresAt: '2026-12-31',
        approverId: 'Carol',
      }),
      expect.any(Object),
    );
  });

  it('renders Approve/Reject buttons for an active acceptance and calls their mutations', async () => {
    mockActiveAcceptance = {
      id: 'acc-1',
      riskId: 'r1',
      orgId: 'org1',
      requestedBy: 'Alice',
      justification: 'Compensating controls in place.',
      compensatingControls: 'EDR + quarterly access review',
      expiresAt: '2026-12-31T00:00:00Z',
      approverId: 'Carol',
      status: 'requested',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    await renderDetailPage();

    fireEvent.click(screen.getByText('Treatment'));

    expect(screen.queryByRole('button', { name: 'Accept Risk' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(mockApproveAcceptanceMutate).toHaveBeenCalledWith('acc-1');

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(mockRejectAcceptanceMutate).toHaveBeenCalledWith('acc-1');
  });

  it('renders Evidence tab fixture data', async () => {
    await renderDetailPage();

    fireEvent.click(screen.getByText('Evidence'));

    expect(screen.getByText('EDR rollout report.pdf')).toBeDefined();
    expect(screen.getByText(/Dana/)).toBeDefined();
    expect(screen.getByText(/Deployment Report/)).toBeDefined();
    expect(screen.getByText(/verified/)).toBeDefined();
  });

  it('renders History tab fixture snapshots', async () => {
    await renderDetailPage();

    fireEvent.click(screen.getByText('History'));

    const entries = screen.getAllByText(/^Inherent: 16 \(critical\)/);
    expect(entries).toHaveLength(2);
    expect(entries[0].textContent).toBe('Inherent: 16 (critical) · Residual: 8 (high)');
    expect(entries[1].textContent).toBe('Inherent: 16 (critical) · Residual: 6 (medium)');
    expect(screen.getByText(/Initial assessment/)).toBeDefined();
    expect(screen.getByText(/EDR deployed/)).toBeDefined();
  });
});
