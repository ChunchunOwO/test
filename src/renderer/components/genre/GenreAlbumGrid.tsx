import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Disc3 } from 'lucide-react';
import type { LibraryAlbum, LibraryPage, LibraryPageQuery } from '../../../shared/types/library';
import { useI18n } from '../../i18n/I18nProvider';
import { localCoverDisplayUrl } from '../../utils/coverDisplayUrl';
import { collectUniqueCoverUrls, GENRE_MOSAIC_MAX_TILES } from '../../utils/genreMosaicCovers';
import { useLowSpecModeEnabled } from '../../performance/useLowSpecModeEnabled';
import { beginAlbumCoverEnter } from '../../utils/albumCoverEnterTransition';
import { InfiniteScrollSentinel } from '../ui/InfiniteScrollSentinel';
import { MediaWallScrollSpacer, useMediaWallScrollSpacer } from '../ui/MediaWallScrollSpacer';

type GenreAlbumGridProps = {
  genreKey: string;
  genreName: string;
  albumCount?: number;
  sourceProvider?: 'local' | 'remote';
  sourceId?: string | null;
  onAlbumSelect: (album: LibraryAlbum) => void;
  onPreviewCovers?: (coverUrls: string[]) => void;
};

const pageSize = 24;
const initialSkeletonCount = 8;
const priorityCoverCount = 8;

const albumDisplayCoverUrl = (album: LibraryAlbum): string | null =>
  localCoverDisplayUrl(album.coverId) ?? album.coverThumb ?? null;

const coverFailureKey = (album: LibraryAlbum, coverUrl: string): string => `${album.id}\n${coverUrl}`;

const uniqueAlbums = (albums: LibraryAlbum[]): LibraryAlbum[] => {
  const byId = new Map<string, LibraryAlbum>();
  albums.forEach((album) => byId.set(album.id, album));
  return [...byId.values()];
};

export const GenreAlbumGrid = ({
  genreKey,
  genreName,
  albumCount,
  sourceProvider,
  sourceId,
  onAlbumSelect,
  onPreviewCovers,
}: GenreAlbumGridProps): JSX.Element => {
  const { t } = useI18n();
  const lowSpecModeEnabled = useLowSpecModeEnabled();
  const [albums, setAlbums] = useState<LibraryAlbum[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [failedCoverUrls, setFailedCoverUrls] = useState<Record<string, true>>({});
  const requestIdRef = useRef(0);
  const isLoadingRef = useRef(true);
  const { wallRef: albumWallRef, spacerHeight } = useMediaWallScrollSpacer<HTMLDivElement>({
    itemCount: albums.length,
    totalCount: total,
    minColumnWidth: 164,
    columnGap: 14,
    rowGap: 14,
    estimatedItemHeight: 232,
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

      try {
        const library = window.echo?.library;

        if (!library?.getGenreAlbums) {
          setAlbums([]);
          setPage(1);
          setTotal(0);
          setHasMore(false);
          setError(t('genreDetail.albums.error.desktopBridge'));
          return;
        }

        const query: LibraryPageQuery = {
          page: nextPage,
          pageSize,
          sort: 'titleAsc',
          sourceProvider: sourceProvider === 'remote' ? 'remote' : 'local',
          ...(sourceId ? { sourceId } : {}),
        };
        const result: LibraryPage<LibraryAlbum> = await library.getGenreAlbums(genreKey, query);

        if (requestIdRef.current !== requestId) {
          return;
        }

        setAlbums((current) => uniqueAlbums(mode === 'append' ? [...current, ...result.items] : result.items));
        setPage(result.page);
        setTotal(result.total);
        setHasMore(result.hasMore);
        setFailedCoverUrls({});
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
    [genreKey, sourceId, sourceProvider, t],
  );

  useEffect(() => {
    void loadAlbums(1, 'replace');
  }, [loadAlbums]);

  useEffect(() => {
    if (!onPreviewCovers || albums.length === 0) {
      return;
    }
    onPreviewCovers(collectUniqueCoverUrls(
      albums.map((album) => albumDisplayCoverUrl(album)),
      lowSpecModeEnabled ? 1 : GENRE_MOSAIC_MAX_TILES,
    ));
  }, [albums, lowSpecModeEnabled, onPreviewCovers]);

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
  const expectedSkeletonCount = typeof albumCount === 'number' && Number.isFinite(albumCount)
    ? Math.ceil(albumCount)
    : initialSkeletonCount;
  const skeletonCount = Math.min(pageSize, Math.max(1, expectedSkeletonCount));

  if (!isLoading && albums.length === 0 && !error) {
    return <p className="album-detail-empty">{t('genreDetail.albums.empty')}</p>;
  }

  return (
    <>
      {error ? <p className="album-detail-error">{error}</p> : null}

      <div
        className="album-wall"
        ref={albumWallRef}
        data-loading={showInitialLoading ? 'true' : undefined}
        aria-label={t('genreDetail.albums.aria', { genre: genreName })}
      >
        {showInitialLoading
          ? Array.from({ length: skeletonCount }, (_, index) => (
              <article className="album-card album-card-skeleton" key={`genre-album-skeleton-${index}`} aria-hidden="true">
                <div className="album-cover" />
                <div className="album-copy">
                  <strong />
                  <span />
                </div>
              </article>
            ))
          : albums.map((album, index) => {
              const originalCover = albumDisplayCoverUrl(album);
              const coverUrl = originalCover && !failedCoverUrls[coverFailureKey(album, originalCover)]
                ? originalCover
                : null;
              const shouldShowCover = Boolean(coverUrl);

              return (
                <article
                  className="album-card"
                  key={album.id}
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    beginAlbumCoverEnter(event.currentTarget);
                    onAlbumSelect(album);
                  }}
                  onKeyDown={(event) => handleAlbumKeyDown(event, album)}
                >
                  <div className="album-cover" data-empty={!shouldShowCover} aria-hidden="true">
                    {shouldShowCover ? (
                      <img
                        alt=""
                        decoding="async"
                        draggable={false}
                        height={320}
                        loading={index < (lowSpecModeEnabled ? 4 : priorityCoverCount) ? 'eager' : 'lazy'}
                        src={coverUrl ?? undefined}
                        width={320}
                        onError={() => {
                          if (!coverUrl) {
                            return;
                          }
                          setFailedCoverUrls((current) => ({ ...current, [coverFailureKey(album, coverUrl)]: true }));
                        }}
                      />
                    ) : (
                      <Disc3 size={24} />
                    )}
                  </div>
                  <div className="album-copy">
                    <strong>{album.title}</strong>
                    <div className="album-meta-row">
                      <span>{album.albumArtist}</span>
                      <small>{t('library.albums.card.tracks', { count: album.trackCount })}</small>
                    </div>
                  </div>
                </article>
              );
            })}
      </div>
      <InfiniteScrollSentinel canLoadMore={hasMore} isLoading={isLoading} onLoadMore={() => void loadAlbums(page + 1, 'append')} />
      <MediaWallScrollSpacer height={spacerHeight} />
    </>
  );
};
