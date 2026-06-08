import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createIcoreI18n, ICORE_LOCALES } from '@icore/template-shared';
import { OrgPage } from '../org/-org-page';
import type { Organization } from '@/queries/notes';
import React from 'react';

// ── mocks ────────────────────────────────────────────────────────────────────

vi.hoisted(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    },
    configurable: true,
  });
});

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
  updatedAt: '2026-01-01T00:00:00Z',
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
  updatedAt: '2026-01-02T00:00:00Z',
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
  SheetContent: ({
    children,
    onPointerDownOutside,
    onInteractOutside,
  }: {
    children: React.ReactNode;
    onPointerDownOutside?: (event: { preventDefault: () => void }) => void;
    onInteractOutside?: (event: { preventDefault: () => void }) => void;
  }) => (
    <div
      data-testid="sheet-content"
      data-blocks-pointer-outside={String(!!onPointerDownOutside)}
      data-blocks-interact-outside={String(!!onInteractOutside)}
    >
      {children}
    </div>
  ),
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

  it('filters orgs by name from the search input', () => {
    render(wrap(<OrgPage />));
    fireEvent.change(screen.getByRole('searchbox', { name: /search organizations/i }), {
      target: { value: 'beta' },
    });
    expect(screen.queryByText('Acme Corp')).toBeNull();
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
    expect(screen.getByTestId('sheet-content').getAttribute('data-blocks-pointer-outside')).toBe(
      'true',
    );
    expect(screen.getByTestId('sheet-content').getAttribute('data-blocks-interact-outside')).toBe(
      'true',
    );
    expect(screen.getByText('New Organization')).toBeTruthy();
    const submitButton = screen.getByRole('button', { name: /create organization/i });
    expect(submitButton.className).toContain('w-full');
    expect(submitButton.closest('footer')?.className).toContain('border-t');
    expect(submitButton.closest('form')?.className).toContain('h-full');
  });

  it('edit button opens sheet with edit title', () => {
    render(wrap(<OrgPage />));
    const editBtns = screen.getAllByRole('button', { name: /edit/i });
    fireEvent.click(editBtns[0] as Element);
    expect(screen.getByTestId('sheet')).toBeTruthy();
    expect(screen.getByText('Edit Organization')).toBeTruthy();
    const submitButton = screen.getByRole('button', { name: /update organization/i });
    expect(submitButton.className).toContain('w-full');
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
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    fireEvent.submit(getNameInput().closest('form')!);
    expect(screen.getByText('Organization name is required')).toBeTruthy();
  });

  it('shows error when name shorter than 2 chars', () => {
    openCreateSheet();
    const nameInput = getNameInput();
    fireEvent.change(nameInput, { target: { value: 'A' } });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    fireEvent.submit(nameInput.closest('form')!);
    expect(screen.getByText('Organization name must be at least 2 characters')).toBeTruthy();
  });

  it('calls mutateAsync with trimmed name on valid submit', async () => {
    createMutateAsync.mockResolvedValue({ id: 'new-org' });
    openCreateSheet();
    const nameInput = getNameInput();
    fireEvent.change(nameInput, { target: { value: '  MyOrg  ' } });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    fireEvent.submit(nameInput.closest('form')!);
    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ name: 'MyOrg' }));
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

  it('adds tag on add icon button click', () => {
    openCreateSheet();
    const input = getRegionsInput();
    fireEvent.change(input, { target: { value: 'US' } });
    fireEvent.click(screen.getByRole('button', { name: /add operating regions/i }));
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

  it('removes tag via icon button', () => {
    openCreateSheet();
    const input = getRegionsInput();
    fireEvent.change(input, { target: { value: 'EU' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('EU')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /remove eu/i }));
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

  function firstDeleteButton() {
    const button = screen.getAllByRole('button', { name: /delete/i })[0];
    if (!button) throw new Error('Expected a delete button to be rendered');
    return button;
  }

  it('delete button opens confirm dialog', () => {
    render(wrap(<OrgPage />));
    expect(screen.queryByTestId('alert-dialog')).toBeNull();
    fireEvent.click(firstDeleteButton());
    expect(screen.getByTestId('alert-dialog')).toBeTruthy();
    expect(screen.getByText('Delete organization?')).toBeTruthy();
  });

  it('cancel closes confirm dialog without calling mutateAsync', () => {
    render(wrap(<OrgPage />));
    fireEvent.click(firstDeleteButton());
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByTestId('alert-dialog')).toBeNull();
    expect(deleteMutateAsync).not.toHaveBeenCalled();
  });

  it('confirm calls mutateAsync with correct orgId', async () => {
    deleteMutateAsync.mockResolvedValue(undefined);
    render(wrap(<OrgPage />));
    fireEvent.click(firstDeleteButton());
    const confirmBtn = screen
      .getAllByRole('button', { name: /delete/i })
      .find((btn) => btn.closest('[data-testid="alert-dialog"]'));
    if (!confirmBtn) throw new Error('Expected a delete confirmation button to be rendered');
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(deleteMutateAsync).toHaveBeenCalledWith(ORG_1.id);
    });
  });
});
