import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import '../styles/home.css';
import '../styles/home-polish.css';
import type { CSSProperties } from 'react';
import type { AudioStatus } from '../../shared/types/audio';
import type { AppSettings } from '../../shared/types/appSettings';
import { resolveEffectivePerformancePolicy } from '../../shared/utils/performancePolicy';
import {
  Album,
  AudioLines,
  ChevronLeft,
  ChevronRight,
  Disc3,
  FolderOpen,
  History,
  Library,
  ListMusic,
  Music2,
  Play,
  Radio,
  RefreshCw,
  Shuffle,
  UserRound,
  UsersRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type {
  LibraryAlbum,
  LibrarySummary,
  LibraryTrack,
  PlaybackHistoryEntry,
  PlaybackHistoryQuery,
  PlaybackHistorySummary,
  PlaybackStatsAlbum,
  PlaybackStatsDashboard,
  PlaybackStatsDay,
} from '../../shared/types/library';
import { translateCurrentLocale, useI18n } from '../i18n/I18nProvider';
import { usePlaybackQueue } from '../stores/PlaybackQueueProvider';
import {
  getSharedPlaybackStatusSnapshot,
  subscribeSharedPlaybackStatus,
  useSharedPlaybackActivityState,
} from '../stores/playbackStatusStore';
import { openAlbumDetail, openAlbumDetailForTrack, resolveAlbumDetailNavigationTarget } from '../utils/albumNavigation';
import { beginAlbumCoverEnter, cancelAlbumCoverEnter } from '../utils/albumCoverEnterTransition';
import { openArtistDetailByName } from '../utils/artistNavigation';
import type { AppRouteId } from '../app/routes';
import { HomeSignalVisualizer } from '../components/home/HomeSignalVisualizer';
import { useActiveWorkshopVisualizerPreset } from '../workshop/useActiveWorkshopVisualizerPreset';

const recentPageSize = 8;
const recentPlayedAlbumHistoryPageSize = 12;
const randomQueuePageSize = 36;
const recentShelfPageSize = 4;
const recommendedAlbumPageSize = 7;
const artistLeaderboardLimit = 5;
const favoriteAlbumLimit = 4;
const homeNowTitleMarqueeMinChars = 34;
const homeNowTitleMarqueeOverflowPx = 12;
const homeNowTitleMarqueeExitOverflowPx = 5;
const homeNowMetaMarqueeOverflowPx = 8;
const homeNowMetaMarqueeExitOverflowPx = 3;
const weeklyHeatmapWeeks = 12;
const playbackHistoryChangedEvent = 'playback-history:changed';
const restoreHomeScrollEvent = 'app:restore-home-scroll';
const visualActiveStates = new Set<AudioStatus['state']>(['loading', 'playing']);

type HomeRouteId = Extract<AppRouteId, 'albums' | 'artists' | 'folders' | 'history' | 'inbox' | 'liked' | 'playlists' | 'queue' | 'songs'>;
type RecentPanelMode = 'added' | 'played';
type MetricTileProps = {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  routeId: HomeRouteId;
};
type HomePageData = {
  recentAddedAlbums: LibraryAlbum[];
  recommendedAlbums: LibraryAlbum[];
  summary: LibrarySummary;
  recentTracks: LibraryTrack[];
  recentHistory: PlaybackHistoryEntry[];
  recentPlayedAlbums: RecentPlayedAlbum[];
  historySummary: PlaybackHistorySummary | null;
  stats: PlaybackStatsDashboard | null;
};
type RecentPlayedAlbum = {
  album: LibraryAlbum;
  startedAt: string | null;
};

const findHomeScrollContainer = (homeRoot: HTMLElement | null): HTMLElement | Window | null => {
  const explicitContainer = homeRoot?.closest('.page-scroll-container');
  if (explicitContainer instanceof HTMLElement) {
    return explicitContainer;
  }

  let current = homeRoot?.parentElement ?? null;
  while (current) {
    if (current.scrollHeight > current.clientHeight) {
      return current;
    }
    current = current.parentElement;
  }

  return typeof window === 'undefined' ? null : window;
};

const readHomeScrollTop = (container: HTMLElement | Window | null): number => {
  if (!container) {
    return 0;
  }

  if (container instanceof Window) {
    return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
  }

  return container.scrollTop;
};

const writeHomeScrollTop = (container: HTMLElement | Window | null, scrollTop: number): void => {
  if (!container) {
    return;
  }

  const nextScrollTop = Math.max(0, scrollTop);
  if (container instanceof Window) {
    container.scrollTo({ top: nextScrollTop, left: window.scrollX, behavior: 'auto' });
    return;
  }

  container.scrollTop = nextScrollTop;
};

const HomeNowTitle = ({ title }: { title: string }): JSX.Element => {
  const titleRef = useRef<HTMLElement | null>(null);
  const innerRef = useRef<HTMLSpanElement | null>(null);
  const [shouldScroll, setShouldScroll] = useState(false);
  const canScroll = title.trim().length >= homeNowTitleMarqueeMinChars;

  useEffect(() => {
    const element = titleRef.current;
    const innerElement = innerRef.current;
    if (!element || !innerElement || !canScroll) {
      setShouldScroll(false);
      return undefined;
    }

    let frameId: number | null = null;
    const updateOverflow = (): void => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        const distance = Math.max(0, innerElement.scrollWidth - element.clientWidth);
        element.style.setProperty('--home-now-title-marquee-distance', `${distance + 26}px`);
        element.style.setProperty('--home-now-title-marquee-duration', `${Math.min(24, Math.max(10, distance / 18 + 8))}s`);
        setShouldScroll((current) => {
          const nextShouldScroll = current
            ? distance > homeNowTitleMarqueeExitOverflowPx
            : distance > homeNowTitleMarqueeOverflowPx;
          return current === nextShouldScroll ? current : nextShouldScroll;
        });
      });
    };

    updateOverflow();

    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(updateOverflow) : null;
    resizeObserver?.observe(element);
    window.addEventListener('resize', updateOverflow);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateOverflow);
    };
  }, [canScroll, title]);

  return (
    <strong className="home-now-title" data-scroll={shouldScroll ? 'true' : undefined} ref={titleRef} title={title}>
      <span ref={innerRef}>{title}</span>
    </strong>
  );
};

const HomeNowMeta = ({
  onOpenAlbum,
  onOpenArtist,
  track,
}: {
  onOpenAlbum: (track: LibraryTrack) => void;
  onOpenArtist: (artistName: string) => void;
  track: LibraryTrack | null;
}): JSX.Element => {
  const { t } = useI18n();
  const metaRef = useRef<HTMLElement | null>(null);
  const innerRef = useRef<HTMLSpanElement | null>(null);
  const [shouldScroll, setShouldScroll] = useState(false);
  const hasTrack = track !== null;
  const artistName = track?.artist?.trim() ?? '';
  const albumTitle = track?.album?.trim() ?? '';
  const metaMeasureKey = `${artistName}\n${albumTitle}`;

  useEffect(() => {
    const element = metaRef.current;
    const innerElement = innerRef.current;
    if (!element || !innerElement || !hasTrack) {
      setShouldScroll(false);
      return undefined;
    }

    let frameId: number | null = null;
    const updateOverflow = (): void => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        const distance = Math.max(0, innerElement.scrollWidth - element.clientWidth);
        element.style.setProperty('--home-now-meta-marquee-distance', `${distance + 22}px`);
        element.style.setProperty('--home-now-meta-marquee-duration', `${Math.min(22, Math.max(10, distance / 20 + 8))}s`);
        setShouldScroll((current) => {
          const nextShouldScroll = current
            ? distance > homeNowMetaMarqueeExitOverflowPx
            : distance > homeNowMetaMarqueeOverflowPx;
          return current === nextShouldScroll ? current : nextShouldScroll;
        });
      });
    };

    updateOverflow();

    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(updateOverflow) : null;
    resizeObserver?.observe(element);
    window.addEventListener('resize', updateOverflow);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateOverflow);
    };
  }, [hasTrack, metaMeasureKey]);

  if (!track) {
    return <small className="home-now-meta">{t('home.nowMeta.empty')}</small>;
  }

  return (
    <small className="home-now-meta" data-scroll={shouldScroll ? 'true' : undefined} ref={metaRef}>
      <span className="home-now-meta-inner" ref={innerRef}>
        {artistName ? (
          <button className="home-now-link" type="button" onClick={() => onOpenArtist(artistName)}>
            {artistName}
          </button>
        ) : (
          <span>{t('queue.unknownArtist')}</span>
        )}
        <span aria-hidden="true"> · </span>
        {albumTitle ? (
          <button className="home-now-link" type="button" onClick={() => onOpenAlbum(track)}>
            {albumTitle}
          </button>
        ) : (
          <span>{t('queue.unknownAlbum')}</span>
        )}
      </span>
    </small>
  );
};

const emptySummary: LibrarySummary = {
  songCount: 0,
  albumCount: 0,
  artistCount: 0,
  folderCount: 0,
  totalDuration: 0,
  lastScanAt: null,
};
const emptyHomePageData: HomePageData = {
  recentAddedAlbums: [],
  recommendedAlbums: [],
  summary: emptySummary,
  recentTracks: [],
  recentHistory: [],
  recentPlayedAlbums: [],
  historySummary: null,
  stats: null,
};
const homePageCacheStorageKey = 'echo.home-page-cache.v2';
const homePageCacheVersion = 2;
const isHomePageTestRuntime = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';
const homeInitialPlaybackPulseDelayMs = isHomePageTestRuntime ? 0 : 2600;
const homePlaybackHistoryRefreshDelayMs = isHomePageTestRuntime ? 0 : 900;

type StoredHomePageCache = {
  data: HomePageData;
  savedAt: string;
  version: typeof homePageCacheVersion;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const historyText = (value: string | null | undefined, fallback: string): string => {
  const text = value?.trim();
  return text && text.length > 0 ? text : fallback;
};

const isNonStreamingAlbum = (album: Pick<LibraryAlbum, 'mediaType'>): boolean =>
  album.mediaType !== 'streaming';

const isNonStreamingHistoryEntry = (entry: Pick<PlaybackHistoryEntry, 'mediaType'>): boolean =>
  entry.mediaType !== 'streaming';

const isPlaybackPriorityActiveState = (state: AudioStatus['state'] | null | undefined): boolean =>
  visualActiveStates.has(state ?? 'idle');

const isPlaybackPriorityBlockingState = (state: AudioStatus['state'] | null | undefined): boolean =>
  visualActiveStates.has(state ?? 'idle');

const recentPlayedAlbumsFromHistory = (entries: PlaybackHistoryEntry[]): RecentPlayedAlbum[] => {
  const seenAlbumKeys = new Set<string>();
  const albums: RecentPlayedAlbum[] = [];

  for (const entry of entries) {
    if (!isNonStreamingHistoryEntry(entry)) {
      continue;
    }

    const title = historyText(entry.album, historyText(entry.title, translateCurrentLocale('queue.unknownAlbum')));
    const albumArtist = historyText(entry.albumArtist, historyText(entry.artist, translateCurrentLocale('queue.unknownArtist')));
    const albumKey = `${entry.mediaType}:${albumArtist.toLowerCase()}:${title.toLowerCase()}`;

    if (seenAlbumKeys.has(albumKey)) {
      continue;
    }

    seenAlbumKeys.add(albumKey);
    albums.push({
      album: {
        id: `history:${albumKey}`,
        mediaType: entry.mediaType === 'remote' ? 'remote' : 'local',
        albumKey,
        title,
        albumArtist,
        year: null,
        trackCount: 1,
        duration: entry.durationSnapshot ?? entry.durationSeconds ?? 0,
        coverId: entry.coverId,
        coverThumb: entry.coverThumb ?? entry.coverSnapshot,
      },
      startedAt: entry.startedAt,
    });
  }

  return albums.slice(0, recentPlayedAlbumHistoryPageSize);
};

const normalizeStoredHomePageData = (value: unknown): HomePageData | null => {
  if (!isRecord(value)) {
    return null;
  }

  const recentHistory = Array.isArray(value.recentHistory) ? (value.recentHistory as PlaybackHistoryEntry[]) : [];
  const storedRecentPlayedAlbums = Array.isArray(value.recentPlayedAlbums) ? (value.recentPlayedAlbums as RecentPlayedAlbum[]) : [];
  const storedNonStreamingRecentPlayedAlbums = storedRecentPlayedAlbums.filter((item) => isNonStreamingAlbum(item.album));

  return {
    recentAddedAlbums: Array.isArray(value.recentAddedAlbums) ? (value.recentAddedAlbums as LibraryAlbum[]) : [],
    recommendedAlbums: Array.isArray(value.recommendedAlbums) ? (value.recommendedAlbums as LibraryAlbum[]) : [],
    summary: isRecord(value.summary) ? ({ ...emptySummary, ...value.summary } as LibrarySummary) : emptySummary,
    recentTracks: Array.isArray(value.recentTracks) ? (value.recentTracks as LibraryTrack[]) : [],
    recentHistory,
    recentPlayedAlbums: storedNonStreamingRecentPlayedAlbums.length > 0 ? storedNonStreamingRecentPlayedAlbums : recentPlayedAlbumsFromHistory(recentHistory),
    historySummary: isRecord(value.historySummary) ? (value.historySummary as PlaybackHistorySummary) : null,
    stats: isRecord(value.stats) ? (value.stats as PlaybackStatsDashboard) : null,
  };
};

const readStoredHomePageData = (): HomePageData | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(homePageCacheStorageKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<StoredHomePageCache>;
    if (parsed.version !== homePageCacheVersion) {
      return null;
    }

    return normalizeStoredHomePageData(parsed.data);
  } catch {
    return null;
  }
};

const writeStoredHomePageData = (data: HomePageData): void => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      homePageCacheStorageKey,
      JSON.stringify({
        data,
        savedAt: new Date().toISOString(),
        version: homePageCacheVersion,
      } satisfies StoredHomePageCache),
    );
  } catch {
    // Startup cache is best-effort only; never let storage pressure affect playback or navigation.
  }
};

const setCachedHomePageData = (data: HomePageData): HomePageData => {
  cachedHomePageData = data;
  writeStoredHomePageData(data);
  return data;
};

const mergeCachedHomePageData = (patch: Partial<HomePageData>): HomePageData =>
  setCachedHomePageData({
    ...(cachedHomePageData ?? emptyHomePageData),
    ...patch,
  });

const hasStatsContent = (stats: PlaybackStatsDashboard | null): boolean => {
  if (!stats) {
    return false;
  }

  const maybeStats = stats as Partial<PlaybackStatsDashboard>;
  const totals = maybeStats.totals;
  const topTracks = Array.isArray(maybeStats.topTracks) ? maybeStats.topTracks : [];
  const topArtists = Array.isArray(maybeStats.topArtists) ? maybeStats.topArtists : [];
  const topAlbums = Array.isArray(maybeStats.topAlbums) ? maybeStats.topAlbums : [];
  const dailyActivity = Array.isArray(maybeStats.dailyActivity) ? maybeStats.dailyActivity : [];

  return (
    Number(totals?.playCount ?? 0) > 0 ||
    Number(totals?.playedSeconds ?? 0) > 0 ||
    topTracks.length > 0 ||
    topArtists.length > 0 ||
    topAlbums.length > 0 ||
    dailyActivity.some((day) => Number(day.playCount ?? 0) > 0 || Number(day.playedSeconds ?? 0) > 0)
  );
};

const hasStatsLeaderboardContent = (stats: PlaybackStatsDashboard | null): boolean => {
  if (!stats) {
    return false;
  }

  const maybeStats = stats as Partial<PlaybackStatsDashboard>;
  const topTracks = Array.isArray(maybeStats.topTracks) ? maybeStats.topTracks : [];
  const topArtists = Array.isArray(maybeStats.topArtists) ? maybeStats.topArtists : [];
  const topAlbums = Array.isArray(maybeStats.topAlbums) ? maybeStats.topAlbums : [];

  return topTracks.length > 0 || topArtists.length > 0 || topAlbums.length > 0;
};

const mergePlaybackActivityStats = (
  current: PlaybackStatsDashboard | null,
  activity: PlaybackStatsDashboard | null,
): PlaybackStatsDashboard | null => {
  if (!activity) {
    return current;
  }
  if (!current) {
    return activity;
  }

  return {
    ...current,
    generatedAt: activity.generatedAt,
    totals: activity.totals,
    dailyActivity: activity.dailyActivity,
  };
};

const hasHistorySummaryContent = (summary: PlaybackHistorySummary | null): boolean => {
  if (!summary) {
    return false;
  }

  const maybeSummary = summary as Partial<PlaybackHistorySummary>;
  return (
    Number(maybeSummary.todayCount ?? 0) > 0 ||
    Number(maybeSummary.todayPlayedSeconds ?? 0) > 0 ||
    Number(maybeSummary.totalCount ?? 0) > 0 ||
    Number(maybeSummary.rangeCount ?? 0) > 0 ||
    Number(maybeSummary.rangePlayedSeconds ?? 0) > 0 ||
    Boolean(maybeSummary.latestPlayedAt) ||
    Boolean(maybeSummary.rangeLatestPlayedAt)
  );
};

const hasDailyActivityContent = (days: PlaybackStatsDay[] | null | undefined): boolean =>
  Array.isArray(days) && days.some((day) => Number(day.playCount ?? 0) > 0 || Number(day.playedSeconds ?? 0) > 0);

const summarizeDailyActivityForCurrentWeek = (
  days: PlaybackStatsDay[] | null | undefined,
  now = new Date(),
): { playCount: number; playedSeconds: number } => {
  const weekStart = startOfWeek(now);
  const weekEnd = addDays(weekStart, 7);

  return (days ?? []).reduce((summary, day) => {
    const date = new Date(`${day.date}T00:00:00`);
    if (!Number.isFinite(date.getTime()) || compareDay(date, weekStart) < 0 || compareDay(date, weekEnd) >= 0) {
      return summary;
    }

    summary.playCount += Math.max(0, Number(day.playCount) || 0);
    summary.playedSeconds += Math.max(0, Number(day.playedSeconds) || 0);
    return summary;
  }, { playCount: 0, playedSeconds: 0 });
};

const buildRecentHistoryActivityFallback = (
  history: PlaybackHistoryEntry[],
  now = new Date(),
): { dailyActivity: PlaybackStatsDay[]; weeklyPlayCount: number; weeklyDuration: number } => {
  const today = startOfDay(now);
  const currentWeekStart = startOfWeek(today);
  const heatmapStart = addDays(currentWeekStart, -7 * (weeklyHeatmapWeeks - 1));
  const heatmapEnd = addDays(currentWeekStart, 7);
  const dailyActivityByDate = new Map<string, PlaybackStatsDay>();

  let weeklyPlayCount = 0;
  let weeklyDuration = 0;

  for (const entry of history) {
    const startedAt = new Date(entry.startedAt);
    if (!Number.isFinite(startedAt.getTime())) {
      continue;
    }

    const day = startOfDay(startedAt);
    if (compareDay(day, heatmapStart) < 0 || compareDay(day, heatmapEnd) >= 0) {
      continue;
    }

    const playCount = Math.max(1, Number(entry.playCount) || 0);
    const playedSeconds = Math.max(0, Number(entry.playedSeconds) || Number(entry.durationSnapshot) || Number(entry.durationSeconds) || 0);
    const dateKey = formatDateKey(day);
    const dailyActivity = dailyActivityByDate.get(dateKey) ?? { date: dateKey, playCount: 0, playedSeconds: 0 };
    dailyActivity.playCount += playCount;
    dailyActivity.playedSeconds += playedSeconds;
    dailyActivityByDate.set(dateKey, dailyActivity);

    if (compareDay(day, currentWeekStart) >= 0 && compareDay(day, heatmapEnd) < 0) {
      weeklyPlayCount += playCount;
      weeklyDuration += playedSeconds;
    }
  }

  return {
    dailyActivity: [...dailyActivityByDate.values()].sort((left, right) => left.date.localeCompare(right.date)),
    weeklyPlayCount,
    weeklyDuration,
  };
};

const hasCachedPlaybackPulseData = (data: HomePageData | null): boolean =>
  Boolean(data && (
    hasStatsContent(data.stats) &&
    (
      hasHistorySummaryContent(data.historySummary) ||
      data.recentHistory.length > 0 ||
      data.recentPlayedAlbums.length > 0
    )
  ));

const hasCachedLibraryPulseData = (data: HomePageData | null): boolean =>
  Boolean(data && (
    data.summary.songCount > 0 ||
    data.summary.albumCount > 0 ||
    data.summary.artistCount > 0 ||
    data.recentTracks.length > 0 ||
    data.recentAddedAlbums.length > 0 ||
    data.recommendedAlbums.length > 0
  ));

let cachedHomePageData: HomePageData | null = readStoredHomePageData();
let cachedRecentPanelMode: RecentPanelMode = 'added';
let cachedHomeWaveformVisualizerEnabled: boolean | null = null;
let cachedHomeWaveformVisualizerSettings = {
  homeWaveformVisualizerEnabled: false,
  audioVisualSpectrumEnabled: false,
  lowLoadPlaybackModeEnabled: false,
  lowSpecModeEnabled: false,
};
export const resetHomePageCacheForTest = (): void => {
  cachedHomePageData = null;
  cachedRecentPanelMode = 'added';
  cachedHomeWaveformVisualizerEnabled = null;
  cachedHomeWaveformVisualizerSettings = {
    homeWaveformVisualizerEnabled: false,
    audioVisualSpectrumEnabled: false,
    lowLoadPlaybackModeEnabled: false,
    lowSpecModeEnabled: false,
  };
  try {
    window.localStorage.removeItem(homePageCacheStorageKey);
  } catch {
    // Ignore unavailable storage in non-browser test environments.
  }
};

const formatCompactNumber = (value: number): string => {
  if (!Number.isFinite(value)) {
    return '0';
  }

  return new Intl.NumberFormat(undefined, { maximumFractionDigits: value >= 1000 ? 1 : 0, notation: value >= 10000 ? 'compact' : 'standard' }).format(value);
};

const formatDuration = (seconds: number, t: ReturnType<typeof useI18n>['t']): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return t('home.duration.zeroMinutes');
  }

  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) {
    return t('home.duration.minutes', { count: totalMinutes });
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? t('home.duration.hoursMinutes', { hours, minutes }) : t('home.duration.hoursOnly', { hours });
};

const formatShortDate = (value: string | null, t: ReturnType<typeof useI18n>['t'], locale: string): string => {
  if (!value) {
    return t('home.date.none');
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return t('home.date.unknown');
  }

  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(date);
};

const ArtistLeaderboard = ({
  artists,
  onOpenArtist,
}: {
  artists: PlaybackStatsDashboard['topArtists'];
  onOpenArtist: (artistName: string) => void;
}): JSX.Element => {
  const { t } = useI18n();
  const visibleArtists = artists
    .filter((artist) => artist.artist.trim().length > 0)
    .slice(0, artistLeaderboardLimit);
  const maxPlayCount = Math.max(...visibleArtists.map((artist) => artist.playCount), 1);

  if (visibleArtists.length === 0) {
    return (
      <div className="home-artist-rank-empty" role="status">
        <UserRound size={18} />
        <span>
          <strong>{t('home.artistLeaderboard.emptyTitle')}</strong>
          <small>{t('home.artistLeaderboard.emptyDescription')}</small>
        </span>
      </div>
    );
  }

  return (
    <ol className="home-artist-leaderboard" aria-label={t('home.artistLeaderboard.aria')}>
      {visibleArtists.map((artist, index) => {
        const artistName = artist.artist.trim();
        const score = Math.max(0.08, artist.playCount / maxPlayCount);
        const completionRate = artist.playCount > 0 ? Math.round((artist.completedCount / artist.playCount) * 100) : 0;

        return (
          <li className="home-artist-rank-item" key={`${artistName}-${index}`}>
            <button
              className="home-artist-rank-row"
              data-rank-lead={index === 0 ? 'true' : undefined}
              style={{ '--home-artist-score': score } as CSSProperties}
              type="button"
              onClick={() => onOpenArtist(artistName)}
            >
              <span className="home-artist-rank-number">{String(index + 1).padStart(2, '0')}</span>
              <span className="home-artist-rank-main">
                <strong>{artistName}</strong>
                <span className="home-artist-rank-meta">
                  <span>{t('home.artistLeaderboard.playCount', { count: formatCompactNumber(artist.playCount) })}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatDuration(artist.playedSeconds, t)}</span>
                </span>
              </span>
              <span className="home-artist-rank-chip">{t('home.artistLeaderboard.completionRate', { rate: completionRate })}</span>
              <span className="home-artist-rank-meter" aria-hidden="true">
                <i />
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
};

const statsAlbumToLibraryAlbum = (album: PlaybackStatsAlbum): LibraryAlbum | null => {
  if (!album.albumId) {
    return null;
  }

  return {
    id: album.albumId,
    mediaType: album.mediaType === 'remote' ? 'remote' : 'local',
    albumKey: album.albumKey ?? album.albumId,
    title: album.title,
    albumArtist: album.albumArtist,
    year: album.year,
    trackCount: album.trackCount,
    duration: album.duration,
    coverId: album.coverId,
    coverThumb: album.coverThumb,
  };
};

const normalizeFavoriteAlbumText = (value: string | null | undefined): string =>
  (value ?? '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');

const isFavoriteAlbumCandidate = (candidate: LibraryAlbum, album: PlaybackStatsAlbum): boolean => {
  const sameTitle = normalizeFavoriteAlbumText(candidate.title) === normalizeFavoriteAlbumText(album.title);
  const sameArtist = normalizeFavoriteAlbumText(candidate.albumArtist) === normalizeFavoriteAlbumText(album.albumArtist);
  const sameYear = candidate.year === album.year || !candidate.year || !album.year;

  return sameTitle && sameArtist && sameYear;
};

const findFavoriteLibraryAlbum = async (album: PlaybackStatsAlbum): Promise<LibraryAlbum | null> => {
  const library = window.echo?.library;

  if (!library?.getAlbums) {
    throw new Error('Desktop library bridge unavailable. Open ECHO in Electron to locate this album.');
  }

  const search = album.title.trim() || album.albumArtist.trim();
  if (!search) {
    return null;
  }

  const result = await library.getAlbums({ page: 1, pageSize: 50, search });
  return result.items.find((candidate) => isFavoriteAlbumCandidate(candidate, album)) ?? null;
};

const favoriteStatsAlbumWithTarget = (album: PlaybackStatsAlbum, target: LibraryAlbum): PlaybackStatsAlbum => ({
  ...album,
  albumId: target.id,
  albumKey: target.albumKey,
  mediaType: target.mediaType === 'remote' ? 'remote' : 'local',
  title: target.title,
  albumArtist: target.albumArtist,
  year: target.year,
  trackCount: target.trackCount,
  duration: target.duration,
  coverId: target.coverId,
  coverThumb: target.coverThumb ?? album.coverThumb,
});

const hasReadableFavoriteAlbumTracks = async (album: PlaybackStatsAlbum, target: LibraryAlbum): Promise<boolean> => {
  const library = window.echo?.library;
  const expectedTrackCount = Math.max(album.trackCount, target.trackCount);
  if (!library?.getAlbumTracks || expectedTrackCount <= 0) {
    return true;
  }

  try {
    const result = await library.getAlbumTracks(target.id, { page: 1, pageSize: 1 });
    return result.total > 0 || result.items.length > 0;
  } catch {
    return true;
  }
};

const resolveFavoriteAlbumTarget = async (album: PlaybackStatsAlbum): Promise<LibraryAlbum | null> => {
  const libraryAlbum = statsAlbumToLibraryAlbum(album);
  if (libraryAlbum) {
    const resolvedAlbum = await resolveAlbumDetailNavigationTarget(libraryAlbum);
    if (await hasReadableFavoriteAlbumTracks(album, resolvedAlbum)) {
      return resolvedAlbum;
    }

    const fallbackAlbum = await findFavoriteLibraryAlbum(album);
    return fallbackAlbum && await hasReadableFavoriteAlbumTracks(album, fallbackAlbum) ? fallbackAlbum : null;
  }

  const resolvedAlbum = await findFavoriteLibraryAlbum(album);
  return resolvedAlbum && await hasReadableFavoriteAlbumTracks(album, resolvedAlbum) ? resolvedAlbum : null;
};

const FavoriteAlbumGrid = ({
  albums,
  onOpenAlbum,
}: {
  albums: PlaybackStatsAlbum[];
  onOpenAlbum: (album: PlaybackStatsAlbum, originTarget?: EventTarget | null) => void;
}): JSX.Element => {
  const { t } = useI18n();
  const visibleAlbums = albums
    .filter((album) => album.title.trim().length > 0)
    .slice(0, favoriteAlbumLimit);

  if (visibleAlbums.length === 0) {
    return (
      <div className="home-favorite-album-empty" role="status">
        <Album size={18} />
        <span>
          <strong>{t('home.favoriteAlbums.emptyTitle')}</strong>
          <small>{t('home.favoriteAlbums.emptyDescription')}</small>
        </span>
      </div>
    );
  }

  return (
    <div className="home-favorite-album-grid" aria-label={t('home.favoriteAlbums.aria')}>
      {visibleAlbums.map((album, index) => {
        return (
          <button
            className="home-favorite-album-card"
            key={album.id}
            type="button"
            onClick={(event) => onOpenAlbum(album, event.currentTarget)}
          >
            <Artwork coverThumb={homeArtworkUrl(album, 'thumb')} title={album.title} size={96} />
            <span className="home-favorite-album-rank">{String(index + 1).padStart(2, '0')}</span>
            <span className="home-favorite-album-copy">
              <strong>{album.title}</strong>
              <small>{album.albumArtist || t('queue.unknownArtist')}</small>
              <em>{t('home.artistLeaderboard.playCount', { count: formatCompactNumber(album.playCount) })} · {formatDuration(album.playedSeconds, t)}</em>
            </span>
          </button>
        );
      })}
    </div>
  );
};

const startOfDay = (date: Date): Date => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const startOfWeek = (date: Date): Date => {
  const next = startOfDay(date);
  const day = next.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + mondayOffset);
  return next;
};

const compareDay = (left: Date, right: Date): number => startOfDay(left).getTime() - startOfDay(right).getTime();

const formatDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatMonthLabel = (date: Date, t: ReturnType<typeof useI18n>['t']): string =>
  t('home.month.label', { month: date.getMonth() + 1 });

type LibraryBridge = NonNullable<NonNullable<Window['echo']>['library']>;

const loadRecommendedAlbums = async (library: LibraryBridge, albumCount: number, sort: 'default' | 'random' = 'default'): Promise<LibraryAlbum[]> => {
  if (!library.getAlbums || albumCount <= 0) {
    return [];
  }

  try {
    const result = await library.getAlbums({
      page: 1,
      pageSize: recommendedAlbumPageSize,
      sort,
      excludeOsuAlbums: true,
    });
    return Array.from(new Map(result.items.map((album) => [album.id, album])).values());
  } catch {
    return [];
  }
};

const loadRecentAddedAlbums = async (library: LibraryBridge, albumCount: number): Promise<LibraryAlbum[]> => {
  if (!library.getAlbums || albumCount <= 0) {
    return [];
  }

  try {
    const result = await library.getAlbums({
      page: 1,
      pageSize: recentPageSize,
      sort: 'recent',
      excludeOsuAlbums: true,
    });
    return Array.from(new Map(result.items.map((album) => [album.id, album])).values());
  } catch {
    return [];
  }
};

const loadRecentPlayedAlbums = async (library: LibraryBridge, entries: PlaybackHistoryEntry[]): Promise<RecentPlayedAlbum[]> => {
  if (!library.getAlbumForTrack || entries.length === 0) {
    return [];
  }

  const resolvedAlbums = await Promise.all(
    entries.map(async (entry): Promise<RecentPlayedAlbum | null> => {
      if (!entry.trackId || !isNonStreamingHistoryEntry(entry)) {
        return null;
      }

      try {
        const album = await library.getAlbumForTrack(entry.trackId);
        return album && isNonStreamingAlbum(album) ? { album, startedAt: entry.startedAt } : null;
      } catch {
        return null;
      }
    }),
  );

  const seenAlbumIds = new Set<string>();
  const albums: RecentPlayedAlbum[] = [];
  for (const item of resolvedAlbums) {
    if (!item || seenAlbumIds.has(item.album.id)) {
      continue;
    }

    seenAlbumIds.add(item.album.id);
    albums.push(item);
  }

  return albums;
};

const startOfThisWeekQuery = (): PlaybackHistoryQuery => {
  const start = startOfWeek(new Date());

  return { from: start.toISOString(), to: addDays(start, 7).toISOString() };
};

const weeklyHeatmapQuery = (): PlaybackHistoryQuery => {
  const currentWeekStart = startOfWeek(new Date());
  const from = addDays(currentWeekStart, -7 * (weeklyHeatmapWeeks - 1));

  return { from: from.toISOString(), to: addDays(currentWeekStart, 7).toISOString(), statsMode: 'activity' };
};

const navigateHomeRoute = (routeId: HomeRouteId): void => {
  window.dispatchEvent(new CustomEvent('app:navigate:route', { detail: routeId }));
};

const readHomeWaveformVisualizerEnabled = (settings: Partial<AppSettings> | null | undefined): boolean => {
  const performancePolicy = resolveEffectivePerformancePolicy(settings);
  return performancePolicy.homeWaveformVisualizerEnabled &&
    performancePolicy.audioVisualSpectrumEnabled &&
    settings?.lowLoadPlaybackModeEnabled !== true;
};

const useHomeWaveformVisualizerEnabled = (): boolean => {
  const [enabled, setEnabled] = useState(() => cachedHomeWaveformVisualizerEnabled ?? false);

  useEffect(() => {
    let cancelled = false;
    const applySettings = (settings: Partial<AppSettings> | null | undefined): void => {
      if (
        !settings ||
        (!Object.prototype.hasOwnProperty.call(settings, 'homeWaveformVisualizerEnabled') &&
          !Object.prototype.hasOwnProperty.call(settings, 'audioVisualSpectrumEnabled') &&
          !Object.prototype.hasOwnProperty.call(settings, 'lowLoadPlaybackModeEnabled') &&
          !Object.prototype.hasOwnProperty.call(settings, 'lowSpecModeEnabled'))
      ) {
        return;
      }

      cachedHomeWaveformVisualizerSettings = {
        homeWaveformVisualizerEnabled:
          typeof settings.homeWaveformVisualizerEnabled === 'boolean'
            ? settings.homeWaveformVisualizerEnabled
            : cachedHomeWaveformVisualizerSettings.homeWaveformVisualizerEnabled,
        audioVisualSpectrumEnabled:
          typeof settings.audioVisualSpectrumEnabled === 'boolean'
            ? settings.audioVisualSpectrumEnabled
            : cachedHomeWaveformVisualizerSettings.audioVisualSpectrumEnabled,
        lowLoadPlaybackModeEnabled:
          typeof settings.lowLoadPlaybackModeEnabled === 'boolean'
            ? settings.lowLoadPlaybackModeEnabled
            : cachedHomeWaveformVisualizerSettings.lowLoadPlaybackModeEnabled,
        lowSpecModeEnabled:
          typeof settings.lowSpecModeEnabled === 'boolean'
            ? settings.lowSpecModeEnabled
            : cachedHomeWaveformVisualizerSettings.lowSpecModeEnabled,
      };
      const nextEnabled = readHomeWaveformVisualizerEnabled(cachedHomeWaveformVisualizerSettings);
      cachedHomeWaveformVisualizerEnabled = nextEnabled;
      if (!cancelled) {
        setEnabled(nextEnabled);
      }
    };

    void window.echo?.app?.getSettings?.().then(applySettings).catch(() => undefined);

    const handleSettingsChanged = (event: Event): void => {
      applySettings((event as CustomEvent<Partial<AppSettings> | null | undefined>).detail);
    };

    window.addEventListener('settings:changed', handleSettingsChanged);
    return () => {
      cancelled = true;
      window.removeEventListener('settings:changed', handleSettingsChanged);
    };
  }, []);

  return enabled;
};

const homeArtworkUrl = (
  source: { coverId?: string | null; coverThumb?: string | null; coverSnapshot?: string | null },
  variant: 'album' | 'large' | 'thumb' = 'album',
): string | null => {
  const fallback = source.coverThumb ?? source.coverSnapshot ?? null;
  if (source.coverId) {
    return `echo-cover://${variant}/${encodeURIComponent(source.coverId)}`;
  }

  return fallback?.replace(/^echo-cover:\/\/(?:thumb|album|large|original)\//u, `echo-cover://${variant}/`) ?? fallback;
};

const trackFromHistory = (entry: PlaybackHistoryEntry): LibraryTrack => ({
  id: entry.stableKey ?? entry.trackId ?? entry.id,
  mediaType: entry.mediaType,
  path: entry.mediaType === 'streaming' ? entry.stableKey ?? entry.trackPath : entry.trackPath,
  provider: entry.provider,
  providerTrackId: entry.providerTrackId,
  stableKey: entry.stableKey,
  title: entry.title,
  artist: entry.artist,
  album: entry.album,
  albumArtist: entry.albumArtist,
  trackNo: null,
  discNo: null,
  year: null,
  genre: null,
  duration: entry.durationSeconds,
  codec: null,
  sampleRate: null,
  bitDepth: null,
  bitrate: null,
  coverId: entry.coverId,
  coverThumb: entry.coverThumb ?? entry.coverSnapshot,
  fieldSources: {},
});

const Artwork = memo(({
  coverThumb,
  fetchPriority = 'low',
  size = 92,
  title,
}: {
  coverThumb: string | null;
  fetchPriority?: 'high' | 'low';
  size?: number;
  title: string;
}): JSX.Element => (
  <div className="home-artwork" data-empty={!coverThumb} style={{ '--home-artwork-size': `${size}px` } as CSSProperties}>
    {coverThumb ? (
      <img
        alt=""
        src={coverThumb}
        width={size}
        height={size}
        loading={fetchPriority === 'high' ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={fetchPriority}
        draggable={false}
      />
    ) : (
      <Music2 size={Math.max(22, Math.round(size * 0.28))} />
    )}
    <span className="sr-only">{title}</span>
  </div>
));

const CoverRailSkeleton = ({ count, railClassName }: { count: number; railClassName: string }): JSX.Element => (
  <div className={railClassName} aria-hidden="true">
    {Array.from({ length: count }, (_, index) => (
      <div className="home-cover-skeleton" key={index}>
        <span className="home-skeleton-block home-skeleton-art" />
        <span className="home-skeleton-block home-skeleton-line" />
        <span className="home-skeleton-block home-skeleton-line home-skeleton-line--short" />
      </div>
    ))}
  </div>
);

const MetricTile = ({ icon: Icon, label, value, detail, routeId }: MetricTileProps): JSX.Element => {
  const { t } = useI18n();

  return (
    <button className="home-metric-tile" type="button" aria-label={t('home.metric.openAria', { label })} onClick={() => navigateHomeRoute(routeId)}>
      <span className="home-metric-icon" data-metric={routeId} aria-hidden="true">
        <Icon size={24} strokeWidth={1.7} />
      </span>
      <div>
        <strong>{value}</strong>
        <span className="home-metric-label">{label}</span>
        <small>{detail}</small>
      </div>
    </button>
  );
};

const SectionHeader = ({
  title,
  action,
  actionLabel,
  routeId,
}: {
  title: string;
  action?: JSX.Element;
  actionLabel?: string;
  routeId?: HomeRouteId;
}): JSX.Element => (
  <header className="home-section-header">
    <h2>{title}</h2>
    {action ??
    (routeId && actionLabel ? (
      <button type="button" onClick={() => navigateHomeRoute(routeId)}>
        {actionLabel}
      </button>
    ) : null)}
  </header>
);

const scheduleHomeStartupWork = (callback: () => void, delayMs = 0): (() => void) => {
  if (typeof window === 'undefined') {
    callback();
    return () => undefined;
  }

  let frameId: number | null = null;
  let timeoutId: number | null = null;
  let cancelled = false;
  const run = (): void => {
    if (cancelled) {
      return;
    }
    frameId = null;
    timeoutId = window.setTimeout(() => {
      if (cancelled) {
        return;
      }
      timeoutId = null;
      callback();
    }, delayMs);
  };

  if (typeof window.requestAnimationFrame === 'function') {
    frameId = window.requestAnimationFrame(run);
  } else {
    run();
  }

  return () => {
    cancelled = true;
    if (frameId !== null) {
      window.cancelAnimationFrame(frameId);
    }
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  };
};

const WeeklyHeatmap = ({ days }: { days: PlaybackStatsDay[] }): JSX.Element => {
  const { t } = useI18n();
  const today = startOfDay(new Date());
  const currentWeekStart = startOfWeek(today);
  const firstWeekStart = addDays(currentWeekStart, -7 * (weeklyHeatmapWeeks - 1));
  const gridEnd = addDays(currentWeekStart, 6);
  const activityByDate = new Map(days.map((day) => [day.date, day]));
  const cells: Array<{
    date: Date;
    dateKey: string;
    isFuture: boolean;
    playCount: number;
    playedSeconds: number;
  }> = [];

  for (let day = firstWeekStart; compareDay(day, gridEnd) <= 0; day = addDays(day, 1)) {
    const date = startOfDay(day);
    const dateKey = formatDateKey(date);
    const activity = activityByDate.get(dateKey);
    cells.push({
      date,
      dateKey,
      isFuture: compareDay(date, today) > 0,
      playCount: activity?.playCount ?? 0,
      playedSeconds: activity?.playedSeconds ?? 0,
    });
  }

  const weeks = Array.from({ length: weeklyHeatmapWeeks }, (_, index) => cells.slice(index * 7, index * 7 + 7));
  const maxCount = Math.max(...cells.map((day) => day.playCount), 1);
  const monthStarts = weeks.reduce<Array<{ label: string; month: number; span: number; week: number; year: number }>>((labels, week, weekIndex) => {
    const firstDay = week[0]?.date;

    if (!firstDay) {
      return labels;
    }

    const lastLabel = labels.at(-1);
    if (!lastLabel || firstDay.getMonth() !== lastLabel.month || firstDay.getFullYear() !== lastLabel.year) {
      labels.push({
        label: formatMonthLabel(firstDay, t),
        month: firstDay.getMonth(),
        span: 1,
        week: weekIndex,
        year: firstDay.getFullYear(),
      });
      return labels;
    }

    lastLabel.span += 1;
    return labels;
  }, []);
  const activeWeeks = weeks.filter((week) => week.some((day) => !day.isFuture && day.playCount > 0)).length;
  const getLevel = (count: number): number => {
    if (count <= 0) {
      return 0;
    }

    const ratio = count / maxCount;
    if (ratio >= 0.8) {
      return 4;
    }
    if (ratio >= 0.55) {
      return 3;
    }
    if (ratio >= 0.25) {
      return 2;
    }
    return 1;
  };

  return (
    <div className="home-week-heatmap">
      <div className="home-week-months" style={{ gridTemplateColumns: `24px repeat(${weeklyHeatmapWeeks}, var(--home-week-cell))` }}>
        {monthStarts.map((month) => (
          <span key={`${month.year}-${month.month}`} style={{ gridColumn: `${month.week + 2} / span ${month.span}` }}>
            {month.label}
          </span>
        ))}
      </div>
      <div className="home-week-grid-shell">
        <div className="home-weekdays" aria-hidden="true">
          <span>{t('home.weekday.mon')}</span>
          <span />
          <span>{t('home.weekday.wed')}</span>
          <span />
          <span>{t('home.weekday.fri')}</span>
          <span />
          <span />
        </div>
        <div
          className="home-week-grid"
          style={{ gridTemplateColumns: `repeat(${weeklyHeatmapWeeks}, var(--home-week-cell))` }}
          aria-label={t('home.weeklyHeatmap.aria', { weeks: weeklyHeatmapWeeks })}
        >
          {cells.map((day) => (
            <span
              className="home-week-cell"
              data-future={day.isFuture ? 'true' : undefined}
              data-level={day.isFuture ? 0 : getLevel(day.playCount)}
              key={day.dateKey}
              title={t('home.weeklyHeatmap.dayTitle', { date: day.dateKey, playCount: day.playCount, duration: formatDuration(day.playedSeconds, t) })}
              aria-label={t('home.weeklyHeatmap.dayAria', { date: day.dateKey, playCount: day.playCount })}
            />
          ))}
        </div>
      </div>
      <div className="home-week-legend" aria-hidden="true">
        <span>{t('home.weeklyHeatmap.activeWeeks', { count: activeWeeks })}</span>
        <i data-level={0} />
        <i data-level={1} />
        <i data-level={2} />
        <i data-level={3} />
        <i data-level={4} />
      </div>
    </div>
  );
};

export const HomePage = (): JSX.Element => {
  const { locale, t } = useI18n();
  const queue = usePlaybackQueue();
  const initialHomeData = cachedHomePageData ?? emptyHomePageData;
  const [recentAddedAlbums, setRecentAddedAlbums] = useState<LibraryAlbum[]>(initialHomeData.recentAddedAlbums);
  const [recommendedAlbums, setRecommendedAlbums] = useState<LibraryAlbum[]>(initialHomeData.recommendedAlbums);
  const [summary, setSummary] = useState<LibrarySummary>(initialHomeData.summary);
  const [recentTracks, setRecentTracks] = useState<LibraryTrack[]>(initialHomeData.recentTracks);
  const [recentHistory, setRecentHistory] = useState<PlaybackHistoryEntry[]>(initialHomeData.recentHistory);
  const [recentPlayedAlbums, setRecentPlayedAlbums] = useState<RecentPlayedAlbum[]>(initialHomeData.recentPlayedAlbums);
  const [historySummary, setHistorySummary] = useState<PlaybackHistorySummary | null>(initialHomeData.historySummary);
  const [stats, setStats] = useState<PlaybackStatsDashboard | null>(initialHomeData.stats);
  const historySummaryRef = useRef<PlaybackHistorySummary | null>(initialHomeData.historySummary);
  const statsRef = useRef<PlaybackStatsDashboard | null>(initialHomeData.stats);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingRandomQueue, setIsGeneratingRandomQueue] = useState(false);
  const [isRefreshingRecentActivity, setIsRefreshingRecentActivity] = useState(false);
  const [isRefreshingRecommendations, setIsRefreshingRecommendations] = useState(false);
  const [isRefreshingFavoriteAlbums, setIsRefreshingFavoriteAlbums] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentPanelMode, setRecentPanelMode] = useState<RecentPanelMode>(cachedRecentPanelMode);
  const [recentShelfPage, setRecentShelfPage] = useState(0);
  const requestIdRef = useRef(0);
  const pulseRequestIdRef = useRef(0);
  const summaryRequestIdRef = useRef(0);
  const playbackPulseRequestIdRef = useRef(0);
  const playbackPulseInFlightRef = useRef(false);
  const currentPlayedAlbumRequestIdRef = useRef(0);
  const recommendationRequestIdRef = useRef(0);
  const playbackHistoryRefreshTimerRef = useRef<number | null>(null);
  const libraryChangedRefreshCancelRef = useRef<(() => void) | null>(null);
  const libraryOnlyRefreshActiveRef = useRef(false);
  const suppressNextPlaybackPulseAfterLibraryRefreshRef = useRef(false);
  const startupPlaybackPulseActiveRef = useRef(false);
  const pendingLibraryPulseRefreshRef = useRef(false);
  const pendingPlaybackPulseRefreshRef = useRef(false);
  const pageRootRef = useRef<HTMLDivElement | null>(null);
  const pendingRestoreScrollTopRef = useRef<number | null>(null);

  const focusTrack = queue.currentTrack ?? queue.lastPlayedTrack ?? recentTracks[0] ?? (recentHistory[0] ? trackFromHistory(recentHistory[0]) : null);
  const playbackActivityState = useSharedPlaybackActivityState();
  const isPlaybackPriorityActive = isPlaybackPriorityActiveState(playbackActivityState);
  const isPlaybackPriorityBlocking = isPlaybackPriorityBlockingState(playbackActivityState);
  const homeWaveformVisualizerEnabled = useHomeWaveformVisualizerEnabled();
  const workshopVisualizerPreset = useActiveWorkshopVisualizerPreset();
  const homeHeroTitle = t('home.hero.defaultTitle');
  const topArtist = stats?.topArtists[0]?.artist ?? focusTrack?.artist ?? 'ECHO';

  useEffect(() => {
    historySummaryRef.current = historySummary;
  }, [historySummary]);

  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);

  const playTrack = useCallback(
    async (track: LibraryTrack): Promise<void> => {
      try {
        await queue.playTrack(track, {
          replaceQueueWith: recentTracks.length > 0 ? recentTracks.filter((candidate) => !candidate.unavailable) : undefined,
          source: { type: 'manual', label: 'ECHO Home' },
        });
      } catch (playError) {
        setError(playError instanceof Error ? playError.message : String(playError));
      }
    },
    [queue, recentTracks],
  );

  const generateRandomQueue = useCallback(async (): Promise<void> => {
    if (isPlaybackPriorityActive) {
      return;
    }

    const library = window.echo?.library;

    if (!library?.getTracks) {
      setError(t('home.error.desktopBridgeRandom'));
      return;
    }

    try {
      setError(null);
      setIsGeneratingRandomQueue(true);
      const result = await library.getTracks({ page: 1, pageSize: randomQueuePageSize, sort: 'random', randomWindow: true });
      const randomTracks = result.items.filter((track) => !track.unavailable);

      if (randomTracks.length === 0) {
        setError(t('queue.error.noRandomTracks'));
        return;
      }

      const currentTrack = queue.currentTrack;
      const queueTracks = currentTrack
        ? [currentTrack, ...randomTracks.filter((track) => track.id !== currentTrack.id)]
        : randomTracks;

      queue.replaceQueue(queueTracks, {
        startTrackId: currentTrack?.id,
        source: { type: 'songs', label: t('queue.randomSource'), sort: 'random' },
      });
      navigateHomeRoute('queue');
    } catch (queueError) {
      setError(queueError instanceof Error ? queueError.message : String(queueError));
    } finally {
      setIsGeneratingRandomQueue(false);
    }
  }, [isPlaybackPriorityActive, queue, t]);

  const openTrackAlbum = useCallback(async (track: LibraryTrack): Promise<void> => {
    try {
      setError(null);
      const album = await openAlbumDetailForTrack(track, { returnTo: 'home' });
      if (!album) {
        setError(t('home.error.albumNotFound', { album: track.album || t('queue.unknownAlbum') }));
      }
    } catch (navigationError) {
      setError(navigationError instanceof Error ? navigationError.message : String(navigationError));
    }
  }, [t]);

  const openTrackArtist = useCallback(async (artistName: string): Promise<void> => {
    try {
      setError(null);
      const artist = await openArtistDetailByName(artistName, { returnTo: 'home' });
      if (!artist) {
        setError(t('home.error.artistNotFound', { artist: artistName || t('queue.unknownArtist') }));
      }
    } catch (navigationError) {
      setError(navigationError instanceof Error ? navigationError.message : String(navigationError));
    }
  }, [t]);

  const rememberHomeScrollForDetailReturn = useCallback((): void => {
    pendingRestoreScrollTopRef.current = readHomeScrollTop(findHomeScrollContainer(pageRootRef.current));
  }, []);

  const openRecommendedAlbum = useCallback((album: LibraryAlbum, originTarget?: EventTarget | null): void => {
    beginAlbumCoverEnter(originTarget);
    rememberHomeScrollForDetailReturn();
    setError(null);
    void openAlbumDetail(album, { returnTo: 'home' }).catch((navigationError) => {
      cancelAlbumCoverEnter();
      setError(navigationError instanceof Error ? navigationError.message : String(navigationError));
    });
  }, [rememberHomeScrollForDetailReturn]);

  const openFavoriteAlbum = useCallback((album: PlaybackStatsAlbum, originTarget?: EventTarget | null): void => {
    beginAlbumCoverEnter(originTarget);
    rememberHomeScrollForDetailReturn();
    void (async () => {
      setError(null);
      const libraryAlbum = await resolveFavoriteAlbumTarget(album);
      if (!libraryAlbum) {
        cancelAlbumCoverEnter();
        setError(t('home.error.albumNotFound', { album: album.title || t('queue.unknownAlbum') }));
        return;
      }

      await openAlbumDetail(libraryAlbum, { returnTo: 'home' });
    })().catch((navigationError) => {
        cancelAlbumCoverEnter();
        setError(navigationError instanceof Error ? navigationError.message : String(navigationError));
    });
  }, [rememberHomeScrollForDetailReturn, t]);

  const refreshFavoriteAlbums = useCallback((): void => {
    const topAlbums = stats?.topAlbums ?? [];
    if (topAlbums.length === 0 || isRefreshingFavoriteAlbums || isPlaybackPriorityBlocking) {
      return;
    }

    void (async () => {
      setError(null);
      setIsRefreshingFavoriteAlbums(true);
      const refreshedAlbums: PlaybackStatsAlbum[] = [];

      for (const album of topAlbums) {
        const target = await resolveFavoriteAlbumTarget(album);
        if (target) {
          refreshedAlbums.push(favoriteStatsAlbumWithTarget(album, target));
        }
      }

      setStats((current) => {
        if (!current) {
          return current;
        }

        const nextStats = { ...current, topAlbums: refreshedAlbums };
        mergeCachedHomePageData({ stats: nextStats });
        return nextStats;
      });
    })().catch((refreshError) => {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    }).finally(() => {
      setIsRefreshingFavoriteAlbums(false);
    });
  }, [isPlaybackPriorityBlocking, isRefreshingFavoriteAlbums, stats?.topAlbums]);

  const changeRecentPanelMode = useCallback((mode: RecentPanelMode): void => {
    cachedRecentPanelMode = mode;
    setRecentPanelMode(mode);
  }, []);

  const refreshRecommendedAlbums = useCallback(async (): Promise<void> => {
    if (isPlaybackPriorityBlocking) {
      return;
    }

    const library = window.echo?.library;
    const requestId = recommendationRequestIdRef.current + 1;
    recommendationRequestIdRef.current = requestId;

    if (!library?.getAlbums) {
      setError(t('home.error.desktopBridgeRecommend'));
      return;
    }

    try {
      setError(null);
      setIsRefreshingRecommendations(true);
      const nextRecommendedAlbums = await loadRecommendedAlbums(library, summary.albumCount, 'random');

      if (recommendationRequestIdRef.current !== requestId) {
        return;
      }

      mergeCachedHomePageData({
        recommendedAlbums: nextRecommendedAlbums,
      });
      setRecommendedAlbums(nextRecommendedAlbums);
    } catch (loadError) {
      if (recommendationRequestIdRef.current === requestId) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
    } finally {
      if (recommendationRequestIdRef.current === requestId) {
        setIsRefreshingRecommendations(false);
      }
    }
  }, [isPlaybackPriorityBlocking, summary.albumCount, t]);

  const pushRecentPlayedAlbum = useCallback((item: RecentPlayedAlbum): void => {
    setRecentPlayedAlbums((current) => {
      const nextRecentPlayedAlbums = [item, ...current.filter((candidate) => candidate.album.id !== item.album.id)].slice(
        0,
        recentPlayedAlbumHistoryPageSize,
      );

      mergeCachedHomePageData({
        recentPlayedAlbums: nextRecentPlayedAlbums,
      });

      return nextRecentPlayedAlbums;
    });
  }, []);

  const loadPlaybackPulse = useCallback(async (): Promise<void> => {
    const library = window.echo?.library;

    if (playbackPulseInFlightRef.current) {
      return;
    }
    playbackPulseInFlightRef.current = true;

    const requestId = playbackPulseRequestIdRef.current + 1;
    playbackPulseRequestIdRef.current = requestId;

    if (!library?.getPlaybackHistory || !library.getPlaybackHistorySummary) {
      playbackPulseInFlightRef.current = false;
      return;
    }

    try {
      const historyPage = await library.getPlaybackHistory({ page: 1, pageSize: recentPlayedAlbumHistoryPageSize, sort: 'recent' });
      if (playbackPulseRequestIdRef.current !== requestId) {
        return;
      }

      const fallbackRecentPlayedAlbums = recentPlayedAlbumsFromHistory(historyPage.items);
      mergeCachedHomePageData({
        recentHistory: historyPage.items,
        recentPlayedAlbums: fallbackRecentPlayedAlbums,
      });
      setRecentHistory(historyPage.items);
      setRecentPlayedAlbums((current) => (current.length > 0 && fallbackRecentPlayedAlbums.length > 0 ? current : fallbackRecentPlayedAlbums));

      const weekQuery = startOfThisWeekQuery();
      const heatmapQuery = weeklyHeatmapQuery();
      const historySummaryPromise = library.getPlaybackHistorySummary(weekQuery);
      const activityStatsPromise = library.getPlaybackStatsDashboard(heatmapQuery);
      const leaderboardStatsPromise = !hasStatsLeaderboardContent(cachedHomePageData?.stats ?? null)
        ? library.getPlaybackStatsDashboard({})
        : Promise.resolve(null);
      const recentPlayedAlbumsPromise = loadRecentPlayedAlbums(library, historyPage.items);
      const [nextHistorySummary, nextActivityStats, nextLeaderboardStats] = await Promise.all([
        historySummaryPromise,
        activityStatsPromise,
        leaderboardStatsPromise,
      ]);

      if (playbackPulseRequestIdRef.current !== requestId) {
        return;
      }

      const currentHistorySummary = historySummaryRef.current;
      const resolvedHistorySummary = hasHistorySummaryContent(nextHistorySummary) || !hasHistorySummaryContent(currentHistorySummary)
        ? nextHistorySummary
        : currentHistorySummary;
      historySummaryRef.current = resolvedHistorySummary;
      setHistorySummary(resolvedHistorySummary);

      const currentStats = statsRef.current;
      const safeActivityStats = hasStatsContent(nextActivityStats) || !hasStatsContent(currentStats)
        ? nextActivityStats
        : null;
      setStats(() => {
        const mergedStats = mergePlaybackActivityStats(nextLeaderboardStats ?? currentStats, safeActivityStats);
        statsRef.current = mergedStats;
        mergeCachedHomePageData({
          historySummary: resolvedHistorySummary,
          stats: mergedStats,
        });
        return mergedStats;
      });

      const resolvedRecentPlayedAlbums = await recentPlayedAlbumsPromise;
      if (playbackPulseRequestIdRef.current !== requestId) {
        return;
      }

      const nextRecentPlayedAlbums = resolvedRecentPlayedAlbums.length > 0 ? resolvedRecentPlayedAlbums : fallbackRecentPlayedAlbums;
      mergeCachedHomePageData({
        recentPlayedAlbums: nextRecentPlayedAlbums,
      });
      setRecentPlayedAlbums(nextRecentPlayedAlbums);
    } catch (loadError) {
      if (playbackPulseRequestIdRef.current === requestId) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
    } finally {
      if (playbackPulseRequestIdRef.current === requestId) {
        playbackPulseInFlightRef.current = false;
      }
    }
  }, []);

  const loadLibraryPulse = useCallback(async (): Promise<void> => {
    const library = window.echo?.library;
    const requestId = pulseRequestIdRef.current + 1;
    pulseRequestIdRef.current = requestId;
    summaryRequestIdRef.current += 1;

    if (!library?.getSummary || !library.getTracks) {
      return;
    }

    try {
      const [nextSummary, tracksPage] = await Promise.all([
        library.getSummary(),
        library.getTracks({ page: 1, pageSize: recentPageSize, sort: 'recent' }),
      ]);
      const [nextRecentAddedAlbums, nextRecommendedAlbums] = await Promise.all([
        loadRecentAddedAlbums(library, nextSummary.albumCount),
        loadRecommendedAlbums(library, nextSummary.albumCount),
      ]);

      if (pulseRequestIdRef.current !== requestId) {
        return;
      }

      mergeCachedHomePageData({
        recentAddedAlbums: nextRecentAddedAlbums,
        recommendedAlbums: nextRecommendedAlbums,
        summary: nextSummary,
        recentTracks: tracksPage.items,
      });
      setRecentAddedAlbums(nextRecentAddedAlbums);
      setRecommendedAlbums(nextRecommendedAlbums);
      setSummary(nextSummary);
      setRecentTracks(tracksPage.items);
    } catch (loadError) {
      if (pulseRequestIdRef.current === requestId) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
    }
  }, []);

  const loadLibrarySummary = useCallback(async (): Promise<void> => {
    const library = window.echo?.library;
    const requestId = summaryRequestIdRef.current + 1;
    summaryRequestIdRef.current = requestId;

    if (!library?.getSummary) {
      return;
    }

    try {
      const nextSummary = await library.getSummary();
      if (summaryRequestIdRef.current !== requestId) {
        return;
      }

      mergeCachedHomePageData({ summary: nextSummary });
      setSummary(nextSummary);
    } catch {
      // The full home refresh reports bridge/database errors when playback is no longer busy.
    }
  }, []);

  const loadHome = useCallback(async (): Promise<void> => {
    const library = window.echo?.library;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    summaryRequestIdRef.current += 1;
    setIsLoading(true);
    setError(null);

    if (!library?.getSummary || !library.getTracks) {
      setSummary(emptySummary);
      setRecentAddedAlbums([]);
      setRecommendedAlbums([]);
      setRecentTracks([]);
      setError(t('home.error.desktopBridgeView'));
      setIsLoading(false);
      return;
    }

    try {
      const [nextSummary, tracksPage] = await Promise.all([
        library.getSummary(),
        library.getTracks({ page: 1, pageSize: recentPageSize, sort: 'recent' }),
      ]);
      const [nextRecentAddedAlbums, nextRecommendedAlbums] = await Promise.all([
        loadRecentAddedAlbums(library, nextSummary.albumCount),
        loadRecommendedAlbums(library, nextSummary.albumCount),
      ]);

      if (requestIdRef.current !== requestId) {
        return;
      }

      mergeCachedHomePageData({
        recentAddedAlbums: nextRecentAddedAlbums,
        recommendedAlbums: nextRecommendedAlbums,
        summary: nextSummary,
        recentTracks: tracksPage.items,
      });
      setRecentAddedAlbums(nextRecentAddedAlbums);
      setRecommendedAlbums(nextRecommendedAlbums);
      setSummary(nextSummary);
      setRecentTracks(tracksPage.items);
    } catch (loadError) {
      if (requestIdRef.current === requestId) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [t]);

  const refreshHome = useCallback(async (): Promise<void> => {
    if (isPlaybackPriorityBlocking) {
      pendingLibraryPulseRefreshRef.current = true;
      return;
    }

    setRecentShelfPage(0);
    await loadHome();
  }, [isPlaybackPriorityBlocking, loadHome]);

  const refreshRecentActivity = useCallback(async (): Promise<void> => {
    if (isRefreshingRecentActivity) {
      return;
    }

    try {
      setError(null);
      setRecentShelfPage(0);
      if (isPlaybackPriorityBlocking) {
        pendingLibraryPulseRefreshRef.current = true;
        pendingPlaybackPulseRefreshRef.current = true;
        return;
      }

      setIsRefreshingRecentActivity(true);
      await Promise.all([loadLibraryPulse(), loadPlaybackPulse()]);
    } finally {
      setIsRefreshingRecentActivity(false);
    }
  }, [isPlaybackPriorityBlocking, isRefreshingRecentActivity, loadLibraryPulse, loadPlaybackPulse]);

  useEffect(() => {
    if (!isPlaybackPriorityBlocking) {
      return;
    }

    void loadLibrarySummary();
  }, [isPlaybackPriorityBlocking, loadLibrarySummary]);

  useEffect(() => {
    const scheduleStartupPlaybackPulse = (delayMs: number): (() => void) => {
      let hasStarted = false;
      startupPlaybackPulseActiveRef.current = true;
      const cancel = scheduleHomeStartupWork(() => {
        hasStarted = true;
        void loadPlaybackPulse().finally(() => {
          startupPlaybackPulseActiveRef.current = false;
        });
      }, delayMs);

      return () => {
        cancel();
        if (!hasStarted) {
          startupPlaybackPulseActiveRef.current = false;
        }
      };
    };

    if (isPlaybackPriorityBlocking) {
      return undefined;
    }

    if (cachedHomePageData === null) {
      const cancelHomeLoad = scheduleHomeStartupWork(() => void loadHome());
      const cancelPlaybackPulse = scheduleStartupPlaybackPulse(homeInitialPlaybackPulseDelayMs);

      return () => {
        cancelHomeLoad();
        cancelPlaybackPulse();
      };
    }

    const scheduledRefreshes: Array<() => void> = [];
    if (!hasCachedLibraryPulseData(cachedHomePageData)) {
      scheduledRefreshes.push(scheduleHomeStartupWork(() => void loadLibraryPulse()));
    } else if (!hasCachedPlaybackPulseData(cachedHomePageData) && !startupPlaybackPulseActiveRef.current && !libraryOnlyRefreshActiveRef.current) {
      if (suppressNextPlaybackPulseAfterLibraryRefreshRef.current) {
        suppressNextPlaybackPulseAfterLibraryRefreshRef.current = false;
      } else {
        scheduledRefreshes.push(scheduleStartupPlaybackPulse(homeInitialPlaybackPulseDelayMs));
      }
    }
    if (scheduledRefreshes.length > 0) {
      return () => scheduledRefreshes.forEach((cancelRefresh) => cancelRefresh());
    }

    return undefined;
  }, [isPlaybackPriorityBlocking, loadHome, loadLibraryPulse, loadPlaybackPulse]);

  useEffect(() => {
    const handleLibraryChanged = (): void => {
      libraryChangedRefreshCancelRef.current?.();
      if (isPlaybackPriorityBlocking) {
        libraryChangedRefreshCancelRef.current = null;
        pendingLibraryPulseRefreshRef.current = true;
        void loadLibrarySummary();
        return;
      }

      libraryChangedRefreshCancelRef.current = scheduleHomeStartupWork(
        () => {
          libraryChangedRefreshCancelRef.current = null;
          libraryOnlyRefreshActiveRef.current = true;
          suppressNextPlaybackPulseAfterLibraryRefreshRef.current = true;
          void loadLibraryPulse().finally(() => {
            if (typeof window === 'undefined') {
              libraryOnlyRefreshActiveRef.current = false;
              return;
            }
            window.setTimeout(() => {
              libraryOnlyRefreshActiveRef.current = false;
            }, 0);
          });
        },
      );
    };

    window.addEventListener('library:changed', handleLibraryChanged);
    return () => {
      window.removeEventListener('library:changed', handleLibraryChanged);
      libraryChangedRefreshCancelRef.current?.();
      libraryChangedRefreshCancelRef.current = null;
      libraryOnlyRefreshActiveRef.current = false;
    };
  }, [isPlaybackPriorityBlocking, loadLibraryPulse, loadLibrarySummary]);

  useEffect(() => {
    if (isPlaybackPriorityBlocking) {
      return;
    }

    if (pendingLibraryPulseRefreshRef.current) {
      pendingLibraryPulseRefreshRef.current = false;
      void loadLibraryPulse();
    }
    if (pendingPlaybackPulseRefreshRef.current) {
      pendingPlaybackPulseRefreshRef.current = false;
      void loadPlaybackPulse();
    }
  }, [isPlaybackPriorityBlocking, loadLibraryPulse, loadPlaybackPulse]);

  useEffect(() => {
    const handleRestoreHomeScroll = (): void => {
      const scrollTop = pendingRestoreScrollTopRef.current;
      if (scrollTop === null) {
        return;
      }

      window.requestAnimationFrame(() => {
        writeHomeScrollTop(findHomeScrollContainer(pageRootRef.current), scrollTop);
        pendingRestoreScrollTopRef.current = null;
      });
    };

    window.addEventListener(restoreHomeScrollEvent, handleRestoreHomeScroll);
    return () => window.removeEventListener(restoreHomeScrollEvent, handleRestoreHomeScroll);
  }, []);

  useEffect(() => {
    const handlePlaybackHistoryChanged = (): void => {
      if (playbackHistoryRefreshTimerRef.current !== null) {
        window.clearTimeout(playbackHistoryRefreshTimerRef.current);
      }
      if (isPlaybackPriorityBlocking) {
        playbackHistoryRefreshTimerRef.current = null;
        pendingPlaybackPulseRefreshRef.current = true;
        return;
      }

      playbackHistoryRefreshTimerRef.current = window.setTimeout(() => {
        playbackHistoryRefreshTimerRef.current = null;
        void loadPlaybackPulse();
      }, homePlaybackHistoryRefreshDelayMs);
    };

    window.addEventListener(playbackHistoryChangedEvent, handlePlaybackHistoryChanged);
    return () => {
      window.removeEventListener(playbackHistoryChangedEvent, handlePlaybackHistoryChanged);
      if (playbackHistoryRefreshTimerRef.current !== null) {
        window.clearTimeout(playbackHistoryRefreshTimerRef.current);
        playbackHistoryRefreshTimerRef.current = null;
      }
    };
  }, [isPlaybackPriorityBlocking, loadPlaybackPulse]);

  useEffect(() => {
    const track = queue.currentTrack;
    const library = window.echo?.library;
    const requestId = currentPlayedAlbumRequestIdRef.current + 1;
    currentPlayedAlbumRequestIdRef.current = requestId;

    if (!track) {
      return;
    }

    if (track.mediaType === 'streaming') {
      return;
    }

    const fallbackAlbum: LibraryAlbum = {
      id: `current:${track.stableKey ?? track.id ?? track.path}`,
      mediaType: track.mediaType === 'remote' ? 'remote' : 'local',
      albumKey: `current:${track.stableKey ?? track.id ?? track.path}`,
      title: track.album || track.title,
      albumArtist: track.albumArtist || track.artist,
      year: track.year,
      trackCount: 1,
      duration: track.duration,
      coverId: track.coverId,
      coverThumb: track.coverThumb,
    };

    const startedAt = new Date().toISOString();

    if (!library?.getAlbumForTrack || track.isTemporary) {
      pushRecentPlayedAlbum({ album: fallbackAlbum, startedAt });
      return;
    }

    const loadCurrentPlayedAlbum = (): void => {
      void library
        .getAlbumForTrack(track.id)
        .then((album) => {
          if (currentPlayedAlbumRequestIdRef.current !== requestId) {
            return;
          }

          pushRecentPlayedAlbum({ album: album && isNonStreamingAlbum(album) ? album : fallbackAlbum, startedAt });
        })
        .catch(() => {
          if (currentPlayedAlbumRequestIdRef.current === requestId) {
            pushRecentPlayedAlbum({ album: fallbackAlbum, startedAt });
          }
        });
    };

    if (isPlaybackPriorityBlocking) {
      pushRecentPlayedAlbum({ album: fallbackAlbum, startedAt });
      return;
    }

    loadCurrentPlayedAlbum();
    return undefined;
  }, [isPlaybackPriorityBlocking, pushRecentPlayedAlbum, queue.currentTrack]);

  useEffect(() => {
    setRecentShelfPage(0);
  }, [recentPanelMode]);

  useEffect(() => {
    const itemCount = recentPanelMode === 'added' ? recentAddedAlbums.length : recentPlayedAlbums.length;
    const lastPage = Math.max(0, Math.ceil(itemCount / recentShelfPageSize) - 1);
    setRecentShelfPage((currentPage) => Math.min(currentPage, lastPage));
  }, [recentAddedAlbums.length, recentPanelMode, recentPlayedAlbums.length]);

  const pulseTiles = useMemo<MetricTileProps[]>(
    () => [
      { icon: AudioLines, label: t('home.metric.songs'), value: formatCompactNumber(summary.songCount), detail: t('home.metric.songsDetail', { duration: formatDuration(summary.totalDuration, t) }), routeId: 'songs' },
      { icon: Disc3, label: t('home.metric.albums'), value: formatCompactNumber(summary.albumCount), detail: t('home.metric.albumsDetail'), routeId: 'albums' },
      { icon: UsersRound, label: t('home.metric.artists'), value: formatCompactNumber(summary.artistCount), detail: topArtist, routeId: 'artists' },
      { icon: FolderOpen, label: t('home.metric.folders'), value: formatCompactNumber(summary.folderCount), detail: t('home.metric.foldersDetail', { date: formatShortDate(summary.lastScanAt, t, locale) }), routeId: 'folders' },
    ],
    [locale, summary, t, topArtist],
  );

  const recentHistoryActivityFallback = useMemo(() => buildRecentHistoryActivityFallback(recentHistory), [recentHistory]);
  const statsDailyActivity = stats?.dailyActivity ?? [];
  const weeklyHeatmapDays = hasDailyActivityContent(statsDailyActivity) ? statsDailyActivity : recentHistoryActivityFallback.dailyActivity;
  const weeklyDailySummary = useMemo(() => summarizeDailyActivityForCurrentWeek(weeklyHeatmapDays), [weeklyHeatmapDays]);
  const hasWeeklyHistorySummary = hasHistorySummaryContent(historySummary);
  const weeklyPlayCount = hasWeeklyHistorySummary ? (historySummary?.rangeCount ?? 0) : weeklyDailySummary.playCount;
  const weeklyDuration = hasWeeklyHistorySummary ? (historySummary?.rangePlayedSeconds ?? 0) : weeklyDailySummary.playedSeconds;
  const hasWeeklyActivity = weeklyPlayCount > 0 || weeklyDuration > 0 || hasDailyActivityContent(weeklyHeatmapDays);
  const activeRecentItemCount = recentPanelMode === 'added' ? recentAddedAlbums.length : recentPlayedAlbums.length;
  const recentTotalPages = Math.max(1, Math.ceil(activeRecentItemCount / recentShelfPageSize));
  const recentPageStart = recentShelfPage * recentShelfPageSize;
  const visibleRecentAddedAlbums = recentAddedAlbums.slice(recentPageStart, recentPageStart + recentShelfPageSize);
  const visibleRecentPlayedAlbums = recentPlayedAlbums.slice(recentPageStart, recentPageStart + recentShelfPageSize);

  return (
    <div className="home-page" ref={pageRootRef}>
      <section className="home-hero" aria-label={t('home.hero.aria')}>
        <div className="home-hero-copy">
          <span className="home-signal-label">
            <Radio size={15} />
            {t('home.hero.kicker')}
          </span>
          <h1>{homeHeroTitle}</h1>
          <p>
            {focusTrack
              ? t('home.hero.description.resume', { artist: focusTrack.artist || t('queue.unknownArtist'), title: focusTrack.title })
              : t('home.hero.description.empty')}
          </p>
          <div className="home-hero-actions">
            <button className="home-primary-action" type="button" disabled={!focusTrack} onClick={() => focusTrack && void playTrack(focusTrack)}>
              <Play size={17} fill="currentColor" />
              {t('home.hero.action.continue')}
            </button>
            <button className="home-secondary-action" type="button" onClick={() => navigateHomeRoute('queue')}>
              <ListMusic size={17} />
              {t('home.hero.action.viewQueue')}
            </button>
            <button className="home-secondary-action" type="button" disabled={isLoading || isPlaybackPriorityBlocking} onClick={() => void refreshHome()}>
              <RefreshCw size={17} />
              {isLoading ? t('home.recommend.refreshing') : t('home.recommend.refresh')}
            </button>
            <button className="home-secondary-action" type="button" disabled={summary.songCount <= 0 || isGeneratingRandomQueue || isPlaybackPriorityActive} onClick={() => void generateRandomQueue()}>
              <Shuffle size={17} />
              {isGeneratingRandomQueue ? t('queue.action.generatingRandom') : t('queue.action.generateRandom')}
            </button>
          </div>
        </div>

        <div className="home-now-card" data-empty={!focusTrack} data-signal-enabled={homeWaveformVisualizerEnabled}>
          <div className="home-now-artwork-stack">
            <Artwork coverThumb={focusTrack ? homeArtworkUrl(focusTrack, 'album') : null} title={focusTrack?.title ?? t('nowPlaying.emptyTitle')} size={132} fetchPriority="high" />
          </div>
          <div className="home-now-copy">
            <span>{queue.currentTrack ? t('home.hero.nowPlaying') : t('home.hero.recentSignal')}</span>
            <HomeNowTitle title={focusTrack?.title ?? t('nowPlaying.emptyTitle')} />
            <HomeNowMeta track={focusTrack} onOpenAlbum={(track) => void openTrackAlbum(track)} onOpenArtist={(artistName) => void openTrackArtist(artistName)} />
          </div>
          {homeWaveformVisualizerEnabled ? (
            <HomeSignalVisualizer
              seed={focusTrack?.id ?? focusTrack?.path ?? focusTrack?.title ?? 'idle'}
              preset={workshopVisualizerPreset}
            />
          ) : null}
        </div>
      </section>

      <section className="home-pulse" aria-label={t('home.hero.statsAria')}>
        <div className="home-metric-grid">
          {pulseTiles.map((tile) => (
            <MetricTile key={tile.label} {...tile} />
          ))}
        </div>
      </section>

      <section className="home-content-grid">
        <div className="home-panel home-recent-panel" data-mode={recentPanelMode}>
          <header className="home-section-header home-recent-header">
            <div className="home-recent-title-row">
              <h2>{t('home.recent.title')}</h2>
              <div className="home-segmented-control" role="tablist" aria-label={t('home.recent.tabsAria')}>
                <button type="button" role="tab" aria-selected={recentPanelMode === 'played'} data-active={recentPanelMode === 'played'} onClick={() => changeRecentPanelMode('played')}>
                  {t('home.recent.tab.played')}
                </button>
                <button type="button" role="tab" aria-selected={recentPanelMode === 'added'} data-active={recentPanelMode === 'added'} onClick={() => changeRecentPanelMode('added')}>
                  {t('home.recent.tab.added')}
                </button>
              </div>
            </div>
            <div className="home-activity-actions">
              <button
                className="home-shelf-arrow"
                type="button"
                aria-label={t('home.recent.prevPage')}
                disabled={recentShelfPage <= 0}
                onClick={() => setRecentShelfPage((page) => Math.max(0, page - 1))}
              >
                <ChevronLeft size={15} />
              </button>
              <button
                className="home-shelf-arrow"
                type="button"
                aria-label={t('home.recent.nextPage')}
                disabled={recentShelfPage >= recentTotalPages - 1}
                onClick={() => setRecentShelfPage((page) => Math.min(recentTotalPages - 1, page + 1))}
              >
                <ChevronRight size={15} />
              </button>
              <button
                className="home-shelf-arrow"
                type="button"
                aria-label={t('home.recommend.refresh')}
                disabled={isRefreshingRecentActivity || isPlaybackPriorityBlocking}
                onClick={() => void refreshRecentActivity()}
              >
                <RefreshCw size={15} className={isRefreshingRecentActivity ? 'spinning-icon' : undefined} />
              </button>
            </div>
          </header>

          {recentPanelMode === 'added' ? (
            recentAddedAlbums.length > 0 ? (
              <div className="home-cover-rail home-rail-transition" key={`added-${recentShelfPage}`}>
                {visibleRecentAddedAlbums.map((album) => (
                  <button className="home-cover-card" key={album.id} type="button" onClick={(event) => openRecommendedAlbum(album, event.currentTarget)}>
                    <Artwork coverThumb={homeArtworkUrl(album, 'album')} title={album.title} size={176} />
                    <strong>{album.title}</strong>
                    <span>{album.albumArtist || t('queue.unknownArtist')} · {t('home.count.tracks', { count: album.trackCount })}</span>
                  </button>
                ))}
              </div>
            ) : isLoading ? (
              <CoverRailSkeleton count={recentShelfPageSize} railClassName="home-cover-rail" />
            ) : (
              <div className="home-empty-panel">
                <Library size={24} />
                <strong>{t('home.recent.emptyAddedTitle')}</strong>
                <span>{t('home.recent.emptyAddedDescription')}</span>
              </div>
            )
          ) : recentPlayedAlbums.length > 0 ? (
            <div className="home-cover-rail home-played-rail home-rail-transition" key={`played-${recentShelfPage}`}>
              {visibleRecentPlayedAlbums.map((item) => (
                <button className="home-cover-card" key={item.album.id} type="button" onClick={(event) => openRecommendedAlbum(item.album, event.currentTarget)}>
                  <Artwork coverThumb={homeArtworkUrl(item.album, 'album')} title={item.album.title} size={156} />
                  <strong>{item.album.title}</strong>
                  <span>{item.album.albumArtist || t('queue.unknownArtist')} · {formatShortDate(item.startedAt, t, locale)}</span>
                </button>
              ))}
            </div>
          ) : isLoading ? (
            <CoverRailSkeleton count={recentShelfPageSize} railClassName="home-cover-rail home-played-rail" />
          ) : (
              <div className="home-empty-panel">
                <History size={24} />
                <strong>{t('home.recent.emptyPlayedTitle')}</strong>
                <span>{t('home.recent.emptyPlayedDescription')}</span>
              </div>
            )}
        </div>

        <div className="home-panel home-week-panel" data-empty={!hasWeeklyActivity}>
          <SectionHeader title={t('home.week.title')} actionLabel={t('route.history.label')} routeId="history" />
          <div className="home-week-summary">
            <div className="home-week-stat">
              <span>{t('home.week.playCount')}</span>
              <strong>{formatCompactNumber(weeklyPlayCount)}</strong>
              <small>{t('home.week.times')}</small>
            </div>
            <div className="home-week-stat">
              <span>{t('home.week.listenDuration')}</span>
              <strong>{formatDuration(weeklyDuration, t)}</strong>
            </div>
          </div>
          <WeeklyHeatmap days={weeklyHeatmapDays} />
          {!hasWeeklyActivity ? (
            <p className="home-week-hint">{t('home.week.emptyHint')}</p>
          ) : null}
        </div>
      </section>

      <section className="home-panel home-recommend-panel" data-empty={recommendedAlbums.length === 0}>
        <SectionHeader
          title={t('home.recommend.title')}
          action={
            <button type="button" disabled={isRefreshingRecommendations || summary.albumCount <= 0 || isPlaybackPriorityBlocking} onClick={() => void refreshRecommendedAlbums()}>
              <RefreshCw size={15} />
              {isRefreshingRecommendations ? t('home.recommend.refreshing') : t('home.recommend.refresh')}
            </button>
          }
        />
        {recommendedAlbums.length > 0 ? (
          <div className="home-cover-rail home-recommend-rail home-rail-transition" key={recommendedAlbums[0]?.id ?? 'recommend'}>
            {recommendedAlbums.map((album) => (
              <button className="home-cover-card" key={album.id} type="button" onClick={(event) => openRecommendedAlbum(album, event.currentTarget)}>
                <Artwork coverThumb={homeArtworkUrl(album, 'album')} title={album.title} size={176} />
                <strong>{album.title}</strong>
                <span>
                  {album.albumArtist || t('queue.unknownArtist')} · {t('home.count.tracks', { count: album.trackCount })}
                </span>
              </button>
            ))}
          </div>
        ) : isLoading ? (
          <CoverRailSkeleton count={recommendedAlbumPageSize} railClassName="home-cover-rail home-recommend-rail" />
        ) : (
          <div className="home-empty-panel home-empty-panel--compact">
            <Album size={24} />
            <strong>{t('home.recommend.emptyTitle')}</strong>
            <span>{t('home.recommend.emptyDescription')}</span>
          </div>
        )}
      </section>

      <section className="home-stats-grid" aria-label={t('home.preferences.aria')}>
        <div className="home-panel home-artist-rank-panel" data-empty={(stats?.topArtists.length ?? 0) === 0}>
          <SectionHeader title={t('home.artistLeaderboard.title')} />
          <ArtistLeaderboard artists={stats?.topArtists ?? []} onOpenArtist={(artistName) => void openTrackArtist(artistName)} />
        </div>

        <div className="home-panel home-favorite-album-panel" data-empty={(stats?.topAlbums?.length ?? 0) === 0}>
          <SectionHeader
            title={t('home.favoriteAlbums.title')}
            action={
              <button type="button" disabled={isRefreshingFavoriteAlbums || (stats?.topAlbums?.length ?? 0) === 0 || isPlaybackPriorityBlocking} onClick={refreshFavoriteAlbums}>
                <RefreshCw size={15} />
                {isRefreshingFavoriteAlbums ? t('home.recommend.refreshing') : t('home.recommend.refresh')}
              </button>
            }
          />
          <FavoriteAlbumGrid albums={stats?.topAlbums ?? []} onOpenAlbum={openFavoriteAlbum} />
        </div>
      </section>

      {error || isLoading ? (
        <p className="home-status-line" role={error ? 'alert' : 'status'}>
          {error ?? t('home.status.loading')}
        </p>
      ) : null}
    </div>
  );
};
