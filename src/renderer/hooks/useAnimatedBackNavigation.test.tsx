// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAnimatedBackNavigation } from './useAnimatedBackNavigation';

type BackProbeProps = {
  enabled?: boolean;
  mounted?: boolean;
  onBack: () => void;
};

const BackProbe = ({ enabled = true, mounted = true, onBack }: BackProbeProps): JSX.Element => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  useAnimatedBackNavigation(onBack, enabled, { durationMs: 80, rootRef });

  return mounted ? <div ref={rootRef}>Detail</div> : <div>Nested detail</div>;
};

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('useAnimatedBackNavigation', () => {
  it('returns after Escape when the scoped route surface is visible', () => {
    vi.useFakeTimers();
    const onBack = vi.fn();
    render(<BackProbe onBack={onBack} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onBack).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(80));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('returns after Escape even when a hidden route search field still has focus', () => {
    vi.useFakeTimers();
    const onBack = vi.fn();
    render(
      <>
        <div hidden>
          <input defaultValue="songs query" />
        </div>
        <BackProbe onBack={onBack} />
      </>,
    );

    const hiddenSearch = document.querySelector('input');
    expect(hiddenSearch).toBeTruthy();
    fireEvent.keyDown(hiddenSearch!, { key: 'Escape' });
    act(() => vi.advanceTimersByTime(80));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('ignores Escape while typing in a visible field', () => {
    const onBack = vi.fn();
    render(
      <>
        <input defaultValue="visible query" />
        <BackProbe onBack={onBack} />
      </>,
    );

    fireEvent.keyDown(document.querySelector('input')!, { key: 'Escape' });

    expect(onBack).not.toHaveBeenCalled();
  });

  it('ignores Escape when its explicitly scoped route surface is detached', () => {
    const onBack = vi.fn();
    render(<BackProbe mounted={false} onBack={onBack} />);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onBack).not.toHaveBeenCalled();
  });

  it('cancels a pending animated return when the detail layer is disabled', () => {
    vi.useFakeTimers();
    const onBack = vi.fn();
    const view = render(<BackProbe onBack={onBack} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    view.rerender(<BackProbe enabled={false} onBack={onBack} />);
    act(() => vi.advanceTimersByTime(80));

    expect(onBack).not.toHaveBeenCalled();
  });
});
