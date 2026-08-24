import { startTransition, type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Disc3, ExternalLink, ListPlus, Play, RefreshCw, Shuffle } from 'lucide-react';
import type { ArtistInsightNode, ArtistInsights, LibraryAlbum, LibraryArtist, LibraryTrack } from '../../../shared/types/library';
import { useI18n } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n/locales';
import { useAnimatedBackNavigation } from '../../hooks/useAnimatedBackNavigation';
import { usePlaybackQueue } from '../../stores/PlaybackQueueProvider';
import { requestArtistDetailNavigation } from '../../utils/artistNavigation';
import { localCoverDisplayUrl } from '../../utils/coverDisplayUrl';
import { SteamAlbumDetailView } from '../album/SteamAlbumDetailView';
import { ArtistAlbumGrid } from './ArtistAlbumGrid';
import {
  concertLocation,
  concertSecondaryInfo,
  concertSourceName,
  formatConcertDateParts,
  formatConcertTime,
} from './artistConcertPresentation';
import { artistMark } from './artistVisual';
import '../../styles/artist-detail.css';

type SteamArtistDetailViewProps = {
  artist: LibraryArtist;
  onBack: () => void;
};

type ArtistDetailTab = 'overview' | 'albums';

const overviewTrackInitialCount = 6;

const formatTrackDuration = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--:--';
  const wholeSeconds = Math.round(seconds);
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, '0')}`;
};

const formatLibraryDuration = (
  tracks: LibraryTrack[],
  t: (key: TranslationKey, options?: Record<string, string | number>) => string,
): string => {
  const seconds = tracks.reduce((total, track) => total + (Number.isFinite(track.duration) ? track.duration : 0), 0);
  const minutes = Math.round(seconds / 60);
  if (minutes <= 0) return t('artistDetail.duration.reading');
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0
    ? t('artistDetail.duration.hours', { hours, minutes: rest })
    : t('artistDetail.duration.minutes', { minutes });
};

const relatedArtistsFor = (insights: ArtistInsights | null, artistId: string): ArtistInsightNode[] => {
  if (!insights) return [];
  const relatedIds = new Set<string>();
  insights.edges.forEach((edge) => {
    if (edge.sourceArtistId === artistId) relatedIds.add(edge.targetArtistId);
    if (edge.targetArtistId === artistId) relatedIds.add(edge.sourceArtistId);
  });
  return insights.nodes.filter((node) => node.id !== artistId && relatedIds.has(node.id)).slice(0, 8);
};

export const SteamArtistDetailView = ({ artist, onBack }: SteamArtistDetailViewProps): JSX.Element => {
  const { locale, t } = useI18n();
  const copy = {
    artist: t('artistDetail.label.artist'),
    back: t('artistDetail.action.back'),
    bridgeUnavailable: t('artistDetail.error.desktopBridgeRead'),
    play: t('artistDetail.action.playArtist'),
    shuffle: t('artistDetail.action.shuffle'),
    queue: t('artistDetail.action.addToQueue'),
    tracks: t('artistDetail.fact.tracks'),
  };
  const { appendTracksToQueue, currentTrackId, playTrack } = usePlaybackQueue();
  const [tracks, setTracks] = useState<LibraryTrack[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<LibraryAlbum | null>(null);
  const [activeTab, setActiveTab] = useState<ArtistDetailTab>('overview');
  const [overviewTrackCount, setOverviewTrackCount] = useState(overviewTrackInitialCount);
  const [insights, setInsights] = useState<ArtistInsights | null>(null);
  const [isInsightsLoading, setIsInsightsLoading] = useState(true);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [onlineRefreshRequest, setOnlineRefreshRequest] = useState(0);
  const [concertRegion, setConcertRegion] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [failedHeroImageUrls, setFailedHeroImageUrls] = useState<Set<string>>(() => new Set());
  const detailRootRef = useRef<HTMLDivElement | null>(null);
  const { isReturning, returnBack } = useAnimatedBackNavigation(onBack, !selectedAlbum, { rootRef: detailRootRef });
  const source = useMemo(() => ({ type: 'artist' as const, label: artist.name, artistId: artist.id }), [artist.id, artist.name]);
  const heroImageCandidates = useMemo(() => {
    const representativeAlbumCover = artist.mediaType === 'remote'
      ? artist.coverThumb
      : localCoverDisplayUrl(artist.coverId) ?? artist.coverThumb;
    const firstLoadedAlbumCover = tracks.find((track) => track.coverThumb)?.coverThumb ?? null;
    return Array.from(new Set([
      artist.avatarUrl,
      artist.avatarThumbUrl,
      representativeAlbumCover,
      firstLoadedAlbumCover,
      insights?.onlineInfo.bio?.thumbnailUrl,
    ].filter((candidate): candidate is string => Boolean(candidate))));
  }, [artist.avatarThumbUrl, artist.avatarUrl, artist.coverId, artist.coverThumb, artist.mediaType, insights?.onlineInfo.bio?.thumbnailUrl, tracks]);
  const avatarUrl = heroImageCandidates.find((candidate) => !failedHeroImageUrls.has(candidate)) ?? null;

  useEffect(() => {
    setFailedHeroImageUrls(new Set());
  }, [artist.id]);

  useEffect(() => {
    let cancelled = false;
    void window.echo?.app?.getSettings?.()
      .then((settings) => {
        if (!cancelled) setConcertRegion(settings.onlineArtistInfoRegion?.trim() || null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setTracks([]);
    setError(null);
    setIsLoading(true);
    const library = window.echo?.library;
    if (!library?.getArtistTracks) {
      setIsLoading(false);
      setError(copy.bridgeUnavailable);
      return () => {
        cancelled = true;
      };
    }

    void library.getArtistTracks(artist.id, { page: 1, pageSize: artist.mediaType === 'remote' ? 96 : 500, sort: 'default' })
      .then((result) => {
        if (!cancelled) {
          setTracks(result.items);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [artist.id, artist.mediaType, copy.bridgeUnavailable]);

  useEffect(() => {
    let cancelled = false;
    const library = window.echo?.library;
    setInsights(null);
    setInsightsError(null);
    setIsInsightsLoading(true);
    setActiveTab('overview');
    setOverviewTrackCount(overviewTrackInitialCount);

    if (!library?.getArtistInsights) {
      setIsInsightsLoading(false);
      setInsightsError(copy.bridgeUnavailable);
      return () => {
        cancelled = true;
      };
    }

    void library.getArtistInsights(artist.id, { limit: 12, includeOnline: false })
      .then((localInsights) => {
        if (!cancelled) setInsights(localInsights);
        return library.getArtistInsights(artist.id, {
          limit: 12,
          includeOnline: true,
          forceOnline: onlineRefreshRequest > 0,
          region: concertRegion,
        });
      })
      .then((onlineInsights) => {
        if (!cancelled) setInsights(onlineInsights);
      })
      .catch((loadError) => {
        if (!cancelled) setInsightsError(loadError instanceof Error ? loadError.message : String(loadError));
      })
      .finally(() => {
        if (!cancelled) setIsInsightsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [artist.id, concertRegion, copy.bridgeUnavailable, onlineRefreshRequest]);

  const handlePlay = useCallback(async (track: LibraryTrack): Promise<void> => {
    try {
      setError(null);
      await playTrack(track, { replaceQueueWith: tracks, source });
    } catch (playError) {
      setError(playError instanceof Error ? playError.message : String(playError));
    }
  }, [playTrack, source, tracks]);

  const handleExternalLinkClick = useCallback((event: MouseEvent<HTMLAnchorElement>, url: string): void => {
    const openExternalUrl = window.echo?.app?.openExternalUrl;
    if (!openExternalUrl) return;
    event.preventDefault();
    void openExternalUrl(url);
  }, []);

  const handleOpenRelatedArtist = useCallback(async (node: ArtistInsightNode): Promise<void> => {
    const relatedArtist = await window.echo?.library?.getArtist?.(node.id);
    if (relatedArtist) requestArtistDetailNavigation(relatedArtist);
  }, []);

  const onlineInfo = insights?.onlineInfo ?? null;
  const bioParagraphs = (onlineInfo?.bio?.extract ?? t('artistDetail.overview.bioFallback'))
    .split(/\n{2,}|(?<=[。！？.!?])\s+/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .slice(0, 4);
  const relatedArtists = relatedArtistsFor(insights, artist.id);
  const overviewTracks = tracks.slice(0, overviewTrackCount);
  const concertInfo = insights?.concerts ?? null;
  const concertEvents = concertInfo?.events ?? [];
  const concertSourceLabel = concertInfo?.sources.length
    ? concertInfo.sources.map(concertSourceName).join(' / ')
    : null;
  const concertHeaderLabel = concertEvents.length > 0
    ? [t('artistDetail.events.count', { count: concertEvents.length }), concertSourceLabel].filter(Boolean).join(' / ')
    : concertInfo?.status === 'unavailable'
      ? t('artistDetail.events.unavailable')
      : concertSourceLabel;
  const concertEmptyMessage = isInsightsLoading
    ? t('artistDetail.status.loadingSignals')
    : concertInfo?.status === 'unavailable'
      ? t('artistDetail.events.unavailable')
      : concertInfo?.status === 'not_configured'
        ? t('artistDetail.events.configureProviders')
        : concertRegion
          ? t('artistDetail.events.noConcertsRegion', { region: concertRegion })
          : t('artistDetail.events.noConcerts');
  const externalLinks = onlineInfo?.externalLinks.slice(0, 8) ?? [];
  const sourceLabels = onlineInfo?.sourceLabels.slice(0, 6) ?? [];
  const overviewFacts = [
    { label: t('artistDetail.fact.tracks'), value: `${Math.max(artist.trackCount, tracks.length)}` },
    { label: t('artistDetail.fact.albums'), value: `${artist.albumCount}` },
    { label: t('artistDetail.fact.duration'), value: formatLibraryDuration(tracks, t) },
    { label: t('artistDetail.fact.sources'), value: onlineInfo?.sourceLabels.join(' / ') || t('artistDetail.status.localLibrary') },
  ];

  if (selectedAlbum) {
    return <SteamAlbumDetailView album={selectedAlbum} onBack={() => setSelectedAlbum(null)} />;
  }

  return (
    <div ref={detailRootRef} className={`artist-detail-page artist-detail-page--local-only${isReturning ? ' is-returning' : ''}`}>
      <button className="artist-detail-back" type="button" onClick={returnBack} aria-label={copy.back}>
        <ArrowLeft size={18} />
        <span>{copy.back}</span>
      </button>

      <section className="artist-hero" data-has-backdrop={Boolean(avatarUrl)} aria-label={t('artistDetail.aria.details', { artist: artist.name })}>
        {avatarUrl ? (
          <img
            className="artist-hero-backdrop"
            src={avatarUrl}
            alt=""
            decoding="async"
            draggable={false}
            onError={() => setFailedHeroImageUrls((current) => new Set(current).add(avatarUrl))}
          />
        ) : (
          <div className="artist-hero-art" aria-hidden="true">
            <span>{artistMark(artist.name)}</span>
          </div>
        )}
        <div className="artist-hero-copy">
          <span className="artist-detail-kicker">{copy.artist}</span>
          <h1>{artist.name}</h1>
          <div className="artist-hero-meta" aria-label={artist.name}>
            <span>{t('artistDetail.meta.tracks', { count: artist.trackCount })}</span>
            <span>{t('artistDetail.meta.albums', { count: artist.albumCount })}</span>
            <span>{t('artistDetail.meta.loadedTracks', { loaded: tracks.length, total: artist.trackCount })}</span>
          </div>
          <div className="artist-hero-actions">
            <button className="artist-primary-action" type="button" onClick={() => tracks[0] && void handlePlay(tracks[0])} disabled={isLoading || tracks.length === 0}>
              <Play size={16} fill="currentColor" />
              {copy.play}
            </button>
            <button className="artist-secondary-action" type="button" onClick={() => {
              const track = tracks[Math.floor(Math.random() * tracks.length)];
              if (track) void handlePlay(track);
            }} disabled={isLoading || tracks.length === 0}>
              <Shuffle size={16} />
              {copy.shuffle}
            </button>
            <button className="artist-secondary-action" type="button" onClick={() => appendTracksToQueue(tracks, source)} disabled={isLoading || tracks.length === 0}>
              <ListPlus size={16} />
              {copy.queue}
            </button>
            <button className="artist-secondary-action" type="button" onClick={() => setOnlineRefreshRequest((current) => current + 1)} disabled={isInsightsLoading}>
              <RefreshCw className={isInsightsLoading ? 'spinning-icon' : undefined} size={16} />
              {t('artistDetail.action.refreshInfo')}
            </button>
          </div>
          {sourceLabels.length > 0 || externalLinks.length > 0 ? (
            <div className="artist-hero-links" aria-label={t('artistDetail.aroundWeb.aria')}>
              {sourceLabels.map((label) => <span key={`source:${label}`}>{label}</span>)}
              {externalLinks.map((link) => (
                <a href={link.url} key={link.url} rel="noreferrer" target="_blank" onClick={(event) => handleExternalLinkClick(event, link.url)}>
                  <ExternalLink size={13} />{link.label}
                </a>
              ))}
            </div>
          ) : null}
          {error || insightsError ? <p className="artist-detail-error">{error ?? insightsError}</p> : null}
        </div>
      </section>

      <nav className="artist-detail-tabs" aria-label={artist.name}>
        <button aria-current={activeTab === 'overview' ? 'page' : undefined} type="button" onClick={() => startTransition(() => setActiveTab('overview'))}>
          {t('artistDetail.tab.overview')}
        </button>
        <button aria-current={activeTab === 'albums' ? 'page' : undefined} type="button" onClick={() => startTransition(() => setActiveTab('albums'))}>
          {t('artistDetail.tab.albums')}
        </button>
      </nav>

      {activeTab === 'overview' ? (
        <div className="artist-tab-panel artist-overview-panel">
          <section className="artist-overview-grid" aria-label={t('artistDetail.aria.overview')}>
            <article className="artist-overview-copy">
              <span>{t('artistDetail.label.overview')}</span>
              <h2>{t('artistDetail.overview.about', { artist: artist.name })}</h2>
              {bioParagraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </article>
            <aside className="artist-overview-sidebar">
              <div className="artist-sidebar-facts">
                {overviewFacts.map((fact) => <div key={fact.label}><span>{fact.label}</span><strong>{fact.value}</strong></div>)}
              </div>
            </aside>
          </section>

          {relatedArtists.length > 0 ? (
            <section className="artist-section artist-related-artists" aria-label={t('artistDetail.aria.relationshipMap')}>
              <header><div><span>{t('artistDetail.section.localNetwork')}</span><h2>{t('artistDetail.section.relationshipMap')}</h2></div><small>{t('artistDetail.status.linkedArtists', { count: relatedArtists.length })}</small></header>
              <div className="artist-related-strip">
                {relatedArtists.map((node) => {
                  const relatedAvatar = node.avatarUrl ?? node.coverThumb;
                  return (
                    <article className="artist-related-card" key={node.id}>
                      <button className="artist-related-main" type="button" onClick={() => void handleOpenRelatedArtist(node)}>
                        <span className="artist-related-avatar" data-empty={!relatedAvatar} aria-hidden="true">
                          {relatedAvatar ? <img alt="" decoding="async" draggable={false} loading="lazy" src={relatedAvatar} /> : artistMark(node.name)}
                        </span>
                        <span className="artist-related-copy"><strong>{node.name}</strong><span><small>{t('artistDetail.meta.tracks', { count: node.trackCount })}</small></span></span>
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section className="artist-section artist-overview-tracks" aria-label={t('artistDetail.tracks.aria', { artist: artist.name })}>
            <header><div><span>{t('artistDetail.status.localLibrary')}</span><h2>{t('artistDetail.tracks.heading', { artist: artist.name })}</h2></div><small>{t('artistDetail.tracks.loadedCount', { loaded: overviewTracks.length, total: tracks.length })}</small></header>
            {overviewTracks.length > 0 ? (
              <>
                <div className="artist-overview-track-grid">
                  {overviewTracks.map((track) => (
                    <article className="artist-overview-track-card" data-playing={track.id === currentTrackId} key={track.id}>
                      <span className="artist-overview-track-cover" data-empty={!track.coverThumb} aria-hidden="true">{track.coverThumb ? <img alt="" decoding="async" draggable={false} loading="lazy" src={track.coverThumb} /> : <Disc3 size={20} />}</span>
                      <span className="artist-overview-track-copy"><strong>{track.title}</strong><small>{track.album || t('artistDetail.tracks.unknownAlbum')}</small></span>
                      <time>{formatTrackDuration(track.duration)}</time>
                      <button type="button" aria-label={track.title} onClick={() => void handlePlay(track)}><Play size={14} fill="currentColor" /></button>
                    </article>
                  ))}
                </div>
                {overviewTrackCount < tracks.length ? <div className="artist-overview-track-actions"><button className="artist-load-more" type="button" onClick={() => setOverviewTrackCount(tracks.length)}>{t('artistDetail.tracks.expandAll')}</button></div> : null}
              </>
            ) : <p className="artist-detail-empty">{isLoading ? t('artistDetail.tracks.loading') : t('artistDetail.tracks.empty')}</p>}
          </section>

          <section className="artist-section artist-events-section" aria-label={t('artistDetail.aria.events')}>
            <header><div><span>{t('artistDetail.section.events')}</span><h2>{t('artistDetail.section.concertInfo')}</h2></div>{concertHeaderLabel ? <small>{concertHeaderLabel}</small> : null}</header>
            {concertEvents.length > 0 ? (
              <div className="artist-event-list">
                {concertEvents.map((event) => {
                  const eventUrl = event.ticketUrl ?? event.url ?? null;
                  const dateParts = formatConcertDateParts(event, locale);
                  const timeLabel = formatConcertTime(event, locale) ?? t('artistDetail.events.timePending');
                  const sourceLabel = event.sourceLabel ?? concertSourceName(event.source);
                  const rowLabel = `${dateParts.label} / ${concertSecondaryInfo(event)} / ${timeLabel} / ${sourceLabel}`;
                  const rowContent = (
                    <>
                      <span className="artist-event-date">
                        <time dateTime={event.startsAt} aria-label={dateParts.label}>
                          <span className="artist-event-month">{dateParts.month}</span>
                          <strong className="artist-event-day">{dateParts.day}</strong>
                          <span className="artist-event-year">{[dateParts.year, dateParts.weekday].filter(Boolean).join(' · ')}</span>
                        </time>
                      </span>
                      <span className="artist-event-info">
                        <strong className="artist-event-primary">{concertLocation(event, t('artistDetail.events.venuePending'))}</strong>
                        <span className="artist-event-secondary">{concertSecondaryInfo(event) || sourceLabel}</span>
                      </span>
                      <span className="artist-event-meta">
                        <span className="artist-event-time">{timeLabel}</span>
                        <span className="artist-event-source">{sourceLabel}</span>
                        {eventUrl ? <ExternalLink aria-hidden="true" size={13} /> : null}
                      </span>
                    </>
                  );

                  return eventUrl ? (
                    <a
                      aria-label={`${rowLabel} / ${t('artistDetail.events.openDetails')}`}
                      className="artist-event-row"
                      data-link="true"
                      href={eventUrl}
                      key={event.id}
                      rel="noreferrer"
                      target="_blank"
                      title={rowLabel}
                      onClick={(clickEvent) => handleExternalLinkClick(clickEvent, eventUrl)}
                    >
                      {rowContent}
                    </a>
                  ) : (
                    <div aria-label={rowLabel} className="artist-event-row" data-link="false" key={event.id} title={rowLabel}>
                      {rowContent}
                    </div>
                  );
                })}
              </div>
            ) : <p className="artist-detail-empty">{concertEmptyMessage}</p>}
          </section>
        </div>
      ) : null}

      {activeTab === 'albums' ? (
        <section className="artist-tab-panel artist-albums-view" aria-label={t('artistDetail.albums.aria', { artist: artist.name })}>
          <header className="artist-albums-view-header"><div><span>{t('artistDetail.tab.albums')}</span><h2>{t('artistDetail.albums.heading', { artist: artist.name })}</h2></div><strong>{t('artistDetail.meta.albums', { count: artist.albumCount })}</strong></header>
          <ArtistAlbumGrid artistId={artist.id} artistName={artist.name} albumCount={artist.albumCount} onAlbumSelect={setSelectedAlbum} />
        </section>
      ) : null}
    </div>
  );
};
