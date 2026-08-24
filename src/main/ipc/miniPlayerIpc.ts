import { ipcMain } from 'electron';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import type { MiniPlayerHideOptions } from '../../shared/types/miniPlayer';
import { getAppSettings, setAppSettings } from '../app/appSettings';
import { enterUltraLightMode, isUltraLightModeActive, restoreUltraLightMode } from '../app/UltraLightModeService';
import {
  getMiniPlayerState,
  hideMiniPlayerWindow,
  resetMiniPlayerBounds,
  setMiniPlayerLocked,
  setMiniPlayerQueueOpen,
  showMiniPlayerWindow,
} from '../app/miniPlayerWindow';

const normalizeMiniPlayerHideOptions = (options: unknown): MiniPlayerHideOptions => ({
  restoreMainWindow: Boolean(
    options &&
      typeof options === 'object' &&
      (options as { restoreMainWindow?: unknown }).restoreMainWindow === true,
  ),
});

export const registerMiniPlayerIpc = (): void => {
  ipcMain.handle(IpcChannels.MiniPlayerShow, async () => {
    if (getAppSettings().miniPlayerUsesUltraLightMode !== true) {
      return showMiniPlayerWindow();
    }

    // The regular mini-player toggle is also the Ultralight restore toggle.
    // The dedicated restore shortcut remains Ctrl+Shift+E while Ultralight is active.
    if (isUltraLightModeActive()) {
      await restoreUltraLightMode();
    } else {
      await enterUltraLightMode();
    }
    // Ultralight has no BrowserWindow mini-player to restore on the next launch.
    setAppSettings({ miniPlayerEnabled: false });
    return getMiniPlayerState();
  });
  ipcMain.handle(IpcChannels.MiniPlayerHide, (_event, options: unknown) =>
    hideMiniPlayerWindow(normalizeMiniPlayerHideOptions(options)),
  );
  ipcMain.handle(IpcChannels.MiniPlayerGetState, () => getMiniPlayerState());
  ipcMain.handle(IpcChannels.MiniPlayerSetLocked, (_event, locked: unknown) => setMiniPlayerLocked(locked === true));
  ipcMain.handle(IpcChannels.MiniPlayerSetQueueOpen, (_event, open: unknown) => setMiniPlayerQueueOpen(open === true));
  ipcMain.handle(IpcChannels.MiniPlayerResetBounds, () => resetMiniPlayerBounds());
};
