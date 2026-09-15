import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IssueDetailSheet } from '../IssueDetailSheet';
import type { Issue } from '@icore/shared';

// Mock ResizeObserver which cmdk (used by Combobox) requires
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

// Mock scrollIntoView which cmdk uses
Element.prototype.scrollIntoView = vi.fn();

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

vi.mock('@/queries/org-members', () => ({
  useOrgMembers: () => ({
    data: [
      { userId: 'owner-1', displayName: 'Owner One', email: 'owner@example.com' },
      { userId: 'validator-1', displayName: 'Validator One', email: 'validator@example.com' },
    ],
  }),
}));

const mockSubmit = vi.fn();
const mockReview = vi.fn();
let mockValidations: unknown[] = [];

vi.mock('@/queries/issues', () => ({
  useIssueValidations: () => ({ data: mockValidations }),
  useSubmitIssueForValidation: () => ({ mutate: mockSubmit, isPending: false }),
  useReviewIssueValidation: () => ({ mutate: mockReview, isPending: false }),
}));

const baseIssue: Issue = {
  id: 'issue-1',
  orgId: 'org-1',
  userId: 'owner-1',
  title: 'MFA not enforced',
  description: 'Admin accounts lack MFA',
  severity: 'high',
  reporterId: 'reporter-1',
  ownerId: 'owner-1',
  status: 'open',
  source: 'manual',
  sourceId: null,
  dueDate: null,
  resolvedAt: null,
  rootCause: null,
  rootCauseCategory: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function renderSheet(issue: Issue) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <IssueDetailSheet issue={issue} orgId="org-1" open={true} onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('IssueDetailSheet', () => {
  beforeEach(() => {
    mockSubmit.mockClear();
    mockReview.mockClear();
    mockValidations = [];
    mockCurrentUserId = 'owner-1';
  });

  it('renders the overview tab by default', () => {
    renderSheet(baseIssue);
    expect(screen.getByText('MFA not enforced')).toBeDefined();
    expect(screen.getByText('Admin accounts lack MFA')).toBeDefined();
  });

  it('excludes the issue owner from the validator picker', () => {
    renderSheet(baseIssue);
    fireEvent.click(screen.getByText('issues.detail.tab.validation'));
    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.queryByText('Owner One')).toBeNull();
    expect(screen.getByText('Validator One')).toBeDefined();
  });

  it('hides approve/reject controls from a non-validator (the owner) on a pending validation', () => {
    mockValidations = [
      {
        id: 'val-1',
        issueId: 'issue-1',
        orgId: 'org-1',
        requestedBy: 'owner-1',
        validatorId: 'validator-1',
        status: 'pending',
        reviewNotes: null,
        reviewedAt: null,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ];
    renderSheet({ ...baseIssue, status: 'pending_validation' });
    fireEvent.click(screen.getByText('issues.detail.tab.validation'));
    // current user is owner-1, not validator-1 -> no approve/reject buttons
    expect(screen.queryByText('issues.detail.approve')).toBeNull();
  });

  describe('as the assigned validator', () => {
    beforeEach(() => {
      mockCurrentUserId = 'validator-1';
      mockValidations = [
        {
          id: 'val-1',
          issueId: 'issue-1',
          orgId: 'org-1',
          requestedBy: 'owner-1',
          validatorId: 'validator-1',
          status: 'pending',
          reviewNotes: null,
          reviewedAt: null,
          createdAt: '2026-01-01T00:00:00Z',
        },
      ];
    });

    it('shows the approve and reject controls', () => {
      renderSheet({ ...baseIssue, status: 'pending_validation' });
      fireEvent.click(screen.getByText('issues.detail.tab.validation'));
      expect(screen.getByText('issues.detail.approve')).toBeDefined();
      expect(screen.getByText('issues.detail.reject')).toBeDefined();
    });

    it('disables reject until rejection notes are entered', () => {
      renderSheet({ ...baseIssue, status: 'pending_validation' });
      fireEvent.click(screen.getByText('issues.detail.tab.validation'));

      const rejectButton = screen.getByText('issues.detail.reject') as HTMLButtonElement;
      expect(rejectButton.disabled).toBe(true);

      fireEvent.change(screen.getByPlaceholderText('issues.detail.rejectNotesPlaceholder'), {
        target: { value: 'Root cause not addressed' },
      });
      expect(rejectButton.disabled).toBe(false);
    });

    it('calls the review mutation with an approved decision when Approve is clicked', () => {
      renderSheet({ ...baseIssue, status: 'pending_validation' });
      fireEvent.click(screen.getByText('issues.detail.tab.validation'));
      fireEvent.click(screen.getByText('issues.detail.approve'));

      expect(mockReview).toHaveBeenCalledWith(
        { id: 'val-1', issueId: 'issue-1', decision: 'approved' },
        expect.anything(),
      );
    });
  });

  it('renders validation history when present', () => {
    mockValidations = [
      {
        id: 'val-1',
        issueId: 'issue-1',
        orgId: 'org-1',
        requestedBy: 'owner-1',
        validatorId: 'validator-1',
        status: 'rejected',
        reviewNotes: 'Not fixed yet',
        reviewedAt: '2026-01-02T00:00:00Z',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ];
    renderSheet({ ...baseIssue, status: 'in_progress' });
    fireEvent.click(screen.getByText('issues.detail.tab.validation'));
    expect(screen.getByText('Not fixed yet')).toBeDefined();
  });
});
