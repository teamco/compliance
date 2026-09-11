import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createIcoreI18n, ICORE_LOCALES } from '@icore/template-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Framework, FrameworkRequirement } from '@/queries/frameworks';
import { RequirementDrawer } from '@/components/frameworks/RequirementDrawer';
import { FrameworksPage } from '../-frameworks.page';

const mockNavigate = vi.fn();
const mockNotify = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
};

vi.mock('@icore/template-shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@icore/template-shared')>();
  return {
    ...actual,
    useNotify: () => mockNotify,
  };
});

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    createFileRoute: () => (opts: { component: React.ComponentType }) => ({
      options: opts,
      useParams: () => ({ id: '00000000-0000-0000-0000-000000000003' }),
    }),
    Link: ({
      children,
      to,
      className,
    }: {
      children: React.ReactNode;
      to: string;
      className?: string;
    }) => (
      <a href={to} className={className}>
        {children}
      </a>
    ),
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/stores/active-org', () => ({
  useActiveOrgStore: () => ({ activeOrgId: 'org1' }),
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogClose: ({ children, ...props }: { children: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="sheet">{children}</div> : null,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

const mockUpdateRequirement = vi.fn();
const mockCreateEvidence = vi.fn();
const mockCreateFinding = vi.fn();
const mockCreateFramework = vi.fn();
const mockUpdateFramework = vi.fn();

const mockFrameworksList: Framework[] = [
  {
    id: '00000000-0000-0000-0000-000000000003',
    slug: 'nist-csf',
    name: 'NIST CSF 2.0',
    description: 'NIST Cybersecurity Framework 2.0',
    version: '2.0',
    category: 'security',
    status: 'enabled',
    requirementsCount: 106,
    applicableCount: 89,
    notApplicableCount: 12,
  },
];

vi.mock('@/queries/frameworks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/queries/frameworks')>();
  return {
    ...actual,
    useFrameworks: () => ({ data: mockFrameworksList, isPending: false }),
    useCreateFramework: () => ({ mutate: mockCreateFramework, isPending: false }),
    useUpdateFramework: () => ({ mutate: mockUpdateFramework, isPending: false }),
    useUpdateRequirement: () => ({ mutate: mockUpdateRequirement, isPending: false }),
    useCreateFrameworkEvidence: () => ({ mutate: mockCreateEvidence, isPending: false }),
    useCreateAssessmentFinding: () => ({ mutate: mockCreateFinding, isPending: false }),
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

describe('RequirementDrawer (6 GRC Areas)', () => {
  const mockFramework: Framework = {
    id: '00000000-0000-0000-0000-000000000003',
    slug: 'nist-csf',
    name: 'NIST CSF 2.0',
    description: 'NIST Cybersecurity Framework 2.0',
    version: '2.0',
    category: 'security',
    status: 'enabled',
    requirementsCount: 106,
    applicableCount: 89,
    notApplicableCount: 12,
  };

  const mockReq: FrameworkRequirement = {
    id: 'nist-gv-po-01',
    frameworkId: '00000000-0000-0000-0000-000000000003',
    code: 'GV.PO-01',
    title: 'Policy Establishment & Enforcement',
    description:
      'Policy for managing cybersecurity risks is established based on organizational context, cybersecurity strategy, and priorities and is communicated and enforced.',
    functionCode: 'GV',
    functionName: 'GOVERN',
    categoryCode: 'GV.PO',
    categoryName: 'Policy',
    guidance: 'Policies must be approved by management and reviewed annually.',
    references: ['NIST SP 800-53 Rev. 5: PM-1', 'ISO/IEC 27001:2022: A.5.1'],
    applicability: 'applicable',
    applicabilityRationale: 'Core governance policy requirement.',
    scopeBusinessUnits: ['Enterprise IT', 'Corporate Security'],
    scopeSystems: ['AWS Production', 'Entra ID'],
    scopeLocations: ['US-East', 'EU-Central'],
    scopeLegalEntities: ['Acme Global Inc.'],
    implementationStatus: 'partially_implemented',
    implementationDescription: 'Policies published with annual attestation.',
    controlOwner: 'Security Governance',
    controlOperator: 'SecOps Team',
    reviewFrequency: 'Annual',
    evidenceCount: 3,
    mappedControlsCount: 4,
    openFindingsCount: 1,
  };

  const mockControls = [
    {
      id: 'ctrl-1',
      code: 'POL-001',
      title: 'Information Security Policy Governance',
      description: 'Review and enforce security policies.',
      owner: 'Security Governance',
      category: 'Governance',
      frameworkMappings: [
        {
          frameworkId: '00000000-0000-0000-0000-000000000003',
          frameworkName: 'NIST CSF 2.0',
          requirementCode: 'GV.PO-01',
        },
      ],
    },
  ];

  const mockEvidence = [
    {
      id: 'ev-1',
      frameworkId: '00000000-0000-0000-0000-000000000003',
      requirementId: 'nist-gv-po-01',
      title: 'Information Security Policy.pdf',
      owner: 'CISO Office',
      evidenceType: 'Policy Document',
      source: 'Manual Upload',
      collectionDate: '2026-01-15',
      periodCovered: '2026-Q1 - 2026-Q4',
      expirationDate: '2027-01-15',
      verificationStatus: 'verified' as const,
      linkedRequirements: ['GV.PO-01'],
    },
  ];

  const mockAssessments = [
    {
      id: 'asm-1',
      frameworkId: '00000000-0000-0000-0000-000000000003',
      requirementId: 'nist-gv-po-01',
      cycleName: '2026 NIST CSF Assessment',
      status: 'completed' as const,
      implementationStatus: 'partially_implemented' as const,
      designEffectiveness: 'effective' as const,
      operatingEffectiveness: 'partially_effective' as const,
      assessor: 'John Smith',
      assessmentDate: '2026-09-08',
      observation: 'Quarterly review evidence unavailable for Q2.',
      findingId: 'FIND-2026-0042',
      findingTitle: 'Missing Q2 Review',
      findingSeverity: 'high' as const,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders requirement statement, guidance, references, and immutable notice', () => {
    render(
      wrap(
        <RequirementDrawer
          framework={mockFramework}
          requirement={mockReq}
          internalControls={mockControls}
          evidenceList={mockEvidence}
          assessmentsList={mockAssessments}
          orgId="org1"
          open={true}
          onOpenChange={vi.fn()}
        />,
      ),
    );

    expect(screen.getByText('GV.PO-01')).toBeDefined();
    expect(screen.getByText('Policy Establishment & Enforcement')).toBeDefined();
    expect(
      screen.getByText(/Policy for managing cybersecurity risks is established/),
    ).toBeDefined();
    expect(screen.getByText(/Immutable Source Content/)).toBeDefined();
  });

  it('switches between 6 core areas', () => {
    render(
      wrap(
        <RequirementDrawer
          framework={mockFramework}
          requirement={mockReq}
          internalControls={mockControls}
          evidenceList={mockEvidence}
          assessmentsList={mockAssessments}
          orgId="org1"
          open={true}
          onOpenChange={vi.fn()}
        />,
      ),
    );

    // Click Applicability tab
    fireEvent.click(screen.getByText('2. Applicability'));
    expect(screen.getByText('Applicability Status')).toBeDefined();
    expect(screen.getByText('Organizational Scope Dimensions')).toBeDefined();

    // Click Implementation tab
    fireEvent.click(screen.getByText('3. Implementation'));
    expect(screen.getByText('How does our organization satisfy this requirement?')).toBeDefined();

    // Click Mapped Controls tab
    fireEvent.click(screen.getByText('4. Mapped Controls'));
    expect(screen.getByText('Common Control Framework')).toBeDefined();
    expect(screen.getByText('POL-001')).toBeDefined();

    // Click Evidence tab
    fireEvent.click(screen.getByText(/5\. Evidence/));
    expect(screen.getByText('Information Security Policy.pdf')).toBeDefined();

    // Click Assessments tab
    fireEvent.click(screen.getByText('6. Assessments & Findings'));
    expect(screen.getByText('2026 NIST CSF Assessment')).toBeDefined();
    expect(screen.getByText('FIND-2026-0042')).toBeDefined();
  });

  it('requires mandatory justification when Not Applicable is selected', () => {
    render(
      wrap(
        <RequirementDrawer
          framework={mockFramework}
          requirement={mockReq}
          internalControls={mockControls}
          evidenceList={mockEvidence}
          assessmentsList={mockAssessments}
          orgId="org1"
          open={true}
          onOpenChange={vi.fn()}
        />,
      ),
    );

    fireEvent.click(screen.getByText('2. Applicability'));
    fireEvent.click(screen.getByText('not applicable'));

    expect(screen.getByText(/Not Applicable Justification \(Mandatory\)/)).toBeDefined();

    // Attempt save without rationale
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(mockNotify.error).toHaveBeenCalledWith(
      expect.stringContaining('Justification is required'),
    );
    expect(mockUpdateRequirement).not.toHaveBeenCalled();
  });
});

describe('FrameworksPage (Add Framework Modal & Close Buttons)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens Add Framework modal and closes it using the header close X button', () => {
    render(wrap(<FrameworksPage />));

    // Initially modal title should not be in document
    expect(screen.queryByText('Add Framework to Organization')).toBeNull();

    // Click Add Framework button
    const addBtn = screen.getByRole('button', { name: /Add Framework/i });
    fireEvent.click(addBtn);

    // Modal should now be open
    expect(screen.getByText('Add Framework to Organization')).toBeDefined();

    // Click the header close button (X button)
    const closeBtn = screen.getByRole('button', { name: /Close dialog/i });
    fireEvent.click(closeBtn);

    // Modal should now be closed
    expect(screen.queryByText('Add Framework to Organization')).toBeNull();
  });

  it('closes the modal using the footer Close button in catalogue view', () => {
    render(wrap(<FrameworksPage />));

    // Open modal
    fireEvent.click(screen.getByRole('button', { name: /Add Framework/i }));
    expect(screen.getByText('Add Framework to Organization')).toBeDefined();

    // Verify catalogue list is displayed
    expect(screen.getByText('Built-in Framework Catalogue')).toBeDefined();

    // Click the footer Close button
    const footerCloseBtn = screen.getByRole('button', { name: /^Close$/i });
    fireEvent.click(footerCloseBtn);

    // Modal should now be closed
    expect(screen.queryByText('Add Framework to Organization')).toBeNull();
  });

  it('closes the modal using the Cancel button in custom framework view', () => {
    render(wrap(<FrameworksPage />));

    // Open modal
    fireEvent.click(screen.getByRole('button', { name: /Add Framework/i }));
    expect(screen.getByText('Add Framework to Organization')).toBeDefined();

    // Switch to Custom / Internal Framework tab
    fireEvent.click(screen.getByText('Custom / Internal Framework'));
    expect(screen.getByText('Framework Name')).toBeDefined();

    // Click Cancel button
    const cancelBtn = screen.getByRole('button', { name: /^Cancel$/i });
    fireEvent.click(cancelBtn);

    // Modal should now be closed
    expect(screen.queryByText('Add Framework to Organization')).toBeNull();
  });

  it('submits custom framework creation using the Create Framework button', () => {
    render(wrap(<FrameworksPage />));

    // Open modal
    fireEvent.click(screen.getByRole('button', { name: /Add Framework/i }));

    // Switch to Custom / Internal Framework tab
    fireEvent.click(screen.getByText('Custom / Internal Framework'));

    // Fill in framework name
    const nameInput = screen.getByPlaceholderText('e.g. Acme Internal Security Baseline');
    fireEvent.change(nameInput, { target: { value: 'Acme Security Baseline' } });

    // Click Create Framework button
    const createBtn = screen.getByRole('button', { name: /Create Framework/i });
    fireEvent.click(createBtn);

    expect(mockCreateFramework).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Acme Security Baseline',
        slug: 'acme-security-baseline',
        status: 'enabled',
      }),
      expect.any(Object),
    );
  });
});
