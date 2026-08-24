// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DspSelect } from './DspSelect';

describe('DspSelect', () => {
  afterEach(cleanup);

  it('supports keyboard selection, escape and outside dismissal', () => {
    const onChange = vi.fn();
    render(
      <div>
        <DspSelect
          ariaLabel="Compute backend"
          value="cpu"
          options={[
            { value: 'cpu', label: 'CPU SIMD', detail: 'Local processor' },
            { value: 'cuda', label: 'CUDA', detail: 'NVIDIA GPU' },
          ]}
          onChange={onChange}
        />
        <button type="button">Outside</button>
      </div>,
    );

    const trigger = screen.getByRole('combobox', { name: 'Compute backend' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('cuda');

    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(trigger);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }));
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });
});
