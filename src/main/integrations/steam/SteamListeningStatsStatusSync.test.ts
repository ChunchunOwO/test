import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  settings: { steamListeningStatsEnabled: false },
  historyStats: { qualifiedCompletedPlayCount: 65 },
  sync: vi.fn(),
  getStatus: vi.fn(),
  preview: vi.fn(),
  setRetryState: vi.fn(),
}));

vi.mock('../../app/appSettings', () => ({
  getAppSettings: () => mocks.settings,
}));

vi.mock('../../library/LibraryService', () => ({
  getLibraryService: () => ({
    getSteamLeaderboardHistoryStats: () => mocks.historyStats,
  }),
}));

vi.mock('./SteamworksService', () => ({
  getSteamListeningStatsService: () => ({
    sync: mocks.sync,
    getStatus: mocks.getStatus,
    preview: mocks.preview,
    setRetryState: mocks.setRetryState,
  }),
}));

describe('SteamListeningStatsStatusSync', () => {
  afterEach(async () => {
    const { disposeSteamListeningStatsIntegration } = await import('./SteamListeningStatsStatusSync');
    disposeSteamListeningStatsIntegration();
    vi.useRealTimers();
  });

  beforeEach(() => {
    mocks.settings.steamListeningStatsEnabled = false;
    mocks.sync.mockReset();
    mocks.getStatus.mockReset();
    mocks.preview.mockReset();
    mocks.setRetryState.mockReset();
  });

  it('syncs achievement progress when optional stats are disabled', async () => {
    const expected = { enabled: false, available: true };
    mocks.sync.mockResolvedValue(expected);
    const { syncSteamListeningStatsNow } = await import('./SteamListeningStatsStatusSync');

    await expect(syncSteamListeningStatsNow()).resolves.toBe(expected);
    expect(mocks.sync).toHaveBeenCalledWith(mocks.historyStats, false);
  });

  it('preserves the optional scope when it is enabled', async () => {
    mocks.settings.steamListeningStatsEnabled = true;
    const expected = { enabled: true, available: true };
    mocks.sync.mockResolvedValue(expected);
    const { syncSteamListeningStatsNow } = await import('./SteamListeningStatsStatusSync');

    await expect(syncSteamListeningStatsNow()).resolves.toBe(expected);
    expect(mocks.sync).toHaveBeenCalledWith(mocks.historyStats, true);
  });

  it('shares one remote reconciliation between startup and page readers', async () => {
    const expected = { enabled: true, available: true };
    let resolveSync!: (value: typeof expected) => void;
    mocks.settings.steamListeningStatsEnabled = true;
    mocks.sync.mockImplementation(() => new Promise((resolve) => { resolveSync = resolve; }));
    const { syncSteamListeningStatsNow } = await import('./SteamListeningStatsStatusSync');

    const startupSync = syncSteamListeningStatsNow();
    const pageSync = syncSteamListeningStatsNow();

    expect(pageSync).toBe(startupSync);
    expect(mocks.sync).toHaveBeenCalledTimes(1);
    resolveSync(expected);
    await expect(startupSync).resolves.toBe(expected);
    await expect(pageSync).resolves.toBe(expected);
  });

  it('retries a failed Steam write without waiting for the ten-minute cadence', async () => {
    vi.useFakeTimers();
    const failed = { enabled: true, available: false, lastError: 'steam_unavailable' };
    const recovered = { enabled: true, available: true, lastError: null };
    mocks.settings.steamListeningStatsEnabled = true;
    mocks.sync.mockResolvedValueOnce(failed).mockResolvedValueOnce(recovered);
    mocks.getStatus.mockReturnValue(failed);
    const { syncSteamListeningStatsNow } = await import('./SteamListeningStatsStatusSync');

    await expect(syncSteamListeningStatsNow()).resolves.toBe(failed);
    expect(mocks.setRetryState).toHaveBeenCalledWith(true, expect.any(String), 1);

    await vi.advanceTimersByTimeAsync(5_000);

    expect(mocks.sync).toHaveBeenCalledTimes(2);
  });
});
