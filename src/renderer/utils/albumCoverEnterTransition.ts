import '../styles/album-cover-enter.css';
import { isLowSpecModeDomActive } from '../../shared/utils/performancePolicy';

export const albumCoverEnterDurationMs = 220;
const albumCoverEnterHoldTimeoutMs = 1600;
const albumCoverEnterFinishSlackMs = 80;
const albumCoverEnterEasing = 'cubic-bezier(0.2, 0, 0, 1)';
const minCoverSizePx = 12;

const coverSelectors = [
  '.album-cover',
  '.artist-album-cover',
  '.home-artwork',
  '.album-related-album-cover',
  '.album-detail-cover',
].join(', ');

type CoverRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type AlbumCoverEnterSession = {
  clone: HTMLElement;
  layer: HTMLElement;
  origin: CoverRect;
  originRadius: string;
  originBorder: string;
  originShadow: string;
  animation: Animation | null;
  finishTimer: number | null;
  holdTimer: number | null;
  phase: 'held' | 'landing' | 'done';
  onDone: (() => void) | null;
  retainCount: number;
};

let session: AlbumCoverEnterSession | null = null;

const reducedMotionQuery = '(prefers-reduced-motion: reduce)';

const prefersReducedMotion = (): boolean => {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia(reducedMotionQuery).matches;
  } catch {
    return false;
  }
};

const isLowSpecMode = (): boolean => isLowSpecModeDomActive();

const shouldSkipCoverEnterMotion = (): boolean => prefersReducedMotion() || isLowSpecMode();

const readCoverRect = (element: HTMLElement): CoverRect | null => {
  const rect = element.getBoundingClientRect();
  if (rect.width < minCoverSizePx || rect.height < minCoverSizePx) {
    return null;
  }

  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
};

export const findAlbumCoverEnterElement = (target: EventTarget | null | undefined): HTMLElement | null => {
  if (!(target instanceof Element)) {
    return null;
  }

  return (target.closest(coverSelectors) as HTMLElement | null) ?? (target.querySelector(coverSelectors) as HTMLElement | null);
};

const applyRect = (element: HTMLElement, rect: CoverRect): void => {
  element.style.left = `${rect.left}px`;
  element.style.top = `${rect.top}px`;
  element.style.width = `${rect.width}px`;
  element.style.height = `${rect.height}px`;
};

const clearTimer = (timer: number | null): null => {
  if (timer !== null) {
    window.clearTimeout(timer);
  }
  return null;
};

const removeLayer = (current: AlbumCoverEnterSession): void => {
  current.holdTimer = clearTimer(current.holdTimer);
  current.finishTimer = clearTimer(current.finishTimer);
  current.layer.remove();
  if (session === current) {
    session = null;
  }
};

export const cancelAlbumCoverEnter = (): void => {
  if (!session) {
    return;
  }

  const current = session;
  session = null;
  current.phase = 'done';
  current.holdTimer = clearTimer(current.holdTimer);
  current.finishTimer = clearTimer(current.finishTimer);
  current.animation?.cancel();
  current.layer.remove();
};

export const hasPendingAlbumCoverEnter = (): boolean => session !== null && session.phase !== 'done';

export const dismissAlbumCoverEnterLayer = (): void => {
  if (!session || session.phase !== 'done') {
    return;
  }

  removeLayer(session);
};

const finishSession = (): void => {
  if (!session || session.phase === 'done') {
    return;
  }

  const current = session;
  current.phase = 'done';
  current.holdTimer = clearTimer(current.holdTimer);
  current.finishTimer = clearTimer(current.finishTimer);
  try {
    current.animation?.commitStyles();
  } catch {
    // Keep the clone at its landed box even if the Web Animation API is incomplete.
  }
  current.onDone?.();
};

const syncCloneImage = (destination: HTMLElement): void => {
  if (!session) {
    return;
  }

  const destinationImage = destination.querySelector('img');
  const cloneImage = session.clone.querySelector('img');
  if (!(destinationImage instanceof HTMLImageElement) || !(cloneImage instanceof HTMLImageElement) || !destinationImage.complete) {
    return;
  }

  const nextSrc = destinationImage.currentSrc || destinationImage.src;
  if (nextSrc && cloneImage.src !== nextSrc) {
    cloneImage.src = nextSrc;
  }
};

const waitForDestinationImage = (destination: HTMLElement): Promise<void> => {
  const image = destination.querySelector('img');
  if (!(image instanceof HTMLImageElement) || image.complete) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    const done = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      image.removeEventListener('load', done);
      image.removeEventListener('error', done);
      resolve();
    };

    image.addEventListener('load', done);
    image.addEventListener('error', done);
    window.setTimeout(done, 180);
  });
};

const landClone = (destination: HTMLElement): void => {
  if (!session || session.phase !== 'landing') {
    return;
  }

  const destinationRect = readCoverRect(destination);
  if (!destinationRect) {
    const done = session.onDone;
    cancelAlbumCoverEnter();
    done?.();
    return;
  }

  const current = session;
  current.holdTimer = clearTimer(current.holdTimer);
  syncCloneImage(destination);

  const destinationStyles = window.getComputedStyle(destination);
  const from = {
    left: `${current.origin.left}px`,
    top: `${current.origin.top}px`,
    width: `${current.origin.width}px`,
    height: `${current.origin.height}px`,
    borderRadius: current.originRadius,
    border: current.originBorder,
  };
  const to = {
    left: `${destinationRect.left}px`,
    top: `${destinationRect.top}px`,
    width: `${destinationRect.width}px`,
    height: `${destinationRect.height}px`,
    borderRadius: destinationStyles.borderRadius,
    border: destinationStyles.border,
  };
  current.clone.style.boxShadow = destinationStyles.boxShadow;

  const settle = (): void => {
    void waitForDestinationImage(destination).then(() => {
      if (session !== current || current.phase === 'done') {
        return;
      }
      syncCloneImage(destination);
      finishSession();
    });
  };

  if (typeof current.clone.animate === 'function') {
    current.animation = current.clone.animate([from, to], {
      duration: albumCoverEnterDurationMs,
      easing: albumCoverEnterEasing,
      fill: 'forwards',
    });
    current.animation.finished.then(settle).catch(settle);
    current.finishTimer = window.setTimeout(settle, albumCoverEnterDurationMs + albumCoverEnterFinishSlackMs);
    return;
  }

  Object.assign(current.clone.style, from);
  current.clone.style.transition = [
    `left ${albumCoverEnterDurationMs}ms ${albumCoverEnterEasing}`,
    `top ${albumCoverEnterDurationMs}ms ${albumCoverEnterEasing}`,
    `width ${albumCoverEnterDurationMs}ms ${albumCoverEnterEasing}`,
    `height ${albumCoverEnterDurationMs}ms ${albumCoverEnterEasing}`,
    `border-radius ${albumCoverEnterDurationMs}ms ${albumCoverEnterEasing}`,
  ].join(', ');

  window.requestAnimationFrame(() => {
    if (session !== current || current.phase !== 'landing') {
      return;
    }
    Object.assign(current.clone.style, to);
  });
  current.finishTimer = window.setTimeout(settle, albumCoverEnterDurationMs + albumCoverEnterFinishSlackMs);
};

export const beginAlbumCoverEnter = (target: EventTarget | null | undefined): boolean => {
  cancelAlbumCoverEnter();

  if (shouldSkipCoverEnterMotion()) {
    return false;
  }

  const cover = findAlbumCoverEnterElement(target);
  if (!cover) {
    return false;
  }

  const origin = readCoverRect(cover);
  if (!origin) {
    return false;
  }

  const styles = window.getComputedStyle(cover);
  const layer = document.createElement('div');
  layer.className = 'album-cover-enter-layer';
  layer.setAttribute('aria-hidden', 'true');

  const clone = document.createElement('div');
  clone.className = 'album-cover-enter-clone';
  applyRect(clone, origin);
  clone.style.borderRadius = styles.borderRadius;
  clone.style.border = styles.border;
  clone.style.boxShadow = styles.boxShadow;
  clone.style.background = styles.background;

  const sourceImage = cover.querySelector('img');
  if (sourceImage instanceof HTMLImageElement) {
    const imageSrc = sourceImage.currentSrc || sourceImage.src;
    if (imageSrc) {
      const cloneImage = document.createElement('img');
      cloneImage.alt = '';
      cloneImage.draggable = false;
      cloneImage.src = imageSrc;
      clone.appendChild(cloneImage);
    }
  }

  layer.appendChild(clone);
  document.body.appendChild(layer);

  session = {
    clone,
    layer,
    origin,
    originRadius: styles.borderRadius,
    originBorder: styles.border,
    originShadow: styles.boxShadow,
    animation: null,
    finishTimer: null,
    holdTimer: window.setTimeout(() => {
      if (session?.phase === 'held') {
        cancelAlbumCoverEnter();
      }
    }, albumCoverEnterHoldTimeoutMs),
    phase: 'held',
    onDone: null,
    retainCount: 0,
  };

  return true;
};

export const completeAlbumCoverEnter = (destination: HTMLElement, onDone: () => void): void => {
  if (!session || session.phase === 'done') {
    onDone();
    return;
  }

  session.onDone = onDone;
  if (session.phase === 'landing') {
    return;
  }

  session.phase = 'landing';

  const startLanding = (): void => {
    if (!session || session.phase !== 'landing') {
      return;
    }
    landClone(destination);
  };

  if (readCoverRect(destination)) {
    startLanding();
    return;
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(startLanding);
  });
};

export const retainAlbumCoverEnter = (): (() => void) => {
  if (!session) {
    return () => undefined;
  }

  session.retainCount += 1;

  return () => {
    if (!session) {
      return;
    }

    session.retainCount = Math.max(0, session.retainCount - 1);
    if (session.retainCount > 0) {
      return;
    }

    const current = session;
    queueMicrotask(() => {
      if (session !== current || current.retainCount > 0) {
        return;
      }
      if (current.phase === 'done') {
        removeLayer(current);
        return;
      }
      cancelAlbumCoverEnter();
    });
  };
};
