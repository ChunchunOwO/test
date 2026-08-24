import { ipcMain } from 'electron';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import {
  getTaskbarMiniPlayerState,
  hideTaskbarMiniPlayerWindow,
  notifyTaskbarMiniPlayerHostStateChanged,
  setTaskbarMiniPlayerEnabled,
  showTaskbarMiniPlayerWindow,
} from '../app/taskbarMiniPlayerWindow';
import {
  setTaskbarHostClickCallback,
  setTaskbarHostDoubleClickCallback,
  setTaskbarHostQueueItemCallback,
  setTaskbarHostReadyCallback,
  setTaskbarHostSeekCallback,
  setTaskbarHostShortcutCallback,
  setTaskbarHostStateChangedCallback,
  setTaskbarHostVolumeCallback,
} from '../app/taskbarHostProcess';
import { getAudioSession } from '../audio/AudioSession';
import { refreshTaskbarPlaybackIntegration } from '../app/taskbarPlaybackIntegration';
import { getMainWindow } from '../app/windowManager';
import {
  dispatchUltraLightModeAction,
  dispatchUltraLightModeSmtcCommand,
  cycleUltraLightModePlaybackOrder,
  isUltraLightModeActive,
  refreshUltraLightModeMiniPlayer,
  playUltraLightModeQueueItemAt,
  restoreUltraLightMode,
} from '../app/UltraLightModeService';
import { getAppSettings } from '../app/appSettings';
import { resolveUltraLightShortcutAction } from '../app/ultraLightShortcutResolver';

const relayPlaybackCommandToMainWindow = (command: string): void => {
  const mainWindow = getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IpcChannels.SmtcCommand, command);
  }
};


const showMainWindowFromTaskbarMiniPlayer = (): void => {
  const mainWindow = getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.moveTop();
  if (process.platform === 'win32') {
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.setAlwaysOnTop(false);
  }
  mainWindow.focus();
};
const togglePlayback = (): void => {
  const audioSession = getAudioSession();
  const status = audioSession.getStatus();
  if (status.state === 'playing') {
    void audioSession.pause();
  } else {
    void audioSession.play();
  }
};

export const registerTaskbarMiniPlayerIpc = (): void => {
  setTaskbarHostClickCallback((action) => {
    if (isUltraLightModeActive()) {
      if (action === 'exitUltraLight') {
        void restoreUltraLightMode();
        return;
      }
      if (action === 'cycleOrder') {
        void cycleUltraLightModePlaybackOrder();
        return;
      }
      if (action === 'toggleQueue') {
        return;
      }
      const ultraLightAction = action === 'next'
        ? 'nextTrack'
        : action === 'prev'
          ? 'previousTrack'
          : 'playPause';
      void dispatchUltraLightModeAction(ultraLightAction);
      return;
    }
    if (action === 'playPause') {
      togglePlayback();
    } else if (action === 'next') {
      relayPlaybackCommandToMainWindow('next');
    } else if (action === 'prev') {
      relayPlaybackCommandToMainWindow('previous');
    }
  });

  setTaskbarHostDoubleClickCallback(() => {
    if (isUltraLightModeActive()) {
      return;
    }
    showMainWindowFromTaskbarMiniPlayer();
  });

  setTaskbarHostQueueItemCallback((index) => {
    if (isUltraLightModeActive()) {
      void playUltraLightModeQueueItemAt(index);
    }
  });

  setTaskbarHostShortcutCallback((accelerator) => {
    if (!isUltraLightModeActive()) return;
    const settings = getAppSettings();
    const action = resolveUltraLightShortcutAction(accelerator, settings.localShortcuts, settings.globalShortcuts);
    if (action) void dispatchUltraLightModeAction(action);
  });

  setTaskbarHostSeekCallback((positionSeconds) => {
    if (isUltraLightModeActive()) {
      void dispatchUltraLightModeSmtcCommand({ type: 'seek', positionSeconds });
      return;
    }
    void getAudioSession().seek(positionSeconds);
  });

  setTaskbarHostVolumeCallback((volume) => {
    // The native player reports user intent only; AudioSession remains the
    // authoritative owner of output volume and publishes the resulting state.
    void getAudioSession().setOutput({ volume });
  });

  setTaskbarHostReadyCallback(() => {
    try {
      if (isUltraLightModeActive()) refreshUltraLightModeMiniPlayer();
      else refreshTaskbarPlaybackIntegration();
    } catch { /* best-effort */ }
  });
  setTaskbarHostStateChangedCallback(() => {
    notifyTaskbarMiniPlayerHostStateChanged();
  });

  ipcMain.handle(IpcChannels.TaskbarMiniPlayerShow, () => showTaskbarMiniPlayerWindow());
  ipcMain.handle(IpcChannels.TaskbarMiniPlayerHide, () => hideTaskbarMiniPlayerWindow());
  ipcMain.handle(IpcChannels.TaskbarMiniPlayerGetState, () => getTaskbarMiniPlayerState());
  ipcMain.handle(IpcChannels.TaskbarMiniPlayerSetEnabled, (_event, enabled: boolean) =>
    setTaskbarMiniPlayerEnabled(enabled),
  );
};
