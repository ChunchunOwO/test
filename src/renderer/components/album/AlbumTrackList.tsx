import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { ArrowUpDown, ChevronDown, Heart, Play } from 'lucide-react';
import type { LibraryPage, LibraryTrack } from '../../../shared/types/library';
import { useLikedTrackIds } from '../../hooks/useLikedMedia';
import { useI18n } from '../../i18n/I18nProvider';
import {
  albumTrackSortOptions,
  readStoredAlbumTrackSort,
  sortAlbumTracks,
  writeStoredAlbumTrackSort,
  type AlbumTrackSort,
} from './albumTrackSort';

type AlbumTrackListProps = {
  albumId: string;
  currentTrackId: string | null;
  hidden?: boolean;
  onFirstTrackChange?: (track: LibraryTrack | null, isLoading: boolean) => void;
  onLoadedTracksChange?: (tracks: LibraryTrack[], total: number, isLoading: boolean) => void;
  onOpenTrackMenu?: (track: LibraryTrack, position: { x: number; y: number }) => void;
  onPlayTrack: (track: LibraryTrack) => void | Promise<void>;
  onToggleTrackLiked?: (track: LibraryTrack) => void | Promise<void>;
  initialLoadBlocked?: boolean;
  initialLoadDelayMs?: number;
  trackSort?: AlbumTrackSort;
  showSortControl?: boolean;
  summary?: {
    duration: string;
    signal: string;
    totalLabel: string;
  };
};

const pageSize = 100;

const formatDuration = (duration: number): string => {
  if (!Number.isFinite(duration) || duration <= 0) {
    return '--:--';
  }

  const totalSeconds = Math.round(duration);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const formatSampleRate = (sampleRate: number | null): string | null => {
  if (!sampleRate) {
    return null;
  }

  return sampleRate >= 1000 ? `${Math.round(sampleRate / 1000)}kHz` : `${sampleRate}Hz`;
};

const technicalTags = (track: LibraryTrack): string[] =>
  [
    track.codec?.toUpperCase() ?? null,
    track.bitDepth ? `${track.bitDepth}bit` : null,
    formatSampleRate(track.sampleRate),
    track.bitrate ? (track.bitrate >= 1000000 ? `${(track.bitrate / 1000000).toFixed(1)}Mbps` : `${Math.round(track.bitrate / 1000)}kbps`) : null,
  ].filter((tag): tag is string => Boolean(tag));

const normalizeDiscNo = (discNo: number | null): number | null => (discNo && Number.isFinite(discNo) && discNo > 0 ? Math.trunc(discNo) : null);

const isMultiDiscAlbum = (tracks: LibraryTrack[]): boolean => {
  const discNumbers = new Set(tracks.map((track) => normalizeDiscNo(track.discNo)).filter((discNo): discNo is number => discNo !== null));
  return discNumbers.size > 1 || [...discNumbers].some((discNo) => discNo > 1);
};

const formatAlbumTrackNumber = (track: LibraryTrack, index: number, multiDisc: boolean): string => {
  const trackNo = track.trackNo ?? index + 1;
  const discNo = normalizeDiscNo(track.discNo);
  return multiDisc && discNo ? `${discNo}-${trackNo}` : String(trackNo);
};

export const AlbumTrackList = ({
  albumId,
  currentTrackId,
  hidden = false,
  onFirstTrackChange,
  onLoadedTracksChange,
  onOpenTrackMenu,
  onPlayTrack,
  onToggleTrackLiked,
  initialLoadBlocked = false,
  initialLoadDelayMs = 0,
  trackSort,
  showSortControl = true,
  summary,
}: AlbumTrackListProps): JSX.Element => {
  const { t } = useI18n();
  const [tracks, setTracks] = useState<LibraryTrack[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const isLoadingRef = useRef(false);
  const loadTracksRef = useRef<(nextPage: number, mode: 'replace' | 'append') => Promise<void>>(async () => undefined);
  const likedTrackIds = useLikedTrackIds(tracks.map((track) => track.id));
  const [storedSort, setStoredSort] = useState<AlbumTrackSort>(() => readStoredAlbumTrackSort());
  const [isSortOpen, setIsSortOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const sort = trackSort ?? storedSort;
  const visibleTracks = useMemo(() => sortAlbumTracks(tracks, sort), [sort, tracks]);
  const multiDisc = useMemo(() => isMultiDiscAlbum(visibleTracks), [visibleTracks]);
  const shouldShowDiscHeaders = sort === 'default' && multiDisc;
  const trackSections = useMemo(() => {
    const sections: Array<{ discNo: number | null; tracks: Array<{ index: number; track: LibraryTrack }> }> = [];

    visibleTracks.forEach((track, index) => {
      const discNo = shouldShowDiscHeaders ? normalizeDiscNo(track.discNo) : null;
      const current = sections[sections.length - 1];

      if (!current || current.discNo !== discNo) {
        sections.push({ discNo, tracks: [{ index, track }] });
        return;
      }

      current.tracks.push({ index, track });
    });

    return sections;
  }, [shouldShowDiscHeaders, visibleTracks]);
  const loadedDurationLabel = useMemo(() => {
    const totalSeconds = visibleTracks.reduce(
      (sum, track) => sum + (Number.isFinite(track.duration) && track.duration > 0 ? track.duration : 0),
      0,
    );
    if (totalSeconds <= 0) {
      return t('albumDetail.status.unknownLength');
    }
    const totalMinutes = Math.max(1, Math.round(totalSeconds / 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0
      ? t('albumDetail.duration.hours', { hours, minutes })
      : t('albumDetail.duration.minutes', { minutes: totalMinutes });
  }, [t, visibleTracks]);
  const loadedSignalLabel = useMemo(
    () => (visibleTracks[0] ? technicalTags(visibleTracks[0]).join(' ') : t('albumDetail.status.readingSignal')),
    [t, visibleTracks],
  );

  const loadTracks = useCallback(
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

        if (!library) {
          setTracks([]);
          setPage(1);
          setTotal(0);
          setHasMore(false);
          setError(t('albumDetail.tracks.error.desktopBridgeRead'));
          return;
        }

        const result: LibraryPage<LibraryTrack> = await library.getAlbumTracks(albumId, {
          page: nextPage,
          pageSize,
        });

        if (requestIdRef.current !== requestId) {
          return;
        }

        setTracks((current) => (mode === 'append' ? [...current, ...result.items] : result.items));
        setPage(result.page);
        setTotal(result.total);
        setHasMore(result.hasMore);
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
    [albumId, t],
  );
  loadTracksRef.current = loadTracks;

  useEffect(() => {
    setTracks([]);
    setPage(1);
    setTotal(0);
    setHasMore(false);
    setError(null);
    if (initialLoadBlocked) {
      isLoadingRef.current = true;
      setIsLoading(true);
      return () => {
        requestIdRef.current += 1;
        isLoadingRef.current = false;
      };
    }

    if (initialLoadDelayMs > 0 && typeof window !== 'undefined') {
      isLoadingRef.current = true;
      setIsLoading(true);
      const timeoutId = window.setTimeout(() => {
        isLoadingRef.current = false;
        void loadTracksRef.current(1, 'replace');
      }, initialLoadDelayMs);

      return () => {
        window.clearTimeout(timeoutId);
        requestIdRef.current += 1;
        isLoadingRef.current = false;
      };
    }

    void loadTracksRef.current(1, 'replace');
    return undefined;
  }, [albumId, initialLoadBlocked, initialLoadDelayMs]);

  useEffect(() => {
    onFirstTrackChange?.(visibleTracks[0] ?? null, isLoading && visibleTracks.length === 0);
    onLoadedTracksChange?.(visibleTracks, total, isLoading);
  }, [isLoading, onFirstTrackChange, onLoadedTracksChange, total, visibleTracks]);

  useEffect(() => {
    if (!isSortOpen) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent): void => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
        setIsSortOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [isSortOpen]);

  const handleLoadMore = useCallback((): void => {
    if (!isLoadingRef.current && hasMore) {
      void loadTracks(page + 1, 'append');
    }
  }, [hasMore, loadTracks, page]);

  const handleTrackContextMenu = useCallback(
    (event: MouseEvent<HTMLElement>, track: LibraryTrack): void => {
      if (!onOpenTrackMenu) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      onOpenTrackMenu(track, { x: event.clientX, y: event.clientY });
    },
    [onOpenTrackMenu],
  );

  return (
    <section className="album-track-section" aria-label={t('albumDetail.tracks.aria')} hidden={hidden}>
      <div className="album-track-toolbar">
        <div className="album-track-summary" aria-label={t('albumDetail.tracks.summaryAria')}>
          <span>{summary?.totalLabel ?? (tracks.length === total ? t('albumDetail.count.tracks', { count: total }) : t('albumDetail.count.loadedTracks', { loaded: tracks.length, total }))}</span>
          <span>{summary?.duration ?? loadedDurationLabel}</span>
          <span>{summary?.signal ?? loadedSignalLabel}</span>
        </div>
        {showSortControl && tracks.length > 0 ? (
          <div className="sort-select album-track-sort" ref={sortMenuRef}>
            <button
              className="sort-button"
              type="button"
              aria-haspopup="listbox"
              aria-expanded={isSortOpen}
              aria-label={t('albumDetail.tracks.sort.aria')}
              onClick={() => setIsSortOpen((current) => !current)}
            >
              <ArrowUpDown className="sort-button-icon" size={15} aria-hidden="true" />
              <span className="sort-button-label">{t(albumTrackSortOptions.find((option) => option.value === sort)?.labelKey ?? 'albumDetail.tracks.sort.default')}</span>
              <ChevronDown className="sort-button-chevron" size={14} aria-hidden="true" />
            </button>
            {isSortOpen ? (
              <div className="sort-menu" role="listbox" aria-label={t('albumDetail.tracks.sort.aria')} data-state="open">
                {albumTrackSortOptions.map((option) => (
                  <button
                    key={option.value}
                    className="sort-option"
                    type="button"
                    role="option"
                    aria-selected={sort === option.value}
                    onClick={() => {
                      setStoredSort(option.value);
                      writeStoredAlbumTrackSort(option.value);
                      setIsSortOpen(false);
                    }}
                  >
                    <span>{t(option.labelKey)}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className={`album-track-list${multiDisc ? ' album-track-list--multi-disc' : ''}`} role="list">
        {tracks.length > 0 ? (
          <div className="album-track-header" aria-hidden="true">
            <span>#</span>
            <span>{t('albumDetail.tracks.column.title')}</span>
            <span>{t('albumDetail.tracks.column.signal')}</span>
            <span>{t('albumDetail.tracks.column.time')}</span>
          </div>
        ) : null}
        {trackSections.map((section) => (
          <Fragment key={`disc-${section.discNo ?? 'unknown'}-${section.tracks[0]?.track.id ?? 'empty'}`}>
            {shouldShowDiscHeaders ? (
              <div className="album-track-disc-heading">
                {section.discNo ? t('albumDetail.tracks.disc', { number: section.discNo }) : t('albumDetail.tracks.discUnknown')}
              </div>
            ) : null}
            {section.tracks.map(({ index, track }) => {
              const isPlaying = track.id === currentTrackId;
              const trackNumber = formatAlbumTrackNumber(track, index, multiDisc);
              const tags = technicalTags(track);

              return (
                <button
                  className="album-track-row"
                  data-playing={isPlaying}
                  key={track.id}
                  role="listitem"
                  type="button"
                  onClick={() => void onPlayTrack(track)}
                  onContextMenu={(event) => handleTrackContextMenu(event, track)}
                >
                  <span className="album-track-number">
                    <span>{trackNumber}</span>
                    <Play className="album-track-row-play" size={13} fill="currentColor" aria-hidden="true" />
                  </span>
                  <span className="album-track-copy">
                    <strong>{track.title}</strong>
                    <small>{track.artist}</small>
                  </span>
                  <span className="album-track-tags" aria-label={t('albumDetail.tracks.formatAria')}>
                    {tags.map((tag) => (
                      <em key={`${track.id}-${tag}`}>{tag}</em>
                    ))}
                  </span>
                  <span className="album-track-duration">{formatDuration(track.duration)}</span>
                  <span className="album-track-actions">
                    <span
                      className={`album-track-like ${likedTrackIds[track.id] ? 'is-liked' : ''}`}
                      role="button"
                      tabIndex={-1}
                      aria-label={likedTrackIds[track.id] ? t('albumDetail.tracks.action.unlike', { title: track.title }) : t('albumDetail.tracks.action.like', { title: track.title })}
                      aria-pressed={likedTrackIds[track.id] === true}
                      title={likedTrackIds[track.id] ? t('albumDetail.tracks.action.unlikeTitle') : t('albumDetail.tracks.action.likeTitle')}
                      onClick={(event) => {
                        event.stopPropagation();
                        void onToggleTrackLiked?.(track);
                      }}
                    >
                      <Heart size={14} fill={likedTrackIds[track.id] ? 'currentColor' : 'none'} />
                    </span>
                  </span>
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>

      {hasMore ? (
        <button className="album-load-more" type="button" disabled={isLoading} onClick={handleLoadMore}>
          {isLoading ? t('albumDetail.tracks.loading') : t('albumDetail.tracks.loadMore')}
        </button>
      ) : null}

      {error ? <p className="album-detail-error">{error}</p> : null}
      {!isLoading && tracks.length === 0 && !error ? <p className="album-detail-empty">{t('albumDetail.tracks.empty')}</p> : null}
    </section>
  );
};
