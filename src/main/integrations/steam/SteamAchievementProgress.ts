import { extname } from 'node:path';
import type { AudioStatus } from '../../../shared/types/audio';
import type { EqPreset, EqState } from '../../../shared/types/eq';
import type {
  LibraryAlbum,
  LibraryTrack,
} from '../../../shared/types/library';
import type { PersistedPlaybackSessionV1 } from '../../../shared/types/playback';
import type {
  SteamAchievementPlaybackFact,
  SteamAchievementPlaybackFactInput,
  SteamAchievementPlaybackFactQuery,
} from '../../library/SteamAchievementHistoryStats';
import type { SteamAchievementId } from './SteamCapabilityServices';

export type AudioAchievementStatus = Pick<
  AudioStatus,
  | 'state'
  | 'bitPerfectCandidate'
  | 'currentFilePath'
  | 'currentTrackId'
  | 'currentQueueItemId'
  | 'positionSeconds'
  | 'durationSeconds'
  | 'volume'
  | 'playbackRate'
>;

export type AudioTrackAdvanceAchievementEvent = {
  status: AudioAchievementStatus;
  nextTrackId: string | null;
  gapless: boolean;
};

type LibraryProgressPort = {
  getTrack(trackId: string): LibraryTrack | null;
  getTrackByPath(filePath: string): LibraryTrack | null;
  getAlbumForTrack(trackId: string): LibraryAlbum | null;
  getAllAlbumTracks(albumId: string): LibraryTrack[];
  recordSteamAchievementPlaybackFact(input: SteamAchievementPlaybackFactInput): void;
  getSteamAchievementPlaybackFacts(query?: SteamAchievementPlaybackFactQuery): SteamAchievementPlaybackFact[];
};

type PlaybackSessionPort = {
  load(): PersistedPlaybackSessionV1 | null;
};

type EqProgressPort = {
  getState(): EqState;
  listPresets(): EqPreset[];
};

export type SteamAchievementProgressOptions = {
  library: LibraryProgressPort;
  playbackSession: PlaybackSessionPort;
  eq: EqProgressPort;
  unlock: (achievementId: SteamAchievementId) => void;
  nowMs?: () => number;
};

type QueueShape = {
  continuousIds: string[];
  otherIds: string[];
};

type QueueContext = {
  queueId: string | null;
  sourceType: string | null;
  shape: QueueShape | null;
  queueIds: string[] | null;
  isShuffleEnabled: boolean;
  isRepeatOneEnabled: boolean;
  allItemsManual: boolean;
  queueTrackIds: string[] | null;
};

type TrackProgress = {
  key: string;
  track: LibraryTrack | null;
  startedAtMs: number;
  durationSeconds: number;
  playedSeconds: number;
  lastPositionSeconds: number;
  lastObservedAtMs: number;
  lastState: AudioAchievementStatus['state'];
  playbackRate: number;
  previousPlaybackAtMs: number | null;
  customEqPresetId: string | null;
  customEqStayedEnabled: boolean;
  queueId: string | null;
  sourceType: string | null;
  queueShape: QueueShape | null;
  queueIds: string[] | null;
  shuffleStayedEnabled: boolean;
  repeatOneStayedEnabled: boolean;
  allItemsStayedManual: boolean;
  queueTrackIds: string[] | null;
  furthestPositionSeconds: number;
  rewoundPastHalfToStart: boolean;
  lastVolume: number;
  volumeChangeCount: number;
  uninterrupted: boolean;
  pauseNearEndStartedAtMs: number | null;
  pauseNearEndQualified: boolean;
  continuousQueueStayedIntact: boolean;
  finalized: boolean;
};

type AlbumRun = {
  albumId: string;
  trackIds: string[];
  nextIndex: number;
  queueIds: string[] | null;
  queueVerified: boolean;
};

type ReverseAlbumRun = {
  albumId: string;
  trackIds: string[];
  nextIndex: number;
  queueIds: string[] | null;
};

type CompletedTrackIdentity = {
  title: string;
  artist: string;
};

type ReplayCandidate = {
  trackId: string;
  finishedAtMs: number;
};

type FlipSideCandidate = {
  albumId: string;
};

type AfterCurtainCandidate = {
  readyAtMs: number;
};

type RepeatOneRun = {
  trackId: string;
  count: number;
};

type ManualQueueThreeRun = {
  queueIds: string[];
  trackIds: string[];
  nextIndex: number;
};

const longTrackMinimumSeconds = 20 * 60;
const longTrackPlayedRatio = 0.8;
const completedTrackPlayedRatio = 0.75;
const rediscoveryMinimumMs = 90 * 24 * 60 * 60 * 1000;
const fullAlbumMinimumTracks = 4;
const pinkFloydSingleFileAlbumMinimumSeconds = 30 * 60;
const pinkFloydSingleFileAlbumPlayedRatio = 0.85;
const continuousPlayTarget = 3;
const oldUnplayedMinimumMs = 180 * 24 * 60 * 60 * 1000;
const midnightBridgeMinimumSeconds = 2 * 60;
const fiveDecadesTarget = 4;
const pinkFloydArtistIdentity = 'pink floyd';
const zhaoXiaoliuArtistIdentity = '赵小六';
const echoesTrackIdentity = 'echoes';
const echoesMinimumSeconds = 20 * 60;
const echoesPlayedRatio = 0.8;
const replayPlayedRatio = 0.8;
const replayStartWindowMs = 30_000;
const favoritePartPlayedRatio = 0.8;
const favoritePartHalfwayRatio = 0.5;
const favoritePartRewindTargetRatio = 0.2;
const shuffleFateTarget = 5;
const afterCurtainSilenceMs = 30_000;
const repeatOneTarget = 3;
const sameTrackDailyTarget = 3;
const fiveGenresTarget = 3;
const tenArtistsTarget = 5;
const goldenThreeMinutesMinimumSeconds = 175;
const goldenThreeMinutesMaximumSeconds = 185;
const precisionPlayedRatio = 0.85;
const pauseNearEndMinimumSeconds = 2 * 60;
const pauseNearEndRemainingSeconds = 10;
const pauseNearEndWaitMs = 5_000;
const uninterruptedMinimumSeconds = 3 * 60;
const coverlessTarget = 3;
const oneHourTargetSeconds = 60 * 60;
const replayThreeWindowMs = 24 * 60 * 60 * 1000;
const shortTrackMaximumSeconds = 90;
const longTrackMinimumForPairSeconds = 8 * 60;
const volumeSlideTarget = 3;
const midnightThreeTarget = 3;
const morningStartHour = 6;
const morningEndHour = 9;
const midnightEndHour = 4;
// accrueCurrent already carries up to 0.75 seconds across a status boundary;
// this second half keeps the total natural-end sampling allowance at 1.5 seconds.
const playbackBoundaryToleranceSeconds = 0.75;
const playbackBoundaryToleranceRatio = 0.01;
const customEqActivationGraceSeconds = 15;
const customEqActivationGraceRatio = 0.1;
const pinkFloydAlbumAchievements: Readonly<Record<string, SteamAchievementId>> = {
  'wish you were here': 'ECHO_PF_WISH_YOU_WERE_HERE',
  'the wall': 'ECHO_PF_THE_WALL',
  'animals': 'ECHO_PF_ANIMALS',
  'meddle': 'ECHO_PF_MEDDLE',
  'the division bell': 'ECHO_PF_DIVISION_BELL',
  'atom heart mother': 'ECHO_PF_ATOM_HEART_MOTHER',
};

const finiteNonNegative = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, value) : 0;

const sameStrings = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const sameNullableStrings = (
  left: readonly string[] | null,
  right: readonly string[] | null,
): boolean => left === null || right === null ? left === right : sameStrings(left, right);

const isPrefix = (prefix: readonly string[], value: readonly string[]): boolean =>
  prefix.length <= value.length && prefix.every((item, index) => item === value[index]);

const continuousOrderIsCompatible = (
  previous: readonly string[],
  next: readonly string[],
  currentQueueId: string | null,
): boolean => {
  if (isPrefix(previous, next)) {
    return true;
  }

  const currentIndex = currentQueueId ? previous.indexOf(currentQueueId) : -1;
  for (let removedFromFront = 1; removedFromFront <= currentIndex; removedFromFront += 1) {
    if (isPrefix(previous.slice(removedFromFront), next)) {
      return true;
    }
  }

  return previous.length === 0;
};

const queueShapeIsCompatible = (
  previous: QueueShape | null,
  next: QueueShape | null,
  currentQueueId: string | null,
): boolean =>
  previous === null || next === null || (
    sameStrings(previous.otherIds, next.otherIds) &&
    continuousOrderIsCompatible(previous.continuousIds, next.continuousIds, currentQueueId)
  );

const queueOrderPreservedExceptCompletedPrefix = (
  previous: readonly string[] | null,
  next: readonly string[] | null,
  currentQueueId: string | null,
): boolean => {
  if (previous === null || next === null) {
    return true;
  }
  if (isPrefix(previous, next)) {
    return true;
  }
  const currentIndex = currentQueueId ? previous.indexOf(currentQueueId) : -1;
  for (let removedFromFront = 1; removedFromFront <= currentIndex; removedFromFront += 1) {
    if (isPrefix(previous.slice(removedFromFront), next)) {
      return true;
    }
  }
  return false;
};

const normalizedIdentity = (value: string): string => value.trim().toLocaleLowerCase();

const normalizedReleaseIdentity = (value: string): string => normalizedIdentity(value)
  .replace(/\s+(?:-|–|—)\s+.*(?:\b(?:remaster(?:ed)?|deluxe|anniversary|expanded|edition)\b|重制|豪华|纪念).*$/iu, '')
  .replace(/\s*[\[(（【].*(?:\b(?:remaster(?:ed)?|deluxe|anniversary|expanded|edition)\b|重制|豪华|纪念).*[\])）】]\s*$/iu, '')
  .trim();

const hasArtistIdentity = (value: string, identity: string): boolean => normalizedIdentity(value)
  .split(/\s*(?:[;,\/&|+×、，；]|\b(?:feat(?:uring)?|ft|x)\.?\b)\s*/iu)
  .some((part) => part === identity);

const playedRatioWithBoundaryTolerance = (playedSeconds: number, durationSeconds: number): number => {
  if (durationSeconds <= 0) {
    return 0;
  }
  const toleranceSeconds = Math.min(
    playbackBoundaryToleranceSeconds,
    durationSeconds * playbackBoundaryToleranceRatio,
  );
  return (playedSeconds + toleranceSeconds) / durationSeconds;
};

const localDateKey = (timestampMs: number): string => {
  const value = new Date(timestampMs);
  return [value.getFullYear(), value.getMonth() + 1, value.getDate()]
    .map((part, index) => index === 0 ? String(part) : String(part).padStart(2, '0'))
    .join('-');
};

const trackKey = (status: AudioAchievementStatus): string | null => {
  if (status.currentTrackId) {
    return `id:${status.currentTrackId}`;
  }
  if (status.currentFilePath) {
    return `path:${status.currentFilePath}`;
  }
  return null;
};

export class SteamAchievementProgressTracker {
  private readonly library: LibraryProgressPort;
  private readonly playbackSession: PlaybackSessionPort;
  private readonly eq: EqProgressPort;
  private readonly unlock: (achievementId: SteamAchievementId) => void;
  private readonly nowMs: () => number;
  private current: TrackProgress | null = null;
  private albumRun: AlbumRun | null = null;
  private reverseAlbumRun: ReverseAlbumRun | null = null;
  private lastCompletedTrack: CompletedTrackIdentity | null = null;
  private replayCandidate: ReplayCandidate | null = null;
  private flipSideCandidate: FlipSideCandidate | null = null;
  private readonly friendlyShuffleTrackIds = new Set<string>();
  private afterCurtainCandidate: AfterCurtainCandidate | null = null;
  private readonly completedDecades = new Set<number>();
  private continuousPlayCount = 0;
  private lastContinuousQueueId: string | null = null;
  private repeatOneRun: RepeatOneRun | null = null;
  private readonly completedGenres = new Set<string>();
  private readonly completedArtists = new Set<string>();
  private readonly coverlessTrackIds = new Set<string>();
  private manualQueueThreeRun: ManualQueueThreeRun | null = null;
  private sessionPlayedSeconds = 0;
  private readonly completedFormats = new Set<string>();
  private hasCompletedShortTrack = false;
  private hasCompletedLongTrack = false;
  private readonly albumBookends = new Map<string, Set<'first' | 'last'>>();
  private readonly midnightTrackIds = new Set<string>();

  constructor(options: SteamAchievementProgressOptions) {
    this.library = options.library;
    this.playbackSession = options.playbackSession;
    this.eq = options.eq;
    this.unlock = options.unlock;
    this.nowMs = options.nowMs ?? Date.now;
  }

  onAudioStatus(status: AudioAchievementStatus): void {
    const nextKey = trackKey(status);
    const now = this.nowMs();
    const isActive = status.state === 'loading' || status.state === 'playing' || status.state === 'paused';

    if (isActive) {
      this.afterCurtainCandidate = null;
    }

    if (status.state === 'ended') {
      this.evaluateAfterCurtainSilence(now);
    }

    if (status.state === 'idle' || status.state === 'stopped' || status.state === 'error') {
      this.evaluateAfterCurtainSilence(now);
      if (this.current && !this.current.finalized && nextKey === this.current.key) {
        this.accrueCurrent(status, now);
        this.replayCandidate = null;
      }
      this.abandonCurrent(true);
      return;
    }

    if (this.current && nextKey === this.current.key) {
      if (this.current.finalized) {
        if (status.state === 'playing' && status.positionSeconds <= 2) {
          this.current = this.beginTrack(status, now);
        }
        return;
      }

      this.accrueCurrent(status, now);
      this.refreshQueueContext(status);
      if (status.state === 'ended') {
        this.finishCurrentNaturally(status, false);
      }
      return;
    }

    if (this.current && !this.current.finalized) {
      this.replayCandidate = null;
      this.abandonCurrent();
    }

    if (nextKey && (status.state === 'loading' || status.state === 'playing' || status.state === 'paused')) {
      this.current = this.beginTrack(status, now);
    }
  }

  onPlaybackEnded(status: AudioAchievementStatus): void {
    if (this.current?.key !== trackKey(status) || this.current.finalized) {
      return;
    }
    this.accrueCurrent(status, this.nowMs());
    this.refreshQueueContext(status);
    this.finishCurrentNaturally(status, false);
  }

  onTrackAdvance(event: AudioTrackAdvanceAchievementEvent): void {
    if (this.current?.key === trackKey(event.status) && !this.current.finalized) {
      this.accrueCurrent(event.status, this.nowMs());
      this.refreshQueueContext(event.status);
      this.finishCurrentNaturally(event.status, false);
    }
    if (event.gapless) {
      this.unlock('ECHO_FIRST_GAPLESS');
    }
  }

  onEqState(state: EqState): void {
    const current = this.current;
    if (!current || current.finalized) {
      return;
    }

    const estimatedPlayedSeconds = current.playedSeconds + (
      current.lastState === 'playing'
        ? Math.max(0, (this.nowMs() - current.lastObservedAtMs) / 1000) * current.playbackRate
        : 0
    );
    const activationGraceSeconds = Math.min(
      customEqActivationGraceSeconds,
      current.durationSeconds * customEqActivationGraceRatio,
    );
    if (state.enabled && this.isCustomPreset(state.presetId) && estimatedPlayedSeconds <= activationGraceSeconds) {
      current.customEqPresetId = state.presetId;
      current.customEqStayedEnabled = true;
      return;
    }
    if (current.customEqPresetId === null) {
      return;
    }
    if (!state.enabled || state.presetId !== current.customEqPresetId || !this.isCustomPreset(state.presetId)) {
      current.customEqStayedEnabled = false;
    }
  }

  dispose(): void {
    this.abandonCurrent(true);
  }

  private beginTrack(status: AudioAchievementStatus, now: number): TrackProgress {
    const track = this.resolveLibraryTrack(status);
    const eqState = this.safeEqState();
    const customEqPresetId = eqState.enabled && this.isCustomPreset(eqState.presetId)
      ? eqState.presetId
      : null;
    const queue = this.resolveQueueContext(status);

    return {
      key: trackKey(status)!,
      track,
      startedAtMs: now,
      durationSeconds: Math.max(finiteNonNegative(status.durationSeconds), finiteNonNegative(track?.duration ?? 0)),
      playedSeconds: 0,
      lastPositionSeconds: finiteNonNegative(status.positionSeconds),
      lastObservedAtMs: now,
      lastState: status.state,
      playbackRate: Math.max(0.1, finiteNonNegative(status.playbackRate) || 1),
      previousPlaybackAtMs: track ? this.findPreviousPlaybackAtMs(track, now) : null,
      customEqPresetId,
      customEqStayedEnabled: customEqPresetId !== null,
      queueId: queue.queueId,
      sourceType: queue.sourceType,
      queueShape: queue.shape,
      queueIds: queue.queueIds,
      shuffleStayedEnabled: queue.isShuffleEnabled,
      repeatOneStayedEnabled: queue.isRepeatOneEnabled,
      allItemsStayedManual: queue.allItemsManual,
      queueTrackIds: queue.queueTrackIds,
      furthestPositionSeconds: finiteNonNegative(status.positionSeconds),
      rewoundPastHalfToStart: false,
      lastVolume: Math.max(0, Math.min(1, finiteNonNegative(status.volume))),
      volumeChangeCount: 0,
      uninterrupted: status.state === 'playing' && Math.abs((status.playbackRate || 1) - 1) < 0.001,
      pauseNearEndStartedAtMs: null,
      pauseNearEndQualified: false,
      continuousQueueStayedIntact: queue.sourceType === 'continuous-play',
      finalized: false,
    };
  }

  private accrueCurrent(status: AudioAchievementStatus, now: number): void {
    const current = this.current;
    if (!current || current.finalized) {
      return;
    }

    const wallSeconds = Math.max(0, (now - current.lastObservedAtMs) / 1000);
    const positionSeconds = finiteNonNegative(status.positionSeconds);
    current.durationSeconds = Math.max(current.durationSeconds, finiteNonNegative(status.durationSeconds));
    const positionDelta = positionSeconds - current.lastPositionSeconds;
    const nextPlaybackRate = Math.max(0.1, finiteNonNegative(status.playbackRate) || 1);
    const maximumCreditable = (wallSeconds * Math.max(1, current.playbackRate)) + 0.75;
    if (current.lastState === 'playing' && positionDelta > 0) {
      current.playedSeconds += Math.min(positionDelta, maximumCreditable);
    } else if (positionDelta < -0.75) {
      if (
        current.durationSeconds > 0 &&
        current.furthestPositionSeconds >= current.durationSeconds * favoritePartHalfwayRatio &&
        positionSeconds <= current.durationSeconds * favoritePartRewindTargetRatio
      ) {
        current.rewoundPastHalfToStart = true;
      }
    }

    if (
      current.track &&
      this.isLocalTrack(current.track) &&
      this.sessionPlayedSeconds + current.playedSeconds >= oneHourTargetSeconds
    ) {
      this.unlock('ECHO_ONE_HOUR_SESSION');
    }

    current.furthestPositionSeconds = Math.max(current.furthestPositionSeconds, positionSeconds);
    const nextVolume = Math.max(0, Math.min(1, finiteNonNegative(status.volume)));
    if (Math.abs(nextVolume - current.lastVolume) >= 0.01) {
      current.volumeChangeCount += 1;
    }
    current.lastVolume = nextVolume;

    if (
      current.lastState === 'playing' &&
      status.state === 'paused' &&
      current.durationSeconds >= pauseNearEndMinimumSeconds &&
      current.durationSeconds - positionSeconds <= pauseNearEndRemainingSeconds
    ) {
      current.pauseNearEndStartedAtMs = now;
    } else if (current.lastState === 'paused' && status.state === 'playing') {
      if (
        current.pauseNearEndStartedAtMs !== null &&
        now - current.pauseNearEndStartedAtMs >= pauseNearEndWaitMs
      ) {
        current.pauseNearEndQualified = true;
      }
      current.pauseNearEndStartedAtMs = null;
    }

    if (
      status.state === 'paused' ||
      positionDelta < -0.75 ||
      (status.state !== 'ended' && positionDelta > maximumCreditable + 0.75) ||
      Math.abs(current.playbackRate - 1) >= 0.001 ||
      Math.abs(nextPlaybackRate - 1) >= 0.001
    ) {
      current.uninterrupted = false;
    }

    current.lastPositionSeconds = positionSeconds;
    current.lastObservedAtMs = now;
    current.lastState = status.state;
    current.playbackRate = nextPlaybackRate;
  }

  private refreshQueueContext(status: AudioAchievementStatus): void {
    const current = this.current;
    if (!current) {
      return;
    }

    const queue = this.resolveQueueContext(status);
    if (current.sourceType === 'continuous-play' && current.continuousQueueStayedIntact && (
      queue.sourceType !== 'continuous-play' ||
      !queueShapeIsCompatible(current.queueShape, queue.shape, current.queueId)
    )) {
      current.continuousQueueStayedIntact = false;
    }
    current.queueShape = queue.shape;
    current.queueIds = queue.queueIds;
    current.shuffleStayedEnabled = current.shuffleStayedEnabled && queue.isShuffleEnabled;
    current.repeatOneStayedEnabled = current.repeatOneStayedEnabled && queue.isRepeatOneEnabled;
    current.allItemsStayedManual = current.allItemsStayedManual && queue.allItemsManual;
    if (!sameNullableStrings(current.queueTrackIds, queue.queueTrackIds)) {
      current.allItemsStayedManual = false;
    }
    current.queueTrackIds = queue.queueTrackIds;
  }

  private finishCurrentNaturally(status: AudioAchievementStatus, gapless: boolean): void {
    const current = this.current;
    if (!current || current.finalized) {
      return;
    }
    current.finalized = true;
    current.durationSeconds = Math.max(current.durationSeconds, finiteNonNegative(status.durationSeconds));
    const finishedAtMs = this.nowMs();
    const playedRatio = playedRatioWithBoundaryTolerance(current.playedSeconds, current.durationSeconds);
    const completed = playedRatio >= completedTrackPlayedRatio;
    this.recordPlaybackFact(current, completed, finishedAtMs);
    if (current.track && this.isLocalTrack(current.track)) {
      this.sessionPlayedSeconds += current.playedSeconds;
    }
    this.evaluatePlayAgain(current, playedRatio, finishedAtMs);

    if (current.durationSeconds >= longTrackMinimumSeconds && playedRatio >= longTrackPlayedRatio) {
      this.unlock('ECHO_LONG_TRACK');
    }

    if (completed) {
      this.evaluateRediscovery(current);
      this.evaluateOldUnplayedTreasure(current, finishedAtMs);
      this.evaluateCustomEq(current);
      this.evaluateSameTitleDifferentArtist(current.track);
      this.evaluateFiveDecades(current.track);
      this.evaluateMidnightBridge(current, finishedAtMs);
      this.evaluateDarkSideOfTheMoon(current.track);
      this.evaluateZhaoXiaoliu(current.track);
      this.evaluateEchoes(current, playedRatio);
      this.evaluatePinkFloydSingleFileAlbum(current, playedRatio);
      this.evaluateFavoritePart(current);
      this.evaluateFlipSide(current.track);
      this.advanceShuffleFate(current);
      this.armAfterCurtain(current.track, finishedAtMs);
      this.evaluateFourSeasons(current.track, finishedAtMs);
      this.evaluateRepeatOne(current);
      this.evaluateThreeInDay(current, finishedAtMs);
      this.evaluateSessionVariety(current.track);
      this.evaluateGoldenThreeMinutes(current, playedRatio);
      this.evaluatePauseNearEnd(current);
      this.evaluateUninterrupted(current, playedRatio);
      this.evaluateCoverless(current.track);
      this.evaluateThreeAudioFormats(current.track);
      this.evaluateShortAndLong(current);
      this.evaluateVolumeSlide(current);
      this.evaluateAlbumBookends(current.track);
      this.evaluateEarlyBird(current.track, finishedAtMs);
      this.evaluateMidnightThree(current.track, finishedAtMs);
      this.advanceManualQueueThree(current);
      this.evaluateOneHourSession();
      this.evaluateThreeDayStreak(current.track, finishedAtMs);
      this.evaluateAlbumAllDay(current.track, finishedAtMs);
      this.advanceAlbumRun(current);
      this.advanceReverseAlbumRun(current);
      this.advanceContinuousPlay(current);
    } else {
      this.albumRun = null;
      this.reverseAlbumRun = null;
      this.lastCompletedTrack = null;
      this.flipSideCandidate = null;
      this.repeatOneRun = null;
      this.manualQueueThreeRun = null;
      this.resetContinuousPlay();
    }

    if (gapless) {
      this.unlock('ECHO_FIRST_GAPLESS');
    }
  }

  private evaluateRediscovery(current: TrackProgress): void {
    if (
      current.track &&
      this.isLocalTrack(current.track) &&
      current.previousPlaybackAtMs !== null &&
      this.nowMs() - current.previousPlaybackAtMs >= rediscoveryMinimumMs
    ) {
      this.unlock('ECHO_LONG_TIME_NO_SEE');
    }
  }

  private evaluateOldUnplayedTreasure(current: TrackProgress, finishedAtMs: number): void {
    const importedAtMs = current.track?.createdAt ? Date.parse(current.track.createdAt) : Number.NaN;
    if (
      current.track &&
      this.isLocalTrack(current.track) &&
      current.previousPlaybackAtMs === null &&
      Number.isFinite(importedAtMs) &&
      finishedAtMs - importedAtMs >= oldUnplayedMinimumMs
    ) {
      this.unlock('ECHO_OLD_UNPLAYED_TREASURE');
    }
  }

  private evaluateSameTitleDifferentArtist(track: LibraryTrack | null): void {
    if (!track || !this.isLocalTrack(track)) {
      this.lastCompletedTrack = null;
      return;
    }
    const completed = {
      title: normalizedIdentity(track.title),
      artist: normalizedIdentity(track.artist),
    };
    if (
      completed.title &&
      completed.artist &&
      this.lastCompletedTrack?.title === completed.title &&
      this.lastCompletedTrack.artist !== completed.artist
    ) {
      this.unlock('ECHO_SAME_TITLE_DIFFERENT_ARTIST');
    }
    this.lastCompletedTrack = completed;
  }

  private evaluateFiveDecades(track: LibraryTrack | null): void {
    if (!track || !this.isLocalTrack(track) || track.year === null || !Number.isFinite(track.year)) {
      return;
    }
    this.completedDecades.add(Math.floor(track.year / 10) * 10);
    if (this.completedDecades.size >= fiveDecadesTarget) {
      this.unlock('ECHO_FIVE_DECADES_SESSION');
    }
  }

  private evaluateMidnightBridge(current: TrackProgress, finishedAtMs: number): void {
    if (
      current.track &&
      this.isLocalTrack(current.track) &&
      current.durationSeconds >= midnightBridgeMinimumSeconds &&
      localDateKey(current.startedAtMs) !== localDateKey(finishedAtMs)
    ) {
      this.unlock('ECHO_MIDNIGHT_BRIDGE');
    }
  }

  private evaluateDarkSideOfTheMoon(track: LibraryTrack | null): void {
    if (!track || !this.isLocalTrack(track)) {
      return;
    }
    const isPinkFloyd = [track.artist, track.albumArtist]
      .some((artist) => hasArtistIdentity(artist, pinkFloydArtistIdentity));
    if (isPinkFloyd) {
      this.unlock('ECHO_DARK_SIDE_OF_THE_MOON');
    }
  }

  private evaluateZhaoXiaoliu(track: LibraryTrack | null): void {
    if (
      track &&
      this.isLocalTrack(track) &&
      normalizedIdentity(track.artist).includes(zhaoXiaoliuArtistIdentity)
    ) {
      this.unlock('ECHO_ZHAO_XIAOLIU_HANDSOME');
    }
  }

  private evaluateEchoes(current: TrackProgress, playedRatio: number): void {
    const track = current.track;
    if (
      !track ||
      !this.isLocalTrack(track) ||
      normalizedReleaseIdentity(track.title) !== echoesTrackIdentity ||
      current.durationSeconds < echoesMinimumSeconds ||
      playedRatio < echoesPlayedRatio
    ) {
      return;
    }

    const isPinkFloyd = [track.artist, track.albumArtist]
      .some((artist) => hasArtistIdentity(artist, pinkFloydArtistIdentity));
    if (isPinkFloyd) {
      this.unlock('ECHO_PF_ECHOES');
    }
  }

  private evaluatePlayAgain(current: TrackProgress, playedRatio: number, finishedAtMs: number): void {
    const track = current.track;
    if (!track || !this.isLocalTrack(track) || playedRatio < replayPlayedRatio) {
      this.replayCandidate = null;
      return;
    }

    const replayDelayMs = this.replayCandidate
      ? current.startedAtMs - this.replayCandidate.finishedAtMs
      : Number.POSITIVE_INFINITY;
    if (
      this.replayCandidate?.trackId === track.id &&
      replayDelayMs >= 0 &&
      replayDelayMs <= replayStartWindowMs
    ) {
      this.unlock('ECHO_PLAY_AGAIN');
    }
    this.replayCandidate = { trackId: track.id, finishedAtMs };
  }

  private evaluateFavoritePart(current: TrackProgress): void {
    if (
      current.track &&
      this.isLocalTrack(current.track) &&
      current.rewoundPastHalfToStart &&
      playedRatioWithBoundaryTolerance(current.playedSeconds, current.durationSeconds) >= favoritePartPlayedRatio
    ) {
      this.unlock('ECHO_FAVORITE_PART');
    }
  }

  private evaluateFlipSide(track: LibraryTrack | null): void {
    if (!track || !this.isLocalTrack(track)) {
      this.flipSideCandidate = null;
      return;
    }

    const album = this.safeAlbumForTrack(track.id);
    const albumTracks = album ? this.safeAlbumTracks(album.id).filter((item) => this.isLocalTrack(item)) : [];
    const discOne = albumTracks
      .filter((item) => (item.discNo ?? 1) === 1)
      .sort((left, right) => (left.trackNo ?? 0) - (right.trackNo ?? 0));
    const discTwo = albumTracks
      .filter((item) => (item.discNo ?? 1) === 2)
      .sort((left, right) => (left.trackNo ?? 0) - (right.trackNo ?? 0));
    if (!album || discOne.length === 0 || discTwo.length === 0) {
      this.flipSideCandidate = null;
      return;
    }

    if (this.flipSideCandidate?.albumId === album.id && track.id === discTwo[0]?.id) {
      this.unlock('ECHO_FLIP_SIDE');
    }
    this.flipSideCandidate = track.id === discOne.at(-1)?.id ? { albumId: album.id } : null;
  }

  private advanceShuffleFate(current: TrackProgress): void {
    const track = current.track;
    if (!track || !this.isLocalTrack(track) || !current.shuffleStayedEnabled) {
      return;
    }
    this.friendlyShuffleTrackIds.add(track.id);
    if (this.friendlyShuffleTrackIds.size >= shuffleFateTarget) {
      this.unlock('ECHO_SHUFFLE_FATE');
    }
  }

  private armAfterCurtain(track: LibraryTrack | null, finishedAtMs: number): void {
    if (!track || !this.isLocalTrack(track)) {
      return;
    }
    const album = this.safeAlbumForTrack(track.id);
    const albumTracks = album ? this.safeAlbumTracks(album.id).filter((item) => this.isLocalTrack(item)) : [];
    if (albumTracks.length >= fullAlbumMinimumTracks && track.id === albumTracks.at(-1)?.id) {
      this.afterCurtainCandidate = { readyAtMs: finishedAtMs + afterCurtainSilenceMs };
    }
  }

  private evaluateAfterCurtainSilence(nowMs: number): void {
    if (this.afterCurtainCandidate && nowMs >= this.afterCurtainCandidate.readyAtMs) {
      this.unlock('ECHO_AFTER_CURTAIN');
      this.afterCurtainCandidate = null;
    }
  }

  private evaluateFourSeasons(track: LibraryTrack | null, finishedAtMs: number): void {
    if (!track || !this.isLocalTrack(track)) {
      return;
    }
    const finishedAt = new Date(finishedAtMs);
    const year = finishedAt.getFullYear();
    const quarters = new Set<number>([Math.floor(finishedAt.getMonth() / 3)]);
    try {
      const facts = this.library.getSteamAchievementPlaybackFacts({
        trackId: track.id,
        fromMs: new Date(year, 0, 1).getTime(),
        toMs: new Date(year + 1, 0, 1).getTime(),
        qualifiedOnly: true,
      });
      for (const fact of facts) {
        const completedAt = new Date(fact.endedAtMs);
        if (Number.isFinite(completedAt.getTime()) && completedAt.getFullYear() === year) {
          quarters.add(Math.floor(completedAt.getMonth() / 3));
        }
      }
      if (quarters.size === 4) {
        this.unlock('ECHO_FOUR_SEASONS');
      }
    } catch {
      // Playback history can be temporarily unavailable during library recovery.
    }
  }

  private evaluateRepeatOne(current: TrackProgress): void {
    const track = current.track;
    if (!track || !this.isLocalTrack(track) || !current.repeatOneStayedEnabled) {
      this.repeatOneRun = null;
      return;
    }
    this.repeatOneRun = this.repeatOneRun?.trackId === track.id
      ? { trackId: track.id, count: this.repeatOneRun.count + 1 }
      : { trackId: track.id, count: 1 };
    if (this.repeatOneRun.count >= repeatOneTarget) {
      this.unlock('ECHO_REPEAT_ONE_FIVE');
      this.repeatOneRun = null;
    }
  }

  private evaluateThreeInDay(current: TrackProgress, finishedAtMs: number): void {
    const track = current.track;
    if (!track || !this.isLocalTrack(track)) {
      return;
    }
    const windowStart = new Date(finishedAtMs - replayThreeWindowMs);
    const windowEnd = new Date(finishedAtMs + 1);
    const previousCount = this.factsForTrack(track, windowStart, windowEnd)
      .filter((fact) => fact.qualifiedCompletion)
      .filter((fact) => fact.endedAtMs >= windowStart.getTime() && fact.endedAtMs < current.startedAtMs)
      .length;
    if (previousCount + 1 >= sameTrackDailyTarget) {
      this.unlock('ECHO_TRACK_THREE_IN_DAY');
    }
  }

  private evaluateSessionVariety(track: LibraryTrack | null): void {
    if (!track || !this.isLocalTrack(track)) {
      return;
    }
    const genre = normalizedIdentity(track.genre ?? '');
    if (genre && genre !== 'unknown' && genre !== '未知') {
      this.completedGenres.add(genre);
      if (this.completedGenres.size >= fiveGenresTarget) {
        this.unlock('ECHO_FIVE_GENRES_SESSION');
      }
    }
    const artist = normalizedIdentity(track.artist);
    if (artist && artist !== 'unknown artist' && artist !== '未知艺术家') {
      this.completedArtists.add(artist);
      if (this.completedArtists.size >= tenArtistsTarget) {
        this.unlock('ECHO_TEN_ARTISTS_SESSION');
      }
    }
  }

  private evaluateGoldenThreeMinutes(current: TrackProgress, playedRatio: number): void {
    if (
      current.track &&
      this.isLocalTrack(current.track) &&
      current.durationSeconds >= goldenThreeMinutesMinimumSeconds &&
      current.durationSeconds <= goldenThreeMinutesMaximumSeconds &&
      playedRatio >= precisionPlayedRatio
    ) {
      this.unlock('ECHO_GOLDEN_THREE_MINUTES');
    }
  }

  private evaluatePauseNearEnd(current: TrackProgress): void {
    if (
      current.track &&
      this.isLocalTrack(current.track) &&
      current.durationSeconds >= pauseNearEndMinimumSeconds &&
      current.pauseNearEndQualified
    ) {
      this.unlock('ECHO_PAUSE_NEAR_END');
    }
  }

  private evaluateUninterrupted(current: TrackProgress, playedRatio: number): void {
    if (
      current.track &&
      this.isLocalTrack(current.track) &&
      current.durationSeconds >= uninterruptedMinimumSeconds &&
      playedRatio >= precisionPlayedRatio &&
      current.uninterrupted
    ) {
      this.unlock('ECHO_UNINTERRUPTED_FOUR_MINUTES');
    }
  }

  private evaluateCoverless(track: LibraryTrack | null): void {
    if (!track || !this.isLocalTrack(track) || track.coverId || track.coverThumb) {
      return;
    }
    this.coverlessTrackIds.add(track.id);
    if (this.coverlessTrackIds.size >= coverlessTarget) {
      this.unlock('ECHO_FIVE_COVERLESS');
    }
  }

  private evaluateThreeAudioFormats(track: LibraryTrack | null): void {
    if (!track || !this.isLocalTrack(track)) {
      return;
    }
    const format = extname(track.path).slice(1).toLocaleLowerCase();
    if (format) {
      this.completedFormats.add(format);
    }
    if (this.completedFormats.size >= 3) {
      this.unlock('ECHO_THREE_AUDIO_FORMATS');
    }
  }

  private evaluateShortAndLong(current: TrackProgress): void {
    if (!current.track || !this.isLocalTrack(current.track)) {
      return;
    }
    this.hasCompletedShortTrack ||= current.durationSeconds <= shortTrackMaximumSeconds;
    this.hasCompletedLongTrack ||= current.durationSeconds >= longTrackMinimumForPairSeconds;
    if (this.hasCompletedShortTrack && this.hasCompletedLongTrack) {
      this.unlock('ECHO_SHORT_AND_LONG');
    }
  }

  private evaluateVolumeSlide(current: TrackProgress): void {
    if (
      current.track &&
      this.isLocalTrack(current.track) &&
      current.volumeChangeCount >= volumeSlideTarget
    ) {
      this.unlock('ECHO_VOLUME_SLIDE');
    }
  }

  private evaluateAlbumBookends(track: LibraryTrack | null): void {
    if (!track || !this.isLocalTrack(track)) {
      return;
    }
    const album = this.safeAlbumForTrack(track.id);
    const albumTracks = album ? this.safeAlbumTracks(album.id).filter((item) => this.isLocalTrack(item)) : [];
    if (!album || albumTracks.length < fullAlbumMinimumTracks) {
      return;
    }
    const endpoints = this.albumBookends.get(album.id) ?? new Set<'first' | 'last'>();
    if (track.id === albumTracks[0]?.id) {
      endpoints.add('first');
    }
    if (track.id === albumTracks.at(-1)?.id) {
      endpoints.add('last');
    }
    this.albumBookends.set(album.id, endpoints);
    if (endpoints.size === 2) {
      this.unlock('ECHO_ALBUM_BOOKENDS');
    }
  }

  private evaluateEarlyBird(track: LibraryTrack | null, finishedAtMs: number): void {
    const hour = new Date(finishedAtMs).getHours();
    if (
      track &&
      this.isLocalTrack(track) &&
      hour >= morningStartHour &&
      hour < morningEndHour
    ) {
      this.unlock('ECHO_EARLY_BIRD');
    }
  }

  private evaluateMidnightThree(track: LibraryTrack | null, finishedAtMs: number): void {
    if (!track || !this.isLocalTrack(track) || new Date(finishedAtMs).getHours() >= midnightEndHour) {
      return;
    }
    this.midnightTrackIds.add(track.id);
    if (this.midnightTrackIds.size >= midnightThreeTarget) {
      this.unlock('ECHO_MIDNIGHT_THREE');
    }
  }

  private advanceManualQueueThree(current: TrackProgress): void {
    const track = current.track;
    const queueIds = current.queueIds;
    const trackIds = current.queueTrackIds;
    if (
      !track ||
      !this.isLocalTrack(track) ||
      !current.allItemsStayedManual ||
      queueIds?.length !== 3 ||
      trackIds?.length !== 3 ||
      new Set(trackIds).size !== 3
    ) {
      this.manualQueueThreeRun = null;
      return;
    }
    const canContinue = this.manualQueueThreeRun !== null &&
      sameStrings(this.manualQueueThreeRun.queueIds, queueIds) &&
      sameStrings(this.manualQueueThreeRun.trackIds, trackIds) &&
      trackIds[this.manualQueueThreeRun.nextIndex] === track.id;
    this.manualQueueThreeRun = canContinue && this.manualQueueThreeRun
      ? { ...this.manualQueueThreeRun, nextIndex: this.manualQueueThreeRun.nextIndex + 1 }
      : trackIds[0] === track.id
        ? { queueIds: [...queueIds], trackIds: [...trackIds], nextIndex: 1 }
        : null;
    if (this.manualQueueThreeRun?.nextIndex === 3) {
      this.unlock('ECHO_MANUAL_QUEUE_THREE');
      this.manualQueueThreeRun = null;
    }
  }

  private evaluateOneHourSession(): void {
    if (this.sessionPlayedSeconds >= oneHourTargetSeconds) {
      this.unlock('ECHO_ONE_HOUR_SESSION');
    }
  }

  private evaluateThreeDayStreak(track: LibraryTrack | null, finishedAtMs: number): void {
    if (!track || !this.isLocalTrack(track)) {
      return;
    }
    const from = new Date(finishedAtMs);
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - 3);
    const to = new Date(finishedAtMs);
    to.setHours(24, 0, 0, 0);
    const days = new Set<number>([this.localDayNumber(finishedAtMs)]);
    for (const fact of this.factsForTrack(track, from, to)) {
      if (fact.qualifiedCompletion && Number.isFinite(fact.endedAtMs)) {
        days.add(this.localDayNumber(fact.endedAtMs));
      }
    }
    const ordered = [...days].sort((left, right) => left - right);
    let run = 1;
    for (let index = 1; index < ordered.length; index += 1) {
      run = ordered[index] === ordered[index - 1]! + 1 ? run + 1 : 1;
      if (run >= 3) {
        this.unlock('ECHO_THREE_DAY_TRACK_STREAK');
        return;
      }
    }
  }

  private evaluateAlbumAllDay(track: LibraryTrack | null, finishedAtMs: number): void {
    if (!track || !this.isLocalTrack(track)) {
      return;
    }
    const album = this.safeAlbumForTrack(track.id);
    const albumTracks = album ? this.safeAlbumTracks(album.id).filter((item) => this.isLocalTrack(item)) : [];
    if (!album || albumTracks.length < fullAlbumMinimumTracks) {
      return;
    }
    const dayStart = new Date(finishedAtMs);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const buckets = [new Set<string>(), new Set<string>(), new Set<string>()];
    const add = (trackId: string, timestampMs: number): void => {
      const hour = new Date(timestampMs).getHours();
      const bucket = hour >= 6 && hour < 10 ? 0 : hour >= 12 && hour < 16 ? 1 : hour >= 20 ? 2 : -1;
      if (bucket >= 0) {
        buckets[bucket]!.add(trackId);
      }
    };
    add(track.id, finishedAtMs);
    try {
      const facts = this.library.getSteamAchievementPlaybackFacts({
        fromMs: dayStart.getTime(),
        toMs: dayEnd.getTime(),
        qualifiedOnly: true,
      });
      for (const fact of facts) {
        const matchedTrack = albumTracks.find((item) => fact.trackId === item.id);
        if (matchedTrack && Number.isFinite(fact.endedAtMs)) {
          add(matchedTrack.id, fact.endedAtMs);
        }
      }
    } catch {
      return;
    }
    for (const morning of buckets[0]!) {
      for (const afternoon of buckets[1]!) {
        for (const evening of buckets[2]!) {
          if (new Set([morning, afternoon, evening]).size === 3) {
            this.unlock('ECHO_ALBUM_ALL_DAY');
            return;
          }
        }
      }
    }
  }

  private factsForTrack(track: LibraryTrack, from: Date, to: Date): SteamAchievementPlaybackFact[] {
    try {
      return this.library.getSteamAchievementPlaybackFacts({
        trackId: track.id,
        fromMs: from.getTime(),
        toMs: to.getTime(),
      });
    } catch {
      return [];
    }
  }

  private localDayNumber(timestampMs: number): number {
    const value = new Date(timestampMs);
    return Math.floor(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / 86_400_000);
  }

  private evaluateCustomEq(current: TrackProgress): void {
    if (current.customEqPresetId !== null && current.customEqStayedEnabled) {
      this.unlock('ECHO_CUSTOM_EQ_TRACK');
    }
  }

  private advanceAlbumRun(current: TrackProgress): void {
    const track = current.track;
    if (!track || !this.isLocalTrack(track)) {
      this.albumRun = null;
      return;
    }

    const album = this.safeAlbumForTrack(track.id);
    const albumTracks = album ? this.safeAlbumTracks(album.id).filter((item) => this.isLocalTrack(item)) : [];
    const trackIds = albumTracks.map((item) => item.id);
    if (!album || trackIds.length < fullAlbumMinimumTracks) {
      this.albumRun = null;
      return;
    }

    const canContinue = this.albumRun?.albumId === album.id &&
      this.albumRun.trackIds[this.albumRun.nextIndex] === track.id &&
      queueOrderPreservedExceptCompletedPrefix(
        this.albumRun.queueIds,
        current.queueIds,
        current.queueId,
      );

    if (canContinue && this.albumRun) {
      this.albumRun.nextIndex += 1;
      this.albumRun.queueIds = current.queueIds;
      this.albumRun.queueVerified = this.albumRun.queueVerified && current.queueIds !== null;
    } else {
      this.albumRun = track.id === trackIds[0]
        ? {
          albumId: album.id,
          trackIds,
          nextIndex: 1,
          queueIds: current.queueIds,
          queueVerified: current.queueIds !== null,
        }
        : null;
    }

    if (this.albumRun && this.albumRun.nextIndex >= this.albumRun.trackIds.length) {
      const completedRun = this.albumRun;
      this.unlock('ECHO_FULL_ALBUM');
      if (completedRun.queueVerified) {
        this.evaluatePinkFloydAlbumCompletion(albumTracks);
      }
      this.albumRun = null;
    }
  }

  private evaluatePinkFloydAlbumCompletion(albumTracks: readonly LibraryTrack[]): void {
    const albumTitle = normalizedReleaseIdentity(albumTracks[0]?.album ?? '');
    const achievementId = pinkFloydAlbumAchievements[albumTitle];
    if (!achievementId) {
      return;
    }

    const isExactPinkFloydAlbum = albumTracks.every((track) =>
      normalizedReleaseIdentity(track.album ?? '') === albumTitle &&
      [track.artist, track.albumArtist]
        .some((artist) => hasArtistIdentity(artist, pinkFloydArtistIdentity)),
    );
    if (isExactPinkFloydAlbum) {
      this.unlock(achievementId);
    }
  }

  private evaluatePinkFloydSingleFileAlbum(current: TrackProgress, playedRatio: number): void {
    const track = current.track;
    if (
      !track ||
      !this.isLocalTrack(track) ||
      current.durationSeconds < pinkFloydSingleFileAlbumMinimumSeconds ||
      playedRatio < pinkFloydSingleFileAlbumPlayedRatio
    ) {
      return;
    }

    const album = this.safeAlbumForTrack(track.id);
    const albumTracks = album
      ? this.safeAlbumTracks(album.id).filter((item) => this.isLocalTrack(item))
      : [];
    if (!album || albumTracks.length !== 1 || albumTracks[0]?.id !== track.id) {
      return;
    }

    const albumTitle = normalizedReleaseIdentity(track.album ?? album.title ?? '');
    const achievementId = pinkFloydAlbumAchievements[albumTitle];
    const isPinkFloyd = [track.artist, track.albumArtist]
      .some((artist) => hasArtistIdentity(artist, pinkFloydArtistIdentity));
    if (achievementId && isPinkFloyd) {
      this.unlock(achievementId);
    }
  }

  private advanceReverseAlbumRun(current: TrackProgress): void {
    const track = current.track;
    if (!track || !this.isLocalTrack(track)) {
      this.reverseAlbumRun = null;
      return;
    }

    const album = this.safeAlbumForTrack(track.id);
    const albumTracks = album ? this.safeAlbumTracks(album.id).filter((item) => this.isLocalTrack(item)) : [];
    const trackIds = albumTracks.map((item) => item.id);
    const lastIndex = trackIds.length - 1;
    if (!album || trackIds.length < fullAlbumMinimumTracks) {
      this.reverseAlbumRun = null;
      return;
    }

    const canContinue = this.reverseAlbumRun?.albumId === album.id &&
      this.reverseAlbumRun.trackIds[this.reverseAlbumRun.nextIndex] === track.id &&
      queueOrderPreservedExceptCompletedPrefix(
        this.reverseAlbumRun.queueIds,
        current.queueIds,
        current.queueId,
      );

    if (canContinue && this.reverseAlbumRun) {
      this.reverseAlbumRun.nextIndex -= 1;
      this.reverseAlbumRun.queueIds = current.queueIds;
    } else {
      this.reverseAlbumRun = track.id === trackIds[lastIndex]
        ? { albumId: album.id, trackIds, nextIndex: lastIndex - 1, queueIds: current.queueIds }
        : null;
    }

    if (this.reverseAlbumRun && this.reverseAlbumRun.nextIndex < 0) {
      this.unlock('ECHO_REVERSE_ALBUM');
      this.reverseAlbumRun = null;
    }
  }

  private advanceContinuousPlay(current: TrackProgress): void {
    if (
      current.sourceType !== 'continuous-play' ||
      !current.continuousQueueStayedIntact ||
      !current.queueId ||
      current.queueId === this.lastContinuousQueueId
    ) {
      this.resetContinuousPlay();
      return;
    }

    this.continuousPlayCount += 1;
    this.lastContinuousQueueId = current.queueId;
    if (this.continuousPlayCount >= continuousPlayTarget) {
      this.unlock('ECHO_CONTINUOUS_PLAY_FIVE');
      this.resetContinuousPlay();
    }
  }

  private abandonCurrent(resetPlaybackSession = false): void {
    if (
      this.current &&
      !this.current.finalized &&
      this.current.track &&
      this.isLocalTrack(this.current.track)
    ) {
      this.recordPlaybackFact(this.current, false, this.nowMs());
      this.sessionPlayedSeconds += this.current.playedSeconds;
    }
    this.current = null;
    this.albumRun = null;
    this.reverseAlbumRun = null;
    this.lastCompletedTrack = null;
    this.flipSideCandidate = null;
    this.repeatOneRun = null;
    this.manualQueueThreeRun = null;
    if (resetPlaybackSession) {
      this.completedDecades.clear();
      this.completedGenres.clear();
      this.completedArtists.clear();
      this.coverlessTrackIds.clear();
      this.friendlyShuffleTrackIds.clear();
      this.completedFormats.clear();
      this.hasCompletedShortTrack = false;
      this.hasCompletedLongTrack = false;
      this.albumBookends.clear();
      this.midnightTrackIds.clear();
      this.sessionPlayedSeconds = 0;
    }
    this.resetContinuousPlay();
  }

  private recordPlaybackFact(current: TrackProgress, qualifiedCompletion: boolean, endedAtMs: number): void {
    if (!current.track || !this.isLocalTrack(current.track) || current.playedSeconds <= 0) {
      return;
    }
    try {
      this.library.recordSteamAchievementPlaybackFact({
        trackId: current.track.id,
        artist: current.track.artist,
        startedAtMs: current.startedAtMs,
        endedAtMs,
        playedSeconds: current.playedSeconds,
        durationSeconds: current.durationSeconds,
        qualifiedCompletion,
      });
    } catch {
      // Achievement history persistence must never interrupt playback.
    }
  }

  private resetContinuousPlay(): void {
    this.continuousPlayCount = 0;
    this.lastContinuousQueueId = null;
  }

  private resolveLibraryTrack(status: AudioAchievementStatus): LibraryTrack | null {
    try {
      if (status.currentTrackId) {
        const byId = this.library.getTrack(status.currentTrackId);
        if (byId) {
          return byId;
        }
      }
      return status.currentFilePath ? this.library.getTrackByPath(status.currentFilePath) : null;
    } catch {
      return null;
    }
  }

  private resolveQueueContext(status: AudioAchievementStatus): QueueContext {
    try {
      const session = this.playbackSession.load();
      const item = session?.items.find((candidate) =>
        (status.currentQueueItemId && candidate.queueId === status.currentQueueItemId) ||
        (status.currentTrackId && candidate.track.id === status.currentTrackId) ||
        (status.currentFilePath && candidate.track.path === status.currentFilePath),
      ) ?? null;
      return {
        queueId: item?.queueId ?? status.currentQueueItemId ?? null,
        sourceType: item?.source.type ?? null,
        shape: session ? {
          continuousIds: session.items.filter((candidate) => candidate.source.type === 'continuous-play').map((candidate) => candidate.queueId),
          otherIds: session.items.filter((candidate) => candidate.source.type !== 'continuous-play').map((candidate) => candidate.queueId),
        } : null,
        queueIds: session?.items.map((candidate) => candidate.queueId) ?? null,
        isShuffleEnabled: session?.mode.isShuffleEnabled ?? false,
        isRepeatOneEnabled: session?.mode.repeatMode === 'one',
        allItemsManual: session?.items.length === 3 && session.items.every((candidate) => candidate.source.type === 'manual'),
        queueTrackIds: session?.items.map((candidate) => candidate.track.id) ?? null,
      };
    } catch {
      return {
        queueId: status.currentQueueItemId ?? null,
        sourceType: null,
        shape: null,
        queueIds: null,
        isShuffleEnabled: false,
        isRepeatOneEnabled: false,
        allItemsManual: false,
        queueTrackIds: null,
      };
    }
  }

  private findPreviousPlaybackAtMs(track: LibraryTrack, startedAtMs: number): number | null {
    try {
      const timestamps = this.library.getSteamAchievementPlaybackFacts({
        trackId: track.id,
        toMs: startedAtMs,
      }).map((fact) => fact.endedAtMs).filter(Number.isFinite);
      return timestamps.length > 0 ? Math.max(...timestamps) : null;
    } catch {
      return null;
    }
  }

  private isCustomPreset(presetId: string): boolean {
    try {
      return this.eq.listPresets().some((preset) => preset.id === presetId && !preset.readonly);
    } catch {
      return false;
    }
  }

  private safeEqState(): EqState {
    try {
      return this.eq.getState();
    } catch {
      return { enabled: false, preampDb: 0, bands: [], presetId: 'flat', presetName: 'Flat', clippingRisk: false };
    }
  }

  private safeAlbumForTrack(trackId: string): LibraryAlbum | null {
    try {
      return this.library.getAlbumForTrack(trackId);
    } catch {
      return null;
    }
  }

  private safeAlbumTracks(albumId: string): LibraryTrack[] {
    try {
      return this.library.getAllAlbumTracks(albumId);
    } catch {
      return [];
    }
  }

  private isLocalTrack(track: LibraryTrack): boolean {
    return (track.mediaType ?? 'local') === 'local' && !track.provider;
  }
}
