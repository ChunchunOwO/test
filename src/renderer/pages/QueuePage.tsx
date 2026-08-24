import { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import '../styles/queue.css';
import type {
  ChangeEvent,
  DragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  AudioLines,
  Disc3,
  FolderOpen,
  GripVertical,
  Heart,
  History,
  LocateFixed,
  MinusCircle,
  MoreHorizontal,
  Music2,
  Play,
  Repeat1,
  Repeat2,
  RotateCcw,
  Save,
  Search,
  Shuffle,
  SkipForward,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import type {
  ContinuousPlayReason,
  EditableTrackTags,
  LibraryPlaylist,
  LibraryTrack,
  PlaybackHistoryEntry,
} from '../../shared/types/library';
import type { AudioAutomixStatus, AudioPlaybackState } from '../../shared/types/audio';
import { likedChangedEvent, likedTracksChangedEvent, useLikedTrackIds } from '../hooks/useLikedMedia';
import type { QueueItem, RepeatMode } from '../stores/PlaybackQueueProvider';
import { useI18n } from '../i18n/I18nProvider';
import type { TranslationKey } from '../i18n/locales';
import { usePlaybackQueue } from '../stores/PlaybackQueueProvider';
import { matchesSearchFields } from '../utils/smartTextSearch';
import { useSharedPlaybackStatusForUi } from '../stores/playbackStatusStore';
import { openAlbumDetailForTrack } from '../utils/albumNavigation';
import { resolvePlaylistForTrackAdd } from '../utils/appPrompt';
import { localCoverDisplayUrl } from '../utils/coverDisplayUrl';
import { OsuTimingPanel } from '../components/library/OsuTimingPanel';
import { TrackContextMenu } from '../components/library/TrackContextMenu';
import type { TrackMenuAction } from '../components/library/TrackContextMenu';
import { TrackTagEditorDrawer } from '../components/library/TrackTagEditorDrawer';
import { EchoSearchFieldTools } from '../components/common/EchoSearchFieldTools';
import { getPageScrollContainer } from '../components/ui/InfiniteScrollSentinel';
import {
  EchoContinueIcon,
  EchoGaplessIcon,
  EchoSequenceIcon,
  EchoShuffleIcon,
  EchoSmartTransitionIcon,
} from '../components/player/QueueControlIcons';
import { getShufflePlaybackModeId, shufflePlaybackModeOptions } from '../playback/shufflePlaybackRules';

const automixTemporarilyDisabled = false;
const randomQueuePageSize = 96;
const locateCurrentTrackEvent = 'app:locate-current-track';
const queuePageDragItemsMime = 'application/x-echo-queue-items';
const queuePagePerfWarnThresholdMs = 120;
const queuePageFirstPaintWarnThresholdMs = 250;
const queuePageDeferredTaskDelayMs = 120;
const recommendationReasonLabel = (
  reason: ContinuousPlayReason,
  t: (key: TranslationKey, options?: Record<string, string | number>) => string,
): string => t(`queue.continuousPlay.reason.${reason.code}` as TranslationKey, { value: reason.value ?? '' });
const queuePageDeferredTaskTimeoutMs = 800;

const isQueuePageTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));

type QueuePagePerfValue = string | number | boolean | null | undefined;
type QueueTransitionMode = 'normal' | 'gapless' | 'smart';
type SmartTransitionPresentation = {
  label: string;
  tone: 'waiting' | 'preparing' | 'ready' | 'active' | 'fallback';
  title: string;
};
type QueuePageIdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

const formatQueuePagePerfValue = (value: QueuePagePerfValue): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === 'number' ? String(Math.round(value * 10) / 10) : String(value);
};

export const resolveSmartTransitionPresentation = (
  automix: AudioAutomixStatus | null | undefined,
  playbackState: AudioPlaybackState | undefined,
): SmartTransitionPresentation => {
  if (automix?.runtimeState === 'preparing') {
    return { label: '正在分析', tone: 'preparing', title: '正在分析当前歌曲和下一首的节拍、乐句与能量' };
  }
  if (automix?.runtimeState === 'committed') {
    return { label: '过渡完成', tone: 'ready', title: '音频交接已完成，当前歌曲正在正常播放' };
  }
  if (automix?.mode === 'transitioning') {
    return { label: '正在过渡', tone: 'active', title: '原生双 Deck 正在执行智能过渡' };
  }
  if (automix?.runtimeState === 'fallback' || automix?.automixBypassed) {
    return {
      label: '普通衔接',
      tone: 'fallback',
      title: `本次无法执行智能过渡${automix.automixBypassed ? `：${automix.automixBypassed}` : ''}`,
    };
  }
  if (automix?.runtimeState === 'armed') {
    const modeLabel = automix.handoffProfile === 'rhythmic_bass_swap'
      ? '低频错峰已准备'
      : automix.transitionMode === 'beat_match'
        ? '节拍对齐已准备'
        : '智能过渡已准备';
    const countdown = automix.transitionStartsInSeconds;
    const countdownLabel = typeof countdown === 'number' && Number.isFinite(countdown) && countdown > 0
      ? ` · ${Math.ceil(countdown)}s`
      : '';
    return {
      label: `${modeLabel}${countdownLabel}`,
      tone: 'ready',
      title: `已由原生音频引擎准备${automix.overlapSeconds ? `，交接 ${automix.overlapSeconds.toFixed(1)} 秒` : ''}`,
    };
  }
  return playbackState === 'playing'
    ? { label: '等待下一首', tone: 'waiting', title: '播放队列出现可用的下一首后会自动分析并准备' }
    : { label: '等待播放', tone: 'waiting', title: '开始播放后会自动分析并准备下一首' };
};

const logQueuePagePerf = (
  phase: string,
  startedAtMs: number,
  details: Record<string, QueuePagePerfValue> = {},
  options: { always?: boolean; warnThresholdMs?: number } = {},
): void => {
  const durationMs = performance.now() - startedAtMs;
  const warnThresholdMs = options.warnThresholdMs ?? queuePagePerfWarnThresholdMs;

  if (!options.always && durationMs < warnThresholdMs) {
    return;
  }

  const fields = Object.entries({ durationMs, ...details })
    .map(([key, value]) => {
      const text = formatQueuePagePerfValue(value);
      return text === null ? null : `${key}=${text}`;
    })
    .filter((value): value is string => Boolean(value));
  const message = `[queue-page-perf] ${phase}${fields.length ? ` ${fields.join(' ')}` : ''}`;

  if (durationMs >= warnThresholdMs) {
    console.warn(message);
  } else {
    console.info(message);
  }
};

const measureQueuePageWork = <T,>(
  phase: string,
  work: () => T,
  details: (result: T) => Record<string, QueuePagePerfValue> = () => ({}),
): T => {
  const startedAtMs = performance.now();
  const result = work();
  logQueuePagePerf(phase, startedAtMs, details(result));
  return result;
};

const deferQueuePageIdleTask = (callback: () => void): (() => void) => {
  const idleWindow = window as QueuePageIdleWindow;
  let didCancel = false;
  let idleHandle: number | null = null;
  let fallbackHandle: number | null = null;
  const delayHandle = window.setTimeout(() => {
    const run = (): void => {
      idleHandle = null;
      fallbackHandle = null;
      if (!didCancel) {
        callback();
      }
    };

    if (typeof idleWindow.requestIdleCallback === 'function') {
      idleHandle = idleWindow.requestIdleCallback(run, { timeout: queuePageDeferredTaskTimeoutMs });
      return;
    }

    fallbackHandle = window.setTimeout(run, 0);
  }, queuePageDeferredTaskDelayMs);

  return () => {
    didCancel = true;
    window.clearTimeout(delayHandle);
    if (idleHandle !== null && typeof idleWindow.cancelIdleCallback === 'function') {
      idleWindow.cancelIdleCallback(idleHandle);
    }
    if (fallbackHandle !== null) {
      window.clearTimeout(fallbackHandle);
    }
  };
};

const sumTrackSeconds = (items: QueueItem[]): number =>
  items.reduce(
    (total, item) =>
      total + (Number.isFinite(item.track.duration) && item.track.duration > 0 ? item.track.duration : 0),
    0,
  );

const formatQueueTotalDuration = (totalSeconds: number): string | null => {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return null;
  }

  const total = Math.round(totalSeconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) {
    return minutes > 0 ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`;
  }
  return minutes > 0 ? `${minutes} 分钟` : `${total} 秒`;
};

const formatDuration = (duration: number): string => {
  if (!Number.isFinite(duration) || duration <= 0) {
    return '--:--';
  }

  const totalSeconds = Math.round(duration);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const useQueuePlaybackClock = (
  trackId: string | null,
  fallbackDurationSeconds: number,
): { positionSeconds: number; durationSeconds: number } => {
  const { audioStatus, playbackStatus } = useSharedPlaybackStatusForUi();
  const identityMatches =
    !trackId ||
    audioStatus?.currentTrackId === trackId ||
    playbackStatus?.currentTrackId === trackId;
  const positionSeconds = identityMatches
    ? Math.max(0, audioStatus?.positionSeconds ?? (playbackStatus?.positionMs ?? 0) / 1000)
    : 0;
  const durationSeconds = identityMatches
    ? Math.max(
        0,
        audioStatus?.durationSeconds ??
          (playbackStatus?.durationMs != null ? playbackStatus.durationMs / 1000 : fallbackDurationSeconds),
      )
    : Math.max(0, fallbackDurationSeconds);
  return { positionSeconds, durationSeconds };
};

const QueueNowPlayingProgress = memo(({
  fallbackDurationSeconds,
  hasTrack,
  trackId,
}: {
  fallbackDurationSeconds: number;
  hasTrack: boolean;
  trackId: string | null;
}): JSX.Element => {
  const { durationSeconds, positionSeconds } = useQueuePlaybackClock(trackId, fallbackDurationSeconds);
  const progress = durationSeconds > 0 ? Math.min(1, positionSeconds / durationSeconds) : 0;

  return (
    <div className="queue-progress">
      <span>{formatDuration(positionSeconds)}</span>
      <div className="queue-progress-track" aria-hidden="true">
        <i style={{ width: `${progress * 100}%` }} />
      </div>
      <span>{hasTrack ? formatDuration(durationSeconds || fallbackDurationSeconds) : '--:--'}</span>
    </div>
  );
});

const QueueUpNextRemaining = memo(({
  currentQueueId,
  firstRowQueueId,
  trackId,
  upNextDurationSeconds,
}: {
  currentQueueId: string | null;
  firstRowQueueId: string | null;
  trackId: string | null;
  upNextDurationSeconds: number;
}): JSX.Element | null => {
  const { positionSeconds } = useQueuePlaybackClock(trackId, 0);
  const remainingLabel = formatQueueTotalDuration(
    Math.max(
      0,
      upNextDurationSeconds - (firstRowQueueId && firstRowQueueId === currentQueueId ? positionSeconds : 0),
    ),
  );
  return remainingLabel ? <> · 剩余 {remainingLabel}</> : null;
});

const QueueSmartTransitionStatus = memo((): JSX.Element => {
  const { audioStatus } = useSharedPlaybackStatusForUi();
  const presentation = resolveSmartTransitionPresentation(audioStatus?.automix, audioStatus?.state);
  return (
    <span
      className="queue-smart-transition-status"
      data-tone={presentation.tone}
      title={presentation.title}
      role="status"
      aria-live="polite"
    >
      <i aria-hidden="true" />
      {presentation.label}
    </span>
  );
});

const formatSampleRate = (sampleRate: number | null): string | null => {
  if (!sampleRate) {
    return null;
  }

  const khz = sampleRate / 1000;
  return sampleRate >= 1000 ? `${Number.isInteger(khz) ? khz : khz.toFixed(1)}kHz` : `${sampleRate}Hz`;
};

const formatBitrate = (bitrate: number | null): string | null => {
  if (!bitrate || !Number.isFinite(bitrate)) {
    return null;
  }

  return bitrate >= 1000000 ? `${(bitrate / 1000000).toFixed(1)}Mbps` : `${Math.round(bitrate / 1000)}kbps`;
};

const qualityTags = (track: LibraryTrack | null): string[] =>
  track
    ? [
        track.codec?.toUpperCase() ?? null,
        track.bitDepth ? `${track.bitDepth}bit` : null,
        formatSampleRate(track.sampleRate),
        formatBitrate(track.bitrate),
      ].filter((tag): tag is string => Boolean(tag))
    : [];

const queueNowCoverUrl = (track: Pick<LibraryTrack, 'coverId' | 'coverThumb'> | null): string | null =>
  localCoverDisplayUrl(track?.coverId, track?.coverThumb);

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
  duration: entry.durationSnapshot ?? entry.durationSeconds,
  codec: null,
  sampleRate: null,
  bitDepth: null,
  bitrate: null,
  coverId: entry.coverId,
  coverThumb: entry.coverSnapshot ?? entry.coverThumb,
  fieldSources: {},
});

type TrackMenuState = {
  track: LibraryTrack;
  position: { x: number; y: number };
};

type SavedQueueSnapshot = {
  id: string;
  name: string;
  createdAt: string;
  currentTrackId: string | null;
  tracks: LibraryTrack[];
};

type QueueUndoSnapshot = {
  label: string;
  items: QueueItem[];
  currentQueueId: string | null;
  currentTrackId: string | null;
  selectedQueueIds: string[];
};

type QueueActionNotice = {
  id: string;
  title: string;
  detail?: string;
  trackTitles?: string[];
  canUndo?: boolean;
};

const savedQueueStorageKey = 'echo:saved-queues';
const maxSavedQueueSnapshots = 12;
let queueActionNoticeId = 0;

const createQueueActionNotice = (
  title: string,
  options: Omit<QueueActionNotice, 'id' | 'title'> = {},
): QueueActionNotice => {
  queueActionNoticeId += 1;
  return {
    id: `queue-action-${queueActionNoticeId}`,
    title,
    ...options,
  };
};

const queueActionTrackTitles = (items: QueueItem[], limit = 4): string[] =>
  items.slice(0, limit).map((item) => item.track.title);

const queueActionTrackDetail = (
  items: QueueItem[],
  unitLabel: string,
  formatHidden?: (count: number, unit: string) => string,
): string | undefined => {
  const hiddenCount = Math.max(0, items.length - 4);
  if (hiddenCount <= 0) {
    return undefined;
  }
  return formatHidden
    ? formatHidden(hiddenCount, unitLabel)
    : `还有 ${hiddenCount} ${unitLabel}`;
};

const isSavedQueueSnapshot = (value: unknown): value is SavedQueueSnapshot => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const snapshot = value as Partial<SavedQueueSnapshot>;
  return (
    typeof snapshot.id === 'string' &&
    typeof snapshot.name === 'string' &&
    typeof snapshot.createdAt === 'string' &&
    Array.isArray(snapshot.tracks)
  );
};

const readSavedQueueSnapshots = (): SavedQueueSnapshot[] => {
  try {
    const raw = window.localStorage.getItem(savedQueueStorageKey);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isSavedQueueSnapshot).slice(0, maxSavedQueueSnapshots) : [];
  } catch {
    return [];
  }
};

const writeSavedQueueSnapshots = (snapshots: SavedQueueSnapshot[]): void => {
  try {
    window.localStorage.setItem(savedQueueStorageKey, JSON.stringify(snapshots.slice(0, maxSavedQueueSnapshots)));
  } catch {
    // Queue snapshots are convenience state only.
  }
};

const formatSavedQueueDate = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const isStreamingQueueTrack = (track: LibraryTrack): boolean =>
  track.mediaType === 'streaming' || Boolean(track.provider && track.providerTrackId);

const isRemoteQueueTrack = (track: LibraryTrack): boolean =>
  track.mediaType === 'remote' || Boolean(track.sourceId || track.remotePath || track.sourceDisplayName);

const isLocalQueueTrack = (track: LibraryTrack): boolean =>
  (track.mediaType ?? 'local') === 'local' && !isStreamingQueueTrack(track) && !isRemoteQueueTrack(track);

const buildQueuePlaylistTrackIds = (items: QueueItem[]): string[] =>
  items
    .map((item) => item.track)
    .filter((track) => track.isTemporary !== true && track.unavailable !== true && isLocalQueueTrack(track))
    .map((track) => track.id);

export const QueuePage = (): JSX.Element => {
  const { t } = useI18n();
  const queue = usePlaybackQueue();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<QueueActionNotice | null>(null);
  const [savedQueues, setSavedQueues] = useState<SavedQueueSnapshot[]>([]);
  const [isGeneratingRandomQueue, setIsGeneratingRandomQueue] = useState(false);
  const [isGeneratingHistoryQueue, setIsGeneratingHistoryQueue] = useState(false);
  const [isTransitionSettingPending, setIsTransitionSettingPending] = useState(false);
  const [isShuffleRuleSettingPending, setIsShuffleRuleSettingPending] = useState(false);
  const [isShuffleRulesOpen, setIsShuffleRulesOpen] = useState(false);
  const [isQueueActionsMenuOpen, setIsQueueActionsMenuOpen] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [queueSearchQuery, setQueueSearchQuery] = useState('');
  const [shouldLocateCurrentTrack, setShouldLocateCurrentTrack] = useState(false);
  const [selectedQueueIds, setSelectedQueueIds] = useState<Set<string>>(() => new Set());
  const [lastSelectedQueueId, setLastSelectedQueueId] = useState<string | null>(null);
  const removeAfterPlayQueueIds = useMemo(
    () => new Set(queue.items.filter((item) => item.removeAfterPlay === true).map((item) => item.queueId)),
    [queue.items],
  );
  const [undoSnapshot, setUndoSnapshot] = useState<QueueUndoSnapshot | null>(null);
  const [recentQueueIds, setRecentQueueIds] = useState<Set<string>>(() => new Set());
  const [draggedQueueIds, setDraggedQueueIds] = useState<string[]>([]);
  const [dropIndicator, setDropIndicator] = useState<{ queueId: string; position: 'before' | 'after' } | null>(null);
  const [trackMenu, setTrackMenu] = useState<TrackMenuState | null>(null);
  const [osuTimingTrack, setOsuTimingTrack] = useState<LibraryTrack | null>(null);
  const [editingTrack, setEditingTrack] = useState<LibraryTrack | null>(null);
  const [isTagEditorOpen, setIsTagEditorOpen] = useState(false);
  const [tagEditorError, setTagEditorError] = useState<string | null>(null);
  const [isSavingTags, setIsSavingTags] = useState(false);
  const queuePageRef = useRef<HTMLDivElement | null>(null);
  const queueSearchInputRef = useRef<HTMLInputElement | null>(null);
  const queueVirtualSpacerRef = useRef<HTMLDivElement | null>(null);
  const queueActionsMenuRef = useRef<HTMLDivElement | null>(null);
  const shuffleRulesRef = useRef<HTMLDivElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const scrollMarginRef = useRef(0);
  const mountStartedAtRef = useRef(performance.now());
  const tagEditorCloseTimerRef = useRef<number | null>(null);
  const recentQueueTimerRef = useRef<number | null>(null);
  const currentIndex = useMemo(
    () =>
      measureQueuePageWork(
        'computeCurrentIndex',
        () => (queue.currentQueueId ? queue.items.findIndex((item) => item.queueId === queue.currentQueueId) : -1),
        (index) => ({ currentIndex: index, items: queue.items.length }),
      ),
    [queue.currentQueueId, queue.items],
  );
  const unfilteredRows = useMemo(() => {
    return measureQueuePageWork(
      'computeRows',
      () => {
        if (queue.items.length === 0) {
          return [];
        }

        return currentIndex >= 0 ? queue.items.slice(currentIndex) : queue.items;
      },
      (computedRows) => ({ currentIndex, items: queue.items.length, rows: computedRows.length }),
    );
  }, [currentIndex, queue.items]);
  const deferredQueueSearchQuery = useDeferredValue(queueSearchQuery);
  const rows = useMemo(() => {
    const query = deferredQueueSearchQuery.trim();
    if (!query) {
      return unfilteredRows;
    }

    return unfilteredRows.filter((item) =>
      matchesSearchFields(query, [
        item.track.title,
        item.track.artist,
        item.track.album,
        item.track.albumArtist,
        item.source.label,
      ]),
    );
  }, [deferredQueueSearchQuery, unfilteredRows]);
  const queueTotalDurationLabel = useMemo(() => formatQueueTotalDuration(sumTrackSeconds(queue.items)), [queue.items]);
  const upNextDurationSeconds = useMemo(() => sumTrackSeconds(rows), [rows]);
  const selectedItems = useMemo(
    () => queue.items.filter((item) => selectedQueueIds.has(item.queueId)),
    [queue.items, selectedQueueIds],
  );
  const selectedCount = selectedItems.length;
  const selectedQueueIdList = useMemo(() => selectedItems.map((item) => item.queueId), [selectedItems]);
  const areAllRowsSelected = rows.length > 0 && rows.every((item) => selectedQueueIds.has(item.queueId));
  const canMoveSelectedAfterCurrent = selectedItems.some((item) => item.queueId !== queue.currentQueueId);
  const selectedRemoveAfterPlayCount = selectedItems.filter((item) => removeAfterPlayQueueIds.has(item.queueId)).length;
  const shouldUnmarkSelectedAfterPlay = selectedCount > 0 && selectedRemoveAfterPlayCount === selectedCount;
  const isRowSelectionVisible = isSelectionMode && rows.length > 0;
  const isSelectionBarVisible = selectedCount > 0;
  const nowPlaying = queue.currentTrack;
  const isNowPlayingTemporary = nowPlaying?.isTemporary === true;
  const nowPlayingTags = qualityTags(nowPlaying);
  const nowPlayingCoverUrl = queueNowCoverUrl(nowPlaying);
  const sourceLabel = queue.currentItem?.source.label ?? t('queue.now.sourceFallback');
  const queueMenuSource = useMemo(() => ({ type: 'manual' as const, label: t('queue.header.title') }), [t]);
  const nextQueuePreview = useMemo(() => {
    if (queue.repeatMode === 'one' && nowPlaying) {
      return {
        kind: 'repeat-one',
        title: nowPlaying.title,
        detail: t('queue.nextPreview.repeatOneDetail'),
        track: nowPlaying,
        queueItemId: queue.currentQueueId,
      };
    }

    if (queue.isShuffleEnabled) {
      return {
        kind: 'shuffle',
        title: t('queue.nextPreview.shuffleTitle'),
        detail: t('queue.nextPreview.shuffleDetail', {
          scope: queue.shuffleScopeLabel,
          count: queue.playbackShuffleAvoidRecentCount,
        }),
        track: null,
        queueItemId: null,
      };
    }

    const nextItem = currentIndex >= 0
      ? queue.items[currentIndex + 1] ?? (queue.repeatMode === 'all' && queue.items.length > 1 ? queue.items[0] : null)
      : queue.items[0] ?? null;

    if (!nextItem) {
      return {
        kind: 'empty',
        title: t('queue.nextPreview.empty'),
        track: null,
        queueItemId: null,
      };
    }

    return {
      kind: 'track',
      title: nextItem.track.title,
      detail: t('queue.nextPreview.trackDetail', {
        artist: nextItem.track.artist || nextItem.track.albumArtist || t('queue.unknownArtist'),
        source: nextItem.source.label,
      }),
      track: nextItem.track,
      queueItemId: nextItem.queueId,
    };
  }, [
    currentIndex,
    nowPlaying,
    queue.currentQueueId,
    queue.isShuffleEnabled,
    queue.items,
    queue.playbackShuffleAvoidRecentCount,
    queue.repeatMode,
    queue.shuffleScopeLabel,
    t,
  ]);
  const nextQueueCoverUrl = queueNowCoverUrl(nextQueuePreview.track);
  const transitionMode: QueueTransitionMode = queue.automixEnabled
    ? 'smart'
    : queue.gaplessPlaybackEnabled
      ? 'gapless'
      : 'normal';
  const shufflePlaybackModeId = getShufflePlaybackModeId(queue.playbackShuffleAvoidRecentCount);
  const shufflePlaybackMode = shufflePlaybackModeOptions.find((option) => option.id === shufflePlaybackModeId)
    ?? shufflePlaybackModeOptions[1];

  useEffect(() => {
    if (!isQueueActionsMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent): void => {
      if (!queueActionsMenuRef.current?.contains(event.target as Node)) {
        setIsQueueActionsMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isQueueActionsMenuOpen]);

  useEffect(() => {
    if (!isShuffleRulesOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent): void => {
      if (!shuffleRulesRef.current?.contains(event.target as Node)) {
        setIsShuffleRulesOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isShuffleRulesOpen]);
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => getPageScrollContainer(queueVirtualSpacerRef.current),
    estimateSize: () => 64,
    overscan: 12,
    scrollMargin,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const firstPaintDetailsRef = useRef<Record<string, QueuePagePerfValue>>({});
  firstPaintDetailsRef.current = {
    items: queue.items.length,
    rows: rows.length,
    savedQueues: savedQueues.length,
    virtualRows: virtualRows.length,
  };
  const likedTrackIdsInput = useMemo(
    () =>
      measureQueuePageWork(
        'computeLikedTrackIdsInput',
        () => {
          const ids = new Set<string>();

          if (nowPlaying && !isNowPlayingTemporary) {
            ids.add(nowPlaying.id);
          }

          if (trackMenu && !trackMenu.track.isTemporary) {
            ids.add(trackMenu.track.id);
          }

          for (const virtualRow of virtualRows) {
            const track = rows[virtualRow.index]?.track;
            if (track && !track.isTemporary) {
              ids.add(track.id);
            }
          }

          return Array.from(ids);
        },
        (ids) => ({ ids: ids.length, rows: rows.length, virtualRows: virtualRows.length }),
      ),
    [isNowPlayingTemporary, nowPlaying, rows, trackMenu, virtualRows],
  );
  const likedTrackIds = useLikedTrackIds(likedTrackIdsInput);
  const isNowPlayingLiked = nowPlaying && !isNowPlayingTemporary ? likedTrackIds[nowPlaying.id] === true : false;

  useLayoutEffect(() => {
    const calculateScrollMargin = (): void => {
      const spacer = queueVirtualSpacerRef.current;
      const scrollContainer = getPageScrollContainer(spacer);

      if (!spacer || !scrollContainer) {
        if (scrollMarginRef.current !== 0) {
          scrollMarginRef.current = 0;
          setScrollMargin(0);
        }
        return;
      }

      const spacerRect = spacer.getBoundingClientRect();
      const containerRect = scrollContainer.getBoundingClientRect();
      const nextScrollMargin = Math.max(0, Math.round(spacerRect.top - containerRect.top + scrollContainer.scrollTop));
      if (scrollMarginRef.current !== nextScrollMargin) {
        scrollMarginRef.current = nextScrollMargin;
        setScrollMargin(nextScrollMargin);
      }
    };

    calculateScrollMargin();
    window.addEventListener('resize', calculateScrollMargin);
    return () => window.removeEventListener('resize', calculateScrollMargin);
  }, [rows.length, savedQueues.length]);

  useEffect(() => {
    return deferQueuePageIdleTask(() => {
      const startedAtMs = performance.now();
      const snapshots = readSavedQueueSnapshots();
      setSavedQueues(snapshots);
      logQueuePagePerf('loadSavedQueues', startedAtMs, { snapshots: snapshots.length }, { always: snapshots.length > 0 });
    });
  }, []);

  useEffect(() => {
    return () => {
      if (recentQueueTimerRef.current !== null) {
        window.clearTimeout(recentQueueTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const logFirstPaint = (): void => {
      logQueuePagePerf(
        'firstPaint',
        mountStartedAtRef.current,
        firstPaintDetailsRef.current,
        { always: true, warnThresholdMs: queuePageFirstPaintWarnThresholdMs },
      );
    };

    if (typeof window.requestAnimationFrame === 'function') {
      const frameId = window.requestAnimationFrame(logFirstPaint);
      return () => window.cancelAnimationFrame(frameId);
    }

    const timeoutId = window.setTimeout(logFirstPaint, 16);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    const handleLocateCurrentTrack = (): void => {
      setQueueSearchQuery('');
      setShouldLocateCurrentTrack(true);
    };

    window.addEventListener(locateCurrentTrackEvent, handleLocateCurrentTrack);
    return () => window.removeEventListener(locateCurrentTrackEvent, handleLocateCurrentTrack);
  }, []);

  useEffect(() => {
    if (!shouldLocateCurrentTrack) {
      return;
    }

    if (queueSearchQuery !== deferredQueueSearchQuery) {
      // The filtered rows still reflect the previous search text; wait for them to settle.
      return;
    }

    const currentRowIndex = rows.findIndex((item) =>
      queue.currentQueueId ? item.queueId === queue.currentQueueId : item.track.id === queue.currentTrackId,
    );
    if (currentRowIndex < 0) {
      setShouldLocateCurrentTrack(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      rowVirtualizer.scrollToIndex(currentRowIndex, { align: 'center' });
      setShouldLocateCurrentTrack(false);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [deferredQueueSearchQuery, queue.currentQueueId, queue.currentTrackId, queueSearchQuery, rowVirtualizer, rows, shouldLocateCurrentTrack]);

  useEffect(() => {
    const validQueueIds = new Set(queue.items.map((item) => item.queueId));

    setSelectedQueueIds((current) => {
      const next = new Set(Array.from(current).filter((queueId) => validQueueIds.has(queueId)));
      return next.size === current.size ? current : next;
    });
  }, [queue.items]);

  useEffect(() => {
    if (rows.length === 0 && isSelectionMode) {
      setIsSelectionMode(false);
    }
  }, [isSelectionMode, rows.length]);

  const repeatLabels: Record<RepeatMode, string> = useMemo(
    () => ({
      off: t('queue.repeat.off'),
      one: t('queue.repeat.one'),
      all: t('queue.repeat.all'),
    }),
    [t],
  );

  const flashQueueItems = useCallback((queueIds: string[]): void => {
    if (recentQueueTimerRef.current !== null) {
      window.clearTimeout(recentQueueTimerRef.current);
      recentQueueTimerRef.current = null;
    }

    const nextIds = Array.from(new Set(queueIds));
    if (nextIds.length === 0) {
      setRecentQueueIds(new Set());
      return;
    }

    setRecentQueueIds(new Set(nextIds));
    recentQueueTimerRef.current = window.setTimeout(() => {
      setRecentQueueIds(new Set());
      recentQueueTimerRef.current = null;
    }, 1400);
  }, []);

  const runQueueAction = useCallback(async (action: () => Promise<unknown> | unknown): Promise<void> => {
    try {
      setActionError(null);
      setActionNotice(null);
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const updateSavedQueues = useCallback((updater: (current: SavedQueueSnapshot[]) => SavedQueueSnapshot[]): void => {
    setSavedQueues((current) => {
      const next = updater(current).slice(0, maxSavedQueueSnapshots);
      writeSavedQueueSnapshots(next);
      return next;
    });
  }, []);

  const handleSetTransitionMode = useCallback((mode: QueueTransitionMode): void => {
    if (mode === transitionMode || isTransitionSettingPending) {
      return;
    }

    setActionError(null);
    setIsTransitionSettingPending(true);
    void (async () => {
      if (mode === 'normal') {
        if (queue.gaplessPlaybackEnabled) {
          await queue.setGaplessPlaybackEnabled(false);
        }
        if (queue.automixEnabled) {
          queue.setAutomixEnabled(false);
        }
        return;
      }

      if (mode === 'gapless') {
        if (!queue.gaplessPlaybackEnabled) {
          await queue.setGaplessPlaybackEnabled(true);
        }
        if (queue.automixEnabled) {
          queue.setAutomixEnabled(false);
        }
        return;
      }

      if (queue.gaplessPlaybackEnabled) {
        await queue.setGaplessPlaybackEnabled(false);
      }
      if (!queue.automixEnabled) {
        queue.setAutomixEnabled(true);
      }
    })()
      .catch((error) => {
        setActionError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        setIsTransitionSettingPending(false);
      });
  }, [isTransitionSettingPending, queue, transitionMode]);

  const handleSaveQueueSnapshot = useCallback((): void => {
    if (queue.items.length === 0) {
      setActionError(t('queue.page.error.emptySave'));
      return;
    }

    const createdAt = new Date().toISOString();
    const name = nowPlaying?.title
      ? t('queue.page.saved.nameWithTitle', { title: nowPlaying.title, count: queue.items.length })
      : t('queue.page.saved.nameQueue', { date: formatSavedQueueDate(createdAt) });
    const snapshot: SavedQueueSnapshot = {
      id: `queue-${Date.now()}`,
      name,
      createdAt,
      currentTrackId: queue.currentTrackId,
      tracks: queue.items.map((item) => item.track),
    };

    updateSavedQueues((current) => [snapshot, ...current]);
    setActionError(null);
    setActionNotice(createQueueActionNotice(t('queue.page.notice.savedQueue'), { detail: name }));
  }, [nowPlaying?.title, queue.currentTrackId, queue.items, t, updateSavedQueues]);

  const handleRestoreSavedQueue = useCallback(
    (snapshot: SavedQueueSnapshot): void => {
      if (snapshot.tracks.length === 0) {
        setActionError(t('queue.page.error.emptySnapshot'));
        return;
      }

      setSelectedQueueIds(new Set());
      setLastSelectedQueueId(null);
      setIsSelectionMode(false);
      queue.replaceQueue(snapshot.tracks, {
        startTrackId: snapshot.currentTrackId ?? snapshot.tracks[0]?.id,
        source: { type: 'manual', label: t('queue.page.saved.sourceLabel', { name: snapshot.name }) },
      });
      setActionError(null);
      setActionNotice(createQueueActionNotice(t('queue.page.notice.restoredQueue'), { detail: snapshot.name }));
    },
    [queue, t],
  );

  const handleDeleteSavedQueue = useCallback(
    (snapshotId: string): void => {
      updateSavedQueues((current) => current.filter((snapshot) => snapshot.id !== snapshotId));
      setActionError(null);
      setActionNotice(createQueueActionNotice(t('queue.page.notice.deletedSnapshot')));
    },
    [t, updateSavedQueues],
  );

  const captureQueueUndo = useCallback(
    (label: string): void => {
      setUndoSnapshot({
        label,
        items: queue.items,
        currentQueueId: queue.currentQueueId,
        currentTrackId: queue.currentTrackId,
        selectedQueueIds: Array.from(selectedQueueIds),
      });
    },
    [queue.currentQueueId, queue.currentTrackId, queue.items, selectedQueueIds],
  );

  const handleUndoQueueAction = useCallback((): void => {
    if (!undoSnapshot) {
      return;
    }

    queue.restoreQueueItems(undoSnapshot.items, {
      currentQueueId: undoSnapshot.currentQueueId,
      currentTrackId: undoSnapshot.currentTrackId,
    });
    setSelectedQueueIds(new Set(undoSnapshot.selectedQueueIds));
    setIsSelectionMode(undoSnapshot.selectedQueueIds.length > 0);
    setUndoSnapshot(null);
    setActionError(null);
    flashQueueItems(undoSnapshot.selectedQueueIds.length > 0 ? undoSnapshot.selectedQueueIds : undoSnapshot.items.map((item) => item.queueId));
    setActionNotice(createQueueActionNotice(t('queue.page.notice.undone'), { detail: undoSnapshot.label }));
  }, [flashQueueItems, queue, t, undoSnapshot]);

  const handleToggleVisibleSelection = useCallback((): void => {
    if (!isRowSelectionVisible) {
      return;
    }

    setSelectedQueueIds((current) => {
      const next = new Set(current);
      if (areAllRowsSelected) {
        rows.forEach((item) => next.delete(item.queueId));
      } else {
        rows.forEach((item) => next.add(item.queueId));
      }
      return next;
    });
    setLastSelectedQueueId(null);
  }, [areAllRowsSelected, isRowSelectionVisible, rows]);

  const handleToggleSelectionMode = useCallback((): void => {
    if (isSelectionMode) {
      setSelectedQueueIds(new Set());
      setLastSelectedQueueId(null);
      setIsSelectionMode(false);
      return;
    }

    setIsSelectionMode(true);
  }, [isSelectionMode]);

  const handleSelectAllVisibleRows = useCallback((): void => {
    if (rows.length === 0) {
      return;
    }

    setIsSelectionMode(true);
    setSelectedQueueIds(new Set(rows.map((item) => item.queueId)));
    setLastSelectedQueueId(rows[rows.length - 1]?.queueId ?? null);
  }, [rows]);

  const handleToggleQueueSelection = useCallback(
    (event: ChangeEvent<HTMLInputElement>, item: QueueItem): void => {
      const checked = event.currentTarget.checked;
      const shiftKey = (event.nativeEvent as globalThis.MouseEvent).shiftKey === true;

      setSelectedQueueIds((current) => {
        const next = new Set(current);
        const rowIds = rows.map((row) => row.queueId);
        const lastIndex = lastSelectedQueueId ? rowIds.indexOf(lastSelectedQueueId) : -1;
        const currentIndex = rowIds.indexOf(item.queueId);

        if (shiftKey && lastIndex >= 0 && currentIndex >= 0) {
          const [start, end] = lastIndex < currentIndex ? [lastIndex, currentIndex] : [currentIndex, lastIndex];
          for (const queueId of rowIds.slice(start, end + 1)) {
            if (checked) {
              next.add(queueId);
            } else {
              next.delete(queueId);
            }
          }
        } else if (checked) {
          next.add(item.queueId);
        } else {
          next.delete(item.queueId);
        }

        return next;
      });
      setLastSelectedQueueId(item.queueId);
    },
    [lastSelectedQueueId, rows],
  );

  const handleQueueRowSelect = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>, item: QueueItem): void => {
      const target = event.target as HTMLElement;
      if (target.closest('button, input, label, a')) {
        return;
      }

      const modifierSelect = event.shiftKey || event.ctrlKey || event.metaKey;
      if (!isRowSelectionVisible && !modifierSelect) {
        return;
      }

      event.preventDefault();
      if (!isSelectionMode) {
        setIsSelectionMode(true);
      }

      const checked = !selectedQueueIds.has(item.queueId);
      const rowIds = rows.map((row) => row.queueId);
      setSelectedQueueIds((current) => {
        const next = new Set(current);
        const lastIndex = lastSelectedQueueId ? rowIds.indexOf(lastSelectedQueueId) : -1;
        const currentIndex = rowIds.indexOf(item.queueId);

        if (event.shiftKey && lastIndex >= 0 && currentIndex >= 0) {
          const [start, end] = lastIndex < currentIndex ? [lastIndex, currentIndex] : [currentIndex, lastIndex];
          for (const queueId of rowIds.slice(start, end + 1)) {
            if (checked) {
              next.add(queueId);
            } else {
              next.delete(queueId);
            }
          }
        } else if (checked) {
          next.add(item.queueId);
        } else {
          next.delete(item.queueId);
        }

        return next;
      });
      setLastSelectedQueueId(item.queueId);
    },
    [isRowSelectionVisible, isSelectionMode, lastSelectedQueueId, rows, selectedQueueIds],
  );

  const handleClearSelection = useCallback((): void => {
    setSelectedQueueIds(new Set());
    setLastSelectedQueueId(null);
    setIsSelectionMode(false);
  }, []);

  const handleDismissActionNotice = useCallback((): void => {
    setActionNotice(null);
  }, []);

  const handleClearQueue = useCallback((): void => {
    if (queue.items.length === 0) {
      return;
    }

    if (!window.confirm(t('queue.confirm.clear', { count: queue.items.length }))) {
      return;
    }

    const removedItems = queue.items;
    const hiddenDetail = queueActionTrackDetail(removedItems, t('queue.page.unit.tracks'), (count, unit) =>
      t('queue.page.notice.hiddenMore', { count, unit }),
    );
    captureQueueUndo(t('queue.page.undo.clear', { count: removedItems.length }));
    queue.clearQueue();
    setSelectedQueueIds(new Set());
    setLastSelectedQueueId(null);
    setIsSelectionMode(false);
    setActionError(null);
    setActionNotice(createQueueActionNotice(t('queue.page.notice.clearedCount', { count: removedItems.length }), {
      detail: hiddenDetail ?? t('queue.page.notice.canUndo'),
      trackTitles: queueActionTrackTitles(removedItems),
      canUndo: true,
    }));
  }, [captureQueueUndo, queue, t]);

  const handleRemoveSelected = useCallback((): void => {
    if (selectedCount === 0) {
      return;
    }

    const removedItems = selectedItems;
    const hiddenDetail = queueActionTrackDetail(removedItems, t('queue.page.unit.tracks'), (count, unit) =>
      t('queue.page.notice.hiddenMore', { count, unit }),
    );
    captureQueueUndo(t('queue.page.undo.removeCount', { count: selectedCount }));
    queue.removeQueueItems(selectedQueueIdList);
    setSelectedQueueIds(new Set());
    setLastSelectedQueueId(null);
    setIsSelectionMode(false);
    setActionError(null);
    setActionNotice(createQueueActionNotice(t('queue.page.notice.removedCount', { count: selectedCount }), {
      detail: hiddenDetail ?? t('queue.page.notice.canUndo'),
      trackTitles: queueActionTrackTitles(removedItems),
      canUndo: true,
    }));
  }, [captureQueueUndo, queue, selectedCount, selectedItems, selectedQueueIdList, t]);

  const handlePlaySelectedNow = useCallback((): void => {
    const firstSelected = selectedItems[0];
    if (!firstSelected) {
      return;
    }

    void runQueueAction(() => queue.playQueueItem(firstSelected.queueId));
  }, [queue, runQueueAction, selectedItems]);

  const handleToggleSelectedRemoveAfterPlay = useCallback((): void => {
    if (selectedCount === 0) {
      return;
    }

    queue.setQueueItemsRemoveAfterPlay(selectedQueueIdList, !shouldUnmarkSelectedAfterPlay);
    flashQueueItems(selectedQueueIdList);
    setActionError(null);
    setActionNotice(createQueueActionNotice(
      shouldUnmarkSelectedAfterPlay
        ? t('queue.page.notice.unmarkedAfterPlay')
        : t('queue.page.notice.markedAfterPlay', { count: selectedCount }),
      {
        detail: queueActionTrackDetail(selectedItems, t('queue.page.unit.tracks'), (count, unit) =>
          t('queue.page.notice.hiddenMore', { count, unit }),
        ),
        trackTitles: queueActionTrackTitles(selectedItems),
      },
    ));
  }, [flashQueueItems, queue, selectedCount, selectedItems, selectedQueueIdList, shouldUnmarkSelectedAfterPlay, t]);

  const handleMoveSelectedAfterCurrent = useCallback((): void => {
    if (selectedCount === 0 || !canMoveSelectedAfterCurrent) {
      return;
    }

    const movedItems = selectedItems;
    const hiddenDetail = queueActionTrackDetail(movedItems, t('queue.page.unit.tracks'), (count, unit) =>
      t('queue.page.notice.hiddenMore', { count, unit }),
    );
    captureQueueUndo(t('queue.page.undo.moveCount', { count: selectedCount }));
    queue.moveQueueItemsAfterCurrent(selectedQueueIdList);
    setSelectedQueueIds(new Set());
    setLastSelectedQueueId(null);
    setIsSelectionMode(false);
    flashQueueItems(selectedQueueIdList);
    setActionError(null);
    setActionNotice(createQueueActionNotice(t('queue.page.notice.movedCount', { count: selectedCount }), {
      detail: hiddenDetail ?? t('queue.page.notice.movedAfterCurrent'),
      trackTitles: queueActionTrackTitles(movedItems),
      canUndo: true,
    }));
  }, [canMoveSelectedAfterCurrent, captureQueueUndo, flashQueueItems, queue, selectedCount, selectedItems, selectedQueueIdList, t]);

  const handleSaveQueueAsPlaylist = useCallback(async (): Promise<void> => {
    const library = window.echo?.library;
    if (!library?.createPlaylist || !library.addTracksToPlaylist) {
      setActionError(t('queue.page.error.bridgePlaylist'));
      return;
    }

    const trackIds = buildQueuePlaylistTrackIds(queue.items);

    if (trackIds.length === 0) {
      setActionError(t('queue.page.error.noLibraryTracks'));
      return;
    }

    let createdPlaylistId: string | null = null;
    try {
      setActionError(null);
      setActionNotice(null);
      const playlist = await library.createPlaylist({
        name: t('queue.page.saved.nameQueue', { date: formatSavedQueueDate(new Date().toISOString()) }),
        description: t('queue.page.playlist.description'),
      });
      createdPlaylistId = playlist.id;
      const items = await library.addTracksToPlaylist(playlist.id, trackIds);
      const savedCount = items.length;

      if (savedCount === 0) {
        throw new Error(t('queue.page.error.noneWritten'));
      }

      window.dispatchEvent(new Event('library:playlists-changed'));
      setActionNotice(createQueueActionNotice(t('queue.page.notice.savedPlaylist'), {
        detail: t('queue.page.notice.savedPlaylistDetail', { name: playlist.name, count: savedCount }),
      }));
    } catch (error) {
      if (createdPlaylistId && library.deletePlaylist) {
        await library.deletePlaylist(createdPlaylistId).catch(() => undefined);
      }
      setActionError(error instanceof Error ? error.message : String(error));
    }
  }, [queue.items, t]);

  const handleOpenCurrentFolder = useCallback((): void => {
    if (!nowPlaying) {
      return;
    }

    void runQueueAction(() =>
      nowPlaying.isTemporary
        ? window.echo?.library?.openPathInFolder?.(nowPlaying.path)
        : window.echo?.library?.openTrackInFolder(nowPlaying.id),
    );
  }, [nowPlaying, runQueueAction]);

  const handleToggleNowPlayingLiked = useCallback((): void => {
    if (!nowPlaying || nowPlaying.isTemporary) {
      return;
    }

    void runQueueAction(async () => {
      await window.echo?.library?.toggleTrackLiked(nowPlaying.id);
      window.dispatchEvent(new Event(likedTracksChangedEvent));
      window.dispatchEvent(new Event(likedChangedEvent));
    });
  }, [nowPlaying, runQueueAction]);

  const handleOpenTrackMenu = useCallback((track: LibraryTrack, position: { x: number; y: number }): void => {
    setTrackMenu({ track, position });
  }, []);

  const handleTrackContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLElement>, track: LibraryTrack): void => {
      event.preventDefault();
      event.stopPropagation();
      handleOpenTrackMenu(track, { x: event.clientX, y: event.clientY });
    },
    [handleOpenTrackMenu],
  );

  const handleNowPlayingMoreClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>): void => {
      if (!nowPlaying) {
        return;
      }

      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      handleOpenTrackMenu(nowPlaying, { x: rect.right - 12, y: rect.bottom + 8 });
    },
    [handleOpenTrackMenu, nowPlaying],
  );

  const closeTagEditor = useCallback((): void => {
    setIsTagEditorOpen(false);
    if (tagEditorCloseTimerRef.current !== null) {
      window.clearTimeout(tagEditorCloseTimerRef.current);
    }
    tagEditorCloseTimerRef.current = window.setTimeout(() => {
      setEditingTrack(null);
      tagEditorCloseTimerRef.current = null;
    }, 280);
  }, []);

  const handleSaveTags = useCallback(
    async (
      track: LibraryTrack,
      tags: EditableTrackTags,
      coverPath: string | null,
      coverUrl: string | null,
      coverMimeType: string | null,
    ): Promise<void> => {
      const library = window.echo?.library;

      if (!library?.updateTrackTags) {
        setTagEditorError('Desktop bridge unavailable. Open ECHO in Electron to edit embedded tags.');
        return;
      }

      setIsSavingTags(true);
      setTagEditorError(null);

      try {
        const updatedTrack = await library.updateTrackTags({ trackId: track.id, tags, coverPath, coverUrl, coverMimeType });
        queue.updateTrackSnapshot(updatedTrack.id, updatedTrack);
        window.dispatchEvent(new Event('library:changed'));
        closeTagEditor();
      } catch (saveError) {
        setTagEditorError(saveError instanceof Error ? saveError.message : String(saveError));
      } finally {
        setIsSavingTags(false);
      }
    },
    [closeTagEditor, queue],
  );

  const handleTrackMenuAction = useCallback(
    async (action: TrackMenuAction, track: LibraryTrack, playlistTarget?: LibraryPlaylist): Promise<void> => {
      const library = window.echo?.library;
      setTrackMenu(null);

      if (action === 'clear-lyrics-cache') {
        const lyricsApi = window.echo?.lyrics;
        if (!lyricsApi?.clearCache) {
          setActionError('Desktop bridge unavailable. Open ECHO in Electron to clear lyrics cache.');
          return;
        }

        try {
          setActionError(null);
          await lyricsApi.clearCache(track.id);
          window.dispatchEvent(new CustomEvent('lyrics:rematch-requested', { detail: { trackId: track.id } }));
        } catch (actionError) {
          setActionError(actionError instanceof Error ? actionError.message : String(actionError));
        }
        return;
      }

      if (!library && action !== 'play-next' && action !== 'add-to-queue' && action !== 'remove-from-queue' && action !== 'open-osu-timing' && action !== 'reload-embedded-tags') {
        setActionError('Desktop bridge unavailable. Open ECHO in Electron to use file actions.');
        return;
      }

      try {
        setActionError(null);

        if (
          (track.mediaType === 'remote' || track.isTemporary) &&
          (action === 'edit-tags' ||
            action === 'reload-embedded-tags' ||
            action === 'open-osu-timing' ||
            action === 'copy-path' ||
            action === 'open-system' ||
            action === 'copy-cover' ||
            action === 'save-cover' ||
            action === 'delete-song')
        ) {
          setActionError('This queued item does not support library file actions.');
          return;
        }

        switch (action) {
          case 'play-next':
            captureQueueUndo(t('queue.notice.addedToNext'));
            queue.playTrackNext(track, queueMenuSource);
            setActionNotice(createQueueActionNotice(t('queue.notice.addedToNext'), {
              detail: t('queue.notice.nextDetail'),
              trackTitles: [track.title],
              canUndo: true,
            }));
            return;
          case 'add-to-queue':
            captureQueueUndo(t('queue.notice.addedToTail'));
            queue.appendToQueue(track, queueMenuSource);
            setActionNotice(createQueueActionNotice(t('queue.notice.addedToTail'), {
              detail: t('queue.notice.tailDetail'),
              trackTitles: [track.title],
              canUndo: true,
            }));
            return;
          case 'toggle-liked':
            if (track.isTemporary) {
              setActionError('Temporary local files cannot be liked until they are imported.');
              return;
            }
            await library?.toggleTrackLiked(track.id);
            window.dispatchEvent(new Event(likedTracksChangedEvent));
            window.dispatchEvent(new Event(likedChangedEvent));
            return;
          case 'remove-from-queue':
            {
              const matchingItems = queue.items.filter((item) => item.track.id === track.id);
              if (matchingItems.length === 0) {
                return;
              }
              captureQueueUndo(`移除 ${track.title}`);
              const removedCount = queue.removeTrackFromQueue(track.id);
              setActionNotice(createQueueActionNotice(t('queue.notice.removedMatches', { count: removedCount }), {
                trackTitles: queueActionTrackTitles(matchingItems),
                canUndo: true,
              }));
            }
            return;
          case 'open-osu-timing':
            setOsuTimingTrack(track);
            return;
          case 'edit-tags':
            setTagEditorError(null);
            if (tagEditorCloseTimerRef.current !== null) {
              window.clearTimeout(tagEditorCloseTimerRef.current);
              tagEditorCloseTimerRef.current = null;
            }
            setIsTagEditorOpen(false);
            setEditingTrack(track);
            window.requestAnimationFrame(() => setIsTagEditorOpen(true));
            return;
          case 'reload-embedded-tags':
            {
              const result = await library!.loadEmbeddedTrackTags(track.id);
              queue.updateTrackSnapshot(result.track.id, result.track);
              if (editingTrack?.id === result.track.id) {
                setEditingTrack(result.track);
              }
              setActionError(null);
              window.dispatchEvent(new Event('library:changed'));
            }
            return;
          case 'go-to-album':
            if (!(await openAlbumDetailForTrack(track, { returnTo: 'queue' }))) {
              setActionError(`Album not found: ${track.album || 'Unknown Album'}`);
            }
            return;
          case 'show-in-folder':
            if (track.isTemporary) {
              await library?.openPathInFolder?.(track.path);
              return;
            }
            await library?.openTrackInFolder(track.id);
            return;
          case 'copy-path':
            await library?.copyTrackPath(track.id);
            return;
          case 'open-system':
            await library?.openTrackWithSystem(track.id);
            return;
          case 'copy-name-artist':
            await library?.copyTrackNameArtist(track.id);
            return;
          case 'copy-cover':
            if (!(await library?.copyTrackCover(track.id))) {
              setActionError('This track does not have cover art to copy.');
            }
            return;
          case 'save-cover':
            if (!(await library?.saveTrackCover(track.id))) {
              setActionError('No cover art was saved for this track.');
            }
            return;
          case 'delete-song': {
              if (!window.confirm(`Delete the music file?\n${track.title}`)) {
                return;
              }
              const result = await library?.deleteTrackFile(track.id);
              for (const removedTrackId of result?.removedTrackIds ?? [track.id]) {
                queue.removeTrackFromQueue(removedTrackId);
              }
              window.dispatchEvent(new Event('library:changed'));
              return;
            }
          case 'add-to-playlist':
            {
              if (track.mediaType === 'streaming') {
                setActionError(t('queue.page.error.streamingPlaylist'));
                return;
              }

              const playlist = playlistTarget ?? (await resolvePlaylistForTrackAdd(library!));
              if (!playlist) {
                return;
              }

              await library!.addTrackToPlaylist(playlist.id, track.id);
              window.dispatchEvent(new Event('library:playlists-changed'));
            }
            return;
          default:
            setActionError('This track action is not available yet.');
        }
      } catch (actionError) {
        setActionError(actionError instanceof Error ? actionError.message : String(actionError));
      }
    },
    [captureQueueUndo, editingTrack, queue, queueMenuSource, t],
  );

  const handleGenerateRandomQueue = useCallback(async (): Promise<void> => {
    const library = window.echo?.library;

    if (!library) {
      setActionError(t('queue.error.desktopBridge'));
      return;
    }

    setIsGeneratingRandomQueue(true);
    setActionError(null);

    try {
      const result = await library.getTracks({
        page: 1,
        pageSize: randomQueuePageSize,
        sort: 'random',
        randomWindow: true,
      });

      if (result.items.length === 0) {
        setActionError(t('queue.error.noRandomTracks'));
        return;
      }

      setSelectedQueueIds(new Set());
      setLastSelectedQueueId(null);
      setIsSelectionMode(false);
      queue.replaceQueue(result.items, {
        source: { type: 'songs', label: t('queue.randomSource'), sort: 'random' },
      });
      queue.setRepeatMode('off');
      if (queue.isShuffleEnabled) {
        queue.toggleShuffle();
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsGeneratingRandomQueue(false);
    }
  }, [queue, t]);

  const handleSetShuffleRule = useCallback(async (avoidRecentCount: number): Promise<void> => {
    if (isShuffleRuleSettingPending || avoidRecentCount === queue.playbackShuffleAvoidRecentCount) {
      return;
    }

    setIsShuffleRuleSettingPending(true);
    setActionError(null);
    try {
      await queue.setShuffleAvoidRecentCount(avoidRecentCount);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsShuffleRuleSettingPending(false);
    }
  }, [isShuffleRuleSettingPending, queue]);

  const handleGenerateHistoryQueue = useCallback(async (): Promise<void> => {
    const library = window.echo?.library;

    if (!library) {
      setActionError(t('queue.error.desktopBridge'));
      return;
    }

    setIsGeneratingHistoryQueue(true);
    setActionError(null);

    try {
      const result = await library.getPlaybackHistory({
        page: 1,
        pageSize: 500,
      });
      const tracks = result.items.map(trackFromHistory);

      if (tracks.length === 0) {
        setActionError(t('queue.error.noHistoryTracks'));
        return;
      }

      setSelectedQueueIds(new Set());
      setLastSelectedQueueId(null);
      setIsSelectionMode(false);
      queue.replaceQueue(tracks, {
        source: { type: 'manual', label: t('queue.historySource') },
      });
      queue.setRepeatMode('off');
      if (queue.isShuffleEnabled) {
        queue.toggleShuffle();
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsGeneratingHistoryQueue(false);
    }
  }, [queue, t]);

  const handleDragStart = useCallback(
    (event: DragEvent<HTMLElement>, item: QueueItem): void => {
      const queueIds = selectedQueueIds.has(item.queueId) && selectedCount > 1
        ? selectedQueueIdList
        : [item.queueId];
      setDraggedQueueIds(queueIds);
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData(queuePageDragItemsMime, JSON.stringify(queueIds));
      event.dataTransfer.setData('text/plain', item.queueId);
    },
    [selectedCount, selectedQueueIdList, selectedQueueIds],
  );

  const resolveDropPosition = (event: DragEvent<HTMLDivElement>): 'before' | 'after' => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
  };

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>, item: QueueItem): void => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const position = resolveDropPosition(event);
    setDropIndicator((current) =>
      current?.queueId === item.queueId && current.position === position
        ? current
        : { queueId: item.queueId, position },
    );
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>, targetItem: QueueItem): void => {
      event.preventDefault();
      const dropPosition = resolveDropPosition(event);
      const serializedQueueIds = event.dataTransfer.getData(queuePageDragItemsMime);
      const fallbackQueueId = event.dataTransfer.getData('text/plain');
      let sourceQueueIds: string[] = draggedQueueIds;

      if (serializedQueueIds) {
        try {
          const parsed = JSON.parse(serializedQueueIds) as unknown;
          if (Array.isArray(parsed)) {
            sourceQueueIds = parsed.filter((queueId): queueId is string => typeof queueId === 'string');
          }
        } catch {
          sourceQueueIds = [];
        }
      }

      if (sourceQueueIds.length === 0 && fallbackQueueId) {
        sourceQueueIds = [fallbackQueueId];
      }

      setDraggedQueueIds([]);
      setDropIndicator(null);

      const movableQueueIds = Array.from(new Set(sourceQueueIds)).filter((queueId) =>
        queue.items.some((item) => item.queueId === queueId),
      );

      if (movableQueueIds.length === 0 || movableQueueIds.includes(targetItem.queueId)) {
        return;
      }

      const targetIndex = queue.items.findIndex((item) => item.queueId === targetItem.queueId);

      if (targetIndex < 0) {
        return;
      }

      const toIndex = dropPosition === 'after' ? targetIndex + 1 : targetIndex;

      const movedItems = queue.items.filter((item) => movableQueueIds.includes(item.queueId));
      captureQueueUndo(t('queue.page.undo.moveCount', { count: movableQueueIds.length }));
      queue.moveQueueItemsToIndex(movableQueueIds, toIndex);
      flashQueueItems(movableQueueIds);
      setActionError(null);
      setActionNotice(createQueueActionNotice(t('queue.page.notice.movedCount', { count: movableQueueIds.length }), {
        detail: queueActionTrackDetail(movedItems, t('queue.page.unit.tracks'), (count, unit) =>
          t('queue.page.notice.hiddenMore', { count, unit }),
        ),
        trackTitles: queueActionTrackTitles(movedItems),
        canUndo: true,
      }));
    },
    [captureQueueUndo, draggedQueueIds, flashQueueItems, queue, t],
  );

  const handleDragEnd = useCallback((): void => {
    setDraggedQueueIds([]);
    setDropIndicator(null);
  }, []);

  const handleKeyboardQueueMove = useCallback(
    (item: QueueItem, direction: 'up' | 'down' | 'next'): void => {
      const fromIndex = queue.items.findIndex((candidate) => candidate.queueId === item.queueId);
      if (fromIndex < 0) {
        return;
      }

      if (direction === 'up' && fromIndex === 0) {
        return;
      }
      if (direction === 'down' && fromIndex === queue.items.length - 1) {
        return;
      }
      if (direction === 'next' && item.queueId === queue.currentQueueId) {
        return;
      }

      captureQueueUndo(t('queue.page.undo.moveCount', { count: 1 }));
      if (direction === 'next') {
        queue.moveQueueItemsAfterCurrent([item.queueId]);
      } else {
        queue.moveQueueItem(fromIndex, direction === 'up' ? fromIndex - 1 : fromIndex + 1);
      }
      flashQueueItems([item.queueId]);
      setActionError(null);
      setActionNotice(createQueueActionNotice('已调整队列顺序', {
        detail: direction === 'up'
          ? `已上移《${item.track.title}》`
          : direction === 'down'
            ? `已下移《${item.track.title}》`
            : t('queue.page.notice.movedAfterCurrent'),
        trackTitles: [item.track.title],
        canUndo: true,
      }));
    },
    [captureQueueUndo, flashQueueItems, queue, t],
  );

  const handleQueueMoveKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, item: QueueItem): void => {
      if (!event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      const key = event.key.toLocaleLowerCase();
      const direction = key === 'arrowup'
        ? 'up'
        : key === 'arrowdown'
          ? 'down'
          : key === 'n'
            ? 'next'
            : null;
      if (!direction) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      handleKeyboardQueueMove(item, direction);
    },
    [handleKeyboardQueueMove],
  );

  useEffect(() => {
    const handleQueuePageKeyDown = (event: KeyboardEvent): void => {
      const key = event.key.toLocaleLowerCase();
      const commandKey = event.ctrlKey || event.metaKey;
      const typing = isQueuePageTypingTarget(event.target);
      const targetNode = event.target instanceof Node ? event.target : null;
      const insideQueue = Boolean(targetNode && queuePageRef.current?.contains(targetNode));
      const focusOnShell =
        !(event.target instanceof HTMLElement)
        || event.target === document.body
        || event.target === document.documentElement;

      if (event.key === 'Escape') {
        if (isQueueActionsMenuOpen) {
          event.preventDefault();
          setIsQueueActionsMenuOpen(false);
          return;
        }
        if (isShuffleRulesOpen) {
          event.preventDefault();
          setIsShuffleRulesOpen(false);
          return;
        }
        if (!insideQueue && !focusOnShell) {
          return;
        }
        if (queueSearchQuery) {
          event.preventDefault();
          setQueueSearchQuery('');
          return;
        }
        if (isSelectionMode) {
          event.preventDefault();
          handleClearSelection();
        }
        return;
      }

      if (commandKey && key === 'f' && !event.altKey && (!typing || event.target === queueSearchInputRef.current)) {
        event.preventDefault();
        queueSearchInputRef.current?.focus();
        queueSearchInputRef.current?.select();
        return;
      }

      if (key === '/' && !commandKey && !event.altKey && !typing) {
        event.preventDefault();
        queueSearchInputRef.current?.focus();
        return;
      }

      if (commandKey && key === 'z' && !event.altKey && !event.shiftKey && !typing && undoSnapshot) {
        event.preventDefault();
        handleUndoQueueAction();
        return;
      }

      if (commandKey && key === 'a' && !event.altKey && !typing && (insideQueue || focusOnShell) && rows.length > 0) {
        event.preventDefault();
        handleSelectAllVisibleRows();
      }
    };

    window.addEventListener('keydown', handleQueuePageKeyDown);
    return () => window.removeEventListener('keydown', handleQueuePageKeyDown);
  }, [
    handleClearSelection,
    handleSelectAllVisibleRows,
    handleUndoQueueAction,
    isQueueActionsMenuOpen,
    isSelectionMode,
    isShuffleRulesOpen,
    queueSearchQuery,
    rows.length,
    undoSnapshot,
  ]);

  return (
    <div className="queue-page" ref={queuePageRef}>
      <section className="queue-session-hero">
        {nowPlayingCoverUrl || nextQueueCoverUrl ? (
          <div className="queue-session-backdrop" aria-hidden="true">
            <div className="queue-session-backdrop-pane queue-session-backdrop-current">
              {nowPlayingCoverUrl ? <img alt="" src={nowPlayingCoverUrl} /> : null}
            </div>
            <div className="queue-session-backdrop-pane queue-session-backdrop-next">
              {nextQueueCoverUrl ? <img alt="" src={nextQueueCoverUrl} /> : null}
            </div>
          </div>
        ) : null}

        <header className="queue-page-header">
          <h1>{t('queue.header.title')}</h1>
          <span className="queue-count">
            {t('queue.count', { count: queue.items.length })}
            {queueTotalDurationLabel ? ` · ${queueTotalDurationLabel}` : ''}
          </span>
        </header>

        <section className="queue-now-card" aria-label={t('queue.now.kicker')}>
          <div className="queue-now-cover" data-empty={!nowPlayingCoverUrl}>
            {nowPlayingCoverUrl ? <img alt="" src={nowPlayingCoverUrl} /> : <Disc3 size={54} />}
          </div>

          <div className="queue-now-main">
            <span className="queue-kicker">{t('queue.now.kicker')}</span>
            <h2>{nowPlaying?.title ?? t('queue.now.emptyTitle')}</h2>
            <p>{nowPlaying ? nowPlaying.artist || t('queue.unknownArtist') : t('queue.now.emptyDescription')}</p>

            <div className="queue-quality-row" aria-label={t('queue.now.quality')}>
              {nowPlayingTags.length > 0 ? nowPlayingTags.map((tag) => <span key={tag}>{tag}</span>) : <span>{t('queue.now.waitingAudio')}</span>}
              <span className="queue-now-source">{sourceLabel}</span>
            </div>

            <QueueNowPlayingProgress
              fallbackDurationSeconds={nowPlaying?.duration ?? 0}
              hasTrack={Boolean(nowPlaying)}
              trackId={nowPlaying?.id ?? null}
            />

            <div className="queue-now-actions" aria-label={t('queue.now.actions')}>
              <button
                className={`queue-icon-button ${isNowPlayingLiked ? 'is-liked' : ''}`}
                type="button"
                aria-label={t('queue.action.like')}
                aria-pressed={isNowPlayingLiked}
                title={t('queue.action.like')}
                disabled={!nowPlaying || isNowPlayingTemporary}
                onClick={handleToggleNowPlayingLiked}
              >
                <Heart size={17} fill={isNowPlayingLiked ? 'currentColor' : 'none'} />
              </button>
              <button className="queue-icon-button" type="button" aria-label={t('queue.action.openFolder')} title={t('queue.action.openFolder')} disabled={!nowPlaying} onClick={handleOpenCurrentFolder}>
                <FolderOpen size={17} />
              </button>
              <button className="queue-icon-button" type="button" aria-label={t('queue.action.more')} title={t('queue.action.more')} disabled={!nowPlaying} onClick={handleNowPlayingMoreClick}>
                <MoreHorizontal size={18} />
              </button>
            </div>
          </div>

          <div className="queue-next-preview" data-kind={nextQueuePreview.kind} aria-label={t('queue.nextPreview.kicker')}>
            <span className="queue-next-arrow" aria-hidden="true"><ArrowRight size={18} strokeWidth={1.8} /></span>
            <div className="queue-next-cover" data-empty={!nextQueueCoverUrl}>
              {nextQueueCoverUrl ? <img alt="" src={nextQueueCoverUrl} /> : <Disc3 size={28} />}
            </div>
            <div className="queue-next-copy">
              <span>{t('queue.nextPreview.kicker')}</span>
              <strong>{nextQueuePreview.title}</strong>
              {nextQueuePreview.detail ? <small>{nextQueuePreview.detail}</small> : null}
              {nextQueuePreview.track ? <small>{formatDuration(nextQueuePreview.track.duration)}</small> : null}
            </div>
            {nextQueuePreview.kind === 'track' && nextQueuePreview.queueItemId ? (
              <button
                className="queue-next-play-button"
                type="button"
                aria-label={`立即播放 ${nextQueuePreview.title}`}
                title="跳过当前，立即播放下一首"
                onClick={() => {
                  const queueItemId = nextQueuePreview.queueItemId;
                  if (queueItemId) {
                    void runQueueAction(() => queue.playQueueItem(queueItemId));
                  }
                }}
              >
                <Play size={16} fill="currentColor" />
              </button>
            ) : null}
          </div>

        </section>
      </section>

      <section className="queue-control-dock" aria-label={t('queue.tools')}>
        <div className="queue-playback-strategy">
          <span className="queue-control-label">播放策略</span>
          <div className="queue-strategy-groups">
            <div className="queue-order-segment" role="group" aria-label="播放顺序">
              <button className={!queue.isShuffleEnabled ? 'is-active' : ''} type="button" aria-pressed={!queue.isShuffleEnabled} onClick={() => queue.isShuffleEnabled && queue.toggleShuffle()}>
                <EchoSequenceIcon size={17} />
                顺序
              </button>
              <button className={queue.isShuffleEnabled ? 'is-active' : ''} type="button" aria-pressed={queue.isShuffleEnabled} onClick={() => !queue.isShuffleEnabled && queue.toggleShuffle()}>
                <EchoShuffleIcon size={17} />
                随机
              </button>
            </div>
            <div className="queue-shuffle-rules" ref={shuffleRulesRef}>
              <button
                className="queue-shuffle-rules-trigger"
                type="button"
                aria-label={t('settings.playback.shuffleCredibility.title')}
                aria-expanded={isShuffleRulesOpen}
                aria-haspopup="dialog"
                title={`${t('settings.playback.shuffleCredibility.title')}：${t(shufflePlaybackMode.labelKey)}`}
                onClick={() => setIsShuffleRulesOpen((open) => !open)}
              >
                <SlidersHorizontal size={16} />
              </button>
              {isShuffleRulesOpen ? (
                <div
                  className="queue-shuffle-rules-popover"
                  role="dialog"
                  aria-label={t('settings.playback.shuffleCredibility.title')}
                >
                  <div className="queue-shuffle-rules-heading">
                    <strong>{t('settings.playback.shuffleCredibility.title')}</strong>
                    <span>{t(shufflePlaybackMode.labelKey)}</span>
                  </div>
                  <p>{t('settings.playback.shuffleCredibility.description')}</p>
                  <div
                    className="queue-shuffle-rule-options"
                    role="radiogroup"
                    aria-label={t('settings.playback.shuffleCredibility.title')}
                    aria-busy={isShuffleRuleSettingPending}
                  >
                    {shufflePlaybackModeOptions.map((option) => (
                      <button
                        key={option.id}
                        className={shufflePlaybackModeId === option.id ? 'is-active' : ''}
                        type="button"
                        role="radio"
                        aria-checked={shufflePlaybackModeId === option.id}
                        disabled={isShuffleRuleSettingPending || !window.echo?.app?.setSettings}
                        onClick={() => void handleSetShuffleRule(option.avoidRecentCount)}
                      >
                        <span>
                          <strong>{t(option.labelKey)}</strong>
                          <small>{t(option.descriptionKey)}</small>
                        </span>
                        <i aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                  <div className="queue-shuffle-rules-summary">
                    <span>
                      {queue.playbackShuffleAvoidRecentCount > 0
                        ? t('queue.nextPreview.shuffleDetail', {
                            scope: queue.shuffleScopeLabel,
                            count: queue.playbackShuffleAvoidRecentCount,
                          })
                        : `${queue.shuffleScopeLabel} · ${t('settings.playback.shuffleCredibility.off')}`}
                    </span>
                    <button
                      type="button"
                      disabled={isGeneratingRandomQueue}
                      onClick={() => {
                        setIsShuffleRulesOpen(false);
                        void handleGenerateRandomQueue();
                      }}
                    >
                      <Shuffle size={14} />
                      {isGeneratingRandomQueue ? t('queue.action.generatingRandom') : t('queue.action.generateRandom')}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            <span className="queue-strategy-separator" aria-hidden="true" />
            <div className="queue-order-segment queue-repeat-segment" role="group" aria-label={t('queue.repeat.mode')}>
              {(['off', 'one', 'all'] as RepeatMode[]).map((mode) => (
                <button
                  className={queue.repeatMode === mode ? 'is-active' : ''}
                  key={mode}
                  type="button"
                  aria-pressed={queue.repeatMode === mode}
                  onClick={() => queue.setRepeatMode(mode)}
                >
                  {mode === 'off' ? <MinusCircle size={15} /> : mode === 'one' ? <Repeat1 size={15} /> : <Repeat2 size={15} />}
                  {repeatLabels[mode]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <span className="queue-control-divider" aria-hidden="true" />

        <div className="queue-continuous-control">
          <span className="queue-control-label">队列补充</span>
          <button
            className="queue-feature-switch"
            type="button"
            role="switch"
            aria-checked={queue.autoFillQueueEnabled}
            onClick={() => queue.setAutoFillQueueEnabled(!queue.autoFillQueueEnabled)}
          >
            <span className="queue-feature-icon"><EchoContinueIcon size={20} /></span>
            <span className="queue-feature-copy">
              <strong>{t('queue.continuousPlay.toggle')}</strong>
              <small>{queue.isContinuousPlayFilling ? t('queue.continuousPlay.filling') : '基于本机音乐库继续推荐'}</small>
            </span>
            <span className="queue-switch-track" data-enabled={queue.autoFillQueueEnabled}><i /></span>
          </button>
        </div>

        <div className="queue-transition-control">
          <span className="queue-control-label">衔接方式</span>
          <div className="queue-transition-stack">
            <div className="queue-transition-segment" role="radiogroup" aria-label="歌曲衔接方式" aria-busy={isTransitionSettingPending}>
            <button
              className={transitionMode === 'normal' ? 'is-active' : ''}
              type="button"
              role="radio"
              aria-checked={transitionMode === 'normal'}
              disabled={isTransitionSettingPending || (queue.gaplessPlaybackEnabled && !window.echo?.app?.setSettings)}
              onClick={() => handleSetTransitionMode('normal')}
            >
              <AudioLines size={17} />
              普通
            </button>
            <button
              className={transitionMode === 'gapless' ? 'is-active' : ''}
              type="button"
              role="radio"
              aria-checked={transitionMode === 'gapless'}
              aria-description="符合条件的本地同专辑相邻曲目将在 1 倍速下无缝衔接"
              disabled={isTransitionSettingPending || !window.echo?.app?.setSettings}
              onClick={() => handleSetTransitionMode('gapless')}
            >
              <EchoGaplessIcon size={17} />
              无缝
            </button>
            <button
              className={transitionMode === 'smart' ? 'is-active' : ''}
              type="button"
              role="radio"
              aria-checked={transitionMode === 'smart'}
              disabled={automixTemporarilyDisabled || isTransitionSettingPending || (queue.gaplessPlaybackEnabled && !window.echo?.app?.setSettings)}
              onClick={() => handleSetTransitionMode('smart')}
            >
              <EchoSmartTransitionIcon size={17} />
              智能
            </button>
            </div>
            {transitionMode === 'smart' ? <QueueSmartTransitionStatus /> : null}
          </div>
        </div>

        <div className="queue-actions-menu queue-management-menu" ref={queueActionsMenuRef}>
          <button
            className={`queue-tool-button ${isQueueActionsMenuOpen ? 'is-active' : ''}`}
            type="button"
            aria-expanded={isQueueActionsMenuOpen}
            aria-haspopup="menu"
            onClick={() => setIsQueueActionsMenuOpen((open) => !open)}
          >
            <MoreHorizontal size={17} />
            队列管理
          </button>
          {isQueueActionsMenuOpen ? (
            <div className="queue-actions-popover" role="menu">
              <button type="button" role="menuitem" disabled={queue.items.length === 0} onClick={() => { setIsQueueActionsMenuOpen(false); handleSaveQueueSnapshot(); }}>
                <Save size={16} />
                保存当前队列
              </button>
              {savedQueues.length > 0 ? (
                <div className="queue-actions-restore">
                  <span>{t('queue.page.saved.heading')}</span>
                  {savedQueues.slice(0, 4).map((snapshot) => (
                    <button
                      type="button"
                      role="menuitem"
                      key={snapshot.id}
                      title={snapshot.name}
                      onClick={() => {
                        setIsQueueActionsMenuOpen(false);
                        handleRestoreSavedQueue(snapshot);
                      }}
                    >
                      <RotateCcw size={16} />
                      <span>{t('queue.page.saved.restore')} · {snapshot.name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <button type="button" role="menuitem" disabled>
                  <RotateCcw size={16} />
                  恢复最近队列
                </button>
              )}
              <button type="button" role="menuitem" disabled={isGeneratingRandomQueue} onClick={() => { setIsQueueActionsMenuOpen(false); void handleGenerateRandomQueue(); }}>
                <Shuffle size={16} />
                {isGeneratingRandomQueue ? t('queue.action.generatingRandom') : t('queue.action.generateRandom')}
              </button>
              <button type="button" role="menuitem" disabled={isGeneratingHistoryQueue} onClick={() => { setIsQueueActionsMenuOpen(false); void handleGenerateHistoryQueue(); }}>
                <History size={16} />
                {isGeneratingHistoryQueue ? t('queue.action.generatingHistory') : t('queue.action.generateFromHistory')}
              </button>
              <button type="button" role="menuitem" disabled={queue.items.length === 0} onClick={() => { setIsQueueActionsMenuOpen(false); void handleSaveQueueAsPlaylist(); }}>
                <Music2 size={16} />
                保存为歌单
              </button>
              {selectedCount > 0 ? (
                <button type="button" role="menuitem" onClick={() => { setIsQueueActionsMenuOpen(false); handleToggleSelectedRemoveAfterPlay(); }}>
                  <Trash2 size={16} />
                  {shouldUnmarkSelectedAfterPlay ? t('queue.page.selection.clearAfterPlay') : t('queue.page.selection.markAfterPlay')}
                </button>
              ) : null}
              <button className="danger" type="button" role="menuitem" disabled={queue.items.length === 0} onClick={() => { setIsQueueActionsMenuOpen(false); handleClearQueue(); }}>
                <Trash2 size={16} />
                {t('queue.action.clear')}
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {actionNotice ? (
        <section className="queue-action-receipt" aria-live="polite" key={actionNotice.id}>
          <div className="queue-action-receipt__copy">
            <span>{t('queue.page.receipt.justDone')}</span>
            <strong>{actionNotice.title}</strong>
            {actionNotice.detail ? <p>{actionNotice.detail}</p> : null}
            {actionNotice.trackTitles && actionNotice.trackTitles.length > 0 ? (
              <div className="queue-action-receipt__tracks" aria-label={t('queue.page.receipt.affectedTracks')}>
                {actionNotice.trackTitles.map((title, index) => (
                  <em key={`${title}-${index}`}>{title}</em>
                ))}
              </div>
            ) : null}
          </div>
          <div className="queue-action-receipt__actions">
            {actionNotice.canUndo && undoSnapshot ? (
              <button className="queue-tool-button queue-undo-button" type="button" onClick={handleUndoQueueAction}>
                <RotateCcw size={16} />
                {t('queue.page.receipt.undoThis')}
              </button>
            ) : null}
            <button className="queue-icon-button" type="button" aria-label={t('queue.page.receipt.closeAria')} title={t('queue.page.receipt.close')} onClick={handleDismissActionNotice}>
              <X size={15} />
            </button>
          </div>
        </section>
      ) : null}

      {savedQueues.length > 0 ? (
        <section className="queue-saved-panel" aria-label={t('queue.page.saved.aria')}>
          <div className="queue-section-heading">
            <div>
              <span className="queue-kicker">Saved Queues</span>
              <h2>{t('queue.page.saved.heading')}</h2>
            </div>
            <span>{t('queue.page.saved.snapshotCount', { count: savedQueues.length })}</span>
          </div>
          <div className="queue-saved-list">
            {savedQueues.slice(0, 4).map((snapshot) => (
              <article className="queue-saved-item" key={snapshot.id}>
                <div>
                  <strong>{snapshot.name}</strong>
                  <span>{t('queue.page.saved.trackMeta', { count: snapshot.tracks.length, date: formatSavedQueueDate(snapshot.createdAt) })}</span>
                </div>
                <button className="queue-tool-button" type="button" onClick={() => handleRestoreSavedQueue(snapshot)}>
                  <RotateCcw size={15} />
                  {t('queue.page.saved.restore')}
                </button>
                <button className="queue-icon-button danger" type="button" aria-label={t('queue.page.saved.deleteAria', { name: snapshot.name })} title={t('queue.page.saved.deleteTitle')} onClick={() => handleDeleteSavedQueue(snapshot.id)}>
                  <X size={15} />
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="queue-list-section" aria-label={t('queue.upNext.kicker')}>
        <div className="queue-section-heading">
          <div>
            <h2>{t('queue.upNext.title')}</h2>
            <span aria-live="polite">
              {queueSearchQuery
                ? `${rows.length} / ${unfilteredRows.length} 首`
                : <>
                    {t('queue.count', { count: unfilteredRows.length })}
                    <QueueUpNextRemaining
                      currentQueueId={queue.currentQueueId}
                      firstRowQueueId={rows[0]?.queueId ?? null}
                      trackId={nowPlaying?.id ?? null}
                      upNextDurationSeconds={upNextDurationSeconds}
                    />
                  </>}
            </span>
          </div>
          <div className="queue-list-heading-actions">
            <div className="queue-list-query-tools">
              <label className="queue-search-field echo-search-surface">
                <Search size={15} aria-hidden="true" />
                <input
                  ref={queueSearchInputRef}
                  type="search"
                  value={queueSearchQuery}
                  aria-label="搜索队列"
                  aria-keyshortcuts="Control+F Meta+F"
                  placeholder={t('songs.search.placeholder')}
                  onChange={(event) => setQueueSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape' && queueSearchQuery) {
                      event.stopPropagation();
                      setQueueSearchQuery('');
                    }
                  }}
                />
                {queueSearchQuery ? (
                  <EchoSearchFieldTools
                    clearLabel={t('common.search.clear')}
                    count={`${rows.length} / ${unfilteredRows.length}`}
                    onClear={() => setQueueSearchQuery('')}
                  />
                ) : null}
              </label>
              <button
                className="queue-tool-button queue-locate-button"
                type="button"
                disabled={!queue.currentQueueId && !queue.currentTrackId}
                onClick={() => {
                  setQueueSearchQuery('');
                  setShouldLocateCurrentTrack(true);
                }}
              >
                <LocateFixed size={15} />
                定位当前播放
              </button>
              {isSelectionBarVisible ? null : (
                <span className="queue-keyboard-hint">Alt+↑/↓ 调整顺序，Alt+N 移到下一首，Ctrl+点击多选</span>
              )}
            </div>
            <section className="queue-selection-bar" data-visible={isSelectionBarVisible ? 'true' : 'false'} aria-label={t('queue.page.selection.aria')}>
              <strong>{t('queue.page.selection.selectedCount', { count: selectedCount })}</strong>
              <button className="queue-tool-button queue-selection-primary" type="button" disabled={selectedCount === 0} onClick={handlePlaySelectedNow}>
                <Play size={15} fill="currentColor" />
                立即播放
              </button>
              <button className="queue-tool-button" type="button" disabled={selectedCount === 0 || !canMoveSelectedAfterCurrent} onClick={handleMoveSelectedAfterCurrent}>
                <SkipForward size={15} />
                下一首播放
              </button>
              <button className="queue-tool-button" type="button" disabled={selectedCount === 0} onClick={handleToggleSelectedRemoveAfterPlay}>
                <MinusCircle size={15} />
                {shouldUnmarkSelectedAfterPlay ? t('queue.page.selection.clearAfterPlay') : t('queue.page.selection.markAfterPlay')}
              </button>
              <button className="queue-tool-button danger" type="button" disabled={selectedCount === 0} onClick={handleRemoveSelected}>
                <Trash2 size={15} />
                移出队列
              </button>
              <button className="queue-icon-button" type="button" aria-label={t('queue.page.action.clearSelection')} onClick={handleClearSelection}>
                <X size={15} />
              </button>
            </section>
            {isSelectionMode ? (
              <button className="queue-tool-button queue-select-trigger" type="button" disabled={rows.length === 0} onClick={handleToggleVisibleSelection}>
                {areAllRowsSelected ? t('queue.page.selection.deselectList') : t('queue.page.selection.selectAll')}
              </button>
            ) : null}
            <button
              className="queue-tool-button queue-select-trigger"
              type="button"
              disabled={rows.length === 0}
              title="Ctrl 或 Shift 点击列表也可多选"
              aria-pressed={isSelectionMode}
              onClick={handleToggleSelectionMode}
            >
              {isSelectionMode ? t('queue.page.selection.done') : t('queue.page.selection.select')}
            </button>
          </div>
        </div>

        {rows.length > 0 ? (
          <div className="queue-list" role="list" data-virtualized="true" aria-label={t('queue.upNext.title')}>
            <div
              className="queue-list-columns"
              data-selection-mode={isRowSelectionVisible ? 'true' : undefined}
              aria-hidden="true"
            >
              <span className="queue-list-column-title">标题 / 艺术家</span>
              <span className="queue-list-column-quality">音质</span>
              <span className="queue-list-column-source">来源</span>
              <span className="queue-list-column-duration">时长</span>
            </div>
            <div className="queue-virtual-spacer" ref={queueVirtualSpacerRef} style={{ height: rowVirtualizer.getTotalSize() }}>
              {virtualRows.map((virtualRow) => {
                const item = rows[virtualRow.index];
                const isCurrent = item.queueId === queue.currentQueueId;
                const isSelected = selectedQueueIds.has(item.queueId);
                const removeAfterPlay = removeAfterPlayQueueIds.has(item.queueId);
                const isRecent = recentQueueIds.has(item.queueId);
                const isDropTarget = dropIndicator?.queueId === item.queueId && !draggedQueueIds.includes(item.queueId);
                const rowQualityTags = qualityTags(item.track);
                return (
                  <div
                    className="queue-virtual-row"
                    key={item.queueId}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    style={{ transform: `translateY(${virtualRow.start - scrollMargin}px)` }}
                  >
                    <div
                      className="queue-row"
                      data-current={isCurrent}
                      data-selection-mode={isRowSelectionVisible ? 'true' : undefined}
                      data-selected={isSelected ? 'true' : undefined}
                      data-remove-after-play={removeAfterPlay ? 'true' : undefined}
                      data-recent-change={isRecent ? 'true' : undefined}
                      data-dragging={draggedQueueIds.includes(item.queueId)}
                      data-drop-target={isDropTarget}
                      data-drop-position={isDropTarget ? dropIndicator?.position : undefined}
                      role="listitem"
                      aria-current={isCurrent ? 'true' : undefined}
                      aria-posinset={virtualRow.index + 1}
                      aria-setsize={rows.length}
                      onContextMenu={(event) => handleTrackContextMenu(event, item.track)}
                      onDragOver={(event) => handleDragOver(event, item)}
                      onDrop={(event) => handleDrop(event, item)}
                      onClick={(event) => handleQueueRowSelect(event, item)}
                      onDoubleClick={() => void runQueueAction(() => queue.playQueueItem(item.queueId))}
                    >
                      <button
                        className="queue-drag-handle"
                        type="button"
                        draggable
                        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+N"
                        aria-label={`调整 ${item.track.title} 的位置`}
                        title="拖动排序；Alt+↑ 上移；Alt+↓ 下移；Alt+N 移到下一首"
                        onClick={(event) => event.stopPropagation()}
                        onDoubleClick={(event) => event.stopPropagation()}
                        onDragEnd={handleDragEnd}
                        onDragStart={(event) => handleDragStart(event, item)}
                        onKeyDown={(event) => handleQueueMoveKeyDown(event, item)}
                      >
                        <GripVertical size={17} />
                      </button>
                      {isRowSelectionVisible ? (
                        <label className="queue-row-select" onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            aria-label={`选择 ${item.track.title}`}
                            onChange={(event) => handleToggleQueueSelection(event, item)}
                          />
                        </label>
                      ) : null}
                      <span className="queue-row-index" aria-hidden="true">
                        {isCurrent ? <AudioLines size={15} strokeWidth={2.2} /> : virtualRow.index + 1}
                      </span>
                      <div className="queue-row-cover" data-empty={!item.track.coverThumb}>
                        {item.track.coverThumb ? <img alt="" src={item.track.coverThumb} /> : <Music2 size={19} />}
                      </div>
                      <div className="queue-row-copy">
                        <strong>{item.track.title}</strong>
                        <span>{item.track.artist || item.track.albumArtist || t('queue.unknownArtist')}</span>
                        {item.recommendation ? (
                          <small className="queue-row-reason">
                            {item.recommendation.reasons.map((reason) => recommendationReasonLabel(reason, t)).join(' · ')}
                          </small>
                        ) : null}
                        {removeAfterPlay ? <em className="queue-row-chip">{t('queue.page.selection.markAfterPlay')}</em> : null}
                      </div>
                      <div className="queue-row-quality" aria-label={t('queue.now.quality')}>
                        {rowQualityTags.length > 0 ? rowQualityTags.map((tag) => <span key={`${item.queueId}-${tag}`}>{tag}</span>) : <span>{t('queue.quality.unknown')}</span>}
                      </div>
                      <span className="queue-row-source">{item.source.label}</span>
                      <span className="queue-row-duration">{formatDuration(item.track.duration)}</span>
                      <div className="queue-row-actions" onDoubleClick={(event) => event.stopPropagation()}>
                        <button
                          className="queue-row-start-button"
                          type="button"
                          aria-label={t('queue.action.startFromHere', { title: item.track.title })}
                          title={t('queue.action.startFromHereShort')}
                          onClick={(event) => {
                            event.stopPropagation();
                            void runQueueAction(() => queue.playQueueItem(item.queueId));
                          }}
                        >
                          <Play size={15} fill="currentColor" />
                          <span>{t('queue.action.startFromHereShort')}</span>
                        </button>
                        <button
                          className="queue-icon-button queue-row-more-button"
                          type="button"
                          aria-label={`${t('queue.action.more')} ${item.track.title}`}
                          title={t('queue.action.more')}
                          onClick={(event) => {
                            event.stopPropagation();
                            const rect = event.currentTarget.getBoundingClientRect();
                            handleOpenTrackMenu(item.track, { x: rect.right - 8, y: rect.bottom + 6 });
                          }}
                        >
                          <MoreHorizontal size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="queue-empty-state">
            {queueSearchQuery ? <Search size={28} /> : <ListMusicFallback />}
            <strong>{queueSearchQuery ? '没有匹配的队列曲目' : t('queue.empty.title')}</strong>
            <span>{queueSearchQuery ? '换一个曲名、艺人或专辑关键词试试。' : t('queue.empty.description')}</span>
            {!queueSearchQuery ? (
              <div className="queue-empty-actions">
                <button
                  className="queue-tool-button"
                  type="button"
                  disabled={isGeneratingRandomQueue}
                  onClick={() => void handleGenerateRandomQueue()}
                >
                  <Shuffle size={15} />
                  {isGeneratingRandomQueue ? t('queue.action.generatingRandom') : t('queue.action.generateRandom')}
                </button>
                <button
                  className="queue-tool-button"
                  type="button"
                  disabled={isGeneratingHistoryQueue}
                  onClick={() => void handleGenerateHistoryQueue()}
                >
                  <History size={15} />
                  {isGeneratingHistoryQueue ? t('queue.action.generatingHistory') : t('queue.action.generateFromHistory')}
                </button>
              </div>
            ) : null}
          </div>
        )}

        {actionError ? <p className="queue-error">{actionError}</p> : null}
      </section>

      {trackMenu ? (
        <TrackContextMenu
          track={trackMenu.track}
          position={trackMenu.position}
          liked={!trackMenu.track.isTemporary && likedTrackIds[trackMenu.track.id] === true}
          onAction={(action, track, playlist) => void handleTrackMenuAction(action, track, playlist)}
          onClose={() => setTrackMenu(null)}
        />
      ) : null}

      <TrackTagEditorDrawer
        track={editingTrack}
        isOpen={isTagEditorOpen}
        isSaving={isSavingTags}
        error={tagEditorError}
        onClose={closeTagEditor}
        onSave={(track, tags, coverPath, coverUrl, coverMimeType) => void handleSaveTags(track, tags, coverPath, coverUrl, coverMimeType)}
        onTrackUpdated={(updatedTrack) => {
          setEditingTrack(updatedTrack);
          queue.updateTrackSnapshot(updatedTrack.id, updatedTrack);
          window.dispatchEvent(new Event('library:changed'));
        }}
      />

      <OsuTimingPanel
        track={osuTimingTrack}
        isOpen={Boolean(osuTimingTrack)}
        onClose={() => setOsuTimingTrack(null)}
        onTrackUpdated={(updatedTrack) => {
          setOsuTimingTrack(updatedTrack);
          queue.updateTrackSnapshot(updatedTrack.id, updatedTrack);
        }}
      />
    </div>
  );
};

const ListMusicFallback = (): JSX.Element => (
  <span className="queue-empty-icon" aria-hidden="true">
    <Music2 size={24} />
  </span>
);
