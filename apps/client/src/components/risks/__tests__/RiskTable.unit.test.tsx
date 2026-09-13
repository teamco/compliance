import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RiskTable } from '../RiskTable';
import type { Risk, RiskTaxonomyCategory } from '@icore/shared';

function buildRisk(overrides: Partial<Risk> = {}): Risk {
  return {
    id: 'risk-1',
    riskId: 'RISK-001',
    orgId: 'org1',
    userId: 'user1',
    title: 'Ransomware exposure',
    riskStatement: 'Because of unpatched systems, ransomware could occur.',
    taxonomyCategoryId: 'cat-1',
    ownerId: 'Alice',
    source: 'manual',
    assetIds: [],
    vendorIds: [],
    methodologyId: 'm1',
    inherentLikelihood: 4,
    inherentImpact: 4,
    inherentScore: 16,
    inherentLabel: 'critical',
    status: 'open',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const taxonomy: RiskTaxonomyCategory[] = [
  {
    id: 'cat-1',
    orgId: 'org1',
    name: 'Cyber Security',
    archived: false,
    createdAt: '2026-01-01T00:00:00Z',
  },
];

function getRow(text: string) {
  return screen.getByText(text).closest('tr') as HTMLTableRowElement;
}

describe('RiskTable', () => {
  it('renders risk ID, title, category, owner, and inherent score', () => {
    render(
      <RiskTable
        risks={[buildRisk()]}
        taxonomy={taxonomy}
        onRowClick={vi.fn()}
        onDeleteClick={vi.fn()}
      />,
    );
    expect(screen.getByText('RISK-001')).toBeTruthy();
    expect(screen.getByText('Ransomware exposure')).toBeTruthy();
    expect(screen.getByText('Cyber Security')).toBeTruthy();
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('16 · critical')).toBeTruthy();
  });

  it('renders the residual score when present', () => {
    render(
      <RiskTable
        risks={[buildRisk({ residualScore: 8, residualLabel: 'high' })]}
        taxonomy={taxonomy}
        onRowClick={vi.fn()}
        onDeleteClick={vi.fn()}
      />,
    );
    expect(screen.getByText('8 · high')).toBeTruthy();
  });

  it('renders a dash for residual score when absent', () => {
    render(
      <RiskTable
        risks={[buildRisk()]}
        taxonomy={taxonomy}
        onRowClick={vi.fn()}
        onDeleteClick={vi.fn()}
      />,
    );
    const row = getRow('RISK-001');
    const cells = row.querySelectorAll('td');
    expect(cells[5].textContent).toBe('—');
  });

  it('calls onRowClick with the risk id when a row is clicked', () => {
    const onRowClick = vi.fn();
    render(
      <RiskTable
        risks={[buildRisk({ id: 'risk-42' })]}
        taxonomy={taxonomy}
        onRowClick={onRowClick}
        onDeleteClick={vi.fn()}
      />,
    );
    fireEvent.click(getRow('RISK-001'));
    expect(onRowClick).toHaveBeenCalledWith('risk-42');
  });

  it('calls onDeleteClick with the risk id without triggering onRowClick', () => {
    const onRowClick = vi.fn();
    const onDeleteClick = vi.fn();
    render(
      <RiskTable
        risks={[buildRisk({ id: 'risk-7' })]}
        taxonomy={taxonomy}
        onRowClick={onRowClick}
        onDeleteClick={onDeleteClick}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onDeleteClick).toHaveBeenCalledWith('risk-7');
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('renders empty state when there are no risks', () => {
    render(
      <RiskTable risks={[]} taxonomy={taxonomy} onRowClick={vi.fn()} onDeleteClick={vi.fn()} />,
    );
    expect(screen.getByText('risks.empty')).toBeTruthy();
  });

  describe('above-appetite indicator', () => {
    it('renders a warning glyph when true', () => {
      render(
        <RiskTable
          risks={[buildRisk({ aboveAppetite: true })]}
          taxonomy={taxonomy}
          onRowClick={vi.fn()}
          onDeleteClick={vi.fn()}
        />,
      );
      const cells = getRow('RISK-001').querySelectorAll('td');
      expect(cells[6].textContent).toBe('⚠');
    });

    it('renders a check glyph when false', () => {
      render(
        <RiskTable
          risks={[buildRisk({ aboveAppetite: false })]}
          taxonomy={taxonomy}
          onRowClick={vi.fn()}
          onDeleteClick={vi.fn()}
        />,
      );
      const cells = getRow('RISK-001').querySelectorAll('td');
      expect(cells[6].textContent).toBe('✓');
    });

    it('renders a dash when undefined', () => {
      render(
        <RiskTable
          risks={[buildRisk({ aboveAppetite: undefined })]}
          taxonomy={taxonomy}
          onRowClick={vi.fn()}
          onDeleteClick={vi.fn()}
        />,
      );
      const cells = getRow('RISK-001').querySelectorAll('td');
      expect(cells[6].textContent).toBe('—');
    });
  });
});
