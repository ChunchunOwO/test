import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { ArrowUpDown, Check, ChevronDown, Disc3 } from 'lucide-react';
import type { LibraryAlbum, LibraryPage, LibrarySort } from '../../../shared/types/library';
import { useI18n } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n/locales';
import { localCoverDisplayUrl } from '../../utils/coverDisplayUrl';
import { beginAlbumCoverEnter } from '../../utils/albumCoverEnterTransition';
import { readStoredLibrarySort, writeStoredLibrarySort } from '../../utils/librarySortMemory';
import { InfiniteScrollSentinel } from '../ui/InfiniteScrollSentinel';
import { MediaWallScrollSpacer, useMediaWallScrollSpacer } from '../ui/MediaWallScrollSpacer';

type ArtistAlbumGridProps = {
  artistId: string;
  artistName: string;
  albumCount?: number;
  onAlbumSelect: (album: LibraryAlbum) => void;
};

const pageSize = 12;
const showAllPageSize = 500;
const initialSkeletonCount = 6;
const artistAlbumsSortStorageKey = 'echo.artist-albums.sort';
const artistAlbumSortOptions: Array<{ value: LibrarySort; labelKey: TranslationKey }> = [
  { value: 'recent', labelKey: 'library.albums.sort.recentAdded' },
  { value: 'yearDesc', labelKey: 'library.albums.sort.yearDesc' },
  { value: 'yearAsc', labelKey: 'library.albums.sort.yearAsc' },
];
const validArtistAlbumSortValues = new Set<LibrarySort>(artistAlbumSortOptions.map((option) => option.value));

const albumDisplayCoverUrl = (album: LibraryAlbum): string | null =>
  localCoverDisplayUrl(album.coverId);

const coverFailureKey = (album: LibraryAlbum, coverUrl: string): string => `${album.id}\n${coverUrl}`;

const uniqueAlbums = (albums: LibraryAlbum[]): LibraryAlbum[] => {
  const byId = new Map<string, LibraryAlbum>();
  albums.forEach((album) => byId.set(album.id, album));
  return [...byId.values()];
};

export const ArtistAlbumGrid = ({ artistId, artistName, albumCount, onAlbumSelect }: ArtistAlbumGridProps): JSX.Element => {
  const { t } = useI18n();
  const tRef = useRef(t);
  tRef.current = t;
  const [albums, setAlbums] = useState<LibraryAlbum[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isShowingAll, setIsShowingAll] = useState(false);
  const [sort, setSort] = useState<LibrarySort>(() => readStoredLibrarySort(artistAlbumsSortStorageKey, validArtistAlbumSortValues, 'recent'));
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedCoverUrls, setFailedCoverUrls] = useState<Record<string, true>>({});
  const requestIdRef = useRef(0);
  const isLoadingRef = useRef(true);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const { wallRef: albumWallRef, spacerHeight } = useMediaWallScrollSpacer<HTMLDivElement>({
    itemCount: albums.length,
    totalCount: total,
    minColumnWidth: 144,
    columnGap: 14,
    rowGap: 14,
    estimatedItemHeight: 214,
  });

  const loadAlbums = useCallback(
    async (nextPage: number, mode: 'replace' | 'append'): Promise<void> => {
      if (mode === 'append' && isLoadingRef.current) {
        return;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      isLoadingRef.current = true;
      setIsLoading(true);
      setError(null);
      setIsShowingAll(false);

      try {
        const library = window.echo?.library;

        if (!library?.getArtistAlbums) {
          setAlbums([]);
          setPage(1);
          setTotal(0);
          setHasMore(false);
          setError(tRef.current('artistDetail.albums.error.desktopBridge'));
          return;
        }

        const result: LibraryPage<LibraryAlbum> = await library.getArtistAlbums(artistId, {
          page: nextPage,
          pageSize,
          sort,
        });

        if (requestIdRef.current !== requestId) {
          return;
        }

        setAlbums((current) => (mode === 'append' ? [...current, ...result.items] : result.items));
        setPage(result.page);
        setTotal(result.total);
        setHasMore(result.hasMore);
        if (mode === 'replace') {
          setFailedCoverUrls({});
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
    [artistId, sort],
  );

  useEffect(() => {
    isLoadingRef.current = true;
    setAlbums([]);
    setPage(1);
    setTotal(0);
    setHasMore(false);
    setIsLoading(true);
    void loadAlbums(1, 'replace');
  }, [loadAlbums]);

  const handleCoverError = useCallback((album: LibraryAlbum, coverUrl: string): void => {
    setFailedCoverUrls((current) => ({ ...current, [coverFailureKey(album, coverUrl)]: true }));
  }, []);

  const handleLoadMore = useCallback((): void => {
    if (!isLoadingRef.current && hasMore) {
      void loadAlbums(page + 1, 'append');
    }
  }, [hasMore, loadAlbums, page]);

  const handleShowAllAlbums = useCallback(async (): Promise<void> => {
    if (isLoadingRef.current) {
      return;
    }

    const library = window.echo?.library;
    if (!library?.getArtistAlbums) {
      setError(tRef.current('artistDetail.albums.error.desktopBridge'));
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    isLoadingRef.current = true;
    setIsLoading(true);
    setIsShowingAll(true);
    setError(null);

    try {
      const collected: LibraryAlbum[] = [];
      let nextPage = 1;
      let nextHasMore = true;
      let nextTotal = Math.max(total, albums.length);

      while (nextHasMore) {
        const result = await library.getArtistAlbums(artistId, {
          page: nextPage,
          pageSize: showAllPageSize,
          sort,
        });

        if (requestIdRef.current !== requestId) {
          return;
        }

        collected.push(...result.items);
        nextTotal = Math.max(nextTotal, result.total);
        nextPage = result.page + 1;
        nextHasMore = result.hasMore && result.items.length > 0;
      }

      const nextAlbums = uniqueAlbums(collected);
      setAlbums(nextAlbums);
      setPage(Math.max(1, nextPage - 1));
      setTotal(nextTotal);
      setHasMore(false);
      setFailedCoverUrls({});
    } catch (loadError) {
      if (requestIdRef.current === requestId) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
    } finally {
      if (requestIdRef.current === requestId) {
        isLoadingRef.current = false;
        setIsLoading(false);
        setIsShowingAll(false);
      }
    }
  }, [albums.length, artistId, sort, total]);

  useEffect(() => {
    writeStoredLibrarySort(artistAlbumsSortStorageKey, sort);
  }, [sort]);

  useEffect(() => {
    if (!isSortOpen) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent): void => {
      if (!sortMenuRef.current?.contains(event.target as Node)) {
        setIsSortOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [isSortOpen]);

  const handleAlbumKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>, album: LibraryAlbum): void => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        beginAlbumCoverEnter(event.currentTarget);
        onAlbumSelect(album);
      }
    },
    [onAlbumSelect],
  );

  const showInitialLoading = isLoading && albums.length === 0 && !error;
  const expectedSkeletonCount = typeof albumCount === 'number' && Number.isFinite(albumCount) ? Math.ceil(albumCount) : initialSkeletonCount;
  const skeletonCount = Math.min(pageSize, Math.max(1, expectedSkeletonCount));
  const expectedTotal = typeof albumCount === 'number' && Number.isFinite(albumCount) ? Math.max(0, Math.ceil(albumCount)) : 0;
  const displayTotal = Math.max(total, expectedTotal, albums.length);
  const hasHiddenAlbums = displayTotal > albums.length || hasMore;

  if (!isLoading && albums.length === 0 && !error) {
    return (
      <section className="artist-section artist-section-muted" aria-label={t('artistDetail.albums.aria', { artist: artistName })}>
        <header>
          <div>
            <span>{t('artistDetail.tab.albums')}</span>
            <h2>{t('artistDetail.albums.heading', { artist: artistName })}</h2>
          </div>
        </header>
        <p className="artist-detail-empty">{t('artistDetail.albums.empty')}</p>
      </section>
    );
  }

  return (
    <section className="artist-section" aria-label={t('artistDetail.albums.aria', { artist: artistName })}>
      <header>
        <div>
          <span>{t('artistDetail.tab.albums')}</span>
          <h2>{t('artistDetail.albums.heading', { artist: artistName })}</h2>
        </div>
        <div className="artist-album-header-actions">
          <small>{albums.length >= displayTotal ? t('artistDetail.albums.count', { count: displayTotal }) : t('artistDetail.albums.loadedCount', { loaded: albums.length, total: displayTotal })}</small>
          <div className="sort-select artist-album-sort" ref={sortMenuRef}>
            <button
              className="sort-button"
              type="button"
              aria-haspopup="listbox"
              aria-expanded={isSortOpen}
              aria-label={t('library.albums.sort.aria')}
              onClick={() => setIsSortOpen((current) => !current)}
            >
              <ArrowUpDown className="sort-button-icon" size={15} aria-hidden="true" />
              <span className="sort-button-label">{t(artistAlbumSortOptions.find((option) => option.value === sort)?.labelKey ?? 'library.albums.sort.recentAdded')}</span>
              <ChevronDown className="sort-button-chevron" size={14} aria-hidden="true" />
            </button>
            {isSortOpen ? (
              <div className="sort-menu" role="listbox" aria-label={t('library.albums.sort.aria')} data-state="open">
                {artistAlbumSortOptions.map((option) => (
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
      </header>

      <div className="artist-album-strip" ref={albumWallRef} data-loading={showInitialLoading ? 'true' : undefined}>
        {showInitialLoading ? Array.from({ length: skeletonCount }, (_, index) => (
          <article className="artist-album-card artist-album-card-skeleton" key={`artist-album-skeleton-${index}`} aria-hidden="true">
            <div className="artist-album-cover" />
            <div className="artist-album-copy">
              <strong />
              <span />
            </div>
          </article>
        )) : albums.map((album) => {
          const originalCover = albumDisplayCoverUrl(album);
          const coverUrl = originalCover && !failedCoverUrls[coverFailureKey(album, originalCover)]
            ? originalCover
            : album.coverThumb && !failedCoverUrls[coverFailureKey(album, album.coverThumb)]
              ? album.coverThumb
              : null;
          const shouldShowCover = Boolean(coverUrl);

          return (
            <article
              className="artist-album-card"
              key={album.id}
              role="button"
              tabIndex={0}
              onClick={(event) => {
                beginAlbumCoverEnter(event.currentTarget);
                onAlbumSelect(album);
              }}
              onKeyDown={(event) => handleAlbumKeyDown(event, album)}
            >
              <div className="artist-album-cover" data-empty={!shouldShowCover} aria-hidden="true">
                {shouldShowCover ? (
                  <img
                    alt=""
                    decoding="async"
                    draggable={false}
                    height={320}
                    loading="lazy"
                    src={coverUrl!}
                    width={320}
                    onError={() => handleCoverError(album, coverUrl!)}
                  />
                ) : (
                  <Disc3 size={24} />
                )}
              </div>
              <div className="artist-album-copy">
                <strong>{album.title}</strong>
                <span>{[album.year ? String(album.year) : null, t('artistDetail.meta.tracks', { count: album.trackCount })].filter(Boolean).join(' / ')}</span>
              </div>
            </article>
          );
        })}
      </div>

      {!showInitialLoading && hasHiddenAlbums ? (
        <button className="artist-load-more artist-album-show-all" type="button" disabled={isLoading} onClick={() => void handleShowAllAlbums()}>
          {isShowingAll ? t('artistDetail.albums.showAllLoading') : t('artistDetail.albums.showAll')}
        </button>
      ) : null}
      {showInitialLoading ? <p className="artist-detail-status">{t('library.albums.loading')}</p> : null}
      <InfiniteScrollSentinel canLoadMore={hasMore} isLoading={isLoading} onLoadMore={handleLoadMore} />
      <MediaWallScrollSpacer height={spacerHeight} />
      {error ? <p className="artist-detail-error">{error}</p> : null}
    </section>
  );
};
