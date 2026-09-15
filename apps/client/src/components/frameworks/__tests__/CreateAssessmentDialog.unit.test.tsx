import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createIcoreI18n, ICORE_LOCALES } from '@icore/template-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { InternalControl } from '@icore/shared';

class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView = vi.fn();

const mockControls: InternalControl[] = [
  {
    id: 'ctrl1',
    orgId: 'org1',
    code: 'POL-001',
    title: 'Policy Review',
    description: 'd',
    owner: 'Sec',
  },
  {
    id: 'ctrl2',
    orgId: 'org1',
    code: 'AC-001',
    title: 'Access Control',
    description: 'd',
    owner: 'Sec',
  },
];

const mockCreateMutate = vi.fn();

vi.mock('@/queries/controls', () => ({
  useCreateControlAssessment: () => ({ mutate: mockCreateMutate, isPending: false }),
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

describe('CreateAssessmentDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  async function renderDialog(props: { controlId?: string } = {}) {
    const { CreateAssessmentDialog } = await import('../CreateAssessmentDialog');
    render(
      wrap(
        <CreateAssessmentDialog
          open={true}
          onOpenChange={vi.fn()}
          orgId="org1"
          controlId={props.controlId}
          controls={mockControls}
        />,
      ),
    );
  }

  it('shows a Control picker when no controlId prop is given', async () => {
    await renderDialog();
    expect(screen.getByText('Control')).toBeDefined();
    expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0);
  });

  it('hides the Control picker when a controlId prop is given', async () => {
    await renderDialog({ controlId: 'ctrl1' });
    expect(screen.queryByText('Control')).toBeNull();
  });

  it('has Cancel in the footer and disables submit until required fields are filled', async () => {
    await renderDialog({ controlId: 'ctrl1' });
    const submit = screen.getByRole('button', { name: 'Create Assessment' });
    expect(submit).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDefined();
  });

  it('submits with the picked control, cycle name, assessor, and date', async () => {
    await renderDialog();

    const [controlCombobox] = screen.getAllByRole('combobox');
    fireEvent.click(controlCombobox);
    fireEvent.click(screen.getByRole('option', { name: 'POL-001 — Policy Review' }));

    fireEvent.change(screen.getByLabelText('Cycle Name'), {
      target: { value: '2026 Annual Review' },
    });
    fireEvent.change(screen.getByLabelText('Assessor'), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByLabelText('Assessment Date'), {
      target: { value: '2026-09-15' },
    });

    const submit = screen.getByRole('button', { name: 'Create Assessment' });
    expect(submit).toHaveProperty('disabled', false);
    fireEvent.click(submit);

    expect(mockCreateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        cycleName: '2026 Annual Review',
        assessor: 'Jane Doe',
        assessmentDate: '2026-09-15',
      }),
      expect.any(Object),
    );
  });
});
