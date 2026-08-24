import { useEffect } from 'react';

export const minimizedMemoryTrimDelayMs = 30_000;
export const hiddenWindowMemoryTrimDelayMs = 10_000;

type BackgroundWindowMemoryTrimState = {
  isMinimized: boolean;
  isWindowHidden: boolean;
};

/**
 * Releases only Chromium's rebuildable renderer resource cache. The active
 * route, media elements, decoded artwork in the DOM, and all React state stay
 * mounted so showing the window never looks like a reload.
 */
export const useBackgroundWindowMemoryTrim = ({
  isMinimized,
  isWindowHidden,
}: BackgroundWindowMemoryTrimState): void => {
  useEffect(() => {
    if (!isMinimized && !isWindowHidden) {
      return undefined;
    }

    const delayMs = isWindowHidden
      ? hiddenWindowMemoryTrimDelayMs
      : minimizedMemoryTrimDelayMs;
    const timer = window.setTimeout(() => {
      try {
        window.echo?.diagnostics?.releaseUnusedRendererMemory?.();
      } catch {
        // Silent best-effort cleanup must never affect showing the window.
      }
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [isMinimized, isWindowHidden]);
};
