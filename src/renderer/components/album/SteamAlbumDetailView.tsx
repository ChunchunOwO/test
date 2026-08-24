import { Fragment, type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Disc3, ExternalLink, Heart, Info, Loader2, MoreHorizontal, Play, RefreshCw, Star } from 'lucide-react';
import type { AlbumExternalRating, AlbumInformationSummary, AlbumOnlineInfo, LibraryAlbum, LibraryPlaylist, LibraryTrack } from '../../../shared/types/library';
import { likedAlbumsChangedEvent, likedChangedEvent, likedTracksChangedEvent, useLikedTrackIds } from '../../hooks/useLikedMedia';
import { useI18n } from '../../i18n/I18nProvider';
import { useAlbumCoverEnterTransition } from '../../hooks/useAlbumCoverEnterTransition';
import { useAnimatedBackNavigation } from '../../hooks/useAnimatedBackNavigation';
import { usePlaybackQueue } from '../../stores/PlaybackQueueProvider';
import { collectAlbumGenreFacts, type AlbumGenreFact } from '../../utils/albumGenreFacts';
import { localCoverDisplayUrl } from '../../utils/coverDisplayUrl';
import { genreDisplayName, openGenreDetailByKey } from '../../utils/genreNavigation';
import { AlbumTrackList } from './AlbumTrackList';
import { albumTrackSortOptions, readStoredAlbumTrackSort, writeStoredAlbumTrackSort, type AlbumTrackSort } from './albumTrackSort';
import { TrackContextMenu } from '../library/TrackContextMenu';
import type { TrackMenuAction } from '../library/TrackContextMenu';
import '../../styles/album-detail.css';

type SteamAlbumDetailViewProps = {
  album: LibraryAlbum;
  onBack: () => void;
};

type AlbumDetailTab = 'tracks' | 'sources' | 'releases' | 'information';

type TrackMenuState = {
  track: LibraryTrack;
  position: { x: number; y: number };
};

type AlbumTitleDensity = 'regular' | 'long' | 'very-long';

const getAlbumTitleDensity = (title: string): AlbumTitleDensity => {
  const visualWidth = Array.from(title.trim()).reduce((width, character) => {
    if (/\s/u.test(character)) return width + 0.32;
    return width + (/^[\u0000-\u024f]$/u.test(character) ? 0.58 : 1);
  }, 0);

  if (visualWidth >= 48) return 'very-long';
  if (visualWidth >= 30) return 'long';
  return 'regular';
};

const steamAlbumTrackMenuActions = [
  'add-to-playlist',
  'play-next',
  'add-to-queue',
  'toggle-liked',
  'remove-from-queue',
  'show-in-folder',
  'copy-path',
  'copy-name-artist',
  'copy-cover',
  'save-cover',
] as const satisfies readonly TrackMenuAction[];

const albumDetailReturnDurationMs = 160;

const ratingProviderLabels: Record<AlbumExternalRating['provider'], string> = {
  rateYourMusic: 'Rate Your Music',
  musicbrainz: 'MusicBrainz',
  discogs: 'Discogs',
};

export const SteamAlbumDetailView = ({ album, onBack }: SteamAlbumDetailViewProps): JSX.Element => {
  const { locale, t } = useI18n();
  const copy = {
    back: t('albumDetail.action.back'),
    play: t('albumDetail.action.playNow'),
  };
  const { appendToQueue, currentTrackId, playTrack, playTrackNext, removeTrackFromQueue } = usePlaybackQueue();
  const [tracks, setTracks] = useState<LibraryTrack[]>([]);
  const [trackMenu, setTrackMenu] = useState<TrackMenuState | null>(null);
  const [activeTab, setActiveTab] = useState<AlbumDetailTab>('tracks');
  const [onlineInfo, setOnlineInfo] = useState<AlbumOnlineInfo | null>(null);
  const [isOnlineInfoLoading, setIsOnlineInfoLoading] = useState(false);
  const [onlineInfoError, setOnlineInfoError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [failedCoverUrls, setFailedCoverUrls] = useState<string[]>([]);
  const [isAlbumLiked, setIsAlbumLiked] = useState(false);
  const [trackSort, setTrackSort] = useState<AlbumTrackSort>(() => readStoredAlbumTrackSort());
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const detailRootRef = useRef<HTMLDivElement | null>(null);
  const coverRef = useRef<HTMLDivElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const { isReturning, returnBack } = useAnimatedBackNavigation(onBack, true, {
    rootRef: detailRootRef,
    durationMs: albumDetailReturnDurationMs,
  });
  const { isCoverEntering, skipPageEnter } = useAlbumCoverEnterTransition(album.id, coverRef);
  const source = useMemo(() => ({ type: 'album' as const, label: album.title, albumId: album.id }), [album.id, album.title]);
  const coverCandidates = useMemo(
    () => Array.from(new Set([localCoverDisplayUrl(album.coverId), album.coverThumb].filter((url): url is string => Boolean(url)))),
    [album.coverId, album.coverThumb],
  );
  const coverUrl = coverCandidates.find((url) => !failedCoverUrls.includes(url)) ?? null;
  const likedTrackIds = useLikedTrackIds(tracks.map((track) => track.id));
  const discCount = useMemo(() => {
    const discs = new Set(tracks.map((track) => track.discNo).filter((discNo): discNo is number => Boolean(discNo && discNo > 0)));
    return discs.size;
  }, [tracks]);
  const albumGenres = useMemo(() => collectAlbumGenreFacts(tracks), [tracks]);
  const albumMeta = [
    album.year ? String(album.year) : null,
    discCount > 1 ? t('albumDetail.texture.discs', { count: discCount }) : null,
    album.trackCount > 0 ? t('albumDetail.count.tracks', { count: album.trackCount }) : null,
  ].filter((item): item is string => Boolean(item));
  const overviewRatings = onlineInfo?.externalRatings ?? [];
  const titleDensity = getAlbumTitleDensity(album.title);

  const loadOnlineInfo = useCallback(async (force = false): Promise<void> => {
    const library = window.echo?.library;
    if (!library?.getAlbumOnlineInfo) {
      setOnlineInfoError(t('albumDetail.online.unavailable'));
      setIsOnlineInfoLoading(false);
      return;
    }
    setIsOnlineInfoLoading(true);
    setOnlineInfoError(null);
    try {
      setOnlineInfo(await library.getAlbumOnlineInfo(album.id, { force, provider: 'all' }));
    } catch (loadError) {
      setOnlineInfoError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setIsOnlineInfoLoading(false);
    }
  }, [album.id, t]);

  useEffect(() => {
    setActiveTab('tracks');
    setOnlineInfo(null);
    setIsOnlineInfoLoading(false);
    setOnlineInfoError(null);
    void loadOnlineInfo(false);
  }, [album.id, loadOnlineInfo]);

  useEffect(() => {
    setIsMoreOpen(false);
  }, [album.id]);

  const selectTab = useCallback((tab: AlbumDetailTab): void => {
    setActiveTab(tab);
  }, []);

  useEffect(() => {
    if (!isMoreOpen) return undefined;

    const handlePointerDown = (event: PointerEvent): void => {
      if (!moreMenuRef.current?.contains(event.target as Node)) {
        setIsMoreOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setIsMoreOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMoreOpen]);

  const handleTrackSortChange = useCallback((nextSort: AlbumTrackSort): void => {
    setTrackSort(nextSort);
    writeStoredAlbumTrackSort(nextSort);
    setActiveTab('tracks');
    setIsMoreOpen(false);
  }, []);

  useEffect(() => {
    setFailedCoverUrls([]);
  }, [album.id, album.coverId, album.coverThumb]);

  const refreshAlbumLiked = useCallback(async (): Promise<void> => {
    try {
      const result = await window.echo?.library?.getLikedAlbumIds?.([album.id]);
      setIsAlbumLiked(result?.[album.id] === true);
    } catch {
      setIsAlbumLiked(false);
    }
  }, [album.id]);

  useEffect(() => {
    void refreshAlbumLiked();
    window.addEventListener(likedAlbumsChangedEvent, refreshAlbumLiked);
    return () => window.removeEventListener(likedAlbumsChangedEvent, refreshAlbumLiked);
  }, [refreshAlbumLiked]);

  const handlePlay = useCallback(async (track: LibraryTrack): Promise<void> => {
    try {
      setError(null);
      await playTrack(track, { replaceQueueWith: tracks.length > 0 ? tracks : [track], source });
    } catch (playError) {
      setError(playError instanceof Error ? playError.message : String(playError));
    }
  }, [playTrack, source, tracks]);

  const handlePlayAlbum = useCallback((): void => {
    const first = tracks[0];
    if (first) {
      void handlePlay(first);
    }
  }, [handlePlay, tracks]);

  const handleToggleAlbumLiked = useCallback(async (): Promise<void> => {
    const library = window.echo?.library;
    if (!library?.toggleAlbumLiked) {
      setError(t('error.bridge.likeAlbums'));
      return;
    }

    const previous = isAlbumLiked;
    setIsAlbumLiked(!previous);
    try {
      const result = await library.toggleAlbumLiked(album.id);
      setIsAlbumLiked(result.liked);
      window.dispatchEvent(new Event(likedAlbumsChangedEvent));
      window.dispatchEvent(new Event(likedChangedEvent));
    } catch (likeError) {
      setIsAlbumLiked(previous);
      setError(likeError instanceof Error ? likeError.message : String(likeError));
    }
  }, [album.id, isAlbumLiked, t]);

  const handleTrackMenuAction = useCallback(async (action: TrackMenuAction, track: LibraryTrack, playlist?: LibraryPlaylist): Promise<void> => {
    const library = window.echo?.library;
    setTrackMenu(null);
    setError(null);

    try {
      switch (action) {
        case 'play-next':
          playTrackNext(track, source);
          return;
        case 'add-to-queue':
          appendToQueue(track, source);
          return;
        case 'remove-from-queue':
          removeTrackFromQueue(track.id);
          return;
        case 'toggle-liked':
          if (!library?.toggleTrackLiked) throw new Error(t('albumDetail.tracks.error.desktopBridgeActions'));
          await library.toggleTrackLiked(track.id);
          window.dispatchEvent(new Event(likedTracksChangedEvent));
          window.dispatchEvent(new Event(likedChangedEvent));
          return;
        case 'add-to-playlist':
          if (!library?.addTrackToPlaylist || !playlist) return;
          await library.addTrackToPlaylist(playlist.id, track.id);
          window.dispatchEvent(new Event('library:playlists-changed'));
          return;
        case 'show-in-folder':
          if (!library?.openTrackInFolder) throw new Error(t('albumDetail.tracks.error.desktopBridgeActions'));
          await library.openTrackInFolder(track.id);
          return;
        case 'copy-path':
          if (!library?.copyTrackPath) throw new Error(t('albumDetail.tracks.error.desktopBridgeActions'));
          await library.copyTrackPath(track.id);
          return;
        case 'copy-name-artist':
          if (!library?.copyTrackNameArtist) throw new Error(t('albumDetail.tracks.error.desktopBridgeActions'));
          await library.copyTrackNameArtist(track.id);
          return;
        case 'copy-cover':
          if (!library?.copyTrackCover || !(await library.copyTrackCover(track.id))) {
            throw new Error(t('albumDetail.tracks.error.noCoverToCopy'));
          }
          return;
        case 'save-cover':
          if (!library?.saveTrackCover || !(await library.saveTrackCover(track.id))) {
            throw new Error(t('albumDetail.tracks.error.noCoverSaved'));
          }
          return;
        default:
          return;
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    }
  }, [appendToQueue, playTrackNext, removeTrackFromQueue, source, t]);

  const handleExternalLinkClick = useCallback((event: MouseEvent<HTMLAnchorElement>, url: string): void => {
    const openExternalUrl = window.echo?.app?.openExternalUrl;
    if (!openExternalUrl) return;
    event.preventDefault();
    void openExternalUrl(url);
  }, []);

  const handleOpenGenre = useCallback(async (genreKey: string): Promise<void> => {
    try {
      setError(null);
      await openGenreDetailByKey(genreKey, {
        returnTo: 'albums',
        sourceProvider: album.mediaType === 'remote' ? 'remote' : 'local',
        ...(album.sourceId ? { sourceId: album.sourceId } : {}),
      });
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : String(openError));
    }
  }, [album.mediaType, album.sourceId]);

  const renderGenreLink = (genre: AlbumGenreFact): JSX.Element => {
    const displayName = genreDisplayName(genre, t);
    return (
      <button
        type="button"
        className="album-detail-genre-link"
        aria-label={`${t('albumDetail.fact.genre')}: ${displayName}`}
        onClick={() => void handleOpenGenre(genre.genreKey)}
      >
        {displayName}
      </button>
    );
  };

  const onlineHeader = (
    <div className="album-online-header">
      <div>
        <span>{t('albumDetail.online.sources')}</span>
        <strong>{onlineInfo?.sources.map((item) => item.label).join(' / ') || t('albumDetail.online.reading')}</strong>
        {onlineInfo?.match ? <small>{t('albumDetail.online.match')} · {Math.round(onlineInfo.match.confidence * 100)}%</small> : null}
      </div>
      <button type="button" onClick={() => void loadOnlineInfo(true)} disabled={isOnlineInfoLoading}>
        {isOnlineInfoLoading ? <Loader2 className="spinning-icon" size={14} /> : <RefreshCw size={14} />}
        {t('albumDetail.action.refresh')}
      </button>
    </div>
  );

  const onlineState = (hasContent: boolean): JSX.Element | null => {
    if (hasContent) return null;
    return (
      <div className="album-online-state">
        {isOnlineInfoLoading ? <Loader2 className="spinning-icon" size={18} /> : <Info size={18} />}
        <strong>{isOnlineInfoLoading ? t('albumDetail.online.reading') : t('albumDetail.online.emptyTitle')}</strong>
        {onlineInfoError || onlineInfo?.errors[0] ? <span>{onlineInfoError ?? onlineInfo?.errors[0]}</span> : null}
        {!isOnlineInfoLoading ? <button type="button" onClick={() => void loadOnlineInfo(true)}><RefreshCw size={14} />{t('albumDetail.action.refresh')}</button> : null}
      </div>
    );
  };

  const renderInformationArticle = (information: AlbumInformationSummary, label: string): JSX.Element => (
    <section className="album-information-article" key={label}>
      <div className="album-information-main">
        <span>{label} · {information.language}.wikipedia.org</span>
        <h3>{information.title}</h3>
        {information.description ? <small>{information.description}</small> : null}
        <div className="album-information-body">
          {information.extract.split(/\n{2,}/u).map((paragraph) => paragraph.trim()).filter(Boolean).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </div>
        {information.externalLinks?.length ? <div className="album-information-links"><span>{t('albumDetail.information.externalLinks')}</span><div>{information.externalLinks.map((link) => <a href={link.url} key={link.url} rel="noreferrer" target="_blank" onClick={(event) => handleExternalLinkClick(event, link.url)}><ExternalLink size={13} />{link.label}</a>)}</div></div> : null}
      </div>
      <div className="album-information-aside">
        {information.thumbnailUrl ? <img alt="" src={information.thumbnailUrl} loading="lazy" decoding="async" /> : null}
        {information.url ? <a href={information.url} rel="noreferrer" target="_blank" onClick={(event) => handleExternalLinkClick(event, information.url!)}><ExternalLink size={14} />{t('albumDetail.action.openSource')}</a> : null}
      </div>
    </section>
  );

  return (
    <div ref={detailRootRef} className={`album-detail-page album-detail-page--local-only${isReturning ? ' is-returning' : ''}${isCoverEntering ? ' album-detail-page--cover-enter' : ''}${skipPageEnter ? ' album-detail-page--cover-entered' : ''}`}>
      <button className="album-back-button" type="button" onClick={returnBack} aria-label={copy.back}>
        <ArrowLeft size={18} />
        <span>{copy.back}</span>
      </button>

      <section className="album-detail-hero album-detail-switch-surface" aria-label={t('albumDetail.aria.details', { album: album.title })}>
        <div className="album-detail-cover" data-empty={!coverUrl} ref={coverRef}>
          {coverUrl ? (
            <img
              src={coverUrl}
              alt=""
              decoding="async"
              draggable={false}
              height={320}
              width={320}
              onError={() => setFailedCoverUrls((current) => current.includes(coverUrl) ? current : [...current, coverUrl])}
            />
          ) : <Disc3 size={58} aria-hidden="true" />}
        </div>

        <div className="album-detail-console">
          <div className="album-detail-copy">
            <span className="album-detail-kicker">{album.mediaType === 'remote' ? album.sourceDisplayName ?? t('albumDetail.fact.library') : t('albumDetail.fact.library')}</span>
            <h1 className={`album-detail-title album-detail-title--${titleDensity}`}>{album.title}</h1>
            {album.albumArtist ? <p className="album-detail-artist-link">{album.albumArtist}</p> : null}
            <div className="album-detail-meta" aria-label={album.title}>
              {albumMeta.map((item) => <span key={item}>{item}</span>)}
              {albumGenres.map((genre) => <span key={genre.genreKey}>{renderGenreLink(genre)}</span>)}
            </div>
          </div>

          <div className="album-detail-actions">
            <button className="album-primary-action" type="button" onClick={handlePlayAlbum} disabled={isLoading || tracks.length === 0}>
              <Play size={16} fill="currentColor" />
              {copy.play}
            </button>
            <button
              className={`album-icon-action ${isAlbumLiked ? 'is-liked' : ''}`}
              type="button"
              aria-label={isAlbumLiked ? t('albumDetail.action.unlikeAlbum') : t('albumDetail.action.likeAlbum')}
              aria-pressed={isAlbumLiked}
              title={isAlbumLiked ? t('albumDetail.action.unlikeAlbum') : t('albumDetail.action.likeAlbum')}
              onClick={() => void handleToggleAlbumLiked()}
            >
              <Heart size={16} fill={isAlbumLiked ? 'currentColor' : 'none'} />
            </button>
            <div className="sort-select album-detail-more" ref={moreMenuRef}>
              <button
                className="album-icon-action"
                type="button"
                aria-label={t('albumDetail.action.more')}
                aria-haspopup="listbox"
                aria-expanded={isMoreOpen}
                title={t('albumDetail.action.more')}
                onClick={() => setIsMoreOpen((current) => !current)}
              >
                <MoreHorizontal size={17} />
              </button>
              {isMoreOpen ? (
                <div className="sort-menu album-detail-more-menu" role="listbox" aria-label={t('albumDetail.tracks.sort.aria')} data-state="open">
                  {albumTrackSortOptions.map((option) => (
                    <button
                      key={option.value}
                      className="sort-option"
                      type="button"
                      role="option"
                      aria-selected={trackSort === option.value}
                      onClick={() => handleTrackSortChange(option.value)}
                    >
                      <span>{t(option.labelKey)}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          {error ? <p className="album-detail-error">{error}</p> : null}
        </div>

        <aside className="album-detail-facts" aria-label={album.title}>
          <div className="album-fact">
            <span>{t('albumDetail.tab.sources')}</span>
            <strong>{album.mediaType === 'remote' ? album.sourceDisplayName ?? t('albumDetail.fact.library') : t('albumDetail.fact.library')}</strong>
          </div>
          <div className="album-fact">
            <span>{t('albumDetail.tab.tracks')}</span>
            <strong>{album.trackCount}</strong>
          </div>
          {overviewRatings.map((rating) => (
            <div className="album-fact" key={rating.provider}>
              <span>{t('albumDetail.fact.rating')} · {ratingProviderLabels[rating.provider]}</span>
              <strong>
                {rating.score.toLocaleString(locale, { maximumFractionDigits: 2 })}
                {' / '}
                {rating.maxScore.toLocaleString(locale, { maximumFractionDigits: 2 })}
              </strong>
            </div>
          ))}
          {albumGenres.length > 0 ? (
            <div className="album-fact">
              <span>{t('albumDetail.fact.genre')}</span>
              <strong>
                {albumGenres.map((genre, index) => (
                  <Fragment key={genre.genreKey}>
                    {index > 0 ? ' · ' : null}
                    {renderGenreLink(genre)}
                  </Fragment>
                ))}
              </strong>
            </div>
          ) : null}
        </aside>
      </section>

      <section className="album-detail-track-console">
        <header className="album-detail-tabs" aria-label={album.title}>
          <button className="album-detail-tab" type="button" aria-current={activeTab === 'tracks' ? 'page' : undefined} onClick={() => selectTab('tracks')}>{t('albumDetail.tab.tracks')}</button>
          <button className="album-detail-tab" type="button" aria-current={activeTab === 'sources' ? 'page' : undefined} onClick={() => selectTab('sources')}>{t('albumDetail.tab.sources')}</button>
          <button className="album-detail-tab" type="button" aria-current={activeTab === 'releases' ? 'page' : undefined} onClick={() => selectTab('releases')}>{t('albumDetail.tab.releases')}</button>
          <button className="album-detail-tab" type="button" aria-current={activeTab === 'information' ? 'page' : undefined} onClick={() => selectTab('information')}>{t('albumDetail.tab.information')}</button>
        </header>

        <div className="album-track-section" hidden={activeTab !== 'tracks'}>
          <AlbumTrackList
            albumId={album.id}
            currentTrackId={currentTrackId}
            trackSort={trackSort}
            showSortControl={false}
            onLoadedTracksChange={(nextTracks, _total, loading) => {
              setTracks(nextTracks);
              setIsLoading(loading);
            }}
            onOpenTrackMenu={(track, position) => setTrackMenu({ track, position })}
            onPlayTrack={handlePlay}
            onToggleTrackLiked={(track) => void handleTrackMenuAction('toggle-liked', track)}
          />
        </div>

        {activeTab === 'sources' ? (
          <div className="album-online-panel album-sources-panel">
            {onlineHeader}
            {onlineInfo?.externalRatings.length ? <section className="album-external-rating-grid">{onlineInfo.externalRatings.map((rating) => {
              const content = <><Star size={16} /><span>{rating.provider}</span><strong>{rating.score.toLocaleString(locale, { maximumFractionDigits: 2 })}/{rating.maxScore}</strong>{rating.ratingCount !== null ? <small>{rating.ratingCount.toLocaleString(locale)} ratings</small> : null}</>;
              return rating.url ? <a className="album-external-rating-card" href={rating.url} key={rating.provider} rel="noreferrer" target="_blank" onClick={(event) => handleExternalLinkClick(event, rating.url!)}>{content}</a> : <article className="album-external-rating-card" key={rating.provider}>{content}</article>;
            })}</section> : null}
            {onlineInfo?.releaseDetails ? <section className="album-release-detail-card"><div><span>{t('albumDetail.sources.releaseDetails')}</span><h3>{onlineInfo.releaseDetails.title}</h3><p>{[onlineInfo.releaseDetails.date, onlineInfo.releaseDetails.country, onlineInfo.releaseDetails.status, onlineInfo.releaseDetails.mediaFormats.join(' / ')].filter(Boolean).join(' · ')}</p></div><div className="album-release-facts">{onlineInfo.releaseDetails.barcode ? <span><small>{t('albumDetail.sources.barcode')}</small><strong>{onlineInfo.releaseDetails.barcode}</strong></span> : null}{onlineInfo.releaseDetails.labels.length ? <span><small>{t('albumDetail.sources.labels')}</small><strong>{onlineInfo.releaseDetails.labels.map((label) => [label.name, label.catalogNumber].filter(Boolean).join(' / ')).join(', ')}</strong></span> : null}{onlineInfo.releaseDetails.copyrights.length ? <span><small>{t('albumDetail.sources.copyright')}</small><strong>{onlineInfo.releaseDetails.copyrights.join(', ')}</strong></span> : null}</div></section> : null}
            {onlineInfo?.credits.map((group) => <section className="album-credit-group" key={group.role}><header><div><span>{t('albumDetail.credits.heading')}</span><h3>{group.role}</h3></div><small>{group.people.length}</small></header><div className="album-credit-people">{group.people.map((person, index) => <article className="album-credit-chip" key={`${person.name}-${index}`}><strong>{person.name}</strong>{person.detail ? <small>{person.detail}</small> : null}{person.trackTitle ? <em>{person.trackTitle}</em> : null}</article>)}</div></section>)}
            {onlineInfo?.sourceLinks.length ? <section className="album-source-link-grid">{onlineInfo.sourceLinks.map((link) => <a href={link.url} key={link.url} rel="noreferrer" target="_blank" onClick={(event) => handleExternalLinkClick(event, link.url)}><ExternalLink size={15} /><span>{link.provider}</span><strong>{link.label}</strong><small>{link.kind}</small></a>)}</section> : null}
            {onlineState(Boolean(onlineInfo && (onlineInfo.sourceLinks.length || onlineInfo.releaseDetails || onlineInfo.credits.length || onlineInfo.externalRatings.length)))}
          </div>
        ) : null}

        {activeTab === 'releases' ? (
          <div className="album-online-panel album-releases-panel">
            {onlineHeader}
            {onlineInfo?.releaseVersions.length ? <><section className="album-information-overview"><Disc3 size={18} /><div><span>{t('albumDetail.releases.heading')}</span><strong>{onlineInfo.releaseVersions.length}</strong><small>{t('albumDetail.releases.currentHint')}</small></div></section><div className="album-release-version-list">{onlineInfo.releaseVersions.map((version) => <article className="album-release-version-card" data-current={version.isMatched} key={version.providerItemId}><div><span>{version.isMatched ? t('albumDetail.releases.current') : 'MusicBrainz'}</span><h3>{version.title}</h3><p>{[version.artist, version.date ?? version.year, version.country, version.mediaFormats.join(' / ')].filter(Boolean).join(' · ')}</p></div><div className="album-release-version-meta">{version.labels.length ? <span><small>{t('albumDetail.sources.labels')}</small><strong>{version.labels.join(', ')}</strong></span> : null}{version.catalogNumbers.length ? <span><small>{t('albumDetail.sources.catalogNumber')}</small><strong>{version.catalogNumbers.join(', ')}</strong></span> : null}{version.trackCount ? <span><small>{t('albumDetail.tab.tracks')}</small><strong>{version.trackCount}</strong></span> : null}</div><a href={version.url} rel="noreferrer" target="_blank" onClick={(event) => handleExternalLinkClick(event, version.url)}><ExternalLink size={14} />{t('albumDetail.action.openSource')}</a></article>)}</div></> : onlineState(false)}
          </div>
        ) : null}

        {activeTab === 'information' ? (
          <div className="album-online-panel album-information-panel">
            {onlineHeader}
            <section className="album-information-overview"><Info size={18} /><div><span>{t('albumDetail.information.atGlance')}</span><strong>{album.albumArtist}</strong><small>{[album.title, album.year, t('albumDetail.count.tracks', { count: album.trackCount })].filter(Boolean).join(' · ')}</small></div></section>
            {onlineInfo?.information || onlineInfo?.artistInformation ? <div className="album-information-articles">{onlineInfo.information ? renderInformationArticle(onlineInfo.information, t('albumDetail.information.albumProfile')) : null}{onlineInfo.artistInformation ? renderInformationArticle(onlineInfo.artistInformation, t('albumDetail.information.artistProfile')) : null}</div> : onlineState(false)}
          </div>
        ) : null}
      </section>

      {trackMenu ? (
        <TrackContextMenu
          track={trackMenu.track}
          position={trackMenu.position}
          enabledActions={steamAlbumTrackMenuActions}
          liked={likedTrackIds[trackMenu.track.id] === true}
          onAction={(action, track, playlist) => void handleTrackMenuAction(action, track, playlist)}
          onClose={() => setTrackMenu(null)}
        />
      ) : null}
    </div>
  );
};
