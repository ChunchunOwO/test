// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { UiScaleControl } from './SettingsPrimitives';

const renderScaleControl = (value: number) => (
  <UiScaleControl
    decreaseLabel="Decrease UI scale"
    increaseLabel="Increase UI scale"
    max={150}
    min={75}
    onChange={vi.fn()}
    presets={[
      { label: 'Standard', value: 100 },
      { label: 'Large', value: 150 },
    ]}
    presetsLabel="Common UI scale sizes"
    resetLabel="Reset to default"
    shortcutHint="Ctrl plus or minus; Ctrl 0 resets."
    step={5}
    value={value}
    valueLabel="UI scale"
  />
);

afterEach(() => {
  cleanup();
  delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

describe('UiScaleControl', () => {
  it('offers a clear default recovery action', () => {
    const onChange = vi.fn();
    render(
      <UiScaleControl
        decreaseLabel="Decrease UI scale"
        increaseLabel="Increase UI scale"
        max={150}
        min={75}
        onChange={onChange}
        presets={[{ label: 'Standard', value: 100 }]}
        presetsLabel="Common UI scale sizes"
        resetLabel="Reset to default"
        shortcutHint="Ctrl 0 resets."
        step={5}
        value={125}
        valueLabel="UI scale"
      />,
    );

    screen.getByRole('button', { name: 'Reset to default' }).click();
    expect(onChange).toHaveBeenCalledWith(100);
  });

  it('keeps the focused recovery controls centered after native zoom changes', async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    const { rerender } = render(renderScaleControl(100));

    screen.getByRole('button', { name: 'Increase UI scale' }).focus();
    rerender(renderScaleControl(105));

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({
      block: 'center',
      inline: 'nearest',
    }));
  });
});
