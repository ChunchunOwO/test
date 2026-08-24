// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { resolveRenderBudget, useRenderBudget } from './renderBudget';

describe('resolveRenderBudget', () => {
  it('caps active and unfocused rendering at 30 and 15 FPS', () => {
    expect(resolveRenderBudget({ isVisible: true, isFocused: true })).toMatchObject({
      mode: 'active',
      targetFps: 30,
      allowDecorativeMotion: true,
    });
    expect(resolveRenderBudget({ isVisible: true, isFocused: false })).toMatchObject({
      mode: 'unfocused',
      targetFps: 15,
      allowDecorativeMotion: false,
    });
  });

  it('stops hidden rendering and keeps pressure mode functional at 10 FPS', () => {
    expect(resolveRenderBudget({ isVisible: false, isFocused: false, pressureReduced: true })).toMatchObject({
      mode: 'hidden',
      targetFps: 0,
      frameIntervalMs: null,
    });
    expect(resolveRenderBudget({ isVisible: true, isFocused: true, pressureReduced: true })).toMatchObject({
      mode: 'pressure',
      targetFps: 10,
      frameIntervalMs: 100,
      allowDecorativeMotion: false,
    });
  });

  it('treats an explicitly minimized main window as hidden even when Chromium reports it visible', () => {
    expect(resolveRenderBudget({ isVisible: true, isFocused: true, isMinimized: true })).toMatchObject({
      mode: 'hidden',
      isVisible: false,
      isMinimized: true,
      targetFps: 0,
    });
  });

  it('treats an explicitly hidden main window as a zero render budget', () => {
    expect(resolveRenderBudget({
      isVisible: true,
      isFocused: true,
      isWindowHidden: true,
    })).toMatchObject({
      mode: 'hidden',
      isVisible: false,
      isWindowHidden: true,
      targetFps: 0,
    });
  });

  it('reacts to window focus and document visibility without per-component listeners', () => {
    const visibilityDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    const { result, unmount } = renderHook(() => useRenderBudget());

    expect(result.current.mode).toBe('active');
    act(() => window.dispatchEvent(new Event('blur')));
    expect(result.current.mode).toBe('unfocused');
    expect(result.current.targetFps).toBe(15);

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(result.current.mode).toBe('hidden');
    expect(result.current.targetFps).toBe(0);

    unmount();
    if (visibilityDescriptor) {
      Object.defineProperty(document, 'visibilityState', visibilityDescriptor);
    } else {
      Reflect.deleteProperty(document, 'visibilityState');
    }
  });

  it('reacts to the typed main-window minimized event without relying on page visibility', () => {
    let minimizedHandler: ((isMinimized: boolean) => void) | null = null;
    const previousEcho = window.echo;
    window.echo = {
      app: {
        onMinimizedChange: (handler: (isMinimized: boolean) => void) => {
          minimizedHandler = handler;
          return () => {
            minimizedHandler = null;
          };
        },
      },
    } as unknown as Window['echo'];

    try {
      const { result, unmount } = renderHook(() => useRenderBudget());

      act(() => minimizedHandler?.(true));
      expect(result.current).toMatchObject({ mode: 'hidden', isMinimized: true, targetFps: 0 });

      act(() => minimizedHandler?.(false));
      expect(result.current).toMatchObject({ mode: 'active', isMinimized: false, targetFps: 30 });
      unmount();
      expect(minimizedHandler).toBeNull();
    } finally {
      window.echo = previousEcho;
    }
  });

  it('reacts to explicit tray hide and show events without relying on page visibility', () => {
    let hiddenHandler: ((isHidden: boolean) => void) | null = null;
    const previousEcho = window.echo;
    window.echo = {
      app: {
        onHiddenChange: (handler: (isHidden: boolean) => void) => {
          hiddenHandler = handler;
          return () => {
            hiddenHandler = null;
          };
        },
      },
    } as unknown as Window['echo'];

    try {
      const { result, unmount } = renderHook(() => useRenderBudget());

      act(() => hiddenHandler?.(true));
      expect(result.current).toMatchObject({ mode: 'hidden', isWindowHidden: true, targetFps: 0 });

      act(() => hiddenHandler?.(false));
      expect(result.current).toMatchObject({ mode: 'active', isWindowHidden: false, targetFps: 30 });
      unmount();
      expect(hiddenHandler).toBeNull();
    } finally {
      window.echo = previousEcho;
    }
  });

  it('refreshes stale document visibility before a new subscriber mounts', () => {
    const visibilityDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    const first = renderHook(() => useRenderBudget());
    expect(first.result.current.mode).toBe('hidden');
    first.unmount();

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    const second = renderHook(() => useRenderBudget());
    expect(second.result.current.mode).toBe('active');
    second.unmount();

    if (visibilityDescriptor) {
      Object.defineProperty(document, 'visibilityState', visibilityDescriptor);
    } else {
      Reflect.deleteProperty(document, 'visibilityState');
    }
  });
});
