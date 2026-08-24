import { describe, expect, it, vi } from 'vitest';
import { SteamLeaderboardService } from './SteamLeaderboardService';
import type { SteamLeaderboardNativeBinding } from './SteamLeaderboardNative';

const historyStats = {
  totalPlayedSeconds: 7_261.8,
  completedUniqueTracks: 42.9,
  qualifiedCompletedPlayCount: 77,
  completedShortUniqueTracks: 18,
  longestCompletionStreakDays: 5,
  nightPlayedSeconds: 120,
  hasFavoriteAlbum: false,
  hasCompletedZhaoXiaoliuTrack: false,
  completedUniqueAlbums: 0,
  listeningSessionCount: 12,
  longestListeningSessionSeconds: 1_800,
  rediscoveredTrackCount: 3,
};

const createRuntime = () => ({
  getClient: () => ({
    localplayer: {
      getName: () => 'ECHO Listener',
      getSteamId: () => ({ steamId64: 76561198000000001n }),
    },
  }),
});

const createBinding = (): SteamLeaderboardNativeBinding => ({
  initialize: vi.fn(() => true),
  findLeaderboard: vi.fn(async (name: string) => (new Map<string, bigint>(Object.entries({
    ECHO_LISTENING_SECONDS_V1: 101n,
    ECHO_COMPLETED_TRACKS_V1: 202n,
    ECHO_LONGEST_STREAK_DAYS_V1: 303n,
    ECHO_LONGEST_SESSION_SECONDS_V1: 404n,
    ECHO_REDISCOVERED_TRACKS_V1: 505n,
  }))).get(name) ?? 0n),
  uploadScore: vi.fn(async (_handle: bigint, score: number) => ({
    changed: true,
    score,
    globalRank: score === 7_261 ? 8 : 12,
    previousGlobalRank: 0,
  })),
  downloadEntries: vi.fn(async () => [
    { steamId: '76561198000000001', rank: 8, score: 7_261, playerName: null, details: [42, 12, 1_800, 5, 120, 3, 18] },
    { steamId: '76561198000000002', rank: 9, score: 6_900, playerName: 'Friend', details: [] },
  ]),
});

describe('SteamLeaderboardService', () => {
  it('uploads only fixed aggregate scores and keeps the native bridge behind main', async () => {
    const binding = createBinding();
    const service = new SteamLeaderboardService({
      runtime: createRuntime() as never,
      loadBinding: () => binding,
      now: () => new Date('2026-08-15T05:00:00.000Z'),
    });

    const status = await service.sync(historyStats, true);

    expect(binding.findLeaderboard).toHaveBeenNthCalledWith(1, 'ECHO_LISTENING_SECONDS_V1');
    expect(binding.findLeaderboard).toHaveBeenNthCalledWith(2, 'ECHO_COMPLETED_TRACKS_V1');
    expect(binding.findLeaderboard).toHaveBeenNthCalledWith(3, 'ECHO_LONGEST_STREAK_DAYS_V1');
    expect(binding.findLeaderboard).toHaveBeenNthCalledWith(4, 'ECHO_LONGEST_SESSION_SECONDS_V1');
    expect(binding.findLeaderboard).toHaveBeenNthCalledWith(5, 'ECHO_REDISCOVERED_TRACKS_V1');
    const details = [42, 12, 1_800, 5, 120, 3, 18];
    expect(binding.uploadScore).toHaveBeenNthCalledWith(1, 101n, 7_261, details);
    expect(binding.uploadScore).toHaveBeenNthCalledWith(2, 202n, 42, details);
    expect(binding.uploadScore).toHaveBeenNthCalledWith(3, 303n, 5, details);
    expect(binding.uploadScore).toHaveBeenNthCalledWith(4, 404n, 1_800, details);
    expect(binding.uploadScore).toHaveBeenNthCalledWith(5, 505n, 3, details);
    expect(status).toMatchObject({
      enabled: true,
      available: true,
      lastSyncedAt: '2026-08-15T05:00:00.000Z',
      lastError: null,
    });
  });

  it('returns typed entries without exposing Steam IDs to renderer IPC', async () => {
    const binding = createBinding();
    const service = new SteamLeaderboardService({
      runtime: createRuntime() as never,
      loadBinding: () => binding,
    });

    const snapshot = await service.getSnapshot('listening-time', 'around-user', true);

    expect(binding.downloadEntries).toHaveBeenCalledWith(101n, 1, -4, 5);
    expect(snapshot.entries).toEqual([
      {
        rank: 8,
        score: 7_261,
        playerName: 'ECHO Listener',
        isCurrentUser: true,
        details: {
          completedUniqueTracks: 42,
          listeningSessionCount: 12,
          longestListeningSessionSeconds: 1_800,
          longestListeningStreakDays: 5,
          nightListeningSeconds: 120,
          rediscoveredTrackCount: 3,
          completedShortUniqueTracks: 18,
        },
      },
      {
        rank: 9,
        score: 6_900,
        playerName: 'Friend',
        isCurrentUser: false,
        details: {
          completedUniqueTracks: 0,
          listeningSessionCount: 0,
          longestListeningSessionSeconds: 0,
          longestListeningStreakDays: 0,
          nightListeningSeconds: 0,
          rediscoveredTrackCount: 0,
          completedShortUniqueTracks: 0,
        },
      },
    ]);
    expect(snapshot.entries[0]).not.toHaveProperty('steamId');
    expect(snapshot.status.boards.find((board) => board.id === 'listening-time')?.lastGlobalRank).toBe(8);
  });

  it('does not load or submit anything until participation is enabled', async () => {
    const loadBinding = vi.fn(() => createBinding());
    const service = new SteamLeaderboardService({ runtime: createRuntime() as never, loadBinding });

    const status = await service.sync(historyStats, false);

    expect(status.enabled).toBe(false);
    expect(loadBinding).not.toHaveBeenCalled();
  });

  it('retries one transient Steam request without dropping the board', async () => {
    const binding = createBinding();
    vi.mocked(binding.uploadScore)
      .mockRejectedValueOnce(new Error('temporary Steam transport failure'))
      .mockRejectedValueOnce(new Error('temporary Steam rate limit'))
      .mockResolvedValue({ changed: true, score: 7_261, globalRank: 8, previousGlobalRank: 0 });
    const service = new SteamLeaderboardService({ runtime: createRuntime() as never, loadBinding: () => binding });

    const status = await service.sync(historyStats, true);

    expect(binding.uploadScore).toHaveBeenCalledTimes(7);
    expect(status.boards.every((board) => board.available)).toBe(true);
    expect(status.lastError).toBeNull();
  });
});
