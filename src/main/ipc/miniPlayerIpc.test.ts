import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '../../shared/constants/ipcChannels';

const handlers: Record<string, (...args: unknown[]) => unknown> = {};
const handleMock = vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
  handlers[channel] = handler;
});
const setMiniPlayerLockedMock = vi.fn((locked: boolean) => ({
  visible: true,
  locked,
  queueOpen: false,
  bounds: null,
  settings: {
    miniPlayerEnabled: true,
    miniPlayerLocked: locked,
    miniPlayerAutoHideMainWindow: false,
    miniPlayerBounds: null,
  },
}));
const hideMiniPlayerWindowMock = vi.fn();
const setMiniPlayerQueueOpenMock = vi.fn();
const getMiniPlayerStateMock = vi.fn(() => ({ visible: false }));
const showMiniPlayerWindowMock = vi.fn();
const getAppSettingsMock = vi.fn(() => ({ miniPlayerUsesUltraLightMode: false }));
const setAppSettingsMock = vi.fn();
const enterUltraLightModeMock = vi.fn();
const isUltraLightModeActiveMock = vi.fn(() => false);
const restoreUltraLightModeMock = vi.fn();

vi.mock('electron', () => ({
  ipcMain: {
    handle: handleMock,
  },
}));

vi.mock('../app/miniPlayerWindow', () => ({
  getMiniPlayerState: getMiniPlayerStateMock,
  hideMiniPlayerWindow: hideMiniPlayerWindowMock,
  resetMiniPlayerBounds: vi.fn(),
  setMiniPlayerLocked: setMiniPlayerLockedMock,
  setMiniPlayerQueueOpen: setMiniPlayerQueueOpenMock,
  showMiniPlayerWindow: showMiniPlayerWindowMock,
}));

vi.mock('../app/appSettings', () => ({
  getAppSettings: getAppSettingsMock,
  setAppSettings: setAppSettingsMock,
}));

vi.mock('../app/UltraLightModeService', () => ({
  enterUltraLightMode: enterUltraLightModeMock,
  isUltraLightModeActive: isUltraLightModeActiveMock,
  restoreUltraLightMode: restoreUltraLightModeMock,
}));

const resetHandlers = (): void => {
  for (const key of Object.keys(handlers)) {
    delete handlers[key];
  }
};

describe('mini player IPC', () => {
  beforeEach(async () => {
    resetHandlers();
    handleMock.mockClear();
    hideMiniPlayerWindowMock.mockClear();
    showMiniPlayerWindowMock.mockClear();
    getMiniPlayerStateMock.mockClear();
    setAppSettingsMock.mockClear();
    enterUltraLightModeMock.mockClear();
    isUltraLightModeActiveMock.mockClear();
    restoreUltraLightModeMock.mockClear();
    getAppSettingsMock.mockReturnValue({ miniPlayerUsesUltraLightMode: false });
    isUltraLightModeActiveMock.mockReturnValue(false);
    setMiniPlayerLockedMock.mockClear();
    setMiniPlayerQueueOpenMock.mockClear();
    vi.resetModules();
    const module = await import('./miniPlayerIpc');
    module.registerMiniPlayerIpc();
  });

  it('registers the mini player window handlers', () => {
    expect(handleMock).toHaveBeenCalledWith(IpcChannels.MiniPlayerShow, expect.any(Function));
    expect(handleMock).toHaveBeenCalledWith(IpcChannels.MiniPlayerHide, expect.any(Function));
    expect(handleMock).toHaveBeenCalledWith(IpcChannels.MiniPlayerGetState, expect.any(Function));
    expect(handleMock).toHaveBeenCalledWith(IpcChannels.MiniPlayerSetLocked, expect.any(Function));
    expect(handleMock).toHaveBeenCalledWith(IpcChannels.MiniPlayerSetQueueOpen, expect.any(Function));
    expect(handleMock).toHaveBeenCalledWith(IpcChannels.MiniPlayerResetBounds, expect.any(Function));
  });

  it('normalizes locked state to explicit true only', () => {
    handlers[IpcChannels.MiniPlayerSetLocked]!(null, 'true');
    handlers[IpcChannels.MiniPlayerSetLocked]!(null, true);

    expect(setMiniPlayerLockedMock).toHaveBeenNthCalledWith(1, false);
    expect(setMiniPlayerLockedMock).toHaveBeenNthCalledWith(2, true);
  });

  it('normalizes mini player hide options to explicit true only', () => {
    handlers[IpcChannels.MiniPlayerHide]!(null, { restoreMainWindow: 'true' });
    handlers[IpcChannels.MiniPlayerHide]!(null, { restoreMainWindow: true });

    expect(hideMiniPlayerWindowMock).toHaveBeenNthCalledWith(1, { restoreMainWindow: false });
    expect(hideMiniPlayerWindowMock).toHaveBeenNthCalledWith(2, { restoreMainWindow: true });
  });

  it('normalizes queue panel state to explicit true only', () => {
    handlers[IpcChannels.MiniPlayerSetQueueOpen]!(null, 'true');
    handlers[IpcChannels.MiniPlayerSetQueueOpen]!(null, true);

    expect(setMiniPlayerQueueOpenMock).toHaveBeenNthCalledWith(1, false);
    expect(setMiniPlayerQueueOpenMock).toHaveBeenNthCalledWith(2, true);
  });

  it('routes the mini player command into ECHO Ultralight when selected', async () => {
    getAppSettingsMock.mockReturnValue({ miniPlayerUsesUltraLightMode: true });

    await handlers[IpcChannels.MiniPlayerShow]!(null);

    expect(enterUltraLightModeMock).toHaveBeenCalledTimes(1);
    expect(showMiniPlayerWindowMock).not.toHaveBeenCalled();
    expect(setAppSettingsMock).toHaveBeenCalledWith({ miniPlayerEnabled: false });
  });

  it('uses the same mini-player command to restore an active ECHO Ultralight session', async () => {
    getAppSettingsMock.mockReturnValue({ miniPlayerUsesUltraLightMode: true });
    isUltraLightModeActiveMock.mockReturnValue(true);

    await handlers[IpcChannels.MiniPlayerShow]!(null);

    expect(restoreUltraLightModeMock).toHaveBeenCalledTimes(1);
    expect(enterUltraLightModeMock).not.toHaveBeenCalled();
  });
});
