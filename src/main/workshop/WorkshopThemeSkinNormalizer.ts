import {
  defaultWorkshopThemeSkinEffects,
  defaultWorkshopThemeIdentity,
  defaultWorkshopThemeSkinLayout,
  defaultWorkshopThemeSkinStages,
  workshopThemeCardStyles,
  workshopThemeContentDensities,
  workshopThemeDisplayStyles,
  workshopThemeHomeStages,
  workshopThemeBrandPresentations,
  workshopThemeIconKeys,
  workshopThemeLyricsStages,
  workshopThemeMotionStyles,
  workshopThemeNavStyles,
  workshopThemePlayerStyles,
  workshopThemeQueueStyles,
  workshopThemeSidebarPositions,
  workshopThemeSidebarPresentations,
  workshopThemeSidebarWidths,
  workshopThemeSkinAssetKeys,
  workshopThemeSkinModes,
  workshopThemeSongsStyles,
  workshopThemeTitlebarStyles,
  type WorkshopThemeSkinEffects,
  type WorkshopThemeIconKey,
  type WorkshopThemeSkinLayout,
  type WorkshopThemeSkinMode,
  type WorkshopThemeSkinStages,
} from '../../shared/types/workshop';
import type {
  WorkshopThemeSkinAssetPaths,
  WorkshopThemeSkinContribution,
  WorkshopThemeIconAtlasContribution,
  WorkshopThemeIdentityContribution,
} from './WorkshopDataContributionTypes';
import { normalizeWorkshopAssetPath } from './WorkshopAssetPolicy';
import {
  asWorkshopDataRecord,
  assertWorkshopDataKeys,
  readWorkshopDataNumber,
  readWorkshopDataBoolean,
} from './WorkshopDataValidation';

const layoutKeys = [
  'sidebarPosition',
  'sidebarPresentation',
  'sidebarWidth',
  'playerStyle',
  'titlebarStyle',
  'contentDensity',
  'cardStyle',
  'displayStyle',
  'navStyle',
  'motion',
] as const;

const stageKeys = ['home', 'lyrics', 'queue', 'songs'] as const;
const effectKeys = [
  'grainPercent',
  'vignettePercent',
  'glowPercent',
  'scrimPercent',
  'bloomPercent',
  'mistPercent',
  'dimChromePercent',
  'spotlightPercent',
  'frostPercent',
] as const;
const identityKeys = ['brandPresentation', 'brandAsset', 'showEditionBadge', 'showVersion'] as const;
const iconAtlasKeys = ['asset', 'columns', 'rows', 'map'] as const;

const effectBounds: Record<(typeof effectKeys)[number], readonly [number, number]> = {
  grainPercent: [0, 40],
  vignettePercent: [0, 60],
  glowPercent: [0, 80],
  scrimPercent: [8, 90],
  bloomPercent: [0, 50],
  mistPercent: [0, 40],
  dimChromePercent: [0, 60],
  spotlightPercent: [0, 80],
  frostPercent: [0, 40],
};

const readEnum = <T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
  fallback: T,
): T => {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new Error(`workshop_data_${field}_invalid`);
  }
  return value as T;
};

const normalizeAssets = (value: unknown): WorkshopThemeSkinAssetPaths | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const input = asWorkshopDataRecord(value, 'workshop_data_theme_skin_assets_invalid');
  assertWorkshopDataKeys(input, workshopThemeSkinAssetKeys, 'workshop_data_theme_skin_assets_unknown_field');
  const output: WorkshopThemeSkinAssetPaths = {};
  for (const key of workshopThemeSkinAssetKeys) {
    if (input[key] !== undefined) {
      output[key] = normalizeWorkshopAssetPath(input[key], `theme_skin_asset_${key}`);
    }
  }
  return Object.keys(output).length > 0 ? output : undefined;
};

const normalizeLayout = (value: unknown): WorkshopThemeSkinLayout => {
  if (value === undefined) {
    return { ...defaultWorkshopThemeSkinLayout };
  }
  const input = asWorkshopDataRecord(value, 'workshop_data_theme_skin_layout_invalid');
  assertWorkshopDataKeys(input, layoutKeys, 'workshop_data_theme_skin_layout_unknown_field');
  return {
    sidebarPosition: readEnum(input.sidebarPosition, 'theme_skin_sidebar_position', workshopThemeSidebarPositions, defaultWorkshopThemeSkinLayout.sidebarPosition),
    sidebarPresentation: readEnum(input.sidebarPresentation, 'theme_skin_sidebar_presentation', workshopThemeSidebarPresentations, defaultWorkshopThemeSkinLayout.sidebarPresentation),
    sidebarWidth: readEnum(input.sidebarWidth, 'theme_skin_sidebar_width', workshopThemeSidebarWidths, defaultWorkshopThemeSkinLayout.sidebarWidth),
    playerStyle: readEnum(input.playerStyle, 'theme_skin_player_style', workshopThemePlayerStyles, defaultWorkshopThemeSkinLayout.playerStyle),
    titlebarStyle: readEnum(input.titlebarStyle, 'theme_skin_titlebar_style', workshopThemeTitlebarStyles, defaultWorkshopThemeSkinLayout.titlebarStyle),
    contentDensity: readEnum(input.contentDensity, 'theme_skin_content_density', workshopThemeContentDensities, defaultWorkshopThemeSkinLayout.contentDensity),
    cardStyle: readEnum(input.cardStyle, 'theme_skin_card_style', workshopThemeCardStyles, defaultWorkshopThemeSkinLayout.cardStyle),
    displayStyle: readEnum(input.displayStyle, 'theme_skin_display_style', workshopThemeDisplayStyles, defaultWorkshopThemeSkinLayout.displayStyle),
    navStyle: readEnum(input.navStyle, 'theme_skin_nav_style', workshopThemeNavStyles, defaultWorkshopThemeSkinLayout.navStyle),
    motion: readEnum(input.motion, 'theme_skin_motion', workshopThemeMotionStyles, defaultWorkshopThemeSkinLayout.motion),
  };
};

const normalizeStages = (value: unknown): WorkshopThemeSkinStages => {
  if (value === undefined) {
    return { ...defaultWorkshopThemeSkinStages };
  }
  const input = asWorkshopDataRecord(value, 'workshop_data_theme_skin_stages_invalid');
  assertWorkshopDataKeys(input, stageKeys, 'workshop_data_theme_skin_stages_unknown_field');
  return {
    home: readEnum(input.home, 'theme_skin_home_stage', workshopThemeHomeStages, defaultWorkshopThemeSkinStages.home),
    lyrics: readEnum(input.lyrics, 'theme_skin_lyrics_stage', workshopThemeLyricsStages, defaultWorkshopThemeSkinStages.lyrics),
    queue: readEnum(input.queue, 'theme_skin_queue_stage', workshopThemeQueueStyles, defaultWorkshopThemeSkinStages.queue),
    songs: readEnum(input.songs, 'theme_skin_songs_stage', workshopThemeSongsStyles, defaultWorkshopThemeSkinStages.songs),
  };
};

const normalizeEffects = (value: unknown): WorkshopThemeSkinEffects => {
  if (value === undefined) {
    return { ...defaultWorkshopThemeSkinEffects };
  }
  const input = asWorkshopDataRecord(value, 'workshop_data_theme_skin_effects_invalid');
  assertWorkshopDataKeys(input, effectKeys, 'workshop_data_theme_skin_effects_unknown_field');
  const output: WorkshopThemeSkinEffects = { ...defaultWorkshopThemeSkinEffects };
  for (const key of effectKeys) {
    if (input[key] !== undefined) {
      output[key] = readWorkshopDataNumber(input[key], `theme_skin_${key}`, ...effectBounds[key]);
    }
  }
  return output;
};

const normalizeIdentity = (value: unknown): WorkshopThemeIdentityContribution => {
  if (value === undefined) {
    return {
      brandPresentation: defaultWorkshopThemeIdentity.brandPresentation,
      showEditionBadge: defaultWorkshopThemeIdentity.showEditionBadge,
      showVersion: defaultWorkshopThemeIdentity.showVersion,
    };
  }
  const input = asWorkshopDataRecord(value, 'workshop_data_theme_skin_identity_invalid');
  assertWorkshopDataKeys(input, identityKeys, 'workshop_data_theme_skin_identity_unknown_field');
  const brandPresentation = readEnum(
    input.brandPresentation,
    'theme_skin_brand_presentation',
    workshopThemeBrandPresentations,
    defaultWorkshopThemeIdentity.brandPresentation,
  );
  const brandAsset = input.brandAsset === undefined
    ? undefined
    : normalizeWorkshopAssetPath(input.brandAsset, 'theme_skin_brand_asset');
  if (brandPresentation === 'asset' && !brandAsset) {
    throw new Error('workshop_data_theme_skin_brand_asset_missing');
  }
  if (brandPresentation !== 'asset' && brandAsset) {
    throw new Error('workshop_data_theme_skin_brand_asset_unused');
  }
  return {
    brandPresentation,
    ...(brandAsset ? { brandAsset } : {}),
    showEditionBadge: input.showEditionBadge === undefined
      ? defaultWorkshopThemeIdentity.showEditionBadge
      : readWorkshopDataBoolean(input.showEditionBadge, 'theme_skin_show_edition_badge'),
    showVersion: input.showVersion === undefined
      ? defaultWorkshopThemeIdentity.showVersion
      : readWorkshopDataBoolean(input.showVersion, 'theme_skin_show_version'),
  };
};

const normalizeIconAtlas = (value: unknown): WorkshopThemeIconAtlasContribution | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const input = asWorkshopDataRecord(value, 'workshop_data_theme_skin_icon_atlas_invalid');
  assertWorkshopDataKeys(input, iconAtlasKeys, 'workshop_data_theme_skin_icon_atlas_unknown_field');
  const columns = readWorkshopDataNumber(input.columns, 'theme_skin_icon_atlas_columns', 1, 16);
  const rows = readWorkshopDataNumber(input.rows, 'theme_skin_icon_atlas_rows', 1, 16);
  if (!Number.isInteger(columns) || !Number.isInteger(rows)) {
    throw new Error('workshop_data_theme_skin_icon_atlas_grid_invalid');
  }
  const mapInput = asWorkshopDataRecord(input.map, 'workshop_data_theme_skin_icon_atlas_map_invalid');
  assertWorkshopDataKeys(mapInput, workshopThemeIconKeys, 'workshop_data_theme_skin_icon_atlas_map_unknown_field');
  const cellCount = columns * rows;
  const map: Partial<Record<WorkshopThemeIconKey, number>> = {};
  for (const key of workshopThemeIconKeys) {
    if (mapInput[key] === undefined) {
      continue;
    }
    const index = readWorkshopDataNumber(mapInput[key], `theme_skin_icon_atlas_${key}`, 0, cellCount - 1);
    if (!Number.isInteger(index)) {
      throw new Error('workshop_data_theme_skin_icon_atlas_index_invalid');
    }
    map[key] = index;
  }
  if (Object.keys(map).length === 0) {
    throw new Error('workshop_data_theme_skin_icon_atlas_map_empty');
  }
  return {
    asset: normalizeWorkshopAssetPath(input.asset, 'theme_skin_icon_atlas_asset'),
    columns,
    rows,
    map,
  };
};

export const normalizeWorkshopThemeSkin = (
  skinValue: unknown,
  backgroundAsset: unknown,
): WorkshopThemeSkinContribution | undefined => {
  const backgroundFromAlias = backgroundAsset === undefined
    ? undefined
    : normalizeWorkshopAssetPath(backgroundAsset, 'theme_background_asset');
  if (skinValue === undefined && backgroundFromAlias === undefined) {
    return undefined;
  }

  const input = skinValue === undefined
    ? {}
    : asWorkshopDataRecord(skinValue, 'workshop_data_theme_skin_invalid');
  assertWorkshopDataKeys(input, ['mode', 'layout', 'stages', 'assets', 'effects', 'identity', 'iconAtlas'], 'workshop_data_theme_skin_unknown_field');

  const assets = normalizeAssets(input.assets);
  const background = assets?.background ?? backgroundFromAlias;
  if (assets?.background && backgroundFromAlias && assets.background !== backgroundFromAlias) {
    throw new Error('workshop_data_theme_skin_background_conflict');
  }

  const nextAssets: WorkshopThemeSkinAssetPaths | undefined = background
    ? { ...assets, background }
    : assets;

  return {
    mode: readEnum(input.mode, 'theme_skin_mode', workshopThemeSkinModes, 'chrome') as WorkshopThemeSkinMode,
    layout: normalizeLayout(input.layout),
    stages: normalizeStages(input.stages),
    ...(nextAssets ? { assets: nextAssets } : {}),
    effects: normalizeEffects(input.effects),
    identity: normalizeIdentity(input.identity),
    ...(input.iconAtlas === undefined ? {} : { iconAtlas: normalizeIconAtlas(input.iconAtlas) }),
  };
};
