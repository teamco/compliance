import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createIcoreI18n, ICORE_LOCALES } from '@icore/template-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Framework, InternalControl } from '@icore/shared';

// ScrollableRow (wraps the framework toggle row) requires ResizeObserver, which jsdom
// does not implement.
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

const mockFrameworks: Framework[] = [
  {
    id: 'fw-nist',
    slug: 'nist-csf',
    name: 'NIST CSF 2.0',
    description: '',
    version: '2.0',
    category: 'security',
    requirementsCount: 10,
  },
  {
    id: 'fw-iso',
    slug: 'iso27001',
    name: 'ISO 27001',
    description: '',
    version: '1',
    category: 'security',
    requirementsCount: 5,
  },
];

vi.mock('@/queries/notes', () => ({
  useFrameworks: () => ({ data: mockFrameworks }),
}));

const mockControls: InternalControl[] = [
  {
    id: 'c1',
    code: 'IAM-001',
    title: 'Access Review',
    description: 'Quarterly access review',
    domain: 'Identity',
    owner: 'Alice',
    category: 'Identity',
    criticality: 'high',
    implementationStatus: 'implemented',
    operatingEffectiveness: 'effective',
    frameworkMappings: [
      { frameworkId: 'fw-nist', frameworkName: 'NIST CSF 2.0', requirementCode: 'GV.PO-01' },
    ],
    evidenceCount: 2,
    findingsCount: 0,
  },
  {
    id: 'c2',
    code: 'IAM-002',
    title: 'MFA Enforcement',
    description: 'Multi-factor auth on all admin accounts',
    domain: 'Identity',
    owner: 'Bob',
    category: 'Identity',
    criticality: 'critical',
    implementationStatus: 'partially_implemented',
    operatingEffectiveness: 'partially_effective',
    frameworkMappings: [
      { frameworkId: 'fw-iso', frameworkName: 'ISO 27001', requirementCode: 'A.5.15' },
    ],
    evidenceCount: 1,
    findingsCount: 1,
  },
  {
    id: 'c3',
    code: 'NET-001',
    title: 'Firewall Rules Review',
    description: 'Review of perimeter firewall rules',
    domain: 'Network',
    owner: 'Carol',
    category: 'Network',
    criticality: 'medium',
    implementationStatus: 'not_implemented',
    operatingEffectiveness: 'ineffective',
    frameworkMappings: [],
    evidenceCount: 0,
    findingsCount: 2,
  },
];

const mockCreateMutate = vi.fn();
const mockDeleteMutate = vi.fn();

vi.mock('@/queries/controls', () => ({
  useInternalControlsList: () => ({ data: mockControls, isPending: false }),
  useCreateControl: () => ({ mutate: mockCreateMutate, isPending: false }),
  useDeleteControl: () => ({ mutate: mockDeleteMutate, isPending: false }),
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

async function renderControlsPage() {
  const { ControlsPage } = await import('../-controls.page');
  render(wrap(<ControlsPage />));
}

describe('ControlsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the KPI summary line with correct counts', async () => {
    await renderControlsPage();

    // 3 total, 1 implemented, 1 partial, 1 gap (NET-001: not_implemented + ineffective)
    expect(screen.getByText(/3 Controls/)).toBeDefined();
    expect(screen.getByText(/1 Implemented/)).toBeDefined();
    expect(screen.getByText(/1 Partial/)).toBeDefined();
    expect(screen.getByText(/1 Gaps/)).toBeDefined();
    // coverage = 2 mapped requirement keys / 15 total framework requirements = 13%
    expect(screen.getByText(/13% Framework Requirement Coverage/)).toBeDefined();
  });

  it('narrows the table via the framework filter toggle', async () => {
    await renderControlsPage();

    expect(screen.getByText('IAM-001')).toBeDefined();
    expect(screen.getByText('IAM-002')).toBeDefined();
    expect(screen.getByText('NET-001')).toBeDefined();

    fireEvent.click(screen.getByText('NIST-CSF'));

    expect(screen.getByText('IAM-001')).toBeDefined();
    expect(screen.queryByText('IAM-002')).toBeNull();
    expect(screen.queryByText('NET-001')).toBeNull();
  });

  it('narrows the table via the domain filter', async () => {
    await renderControlsPage();

    const [domainSelect] = screen.getAllByRole('combobox');
    fireEvent.change(domainSelect, { target: { value: 'Network' } });

    expect(screen.queryByText('IAM-001')).toBeNull();
    expect(screen.queryByText('IAM-002')).toBeNull();
    expect(screen.getByText('NET-001')).toBeDefined();
  });

  it('narrows the table via the owner filter', async () => {
    await renderControlsPage();

    const [, ownerSelect] = screen.getAllByRole('combobox');
    fireEvent.change(ownerSelect, { target: { value: 'Bob' } });

    expect(screen.queryByText('IAM-001')).toBeNull();
    expect(screen.getByText('IAM-002')).toBeDefined();
    expect(screen.queryByText('NET-001')).toBeNull();
  });

  it('narrows the table via the criticality filter', async () => {
    await renderControlsPage();

    const [, , criticalitySelect] = screen.getAllByRole('combobox');
    fireEvent.change(criticalitySelect, { target: { value: 'medium' } });

    expect(screen.queryByText('IAM-001')).toBeNull();
    expect(screen.queryByText('IAM-002')).toBeNull();
    expect(screen.getByText('NET-001')).toBeDefined();
  });

  it('filters to gaps only (not_implemented / ineffective / partially_effective)', async () => {
    await renderControlsPage();

    fireEvent.click(screen.getByLabelText('Show gaps only'));

    expect(screen.queryByText('IAM-001')).toBeNull();
    expect(screen.getByText('IAM-002')).toBeDefined();
    expect(screen.getByText('NET-001')).toBeDefined();
  });

  it('opens the create Dialog when clicking Add Control', async () => {
    await renderControlsPage();

    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add Control' }));
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('submits the create form with the entered fields', async () => {
    await renderControlsPage();

    fireEvent.click(screen.getByRole('button', { name: 'Add Control' }));
    const dialog = screen.getByRole('dialog');

    fireEvent.change(within(dialog).getByLabelText('Code'), {
      target: { value: 'IAM-010' },
    });
    fireEvent.change(within(dialog).getByLabelText('Title'), {
      target: { value: 'Privileged Access Review' },
    });
    fireEvent.change(within(dialog).getByLabelText('Description'), {
      target: { value: 'Quarterly review of privileged accounts' },
    });
    fireEvent.change(within(dialog).getByLabelText('Domain'), {
      target: { value: 'Identity' },
    });
    fireEvent.change(within(dialog).getByLabelText('Owner'), {
      target: { value: 'Dana' },
    });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Control' }));

    expect(mockCreateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'IAM-010',
        title: 'Privileged Access Review',
        description: 'Quarterly review of privileged accounts',
        domain: 'Identity',
        owner: 'Dana',
      }),
      expect.any(Object),
    );
  });

  it('opens the delete AlertDialog and confirms via useDeleteControl', async () => {
    await renderControlsPage();

    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButtons[0]);

    const alertDialog = screen.getByRole('alertdialog');
    expect(within(alertDialog).getByText('Delete control?')).toBeDefined();

    fireEvent.click(within(alertDialog).getByRole('button', { name: 'Delete' }));

    expect(mockDeleteMutate).toHaveBeenCalledWith('c1');
  });
});
