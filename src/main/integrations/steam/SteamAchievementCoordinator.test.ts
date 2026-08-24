import { describe, expect, it, vi } from 'vitest';
import type {
  IntegrationEventEnvelopeV1,
  IntegrationPlaybackSnapshotV1,
} from '../../../shared/types/integrationPlatform';
import type { EqState } from '../../../shared/types/eq';
import {
  SteamAchievementCoordinator,
  type SteamAchievementCoordinatorOptions,
} from './SteamAchievementCoordinator';
import type { AudioAchievementStatus } from './SteamAchievementProgress';

const snapshot = (
  state: IntegrationPlaybackSnapshotV1['state'] = 'idle',
): IntegrationPlaybackSnapshotV1 => ({
  version: 1,
  revision: 1,
  observedAt: '2026-08-13T00:05:00.000Z',
  state,
  track: state === 'playing'
    ? {
        id: 'track-1',
        title: 'Aurora',
        artist: 'ECHO',
        album: null,
        albumArtist: null,
        artworkUrl: null,
      }
    : null,
  positionMs: 0,
  durationMs: 180_000,
  volume: 1,
  output: { mode: 'shared', deviceName: null, backend: null },
});

const createHarness = (options: {
  songCount?: number;
  hour?: number;
  bitPerfect?: boolean;
  dataStats?: Partial<{
    totalPlayedSeconds: number;
    completedUniqueTracks: number;
    qualifiedCompletedPlayCount: number;
    longestCompletionStreakDays: number;
    nightPlayedSeconds: number;
    hasFavoriteAlbum: boolean;
    completedShortUniqueTracks: number;
    hasCompletedZhaoXiaoliuTrack: boolean;
    completedUniqueAlbums: number;
  }>;
} = {}) => {
  let listener: ((event: IntegrationEventEnvelopeV1) => void) | null = null;
  let audioListener: ((status: AudioAchievementStatus) => void) | null = null;
  let currentSnapshot = snapshot();
  let currentAudioStatus: AudioAchievementStatus = {
    state: 'idle',
    bitPerfectCandidate: options.bitPerfect ?? false,
    currentFilePath: null,
    currentTrackId: null,
    currentQueueItemId: null,
    positionSeconds: 0,
      durationSeconds: 0,
      volume: 1,
      playbackRate: 1,
  };
  const unlock = vi.fn((_id: string) => true);
  const isUnlocked = vi.fn((_id: string) => false);
  const audio = {
    getStatus: () => currentAudioStatus,
    on: (event: string, nextListener: (...args: never[]) => void) => {
      if (event === 'status') {
        audioListener = nextListener as unknown as (status: AudioAchievementStatus) => void;
      }
    },
    off: (event: string, _nextListener: (...args: never[]) => void) => {
      if (event === 'status') {
        audioListener = null;
      }
    },
  } as SteamAchievementCoordinatorOptions['audio'];
  const eqState: EqState = {
    enabled: false,
    preampDb: 0,
    bands: [],
    presetId: 'flat',
    presetName: 'Flat',
    clippingRisk: false,
  };
  const coordinator = new SteamAchievementCoordinator({
    achievements: { unlock, isUnlocked },
    events: {
      getSnapshot: () => currentSnapshot,
      subscribe: (nextListener) => {
        listener = nextListener;
        return () => {
          listener = null;
        };
      },
    },
    audio,
    library: {
      getSummary: () => ({ songCount: options.songCount ?? 0 }),
      getSteamAchievementHistoryStats: () => ({
        totalPlayedSeconds: 0,
        completedUniqueTracks: 0,
        qualifiedCompletedPlayCount: 0,
        longestCompletionStreakDays: 0,
        nightPlayedSeconds: 0,
        hasFavoriteAlbum: false,
        completedShortUniqueTracks: 0,
        hasCompletedZhaoXiaoliuTrack: false,
        completedUniqueAlbums: 0,
        ...options.dataStats,
      }),
      getTrack: () => null,
      getTrackByPath: () => null,
      getAlbumForTrack: () => null,
      getAllAlbumTracks: () => [],
      recordSteamAchievementPlaybackFact: () => undefined,
      getSteamAchievementPlaybackFacts: () => [],
    },
    playbackSession: { load: () => null },
    eq: {
      getState: () => eqState,
      listPresets: () => [],
      on: () => undefined,
      off: () => undefined,
    },
    now: () => new Date(2026, 7, 13, options.hour ?? 12, 5),
    pollIntervalMs: 60_000,
  });

  return {
    coordinator,
    unlock,
    emit: (next: IntegrationPlaybackSnapshotV1) => {
      currentSnapshot = next;
      listener?.({
        version: 1,
        id: '1',
        type: 'playback.state.changed',
        occurredAt: next.observedAt,
        snapshot: next,
      });
    },
    emitAudio: (next: Pick<AudioAchievementStatus, 'state' | 'bitPerfectCandidate'>) => {
      currentAudioStatus = { ...currentAudioStatus, ...next };
      audioListener?.(currentAudioStatus);
    },
  };
};

describe('SteamAchievementCoordinator', () => {
  it('unlocks first import and 500-song milestones', () => {
    const harness = createHarness({ songCount: 501 });
    harness.coordinator.start();

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_FIRST_LOCAL_IMPORT');
    expect(harness.unlock).toHaveBeenCalledWith('ECHO_LIBRARY_OVER_500');
    harness.coordinator.dispose();
  });

  it('requires more than 500 local songs for the library milestone', () => {
    const harness = createHarness({ songCount: 500 });
    harness.coordinator.start();

    expect(harness.unlock).not.toHaveBeenCalledWith('ECHO_LIBRARY_OVER_500');
    harness.coordinator.dispose();
  });

  it('unlocks the midnight achievement only while a track is playing at local hour zero', () => {
    const midnight = createHarness({ hour: 0 });
    midnight.coordinator.start();
    midnight.emit(snapshot('playing'));
    expect(midnight.unlock).toHaveBeenCalledWith('ECHO_MIDNIGHT_LISTENER');
    midnight.coordinator.dispose();

    const daytime = createHarness({ hour: 12 });
    daytime.coordinator.start();
    daytime.emit(snapshot('playing'));
    expect(daytime.unlock).not.toHaveBeenCalledWith('ECHO_MIDNIGHT_LISTENER');
    daytime.coordinator.dispose();
  });

  it('unlocks Bit-Perfect only from Audio Core playing status', () => {
    const harness = createHarness();
    harness.coordinator.start();

    harness.emitAudio({ state: 'idle', bitPerfectCandidate: true });
    harness.emitAudio({ state: 'playing', bitPerfectCandidate: false });
    expect(harness.unlock).not.toHaveBeenCalledWith('ECHO_FIRST_BIT_PERFECT');

    harness.emitAudio({ state: 'playing', bitPerfectCandidate: true });
    expect(harness.unlock).toHaveBeenCalledWith('ECHO_FIRST_BIT_PERFECT');
    harness.coordinator.dispose();
  });

  it('does not repeatedly activate an achievement once Steam reports success', () => {
    const harness = createHarness({ songCount: 1 });
    harness.coordinator.start();
    harness.coordinator.start();

    expect(harness.unlock.mock.calls.filter(([id]) => id === 'ECHO_FIRST_LOCAL_IMPORT')).toHaveLength(1);
    harness.coordinator.dispose();
  });

  it('retries a one-shot achievement when Steam temporarily rejects activation', () => {
    vi.useFakeTimers();
    const harness = createHarness();
    let steamReady = false;
    harness.unlock.mockImplementation((id) => id === 'ECHO_FIRST_BIT_PERFECT' ? steamReady : true);
    try {
      harness.coordinator.start();
      harness.emitAudio({ state: 'playing', bitPerfectCandidate: true });
      harness.emitAudio({ state: 'playing', bitPerfectCandidate: false });
      expect(harness.unlock.mock.calls.filter(([id]) => id === 'ECHO_FIRST_BIT_PERFECT')).toHaveLength(1);

      steamReady = true;
      vi.advanceTimersByTime(60_000);
      expect(harness.unlock.mock.calls.filter(([id]) => id === 'ECHO_FIRST_BIT_PERFECT')).toHaveLength(2);
    } finally {
      harness.coordinator.dispose();
      vi.useRealTimers();
    }
  });

  it('unlocks the five data milestones and their yearbook meta-achievement', () => {
    const harness = createHarness({
      dataStats: {
        totalPlayedSeconds: 360_000,
        completedUniqueTracks: 100,
        longestCompletionStreakDays: 7,
        nightPlayedSeconds: 18_000,
        hasFavoriteAlbum: true,
      },
    });
    harness.coordinator.start();

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_STATS_LISTENING_100_HOURS');
    expect(harness.unlock).toHaveBeenCalledWith('ECHO_STATS_100_COMPLETED_TRACKS');
    expect(harness.unlock).toHaveBeenCalledWith('ECHO_STATS_SEVEN_DAY_STREAK');
    expect(harness.unlock).toHaveBeenCalledWith('ECHO_STATS_NIGHT_5_HOURS');
    expect(harness.unlock).toHaveBeenCalledWith('ECHO_STATS_FAVORITE_ALBUM');
    expect(harness.unlock).toHaveBeenCalledWith('ECHO_STATS_YEARBOOK');
    harness.coordinator.dispose();
  });

  it('does not unlock data milestones below their thresholds', () => {
    const harness = createHarness({
      dataStats: {
        totalPlayedSeconds: 359_999,
        completedUniqueTracks: 99,
        longestCompletionStreakDays: 6,
        nightPlayedSeconds: 17_999,
        hasFavoriteAlbum: false,
      },
    });
    harness.coordinator.start();

    expect(harness.unlock).not.toHaveBeenCalledWith('ECHO_STATS_LISTENING_100_HOURS');
    expect(harness.unlock).not.toHaveBeenCalledWith('ECHO_STATS_100_COMPLETED_TRACKS');
    expect(harness.unlock).not.toHaveBeenCalledWith('ECHO_STATS_SEVEN_DAY_STREAK');
    expect(harness.unlock).not.toHaveBeenCalledWith('ECHO_STATS_NIGHT_5_HOURS');
    expect(harness.unlock).not.toHaveBeenCalledWith('ECHO_STATS_FAVORITE_ALBUM');
    expect(harness.unlock).not.toHaveBeenCalledWith('ECHO_STATS_YEARBOOK');
    harness.coordinator.dispose();
  });

  it('restores looks off the charts from a previously completed local playback', () => {
    const harness = createHarness({
      dataStats: { hasCompletedZhaoXiaoliuTrack: true },
    });
    harness.coordinator.start();

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_ZHAO_XIAOLIU_HANDSOME');
    harness.coordinator.dispose();
  });

  it('unlocks every cumulative completion milestone from qualified local history', () => {
    const harness = createHarness({
      dataStats: { qualifiedCompletedPlayCount: 10_000 },
    });
    harness.coordinator.start();

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_COMPLETED_250');
    expect(harness.unlock).toHaveBeenCalledWith('ECHO_COMPLETED_500');
    expect(harness.unlock).toHaveBeenCalledWith('ECHO_COMPLETED_1000');
    expect(harness.unlock).toHaveBeenCalledWith('ECHO_COMPLETED_2500');
    expect(harness.unlock).toHaveBeenCalledWith('ECHO_COMPLETED_5000');
    expect(harness.unlock).toHaveBeenCalledWith('ECHO_COMPLETED_10000');
    harness.coordinator.dispose();
  });

  it('does not unlock the first cumulative completion milestone below 250 plays', () => {
    const harness = createHarness({
      dataStats: { qualifiedCompletedPlayCount: 249 },
    });
    harness.coordinator.start();

    expect(harness.unlock).not.toHaveBeenCalledWith('ECHO_COMPLETED_250');
    harness.coordinator.dispose();
  });

  it('unlocks short and sweet from five distinct completed short local tracks', () => {
    const harness = createHarness({
      dataStats: { completedShortUniqueTracks: 5 },
    });
    harness.coordinator.start();

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_TEN_SHORT_TRACKS');
    harness.coordinator.dispose();
  });

  it('unlocks cover traveler from ten completed local albums', () => {
    const harness = createHarness({
      dataStats: { completedUniqueAlbums: 10 },
    });
    harness.coordinator.start();

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_TEN_ALBUMS');
    harness.coordinator.dispose();
  });
});
