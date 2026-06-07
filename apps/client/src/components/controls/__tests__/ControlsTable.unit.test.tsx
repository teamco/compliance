import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ControlsTable } from '../ControlsTable';
import type { Framework, StandardControl } from '../../../queries/notes';

const fw1: Framework = {
  id: 'fw-1',
  slug: 'soc2',
  name: 'SOC 2',
  description: '',
  version: '2017',
  category: 'security',
};
const fw2: Framework = {
  id: 'fw-2',
  slug: 'iso27001',
  name: 'ISO 27001',
  description: '',
  version: '2022',
  category: 'security',
};

const mapped: StandardControl = {
  code: 'AC-01',
  title: 'Access Control Policy',
  description: '',
  implementation: '',
  evidence: [],
  priority: 'critical',
  category: 'Access Control',
  frameworkMappings: [{ frameworkId: 'fw-1', controlCode: 'CC6.1' }],
};
const unmapped: StandardControl = {
  code: 'AC-02',
  title: 'Account Management',
  description: '',
  implementation: '',
  evidence: [],
  priority: 'high',
  category: 'Access Control',
  frameworkMappings: [],
};

describe('ControlsTable', () => {
  it('renders framework columns as headers', () => {
    render(<ControlsTable controls={[mapped]} frameworks={[fw1, fw2]} showGapsOnly={false} />);
    expect(screen.getByText('SOC 2')).toBeTruthy();
    expect(screen.getByText('ISO 27001')).toBeTruthy();
  });

  it('renders a check cell with controlCode title for mapped framework', () => {
    render(<ControlsTable controls={[mapped]} frameworks={[fw1]} showGapsOnly={false} />);
    expect(screen.getByTitle('CC6.1')).toBeTruthy();
  });

  it('renders a dash cell for unmapped framework', () => {
    const { container } = render(
      <ControlsTable controls={[mapped]} frameworks={[fw2]} showGapsOnly={false} />,
    );
    expect(container.querySelector('[data-unmapped]')).toBeTruthy();
  });

  it('shows gap rows when showGapsOnly=true and control is not fully covered', () => {
    render(
      <ControlsTable controls={[mapped, unmapped]} frameworks={[fw1, fw2]} showGapsOnly={true} />,
    );
    expect(screen.getByText('AC-01')).toBeTruthy();
    expect(screen.getByText('AC-02')).toBeTruthy();
  });

  it('hides fully-covered rows — control covered by all selected frameworks is hidden', () => {
    render(<ControlsTable controls={[mapped, unmapped]} frameworks={[fw1]} showGapsOnly={true} />);
    expect(screen.queryByText('AC-01')).toBeNull();
    expect(screen.getByText('AC-02')).toBeTruthy();
  });

  it('renders priority badge text', () => {
    render(<ControlsTable controls={[mapped]} frameworks={[fw1]} showGapsOnly={false} />);
    expect(screen.getByText('critical')).toBeTruthy();
  });

  it('renders empty state when no controls match gaps filter', () => {
    render(<ControlsTable controls={[mapped]} frameworks={[fw1]} showGapsOnly={true} />);
    expect(screen.getByText(/no gaps/i)).toBeTruthy();
  });
});
