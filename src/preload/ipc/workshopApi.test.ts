import { describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import { createMockIpcRenderer } from '../../test-utils/electronMocks';
import { createWorkshopApi } from './workshopApi';

describe('Workshop preload API', () => {
  it('exposes only the typed Workshop management command surface', async () => {
    const ipcRenderer = createMockIpcRenderer();
    const api = createWorkshopApi(ipcRenderer as never, IpcChannels);
    const request = { sourceId: 'steam', itemId: '123' };

    await api.getSnapshot();
    await api.getPlugins();
    const authoringCreate = { kind: 'theme' as const, id: 'test', title: 'Test', licenseHolder: 'Tester', minEchoVersion: '26.8.2' };
    const authoringDraft = { manifestText: '{}', entryText: '{}' };
    await api.createAuthoringProject(authoringCreate);
    await api.openAuthoringProject();
    await api.validateAuthoringDraft(authoringDraft);
    await api.saveAuthoringDraft({ rootDirectory: 'D:\\Workshop\\test', ...authoringDraft });
    await api.prepareAuthoringProject('D:\\Workshop\\test');
    await api.openAuthoringPreview('D:\\Workshop\\test');
    await api.openAuthoringFolder('D:\\Workshop\\test');
    await api.copyAuthoringSdk();
    const customization = { type: 'echo-workshop-customization' as const, schemaVersion: 1 as const, exportedAt: '2026-08-17T00:00:00.000Z', name: 'Setup', plugins: [], automations: [] };
    await api.rollback(request);
    await api.previewMaintenanceCleanup();
    await api.runMaintenanceCleanup('preview-token');
    await api.exportCustomizationProfile(customization);
    await api.importCustomizationProfile();
    await api.getPluginShareInfo(request);
    await api.sharePluginCurrentTrack({ ...request, uploadUrl: 'https://share.example/upload' });
    await api.getPluginShareTask({ ...request, taskId: 'task-1' });
    await api.requestPluginNetwork({ ...request, url: 'https://api.example/catalog' });
    await api.reconcile();
    await api.requestDownload(request);
    await api.ingest(request);
    await api.enable(request);
    await api.disable(request);
    await api.apply(request);
    await api.use(request);
    await api.browse({ page: 1, sort: 'trend' });
    await api.subscribe(request);
    await api.unsubscribe(request);
    await api.openInSteam(request);
    await api.getActiveLyricsScene();
    await api.clearActiveLyricsScene();
    await api.getActiveVisualizerPreset();
    await api.getActiveThemeBackground();
    await api.setLyricsSpectrumActive(true);
    await api.setPluginSpectrumActive(true);
    await api.setUiRuntimeActive(true);

    expect(ipcRenderer.invoke.mock.calls).toEqual([
      [IpcChannels.WorkshopGetSnapshot],
      [IpcChannels.WorkshopGetPlugins],
      [IpcChannels.WorkshopAuthoringCreate, authoringCreate],
      [IpcChannels.WorkshopAuthoringOpen],
      [IpcChannels.WorkshopAuthoringValidateDraft, authoringDraft],
      [IpcChannels.WorkshopAuthoringSaveDraft, { rootDirectory: 'D:\\Workshop\\test', ...authoringDraft }],
      [IpcChannels.WorkshopAuthoringPrepare, 'D:\\Workshop\\test'],
      [IpcChannels.WorkshopAuthoringOpenPreview, 'D:\\Workshop\\test'],
      [IpcChannels.WorkshopAuthoringOpenFolder, 'D:\\Workshop\\test'],
      [IpcChannels.WorkshopAuthoringCopySdk],
      [IpcChannels.WorkshopRollback, request],
      [IpcChannels.WorkshopMaintenancePreview],
      [IpcChannels.WorkshopMaintenanceCleanup, 'preview-token'],
      [IpcChannels.WorkshopCustomizationExport, customization],
      [IpcChannels.WorkshopCustomizationImport],
      [IpcChannels.WorkshopPluginGetShareInfo, request],
      [IpcChannels.WorkshopPluginShareCurrentTrack, { ...request, uploadUrl: 'https://share.example/upload' }],
      [IpcChannels.WorkshopPluginGetShareTask, { ...request, taskId: 'task-1' }],
      [IpcChannels.WorkshopPluginNetworkRequest, { ...request, url: 'https://api.example/catalog' }],
      [IpcChannels.WorkshopReconcile],
      [IpcChannels.WorkshopRequestDownload, request],
      [IpcChannels.WorkshopIngest, request],
      [IpcChannels.WorkshopEnable, request],
      [IpcChannels.WorkshopDisable, request],
      [IpcChannels.WorkshopApply, request],
      [IpcChannels.WorkshopUse, request],
      [IpcChannels.WorkshopBrowse, { page: 1, sort: 'trend' }],
      [IpcChannels.WorkshopSubscribe, request],
      [IpcChannels.WorkshopUnsubscribe, request],
      [IpcChannels.WorkshopOpenInSteam, request],
      [IpcChannels.WorkshopGetActiveLyricsScene],
      [IpcChannels.WorkshopClearActiveLyricsScene],
      [IpcChannels.WorkshopGetActiveVisualizerPreset],
      [IpcChannels.WorkshopGetActiveThemeBackground],
      [IpcChannels.WorkshopSetLyricsSpectrumActive, true],
      [IpcChannels.WorkshopSetPluginSpectrumActive, true],
      [IpcChannels.WorkshopSetUiRuntimeActive, true],
    ]);

    const handler = vi.fn();
    const unsubscribe = api.onActiveLyricsSceneChanged(handler);
    const listener = ipcRenderer.on.mock.calls.at(-1)?.[1] as ((event: unknown, scene: null) => void);
    listener({}, null);
    expect(handler).toHaveBeenCalledWith(null);

    unsubscribe();
    expect(ipcRenderer.off).toHaveBeenCalledWith(
      IpcChannels.WorkshopActiveLyricsSceneChanged,
      listener,
    );

    const emergencyHandler = vi.fn();
    const unsubscribeEmergency = api.onUiRuntimeEmergencyExit(emergencyHandler);
    const emergencyListener = ipcRenderer.on.mock.calls.at(-1)?.[1] as (() => void);
    emergencyListener();
    expect(emergencyHandler).toHaveBeenCalledTimes(1);
    unsubscribeEmergency();
    expect(ipcRenderer.off).toHaveBeenCalledWith(
      IpcChannels.WorkshopUiRuntimeEmergencyExit,
      emergencyListener,
    );
  });
});
