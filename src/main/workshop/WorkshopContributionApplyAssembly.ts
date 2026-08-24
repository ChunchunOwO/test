import { BrowserWindow } from 'electron';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import type { AppSettings } from '../../shared/types/appSettings';
import { getAppSettings, setAppSettings } from '../app/appSettings';
import { syncNativeThemeSource } from '../app/nativeThemePreference';
import { getDspBridge } from '../ipc/audioIpc';
import {
  createWorkshopLyricsStyleApplyAdapter,
  createWorkshopThemeApplyAdapter,
  type WorkshopAppSettingsPort,
} from './WorkshopAppSettingsApplyAdapters';
import { WorkshopContributionApplyService } from './WorkshopContributionApplyService';
import { createWorkshopDspPresetApplyAdapter } from './WorkshopDspPresetApplyAdapter';
import type { WorkshopDataCatalog } from './WorkshopDataCatalog';
import type { WorkshopRegistry } from './WorkshopRegistry';
import { WorkshopLyricsSceneSelectionStore } from './WorkshopLyricsSceneSelectionStore';
import { WorkshopLyricsSceneService } from './WorkshopLyricsSceneService';
import { WorkshopRevisionReceiptStore } from './WorkshopRevisionReceiptStore';
import { WorkshopThemeBackgroundService, getWorkshopThemeBackgroundSelectionPath } from './WorkshopThemeBackgroundService';
import { WorkshopVisualizerPresetService, getWorkshopVisualizerPresetSelectionPath } from './WorkshopVisualizerPresetService';
import { createWorkshopVisualizerPresetApplyAdapter } from './WorkshopVisualizerPresetApplyAdapter';

export type WorkshopContributionApplyAssemblyOptions = {
  registry: WorkshopRegistry;
  catalog: WorkshopDataCatalog;
};

const workshopSettingsOptions = {
  finalThemeUnlocked: true,
  downloadsFeatureUnlocked: false,
} as const;

export const getActiveWorkshopThemeId = (): string | null =>
  getAppSettings(workshopSettingsOptions).appearanceThemeCustomId ?? null;

const createAppSettingsPort = (): WorkshopAppSettingsPort => ({
  getSettings: () => getAppSettings(workshopSettingsOptions),
  applySettings: async (patch: Partial<AppSettings>): Promise<AppSettings> => {
    const applied = setAppSettings(patch, workshopSettingsOptions);
    syncNativeThemeSource(applied);
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IpcChannels.AppSharedSettingsChanged);
    }
    return applied;
  },
});

export const createWorkshopContributionApplyService = (
  options: WorkshopContributionApplyAssemblyOptions,
): WorkshopContributionApplyService => {
  const settings = createAppSettingsPort();
  const lyricsScenes = new WorkshopLyricsSceneService({
    registry: options.registry,
    catalog: options.catalog,
    store: new WorkshopLyricsSceneSelectionStore(),
  });
  const visualizerPresets = new WorkshopVisualizerPresetService({
    registry: options.registry,
    catalog: options.catalog,
    store: new WorkshopRevisionReceiptStore(getWorkshopVisualizerPresetSelectionPath()),
  });
  const themeBackgrounds = new WorkshopThemeBackgroundService({
    registry: options.registry,
    catalog: options.catalog,
    store: new WorkshopRevisionReceiptStore(getWorkshopThemeBackgroundSelectionPath()),
  });
  return new WorkshopContributionApplyService({
    registry: options.registry,
    catalog: options.catalog,
    adapters: [
      createWorkshopThemeApplyAdapter(settings, themeBackgrounds),
      createWorkshopLyricsStyleApplyAdapter(settings, lyricsScenes),
      createWorkshopVisualizerPresetApplyAdapter(visualizerPresets),
      createWorkshopDspPresetApplyAdapter(getDspBridge),
    ],
    lyricsScenes,
    visualizerPresets,
    themeBackgrounds,
  });
};
