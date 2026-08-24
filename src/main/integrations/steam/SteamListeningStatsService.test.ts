import { describe, expect, it, vi } from 'vitest';
import type { SteamLeaderboardHistoryStats } from '../../library/SteamAchievementHistoryStats';
import { SteamListeningStatsService, steamListeningStatDefinitions } from './SteamListeningStatsService';

const historyStats: SteamLeaderboardHistoryStats = {
  totalPlayedSeconds: 6_125,
  completedUniqueTracks: 42,
  qualifiedCompletedPlayCount: 65,
  longestCompletionStreakDays: 7,
  nightPlayedSeconds: 3_659,
  hasFavoriteAlbum: false,
  completedShortUniqueTracks: 3,
  hasCompletedZhaoXiaoliuTrack: false,
  completedUniqueAlbums: 11,
  listeningSessionCount: 15,
  longestListeningSessionSeconds: 5_999,
  rediscoveredTrackCount: 4,
};

const createRuntime = (
  remote: Record<string, number | null> = {},
  storeResults: boolean[] = [true],
) => {
  const stats = {
    getInt: vi.fn((name: string) => Object.hasOwn(remote, name) ? remote[name] : 0),
    setInt: vi.fn((name: string, value: number) => {
      remote[name] = value;
      return true;
    }),
    store: vi.fn(() => storeResults.shift() ?? true),
  };
  return {
    stats,
    runtime: { getClient: vi.fn(() => ({ stats })) },
  };
};

describe('SteamListeningStatsService', () => {
  it('syncs achievement progress even when optional listening stats are disabled', async () => {
    const { runtime, stats } = createRuntime();
    const service = new SteamListeningStatsService({ runtime: runtime as never });

    const status = await service.sync(historyStats, false);

    expect(status).toMatchObject({ enabled: false, available: true, lastError: null });
    expect(stats.setInt.mock.calls).toEqual([
      ['ECHO_STAT_LISTEN_MINUTES', 102],
      ['ECHO_STAT_COMPLETED_PLAYS', 65],
      ['ECHO_STAT_UNIQUE_TRACKS', 42],
      ['ECHO_STAT_LONGEST_STREAK_DAYS', 7],
      ['ECHO_STAT_NIGHT_MINUTES', 60],
      ['ECHO_STAT_COMPLETED_ALBUMS', 11],
    ]);
    expect(stats.getInt).not.toHaveBeenCalledWith('ECHO_STAT_LONGEST_SESSION_MINUTES');
    expect(stats.getInt).not.toHaveBeenCalledWith('ECHO_STAT_REDISCOVERED_TRACKS');
    expect(stats.store).toHaveBeenCalledTimes(1);
  });

  it('publishes only the fixed integer aggregates and floors minute values', async () => {
    const { runtime, stats } = createRuntime();
    const service = new SteamListeningStatsService({
      runtime: runtime as never,
      now: () => new Date('2026-08-15T08:00:00.000Z'),
    });

    const status = await service.sync(historyStats, true);

    expect(stats.setInt.mock.calls).toEqual([
      ['ECHO_STAT_LISTEN_MINUTES', 102],
      ['ECHO_STAT_COMPLETED_PLAYS', 65],
      ['ECHO_STAT_UNIQUE_TRACKS', 42],
      ['ECHO_STAT_LONGEST_STREAK_DAYS', 7],
      ['ECHO_STAT_NIGHT_MINUTES', 60],
      ['ECHO_STAT_LONGEST_SESSION_MINUTES', 99],
      ['ECHO_STAT_REDISCOVERED_TRACKS', 4],
      ['ECHO_STAT_COMPLETED_ALBUMS', 11],
    ]);
    expect(stats.store).toHaveBeenCalledTimes(1);
    expect(status).toMatchObject({
      enabled: true,
      available: true,
      pendingStore: false,
      lastSyncedAt: '2026-08-15T08:00:00.000Z',
      lastUpdatedCount: 8,
      lastError: null,
    });
    expect(status.stats[0]).toMatchObject({ localValue: 102, steamValue: 102 });
  });

  it('never lowers a higher Steam value and skips StoreStats when nothing changed', async () => {
    const remote = Object.fromEntries(
      steamListeningStatDefinitions.map(({ apiName }) => [apiName, 20_000]),
    );
    const { runtime, stats } = createRuntime(remote);
    const service = new SteamListeningStatsService({ runtime: runtime as never });

    const status = await service.sync(historyStats, true);

    expect(stats.setInt).not.toHaveBeenCalled();
    expect(stats.store).not.toHaveBeenCalled();
    expect(status.stats.every((stat) => stat.lastSubmittedValue === 20_000)).toBe(true);
  });

  it('restores Steam account values when a new computer has no local history', async () => {
    const remote = Object.fromEntries(
      steamListeningStatDefinitions.map(({ apiName }, index) => [apiName, (index + 1) * 25]),
    );
    const { runtime, stats } = createRuntime(remote);
    const service = new SteamListeningStatsService({ runtime: runtime as never });
    const emptyHistory = Object.fromEntries(
      Object.keys(historyStats).map((key) => [key, key === 'hasFavoriteAlbum' || key === 'hasCompletedZhaoXiaoliuTrack' ? false : 0]),
    ) as SteamLeaderboardHistoryStats;

    const status = await service.sync(emptyHistory, true);

    expect(status).toMatchObject({ available: true, lastError: null });
    expect(status.stats.every((stat) => stat.localValue === 0 && stat.steamValue === remote[stat.apiName])).toBe(true);
    expect(stats.setInt).not.toHaveBeenCalled();
    expect(stats.store).not.toHaveBeenCalled();
  });

  it('fails closed when the fixed Steamworks schema is not fully published', async () => {
    const { runtime, stats } = createRuntime({ ECHO_STAT_COMPLETED_ALBUMS: null });
    const service = new SteamListeningStatsService({ runtime: runtime as never });

    const status = await service.sync(historyStats, true);

    expect(status).toMatchObject({ available: false, lastError: 'stats_not_published' });
    expect(stats.setInt).not.toHaveBeenCalled();
    expect(stats.store).not.toHaveBeenCalled();
  });

  it('does not let an unpublished optional stat block automatic achievement progress', async () => {
    const { runtime, stats } = createRuntime({
      ECHO_STAT_LONGEST_SESSION_MINUTES: null,
      ECHO_STAT_REDISCOVERED_TRACKS: null,
    });
    const service = new SteamListeningStatsService({ runtime: runtime as never });

    const status = await service.sync(historyStats, false);

    expect(status).toMatchObject({ enabled: false, available: true, lastError: null });
    expect(stats.getInt).not.toHaveBeenCalledWith('ECHO_STAT_LONGEST_SESSION_MINUTES');
    expect(stats.getInt).not.toHaveBeenCalledWith('ECHO_STAT_REDISCOVERED_TRACKS');
    expect(stats.setInt).toHaveBeenCalledWith('ECHO_STAT_COMPLETED_PLAYS', 65);
  });

  it('fails closed before writing when an achievement progress stat is unpublished', async () => {
    const { runtime, stats } = createRuntime({ ECHO_STAT_COMPLETED_PLAYS: null });
    const service = new SteamListeningStatsService({ runtime: runtime as never });

    const status = await service.sync(historyStats, false);

    expect(status).toMatchObject({ enabled: false, available: false, lastError: 'stats_not_published' });
    expect(stats.setInt).not.toHaveBeenCalled();
    expect(stats.store).not.toHaveBeenCalled();
  });

  it('keeps a pending StoreStats receipt and retries it even when no values changed', async () => {
    const { runtime, stats } = createRuntime({}, [false, true]);
    const service = new SteamListeningStatsService({ runtime: runtime as never });

    const first = await service.sync(historyStats, true);
    const second = await service.sync(historyStats, true);

    expect(first).toMatchObject({ pendingStore: true, lastError: 'store_failed' });
    expect(second).toMatchObject({ pendingStore: false, available: true, lastError: null });
    expect(stats.setInt).toHaveBeenCalledTimes(8);
    expect(stats.store).toHaveBeenCalledTimes(2);
  });

  it('provides a local-only preview without touching Steam', () => {
    const { runtime, stats } = createRuntime();
    const service = new SteamListeningStatsService({ runtime: runtime as never });

    const status = service.preview(historyStats, false);

    expect(status).toMatchObject({ enabled: false, pendingStore: false, lastError: null });
    expect(status.stats[1]).toMatchObject({ localValue: 65, steamValue: null, syncPolicy: 'achievement' });
    expect(runtime.getClient).not.toHaveBeenCalled();
    expect(stats.getInt).not.toHaveBeenCalled();
  });
});
