import { useEffect } from 'react';
import type { AudioPlaybackState } from '../../shared/types/audio';
import type { LibraryAlbum, LibraryArtist, LibrarySort, LibraryTrack } from '../../shared/types/library';
import { useSharedPlaybackActivityState } from '../stores/playbackStatusStore';
import { useRenderBudget } from '../performance/renderBudget';
import { readStoredLibrarySort } from '../utils/librarySortMemory';
import { readStoredLibrarySourceMode } from '../utils/librarySourceMode';

const startupArtworkPreloadDelayMs = 900;
const startupArtworkPreloadConcurrency = 2;
const startupArtworkMaxImages = 24;
const startupArtworkSourcePageSize = 48;
const maxRememberedStartupArtworkUrls = 1600;
const startupArtworkPreloadAllowedStates = new Set<AudioPlaybackState>(['idle', 'stopped', 'ended']);

const songsSortStorageKey = 'echo.songs.sort';
const songsHideDuplicatesStorageKey = 'echo.songs.hide-duplicates';
const albumsSortStorageKey = 'echo.albums.sort';
const artistsSortStorageKey = 'echo.artists.sort';

const songsSortValues = new Set<LibrarySort>([
  'default',
  'createdAsc',
  'createdDesc',
  'titleAsc',
  'titleDesc',
  'durationAsc',
  'durationDesc',
  'fileModifiedAsc',
  'fileModifiedDesc',
  'qualityAsc',
  'qualityDesc',
  'frequent',
  'random',
  'artist',
  'artistAlbum',
  'album',
  'recent',
]);
const albumSortValues = new Set<LibrarySort>([
  'default',
  'titleAsc',
  'titleDesc',
  'artist',
  'createdAsc',
  'createdDesc',
  'durationAsc',
  'durationDesc',
  'fileModifiedAsc',
  'fileModifiedDesc',
  'recent',
  'random',
]);
const artistSortValues = new Set<LibrarySort>([
  'default',
  'titleAsc',
  'titleDesc',
  'frequent',
  'createdAsc',
  'createdDesc',
  'random',
]);

const rememberedStartupArtworkUrls = new Set<string>();
const localCoverVariantPattern = /^echo-cover:\/\/(?:thumb|album|large|original)\//i;

export const isStartupArtworkPreloadAllowed = (state: AudioPlaybackState): boolean =>
  startupArtworkPreloadAllowedStates.has(state);

export const isStartupArtworkPreloadVisibilityAllowed = (state: DocumentVisibilityState): boolean =>
  state !== 'hidden';

export const startupArtworkIdentityKey = (url: string): string =>
  url.replace(localCoverVariantPattern, 'echo-cover://identity/');

const readStoredSongsHideDuplicates = (): boolean => {
  try {
    return window.localStorage.getItem(songsHideDuplicatesStorageKey) === 'true';
  } catch {
    return false;
  }
};

const rememberStartupArtworkUrl = (url: string): void => {
  rememberedStartupArtworkUrls.add(startupArtworkIdentityKey(url));
  while (rememberedStartupArtworkUrls.size > maxRememberedStartupArtworkUrls) {
    const oldest = rememberedStartupArtworkUrls.values().next().value;
    if (typeof oldest !== 'string') {
      break;
    }
    rememberedStartupArtworkUrls.delete(oldest);
  }
};

const isArtworkUrl = (url: string | null | undefined): url is string => typeof url === 'string' && url.trim().length > 0;

const artistArtworkUrls = (artist: LibraryArtist): string[] => {
  const urls: string[] = [];

  if (isArtworkUrl(artist.avatarThumbUrl)) {
    urls.push(artist.avatarThumbUrl);
  } else if (isArtworkUrl(artist.avatarUrl)) {
    urls.push(artist.avatarUrl);
  }

  if (artist.coverSource !== 'default' && isArtworkUrl(artist.coverThumb)) {
    urls.push(artist.coverThumb);
  }

  return urls;
};

export const selectStartupArtworkUrls = (
  groups: string[][],
  limit: number,
  rememberedUrls: ReadonlySet<string> = rememberedStartupArtworkUrls,
): string[] => {
  const urls: string[] = [];
  const seen = new Set<string>();
  let groupIndex = 0;

  while (urls.length < limit) {
    let addedFromAnyGroup = false;

    for (const group of groups) {
      const url = group[groupIndex];
      if (!url) {
        continue;
      }
      addedFromAnyGroup = true;
      const identityKey = startupArtworkIdentityKey(url);
      if (seen.has(identityKey) || rememberedUrls.has(identityKey) || rememberedUrls.has(url)) {
        continue;
      }
      seen.add(identityKey);
      urls.push(url);
      if (urls.length >= limit) {
        break;
      }
    }

    if (!addedFromAnyGroup) {
      break;
    }
    groupIndex += 1;
  }

  return urls;
};

export const collectStartupArtworkUrls = (
  pages: {
    tracks?: LibraryTrack[];
    albums?: LibraryAlbum[];
    artists?: LibraryArtist[];
  },
  limit = startupArtworkMaxImages,
  rememberedUrls: ReadonlySet<string> = rememberedStartupArtworkUrls,
): string[] =>
  selectStartupArtworkUrls(
    [
      (pages.tracks ?? []).map((track) => track.coverThumb).filter(isArtworkUrl),
      (pages.albums ?? []).map((album) => album.coverThumb).filter(isArtworkUrl),
      (pages.artists ?? []).flatMap(artistArtworkUrls),
    ],
    limit,
    rememberedUrls,
  );

export const preloadStartupArtworkUrls = (
  urls: string[],
  options: { concurrency?: number; rememberUrl?: (url: string) => void } = {},
): (() => void) => {
  if (typeof Image === 'undefined' || urls.length === 0) {
    return () => undefined;
  }

  const concurrency = Math.max(1, Math.floor(options.concurrency ?? startupArtworkPreloadConcurrency));
  const rememberUrl = options.rememberUrl ?? rememberStartupArtworkUrl;
  const activeImages = new Set<HTMLImageElement>();
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
        image.onload = null;
        image.onerror = null;
        activeImages.delete(image);
        activeCount -= 1;
        if (cancelled) {
          return;
        }
        if (loaded) {
          rememberUrl(url);
        }
        // Keep the response cache warm without pinning a decoded image surface.
        image.removeAttribute('src');
        pump();
      };
      image.onload = () => finish(true);
      image.onerror = () => finish(false);
      image.decoding = 'async';
      image.src = url;
    }
  };

  pump();

  return () => {
    cancelled = true;
    for (const image of activeImages) {
      image.onload = null;
      image.onerror = null;
      image.removeAttribute('src');
    }
    activeImages.clear();
  };
};

export const useLibraryStartupArtworkPreloader = (): void => {
  const playbackState = useSharedPlaybackActivityState();
  const renderBudget = useRenderBudget();

  useEffect(() => {
    if (
      !isStartupArtworkPreloadAllowed(playbackState) ||
      !renderBudget.isVisible
    ) {
      return undefined;
    }

    let cancelled = false;
    let cancelPreload: (() => void) | null = null;
    let idleCallbackId: number | null = null;
    let timer: number | null = null;

    const cancelStartupArtwork = (): void => {
      cancelled = true;
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      if (idleCallbackId !== null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleCallbackId);
        idleCallbackId = null;
      }
      cancelPreload?.();
      cancelPreload = null;
    };

    const handleVisibilityChange = (): void => {
      if (!isStartupArtworkPreloadVisibilityAllowed(document.visibilityState)) {
        cancelStartupArtwork();
      }
    };

    const loadStartupArtwork = (): void => {
      if (cancelled) {
        return;
      }

      const library = window.echo?.library;
      if (!library) {
        return;
      }

      const sourceProvider = readStoredLibrarySourceMode();
      if (sourceProvider !== 'local') {
        return;
      }
      const songsSort = readStoredLibrarySort(songsSortStorageKey, songsSortValues, 'default');
      const albumsSort = readStoredLibrarySort(albumsSortStorageKey, albumSortValues, 'default');
      const artistsSort = readStoredLibrarySort(artistsSortStorageKey, artistSortValues, 'default');
      const hideDuplicates = readStoredSongsHideDuplicates();

      void Promise.allSettled([
        library.getTracks({
          duplicateMode: 'strict',
          hideDuplicates,
          page: 1,
          pageSize: startupArtworkSourcePageSize,
          showDuplicatesOnly: false,
          sort: songsSort,
          sourceProvider,
        }),
        library.getAlbums({
          page: 1,
          pageSize: startupArtworkSourcePageSize,
          sort: albumsSort,
          sourceProvider,
        }),
        library.getArtists({
          page: 1,
          pageSize: startupArtworkSourcePageSize,
          sort: artistsSort,
          sourceProvider,
        }),
      ]).then(([tracksResult, albumsResult, artistsResult]) => {
        if (cancelled) {
          return;
        }

        const urls = collectStartupArtworkUrls({
          tracks: tracksResult.status === 'fulfilled' ? tracksResult.value.items : [],
          albums: albumsResult.status === 'fulfilled' ? albumsResult.value.items : [],
          artists: artistsResult.status === 'fulfilled' ? artistsResult.value.items : [],
        });
        cancelPreload = preloadStartupArtworkUrls(urls);
      });
    };

    timer = window.setTimeout(() => {
      timer = null;
      if (typeof window.requestIdleCallback === 'function') {
        idleCallbackId = window.requestIdleCallback(() => {
          idleCallbackId = null;
          loadStartupArtwork();
        }, { timeout: 1_200 });
        return;
      }

      loadStartupArtwork();
    }, startupArtworkPreloadDelayMs);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const unsubscribeMemoryPressure = window.echo?.diagnostics?.onMemoryPressure?.(() => {
      cancelStartupArtwork();
    });

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      unsubscribeMemoryPressure?.();
      cancelStartupArtwork();
    };
  }, [playbackState, renderBudget.isVisible]);
};
