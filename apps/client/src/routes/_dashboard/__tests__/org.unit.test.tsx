import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createIcoreI18n, ICORE_LOCALES } from '@icore/template-shared';
import { OrgPage } from '../org';
import type { Organization } from '@/queries/notes';

// ── mocks ────────────────────────────────────────────────────────────────────

const createMutateAsync = vi.fn();
const updateMutateAsync = vi.fn();
const deleteMutateAsync = vi.fn();

const ORG_1: Organization = {
  id: 'org-1',
  userId: 'u-1',
  name: 'Acme Corp',
  industry: 'technology',
  size: 'startup',
  regions: ['US'],
  techStack: ['React'],
  regulations: ['SOC2'],
  createdAt: '2026-01-01T00:00:00Z',
};

const ORG_2: Organization = {
  id: 'org-2',
  userId: 'u-1',
  name: 'Beta Ltd',
  industry: 'finance',
  size: 'smb',
  regions: [],
  techStack: [],
  regulations: [],
  createdAt: '2026-01-02T00:00:00Z',
};

let mockOrgs: Organization[] = [];
let mockIsPending = false;
let mockActiveOrgId = 'org-1';

vi.mock('@/queries/notes', () => ({
  useOrganizations: () => ({ data: mockOrgs, isPending: mockIsPending }),
  useCreateOrganization: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useUpdateOrganization: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
  useDeleteOrganization: () => ({ mutateAsync: deleteMutateAsync, isPending: false }),
}));

vi.mock('@/stores/active-org', () => ({
  useActiveOrgStore: () => ({ activeOrgId: mockActiveOrgId, setActiveOrgId: vi.fn() }),
}));

vi.mock('@icore/template-shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@icore/template-shared')>();
  return {
    ...actual,
    useNotify: () => ({ success: vi.fn(), error: vi.fn() }),
  };
});

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="sheet">{children}</div> : null,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="alert-dialog">{children}</div> : null,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  AlertDialogAction: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ── helpers ──────────────────────────────────────────────────────────────────

const i18n = createIcoreI18n({ resources: ICORE_LOCALES });
const wrap = (ui: React.ReactElement) => <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>;

// ── OrgPage ──────────────────────────────────────────────────────────────────

describe('OrgPage', () => {
  beforeEach(() => {
    mockOrgs = [ORG_1, ORG_2];
    mockIsPending = false;
    mockActiveOrgId = 'org-1';
    vi.clearAllMocks();
  });

  it('renders loading skeletons while pending', () => {
    mockIsPending = true;
    mockOrgs = [];
    const { container } = render(wrap(<OrgPage />));
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThanOrEqual(1);
  });

  it('renders all orgs', () => {
    render(wrap(<OrgPage />));
    expect(screen.getByText('Acme Corp')).toBeTruthy();
    expect(screen.getByText('Beta Ltd')).toBeTruthy();
  });

  it('shows empty state when no orgs', () => {
    mockOrgs = [];
    render(wrap(<OrgPage />));
    expect(screen.getByText('No organizations yet')).toBeTruthy();
  });

  it('active org card has green border class', () => {
    const { container } = render(wrap(<OrgPage />));
    expect(container.querySelectorAll('[class*="border-green"]').length).toBeGreaterThanOrEqual(1);
  });

  it('create button opens sheet with create title', () => {
    render(wrap(<OrgPage />));
    fireEvent.click(screen.getByRole('button', { name: /create new organization/i }));
    expect(screen.getByTestId('sheet')).toBeTruthy();
    expect(screen.getByText('New Organization')).toBeTruthy();
  });

  it('edit button opens sheet with edit title', () => {
    render(wrap(<OrgPage />));
    const editBtns = screen.getAllByRole('button', { name: /edit/i });
    fireEvent.click(editBtns[0]);
    expect(screen.getByTestId('sheet')).toBeTruthy();
    expect(screen.getByText('Edit Organization')).toBeTruthy();
  });
});

// ── OrgForm (via create sheet) ────────────────────────────────────────────────

describe('OrgForm validation', () => {
  beforeEach(() => {
    mockOrgs = [];
    mockIsPending = false;
    vi.clearAllMocks();
  });

  function openCreateSheet() {
    render(wrap(<OrgPage />));
    fireEvent.click(screen.getByRole('button', { name: /create new organization/i }));
  }

  function getNameInput() {
    return screen.getByLabelText(/organization name/i);
  }

  it('shows error when name is empty on submit', () => {
    openCreateSheet();
    fireEvent.submit(getNameInput().closest('form')!);
    expect(screen.getByText('Organization name is required')).toBeTruthy();
  });

  it('shows error when name shorter than 2 chars', () => {
    openCreateSheet();
    const nameInput = getNameInput();
    fireEvent.change(nameInput, { target: { value: 'A' } });
    fireEvent.submit(nameInput.closest('form')!);
    expect(screen.getByText('Organization name must be at least 2 characters')).toBeTruthy();
  });

  it('calls mutateAsync with trimmed name on valid submit', async () => {
    createMutateAsync.mockResolvedValue({ id: 'new-org' });
    openCreateSheet();
    const nameInput = getNameInput();
    fireEvent.change(nameInput, { target: { value: '  MyOrg  ' } });
    fireEvent.submit(nameInput.closest('form')!);
    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'MyOrg' }),
      );
    });
  });

  it('enterprise size button becomes active on click', () => {
    openCreateSheet();
    const enterpriseBtn = screen.getByRole('button', { name: /enterprise/i });
    fireEvent.click(enterpriseBtn);
    expect(enterpriseBtn.className).toMatch(/green/);
  });
});

// ── TagInput (via create sheet regions field) ─────────────────────────────────

describe('TagInput', () => {
  beforeEach(() => {
    mockOrgs = [];
    mockIsPending = false;
    vi.clearAllMocks();
  });

  function openCreateSheet() {
    render(wrap(<OrgPage />));
    fireEvent.click(screen.getByRole('button', { name: /create new organization/i }));
  }

  function getRegionsInput() {
    return screen.getByRole('textbox', { name: /regions/i });
  }

  it('adds tag on Enter key', () => {
    openCreateSheet();
    const input = getRegionsInput();
    fireEvent.change(input, { target: { value: 'EU' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('EU')).toBeTruthy();
  });

  it('adds tag on comma key', () => {
    openCreateSheet();
    const input = getRegionsInput();
    fireEvent.change(input, { target: { value: 'APAC' } });
    fireEvent.keyDown(input, { key: ',' });
    expect(screen.getByText('APAC')).toBeTruthy();
  });

  it('adds tag on + button click', () => {
    openCreateSheet();
    const input = getRegionsInput();
    fireEvent.change(input, { target: { value: 'US' } });
    const addBtn = input.parentElement!.querySelector('button')!;
    fireEvent.click(addBtn);
    expect(screen.getByText('US')).toBeTruthy();
  });

  it('shows duplicate error for same tag (case-insensitive)', () => {
    openCreateSheet();
    const input = getRegionsInput();
    fireEvent.change(input, { target: { value: 'US' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.change(input, { target: { value: 'us' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('This value is already added')).toBeTruthy();
  });

  it('shows empty error when adding blank input', () => {
    openCreateSheet();
    const input = getRegionsInput();
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('Enter a value before adding it')).toBeTruthy();
  });

  it('removes tag via × button', () => {
    openCreateSheet();
    const input = getRegionsInput();
    fireEvent.change(input, { target: { value: 'EU' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('EU')).toBeTruthy();
    fireEvent.click(screen.getByText('×'));
    expect(screen.queryByText('EU')).toBeNull();
  });
});

// ── Delete org ────────────────────────────────────────────────────────────────

describe('OrgPage delete', () => {
  beforeEach(() => {
    mockOrgs = [ORG_1, ORG_2];
    mockIsPending = false;
    mockActiveOrgId = 'org-1';
    vi.clearAllMocks();
  });

  it('delete button opens confirm dialog', () => {
    render(wrap(<OrgPage />));
    expect(screen.queryByTestId('alert-dialog')).toBeNull();
    const deleteBtns = screen.getAllByRole('button', { name: /delete/i });
    fireEvent.click(deleteBtns[0]);
    expect(screen.getByTestId('alert-dialog')).toBeTruthy();
    expect(screen.getByText('Delete organization?')).toBeTruthy();
  });

  it('cancel closes confirm dialog without calling mutateAsync', () => {
    render(wrap(<OrgPage />));
    const deleteBtns = screen.getAllByRole('button', { name: /delete/i });
    fireEvent.click(deleteBtns[0]);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByTestId('alert-dialog')).toBeNull();
    expect(deleteMutateAsync).not.toHaveBeenCalled();
  });

  it('confirm calls mutateAsync with correct orgId', async () => {
    deleteMutateAsync.mockResolvedValue(undefined);
    render(wrap(<OrgPage />));
    const deleteBtns = screen.getAllByRole('button', { name: /delete/i });
    fireEvent.click(deleteBtns[0]);
    const confirmBtn = screen.getAllByRole('button', { name: /delete/i }).find(
      (btn) => btn.closest('[data-testid="alert-dialog"]'),
    )!;
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(deleteMutateAsync).toHaveBeenCalledWith(ORG_1.id);
    });
  });
});
