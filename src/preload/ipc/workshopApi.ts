import type { IpcRenderer } from 'electron';
import type { EchoApi } from '../apiTypes';

export const createWorkshopApi = (
  ipcRenderer: IpcRenderer,
  IpcChannels: typeof import('../../shared/constants/ipcChannels').IpcChannels,
): EchoApi['workshop'] => ({
  getSnapshot: () => ipcRenderer.invoke(IpcChannels.WorkshopGetSnapshot),
  getPlugins: () => ipcRenderer.invoke(IpcChannels.WorkshopGetPlugins),
  createAuthoringProject: (request) => ipcRenderer.invoke(IpcChannels.WorkshopAuthoringCreate, request),
  openAuthoringProject: () => ipcRenderer.invoke(IpcChannels.WorkshopAuthoringOpen),
  validateAuthoringDraft: (request) => ipcRenderer.invoke(IpcChannels.WorkshopAuthoringValidateDraft, request),
  saveAuthoringDraft: (request) => ipcRenderer.invoke(IpcChannels.WorkshopAuthoringSaveDraft, request),
  prepareAuthoringProject: (rootDirectory) => ipcRenderer.invoke(IpcChannels.WorkshopAuthoringPrepare, rootDirectory),
  openAuthoringPreview: (rootDirectory) => ipcRenderer.invoke(IpcChannels.WorkshopAuthoringOpenPreview, rootDirectory),
  openAuthoringFolder: (rootDirectory) => ipcRenderer.invoke(IpcChannels.WorkshopAuthoringOpenFolder, rootDirectory),
  publishAuthoringProject: (request) => ipcRenderer.invoke(IpcChannels.WorkshopAuthoringPublish, request),
  copyAuthoringSdk: () => ipcRenderer.invoke(IpcChannels.WorkshopAuthoringCopySdk),
  getSdkDescriptor: () => ipcRenderer.invoke(IpcChannels.WorkshopGetSdkDescriptor),
  runAcceptance: (request) => ipcRenderer.invoke(IpcChannels.WorkshopRunAcceptance, request),
  rollback: (request) => ipcRenderer.invoke(IpcChannels.WorkshopRollback, request),
  previewMaintenanceCleanup: () => ipcRenderer.invoke(IpcChannels.WorkshopMaintenancePreview),
  runMaintenanceCleanup: (token) => ipcRenderer.invoke(IpcChannels.WorkshopMaintenanceCleanup, token),
  exportCustomizationProfile: (profile) => ipcRenderer.invoke(IpcChannels.WorkshopCustomizationExport, profile),
  importCustomizationProfile: () => ipcRenderer.invoke(IpcChannels.WorkshopCustomizationImport),
  getPluginShareInfo: (request) => ipcRenderer.invoke(IpcChannels.WorkshopPluginGetShareInfo, request),
  sharePluginCurrentTrack: (request) => ipcRenderer.invoke(IpcChannels.WorkshopPluginShareCurrentTrack, request),
  getPluginShareTask: (request) => ipcRenderer.invoke(IpcChannels.WorkshopPluginGetShareTask, request),
  requestPluginNetwork: (request) => ipcRenderer.invoke(IpcChannels.WorkshopPluginNetworkRequest, request),
  reconcile: () => ipcRenderer.invoke(IpcChannels.WorkshopReconcile),
  requestDownload: (request) => ipcRenderer.invoke(IpcChannels.WorkshopRequestDownload, request),
  ingest: (request) => ipcRenderer.invoke(IpcChannels.WorkshopIngest, request),
  enable: (request) => ipcRenderer.invoke(IpcChannels.WorkshopEnable, request),
  disable: (request) => ipcRenderer.invoke(IpcChannels.WorkshopDisable, request),
  apply: (request) => ipcRenderer.invoke(IpcChannels.WorkshopApply, request),
  use: (request) => ipcRenderer.invoke(IpcChannels.WorkshopUse, request),
  browse: (request) => ipcRenderer.invoke(IpcChannels.WorkshopBrowse, request),
  subscribe: (request) => ipcRenderer.invoke(IpcChannels.WorkshopSubscribe, request),
  unsubscribe: (request) => ipcRenderer.invoke(IpcChannels.WorkshopUnsubscribe, request),
  openInSteam: (request) => ipcRenderer.invoke(IpcChannels.WorkshopOpenInSteam, request),
  getActiveLyricsScene: () => ipcRenderer.invoke(IpcChannels.WorkshopGetActiveLyricsScene),
  clearActiveLyricsScene: () => ipcRenderer.invoke(IpcChannels.WorkshopClearActiveLyricsScene),
  onActiveLyricsSceneChanged: (handler) => {
    const listener = (_event: Electron.IpcRendererEvent, scene: Parameters<typeof handler>[0]): void => handler(scene);
    ipcRenderer.on(IpcChannels.WorkshopActiveLyricsSceneChanged, listener);
    return () => ipcRenderer.off(IpcChannels.WorkshopActiveLyricsSceneChanged, listener);
  },
  getActiveVisualizerPreset: () => ipcRenderer.invoke(IpcChannels.WorkshopGetActiveVisualizerPreset),
  onActiveVisualizerPresetChanged: (handler) => {
    const listener = (_event: Electron.IpcRendererEvent, preset: Parameters<typeof handler>[0]): void => handler(preset);
    ipcRenderer.on(IpcChannels.WorkshopActiveVisualizerPresetChanged, listener);
    return () => ipcRenderer.off(IpcChannels.WorkshopActiveVisualizerPresetChanged, listener);
  },
  getActiveThemeBackground: () => ipcRenderer.invoke(IpcChannels.WorkshopGetActiveThemeBackground),
  onActiveThemeBackgroundChanged: (handler) => {
    const listener = (_event: Electron.IpcRendererEvent, background: Parameters<typeof handler>[0]): void => handler(background);
    ipcRenderer.on(IpcChannels.WorkshopActiveThemeBackgroundChanged, listener);
    return () => ipcRenderer.off(IpcChannels.WorkshopActiveThemeBackgroundChanged, listener);
  },
  setLyricsSpectrumActive: (active) => ipcRenderer.invoke(IpcChannels.WorkshopSetLyricsSpectrumActive, active),
  setPluginSpectrumActive: (active) => ipcRenderer.invoke(IpcChannels.WorkshopSetPluginSpectrumActive, active),
  setUiRuntimeActive: (active) => ipcRenderer.invoke(IpcChannels.WorkshopSetUiRuntimeActive, active),
  onUiRuntimeEmergencyExit: (handler) => {
    const listener = (): void => handler();
    ipcRenderer.on(IpcChannels.WorkshopUiRuntimeEmergencyExit, listener);
    return () => ipcRenderer.off(IpcChannels.WorkshopUiRuntimeEmergencyExit, listener);
  },
});
