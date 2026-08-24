// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hiddenWindowMemoryTrimDelayMs,
  minimizedMemoryTrimDelayMs,
  useBackgroundWindowMemoryTrim,
} from './useBackgroundWindowMemoryTrim';

let previousEcho: Window['echo'];

beforeEach(() => {
  previousEcho = window.echo;
});

afterEach(() => {
  vi.useRealTimers();
  window.echo = previousEcho;
});

describe('useBackgroundWindowMemoryTrim', () => {
  const setup = (initial = { minimized: false, hidden: false }) => {
    vi.useFakeTimers();
    const releaseUnusedRendererMemory = vi.fn(() => true);
    window.echo = {
      diagnostics: { releaseUnusedRendererMemory },
    } as unknown as Window['echo'];
    const hook = renderHook(
      ({ minimized, hidden }) => useBackgroundWindowMemoryTrim({
        isMinimized: minimized,
        isWindowHidden: hidden,
      }),
      { initialProps: initial },
    );
    return { ...hook, releaseUnusedRendererMemory };
  };

  it('silently trims rebuildable cache only after a sustained minimize', () => {
    const { rerender, unmount, releaseUnusedRendererMemory } = setup();

    rerender({ minimized: true, hidden: false });
    act(() => vi.advanceTimersByTime(minimizedMemoryTrimDelayMs - 1));
    expect(releaseUnusedRendererMemory).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(releaseUnusedRendererMemory).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('uses the shorter conservative delay while hidden to the tray', () => {
    const { unmount, releaseUnusedRendererMemory } = setup({ minimized: false, hidden: true });

    act(() => vi.advanceTimersByTime(hiddenWindowMemoryTrimDelayMs - 1));
    expect(releaseUnusedRendererMemory).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(releaseUnusedRendererMemory).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('cancels cleanup when the user shows the window quickly', () => {
    const { rerender, unmount, releaseUnusedRendererMemory } = setup({ minimized: false, hidden: true });

    rerender({ minimized: false, hidden: false });
    act(() => vi.advanceTimersByTime(minimizedMemoryTrimDelayMs));

    expect(releaseUnusedRendererMemory).not.toHaveBeenCalled();
    unmount();
  });

  it('does not accumulate cleanup across repeated quick tray hide and show cycles', () => {
    const { rerender, unmount, releaseUnusedRendererMemory } = setup();

    for (let cycle = 0; cycle < 25; cycle += 1) {
      rerender({ minimized: false, hidden: true });
      act(() => vi.advanceTimersByTime(hiddenWindowMemoryTrimDelayMs - 1));
      rerender({ minimized: false, hidden: false });
      act(() => vi.advanceTimersByTime(1));
    }

    expect(releaseUnusedRendererMemory).not.toHaveBeenCalled();

    rerender({ minimized: false, hidden: true });
    act(() => vi.advanceTimersByTime(hiddenWindowMemoryTrimDelayMs));
    expect(releaseUnusedRendererMemory).toHaveBeenCalledTimes(1);

    rerender({ minimized: false, hidden: false });
    act(() => vi.advanceTimersByTime(minimizedMemoryTrimDelayMs));
    expect(releaseUnusedRendererMemory).toHaveBeenCalledTimes(1);
    unmount();
  });
});
