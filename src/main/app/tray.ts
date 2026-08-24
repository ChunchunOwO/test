import { app, Menu, Tray } from 'electron';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import type { GlobalShortcutAction } from '../../shared/types/globalShortcuts';
import type { SleepTimerAction } from '../../shared/types/sleepTimer';
import { getMainWindow } from './windowManager';
import { getSleepTimerService } from '../sleepTimer/SleepTimerService';
import { createAppIconImage } from './appIcon';
import { dispatchUltraLightModeAction, isUltraLightModeActive, restoreUltraLightMode } from './UltraLightModeService';
import { createTrayMenuTemplate } from './trayMenuTemplate';
import {
  hideMainWindowToTray as applyMainWindowTrayVisibility,
  showMainWindowFromTray,
} from './mainWindowTrayVisibility';

let tray: Tray | null = null;
let quitRequested = false;

const ultraLightPlaybackActions = new Set<GlobalShortcutAction>([
  'playPause',
  'previousTrack',
  'nextTrack',
  'stop',
  'seekBackward',
  'seekForward',
  'replayCurrentTrack',
  'volumeUp',
  'volumeDown',
  'toggleMute',
]);

const getCommandWindow = () => {
  const window = getMainWindow();
  if (!window || window.isDestroyed()) {
    return null;
  }

  return window;
};

const showMainWindow = (): void => {
  if (isUltraLightModeActive()) {
    void restoreUltraLightMode();
    return;
  }
  const window = getCommandWindow();

  if (!window) {
    return;
  }

  showMainWindowFromTray(window);
  refreshTrayMenu();
};

export const hideMainWindowToTray = (): void => {
  const window = getCommandWindow();
  if (!window) {
    return;
  }

  applyMainWindowTrayVisibility(window);
  refreshTrayMenu();
};

const sendPlaybackCommand = (action: GlobalShortcutAction): void => {
  if (isUltraLightModeActive()) {
    if (ultraLightPlaybackActions.has(action)) {
      void dispatchUltraLightModeAction(action);
      return;
    }

    void restoreUltraLightMode().then(() => {
      const window = getCommandWindow();
      if (window) {
        window.webContents.send(IpcChannels.AppGlobalShortcutCommand, action);
      }
    });
    return;
  }
  const window = getCommandWindow();
  if (!window) {
    return;
  }

  window.webContents.send(IpcChannels.AppGlobalShortcutCommand, action);
};

const openAudioSettings = (): void => {
  if (isUltraLightModeActive()) {
    sendPlaybackCommand('openAudioSettings');
    return;
  }
  showMainWindow();
  sendPlaybackCommand('openAudioSettings');
};

const quitApp = (): void => {
  quitRequested = true;
  app.quit();
};

const createTrayIcon = (): Electron.NativeImage => createAppIconImage();

const startSleepTimer = (minutes: number, action: SleepTimerAction): void => {
  getSleepTimerService().start({
    durationMinutes: minutes,
    action,
    fadeOut: true,
  });
  refreshTrayMenu();
};

const cancelSleepTimer = (): void => {
  getSleepTimerService().cancel();
  refreshTrayMenu();
};

const buildTrayMenu = (): Electron.Menu => {
  const window = getCommandWindow();
  return Menu.buildFromTemplate(createTrayMenuTemplate({
    isMainWindowVisible: Boolean(window?.isVisible()),
    isUltraLightModeActive: isUltraLightModeActive(),
    sleepTimer: getSleepTimerService().getStatus(),
  }, {
    showMainWindow,
    hideMainWindow: hideMainWindowToTray,
    sendPlaybackCommand,
    openAudioSettings,
    startSleepTimer,
    cancelSleepTimer,
    quitApp,
  }));
};

/** 刷新托盘菜单（状态变更时调用） */
const refreshTrayMenu = (): void => {
  if (tray && !tray.isDestroyed()) {
    tray.setContextMenu(buildTrayMenu());
  }
};

/** SleepTimerService 状态变更回调的取消函数 */
let timerUnsubscribe: (() => void) | null = null;

export const ensureTray = (): void => {
  if (tray) {
    tray.setContextMenu(buildTrayMenu());
    return;
  }

  tray = new Tray(createTrayIcon());
  tray.setToolTip('ECHO');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', showMainWindow);

  // 注册睡眠定时器状态变更回调，自动刷新托盘菜单
  const timerService = getSleepTimerService();
  timerUnsubscribe = timerService.onChange(() => {
    refreshTrayMenu();
  });
};

export const destroyTray = (): void => {
  timerUnsubscribe?.();
  timerUnsubscribe = null;
  tray?.destroy();
  tray = null;
};

export const requestAppQuit = (): void => {
  quitRequested = true;
};

export const isAppQuitRequested = (): boolean => quitRequested;
