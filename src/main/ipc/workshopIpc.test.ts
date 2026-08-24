import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '../../shared/constants/ipcChannels';

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const webContentsSend = vi.fn();
  return {
    handlers,
    webContentsSend,
    setUiRuntimeActive: vi.fn(),
    setWorkshopLyricsSpectrumDemand: vi.fn(),
    isAudioVisualSpectrumEnabled: vi.fn(() => true),
    setVisualSpectrumEnabled: vi.fn(async () => undefined),
    playbackShare: {
      getShareInfo: vi.fn(async () => ({ available: false })),
      shareCurrentTrack: vi.fn(async () => ({ id: 'task-1' })),
      getShareTask: vi.fn(async () => ({ id: 'task-1', state: 'ready' })),
    },
    pluginNetwork: {
      request: vi.fn(async () => ({ status: 200, ok: true, body: '{}' })),
    },
    maintenance: {
      previewCleanup: vi.fn(async () => ({ token: 'preview', candidates: [], totalBytes: 0 })),
      cleanup: vi.fn(async () => ({ removed: 0, reclaimedBytes: 0, failed: [] })),
    },
    manager: {
      startStartupReconcile: vi.fn(),
      getSnapshot: vi.fn(() => ({ items: [] })),
      getPluginSnapshot: vi.fn(async () => ({ plugins: [] })),
      getActiveLyricsScene: vi.fn(() => null),
      clearActiveLyricsScene: vi.fn(() => true),
      getActiveVisualizerPreset: vi.fn(() => null),
      getActiveThemeBackground: vi.fn(() => null),
      reconcile: vi.fn(async () => ({ ok: true })),
      requestDownload: vi.fn(async () => ({ ok: true })),
      ingest: vi.fn(async () => ({ ok: true })),
      enable: vi.fn(async () => ({ ok: true })),
      disable: vi.fn(async () => ({ ok: true })),
      apply: vi.fn(async () => ({ ok: true })),
      use: vi.fn(async () => ({ ok: true })),
      browse: vi.fn(async () => ({ available: true, page: 1, total: 0, items: [] })),
      subscribe: vi.fn(async () => ({ ok: true })),
      unsubscribe: vi.fn(async () => ({ ok: true })),
      openInSteam: vi.fn(async () => ({ ok: true })),
      rollback: vi.fn(async () => ({ ok: true })),
    },
  };
});

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => [{ webContents: { send: mocks.webContentsSend } }]),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) =>
      mocks.handlers.set(channel, handler)),
  },
}));

vi.mock('../workshop/getWorkshopManagerService', () => ({
  getWorkshopManagerService: () => mocks.manager,
  getWorkshopMaintenanceService: () => mocks.maintenance,
  getWorkshopSteamSource: () => ({
    createItem: vi.fn(),
    updateItem: vi.fn(),
  }),
}));

vi.mock('../workshop/WorkshopUiRuntimeAuthority', () => ({
  setWorkshopUiRuntimeActive: mocks.setUiRuntimeActive,
}));

vi.mock('../workshop/WorkshopPlaybackShareService', () => ({
  getWorkshopPlaybackShareService: () => mocks.playbackShare,
}));

vi.mock('../workshop/WorkshopPluginNetworkService', () => ({
  getWorkshopPluginNetworkService: () => mocks.pluginNetwork,
}));

vi.mock('../audio/HostBridgeRegistry', () => ({
  activeJsonRpcBridge: {
    isClosed: false,
    setVisualSpectrumEnabled: mocks.setVisualSpectrumEnabled,
  },
}));

vi.mock('../audio/helpers/playbackDefaults', () => ({
  isAudioVisualSpectrumEnabled: mocks.isAudioVisualSpectrumEnabled,
  setWorkshopLyricsSpectrumDemand: mocks.setWorkshopLyricsSpectrumDemand,
}));

describe('Workshop IPC', () => {
  beforeEach(() => {
    mocks.handlers.clear();
    vi.clearAllMocks();
  });

  it('starts reconcile and registers the complete typed management surface', async () => {
    const { registerWorkshopIpc } = await import('./workshopIpc');
    registerWorkshopIpc();
    const request = { sourceId: 'steam', itemId: '123' };

    expect(mocks.manager.startStartupReconcile).toHaveBeenCalledTimes(1);
    expect(mocks.handlers.get(IpcChannels.WorkshopGetSnapshot)?.({})).toEqual({ items: [] });
    await mocks.handlers.get(IpcChannels.WorkshopGetPlugins)?.({});
    await mocks.handlers.get(IpcChannels.WorkshopPluginGetShareInfo)?.({}, request);
    await mocks.handlers.get(IpcChannels.WorkshopPluginShareCurrentTrack)?.({}, { ...request, uploadUrl: 'https://share.example/upload' });
    await mocks.handlers.get(IpcChannels.WorkshopPluginGetShareTask)?.({}, { ...request, taskId: 'task-1' });
    await mocks.handlers.get(IpcChannels.WorkshopPluginNetworkRequest)?.({}, { ...request, url: 'https://api.example/catalog' });
    expect(mocks.handlers.get(IpcChannels.WorkshopGetActiveLyricsScene)?.({})).toBeNull();
    await mocks.handlers.get(IpcChannels.WorkshopClearActiveLyricsScene)?.({});
    const spectrumSender = { id: 7, once: vi.fn() };
    expect(mocks.handlers.get(IpcChannels.WorkshopSetLyricsSpectrumActive)?.({ sender: spectrumSender }, true)).toBe(true);
    expect(mocks.handlers.get(IpcChannels.WorkshopSetPluginSpectrumActive)?.({ sender: spectrumSender }, true)).toBe(true);
    const sender = {};
    await mocks.handlers.get(IpcChannels.WorkshopSetUiRuntimeActive)?.({ sender }, true);
    await mocks.handlers.get(IpcChannels.WorkshopReconcile)?.({});
    await mocks.handlers.get(IpcChannels.WorkshopRequestDownload)?.({}, request);
    await mocks.handlers.get(IpcChannels.WorkshopIngest)?.({}, request);
    await mocks.handlers.get(IpcChannels.WorkshopEnable)?.({}, request);
    await mocks.handlers.get(IpcChannels.WorkshopDisable)?.({}, request);
    await mocks.handlers.get(IpcChannels.WorkshopApply)?.({}, request);
    await mocks.handlers.get(IpcChannels.WorkshopUse)?.({}, request);
    await mocks.handlers.get(IpcChannels.WorkshopBrowse)?.({}, { page: 1, sort: 'trend' });
    await mocks.handlers.get(IpcChannels.WorkshopSubscribe)?.({}, request);
    await mocks.handlers.get(IpcChannels.WorkshopUnsubscribe)?.({}, request);
    await mocks.handlers.get(IpcChannels.WorkshopOpenInSteam)?.({}, request);
    await mocks.handlers.get(IpcChannels.WorkshopRollback)?.({}, request);
    await mocks.handlers.get(IpcChannels.WorkshopMaintenancePreview)?.({});
    await mocks.handlers.get(IpcChannels.WorkshopMaintenanceCleanup)?.({}, 'preview');

    expect(mocks.manager.requestDownload).toHaveBeenCalledWith(request);
    expect(mocks.manager.clearActiveLyricsScene).toHaveBeenCalledTimes(1);
    expect(mocks.playbackShare.getShareInfo).toHaveBeenCalledWith('steam', '123');
    expect(mocks.playbackShare.shareCurrentTrack).toHaveBeenCalledWith({ ...request, uploadUrl: 'https://share.example/upload' });
    expect(mocks.playbackShare.getShareTask).toHaveBeenCalledWith({ ...request, taskId: 'task-1' });
    expect(mocks.pluginNetwork.request).toHaveBeenCalledWith({ ...request, url: 'https://api.example/catalog' });
    expect(mocks.setWorkshopLyricsSpectrumDemand).toHaveBeenCalledWith(7, true);
    expect(mocks.setWorkshopLyricsSpectrumDemand).toHaveBeenCalledWith(-7, true);
    expect(mocks.setVisualSpectrumEnabled).toHaveBeenCalledWith(true);
    expect(mocks.setUiRuntimeActive).toHaveBeenCalledWith(sender, true);
    expect(mocks.manager.ingest).toHaveBeenCalledWith(request);
    expect(mocks.manager.enable).toHaveBeenCalledWith(request);
    expect(mocks.manager.disable).toHaveBeenCalledWith(request);
    expect(mocks.manager.apply).toHaveBeenCalledWith(request);
    expect(mocks.manager.use).toHaveBeenCalledWith(request);
    expect(mocks.manager.browse).toHaveBeenCalledWith({ page: 1, sort: 'trend' });
    expect(mocks.manager.subscribe).toHaveBeenCalledWith(request);
    expect(mocks.manager.unsubscribe).toHaveBeenCalledWith(request);
    expect(mocks.manager.openInSteam).toHaveBeenCalledWith(request);
    expect(mocks.manager.rollback).toHaveBeenCalledWith(request);
    expect(mocks.maintenance.previewCleanup).toHaveBeenCalledTimes(1);
    expect(mocks.maintenance.cleanup).toHaveBeenCalledWith('preview');
    expect(mocks.webContentsSend).toHaveBeenCalledWith(
      IpcChannels.WorkshopActiveLyricsSceneChanged,
      null,
    );
    expect(mocks.webContentsSend).toHaveBeenCalledWith(
      IpcChannels.WorkshopActiveVisualizerPresetChanged,
      null,
    );
    expect(mocks.webContentsSend).toHaveBeenCalledWith(
      IpcChannels.WorkshopActiveThemeBackgroundChanged,
      null,
    );
  });
});
