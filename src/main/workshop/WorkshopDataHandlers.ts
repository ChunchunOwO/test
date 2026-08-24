import { WorkshopDataContentHandlerRegistry } from './WorkshopDataContentHandler';
import { WorkshopDspPresetHandler } from './WorkshopDspPresetHandler';
import { WorkshopLyricsStyleHandler } from './WorkshopLyricsStyleHandler';
import { WorkshopThemePresetHandler } from './WorkshopThemePresetHandler';
import { WorkshopVisualizerPresetHandler } from './WorkshopVisualizerPresetHandler';
import { WorkshopAudioPluginProfileHandler } from './WorkshopAudioPluginProfileHandler';

export const createWorkshopDataHandlerRegistry = (): WorkshopDataContentHandlerRegistry =>
  new WorkshopDataContentHandlerRegistry([
    new WorkshopThemePresetHandler(),
    new WorkshopLyricsStyleHandler(),
    new WorkshopVisualizerPresetHandler(),
    new WorkshopDspPresetHandler(),
    new WorkshopAudioPluginProfileHandler(),
  ]);
