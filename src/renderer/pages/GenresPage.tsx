import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Check, ChevronDown, ListFilter, Play, RefreshCw, Search } from 'lucide-react';
import type { LibraryGenre, LibrarySort } from '../../shared/types/library';
import type { RemoteSource } from '../../shared/types/remoteSources';
import { GenreDetailView } from '../components/genre/GenreDetailView';
import { artistMark } from '../components/artist/artistVisual';
import { LibrarySourceSwitch } from '../components/library/LibrarySourceSwitch';
import { RemoteSourceFilter } from '../components/library/RemoteSourceFilter';
import { DeferredWallImage, useScrollImagePause } from '../components/ui/DeferredWallImage';
import { InfiniteScrollSentinel, readPageScrollTop, writePageScrollTop } from '../components/ui/InfiniteScrollSentinel';
import { MediaWallScrollSpacer, useMediaWallScrollSpacer } from '../components/ui/MediaWallScrollSpacer';
import { useI18n } from '../i18n/I18nProvider';
import type { TranslationKey } from '../i18n/locales';
import { useLowSpecModeEnabled } from '../performance/useLowSpecModeEnabled';
import { useSharedPlaybackActivityState } from '../stores/playbackStatusStore';
import { dispatchDetailReturnNavigation, type DetailReturnTarget } from '../utils/albumNavigation';
import { consumePendingGenreDetailNavigation, genreDetailNavigationEvent, genreDisplayName } from '../utils/genreNavigation';
import { getRemoteSourcesBridge } from '../utils/echoBridge';
import { useImeAwareDebouncedSearch } from '../utils/imeInput';
import { readStoredLibrarySort, writeStoredLibrarySort } from '../utils/librarySortMemory';
import { readStoredLibrarySourceMode, writeStoredLibrarySourceMode, type LibrarySourceMode } from '../utils/librarySourceMode';

const pageSize = 96;
const genreWallReturnAnimationMs = 80;
const preserveScrollThresholdPx = 80;
const maxPreservedRefreshPageSize = 500;
const remoteSourcePlaybackRefreshDelayMs = 4000;
const isPreserveScrollLibraryEvent = (event: Event): boolean =>
  event instanceof CustomEvent && event.detail && typeof event.detail === 'object' && event.detail.preserveScroll === true;
const isRemoteSourceRefreshPlaybackBusy = (state: string | null | undefined): boolean =>
  state === 'loading' || state === 'playing';
const genreSortOptions: Array<{ value: LibrarySort; labelKey: TranslationKey }> = [
  { value: 'default', labelKey: 'library.genres.sort.frequent' },
  { value: 'titleAsc', labelKey: 'library.genres.sort.nameAsc' },
  { value: 'titleDesc', labelKey: 'library.genres.sort.nameDesc' },
  { value: 'random', labelKey: 'library.sort.random' },
];
const genresSortStorageKey = 'echo.genres.sort';
const validGenreSortValues = new Set<LibrarySort>(genreSortOptions.map((option) => option.value));

const genreMeta = (genre: LibraryGenre, t: (key: TranslationKey, options?: Record<string, string | number>) => string): string => {
  const parts: string[] = [];
  if (genre.trackCount > 0) {
    parts.push(t('library.genres.meta.tracks', { count: genre.trackCount }));
  }
  if (genre.albumCount > 0) {
    parts.push(t('library.genres.meta.albums', { count: genre.albumCount }));
  }
  return parts.join(' / ') || t('library.genres.meta.noTracks');
};

export const GenresPage = (): JSX.Element => {
  const { t } = useI18n();
  const lowSpecModeEnabled = useLowSpecModeEnabled();
  const [genres, setGenres] = useState<LibraryGenre[]>([]);
  const [total, setTotal] = useState(0);
  const { search, searchInputProps } = useImeAwareDebouncedSearch(250);
  const [sort, setSort] = useState<LibrarySort>(() => readStoredLibrarySort(genresSortStorageKey, validGenreSortValues));
  const [sourceMode, setSourceModeState] = useState<LibrarySourceMode>(() => readStoredLibrarySourceMode());
  const [remoteSourceId, setRemoteSourceId] = useState<string | null>(null);
  const [remoteSources, setRemoteSources] = useState<RemoteSource[]>([]);
  const [remoteSourcesLoaded, setRemoteSourcesLoaded] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [selectedGenre, setSelectedGenre] = useState<LibraryGenre | null>(null);
  const [selectedGenreReturnTo, setSelectedGenreReturnTo] = useState<DetailReturnTarget | null>(null);
  const [isGenreWallReturning, setIsGenreWallReturning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pageRootRef = useRef<HTMLDivElement | null>(null);
  const pageScrollTopRef = useRef(0);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const shouldRestorePageScrollRef = useRef(false);
  const requestIdRef = useRef(0);
  const isLoadingRef = useRef(false);
  const genreWallReturnTimerRef = useRef<number | null>(null);
  const sourceRouteReturnCloseTimerRef = useRef<number | null>(null);
  const pauseDeferredImages = useScrollImagePause(pageRootRef);
  const playbackActivityState = useSharedPlaybackActivityState();
  const remoteSourceRefreshPlaybackBusy = isRemoteSourceRefreshPlaybackBusy(playbackActivityState);
  const { wallRef: genreWallRef, spacerHeight } = useMediaWallScrollSpacer<HTMLElement>({
    itemCount: genres.length,
    totalCount: total,
    minColumnWidth: 128,
    columnGap: 22,
    rowGap: 30,
    estimatedItemHeight: 174,
  });

  useEffect(() => {
    if (!isSortOpen) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent): void => {
      if (!sortMenuRef.current?.contains(event.target as Node)) {
        setIsSortOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [isSortOpen]);

  useEffect(
    () => () => {
      if (genreWallReturnTimerRef.current !== null) {
        window.clearTimeout(genreWallReturnTimerRef.current);
      }
      if (sourceRouteReturnCloseTimerRef.current !== null) {
        window.clearTimeout(sourceRouteReturnCloseTimerRef.current);
      }
    },
    [],
  );

  const loadGenres = useCallback(
    async (
      nextPage: number,
      mode: 'replace' | 'append',
      options: { pageSizeOverride?: number; restoreScrollTop?: number } = {},
    ) => {
      if (mode === 'append' && isLoadingRef.current) {
        return;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      isLoadingRef.current = true;
      setIsLoading(true);
      setError(null);

      try {
        const library = window.echo?.library;

        if (!library?.getGenres) {
          setGenres([]);
          setPage(1);
          setTotal(0);
          setHasMore(false);
          setError(t('library.genres.error.desktopBridge'));
          return;
        }

        const result = await library.getGenres({
          page: nextPage,
          pageSize: options.pageSizeOverride ?? pageSize,
          search,
          sort,
          sourceProvider: sourceMode,
          ...(sourceMode === 'remote' && remoteSourceId ? { sourceId: remoteSourceId } : {}),
        });

        if (requestIdRef.current !== requestId) {
          return;
        }

        setGenres((current) => (mode === 'append' ? [...current, ...result.items] : result.items));
        setPage(options.pageSizeOverride && mode === 'replace' ? Math.max(1, Math.ceil(result.items.length / pageSize)) : result.page);
        setTotal(result.total);
        setHasMore(result.hasMore);
        if (typeof options.restoreScrollTop === 'number') {
          const restoreScrollTop = options.restoreScrollTop;
          window.setTimeout(() => writePageScrollTop(pageRootRef.current, restoreScrollTop), 0);
        }
      } catch (loadError) {
        if (requestIdRef.current === requestId) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        if (requestIdRef.current === requestId) {
          isLoadingRef.current = false;
          setIsLoading(false);
        }
      }
    },
    [remoteSourceId, search, sort, sourceMode, t],
  );

  const setSourceMode = useCallback((mode: LibrarySourceMode): void => {
    setSourceModeState(mode);
    if (mode !== 'remote') {
      setRemoteSourceId(null);
    }
    writeStoredLibrarySourceMode(mode);
  }, []);

  const refreshRemoteSources = useCallback(async (): Promise<void> => {
    const remoteApi = getRemoteSourcesBridge();
    if (!remoteApi?.list) {
      setRemoteSources([]);
      setRemoteSourcesLoaded(true);
      return;
    }

    try {
      const sources = await remoteApi.list();
      setRemoteSources(sources.filter((source) => source.status !== 'disabled'));
    } catch {
      setRemoteSources([]);
    } finally {
      setRemoteSourcesLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadGenres(1, 'replace');
  }, [loadGenres]);

  useEffect(() => {
    writeStoredLibrarySort(genresSortStorageKey, sort);
  }, [sort]);

  useEffect(() => {
    if (sourceMode !== 'remote' && remoteSourcesLoaded) {
      return undefined;
    }

    if (sourceMode === 'remote' || !remoteSourceRefreshPlaybackBusy) {
      void refreshRemoteSources();
      return undefined;
    }

    const timerId = window.setTimeout(() => {
      void refreshRemoteSources();
    }, remoteSourcePlaybackRefreshDelayMs);

    return () => window.clearTimeout(timerId);
  }, [refreshRemoteSources, remoteSourceRefreshPlaybackBusy, remoteSourcesLoaded, sourceMode]);

  useEffect(() => {
    if (sourceMode !== 'remote') {
      return undefined;
    }

    const handleRemoteSourcesChanged = (): void => {
      void refreshRemoteSources();
    };

    window.addEventListener('library:changed', handleRemoteSourcesChanged);
    return () => window.removeEventListener('library:changed', handleRemoteSourcesChanged);
  }, [refreshRemoteSources, sourceMode]);

  useEffect(() => {
    const handleLibraryChanged = (event: Event): void => {
      const scrollTop = readPageScrollTop(pageRootRef.current);
      if (isPreserveScrollLibraryEvent(event) && scrollTop > preserveScrollThresholdPx) {
        void loadGenres(1, 'replace', {
          pageSizeOverride: Math.min(maxPreservedRefreshPageSize, Math.max(pageSize, page * pageSize, genres.length)),
          restoreScrollTop: scrollTop,
        });
        return;
      }

      writePageScrollTop(pageRootRef.current, 0);
      void loadGenres(1, 'replace');
    };

    window.addEventListener('library:changed', handleLibraryChanged);
    return () => window.removeEventListener('library:changed', handleLibraryChanged);
  }, [genres.length, loadGenres, page]);

  useLayoutEffect(() => {
    writePageScrollTop(pageRootRef.current, 0);
  }, [search, sort, sourceMode]);

  useLayoutEffect(() => {
    if (selectedGenre || !shouldRestorePageScrollRef.current) {
      return;
    }

    writePageScrollTop(pageRootRef.current, pageScrollTopRef.current);
    shouldRestorePageScrollRef.current = false;
  }, [selectedGenre]);

  const handleLoadMoreGenres = useCallback((): void => {
    if (isLoadingRef.current || !hasMore) {
      return;
    }

    void loadGenres(page + 1, 'append');
  }, [hasMore, loadGenres, page]);

  const handleRefresh = useCallback((): void => {
    writePageScrollTop(pageRootRef.current, 0);
    void loadGenres(1, 'replace');
  }, [loadGenres]);

  const openGenreDetail = useCallback((nextGenre: LibraryGenre, returnTo: DetailReturnTarget | null = null): void => {
    if (genreWallReturnTimerRef.current !== null) {
      window.clearTimeout(genreWallReturnTimerRef.current);
      genreWallReturnTimerRef.current = null;
    }
    setIsGenreWallReturning(false);
    pageScrollTopRef.current = readPageScrollTop(pageRootRef.current);
    shouldRestorePageScrollRef.current = !returnTo;
    setSelectedGenreReturnTo(returnTo);
    setSelectedGenre(nextGenre);
  }, []);

  const closeGenreDetail = useCallback((showReturnAnimation = false): void => {
    if (sourceRouteReturnCloseTimerRef.current !== null) {
      window.clearTimeout(sourceRouteReturnCloseTimerRef.current);
      sourceRouteReturnCloseTimerRef.current = null;
    }

    setSelectedGenreReturnTo(null);
    setSelectedGenre(null);

    if (!showReturnAnimation) {
      return;
    }

    if (genreWallReturnTimerRef.current !== null) {
      window.clearTimeout(genreWallReturnTimerRef.current);
    }

    setIsGenreWallReturning(true);
    genreWallReturnTimerRef.current = window.setTimeout(() => {
      genreWallReturnTimerRef.current = null;
      setIsGenreWallReturning(false);
    }, genreWallReturnAnimationMs);
  }, []);

  const closeGenreDetailAfterSourceRouteSwitch = useCallback((): void => {
    if (sourceRouteReturnCloseTimerRef.current !== null) {
      window.clearTimeout(sourceRouteReturnCloseTimerRef.current);
    }

    sourceRouteReturnCloseTimerRef.current = window.setTimeout(() => {
      sourceRouteReturnCloseTimerRef.current = null;
      closeGenreDetail();
    }, 0);
  }, [closeGenreDetail]);

  useEffect(() => {
    const pendingRequest = consumePendingGenreDetailNavigation();
    if (pendingRequest) {
      openGenreDetail(pendingRequest.genre, pendingRequest.returnTo ?? null);
    }

    const handleNavigateGenreDetail = (event: Event): void => {
      const request = (event as CustomEvent<{ genre?: LibraryGenre; returnTo?: DetailReturnTarget }>).detail;
      if (request?.genre) {
        consumePendingGenreDetailNavigation();
        openGenreDetail(request.genre, request.returnTo ?? null);
      }
    };

    window.addEventListener(genreDetailNavigationEvent, handleNavigateGenreDetail);
    return () => window.removeEventListener(genreDetailNavigationEvent, handleNavigateGenreDetail);
  }, [openGenreDetail]);

  const handleBackFromGenreDetail = useCallback((): void => {
    if (dispatchDetailReturnNavigation(selectedGenreReturnTo)) {
      closeGenreDetailAfterSourceRouteSwitch();
      return;
    }

    closeGenreDetail(true);
  }, [closeGenreDetail, closeGenreDetailAfterSourceRouteSwitch, selectedGenreReturnTo]);

  const handleGenreKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>, nextGenre: LibraryGenre): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openGenreDetail(nextGenre);
    }
  }, [openGenreDetail]);

  return (
    <>
      {selectedGenre ? <GenreDetailView genre={selectedGenre} onBack={handleBackFromGenreDetail} /> : null}
      <div
        className="artists-page genres-page"
        data-detail-open={selectedGenre ? 'true' : 'false'}
        data-detail-returning={isGenreWallReturning ? 'true' : undefined}
        aria-hidden={selectedGenre ? 'true' : undefined}
      >
        <header className="songs-header">
          <div className="songs-title-group">
            <h1>{t('library.genres.title')}</h1>
            <span>{t('library.count.total', { count: total })}</span>
          </div>
          <button className="tool-button album-refresh" type="button" aria-label={t('library.action.refresh')} title={t('library.action.refresh')} onClick={handleRefresh}>
            <RefreshCw size={17} />
          </button>
        </header>

        <div className="songs-control-row">
          <label className="search-box echo-search-surface">
            <Search size={18} aria-hidden="true" />
            <input type="search" placeholder={t('library.genres.searchPlaceholder')} {...searchInputProps} />
          </label>

          <div className="artist-control-actions">
            <LibrarySourceSwitch value={sourceMode} onChange={setSourceMode} />
            {sourceMode === 'remote' ? <RemoteSourceFilter sources={remoteSources} value={remoteSourceId} onChange={setRemoteSourceId} /> : null}

            <div className="sort-select" ref={sortMenuRef}>
              <button
                className="sort-button"
                type="button"
                aria-haspopup="listbox"
                aria-expanded={isSortOpen}
                onClick={() => setIsSortOpen((current) => !current)}
              >
                <ListFilter className="sort-button-icon" size={16} aria-hidden="true" />
                <span className="sort-button-label">{t(genreSortOptions.find((option) => option.value === sort)?.labelKey ?? 'library.genres.sort.frequent')}</span>
                <ChevronDown className="sort-button-chevron" size={15} aria-hidden="true" />
              </button>
              {isSortOpen ? (
                <div className="sort-menu" role="listbox" aria-label={t('library.genres.sort.aria')}>
                  {genreSortOptions.map((option) => (
                    <button
                      key={option.value}
                      className="sort-option"
                      type="button"
                      role="option"
                      aria-selected={sort === option.value}
                      onClick={() => {
                        setSort(option.value);
                        setIsSortOpen(false);
                      }}
                    >
                      <span>{t(option.labelKey)}</span>
                      {sort === option.value ? <Check size={14} /> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div ref={pageRootRef} className="media-wall-scroll-shell page-scroll-container">
          <section ref={genreWallRef} className="artist-wall" aria-label={t('library.genres.listAria')} data-loaded-count={genres.length}>
            {genres.map((item, index) => {
              const name = genreDisplayName(item, t);
              const coverUrl = item.coverThumb;
              return (
                <article
                  className="artist-card"
                  data-cover={Boolean(coverUrl)}
                  data-unclassified={item.unclassified ? 'true' : undefined}
                  data-genre-key={item.genreKey}
                  key={`${item.mediaType ?? 'local'}:${item.sourceId ?? ''}:${item.genreKey}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => openGenreDetail(item)}
                  onKeyDown={(event) => handleGenreKeyDown(event, item)}
                >
                  <div className="artist-avatar" data-cover={Boolean(coverUrl)} data-visual={coverUrl ? 'cover' : 'letter'} aria-hidden="true">
                    {coverUrl ? (
                      <DeferredWallImage
                        alt=""
                        decoding="async"
                        draggable={false}
                        height={384}
                        loading={index < (lowSpecModeEnabled ? 6 : 24) ? 'eager' : 'lazy'}
                        paused={pauseDeferredImages}
                        priority={index < (lowSpecModeEnabled ? 6 : 24)}
                        sizes="124px"
                        src={coverUrl}
                        width={384}
                      />
                    ) : (
                      <span>{artistMark(name)}</span>
                    )}
                  </div>
                  <div className="artist-copy">
                    <strong>{name}</strong>
                    {item.mediaType === 'remote' ? <small className="remote-media-source">{item.sourceDisplayName ?? t('library.source.remote')}</small> : null}
                    <small>{genreMeta(item, t)}</small>
                  </div>
                  <span className="artist-card-action" aria-hidden="true">
                    <Play size={14} fill="currentColor" />
                  </span>
                </article>
              );
            })}
          </section>
          <InfiniteScrollSentinel canLoadMore={hasMore} isLoading={isLoading} onLoadMore={handleLoadMoreGenres} />

          {error ? (
            <div className="list-footer">
              <span>{error}</span>
            </div>
          ) : null}
          {!error && isLoading && genres.length === 0 ? (
            <div className="list-footer">
              <span>{t('library.genres.loading')}</span>
            </div>
          ) : null}
          {!isLoading && !error && genres.length === 0 ? (
            <div className="list-footer">
              <span>{t('library.genres.empty')}</span>
            </div>
          ) : null}
          <MediaWallScrollSpacer height={spacerHeight} />
        </div>
      </div>
    </>
  );
};
