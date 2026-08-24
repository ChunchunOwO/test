import type { AppThemePreset, AppThemeToneOverride } from '../../shared/types/appSettings';
import type { WorkshopDataContentHandler } from './WorkshopDataContentHandler';
import type { WorkshopThemePresetContribution } from './WorkshopDataContributionTypes';
import {
  asWorkshopDataRecord,
  assertWorkshopDataKeys,
  readWorkshopDataBoolean,
  readWorkshopDataHeader,
  readWorkshopDataHexColor,
  readWorkshopDataNumber,
  readWorkshopDataString,
} from './WorkshopDataValidation';
import { normalizeWorkshopThemeSkin } from './WorkshopThemeSkinNormalizer';
import { normalizeWorkshopThemeUiRuntime } from './WorkshopThemeUiRuntimeNormalizer';

const allowedBasePresets = new Set<AppThemePreset>([
  'classic',
  'echoTwilight',
  'sakuraMilk',
  'peachSoda',
  'mintCandy',
  'berryDream',
  'matchaCream',
  'lemonMochi',
  'cottonCloud',
  'melonCream',
  'seaSaltJelly',
  'caramelPudding',
  'neonCandy',
  'childrenDoodle',
  'wisteriaBubble',
  'strawberryCookie',
  'graphiteAurora',
  'amberNoir',
  'oceanStudio',
  'rosewoodVinyl',
  'shibuyaNight',
  'kyotoKurenai',
  'ukiyoIndigo',
  'fujiSnow',
  'matsuriLantern',
  'ginzaNoir',
  'frostJazz',
  'celadonPorcelain',
  'polarDaybreak',
  'plumVelvet',
  'midnightCopper',
  'taroBunny',
  'milkTeaBear',
  'ramuneGlass',
  'pistachioMousse',
  'sakuraWagashi',
  'kamakuraHydrangea',
  'ruriKintsugi',
  'hinokiRyokan',
  'nightGlass',
  'boneIron',
  'harborLamp',
  'ashRose',
]);

const colorKeys = [
  'appBg',
  'appBg2',
  'appBg3',
  'panel',
  'panelSoft',
  'accent',
  'accentStrong',
  'secondary',
  'heading',
  'text',
  'muted',
  'border',
  'onAccent',
  'buttonText',
  'titlebar',
  'sidebar',
  'player',
  'field',
  'row',
  'rowHover',
  'rowActive',
  'chip',
  'focus',
  'danger',
  'success',
  'warning',
] as const;

const numberFields = {
  panelOpacityPercent: [40, 100],
  glassPercent: [0, 80],
  shadowPercent: [0, 100],
  cornerRadiusPx: [0, 28],
  panelBlurPx: [0, 32],
  saturationPercent: [60, 140],
  motionSpeedSeconds: [0.12, 8],
  motionIntensityPercent: [0, 160],
} as const;

const normalizeTone = (value: unknown, field: 'light' | 'dark'): AppThemeToneOverride | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const input = asWorkshopDataRecord(value, `workshop_data_theme_${field}_invalid`);
  assertWorkshopDataKeys(input, [
    ...colorKeys,
    ...Object.keys(numberFields),
    'motionEnabled',
  ], `workshop_data_theme_${field}_unknown_field`);
  const output: Record<string, string | number | boolean> = {};
  for (const key of colorKeys) {
    if (input[key] !== undefined) {
      output[key] = readWorkshopDataHexColor(input[key], `theme_${field}_${key}`);
    }
  }
  for (const [key, [minimum, maximum]] of Object.entries(numberFields)) {
    if (input[key] !== undefined) {
      output[key] = readWorkshopDataNumber(
        input[key],
        `theme_${field}_${key}`,
        minimum,
        maximum,
      );
    }
  }
  if (input.motionEnabled !== undefined) {
    output.motionEnabled = readWorkshopDataBoolean(
      input.motionEnabled,
      `theme_${field}_motion_enabled`,
    );
  }
  if (Object.keys(output).length === 0) {
    throw new Error(`workshop_data_theme_${field}_empty`);
  }
  return output as AppThemeToneOverride;
};

export class WorkshopThemePresetHandler implements WorkshopDataContentHandler<'theme'> {
  readonly kind = 'theme' as const;

  normalize(inputValue: unknown, expectedContentId: string): WorkshopThemePresetContribution {
    const input = asWorkshopDataRecord(inputValue);
    assertWorkshopDataKeys(input, [
      'type',
      'schemaVersion',
      'id',
      'title',
      'description',
      'basePreset',
      'light',
      'dark',
      'swatches',
      'backgroundAsset',
      'skin',
      'runtime',
    ]);
    const header = readWorkshopDataHeader(
      input,
      'echo-workshop-theme-preset',
      expectedContentId,
    );
    const basePreset = readWorkshopDataString(input.basePreset, 'theme_base_preset', 40);
    if (!allowedBasePresets.has(basePreset as AppThemePreset)) {
      throw new Error('workshop_data_theme_base_preset_forbidden');
    }
    const light = normalizeTone(input.light, 'light');
    const dark = normalizeTone(input.dark, 'dark');
    if (!light && !dark) {
      throw new Error('workshop_data_theme_tones_missing');
    }

    let swatches: string[] | undefined;
    if (input.swatches !== undefined) {
      if (!Array.isArray(input.swatches) || input.swatches.length < 1 || input.swatches.length > 6) {
        throw new Error('workshop_data_theme_swatches_invalid');
      }
      swatches = input.swatches.map((value, index) =>
        readWorkshopDataHexColor(value, `theme_swatch_${index}`));
      if (new Set(swatches).size !== swatches.length) {
        throw new Error('workshop_data_theme_swatches_duplicate');
      }
    }

    const skin = normalizeWorkshopThemeSkin(input.skin, input.backgroundAsset);
    const runtime = normalizeWorkshopThemeUiRuntime(input.runtime);

    return {
      type: 'echo-workshop-theme-preset',
      schemaVersion: 1,
      ...header,
      basePreset: basePreset as AppThemePreset,
      ...(light ? { light } : {}),
      ...(dark ? { dark } : {}),
      ...(swatches ? { swatches } : {}),
      ...(skin?.assets?.background ? { backgroundAsset: skin.assets.background } : {}),
      ...(skin ? { skin } : {}),
      ...(runtime ? { runtime } : {}),
    };
  }
}
