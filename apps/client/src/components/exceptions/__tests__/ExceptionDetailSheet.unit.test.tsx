import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExceptionDetailSheet } from '../ExceptionDetailSheet';
import type { Exception } from '@icore/shared';

let mockCurrentUserId = 'owner-1';

vi.mock('@icore/template-shared', async () => {
  const actual = await vi.importActual('@icore/template-shared');
  return {
    ...actual,
    useAuthStore: (selector: (s: { user: { id: string } }) => unknown) =>
      selector({ user: { id: mockCurrentUserId } }),
    useNotify: () => ({ success: vi.fn(), error: vi.fn() }),
  };
});

vi.mock('@/queries/risks', () => ({
  useRisks: () => ({
    data: [{ id: 'risk-1', title: 'Unpatched legacy server' }],
  }),
}));

vi.mock('@/queries/org-members', () => ({
  useOrgMembers: () => ({
    data: [
      {
        userId: 'owner-1',
        displayName: 'Org Owner',
        email: 'org-owner@example.com',
        role: 'owner',
      },
      {
        userId: 'reviewer-1',
        displayName: 'Reviewer One',
        email: 'reviewer@example.com',
        role: 'viewer',
      },
    ],
  }),
}));

const mockRequest = vi.fn();
const mockReview = vi.fn();
const mockApprove = vi.fn();
const mockReject = vi.fn();
const mockReassignOwner = vi.fn();
let mockRenewals: unknown[] = [];

vi.mock('@/queries/exceptions', () => ({
  useExceptionRenewals: () => ({ data: mockRenewals }),
  useRequestExceptionRenewal: () => ({ mutate: mockRequest, isPending: false }),
  useReviewExceptionRenewal: () => ({ mutate: mockReview, isPending: false }),
  useApproveException: () => ({ mutate: mockApprove, isPending: false }),
  useRejectException: () => ({ mutate: mockReject, isPending: false }),
  useReassignExceptionOwner: () => ({ mutate: mockReassignOwner, isPending: false }),
}));

const baseException: Exception = {
  id: 'exception-1',
  orgId: 'org-1',
  userId: 'owner-1',
  controlCode: 'AC-2',
  standardCode: 'AC',
  frameworkId: 'framework-1',
  title: 'MFA exception for legacy vendor portal',
  statement: 'Legacy vendor portal cannot support MFA',
  justification: 'Vendor contract ends in Q2',
  ownerId: 'owner-1',
  compensatingControls: 'IP allowlisting',
  status: 'pending',
  expiresAt: null,
  riskId: 'risk-1',
  reviewFrequencyDays: null,
  reviewedBy: null,
  reviewedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function renderSheet(exception: Exception, onOpenChange: (open: boolean) => void = vi.fn()) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <ExceptionDetailSheet
        exception={exception}
        orgId="org-1"
        open={true}
        onOpenChange={onOpenChange}
      />
    </QueryClientProvider>,
  );
}

describe('ExceptionDetailSheet', () => {
  beforeEach(() => {
    mockRequest.mockClear();
    mockReview.mockClear();
    mockApprove.mockClear();
    mockReject.mockClear();
    mockReassignOwner.mockClear();
    mockRenewals = [];
    mockCurrentUserId = 'owner-1';
  });

  it('shows an Owner row with a reassign control for a manager', () => {
    renderSheet(baseException);
    expect(screen.getByText('Org Owner')).toBeDefined();
    // This suite has no i18next instance mocked, so `t()` returns the raw
    // key (same convention as every other assertion here, e.g.
    // 'exceptions.status.pending') rather than translated copy.
    expect(screen.getByRole('button', { name: 'exceptions.detail.reassignOwner' })).toBeDefined();
  });

  it('renders the overview tab with statement/justification/status/linked-risk by default', () => {
    renderSheet(baseException);
    expect(screen.getByText('Legacy vendor portal cannot support MFA')).toBeDefined();
    expect(screen.getByText('Vendor contract ends in Q2')).toBeDefined();
    expect(screen.getByText('exceptions.status.pending')).toBeDefined();
    expect(screen.getByText('Unpatched legacy server')).toBeDefined();
  });

  describe('as the owner, on a lapsed approved exception', () => {
    beforeEach(() => {
      mockCurrentUserId = 'owner-1';
    });

    it('shows the renewal request inputs, and enables the button once filled', () => {
      renderSheet({
        ...baseException,
        status: 'approved',
        expiresAt: '2020-01-01T00:00:00Z',
      });
      fireEvent.click(screen.getByText('exceptions.detail.tab.renewal'));

      expect(screen.getByText('exceptions.detail.proposedExpiresAt')).toBeDefined();
      expect(screen.getByText('exceptions.detail.renewalJustification')).toBeDefined();
      expect(screen.queryByText('exceptions.detail.requestRenewal')).toBeNull();

      fireEvent.change(screen.getByLabelText('exceptions.detail.proposedExpiresAt'), {
        target: { value: '2026-12-01' },
      });
      fireEvent.change(screen.getByLabelText('exceptions.detail.renewalJustification'), {
        target: { value: 'Vendor migration delayed' },
      });

      expect(screen.getByText('exceptions.detail.requestRenewal')).toBeDefined();
    });

    it('calls the request mutation with the proposed expiry and justification', () => {
      renderSheet({
        ...baseException,
        status: 'approved',
        expiresAt: '2020-01-01T00:00:00Z',
      });
      fireEvent.click(screen.getByText('exceptions.detail.tab.renewal'));

      fireEvent.change(screen.getByLabelText('exceptions.detail.proposedExpiresAt'), {
        target: { value: '2026-12-01' },
      });
      fireEvent.change(screen.getByLabelText('exceptions.detail.renewalJustification'), {
        target: { value: 'Vendor migration delayed' },
      });
      fireEvent.click(screen.getByText('exceptions.detail.requestRenewal'));

      expect(mockRequest).toHaveBeenCalledWith(
        {
          id: 'exception-1',
          data: { proposedExpiresAt: '2026-12-01', justification: 'Vendor migration delayed' },
        },
        expect.anything(),
      );
    });
  });

  describe('as a different user with a pending renewal', () => {
    beforeEach(() => {
      mockCurrentUserId = 'reviewer-1';
      mockRenewals = [
        {
          id: 'renewal-1',
          exceptionId: 'exception-1',
          orgId: 'org-1',
          requestedBy: 'owner-1',
          proposedExpiresAt: '2026-06-01T00:00:00Z',
          justification: 'Need more time',
          status: 'pending',
          reviewedBy: null,
          reviewNotes: null,
          reviewedAt: null,
          createdAt: '2026-01-01T00:00:00Z',
        },
      ];
    });

    it('shows Approve/Reject buttons, Reject disabled until notes are typed', () => {
      renderSheet({ ...baseException, status: 'approved' });
      fireEvent.click(screen.getByText('exceptions.detail.tab.renewal'));

      expect(screen.getByText('exceptions.detail.approveRenewal')).toBeDefined();
      const rejectButton = screen.getByText('exceptions.detail.rejectRenewal') as HTMLButtonElement;
      expect(rejectButton.disabled).toBe(true);

      fireEvent.change(screen.getByPlaceholderText('exceptions.detail.rejectNotesPlaceholder'), {
        target: { value: 'Not justified' },
      });
      expect(rejectButton.disabled).toBe(false);
    });

    it('calls the review mutation with an approved decision when Approve Renewal is clicked', () => {
      renderSheet({ ...baseException, status: 'approved' });
      fireEvent.click(screen.getByText('exceptions.detail.tab.renewal'));
      fireEvent.click(screen.getByText('exceptions.detail.approveRenewal'));

      expect(mockReview).toHaveBeenCalledWith(
        { id: 'renewal-1', exceptionId: 'exception-1', decision: 'approved' },
        expect.anything(),
      );
    });

    it('calls the review mutation with a rejected decision and the typed notes', () => {
      renderSheet({ ...baseException, status: 'approved' });
      fireEvent.click(screen.getByText('exceptions.detail.tab.renewal'));
      fireEvent.change(screen.getByPlaceholderText('exceptions.detail.rejectNotesPlaceholder'), {
        target: { value: 'Compensating controls are insufficient' },
      });
      fireEvent.click(screen.getByText('exceptions.detail.rejectRenewal'));

      expect(mockReview).toHaveBeenCalledWith(
        {
          id: 'renewal-1',
          exceptionId: 'exception-1',
          decision: 'rejected',
          reviewNotes: 'Compensating controls are insufficient',
        },
        expect.anything(),
      );
    });
  });

  describe('renewal history with resolved entries', () => {
    beforeEach(() => {
      mockCurrentUserId = 'reviewer-1';
      mockRenewals = [
        {
          id: 'renewal-2',
          exceptionId: 'exception-1',
          orgId: 'org-1',
          requestedBy: 'owner-1',
          proposedExpiresAt: '2026-06-01T00:00:00Z',
          justification: 'Second extension',
          status: 'rejected',
          reviewedBy: 'reviewer-1',
          reviewNotes: 'Vendor migration should have completed by now',
          reviewedAt: '2026-02-01T00:00:00Z',
          createdAt: '2026-01-15T00:00:00Z',
        },
        {
          id: 'renewal-1',
          exceptionId: 'exception-1',
          orgId: 'org-1',
          requestedBy: 'owner-1',
          proposedExpiresAt: '2026-03-01T00:00:00Z',
          justification: 'First extension',
          status: 'approved',
          reviewedBy: 'reviewer-1',
          reviewNotes: null,
          reviewedAt: '2026-01-10T00:00:00Z',
          createdAt: '2026-01-01T00:00:00Z',
        },
      ];
    });

    it('renders every resolved entry with its status, date and review notes', () => {
      renderSheet({ ...baseException, status: 'approved' });
      fireEvent.click(screen.getByText('exceptions.detail.tab.renewal'));

      expect(screen.getByText('exceptions.detail.renewalHistory')).toBeDefined();
      expect(
        screen.getByText(/exceptions\.detail\.renewalHistoryStatus\.rejected — 2026-06-01/),
      ).toBeDefined();
      expect(
        screen.getByText(/exceptions\.detail\.renewalHistoryStatus\.approved — 2026-03-01/),
      ).toBeDefined();
      expect(screen.getByText('Vendor migration should have completed by now')).toBeDefined();
    });
  });

  describe('as the owner themselves, with a pending renewal', () => {
    beforeEach(() => {
      mockCurrentUserId = 'owner-1';
      mockRenewals = [
        {
          id: 'renewal-1',
          exceptionId: 'exception-1',
          orgId: 'org-1',
          requestedBy: 'owner-1',
          proposedExpiresAt: '2026-06-01T00:00:00Z',
          justification: 'Need more time',
          status: 'pending',
          reviewedBy: null,
          reviewNotes: null,
          reviewedAt: null,
          createdAt: '2026-01-01T00:00:00Z',
        },
      ];
    });

    it('hides Approve/Reject renewal controls (self-review blocked)', () => {
      renderSheet({ ...baseException, status: 'approved' });
      fireEvent.click(screen.getByText('exceptions.detail.tab.renewal'));

      expect(screen.queryByText('exceptions.detail.approveRenewal')).toBeNull();
      expect(screen.queryByText('exceptions.detail.rejectRenewal')).toBeNull();
    });
  });

  describe('base exception approve/reject', () => {
    it('renders for a non-owner user when status is pending', () => {
      mockCurrentUserId = 'reviewer-1';
      renderSheet({ ...baseException, status: 'pending' });
      expect(screen.getByText('exceptions.approve')).toBeDefined();
      expect(screen.getByText('exceptions.reject')).toBeDefined();
    });

    it('does not render for the owner even when status is pending', () => {
      mockCurrentUserId = 'owner-1';
      renderSheet({ ...baseException, status: 'pending' });
      expect(screen.queryByText('exceptions.approve')).toBeNull();
      expect(screen.queryByText('exceptions.reject')).toBeNull();
    });
  });
});
