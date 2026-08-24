import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import type {
  WorkshopBrowseRequest,
  WorkshopCustomizationProfile,
  WorkshopAuthoringCreateRequest,
  WorkshopAuthoringDraftInput,
  WorkshopAuthoringSaveRequest,
  WorkshopAuthoringPublishRequest,
  WorkshopAcceptanceRequest,
  WorkshopManagerItemRequest,
  WorkshopPlaybackShareStartRequest,
  WorkshopPlaybackShareTaskRequest,
  WorkshopPluginNetworkRequest,
  WorkshopPluginRuntimeRequest,
} from '../../shared/types/workshop';
import { activeJsonRpcBridge } from '../audio/HostBridgeRegistry';
import {
  isAudioVisualSpectrumEnabled,
  setWorkshopLyricsSpectrumDemand,
} from '../audio/helpers/playbackDefaults';
import { getWorkshopMaintenanceService, getWorkshopManagerService, getWorkshopSteamSource } from '../workshop/getWorkshopManagerService';
import { setWorkshopUiRuntimeActive } from '../workshop/WorkshopUiRuntimeAuthority';
import { getWorkshopPlaybackShareService } from '../workshop/WorkshopPlaybackShareService';
import { getWorkshopPluginNetworkService } from '../workshop/WorkshopPluginNetworkService';
import { WorkshopAuthoringService } from '../workshop/WorkshopAuthoringService';
import { WorkshopAuthoringPublisher } from '../workshop/WorkshopAuthoringPublisher';
import { WorkshopSdkDistributionService } from '../workshop/WorkshopSdkDistributionService';
import { pluginApiVersion } from '../../shared/types/plugins';
import { workshopContentKinds, workshopManifestSchemaVersion } from '../../shared/types/workshop';
import { WorkshopAcceptanceService } from '../workshop/WorkshopAcceptanceService';

const workshopLyricsSpectrumCleanupSenders = new WeakSet<Electron.WebContents>();
const workshopPluginSpectrumCleanupSenders = new WeakSet<Electron.WebContents>();

const syncWorkshopLyricsSpectrumDemand = (): void => {
  const bridge = activeJsonRpcBridge;
  if (bridge && !bridge.isClosed) {
    void bridge.setVisualSpectrumEnabled(isAudioVisualSpectrumEnabled()).catch(() => undefined);
  }
};

const toItemRequest = (value: unknown): WorkshopManagerItemRequest =>
  value as WorkshopManagerItemRequest;

const toBrowseRequest = (value: unknown): WorkshopBrowseRequest =>
  value as WorkshopBrowseRequest;

const normalizeCustomizationProfile = (value: unknown): WorkshopCustomizationProfile => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('workshop_customization_invalid');
  const profile = value as Partial<WorkshopCustomizationProfile>;
  if (profile.type !== 'echo-workshop-customization' || profile.schemaVersion !== 1
    || typeof profile.name !== 'string' || profile.name.trim().length === 0 || profile.name.length > 120
    || !Array.isArray(profile.plugins) || profile.plugins.length > 256
    || !Array.isArray(profile.automations) || profile.automations.length > 256) {
    throw new Error('workshop_customization_invalid');
  }
  const serialized = JSON.stringify(profile);
  if (Buffer.byteLength(serialized, 'utf8') > 1024 * 1024) throw new Error('workshop_customization_too_large');
  return JSON.parse(serialized) as WorkshopCustomizationProfile;
};

export const registerWorkshopIpc = (): void => {
  const manager = getWorkshopManagerService();
  const playbackShare = getWorkshopPlaybackShareService();
  const pluginNetwork = getWorkshopPluginNetworkService();
  const authoring = new WorkshopAuthoringService();
  const authoringPublisher = new WorkshopAuthoringPublisher(authoring, getWorkshopSteamSource());
  const acceptance = new WorkshopAcceptanceService(manager);
  const notifyPresentation = (): void => {
    const scene = manager.getActiveLyricsScene();
    const visualizer = manager.getActiveVisualizerPreset();
    const themeBackground = manager.getActiveThemeBackground();
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IpcChannels.WorkshopActiveLyricsSceneChanged, scene);
      window.webContents.send(IpcChannels.WorkshopActiveVisualizerPresetChanged, visualizer);
      window.webContents.send(IpcChannels.WorkshopActiveThemeBackgroundChanged, themeBackground);
    }
  };
  const mutate = async <T>(run: () => Promise<T>): Promise<T> => {
    const result = await run();
    notifyPresentation();
    return result;
  };
  manager.startStartupReconcile();
  ipcMain.handle(IpcChannels.WorkshopGetSnapshot, () => manager.getSnapshot());
  ipcMain.handle(IpcChannels.WorkshopGetPlugins, () => manager.getPluginSnapshot());
  ipcMain.handle(IpcChannels.WorkshopAuthoringCreate, async (_event, request: WorkshopAuthoringCreateRequest) => {
    const selection = await dialog.showOpenDialog({
      title: '选择一个空文件夹创建 ECHO Workshop 项目',
      properties: ['openDirectory', 'createDirectory'],
    });
    const rootDirectory = selection.canceled ? null : selection.filePaths[0] ?? null;
    if (!rootDirectory) return null;
    await authoring.createProject({ ...request, rootDirectory });
    return authoring.readDraft(rootDirectory);
  });
  ipcMain.handle(IpcChannels.WorkshopAuthoringOpen, async () => {
    const selection = await dialog.showOpenDialog({
      title: '打开 ECHO Workshop 项目',
      properties: ['openDirectory'],
    });
    const rootDirectory = selection.canceled ? null : selection.filePaths[0] ?? null;
    return rootDirectory ? authoring.readDraft(rootDirectory) : null;
  });
  ipcMain.handle(IpcChannels.WorkshopAuthoringValidateDraft, (_event, request: WorkshopAuthoringDraftInput) =>
    authoring.validateDraft(request));
  ipcMain.handle(IpcChannels.WorkshopAuthoringSaveDraft, (_event, request: WorkshopAuthoringSaveRequest) =>
    authoring.saveDraft(request.rootDirectory, request));
  ipcMain.handle(IpcChannels.WorkshopAuthoringPrepare, async (_event, rootDirectory: string) => {
    const prepared = await authoring.prepareProject(rootDirectory);
    return {
      rootDirectory: prepared.rootDirectory,
      contentDirectory: prepared.contentDirectory,
      previewPath: prepared.previewPath,
      vdfPath: prepared.vdfPath,
      previewHtmlPath: prepared.previewHtmlPath,
      kind: prepared.manifest.content.kind,
      id: prepared.manifest.id,
      title: prepared.manifest.title,
      version: prepared.manifest.version,
      fileCount: prepared.manifest.files.length,
      totalBytes: prepared.totalBytes,
    };
  });
  ipcMain.handle(IpcChannels.WorkshopAuthoringOpenPreview, async (_event, rootDirectory: string) => {
    const prepared = await authoring.prepareProject(rootDirectory);
    const error = await shell.openPath(prepared.previewHtmlPath);
    if (error) throw new Error('workshop_authoring_preview_open_failed');
  });
  ipcMain.handle(IpcChannels.WorkshopAuthoringOpenFolder, async (_event, rootDirectory: string) => {
    const draft = await authoring.readDraft(rootDirectory);
    const error = await shell.openPath(draft.rootDirectory);
    if (error) throw new Error('workshop_authoring_folder_open_failed');
  });
  ipcMain.handle(IpcChannels.WorkshopAuthoringPublish, (_event, request: WorkshopAuthoringPublishRequest) =>
    authoringPublisher.publishProject(request));
  ipcMain.handle(IpcChannels.WorkshopAuthoringCopySdk, async () => {
    const selection = await dialog.showOpenDialog({
      title: '选择保存 ECHO Workshop SDK 的文件夹',
      properties: ['openDirectory', 'createDirectory'],
    });
    const parentDirectory = selection.canceled ? null : selection.filePaths[0] ?? null;
    if (!parentDirectory) return null;
    const sourceDirectory = app.isPackaged
      ? resolve(process.resourcesPath, 'workshop-sdk')
      : resolve(app.getAppPath(), 'docs', 'workshop-sdk');
    const directory = await new WorkshopSdkDistributionService(sourceDirectory).copyTo(parentDirectory);
    const error = await shell.openPath(directory);
    if (error) throw new Error('workshop_sdk_folder_open_failed');
    return { directory, sdkVersion: 1 as const };
  });
  ipcMain.handle(IpcChannels.WorkshopGetSdkDescriptor, () => ({
    sdkVersion: 1,
    manifest: {
      type: 'echo-workshop-item',
      schemaVersions: [workshopManifestSchemaVersion],
      contentKinds: [...workshopContentKinds],
    },
    plugin: {
      apiVersions: Array.from({ length: pluginApiVersion }, (_, index) => index + 1),
      currentApiVersion: pluginApiVersion,
      declarationFile: 'docs/workshop-sdk/echo-workshop-plugin.d.ts',
    },
    audioPluginAdapter: {
      api: 'echo.audio-plugin-adapter',
      protocolVersions: [1],
    },
  }));
  ipcMain.handle(IpcChannels.WorkshopRunAcceptance, (_event, request: WorkshopAcceptanceRequest) =>
    acceptance.run(request));
  ipcMain.handle(IpcChannels.WorkshopRollback, (_event, request: unknown) =>
    mutate(() => manager.rollback(toItemRequest(request))));
  ipcMain.handle(IpcChannels.WorkshopMaintenancePreview, () =>
    getWorkshopMaintenanceService().previewCleanup());
  ipcMain.handle(IpcChannels.WorkshopMaintenanceCleanup, (_event, token: string) =>
    getWorkshopMaintenanceService().cleanup(token));
  ipcMain.handle(IpcChannels.WorkshopCustomizationExport, async (_event, value: unknown) => {
    const profile = normalizeCustomizationProfile(value);
    const selection = await dialog.showSaveDialog({
      title: '导出 ECHO 创意工坊配置方案',
      defaultPath: 'ECHO-Workshop-profile.echo-workshop.json',
      filters: [{ name: 'ECHO Workshop profile', extensions: ['json'] }],
    });
    if (selection.canceled || !selection.filePath) return null;
    await writeFile(selection.filePath, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');
    return selection.filePath;
  });
  ipcMain.handle(IpcChannels.WorkshopCustomizationImport, async () => {
    const selection = await dialog.showOpenDialog({
      title: '导入 ECHO 创意工坊配置方案',
      properties: ['openFile'],
      filters: [{ name: 'ECHO Workshop profile', extensions: ['json'] }],
    });
    const filePath = selection.canceled ? null : selection.filePaths[0] ?? null;
    if (!filePath) return null;
    const file = await readFile(filePath);
    if (file.byteLength > 1024 * 1024) throw new Error('workshop_customization_too_large');
    return normalizeCustomizationProfile(JSON.parse(file.toString('utf8')) as unknown);
  });
  ipcMain.handle(IpcChannels.WorkshopPluginGetShareInfo, (_event, request: WorkshopPluginRuntimeRequest) =>
    playbackShare.getShareInfo(request.sourceId, request.itemId));
  ipcMain.handle(IpcChannels.WorkshopPluginShareCurrentTrack, (_event, request: WorkshopPlaybackShareStartRequest) =>
    playbackShare.shareCurrentTrack(request));
  ipcMain.handle(IpcChannels.WorkshopPluginGetShareTask, (_event, request: WorkshopPlaybackShareTaskRequest) =>
    playbackShare.getShareTask(request));
  ipcMain.handle(IpcChannels.WorkshopPluginNetworkRequest, (_event, request: WorkshopPluginNetworkRequest) =>
    pluginNetwork.request(request));
  ipcMain.handle(IpcChannels.WorkshopGetActiveLyricsScene, () => manager.getActiveLyricsScene());
  ipcMain.handle(IpcChannels.WorkshopClearActiveLyricsScene, () => mutate(async () => manager.clearActiveLyricsScene()));
  ipcMain.handle(IpcChannels.WorkshopGetActiveVisualizerPreset, () => manager.getActiveVisualizerPreset());
  ipcMain.handle(IpcChannels.WorkshopGetActiveThemeBackground, () => manager.getActiveThemeBackground());
  ipcMain.handle(IpcChannels.WorkshopSetLyricsSpectrumActive, (event, active: unknown): boolean => {
    const clientId = event.sender.id;
    const enabled = active === true;
    setWorkshopLyricsSpectrumDemand(clientId, enabled);
    if (enabled && !workshopLyricsSpectrumCleanupSenders.has(event.sender)) {
      workshopLyricsSpectrumCleanupSenders.add(event.sender);
      event.sender.once('destroyed', () => {
        setWorkshopLyricsSpectrumDemand(clientId, false);
        syncWorkshopLyricsSpectrumDemand();
      });
    }
    syncWorkshopLyricsSpectrumDemand();
    return enabled;
  });
  ipcMain.handle(IpcChannels.WorkshopSetPluginSpectrumActive, (event, active: unknown): boolean => {
    const clientId = -event.sender.id;
    const enabled = active === true;
    setWorkshopLyricsSpectrumDemand(clientId, enabled);
    if (enabled && !workshopPluginSpectrumCleanupSenders.has(event.sender)) {
      workshopPluginSpectrumCleanupSenders.add(event.sender);
      event.sender.once('destroyed', () => {
        setWorkshopLyricsSpectrumDemand(clientId, false);
        syncWorkshopLyricsSpectrumDemand();
      });
    }
    syncWorkshopLyricsSpectrumDemand();
    return enabled;
  });
  ipcMain.handle(IpcChannels.WorkshopSetUiRuntimeActive, (event, active: unknown) => {
    setWorkshopUiRuntimeActive(event.sender, active === true);
  });
  ipcMain.handle(IpcChannels.WorkshopReconcile, () => mutate(() => manager.reconcile()));
  ipcMain.handle(IpcChannels.WorkshopRequestDownload, (_event, request: unknown) =>
    mutate(() => manager.requestDownload(toItemRequest(request))));
  ipcMain.handle(IpcChannels.WorkshopIngest, (_event, request: unknown) =>
    mutate(() => manager.ingest(toItemRequest(request))));
  ipcMain.handle(IpcChannels.WorkshopEnable, (_event, request: unknown) =>
    mutate(() => manager.enable(toItemRequest(request))));
  ipcMain.handle(IpcChannels.WorkshopDisable, (_event, request: unknown) =>
    mutate(() => manager.disable(toItemRequest(request))));
  ipcMain.handle(IpcChannels.WorkshopApply, (_event, request: unknown) =>
    mutate(() => manager.apply(toItemRequest(request))));
  ipcMain.handle(IpcChannels.WorkshopUse, (_event, request: unknown) =>
    mutate(() => manager.use(toItemRequest(request))));
  ipcMain.handle(IpcChannels.WorkshopBrowse, (_event, request: unknown) =>
    manager.browse(toBrowseRequest(request)));
  ipcMain.handle(IpcChannels.WorkshopSubscribe, (_event, request: unknown) =>
    mutate(() => manager.subscribe(toItemRequest(request))));
  ipcMain.handle(IpcChannels.WorkshopUnsubscribe, (_event, request: unknown) =>
    mutate(() => manager.unsubscribe(toItemRequest(request))));
  ipcMain.handle(IpcChannels.WorkshopOpenInSteam, (_event, request: unknown) =>
    mutate(() => manager.openInSteam(toItemRequest(request))));
};
