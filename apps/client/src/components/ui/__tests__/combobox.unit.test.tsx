import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Combobox } from '../combobox';

// Mock ResizeObserver which cmdk requires
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

// Mock scrollIntoView which cmdk uses
Element.prototype.scrollIntoView = vi.fn();

describe('Combobox', () => {
  const options = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows placeholder when no value is selected', () => {
    render(<Combobox options={options} value="" onChange={vi.fn()} placeholder="Pick one" />);
    const combobox = screen.getByRole('combobox');
    expect(combobox.textContent).toContain('Pick one');
  });

  it('shows the selected option label', () => {
    render(<Combobox options={options} value="b" onChange={vi.fn()} />);
    const combobox = screen.getByRole('combobox');
    expect(combobox.textContent).toContain('Beta');
  });

  it('opens the list and calls onChange when an option is clicked', () => {
    const onChange = vi.fn();
    render(<Combobox options={options} value="" onChange={onChange} />);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByText('Alpha'));
    expect(onChange).toHaveBeenCalledWith('a');
  });
});
