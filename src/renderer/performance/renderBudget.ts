import { useMemo, useSyncExternalStore } from 'react';

export type RenderBudgetMode = 'active' | 'unfocused' | 'hidden' | 'pressure';

export type RenderBudget = {
  mode: RenderBudgetMode;
  isVisible: boolean;
  isFocused: boolean;
  isMinimized: boolean;
  isWindowHidden: boolean;
  targetFps: 0 | 10 | 15 | 30;
  frameIntervalMs: number | null;
  lyricLineIntervalMs: number | null;
  allowDecorativeMotion: boolean;
};

type RenderBudgetInput = {
  isVisible: boolean;
  isFocused: boolean;
  isMinimized?: boolean;
  isWindowHidden?: boolean;
  pressureReduced?: boolean;
};

type RenderViewportSnapshot = Required<Pick<RenderBudgetInput, 'isVisible' | 'isFocused' | 'isMinimized' | 'isWindowHidden'>>;

const activeFrameIntervalMs = 1000 / 30;
const unfocusedFrameIntervalMs = 1000 / 15;
const pressureFrameIntervalMs = 100;

export const resolveRenderBudget = ({
  isVisible,
  isFocused,
  isMinimized = false,
  isWindowHidden = false,
  pressureReduced = false,
}: RenderBudgetInput): RenderBudget => {
  if (!isVisible || isMinimized || isWindowHidden) {
    return {
      mode: 'hidden',
      isVisible: false,
      isFocused,
      isMinimized,
      isWindowHidden,
      targetFps: 0,
      frameIntervalMs: null,
      lyricLineIntervalMs: null,
      allowDecorativeMotion: false,
    };
  }

  if (pressureReduced) {
    return {
      mode: 'pressure',
      isVisible: true,
      isFocused,
      isMinimized: false,
      isWindowHidden: false,
      targetFps: 10,
      frameIntervalMs: pressureFrameIntervalMs,
      lyricLineIntervalMs: 250,
      allowDecorativeMotion: false,
    };
  }

  if (!isFocused) {
    return {
      mode: 'unfocused',
      isVisible: true,
      isFocused: false,
      isMinimized: false,
      isWindowHidden: false,
      targetFps: 15,
      frameIntervalMs: unfocusedFrameIntervalMs,
      lyricLineIntervalMs: 250,
      allowDecorativeMotion: false,
    };
  }

  return {
    mode: 'active',
    isVisible: true,
    isFocused: true,
    isMinimized: false,
    isWindowHidden: false,
    targetFps: 30,
    frameIntervalMs: activeFrameIntervalMs,
    lyricLineIntervalMs: 100,
    allowDecorativeMotion: true,
  };
};

const listeners = new Set<() => void>();
let viewportSnapshot: RenderViewportSnapshot = {
  isVisible: typeof document === 'undefined' || document.visibilityState !== 'hidden',
  // Electron's first focus/blur event is more reliable than jsdom's initial
  // hasFocus() value and still gives hidden windows an immediate zero budget.
  isFocused: true,
  isMinimized: false,
  isWindowHidden: false,
};
let viewportListenersAttached = false;
let unsubscribeMinimizedChange: (() => void) | null = null;
let unsubscribeHiddenChange: (() => void) | null = null;

const notifyViewportListeners = (next: RenderViewportSnapshot): void => {
  if (
    next.isVisible === viewportSnapshot.isVisible &&
    next.isFocused === viewportSnapshot.isFocused &&
    next.isMinimized === viewportSnapshot.isMinimized &&
    next.isWindowHidden === viewportSnapshot.isWindowHidden
  ) {
    return;
  }

  viewportSnapshot = next;
  listeners.forEach((listener) => listener());
};

const handleVisibilityChange = (): void => {
  const isVisible = document.visibilityState !== 'hidden';
  notifyViewportListeners({
    isVisible,
    isFocused: isVisible && typeof document.hasFocus === 'function'
      ? document.hasFocus()
      : viewportSnapshot.isFocused,
    isMinimized: viewportSnapshot.isMinimized,
    isWindowHidden: viewportSnapshot.isWindowHidden,
  });
};

const handleWindowFocus = (): void => {
  notifyViewportListeners({ ...viewportSnapshot, isFocused: true });
};

const handleWindowBlur = (): void => {
  notifyViewportListeners({ ...viewportSnapshot, isFocused: false });
};

const handleWindowMinimizedChange = (isMinimized: boolean): void => {
  notifyViewportListeners({ ...viewportSnapshot, isMinimized });
};

const handleWindowHiddenChange = (isWindowHidden: boolean): void => {
  notifyViewportListeners({ ...viewportSnapshot, isWindowHidden });
};

const attachViewportListeners = (): void => {
  if (viewportListenersAttached || typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  viewportListenersAttached = true;
  viewportSnapshot = {
    ...viewportSnapshot,
    isVisible: document.visibilityState !== 'hidden',
    isMinimized: false,
    isWindowHidden: false,
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('focus', handleWindowFocus);
  window.addEventListener('blur', handleWindowBlur);
  unsubscribeMinimizedChange = window.echo?.app?.onMinimizedChange?.(handleWindowMinimizedChange) ?? null;
  unsubscribeHiddenChange = window.echo?.app?.onHiddenChange?.(handleWindowHiddenChange) ?? null;
};

const detachViewportListeners = (): void => {
  if (!viewportListenersAttached || typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  viewportListenersAttached = false;
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  window.removeEventListener('focus', handleWindowFocus);
  window.removeEventListener('blur', handleWindowBlur);
  unsubscribeMinimizedChange?.();
  unsubscribeMinimizedChange = null;
  unsubscribeHiddenChange?.();
  unsubscribeHiddenChange = null;
  viewportSnapshot = {
    isVisible: document.visibilityState !== 'hidden',
    isFocused: true,
    isMinimized: false,
    isWindowHidden: false,
  };
};

const subscribeToRenderViewport = (listener: () => void): (() => void) => {
  listeners.add(listener);
  attachViewportListeners();

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      detachViewportListeners();
    }
  };
};

const getRenderViewportSnapshot = (): RenderViewportSnapshot => {
  if (!viewportListenersAttached && typeof document !== 'undefined') {
    const isVisible = document.visibilityState !== 'hidden';
    if (
      viewportSnapshot.isVisible !== isVisible ||
      viewportSnapshot.isMinimized ||
      viewportSnapshot.isWindowHidden
    ) {
      viewportSnapshot = {
        ...viewportSnapshot,
        isVisible,
        isMinimized: false,
        isWindowHidden: false,
      };
    }
  }
  return viewportSnapshot;
};

export const useRenderBudget = ({ pressureReduced = false }: { pressureReduced?: boolean } = {}): RenderBudget => {
  const viewport = useSyncExternalStore(
    subscribeToRenderViewport,
    getRenderViewportSnapshot,
    getRenderViewportSnapshot,
  );

  return useMemo(
    () => resolveRenderBudget({ ...viewport, pressureReduced }),
    [pressureReduced, viewport],
  );
};
