import type { IpcRenderer } from 'electron';
import type { EchoApi } from '../apiTypes';
import type { GlobalShortcutAction } from '../../shared/types/globalShortcuts';
import type { DataBackupProgress } from '../../shared/types/settingsBackup';

export function createAppApi(
  ipcRenderer: IpcRenderer,
  IpcChannels: typeof import('../../shared/constants/ipcChannels').IpcChannels,
): EchoApi['app'] {
  return {
    getVersion: () => ipcRenderer.invoke(IpcChannels.AppGetVersion),
    getRuntimeAudioComponentStatus: () => ipcRenderer.invoke(IpcChannels.AppGetRuntimeAudioComponentStatus),
    importRuntimeAudioComponent: () => ipcRenderer.invoke(IpcChannels.AppImportRuntimeAudioComponent),
    openRuntimeAudioComponentDownloadPage: () => ipcRenderer.invoke(IpcChannels.AppOpenRuntimeAudioComponentDownloadPage),
    minimize: () => ipcRenderer.invoke(IpcChannels.AppWindowMinimize),
    hideToTray: () => ipcRenderer.invoke(IpcChannels.AppWindowHideToTray),
    onMinimizedChange: (handler) => {
      const listener = (_event: Electron.IpcRendererEvent, isMinimized: unknown): void => {
        handler(isMinimized === true);
      };
      ipcRenderer.on(IpcChannels.AppWindowMinimizedChanged, listener);
      return () => ipcRenderer.off(IpcChannels.AppWindowMinimizedChanged, listener);
    },
    onHiddenChange: (handler) => {
      const listener = (_event: Electron.IpcRendererEvent, isHidden: unknown): void => {
        handler(isHidden === true);
      };
      ipcRenderer.on(IpcChannels.AppWindowHiddenChanged, listener);
      return () => ipcRenderer.off(IpcChannels.AppWindowHiddenChanged, listener);
    },
    toggleMaximize: () => ipcRenderer.invoke(IpcChannels.AppWindowToggleMaximize),
    isMaximized: () => ipcRenderer.invoke(IpcChannels.AppWindowIsMaximized),
    onMaximizedChange: (handler) => {
      const listener = (_event: Electron.IpcRendererEvent, isMaximized: unknown): void => {
        handler(isMaximized === true);
      };
      ipcRenderer.on(IpcChannels.AppWindowMaximizedChanged, listener);
      return () => ipcRenderer.off(IpcChannels.AppWindowMaximizedChanged, listener);
    },
    toggleFullscreen: () => ipcRenderer.invoke(IpcChannels.AppWindowToggleFullscreen),
    triggerFullscreenShortcut: () => ipcRenderer.invoke(IpcChannels.AppWindowTriggerFullscreenShortcut),
    isFullscreen: () => ipcRenderer.invoke(IpcChannels.AppWindowIsFullscreen),
    onFullscreenChange: (handler) => {
      const listener = (_event: Electron.IpcRendererEvent, isFullscreen: unknown): void => {
        handler(isFullscreen === true);
      };
      ipcRenderer.on(IpcChannels.AppWindowFullscreenChanged, listener);
      return () => ipcRenderer.off(IpcChannels.AppWindowFullscreenChanged, listener);
    },
    close: () => ipcRenderer.invoke(IpcChannels.AppWindowClose),
    quit: () => ipcRenderer.invoke(IpcChannels.AppQuit),
    getSettings: () => ipcRenderer.invoke(IpcChannels.AppGetSettings),
    setSettings: (patch) => ipcRenderer.invoke(IpcChannels.AppSetSettings, patch),
    onSharedSettingsChanged: (handler) => {
      const listener = (): void => handler();
      ipcRenderer.on(IpcChannels.AppSharedSettingsChanged, listener);
      return () => ipcRenderer.off(IpcChannels.AppSharedSettingsChanged, listener);
    },
    getTaskbarPlaybackStatus: () => ipcRenderer.invoke(IpcChannels.AppGetTaskbarPlaybackStatus),
    setTaskbarThumbnailArtwork: (artworkUrl) => ipcRenderer.send(IpcChannels.AppSetTaskbarThumbnailArtwork, artworkUrl),
    resetSettings: () => ipcRenderer.invoke(IpcChannels.AppResetSettings),
    exportSettings: () => ipcRenderer.invoke(IpcChannels.AppExportSettings),
    importSettings: () => ipcRenderer.invoke(IpcChannels.AppImportSettings),
    exportDataPackage: () => ipcRenderer.invoke(IpcChannels.AppExportDataPackage),
    chooseDataBackupDirectory: () => ipcRenderer.invoke(IpcChannels.AppChooseDataBackupDirectory),
    getDataBackupStatus: () => ipcRenderer.invoke(IpcChannels.AppGetDataBackupStatus),
    onDataBackupProgress: (handler) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: unknown): void => {
        if (progress) {
          handler(progress as DataBackupProgress);
        }
      };
      ipcRenderer.on(IpcChannels.AppDataBackupProgress, listener);
      return () => ipcRenderer.off(IpcChannels.AppDataBackupProgress, listener);
    },
    runDataBackupNow: () => ipcRenderer.invoke(IpcChannels.AppRunDataBackupNow),
    importDataBackup: () => ipcRenderer.invoke(IpcChannels.AppImportDataBackup),
    openDataBackupDirectory: () => ipcRenderer.invoke(IpcChannels.AppOpenDataBackupDirectory),
    chooseFontFile: () => ipcRenderer.invoke(IpcChannels.AppChooseFontFile),
    chooseLyricsWallpaper: () => ipcRenderer.invoke(IpcChannels.AppChooseLyricsWallpaper),
    chooseAppWallpaper: () => ipcRenderer.invoke(IpcChannels.AppChooseAppWallpaper),
    loadFontFile: (path) => ipcRenderer.invoke(IpcChannels.AppLoadFontFile, path),
    chooseCacheDirectory: () => ipcRenderer.invoke(IpcChannels.AppChooseCacheDirectory),
    getDefaultCacheDirectory: () => ipcRenderer.invoke(IpcChannels.AppGetDefaultCacheDirectory),
    getCacheInventory: () => ipcRenderer.invoke(IpcChannels.AppGetCacheInventory),
    setCoverCacheDirectory: (request) => ipcRenderer.invoke(IpcChannels.AppSetCoverCacheDirectory, request),
    openRepository: () => ipcRenderer.invoke(IpcChannels.AppOpenRepository),
    openExternalUrl: (url) => ipcRenderer.invoke(IpcChannels.AppOpenExternalUrl, url),
    showTouchKeyboard: () => ipcRenderer.invoke(IpcChannels.AppShowTouchKeyboard),
    testNetworkProxy: (patch) =>
      patch === undefined ? ipcRenderer.invoke(IpcChannels.AppTestNetworkProxy) : ipcRenderer.invoke(IpcChannels.AppTestNetworkProxy, patch),
    getEchoProAccountStatus: (options) =>
      options === undefined
        ? ipcRenderer.invoke(IpcChannels.AppEchoProAccountGetStatus)
        : ipcRenderer.invoke(IpcChannels.AppEchoProAccountGetStatus, options),
    loginEchoProAccount: (credentials) => ipcRenderer.invoke(IpcChannels.AppEchoProAccountLogin, credentials),
    registerEchoProAccount: (credentials) => ipcRenderer.invoke(IpcChannels.AppEchoProAccountRegister, credentials),
    logoutEchoProAccount: () => ipcRenderer.invoke(IpcChannels.AppEchoProAccountLogout),
    redeemEchoProKey: (key) => ipcRenderer.invoke(IpcChannels.AppEchoProAccountRedeemKey, key),
    getEchoProLocalEntitlementStatus: () => ipcRenderer.invoke(IpcChannels.AppEchoProLocalEntitlementGetStatus),
    releaseEchoProDevices: (password) => ipcRenderer.invoke(IpcChannels.AppEchoProAccountReleaseDevices, password),
    getEchoProMachineCode: () => ipcRenderer.invoke(IpcChannels.AppEchoProMachineCodeGet),
    getEchoProSettingsCloudStatus: () => ipcRenderer.invoke(IpcChannels.AppEchoProSettingsCloudGetStatus),
    saveEchoProSettingsCloud: () => ipcRenderer.invoke(IpcChannels.AppEchoProSettingsCloudSave),
    pullEchoProSettingsCloud: () => ipcRenderer.invoke(IpcChannels.AppEchoProSettingsCloudPull),
    applyEchoProSettingsCloud: () => ipcRenderer.invoke(IpcChannels.AppEchoProSettingsCloudApply),
    validateGlobalShortcut: (accelerator) => ipcRenderer.invoke(IpcChannels.AppValidateGlobalShortcut, accelerator),
    getUltraLightModeStatus: () => ipcRenderer.invoke(IpcChannels.AppUltraLightModeGetStatus),
    enterUltraLightMode: () => ipcRenderer.invoke(IpcChannels.AppUltraLightModeEnter),
    restoreUltraLightMode: () => ipcRenderer.invoke(IpcChannels.AppUltraLightModeRestore),
    onGlobalShortcutCommand: (handler) => {
      const listener = (_event: Electron.IpcRendererEvent, action: unknown): void => {
        handler(action as GlobalShortcutAction);
      };
      ipcRenderer.on(IpcChannels.AppGlobalShortcutCommand, listener);
      return () => ipcRenderer.off(IpcChannels.AppGlobalShortcutCommand, listener);
    },
  };
}
