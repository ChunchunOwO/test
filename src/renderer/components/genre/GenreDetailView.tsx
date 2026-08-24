import { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Disc3, ListPlus, Play, Shuffle } from 'lucide-react';
import type { LibraryAlbum, LibraryGenre, LibraryTrack } from '../../../shared/types/library';
import { useI18n } from '../../i18n/I18nProvider';
import { useAnimatedBackNavigation } from '../../hooks/useAnimatedBackNavigation';
import { useLowSpecModeEnabled } from '../../performance/useLowSpecModeEnabled';
import { usePlaybackQueue } from '../../stores/PlaybackQueueProvider';
import { localCoverDisplayUrl } from '../../utils/coverDisplayUrl';
import { genreDisplayName } from '../../utils/genreNavigation';
import { sameCoverUrls } from '../../utils/genreMosaicCovers';
import { SteamAlbumDetailView } from '../album/SteamAlbumDetailView';
import { InfiniteScrollSentinel } from '../ui/InfiniteScrollSentinel';
import { GenreAlbumGrid } from './GenreAlbumGrid';
import '../../styles/album-detail.css';
import '../../styles/genres.css';

type GenreDetailViewProps = {
  genre: LibraryGenre;
  onBack: () => void;
};

type GenreDetailTab = 'albums' | 'tracks';

type GenreTrackRowProps = {
  index: number;
  isPlaying: boolean;
  track: LibraryTrack;
  unknownAlbumLabel: string;
  onPlay: (track: LibraryTrack) => void;
};

type GenreHeroCoverProps = {
  tiles: string[];
  onImageError: (url: string) => void;
};

const initialVisibleTrackCount = 80;
const visibleTrackStep = 80;

const formatTrackDuration = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--:--';
  const wholeSeconds = Math.round(seconds);
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, '0')}`;
};

const genreTracksCacheKey = (genre: LibraryGenre): string =>
  `${genre.mediaType ?? 'local'}:${genre.sourceId ?? ''}:${genre.genreKey}`;

const mosaicLayoutCount = (tileCount: number): 1 | 2 | 4 => {
  if (tileCount <= 1) {
    return 1;
  }
  return tileCount === 2 ? 2 : 4;
};

const GenreHeroCover = ({ tiles, onImageError }: GenreHeroCoverProps): JSX.Element => {
  if (tiles.length === 0) {
    return <Disc3 size={58} aria-hidden="true" />;
  }

  if (tiles.length === 1) {
    return (
      <img
        src={tiles[0]}
        alt=""
        decoding="async"
        draggable={false}
        height={320}
        width={320}
        onError={() => onImageError(tiles[0])}
      />
    );
  }

  return (
    <>
      {tiles.map((url) => (
        <img
          key={url}
          src={url}
          alt=""
          decoding="async"
          draggable={false}
          onError={() => onImageError(url)}
        />
      ))}
      {tiles.length === 3 ? <span className="genre-detail-mosaic-empty" aria-hidden="true" /> : null}
    </>
  );
};

const GenreTrackRow = memo(({ index, isPlaying, track, unknownAlbumLabel, onPlay }: GenreTrackRowProps): JSX.Element => (
  <button
    className="album-track-row"
    data-playing={isPlaying}
    type="button"
    role="listitem"
    onClick={() => onPlay(track)}
  >
    <span className="album-track-number">
      <span>{index + 1}</span>
      <Play className="album-track-row-play" size={13} fill="currentColor" aria-hidden="true" />
    </span>
    <span className="album-track-copy">
      <strong>{track.title}</strong>
      <small>{track.artist}</small>
    </span>
    <span className="album-track-tags">
      <em>{track.album || unknownAlbumLabel}</em>
    </span>
    <span className="album-track-duration">{formatTrackDuration(track.duration)}</span>
    <span className="album-track-actions" />
  </button>
));

GenreTrackRow.displayName = 'GenreTrackRow';

export const GenreDetailView = ({ genre, onBack }: GenreDetailViewProps): JSX.Element => {
  const { t } = useI18n();
  const displayName = genreDisplayName(genre, t);
  const lowSpecModeEnabled = useLowSpecModeEnabled();
  const { appendTracksToQueue, currentTrackId, playTrack } = usePlaybackQueue();
  const [tracks, setTracks] = useState<LibraryTrack[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<LibraryAlbum | null>(null);
  const [activeTab, setActiveTab] = useState<GenreDetailTab>('albums');
  const [isLoading, setIsLoading] = useState(false);
  const [tracksLoadedKey, setTracksLoadedKey] = useState<string | null>(null);
  const [visibleTrackCount, setVisibleTrackCount] = useState(initialVisibleTrackCount);
  const [error, setError] = useState<string | null>(null);
  const [failedHeroImageUrls, setFailedHeroImageUrls] = useState<Set<string>>(() => new Set());
  const [mosaicCoverUrls, setMosaicCoverUrls] = useState<string[]>([]);
  const detailRootRef = useRef<HTMLDivElement | null>(null);
  const tracksRef = useRef<LibraryTrack[]>([]);
  const tracksLoadedKeyRef = useRef<string | null>(null);
  const loadGenerationRef = useRef(0);
  const inFlightRef = useRef<{ key: string; promise: Promise<LibraryTrack[]> } | null>(null);
  const { isReturning, returnBack } = useAnimatedBackNavigation(onBack, !selectedAlbum, { rootRef: detailRootRef });
  const tracksKey = genreTracksCacheKey(genre);
  const tracksReady = tracksLoadedKey === tracksKey;
  const source = useMemo(
    () => ({ type: 'manual' as const, label: displayName }),
    [displayName],
  );
  const fallbackHeroImage = useMemo(() => {
    const cover = genre.mediaType === 'remote'
      ? genre.coverThumb
      : localCoverDisplayUrl(genre.coverId) ?? genre.coverThumb;
    return cover && !failedHeroImageUrls.has(cover) ? cover : null;
  }, [failedHeroImageUrls, genre.coverId, genre.coverThumb, genre.mediaType]);
  const heroTiles = useMemo(() => {
    const fromAlbums = mosaicCoverUrls.filter((url) => !failedHeroImageUrls.has(url));
    const tiles = fromAlbums.length > 0
      ? fromAlbums
      : fallbackHeroImage ? [fallbackHeroImage] : [];
    return lowSpecModeEnabled ? tiles.slice(0, 1) : tiles;
  }, [failedHeroImageUrls, fallbackHeroImage, lowSpecModeEnabled, mosaicCoverUrls]);
  const unknownAlbumLabel = t('genreDetail.tracks.unknownAlbum');
  const canRequestPlayback = tracks.length > 0 || (!tracksReady && genre.trackCount > 0);
  const playbackBusy = isLoading && !tracksReady;
  const playbackDisabled = playbackBusy || !canRequestPlayback;
  const sourceLabel = genre.mediaType === 'remote'
    ? genre.sourceDisplayName ?? t('library.source.remote')
    : t('albumDetail.fact.library');
  const trackCount = Math.max(genre.trackCount, tracks.length);
  const visibleTracks = tracks.slice(0, visibleTrackCount);

  tracksRef.current = tracks;

  const loadTracks = useCallback((): Promise<LibraryTrack[]> => {
    if (inFlightRef.current?.key === tracksKey) {
      return inFlightRef.current.promise;
    }

    if (tracksLoadedKeyRef.current === tracksKey) {
      return Promise.resolve(tracksRef.current);
    }

    const generation = loadGenerationRef.current + 1;
    loadGenerationRef.current = generation;
    setIsLoading(true);
    setError(null);

    const promise = (async (): Promise<LibraryTrack[]> => {
      const library = window.echo?.library;
      if (!library?.getGenreTracks) {
        if (generation === loadGenerationRef.current) {
          tracksLoadedKeyRef.current = tracksKey;
          setTracks([]);
          setTracksLoadedKey(tracksKey);
          setIsLoading(false);
          setError(t('genreDetail.error.desktopBridgeRead'));
        }
        return [];
      }

      try {
        const result = await library.getGenreTracks(genre.genreKey, {
          page: 1,
          pageSize: genre.mediaType === 'remote' ? 96 : 500,
          sort: 'default',
          sourceProvider: genre.mediaType === 'remote' ? 'remote' : 'local',
          ...(genre.sourceId ? { sourceId: genre.sourceId } : {}),
        });
        if (generation !== loadGenerationRef.current) {
          return tracksRef.current;
        }
        tracksLoadedKeyRef.current = tracksKey;
        setTracks(result.items);
        setTracksLoadedKey(tracksKey);
        return result.items;
      } catch (loadError) {
        if (generation === loadGenerationRef.current) {
          tracksLoadedKeyRef.current = tracksKey;
          setTracks([]);
          setTracksLoadedKey(tracksKey);
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
        return [];
      } finally {
        if (generation === loadGenerationRef.current) {
          setIsLoading(false);
          if (inFlightRef.current?.key === tracksKey) {
            inFlightRef.current = null;
          }
        }
      }
    })();

    inFlightRef.current = { key: tracksKey, promise };
    return promise;
  }, [genre.genreKey, genre.mediaType, genre.sourceId, t, tracksKey]);

  const seenTracksKeyRef = useRef(tracksKey);

  useEffect(() => {
    if (seenTracksKeyRef.current === tracksKey) {
      return;
    }

    seenTracksKeyRef.current = tracksKey;
    loadGenerationRef.current += 1;
    inFlightRef.current = null;
    tracksRef.current = [];
    tracksLoadedKeyRef.current = null;
    setTracks([]);
    setTracksLoadedKey(null);
    setVisibleTrackCount(initialVisibleTrackCount);
    setError(null);
    setIsLoading(false);
    setFailedHeroImageUrls(new Set());
    setMosaicCoverUrls([]);
    setSelectedAlbum(null);
    setActiveTab('albums');
  }, [genre.genreKey, genre.mediaType, genre.sourceId, tracksKey]);

  useEffect(() => {
    if (activeTab !== 'tracks') {
      return;
    }
    void loadTracks();
  }, [activeTab, loadTracks]);

  const handlePreviewCovers = useCallback((urls: string[]): void => {
    setMosaicCoverUrls((current) => (sameCoverUrls(current, urls) ? current : urls));
  }, []);

  const handleHeroImageError = useCallback((url: string): void => {
    setFailedHeroImageUrls((current) => {
      if (current.has(url)) {
        return current;
      }
      return new Set(current).add(url);
    });
  }, []);

  const handlePlay = useCallback(async (track: LibraryTrack, queueTracks = tracksRef.current): Promise<void> => {
    try {
      setError(null);
      await playTrack(track, { replaceQueueWith: queueTracks, source });
    } catch (playError) {
      setError(playError instanceof Error ? playError.message : String(playError));
    }
  }, [playTrack, source]);

  const playLoadedTrack = useCallback((track: LibraryTrack): void => {
    void handlePlay(track);
  }, [handlePlay]);

  const revealMoreTracks = useCallback((): void => {
    setVisibleTrackCount((current) => Math.min(tracksRef.current.length, current + visibleTrackStep));
  }, []);

  const playFromHero = useCallback(async (mode: 'first' | 'shuffle'): Promise<void> => {
    const loaded = await loadTracks();
    const track = mode === 'shuffle'
      ? loaded[Math.floor(Math.random() * loaded.length)]
      : loaded[0];
    if (track) {
      await handlePlay(track, loaded);
    }
  }, [handlePlay, loadTracks]);

  const queueFromHero = useCallback(async (): Promise<void> => {
    const loaded = await loadTracks();
    if (loaded.length > 0) {
      appendTracksToQueue(loaded, source);
    }
  }, [appendTracksToQueue, loadTracks, source]);

  if (selectedAlbum) {
    return <SteamAlbumDetailView album={selectedAlbum} onBack={() => setSelectedAlbum(null)} />;
  }

  return (
    <div
      ref={detailRootRef}
      className={`album-detail-page genre-detail-page${isReturning ? ' is-returning' : ''}`}
      data-unclassified={genre.unclassified ? 'true' : undefined}
    >
      <button className="album-back-button" type="button" onClick={returnBack} aria-label={t('genreDetail.action.back')}>
        <ArrowLeft size={18} />
        <span>{t('genreDetail.action.back')}</span>
      </button>

      <section className="album-detail-hero" aria-label={t('genreDetail.aria.details', { genre: displayName })}>
        <div
          className={`album-detail-cover${heroTiles.length > 1 ? ' genre-detail-mosaic' : ''}`}
          data-empty={heroTiles.length === 0 ? 'true' : undefined}
          data-tiles={heroTiles.length > 1 ? String(mosaicLayoutCount(heroTiles.length)) : undefined}
          role={heroTiles.length > 1 ? 'img' : undefined}
          aria-hidden={heroTiles.length <= 1 ? true : undefined}
          aria-label={heroTiles.length > 1 ? t('genreDetail.aria.mosaic', { genre: displayName }) : undefined}
        >
          <GenreHeroCover tiles={heroTiles} onImageError={handleHeroImageError} />
        </div>

        <div className="album-detail-console">
          <div className="album-detail-copy">
            <span className="album-detail-kicker">{t('genreDetail.label.genre')}</span>
            <h1>{displayName}</h1>
            <div className="album-detail-meta" aria-label={displayName}>
              <span>{t('genreDetail.meta.tracks', { count: trackCount })}</span>
              <span>{t('genreDetail.meta.albums', { count: genre.albumCount })}</span>
            </div>
          </div>

          <div className="album-detail-actions">
            <button className="album-primary-action" type="button" onClick={() => void playFromHero('first')} disabled={playbackDisabled}>
              <Play size={16} fill="currentColor" />
              {t('genreDetail.action.play')}
            </button>
            <button
              className="album-icon-action"
              type="button"
              onClick={() => void playFromHero('shuffle')}
              disabled={playbackDisabled}
              aria-label={t('genreDetail.action.shuffle')}
              title={t('genreDetail.action.shuffle')}
            >
              <Shuffle size={16} />
            </button>
            <button className="album-secondary-action" type="button" onClick={() => void queueFromHero()} disabled={playbackDisabled}>
              <ListPlus size={16} />
              {t('genreDetail.action.addToQueue')}
            </button>
          </div>
          {error ? <p className="album-detail-error">{error}</p> : null}
        </div>

        <aside className="album-detail-facts" aria-label={displayName}>
          <div className="album-fact">
            <span>{t('albumDetail.tab.sources')}</span>
            <strong>{sourceLabel}</strong>
          </div>
          <div className="album-fact">
            <span>{t('albumDetail.tab.tracks')}</span>
            <strong>{trackCount}</strong>
          </div>
          <div className="album-fact">
            <span>{t('genreDetail.tab.albums')}</span>
            <strong>{genre.albumCount}</strong>
          </div>
        </aside>
      </section>

      <section className="album-detail-track-console">
        <header className="album-detail-tabs" aria-label={displayName}>
          <button
            className="album-detail-tab"
            aria-current={activeTab === 'albums' ? 'page' : undefined}
            type="button"
            onClick={() => startTransition(() => setActiveTab('albums'))}
          >
            {t('genreDetail.tab.albums')}
          </button>
          <button
            className="album-detail-tab"
            aria-current={activeTab === 'tracks' ? 'page' : undefined}
            type="button"
            onClick={() => startTransition(() => setActiveTab('tracks'))}
          >
            {t('genreDetail.tab.tracks')}
          </button>
        </header>

        <div className="album-track-section genre-detail-albums" hidden={activeTab !== 'albums'}>
          <GenreAlbumGrid
            genreKey={genre.genreKey}
            genreName={displayName}
            albumCount={genre.albumCount}
            sourceProvider={genre.mediaType}
            sourceId={genre.sourceId}
            onAlbumSelect={setSelectedAlbum}
            onPreviewCovers={handlePreviewCovers}
          />
        </div>

        {activeTab === 'tracks' ? (
          <div className="album-track-section">
            {tracks.length > 0 ? (
              <div className="album-track-list" role="list">
                <div className="album-track-header" aria-hidden="true">
                  <span>#</span>
                  <span>{t('albumDetail.tracks.column.title')}</span>
                  <span>{t('genreDetail.tracks.column.album')}</span>
                  <span>{t('albumDetail.tracks.column.time')}</span>
                </div>
                {visibleTracks.map((track, index) => (
                  <GenreTrackRow
                    index={index}
                    isPlaying={track.id === currentTrackId}
                    key={track.id}
                    track={track}
                    unknownAlbumLabel={unknownAlbumLabel}
                    onPlay={playLoadedTrack}
                  />
                ))}
                <InfiniteScrollSentinel
                  canLoadMore={visibleTrackCount < tracks.length}
                  onLoadMore={revealMoreTracks}
                />
              </div>
            ) : (
              <p className="album-detail-empty">
                {!tracksReady || isLoading ? t('genreDetail.tracks.loading') : t('genreDetail.tracks.empty')}
              </p>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
};
