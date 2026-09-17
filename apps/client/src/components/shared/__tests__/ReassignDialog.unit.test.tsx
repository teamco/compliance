import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createIcoreI18n, ICORE_LOCALES } from '@icore/template-shared';
import { ReassignDialog } from '../ReassignDialog';

// ReassignDialog renders translated labels (e.g. "Reassign") via t(), so tests
// need a real i18n instance -- without I18nextProvider, t() returns raw keys
// (e.g. "reassign.confirm") and the assertions below wouldn't match.
const i18n = createIcoreI18n({ resources: ICORE_LOCALES });

function wrap(ui: React.ReactElement) {
  return <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>;
}

// Mock ResizeObserver and scrollIntoView which cmdk (used by Combobox)
// requires -- without these, tests hang. Matches the same boilerplate
// already used in IssueDetailSheet.unit.test.tsx and combobox.unit.test.tsx.
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

const MEMBERS = [
  { userId: 'user-1', displayName: 'Alice', email: 'alice@example.com' },
  { userId: 'user-2', displayName: 'Bob', email: 'bob@example.com' },
];

describe('ReassignDialog', () => {
  it('disables Reassign until a member is picked', () => {
    const onConfirm = vi.fn();
    render(
      wrap(
        <ReassignDialog
          open
          isPending={false}
          title="Reassign Owner"
          members={MEMBERS}
          currentAssigneeId="user-1"
          onOpenChange={vi.fn()}
          onConfirm={onConfirm}
        />,
      ),
    );
    expect(screen.getByRole('button', { name: 'Reassign' })).toHaveProperty('disabled', true);
  });

  it('calls onConfirm with the picked member id', () => {
    const onConfirm = vi.fn();
    render(
      wrap(
        <ReassignDialog
          open
          isPending={false}
          title="Reassign Owner"
          members={MEMBERS}
          currentAssigneeId="user-1"
          onOpenChange={vi.fn()}
          onConfirm={onConfirm}
        />,
      ),
    );
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByText('Bob'));
    fireEvent.click(screen.getByRole('button', { name: 'Reassign' }));
    expect(onConfirm).toHaveBeenCalledWith('user-2');
  });
});
