import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createIcoreI18n, ICORE_LOCALES } from '@icore/template-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  InternalControl,
  Finding,
  FrameworkActivity,
  RequirementEvidence,
  RequirementAssessment,
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
    useParams: () => ({ id: 'c1' }),
  };
});

const mockControl: InternalControl = {
  id: 'c1',
  code: 'IAM-001',
  title: 'Access Review',
  description: 'Quarterly access review',
  domain: 'Identity',
  owner: 'Alice',
  operator: 'IT Ops',
  category: 'Identity',
  criticality: 'high',
  controlType: 'detective',
  execution: 'manual',
  frequency: 'quarterly',
  nature: 'administrative',
  keyControl: true,
  implementationStatus: 'implemented',
  frameworkMappings: [
    {
      id: 'm1',
      frameworkId: 'fw-nist',
      frameworkName: 'NIST CSF 2.0',
      requirementCode: 'GV.PO-01',
      requirementTitle: 'Policy Establishment',
      mappingType: 'direct',
      validation: 'ai_suggested',
    },
    {
      id: 'm2',
      frameworkId: 'fw-iso',
      frameworkName: 'ISO 27001',
      requirementCode: 'A.5.15',
      requirementTitle: 'Access Control',
      mappingType: 'supporting',
      validation: 'human_validated',
    },
  ],
};

const mockEvidence: RequirementEvidence[] = [
  {
    id: 'ev1',
    controlId: 'c1',
    title: 'Access Review Policy.pdf',
    owner: 'CISO Office',
    evidenceType: 'Policy Document',
    source: 'Manual Upload',
    collectionDate: '2026-01-15',
    periodCovered: '2026-Q1',
    expirationDate: '2027-01-15',
    verificationStatus: 'verified',
  },
];

const mockAssessments: RequirementAssessment[] = [
  {
    id: 'asm1',
    controlId: 'c1',
    cycleName: '2026 Q1 Assessment',
    status: 'completed',
    implementationStatus: 'implemented',
    designEffectiveness: 'effective',
    operatingEffectiveness: 'effective',
    assessor: 'Dana',
    assessmentDate: '2026-01-20',
    observation: 'All controls operating effectively.',
  },
];

const mockFindings: Finding[] = [
  {
    id: 'f1',
    code: 'FIND-001',
    controlId: 'c1',
    assessmentId: 'asm1',
    title: 'Missing quarterly review',
    description: 'Q2 review evidence unavailable.',
    severity: 'high',
    status: 'open',
    linkedRiskId: 'RISK-042',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'f2',
    code: 'FIND-002',
    controlId: 'c1',
    assessmentId: 'asm1',
    title: 'Stale documentation',
    description: 'Implementation description not updated.',
    severity: 'medium',
    status: 'remediated',
    createdAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
  },
];

const mockActivity: FrameworkActivity[] = [
  {
    id: 'a1',
    controlId: 'c1',
    action: 'Created',
    details: 'Control created',
    actor: 'Alice',
    timestamp: '2026-01-01T10:00:00Z',
  },
  {
    id: 'a2',
    controlId: 'c1',
    action: 'Updated',
    details: 'Status changed to implemented',
    actor: 'Bob',
    timestamp: '2026-02-01T10:00:00Z',
  },
  {
    id: 'a3',
    controlId: 'c1',
    action: 'Assessed',
    details: 'Q1 assessment completed',
    actor: 'Carol',
    timestamp: '2026-03-01T10:00:00Z',
  },
];

const mockUpdateMutate = vi.fn();

vi.mock('@/queries/controls', () => ({
  useInternalControl: () => ({ data: mockControl, isPending: false }),
  useUpdateControl: () => ({ mutate: mockUpdateMutate, isPending: false }),
  useControlEvidence: () => ({ data: mockEvidence }),
  useControlAssessments: () => ({ data: mockAssessments }),
  useControlFindings: () => ({ data: mockFindings }),
  useControlActivity: () => ({ data: mockActivity }),
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
  const { ControlDetailPage } = await import('../-controls-detail.page');
  render(wrap(<ControlDetailPage />));
}

describe('ControlDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Overview tab fields from the fixture control', async () => {
    await renderDetailPage();

    expect(screen.getByText('IAM-001')).toBeDefined();
    expect(screen.getByText('Access Review')).toBeDefined();
    expect(screen.getByText('Quarterly access review')).toBeDefined();
    expect(screen.getByText('Identity')).toBeDefined();
    expect(screen.getByText('Alice')).toBeDefined();
    expect(screen.getByText('IT Ops')).toBeDefined();
    expect(screen.getByText('high')).toBeDefined();
    expect(screen.getByText('detective')).toBeDefined();
    expect(screen.getByText('manual')).toBeDefined();
    expect(screen.getByText('quarterly')).toBeDefined();
    expect(screen.getByText('administrative')).toBeDefined();
    expect(screen.getByText('Yes')).toBeDefined();
  });

  it('renders frameworkMappings rows with mapping type and validation labels on the Mapping tab', async () => {
    await renderDetailPage();

    fireEvent.click(screen.getByText('Framework Mapping'));

    expect(screen.getByText('NIST CSF 2.0')).toBeDefined();
    expect(screen.getByText(/GV\.PO-01 — Policy Establishment/)).toBeDefined();
    expect(screen.getByText('direct')).toBeDefined();
    expect(screen.getByText('AI Suggested')).toBeDefined();

    expect(screen.getByText('ISO 27001')).toBeDefined();
    expect(screen.getByText(/A\.5\.15 — Access Control/)).toBeDefined();
    expect(screen.getByText('supporting')).toBeDefined();
    expect(screen.getByText('Human Validated')).toBeDefined();
  });

  it('renders evidence fixture data on the Evidence tab', async () => {
    await renderDetailPage();

    fireEvent.click(screen.getByText('Evidence'));

    expect(screen.getByText('Access Review Policy.pdf')).toBeDefined();
    expect(screen.getByText(/CISO Office/)).toBeDefined();
    expect(screen.getByText(/Policy Document/)).toBeDefined();
    expect(screen.getByText(/Verified/)).toBeDefined();
  });

  it('renders assessments fixture data on the Assessments tab', async () => {
    await renderDetailPage();

    fireEvent.click(screen.getByText('Assessments'));

    expect(screen.getByText('2026 Q1 Assessment')).toBeDefined();
    expect(screen.getByText('All controls operating effectively.')).toBeDefined();
  });

  it('renders findings fixture including a linked-risk annotation on the Findings tab', async () => {
    await renderDetailPage();

    fireEvent.click(screen.getByText('Findings'));

    expect(screen.getByText('FIND-001 — Missing quarterly review')).toBeDefined();
    expect(screen.getByText(/linked to risk RISK-042/)).toBeDefined();

    expect(screen.getByText('FIND-002 — Stale documentation')).toBeDefined();
    expect(screen.queryByText(/linked to risk RISK-042.*FIND-002/)).toBeNull();
  });

  it('renders activity fixture in order on the History tab', async () => {
    await renderDetailPage();

    fireEvent.click(screen.getByText('History'));

    const actions = screen.getAllByText(/^(Created|Updated|Assessed)$/).map((el) => el.textContent);
    expect(actions).toEqual(['Created', 'Updated', 'Assessed']);
  });
});
