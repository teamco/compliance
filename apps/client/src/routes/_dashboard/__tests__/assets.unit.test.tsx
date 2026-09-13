import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createIcoreI18n, ICORE_LOCALES } from '@icore/template-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Asset } from '@icore/shared';

const createMutate = vi.fn();
const updateMutate = vi.fn();
const deleteMutate = vi.fn();

const mockAssets: Asset[] = [
  {
    id: 'asset-1',
    orgId: 'org1',
    userId: 'u1',
    code: 'AST-000101',
    name: 'Customer Payment API',
    type: 'api',
    criticality: 'critical',
    status: 'active',
    owner: 'Digital Banking',
    businessOwner: 'Digital Banking',
    technicalOwner: 'Platform Engineering',
    department: 'Engineering',
    description: 'Core microservice for payment transactions',
    dataClassification: 'restricted',
    dataTypes: ['pii', 'pci', 'financial'],
    ciaConfidentiality: 'critical',
    ciaIntegrity: 'critical',
    ciaAvailability: 'critical',
    hostingType: 'cloud',
    environment: 'production',
    location: 'AWS us-east-1',
    internetFacing: true,
    isProduction: true,
    vendorName: 'AWS / Stripe',
    complianceScope: ['PCI DSS', 'SOC 2'],
    tags: ['payments'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'asset-2',
    orgId: 'org1',
    userId: 'u1',
    code: 'AST-000102',
    name: 'Corporate Website',
    type: 'web_app',
    criticality: 'medium',
    status: 'active',
    owner: 'Marketing',
    businessOwner: 'Marketing',
    technicalOwner: 'Frontend Team',
    department: 'Growth',
    description: 'Public marketing website',
    dataClassification: 'public',
    dataTypes: [],
    ciaConfidentiality: 'low',
    ciaIntegrity: 'high',
    ciaAvailability: 'moderate',
    hostingType: 'cloud',
    environment: 'production',
    location: 'Vercel Edge',
    internetFacing: true,
    isProduction: true,
    complianceScope: ['SOC 2'],
    tags: ['web'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

vi.mock('@icore/template-shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@icore/template-shared')>();
  return {
    ...actual,
    useDraft: () => ({
      showConfirm: false,
      confirmClose: vi.fn(),
      cancelClose: vi.fn(),
      requestClose: vi.fn(),
    }),
    useNotify: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
  };
});

vi.mock('@/queries/assets', () => ({
  useAssets: () => ({ data: mockAssets, isPending: false }),
  useCreateAsset: () => ({ mutate: createMutate, isPending: false }),
  useUpdateAsset: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteAsset: () => ({ mutate: deleteMutate, isPending: false }),
}));

vi.mock('@/queries/risks', () => ({
  useRisks: () => ({
    data: [
      {
        id: 'r1',
        assetIds: ['asset-1'],
        title: 'API Authentication Bypass',
        riskStatement: 'API Authentication Bypass',
        inherentScore: 16,
        inherentLabel: 'high',
      },
    ],
    isPending: false,
  }),
}));

vi.mock('@/queries/issues', () => ({
  useIssues: () => ({
    data: [
      {
        id: 'i1',
        title: 'Unpatched vulnerability in payment gateway',
        affectedAssets: 'Customer Payment API',
        severity: 'critical',
        status: 'open',
      },
    ],
    isPending: false,
  }),
}));

vi.mock('@/queries/vendors', () => ({
  useVendors: () => ({
    data: [{ id: 'v1', name: 'Stripe', domain: 'stripe.com', tier: 'critical' }],
    isPending: false,
  }),
}));

vi.mock('@/stores/active-org', () => ({
  useActiveOrgStore: () => ({ activeOrgId: 'org1' }),
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    createFileRoute: () => (opts: { component: React.ComponentType }) => ({
      options: opts,
      component: opts.component,
    }),
  };
});

const i18n = createIcoreI18n({ resources: ICORE_LOCALES });

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={qc}>
      <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>
    </QueryClientProvider>
  );
}

describe('AssetsPage (Asset Catalog)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders KPI metric summary cards and asset table', async () => {
    const { AssetsPage } = await import('../-assets.page');
    render(wrap(<AssetsPage />));

    expect(screen.getByText('Total Assets')).toBeTruthy();
    expect(screen.getByText('Critical Assets')).toBeTruthy();
    expect(screen.getByText('High Risk')).toBeTruthy();
    expect(screen.getByText('Customer Payment API')).toBeTruthy();
    expect(screen.getByText('Corporate Website')).toBeTruthy();
  });

  it('filters assets by search query', async () => {
    const { AssetsPage } = await import('../-assets.page');
    render(wrap(<AssetsPage />));

    const searchInput = screen.getByPlaceholderText(/Search assets/i);
    fireEvent.change(searchInput, { target: { value: 'Payment' } });

    expect(screen.getByText('Customer Payment API')).toBeTruthy();
    expect(screen.queryByText('Corporate Website')).toBeNull();
  });

  it('opens New Asset dialog with multi-step wizard and CIA evaluation', async () => {
    const { AssetsPage } = await import('../-assets.page');
    render(wrap(<AssetsPage />));

    const newBtn = screen.getByRole('button', { name: /New Asset/i });
    fireEvent.click(newBtn);

    expect(screen.getByText('1. Basic Information')).toBeTruthy();
    expect(screen.getByPlaceholderText(/Customer Payment API/i)).toBeTruthy();

    // Fill basic info
    fireEvent.change(screen.getByPlaceholderText(/Customer Payment API/i), {
      target: { value: 'Test Database Store' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Digital Banking BU/i), {
      target: { value: 'Core DB Team' },
    });

    // Step 2: Classification & CIA
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText(/CIA Impact & Defensible Criticality/i)).toBeTruthy();

    // Step 3: Technology
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getAllByText(/Internet Facing/i).length).toBeGreaterThanOrEqual(1);
  });

  it('opens Asset Profile sheet with tabs when clicking on an asset row', async () => {
    const { AssetsPage } = await import('../-assets.page');
    render(wrap(<AssetsPage />));

    fireEvent.click(screen.getByText('Customer Payment API'));

    expect(screen.getByText('Risk Posture')).toBeTruthy();
    expect(screen.getByText('Control Posture')).toBeTruthy();
    expect(screen.getByText('Relationships')).toBeTruthy();
    expect(screen.getByText('Controls')).toBeTruthy();
    expect(screen.getByText('Risks')).toBeTruthy();
    expect(screen.getByText('Issues')).toBeTruthy();
  });

  it('opens bulk import dialog', async () => {
    const { AssetsPage } = await import('../-assets.page');
    render(wrap(<AssetsPage />));

    const importBtn = screen.getByRole('button', { name: /Import Assets/i });
    fireEvent.click(importBtn);

    expect(screen.getByText(/Bulk Import Assets/i)).toBeTruthy();
    expect(screen.getByText(/Drop your CSV file here/i)).toBeTruthy();
  });
});
