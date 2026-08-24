// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LibraryAlbum, LibraryArtist, LibraryTrack } from '../../shared/types/library';
import {
  collectStartupArtworkUrls,
  isStartupArtworkPreloadAllowed,
  isStartupArtworkPreloadVisibilityAllowed,
  preloadStartupArtworkUrls,
  selectStartupArtworkUrls,
  startupArtworkIdentityKey,
  useLibraryStartupArtworkPreloader,
} from './useLibraryStartupArtworkPreloader';

vi.mock('../stores/playbackStatusStore', () => ({
  useSharedPlaybackActivityState: () => 'idle',
}));

class FakeImage {
  static instances: FakeImage[] = [];

  decoding = '';
  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;
  src = '';

  constructor() {
    FakeImage.instances.push(this);
  }

  removeAttribute(name: string): void {
    if (name === 'src') {
      this.src = '';
    }
  }
}

afterEach(() => {
  FakeImage.instances = [];
  vi.unstubAllGlobals();
  vi.useRealTimers();
  Reflect.deleteProperty(window, 'echo');
  window.localStorage.clear();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

const track = (id: string, coverThumb: string | null): LibraryTrack => ({
  id,
  path: `G:/Music/${id}.flac`,
  title: id,
  artist: 'Artist',
  album: 'Album',
  albumArtist: 'Album Artist',
  trackNo: 1,
  discNo: 1,
  year: 2026,
  genre: null,
  duration: 180,
  codec: 'flac',
  sampleRate: 44100,
  bitDepth: 16,
  bitrate: 900000,
  coverId: coverThumb ? id : null,
  coverThumb,
  fieldSources: {},
});

const album = (id: string, coverThumb: string | null): LibraryAlbum => ({
  id,
  albumKey: id,
  title: id,
  albumArtist: 'Album Artist',
  year: 2026,
  trackCount: 12,
  duration: 2400,
  coverId: coverThumb ? id : null,
  coverThumb,
});

const artist = (
  id: string,
  patch: Pick<LibraryArtist, 'coverThumb' | 'coverSource' | 'avatarThumbUrl' | 'avatarUrl'>,
): LibraryArtist => ({
  id,
  artistKey: id,
  name: id,
  sortName: id,
  role: 'both',
  trackCount: 10,
  albumCount: 2,
  coverId: patch.coverThumb ? id : null,
  coverThumb: patch.coverThumb,
  coverSource: patch.coverSource,
  avatarThumbUrl: patch.avatarThumbUrl,
  avatarUrl: patch.avatarUrl,
});

describe('library startup artwork preloader helpers', () => {
  it('only permits preload work while playback is fully inactive', () => {
    expect(isStartupArtworkPreloadAllowed('idle')).toBe(true);
    expect(isStartupArtworkPreloadAllowed('stopped')).toBe(true);
    expect(isStartupArtworkPreloadAllowed('ended')).toBe(true);
    expect(isStartupArtworkPreloadAllowed('loading')).toBe(false);
    expect(isStartupArtworkPreloadAllowed('playing')).toBe(false);
    expect(isStartupArtworkPreloadAllowed('paused')).toBe(false);
    expect(isStartupArtworkPreloadAllowed('error')).toBe(false);
  });

  it('does not permit preload work while the renderer document is hidden', () => {
    expect(isStartupArtworkPreloadVisibilityAllowed('visible')).toBe(true);
    expect(isStartupArtworkPreloadVisibilityAllowed('hidden')).toBe(false);
  });

  it('deduplicates local cover variants by their shared cover identity', () => {
    expect(startupArtworkIdentityKey('echo-cover://large/cover-1')).toBe('echo-cover://identity/cover-1');
    expect(
      selectStartupArtworkUrls(
        [
          ['echo-cover://thumb/cover-1', 'echo-cover://thumb/cover-2'],
          ['echo-cover://album/cover-1', 'echo-cover://large/cover-2'],
        ],
        10,
      ),
    ).toEqual(['echo-cover://thumb/cover-1', 'echo-cover://thumb/cover-2']);
  });

  it('caps the default startup artwork budget at 24 images', () => {
    expect(
      collectStartupArtworkUrls({
        tracks: Array.from({ length: 60 }, (_, index) => track(`track-${index}`, `cover-${index}`)),
      }),
    ).toHaveLength(24);
  });

  it('releases completed image references while retaining cancellation for active loads', () => {
    vi.stubGlobal('Image', FakeImage);
    const rememberUrl = vi.fn();
    const cancel = preloadStartupArtworkUrls(['cover-1', 'cover-2', 'cover-3'], {
      concurrency: 2,
      rememberUrl,
    });

    expect(FakeImage.instances).toHaveLength(2);
    const completedImage = FakeImage.instances[0];
    completedImage.onload?.();

    expect(rememberUrl).toHaveBeenCalledWith('cover-1');
    expect(completedImage.onload).toBeNull();
    expect(completedImage.onerror).toBeNull();
    expect(FakeImage.instances).toHaveLength(3);

    cancel();

    expect(completedImage.src).toBe('');
    expect(FakeImage.instances[1].src).toBe('');
    expect(FakeImage.instances[2].src).toBe('');
  });

  it('cancels scheduled preload work when renderer memory pressure is reported', () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    const getTracks = vi.fn();
    const unsubscribe = vi.fn();
    let reportMemoryPressure = (): void => undefined;
    Object.defineProperty(window, 'echo', {
      configurable: true,
      value: {
        diagnostics: {
          onMemoryPressure: vi.fn((handler: (event: unknown) => void) => {
            reportMemoryPressure = () => handler({});
            return unsubscribe;
          }),
        },
        library: {
          getTracks,
        },
      },
    });

    const { unmount } = renderHook(() => useLibraryStartupArtworkPreloader());
    act(() => reportMemoryPressure());
    act(() => vi.advanceTimersByTime(1_000));

    expect(getTracks).not.toHaveBeenCalled();
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('cancels scheduled preload work when the renderer becomes hidden', () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    const getTracks = vi.fn();
    Object.defineProperty(window, 'echo', {
      configurable: true,
      value: {
        library: {
          getTracks,
        },
      },
    });

    const { unmount } = renderHook(() => useLibraryStartupArtworkPreloader());
    act(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(1_000);
    });

    expect(getTracks).not.toHaveBeenCalled();
    unmount();
  });

  it('cancels scheduled preload work when the main window is minimized explicitly', () => {
    vi.useFakeTimers();
    const getTracks = vi.fn();
    let minimizedHandler: ((isMinimized: boolean) => void) | null = null;
    Object.defineProperty(window, 'echo', {
      configurable: true,
      value: {
        app: {
          onMinimizedChange: (handler: (isMinimized: boolean) => void) => {
            minimizedHandler = handler;
            return () => {
              minimizedHandler = null;
            };
          },
        },
        library: { getTracks },
      },
    });

    const { unmount } = renderHook(() => useLibraryStartupArtworkPreloader());
    act(() => minimizedHandler?.(true));
    act(() => vi.advanceTimersByTime(1_000));

    expect(getTracks).not.toHaveBeenCalled();
    unmount();
    expect(minimizedHandler).toBeNull();
  });

  it('does not query remote libraries for speculative startup artwork', () => {
    vi.useFakeTimers();
    window.localStorage.setItem('echo.library.source-mode', 'remote');
    const getTracks = vi.fn();
    const getAlbums = vi.fn();
    const getArtists = vi.fn();
    Object.defineProperty(window, 'echo', {
      configurable: true,
      value: {
        library: { getTracks, getAlbums, getArtists },
      },
    });

    const { unmount } = renderHook(() => useLibraryStartupArtworkPreloader());
    act(() => vi.advanceTimersByTime(1_000));

    expect(getTracks).not.toHaveBeenCalled();
    expect(getAlbums).not.toHaveBeenCalled();
    expect(getArtists).not.toHaveBeenCalled();
    unmount();
  });

  it('keeps local startup artwork preloading enabled', () => {
    vi.useFakeTimers();
    const getTracks = vi.fn().mockResolvedValue({ items: [] });
    const getAlbums = vi.fn().mockResolvedValue({ items: [] });
    const getArtists = vi.fn().mockResolvedValue({ items: [] });
    Object.defineProperty(window, 'echo', {
      configurable: true,
      value: {
        library: { getTracks, getAlbums, getArtists },
      },
    });

    const { unmount } = renderHook(() => useLibraryStartupArtworkPreloader());
    act(() => vi.advanceTimersByTime(1_000));

    expect(getTracks).toHaveBeenCalledWith(expect.objectContaining({ sourceProvider: 'local' }));
    expect(getAlbums).toHaveBeenCalledWith(expect.objectContaining({ sourceProvider: 'local' }));
    expect(getArtists).toHaveBeenCalledWith(expect.objectContaining({ sourceProvider: 'local' }));
    unmount();
  });

  it('interleaves page artwork so one surface cannot consume the startup budget', () => {
    expect(
      selectStartupArtworkUrls(
        [
          ['track-1', 'track-2', 'track-3'],
          ['album-1', 'album-2'],
          ['artist-1', 'artist-2'],
        ],
        5,
      ),
    ).toEqual(['track-1', 'album-1', 'artist-1', 'track-2', 'album-2']);
  });

  it('deduplicates, skips remembered urls, and ignores default artist covers', () => {
    expect(
      collectStartupArtworkUrls(
        {
          tracks: [track('track-1', 'cover-a'), track('track-2', 'cover-b')],
          albums: [album('album-1', 'cover-a'), album('album-2', 'album-cover')],
          artists: [
            artist('artist-1', {
              avatarThumbUrl: 'artist-thumb',
              avatarUrl: 'artist-large',
              coverSource: 'default',
              coverThumb: 'default-cover',
            }),
            artist('artist-2', {
              avatarThumbUrl: null,
              avatarUrl: null,
              coverSource: 'embedded',
              coverThumb: 'artist-cover',
            }),
          ],
        },
        10,
        new Set(['cover-b']),
      ),
    ).toEqual(['cover-a', 'artist-thumb', 'album-cover', 'artist-cover']);
  });
});
