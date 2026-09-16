import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createIcoreI18n, ICORE_LOCALES } from '@icore/template-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RequirementEvidence } from '@icore/shared';

let mockEvidence: RequirementEvidence[] = [];
const createMutate = vi.fn();
const updateMutate = vi.fn();
const deleteMutate = vi.fn();
const reviewMutate = vi.fn();
const notifyError = vi.fn();

vi.mock('@/queries/controls', () => ({
  useControlEvidence: () => ({ data: mockEvidence }),
  useCreateControlEvidence: () => ({ mutate: createMutate, isPending: false }),
}));

vi.mock('@/queries/evidence', () => ({
  useUpdateEvidence: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteEvidence: () => ({ mutate: deleteMutate, isPending: false }),
  useReviewEvidence: () => ({ mutate: reviewMutate, isPending: false }),
}));

vi.mock('@icore/template-shared', async () => {
  const actual = await vi.importActual('@icore/template-shared');
  return {
    ...actual,
    useNotify: () => ({ error: notifyError, success: vi.fn() }),
  };
});

const i18n = createIcoreI18n({ resources: ICORE_LOCALES });

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient();
  return (
    <QueryClientProvider client={qc}>
      <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>
    </QueryClientProvider>
  );
}

const EVIDENCE: RequirementEvidence = {
  id: 'ev-1',
  orgId: 'org1',
  controlId: 'control-1',
  title: 'Firewall config export',
  owner: 'Network Team',
  evidenceType: 'config',
  source: 'internal',
  collectionDate: '2026-09-01T00:00:00.000Z',
  periodCovered: '2026-Q3',
  expirationDate: '2027-09-01T00:00:00.000Z',
  verificationStatus: 'pending_review',
  createdBy: 'creator-1',
  verifiedBy: null,
  verifiedAt: null,
};

describe('EvidencePanel', () => {
  beforeEach(() => {
    mockEvidence = [];
    createMutate.mockReset();
    updateMutate.mockReset();
    deleteMutate.mockReset();
    reviewMutate.mockReset();
    notifyError.mockClear();
  });

  it('renders an empty state with no evidence', async () => {
    const { EvidencePanel } = await import('../EvidencePanel');
    render(
      wrap(
        <EvidencePanel orgId="org1" ownerType="control" ownerId="control-1" currentUserId="me" />,
      ),
    );
    expect(screen.getByText(/no evidence/i)).toBeTruthy();
  });

  it('renders an evidence item with its verification badge', async () => {
    mockEvidence = [EVIDENCE];
    const { EvidencePanel } = await import('../EvidencePanel');
    render(
      wrap(
        <EvidencePanel orgId="org1" ownerType="control" ownerId="control-1" currentUserId="me" />,
      ),
    );
    expect(screen.getByText('Firewall config export')).toBeTruthy();
  });

  it('submits the create form with all fields', async () => {
    const { EvidencePanel } = await import('../EvidencePanel');
    render(
      wrap(
        <EvidencePanel orgId="org1" ownerType="control" ownerId="control-1" currentUserId="me" />,
      ),
    );
    fireEvent.click(screen.getByText(/add evidence/i));
    fireEvent.change(screen.getByPlaceholderText(/title/i), { target: { value: 'New evidence' } });
    fireEvent.click(screen.getByText(/^save$/i));
    // verificationStatus/verifiedBy/verifiedAt/createdBy are forced server-side —
    // the create hooks' narrowed input types omit them, so the client must not send them.
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'New evidence' }),
      expect.anything(),
    );
    const [submittedPayload] = createMutate.mock.calls[0];
    expect(submittedPayload).not.toHaveProperty('verificationStatus');
    expect(submittedPayload).not.toHaveProperty('verifiedBy');
    expect(submittedPayload).not.toHaveProperty('verifiedAt');
    expect(submittedPayload).not.toHaveProperty('createdBy');
  });

  it('shows verify/reject actions only when the current user is not the creator', async () => {
    mockEvidence = [EVIDENCE];
    const { EvidencePanel } = await import('../EvidencePanel');
    const { rerender } = render(
      wrap(
        <EvidencePanel
          orgId="org1"
          ownerType="control"
          ownerId="control-1"
          currentUserId="creator-1"
        />,
      ),
    );
    expect(screen.queryByText(/^verify$/i)).toBeNull();

    rerender(
      wrap(
        <EvidencePanel
          orgId="org1"
          ownerType="control"
          ownerId="control-1"
          currentUserId="someone-else"
        />,
      ),
    );
    expect(screen.getByText(/^verify$/i)).toBeTruthy();
  });

  it('does not delete immediately, requires confirming the AlertDialog first', async () => {
    mockEvidence = [EVIDENCE];
    const { EvidencePanel } = await import('../EvidencePanel');
    render(
      wrap(
        <EvidencePanel orgId="org1" ownerType="control" ownerId="control-1" currentUserId="me" />,
      ),
    );
    fireEvent.click(screen.getByText(/delete/i));
    expect(deleteMutate).not.toHaveBeenCalled();

    const alertDialog = screen.getByRole('alertdialog');
    fireEvent.click(within(alertDialog).getByRole('button', { name: /^delete$/i }));
    expect(deleteMutate).toHaveBeenCalledWith('ev-1', expect.anything());
  });

  it('shows an empty create form after editing an item and cancelling', async () => {
    mockEvidence = [EVIDENCE];
    const { EvidencePanel } = await import('../EvidencePanel');
    render(
      wrap(
        <EvidencePanel orgId="org1" ownerType="control" ownerId="control-1" currentUserId="me" />,
      ),
    );
    fireEvent.click(screen.getByText(/^edit$/i));
    expect((screen.getByPlaceholderText(/title/i) as HTMLInputElement).value).toBe(
      EVIDENCE.title,
    );
    fireEvent.click(screen.getByText(/^cancel$/i));

    fireEvent.click(screen.getByText(/add evidence/i));
    expect((screen.getByPlaceholderText(/title/i) as HTMLInputElement).value).toBe('');
  });

  it('can open an item with an undefined expirationDate for edit, then the create form, without crashing', async () => {
    mockEvidence = [{ ...EVIDENCE, expirationDate: undefined as unknown as string }];
    const { EvidencePanel } = await import('../EvidencePanel');
    render(
      wrap(
        <EvidencePanel orgId="org1" ownerType="control" ownerId="control-1" currentUserId="me" />,
      ),
    );
    expect(() => fireEvent.click(screen.getByText(/^edit$/i))).not.toThrow();
    fireEvent.click(screen.getByText(/^cancel$/i));

    expect(() => fireEvent.click(screen.getByText(/add evidence/i))).not.toThrow();
    expect((screen.getByPlaceholderText(/title/i) as HTMLInputElement).value).toBe('');
  });

  it('notifies on error when a mutation fails', async () => {
    mockEvidence = [EVIDENCE];
    createMutate.mockImplementation((_payload, opts) => opts.onError());
    const { EvidencePanel } = await import('../EvidencePanel');
    render(
      wrap(
        <EvidencePanel orgId="org1" ownerType="control" ownerId="control-1" currentUserId="me" />,
      ),
    );
    fireEvent.click(screen.getByText(/add evidence/i));
    fireEvent.change(screen.getByPlaceholderText(/title/i), { target: { value: 'New evidence' } });
    fireEvent.click(screen.getByText(/^save$/i));

    expect(notifyError).toHaveBeenCalled();
  });
});
