// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LibraryTrack } from '../../shared/types/library';
import {
  isNavidromeStartupCoverCandidate,
  normalizeRemoteCoverLoadPerformanceMode,
  preloadRemoteCoverUrls,
  remoteCoverLoadPlans,
  remoteCoverPreloadIdentity,
  resolveNavidromeStartupCoverLimits,
  selectRemoteCoverPreloadCandidates,
  useRemoteCoverPreloader,
} from './useRemoteCoverPreloader';

const track = (index: number): LibraryTrack => ({
  id: `track-${index}`,
  path: `remote://subsonic/song-${index}`,
  title: `Song ${index}`,
  artist: 'Artist',
  album: 'Album',
  albumArtist: 'Album Artist',
  trackNo: index,
  discNo: 1,
  year: 2026,
  genre: null,
  duration: 180,
  codec: 'flac',
  sampleRate: 44100,
  bitDepth: 16,
  bitrate: 900000,
  coverId: null,
  coverThumb: `echo-image://subsonic-cover/track-${index}?size=160`,
  mediaType: 'remote',
  sourceId: 'subsonic-1',
  sourceDisplayName: 'Navidrome',
  provider: 'subsonic',
  remotePath: `subsonic:song:${index}`,
  embeddedMetadataStatus: 'present',
  embeddedCoverStatus: 'missing',
  networkMetadataStatus: 'none',
  fieldSources: {},
});

class ControlledImage {
  static instances: ControlledImage[] = [];

  decoding = '';
  onerror: ((event: Event) => void) | null = null;
  onload: ((event: Event) => void) | null = null;
  src = '';

  constructor() {
    ControlledImage.instances.push(this);
  }

  removeAttribute(name: string): void {
    if (name === 'src') {
      this.src = '';
    }
  }
}

afterEach(() => {
  ControlledImage.instances = [];
  vi.unstubAllGlobals();
  vi.useRealTimers();
  Reflect.deleteProperty(window, 'echo');
});

describe('useRemoteCoverPreloader helpers', () => {
  it('normalizes remote cover load performance mode', () => {
    expect(normalizeRemoteCoverLoadPerformanceMode(undefined)).toBe('balanced');
    expect(normalizeRemoteCoverLoadPerformanceMode('low')).toBe('low');
    expect(normalizeRemoteCoverLoadPerformanceMode('aggressive')).toBe('aggressive');
    expect(normalizeRemoteCoverLoadPerformanceMode('lan')).toBe('lan');
    expect(normalizeRemoteCoverLoadPerformanceMode('turbo')).toBe('balanced');
  });

  it('selects more lead rows for aggressive preloading', () => {
    const tracks = Array.from({ length: 700 }, (_, index) => track(index));

    expect(selectRemoteCoverPreloadCandidates(tracks, ['track-10', 'track-11'], 'low').map((item) => item.id)).toEqual([
      'track-10',
      'track-11',
    ]);
    expect(selectRemoteCoverPreloadCandidates(tracks, ['track-10', 'track-11'], 'balanced')).toHaveLength(26);
    expect(selectRemoteCoverPreloadCandidates(tracks, ['track-10', 'track-11'], 'aggressive')).toHaveLength(98);
    expect(selectRemoteCoverPreloadCandidates(tracks, ['track-10', 'track-11'], 'lan')).toHaveLength(322);
  });

  it('keeps LAN preloading fast without restoring the old 1600 image burst', () => {
    expect(remoteCoverLoadPlans.lan).toMatchObject({
      maxPreloadUrls: 320,
      maxHydrateTracks: 160,
      concurrency: 8,
    });
  });

  it('defers and bounds the first Navidrome cover batch during route restoration', () => {
    expect(isNavidromeStartupCoverCandidate(track(1))).toBe(true);
    expect(resolveNavidromeStartupCoverLimits(remoteCoverLoadPlans.lan)).toEqual({
      maxPreloadUrls: 24,
      maxHydrateTracks: 12,
      concurrency: 2,
      delayMs: 900,
    });
  });

  it('disables speculative preload and hydration work in low mode', () => {
    expect(remoteCoverLoadPlans.low).toMatchObject({
      leadRows: 0,
      maxPreloadUrls: 0,
      maxHydrateTracks: 0,
      concurrency: 1,
    });
    expect(selectRemoteCoverPreloadCandidates(Array.from({ length: 10 }, (_, index) => track(index)), [], 'low')).toEqual([]);
  });

  it('deduplicates Subsonic covers by cache identity instead of track URL', () => {
    const first = 'echo-image://subsonic-cover/track-1?size=512&cacheKey=subsonic%3Asource%3Aone%3Acover-art%3Aalbum-1';
    const second = 'echo-image://subsonic-cover/track-2?cacheKey=subsonic%3Asource%3Aone%3Acover-art%3Aalbum-1&size=512';

    expect(remoteCoverPreloadIdentity(first)).toBe(remoteCoverPreloadIdentity(second));
  });

  it('bounds active image objects and releases each src after completion or cancellation', () => {
    vi.stubGlobal('Image', ControlledImage as unknown as typeof Image);
    const rememberUrl = vi.fn();
    const cancel = preloadRemoteCoverUrls(['cover-1', 'cover-2', 'cover-3'], {
      concurrency: 2,
      rememberUrl,
    });

    expect(ControlledImage.instances).toHaveLength(2);
    expect(ControlledImage.instances.map((image) => image.src)).toEqual(['cover-1', 'cover-2']);

    ControlledImage.instances[0].onload?.(new Event('load'));

    expect(rememberUrl).toHaveBeenCalledWith('cover-1');
    expect(ControlledImage.instances[0].src).toBe('');
    expect(ControlledImage.instances).toHaveLength(3);
    expect(ControlledImage.instances[2].src).toBe('cover-3');

    cancel();
    expect(ControlledImage.instances[1].src).toBe('');
    expect(ControlledImage.instances[2].src).toBe('');
  });

  it('cancels speculative remote cover work when the main window is minimized', () => {
    vi.useFakeTimers();
    vi.stubGlobal('Image', ControlledImage as unknown as typeof Image);
    let minimizedHandler: ((isMinimized: boolean) => void) | null = null;
    const hydrateMissingCovers = vi.fn();
    Object.defineProperty(window, 'echo', {
      configurable: true,
      value: {
        app: {
          getSettings: vi.fn().mockResolvedValue({ remoteCoverLoadPerformanceMode: 'balanced' }),
          onMinimizedChange: (handler: (isMinimized: boolean) => void) => {
            minimizedHandler = handler;
            return () => {
              minimizedHandler = null;
            };
          },
        },
      },
    });
    const remoteTrack = track(9_999);
    const { unmount } = renderHook(() => useRemoteCoverPreloader({
      active: true,
      tracks: [remoteTrack],
      visibleTrackIds: [remoteTrack.id],
      hydrateMissingCovers,
    }));

    act(() => minimizedHandler?.(true));
    act(() => vi.advanceTimersByTime(2_000));

    expect(ControlledImage.instances).toHaveLength(0);
    expect(hydrateMissingCovers).not.toHaveBeenCalled();
    unmount();
    expect(minimizedHandler).toBeNull();
  });
});
