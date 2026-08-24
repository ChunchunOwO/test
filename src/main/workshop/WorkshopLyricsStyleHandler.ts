import type { LyricsPageStyle } from '../../shared/types/appSettings';
import type { WorkshopDataContentHandler } from './WorkshopDataContentHandler';
import type {
  WorkshopLyricsStyleContribution,
  WorkshopLyricsStyleSettings,
} from './WorkshopDataContributionTypes';
import {
  asWorkshopDataRecord,
  assertWorkshopDataKeys,
  readWorkshopDataBoolean,
  readWorkshopDataHeader,
  readWorkshopDataHexColor,
  readWorkshopDataNumber,
  readWorkshopDataString,
} from './WorkshopDataValidation';
import { normalizeWorkshopLyricsScene } from './WorkshopLyricsSceneNormalizer';

const lyricsPageStyles = new Set<LyricsPageStyle>([
  'default',
  'editorial',
  'folded',
  'roseVinyl',
  'cinemaStage',
  'kineticPoster',
  'coverStage',
  'cutBoard',
]);

const numberFields = {
  lyricsFontSizePx: [16, 96],
  lyricsSecondaryFontSizePx: [10, 64],
  lyricsLineSpacingPercent: [80, 240],
  lyricsContextOpacityPercent: [0, 100],
  lyricsCoverOpacityPercent: [0, 100],
  lyricsCoverBlurPx: [0, 80],
  lyricsCoverBrightnessPercent: [20, 150],
  lyricsBackgroundScalePercent: [100, 160],
} as const;

const booleanFields = [
  'lyricsSmartReadableColorsEnabled',
  'lyricsWordHighlightEnabled',
  'lyricsImmersiveCoverStyleEnabled',
  'lyricsImmersiveCoverGlassEnabled',
  'lyricsMusicReactiveVisualsEnabled',
] as const;

const allowedSettingsKeys = [
  'lyricsPageStyle',
  ...Object.keys(numberFields),
  ...booleanFields,
  'lyricsColor',
  'lyricsBackgroundMode',
] as const;

export class WorkshopLyricsStyleHandler implements WorkshopDataContentHandler<'lyrics-style'> {
  readonly kind = 'lyrics-style' as const;

  normalize(inputValue: unknown, expectedContentId: string): WorkshopLyricsStyleContribution {
    const input = asWorkshopDataRecord(inputValue);
    assertWorkshopDataKeys(input, [
      'type',
      'schemaVersion',
      'id',
      'title',
      'description',
      'settings',
      'scene',
    ]);
    const header = readWorkshopDataHeader(
      input,
      'echo-workshop-lyrics-style',
      expectedContentId,
    );
    const settingsInput = input.settings === undefined
      ? {}
      : asWorkshopDataRecord(input.settings, 'workshop_data_lyrics_settings_invalid');
    assertWorkshopDataKeys(settingsInput, allowedSettingsKeys, 'workshop_data_lyrics_settings_unknown_field');
    const settings: Record<string, string | number | boolean> = {};

    if (settingsInput.lyricsPageStyle !== undefined) {
      const style = readWorkshopDataString(
        settingsInput.lyricsPageStyle,
        'lyrics_page_style',
        32,
      );
      if (!lyricsPageStyles.has(style as LyricsPageStyle)) {
        throw new Error('workshop_data_lyrics_page_style_invalid');
      }
      settings.lyricsPageStyle = style;
    }
    for (const [key, [minimum, maximum]] of Object.entries(numberFields)) {
      if (settingsInput[key] !== undefined) {
        settings[key] = readWorkshopDataNumber(
          settingsInput[key],
          `lyrics_${key}`,
          minimum,
          maximum,
        );
      }
    }
    for (const key of booleanFields) {
      if (settingsInput[key] !== undefined) {
        settings[key] = readWorkshopDataBoolean(settingsInput[key], `lyrics_${key}`);
      }
    }
    if (settingsInput.lyricsColor !== undefined) {
      settings.lyricsColor = readWorkshopDataHexColor(
        settingsInput.lyricsColor,
        'lyrics_color',
      );
    }
    if (settingsInput.lyricsBackgroundMode !== undefined) {
      const mode = readWorkshopDataString(
        settingsInput.lyricsBackgroundMode,
        'lyrics_background_mode',
        20,
      );
      if (!['theme', 'cover', 'coverColor'].includes(mode)) {
        throw new Error('workshop_data_lyrics_background_mode_invalid');
      }
      settings.lyricsBackgroundMode = mode;
    }
    const scene = input.scene === undefined ? undefined : normalizeWorkshopLyricsScene(input.scene);
    if (Object.keys(settings).length === 0 && !scene) {
      throw new Error('workshop_data_lyrics_settings_empty');
    }

    return {
      type: 'echo-workshop-lyrics-style',
      schemaVersion: 1,
      ...header,
      ...(Object.keys(settings).length > 0 ? { settings: settings as WorkshopLyricsStyleSettings } : {}),
      ...(scene ? { scene } : {}),
    };
  }
}
