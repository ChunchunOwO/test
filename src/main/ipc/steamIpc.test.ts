import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '../../shared/constants/ipcChannels';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  runtimeStatus: {
    state: 'ready',
    appId: 123456,
    message: 'Steamworks is connected.',
  },
  presenceStatus: {
    mode: 'detailed',
    enabled: true,
    showAlbum: false,
    showProgress: false,
    publicationState: 'published',
    preview: 'Playing: Starlight - ECHO',
    lastPublishedAt: '2026-08-11T04:00:00.000Z',
    lastError: null,
  },
  cloudStatus: {
    enabled: true,
    available: true,
    syncState: 'synced',
    fileName: 'echo-steam-settings-v1.json',
    remoteUpdatedAt: '2026-08-14T04:00:00.000Z',
    lastAttemptedAt: '2026-08-14T04:00:00.000Z',
    lastSucceededAt: '2026-08-14T04:00:00.000Z',
    lastUploadedAt: null,
    lastDownloadedAt: null,
    nextRetryAt: null,
    retryCount: 0,
    settingsCount: 2,
    pendingUpload: false,
    lastError: null,
  },
  leaderboardStatus: {
    enabled: false,
    available: false,
    lastSyncedAt: null,
    lastError: null,
    boards: [],
  },
  listeningStatsStatus: {
    enabled: false,
    available: false,
    syncState: 'idle',
    pendingStore: false,
    pendingCount: 0,
    lastAttemptedAt: null,
    lastSyncedAt: null,
    nextRetryAt: null,
    retryCount: 0,
    lastUpdatedCount: 0,
    lastError: null,
    stats: [],
  },
  listenTogetherProbeStatus: {
    enabled: true,
    available: true,
    state: 'idle',
    role: 'none',
    lobbyId: null,
    memberCount: 0,
    transportRunning: false,
    protocolVersion: 1,
    targetKbps: 317,
    sentPackets: 0,
    sentBytes: 0,
    sendFailures: 0,
    receivedPackets: 0,
    receivedBytes: 0,
    receivedKbps: 0,
    estimatedLostPackets: 0,
    estimatedLossPercent: 0,
    averageRttMs: null,
    lastPacketAt: null,
    lastError: null,
  },
  listenTogetherStatus: {
    available: true,
    state: 'connected',
    role: 'host',
    lobbyId: '9001',
    memberCount: 2,
    memberLimit: 4,
    localPlayerName: 'Host',
    syncState: 'host',
    playback: null,
    recentReactions: [],
    lastHostUpdateAt: null,
    lastError: null,
  },
  joinListenTogetherRoom: vi.fn(),
  joinProductListenTogetherRoom: vi.fn(),
  sendListenTogetherReaction: vi.fn(),
  syncListeningStatsNow: vi.fn(async () => undefined as unknown),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => mocks.handlers.set(channel, handler)),
  },
}));

vi.mock('../integrations/steam/SteamworksService', () => ({
  getSteamStatus: vi.fn(() => mocks.runtimeStatus),
  getSteamListeningStatsService: vi.fn(() => ({
    getStatus: vi.fn((enabled) => ({ ...mocks.listeningStatsStatus, enabled })),
  })),
  getSteamLeaderboardService: vi.fn(() => ({
    getStatus: vi.fn((enabled) => ({ ...mocks.leaderboardStatus, enabled })),
    getSnapshot: vi.fn(async (boardId, scope, enabled) => ({
      status: { ...mocks.leaderboardStatus, enabled },
      boardId,
      scope,
      entries: [],
    })),
  })),
  getSteamListenTogetherProbeService: vi.fn(() => ({
    getSnapshot: vi.fn(() => mocks.listenTogetherProbeStatus),
    createRoom: vi.fn(async () => ({ ...mocks.listenTogetherProbeStatus, role: 'host' })),
    joinRoom: mocks.joinListenTogetherRoom,
    openInviteDialog: vi.fn(() => mocks.listenTogetherProbeStatus),
    leaveRoom: vi.fn(() => mocks.listenTogetherProbeStatus),
  })),
  getSteamListenTogetherService: vi.fn(() => ({
    getSnapshot: vi.fn(() => mocks.listenTogetherStatus),
    createRoom: vi.fn(async () => mocks.listenTogetherStatus),
    joinRoom: mocks.joinProductListenTogetherRoom,
    openInviteDialog: vi.fn(() => mocks.listenTogetherStatus),
    leaveRoom: vi.fn(() => mocks.listenTogetherStatus),
    sendReaction: mocks.sendListenTogetherReaction,
    requestSync: vi.fn(async () => mocks.listenTogetherStatus),
  })),
}));

vi.mock('../integrations/steam/SteamLeaderboardStatusSync', () => ({
  syncSteamLeaderboardsNow: vi.fn(async () => mocks.leaderboardStatus),
}));

vi.mock('../integrations/steam/SteamListeningStatsStatusSync', () => ({
  getSteamListeningStatsStatus: mocks.syncListeningStatsNow,
  syncSteamListeningStatsNow: mocks.syncListeningStatsNow,
}));

vi.mock('../integrations/steam/SteamRichPresenceStatusSync', () => ({
  getSteamRichPresenceStatus: vi.fn(() => mocks.presenceStatus),
}));

vi.mock('../integrations/steam/SteamCloudSettingsSync', () => ({
  getSteamCloudSettingsSyncService: vi.fn(() => ({
    getStatus: vi.fn(() => mocks.cloudStatus),
    upload: vi.fn(() => ({ ...mocks.cloudStatus, uploaded: true })),
    downloadAndApply: vi.fn(async () => ({ ...mocks.cloudStatus, applied: true, settings: { appearanceTheme: 'dark' } })),
  })),
}));

describe('Steam IPC', () => {
  beforeEach(() => {
    mocks.handlers.clear();
    mocks.syncListeningStatsNow.mockReset();
    mocks.syncListeningStatsNow.mockResolvedValue(mocks.listeningStatsStatus);
  });

  it('returns runtime and Rich Presence diagnostics through one typed status surface', async () => {
    const { registerSteamIpc } = await import('./steamIpc');
    registerSteamIpc({
      getSettings: () => ({ appearanceTheme: 'dark' }),
      getLocalSettings: () => ({ steamListeningStatsEnabled: false, steamLeaderboardsEnabled: false }),
      applySettings: async (settings) => settings as never,
    });

    expect(mocks.handlers.get(IpcChannels.SteamGetStatus)?.()).toEqual({
      ...mocks.runtimeStatus,
      richPresence: mocks.presenceStatus,
    });
    expect(mocks.handlers.get(IpcChannels.SteamCloudSettingsGetStatus)?.()).toEqual(mocks.cloudStatus);
    await expect(mocks.handlers.get(IpcChannels.SteamListeningStatsGetStatus)?.()).resolves.toEqual(mocks.listeningStatsStatus);
    expect(mocks.syncListeningStatsNow).toHaveBeenCalledTimes(1);
    expect(mocks.handlers.get(IpcChannels.SteamLeaderboardGetStatus)?.()).toEqual(mocks.leaderboardStatus);
    expect(mocks.handlers.get(IpcChannels.SteamListenTogetherProbeGetStatus)?.()).toEqual(mocks.listenTogetherProbeStatus);
    expect(mocks.handlers.get(IpcChannels.SteamListenTogetherGetStatus)?.()).toEqual(mocks.listenTogetherStatus);
  });

  it('validates lobby IDs at the typed IPC boundary', async () => {
    const { registerSteamIpc } = await import('./steamIpc');
    mocks.joinListenTogetherRoom.mockResolvedValue(mocks.listenTogetherProbeStatus);
    registerSteamIpc({
      getSettings: () => ({}),
      getLocalSettings: () => ({}),
      applySettings: async (settings) => settings as never,
    });

    expect(() => mocks.handlers.get(IpcChannels.SteamListenTogetherProbeJoinRoom)?.({}, 99n)).toThrow(
      'lobbyId must be a string',
    );
    await mocks.handlers.get(IpcChannels.SteamListenTogetherProbeJoinRoom)?.({}, '76561190000000000');
    expect(mocks.joinListenTogetherRoom).toHaveBeenCalledWith('76561190000000000');
    expect(() => mocks.handlers.get(IpcChannels.SteamListenTogetherJoinRoom)?.({}, 9001n)).toThrow(
      'lobbyId must be a string',
    );
    await mocks.handlers.get(IpcChannels.SteamListenTogetherJoinRoom)?.({}, '9001');
    expect(mocks.joinProductListenTogetherRoom).toHaveBeenCalledWith('9001');
  });

  it('rejects reactions outside the fixed together-room palette', async () => {
    const { registerSteamIpc } = await import('./steamIpc');
    mocks.sendListenTogetherReaction.mockReturnValue(mocks.listenTogetherStatus);
    registerSteamIpc({
      getSettings: () => ({}),
      getLocalSettings: () => ({}),
      applySettings: async (settings) => settings as never,
    });

    expect(() => mocks.handlers.get(IpcChannels.SteamListenTogetherSendReaction)?.({}, 'arbitrary')).toThrow(
      'invalid listen-together reaction',
    );
    expect(mocks.handlers.get(IpcChannels.SteamListenTogetherSendReaction)?.({}, 'sparkles')).toEqual(mocks.listenTogetherStatus);
    expect(mocks.sendListenTogetherReaction).toHaveBeenCalledWith('sparkles');
  });

  it('continues achievement progress synchronization when extended stats are disabled', async () => {
    const { registerSteamIpc } = await import('./steamIpc');
    const applySettings = vi.fn(async (settings) => settings as never);
    registerSteamIpc({
      getSettings: () => ({}),
      getLocalSettings: () => ({ steamListeningStatsEnabled: false }),
      applySettings,
    });

    await mocks.handlers.get(IpcChannels.SteamListeningStatsSetEnabled)?.({}, false);

    expect(applySettings).toHaveBeenCalledWith({ steamListeningStatsEnabled: false });
    expect(mocks.syncListeningStatsNow).toHaveBeenCalledTimes(1);
  });

  it('rejects arbitrary board names and accepts only the fixed registry', async () => {
    const { registerSteamIpc } = await import('./steamIpc');
    registerSteamIpc({
      getSettings: () => ({ appearanceTheme: 'dark' }),
      getLocalSettings: () => ({ steamLeaderboardsEnabled: true }),
      applySettings: async (settings) => settings as never,
    });

    expect(() => mocks.handlers.get(IpcChannels.SteamLeaderboardGetEntries)?.({}, 'custom-board', 'global')).toThrow(
      'invalid Steam leaderboard request',
    );
    await expect(
      mocks.handlers.get(IpcChannels.SteamLeaderboardGetEntries)?.({}, 'listening-time', 'around-user'),
    ).resolves.toMatchObject({ boardId: 'listening-time', scope: 'around-user', status: { enabled: true } });
    await expect(
      mocks.handlers.get(IpcChannels.SteamLeaderboardGetEntries)?.({}, 'rediscovered-tracks', 'friends'),
    ).resolves.toMatchObject({ boardId: 'rediscovered-tracks', scope: 'friends' });
  });
});
