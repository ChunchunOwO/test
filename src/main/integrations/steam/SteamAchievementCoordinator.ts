import type {
  IntegrationEventEnvelopeV1,
  IntegrationPlaybackSnapshotV1,
} from '../../../shared/types/integrationPlatform';
import type {
  SteamAchievementId,
  SteamAchievementService,
} from './SteamCapabilityServices';
import {
  SteamAchievementProgressTracker,
  type AudioAchievementStatus,
  type AudioTrackAdvanceAchievementEvent,
  type SteamAchievementProgressOptions,
} from './SteamAchievementProgress';
import {
  qualifiedSteamDataAchievements,
  steamDataAchievementIds,
  steamHistoricalAchievementIds,
} from './SteamAchievementDataStats';

type AchievementPort = Pick<SteamAchievementService, 'isUnlocked' | 'unlock'>;

type EventHubPort = {
  getSnapshot(): IntegrationPlaybackSnapshotV1;
  subscribe(listener: (event: IntegrationEventEnvelopeV1) => void): () => void;
};

type AudioStatusPort = {
  getStatus(): AudioAchievementStatus;
  on(event: 'status', listener: (status: AudioAchievementStatus) => void): unknown;
  on(event: 'ended', listener: (status: AudioAchievementStatus) => void): unknown;
  on(event: 'track-advance', listener: (event: AudioTrackAdvanceAchievementEvent) => void): unknown;
  off(event: 'status', listener: (status: AudioAchievementStatus) => void): unknown;
  off(event: 'ended', listener: (status: AudioAchievementStatus) => void): unknown;
  off(event: 'track-advance', listener: (event: AudioTrackAdvanceAchievementEvent) => void): unknown;
};

type LibrarySummaryPort = SteamAchievementProgressOptions['library'] & {
  getSummary(): { songCount: number };
  getSteamAchievementHistoryStats(): {
    totalPlayedSeconds: number;
    completedUniqueTracks: number;
    qualifiedCompletedPlayCount: number;
    longestCompletionStreakDays: number;
    nightPlayedSeconds: number;
    hasFavoriteAlbum: boolean;
    completedShortUniqueTracks: number;
    hasCompletedZhaoXiaoliuTrack: boolean;
    completedUniqueAlbums: number;
  };
};

type EqStatusPort = SteamAchievementProgressOptions['eq'] & {
  on(event: 'state', listener: (state: ReturnType<SteamAchievementProgressOptions['eq']['getState']>) => void): unknown;
  off(event: 'state', listener: (state: ReturnType<SteamAchievementProgressOptions['eq']['getState']>) => void): unknown;
};

export type SteamAchievementCoordinatorOptions = {
  achievements: AchievementPort;
  events: EventHubPort;
  audio: AudioStatusPort;
  library: LibrarySummaryPort;
  playbackSession: SteamAchievementProgressOptions['playbackSession'];
  eq: EqStatusPort;
  now?: () => Date;
  pollIntervalMs?: number;
};

const libraryOver500Threshold = 500;
const dataStatsPollIntervalMs = 60_000;

export class SteamAchievementCoordinator {
  private readonly achievements: AchievementPort;
  private readonly events: EventHubPort;
  private readonly audio: AudioStatusPort;
  private readonly library: LibrarySummaryPort;
  private readonly eq: EqStatusPort;
  private readonly now: () => Date;
  private readonly pollIntervalMs: number;
  private readonly completed = new Set<SteamAchievementId>();
  private readonly pendingUnlocks = new Set<SteamAchievementId>();
  private readonly progress: SteamAchievementProgressTracker;
  private unsubscribe: (() => void) | null = null;
  private audioListening = false;
  private eqListening = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastDataStatsEvaluationAtMs: number | null = null;

  constructor(options: SteamAchievementCoordinatorOptions) {
    this.achievements = options.achievements;
    this.events = options.events;
    this.audio = options.audio;
    this.library = options.library;
    this.eq = options.eq;
    this.now = options.now ?? (() => new Date());
    this.pollIntervalMs = options.pollIntervalMs ?? 15_000;
    this.progress = new SteamAchievementProgressTracker({
      library: options.library,
      playbackSession: options.playbackSession,
      eq: options.eq,
      unlock: (achievementId) => this.tryUnlock(achievementId),
      nowMs: () => this.now().getTime(),
    });
  }

  start(): void {
    if (this.unsubscribe || this.audioListening || this.pollTimer) {
      return;
    }

    this.evaluatePersistentConditions();
    const initialAudioStatus = this.audio.getStatus();
    this.evaluateAudioStatus(initialAudioStatus);
    this.progress.onAudioStatus(initialAudioStatus);
    this.audio.on('status', this.handleAudioStatus);
    this.audio.on('ended', this.handlePlaybackEnded);
    this.audio.on('track-advance', this.handleTrackAdvance);
    this.audioListening = true;
    this.eq.on('state', this.handleEqState);
    this.eqListening = true;
    this.unsubscribe = this.events.subscribe((event) => {
      this.evaluatePlayback(event.snapshot);
    });
    this.pollTimer = setInterval(() => {
      this.evaluatePersistentConditions();
      try {
        this.evaluatePlayback(this.events.getSnapshot());
      } catch {
        // A transient playback snapshot failure is retried on the next tick.
      }
      try {
        const status = this.audio.getStatus();
        this.evaluateAudioStatus(status);
        this.progress.onAudioStatus(status);
      } catch {
        // Audio Core may be restarting; retry from the next status or poll.
      }
    }, this.pollIntervalMs);
    this.pollTimer.unref?.();
  }

  dispose(): void {
    this.progress.dispose();
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.audioListening) {
      this.audio.off('status', this.handleAudioStatus);
      this.audio.off('ended', this.handlePlaybackEnded);
      this.audio.off('track-advance', this.handleTrackAdvance);
      this.audioListening = false;
    }
    if (this.eqListening) {
      this.eq.off('state', this.handleEqState);
      this.eqListening = false;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private evaluatePersistentConditions(): void {
    for (const achievementId of this.pendingUnlocks) {
      this.tryUnlock(achievementId);
    }
    if (
      !this.completed.has('ECHO_FIRST_LOCAL_IMPORT') ||
      !this.completed.has('ECHO_LIBRARY_OVER_500')
    ) {
      try {
        const songCount = this.library.getSummary().songCount;
        if (songCount > 0) {
          this.tryUnlock('ECHO_FIRST_LOCAL_IMPORT');
        }
        if (songCount > libraryOver500Threshold) {
          this.tryUnlock('ECHO_LIBRARY_OVER_500');
        }
      } catch {
        // Library startup/recovery can temporarily make summary reads unavailable.
      }
    }

    this.evaluateDataAchievements();
  }

  private evaluateDataAchievements(): void {
    const historicalAchievementsComplete = steamHistoricalAchievementIds.every((achievementId) => this.completed.has(achievementId));
    if (historicalAchievementsComplete) {
      this.tryUnlock('ECHO_STATS_YEARBOOK');
      if (this.completed.has('ECHO_ZHAO_XIAOLIU_HANDSOME')) {
        return;
      }
    }
    const nowMs = this.now().getTime();
    if (
      this.lastDataStatsEvaluationAtMs !== null &&
      nowMs >= this.lastDataStatsEvaluationAtMs &&
      nowMs - this.lastDataStatsEvaluationAtMs < dataStatsPollIntervalMs
    ) {
      return;
    }
    this.lastDataStatsEvaluationAtMs = nowMs;

    try {
      const stats = this.library.getSteamAchievementHistoryStats();
      const qualified = qualifiedSteamDataAchievements(stats);
      for (const achievementId of qualified) {
        this.tryUnlock(achievementId);
      }
      if (stats.hasCompletedZhaoXiaoliuTrack) {
        this.tryUnlock('ECHO_ZHAO_XIAOLIU_HANDSOME');
      }
      for (const achievementId of steamHistoricalAchievementIds) {
        this.rememberIfUnlocked(achievementId);
      }
      if (steamDataAchievementIds.every((achievementId) => this.completed.has(achievementId))) {
        this.tryUnlock('ECHO_STATS_YEARBOOK');
      }
    } catch {
      // History can be unavailable during library startup/recovery; retry later.
    }
  }

  private evaluatePlayback(snapshot: IntegrationPlaybackSnapshotV1): void {
    if (
      snapshot.state === 'playing' &&
      snapshot.track !== null &&
      this.now().getHours() === 0
    ) {
      this.tryUnlock('ECHO_MIDNIGHT_LISTENER');
    }
  }

  private readonly handleAudioStatus = (status: AudioAchievementStatus): void => {
    this.evaluateAudioStatus(status);
    this.progress.onAudioStatus(status);
  };

  private readonly handlePlaybackEnded = (status: AudioAchievementStatus): void => {
    this.progress.onPlaybackEnded(status);
  };

  private readonly handleTrackAdvance = (event: AudioTrackAdvanceAchievementEvent): void => {
    this.progress.onTrackAdvance(event);
  };

  private readonly handleEqState = (state: ReturnType<EqStatusPort['getState']>): void => {
    this.progress.onEqState(state);
  };

  private evaluateAudioStatus(status: AudioAchievementStatus): void {
    if (status.state === 'playing' && status.bitPerfectCandidate) {
      this.tryUnlock('ECHO_FIRST_BIT_PERFECT');
    }
  }

  private tryUnlock(achievementId: SteamAchievementId): void {
    if (this.completed.has(achievementId)) {
      return;
    }

    this.pendingUnlocks.add(achievementId);
    try {
      if (this.achievements.isUnlocked(achievementId) === true) {
        this.completed.add(achievementId);
        this.pendingUnlocks.delete(achievementId);
        return;
      }
      if (this.achievements.unlock(achievementId)) {
        this.completed.add(achievementId);
        this.pendingUnlocks.delete(achievementId);
      }
    } catch {
      // Steam can become ready after startup; leave the condition retryable.
    }
  }

  private rememberIfUnlocked(achievementId: SteamAchievementId): void {
    if (this.completed.has(achievementId)) {
      return;
    }
    try {
      if (this.achievements.isUnlocked(achievementId) === true) {
        this.completed.add(achievementId);
      }
    } catch {
      // Steam can become ready after startup; retry on the next evaluation.
    }
  }
}
