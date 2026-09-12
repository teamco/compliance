import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ControlsTable } from '../ControlsTable';
import type { InternalControl } from '@icore/shared';

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}));

function buildControl(overrides: Partial<InternalControl> = {}): InternalControl {
  return {
    id: 'ctl-1',
    code: 'AC-01',
    title: 'Access Control Policy',
    description: 'Restrict access to systems',
    domain: 'Access Control',
    owner: 'Jane Doe',
    category: 'Access Control',
    implementationStatus: 'implemented',
    operatingEffectiveness: 'effective',
    frameworkMappings: [],
    evidenceCount: 0,
    findingsCount: 0,
    ...overrides,
  };
}

describe('ControlsTable', () => {
  it('renders control code, title, domain, and owner', () => {
    render(<ControlsTable controls={[buildControl()]} showGapsOnly={false} />);
    expect(screen.getByText('AC-01')).toBeTruthy();
    expect(screen.getByText('Access Control Policy')).toBeTruthy();
    expect(screen.getByText('Access Control')).toBeTruthy();
    expect(screen.getByText('Jane Doe')).toBeTruthy();
  });

  it('renders the effectiveness dot and label for each status', () => {
    render(
      <ControlsTable
        controls={[buildControl({ operatingEffectiveness: 'partially_effective' })]}
        showGapsOnly={false}
      />,
    );
    expect(screen.getByText(/🟠/)).toBeTruthy();
    expect(screen.getByText(/partially effective/)).toBeTruthy();
  });

  it('renders up to two framework names plus a +N overflow count', () => {
    const control = buildControl({
      frameworkMappings: [
        { frameworkId: 'fw-1', frameworkName: 'SOC 2', requirementCode: 'CC6.1' },
        { frameworkId: 'fw-2', frameworkName: 'ISO 27001', requirementCode: 'A.9.1' },
        { frameworkId: 'fw-3', frameworkName: 'GDPR', requirementCode: 'Art.32' },
      ],
    });
    render(<ControlsTable controls={[control]} showGapsOnly={false} />);
    expect(screen.getByText('SOC 2, ISO 27001 +1')).toBeTruthy();
  });

  it('renders evidence and findings counts', () => {
    render(
      <ControlsTable
        controls={[buildControl({ evidenceCount: 3, findingsCount: 2 })]}
        showGapsOnly={false}
      />,
    );
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('navigates to the control detail route when a row is clicked', () => {
    render(<ControlsTable controls={[buildControl({ id: 'ctl-42' })]} showGapsOnly={false} />);
    screen.getByText('AC-01').closest('tr')?.click();
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/controls/$id',
      params: { id: 'ctl-42' },
    });
  });

  it('filters to gap rows when showGapsOnly=true', () => {
    const ineffective = buildControl({
      id: 'ctl-2',
      code: 'AC-02',
      operatingEffectiveness: 'ineffective',
    });
    const effective = buildControl({ id: 'ctl-1', code: 'AC-01' });
    render(<ControlsTable controls={[effective, ineffective]} showGapsOnly={true} />);
    expect(screen.getByText('AC-02')).toBeTruthy();
    expect(screen.queryByText('AC-01')).toBeNull();
  });

  it('renders empty state when there are no controls', () => {
    render(<ControlsTable controls={[]} showGapsOnly={false} />);
    expect(screen.getByText('controls.noControls')).toBeTruthy();
  });
});
