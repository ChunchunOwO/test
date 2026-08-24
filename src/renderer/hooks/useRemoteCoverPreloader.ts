import { useEffect, useMemo, useRef, useState } from 'react';
import type { RemoteCoverLoadPerformanceMode, AppSettings } from '../../shared/types/appSettings';
import type { LibraryTrack } from '../../shared/types/library';
import { resolveEffectivePerformancePolicy } from '../../shared/utils/performancePolicy';
import { getAppBridge } from '../utils/echoBridge';
import { useRenderBudget } from '../performance/renderBudget';

type RemoteCoverLoadPlan = {
  leadRows: number;
  maxPreloadUrls: number;
  maxHydrateTracks: number;
  concurrency: number;
  delayMs: number;
};

type RemoteCoverPreloaderOptions = {
  active: boolean;
  tracks: LibraryTrack[];
  visibleTrackIds: string[];
  hydrateMissingCovers?: (trackIds: string[]) => void;
};

type PreloadRemoteCoverUrlsOptions = {
  concurrency?: number;
  rememberUrl?: (url: string) => void;
  timeoutMs?: number;
};

const defaultRemoteCoverLoadPerformanceMode: RemoteCoverLoadPerformanceMode = 'balanced';
const maxRememberedPreloadedUrls = 2400;
const remoteCoverPreloadTimeoutMs = 12_000;
const navidromeStartupPreloadDelayMs = 900;
const navidromeStartupIdleTimeoutMs = 1_200;
const navidromeStartupMaxPreloadUrls = 24;
const navidromeStartupMaxHydrateTracks = 12;
const navidromeStartupPreloadConcurrency = 2;
const preloadedRemoteCoverIdentities = new Set<string>();

export const remoteCoverLoadPlans: Record<RemoteCoverLoadPerformanceMode, RemoteCoverLoadPlan> = {
  low: {
    leadRows: 0,
    maxPreloadUrls: 0,
    maxHydrateTracks: 0,
    concurrency: 1,
    delayMs: 240,
  },
  balanced: {
    leadRows: 24,
    maxPreloadUrls: 32,
    maxHydrateTracks: 16,
    concurrency: 3,
    delayMs: 120,
  },
  aggressive: {
    leadRows: 96,
    maxPreloadUrls: 128,
    maxHydrateTracks: 64,
    concurrency: 6,
    delayMs: 60,
  },
  lan: {
    leadRows: 320,
    maxPreloadUrls: 320,
    maxHydrateTracks: 160,
    concurrency: 8,
    delayMs: 0,
  },
};

const isRemoteCoverLoadPerformanceMode = (value: unknown): value is RemoteCoverLoadPerformanceMode =>
  value === 'low' || value === 'balanced' || value === 'aggressive' || value === 'lan';

export const normalizeRemoteCoverLoadPerformanceMode = (value: unknown): RemoteCoverLoadPerformanceMode =>
  isRemoteCoverLoadPerformanceMode(value) ? value : defaultRemoteCoverLoadPerformanceMode;

export const remoteCoverPreloadIdentity = (url: string): string => {
  try {
    const parsed = new URL(url);
    const cacheKey = parsed.searchParams.get('cacheKey');
    if (parsed.protocol === 'echo-image:' && parsed.hostname === 'subsonic-cover' && cacheKey) {
      return `${parsed.protocol}//${parsed.hostname}/${cacheKey}?size=${parsed.searchParams.get('size') ?? '512'}`;
    }
  } catch {
    // Invalid URLs are kept as-is and will fail through the normal Image path.
  }
  return url;
};

const rememberPreloadedUrl = (url: string): void => {
  preloadedRemoteCoverIdentities.add(remoteCoverPreloadIdentity(url));
  while (preloadedRemoteCoverIdentities.size > maxRememberedPreloadedUrls) {
    const oldest = preloadedRemoteCoverIdentities.values().next().value;
    if (typeof oldest !== 'string') {
      break;
    }
    preloadedRemoteCoverIdentities.delete(oldest);
  }
};

export const preloadRemoteCoverUrls = (
  urls: string[],
  options: PreloadRemoteCoverUrlsOptions = {},
): (() => void) => {
  if (typeof Image === 'undefined' || urls.length === 0) {
    return () => undefined;
  }

  const concurrency = Math.max(1, Math.floor(options.concurrency ?? remoteCoverLoadPlans.balanced.concurrency));
  const rememberUrl = options.rememberUrl ?? rememberPreloadedUrl;
  const timeoutMs = Math.max(1_000, Math.floor(options.timeoutMs ?? remoteCoverPreloadTimeoutMs));
  const activeImages = new Set<HTMLImageElement>();
  const activeTimeouts = new Map<HTMLImageElement, number>();
  let activeCount = 0;
  let cancelled = false;
  let nextIndex = 0;

  const pump = (): void => {
    if (cancelled) {
      return;
    }

    while (activeCount < concurrency && nextIndex < urls.length) {
      const url = urls[nextIndex];
      nextIndex += 1;
      activeCount += 1;

      const image = new Image();
      activeImages.add(image);
      let settled = false;
      const finish = (loaded: boolean): void => {
        if (settled) {
          return;
        }
        settled = true;
        const timeout = activeTimeouts.get(image);
        if (timeout !== undefined) {
          window.clearTimeout(timeout);
          activeTimeouts.delete(image);
        }
        image.onload = null;
        image.onerror = null;
        image.removeAttribute('src');
        activeImages.delete(image);
        activeCount -= 1;
        if (cancelled) {
          return;
        }
        if (loaded) {
          rememberUrl(url);
        }
        pump();
      };

      image.onload = (): void => finish(true);
      image.onerror = (): void => finish(false);
      image.decoding = 'async';
      activeTimeouts.set(image, window.setTimeout(() => finish(false), timeoutMs));
      image.src = url;
    }
  };

  pump();

  return () => {
    cancelled = true;
    for (const image of activeImages) {
      const timeout = activeTimeouts.get(image);
      if (timeout !== undefined) {
        window.clearTimeout(timeout);
      }
      image.onload = null;
      image.onerror = null;
      image.removeAttribute('src');
    }
    activeTimeouts.clear();
    activeImages.clear();
  };
};

export const selectRemoteCoverPreloadCandidates = (
  tracks: LibraryTrack[],
  visibleTrackIds: string[],
  mode: RemoteCoverLoadPerformanceMode,
): LibraryTrack[] => {
  const plan = remoteCoverLoadPlans[mode];
  const visibleIndexByTrackId = new Map<string, number>();
  tracks.forEach((track, index) => {
    visibleIndexByTrackId.set(track.id, index);
  });

  const visibleIndexes = visibleTrackIds
    .map((trackId) => visibleIndexByTrackId.get(trackId))
    .filter((index): index is number => typeof index === 'number');

  if (visibleIndexes.length === 0) {
    return tracks.slice(0, Math.min(tracks.length, plan.maxPreloadUrls));
  }

  const firstVisibleIndex = Math.min(...visibleIndexes);
  const lastVisibleIndex = Math.max(...visibleIndexes);
  const endIndex = Math.min(tracks.length, lastVisibleIndex + 1 + plan.leadRows);

  return tracks.slice(firstVisibleIndex, endIndex);
};

export const isNavidromeStartupCoverCandidate = (track: LibraryTrack): boolean =>
  track.mediaType === 'remote' && track.provider === 'subsonic';

export const resolveNavidromeStartupCoverLimits = (
  plan: RemoteCoverLoadPlan,
): Pick<RemoteCoverLoadPlan, 'maxPreloadUrls' | 'maxHydrateTracks' | 'concurrency' | 'delayMs'> => ({
  maxPreloadUrls: Math.min(plan.maxPreloadUrls, navidromeStartupMaxPreloadUrls),
  maxHydrateTracks: Math.min(plan.maxHydrateTracks, navidromeStartupMaxHydrateTracks),
  concurrency: Math.min(plan.concurrency, navidromeStartupPreloadConcurrency),
  delayMs: Math.max(plan.delayMs, navidromeStartupPreloadDelayMs),
});

const uniqueRemoteCoverUrls = (tracks: LibraryTrack[], limit: number): string[] => {
  if (limit <= 0) {
    return [];
  }
  const urls: string[] = [];
  const seen = new Set<string>();

  for (const track of tracks) {
    const url = track.mediaType === 'remote' ? track.coverThumb : null;
    const identity = url ? remoteCoverPreloadIdentity(url) : null;
    if (!url || !identity || seen.has(identity) || preloadedRemoteCoverIdentities.has(identity)) {
      continue;
    }
    seen.add(identity);
    urls.push(url);
    if (urls.length >= limit) {
      break;
    }
  }

  return urls;
};

const missingRemoteCoverTrackIds = (tracks: LibraryTrack[], limit: number): string[] => {
  if (limit <= 0) {
    return [];
  }
  const ids: string[] = [];
  for (const track of tracks) {
    if (track.mediaType !== 'remote' || track.coverThumb) {
      continue;
    }
    ids.push(track.id);
    if (ids.length >= limit) {
      break;
    }
  }
  return ids;
};

export const useRemoteCoverLoadPerformanceMode = (): RemoteCoverLoadPerformanceMode => {
  const [mode, setMode] = useState<RemoteCoverLoadPerformanceMode>(defaultRemoteCoverLoadPerformanceMode);

  useEffect(() => {
    let disposed = false;

    const loadMode = (): void => {
      void getAppBridge()?.getSettings?.()
        .then((settings) => {
          if (!disposed) {
            const nextMode = resolveEffectivePerformancePolicy(settings).remoteCoverLoadPerformanceMode;
            if (nextMode === 'low') {
              preloadedRemoteCoverIdentities.clear();
            }
            setMode(nextMode);
          }
        })
        .catch(() => undefined);
    };

    const handleSettingsChanged = (event: Event): void => {
      const detail = event instanceof CustomEvent ? (event.detail as Partial<AppSettings> | null | undefined) : null;
      if (detail && ('remoteCoverLoadPerformanceMode' in detail || 'lowSpecModeEnabled' in detail)) {
        loadMode();
        return;
      }
      loadMode();
    };

    loadMode();
    window.addEventListener('settings:changed', handleSettingsChanged);
    return () => {
      disposed = true;
      window.removeEventListener('settings:changed', handleSettingsChanged);
    };
  }, []);

  return mode;
};

export const useRemoteCoverPreloader = ({
  active,
  tracks,
  visibleTrackIds,
  hydrateMissingCovers,
}: RemoteCoverPreloaderOptions): RemoteCoverLoadPerformanceMode => {
  const mode = useRemoteCoverLoadPerformanceMode();
  const renderBudget = useRenderBudget();
  const [memoryPressureBlocked, setMemoryPressureBlocked] = useState(false);
  const visibleTrackIdsKey = useMemo(() => visibleTrackIds.join('\0'), [visibleTrackIds]);
  const previousModeRef = useRef(mode);
  const navidromeStartupPendingRef = useRef(true);

  useEffect(() => {
    if (!active) {
      setMemoryPressureBlocked(false);
    }
  }, [active]);

  useEffect(() => {
    if (previousModeRef.current !== mode) {
      previousModeRef.current = mode;
      preloadedRemoteCoverIdentities.clear();
    }
  }, [mode]);

  useEffect(() => {
    if (!active || !renderBudget.isVisible || memoryPressureBlocked || tracks.length === 0) {
      return undefined;
    }

    const plan = remoteCoverLoadPlans[mode];
    const candidates = selectRemoteCoverPreloadCandidates(tracks, visibleTrackIds, mode);
    const navidromeStartupPending = navidromeStartupPendingRef.current
      && candidates.some(isNavidromeStartupCoverCandidate);
    const workPlan = navidromeStartupPending ? resolveNavidromeStartupCoverLimits(plan) : plan;
    const urls = uniqueRemoteCoverUrls(candidates, workPlan.maxPreloadUrls);
    const missingCoverIds = hydrateMissingCovers
      ? missingRemoteCoverTrackIds(candidates, workPlan.maxHydrateTracks)
      : [];
    let cancelled = false;
    let cancelPreload: (() => void) | null = null;
    let idleCallbackId: number | null = null;

    const cancelRemoteCoverWork = (): void => {
      cancelled = true;
      if (idleCallbackId !== null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleCallbackId);
        idleCallbackId = null;
      }
      cancelPreload?.();
      cancelPreload = null;
    };

    const runPreload = (): void => {
      if (cancelled) {
        return;
      }
      if (navidromeStartupPending) {
        navidromeStartupPendingRef.current = false;
      }

      if (missingCoverIds.length > 0) {
        hydrateMissingCovers?.(missingCoverIds);
      }

      cancelPreload = preloadRemoteCoverUrls(urls, { concurrency: workPlan.concurrency });
    };

    const schedulePreload = (): void => {
      if (navidromeStartupPending && typeof window.requestIdleCallback === 'function') {
        idleCallbackId = window.requestIdleCallback(() => {
          idleCallbackId = null;
          runPreload();
        }, { timeout: navidromeStartupIdleTimeoutMs });
        return;
      }
      runPreload();
    };

    const timer = window.setTimeout(schedulePreload, workPlan.delayMs);
    const unsubscribeMemoryPressure = window.echo?.diagnostics?.onMemoryPressure?.(() => {
      cancelRemoteCoverWork();
      setMemoryPressureBlocked(true);
    });
    return () => {
      window.clearTimeout(timer);
      unsubscribeMemoryPressure?.();
      cancelRemoteCoverWork();
    };
  }, [active, hydrateMissingCovers, memoryPressureBlocked, mode, renderBudget.isVisible, tracks, visibleTrackIds, visibleTrackIdsKey]);

  return mode;
};
