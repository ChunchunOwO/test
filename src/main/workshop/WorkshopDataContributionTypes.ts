import type {
  AppThemePreset,
  AppThemeToneOverride,
  LyricsBackgroundMode,
  LyricsPageStyle,
} from '../../shared/types/appSettings';
import type { EqBand, EqSavePresetRequest } from '../../shared/types/eq';
import type {
  WorkshopContentKind,
  WorkshopThemeSkinAssetUrls,
  WorkshopThemeSkinEffects,
  WorkshopThemeBrandPresentation,
  WorkshopThemeIconKey,
  WorkshopThemeUiCapability,
  WorkshopThemeSkinLayout,
  WorkshopThemeSkinMode,
  WorkshopThemeSkinStages,
} from '../../shared/types/workshop';
import type { WorkshopLyricsScene } from '../../shared/types/workshopLyricsScene';

export const workshopDataEntrySchemaVersion = 1 as const;

export const workshopDataContentKinds = [
  'theme',
  'lyrics-style',
  'visualizer-preset',
  'dsp-preset',
  'audio-plugin-profile',
] as const;

export type WorkshopDataContentKind = (typeof workshopDataContentKinds)[number];

export type WorkshopThemeSkinAssetPaths = Partial<WorkshopThemeSkinAssetUrls>;

export type WorkshopThemeIdentityContribution = {
  brandPresentation: WorkshopThemeBrandPresentation;
  brandAsset?: string;
  showEditionBadge: boolean;
  showVersion: boolean;
};

export type WorkshopThemeIconAtlasContribution = {
  asset: string;
  columns: number;
  rows: number;
  map: Partial<Record<WorkshopThemeIconKey, number>>;
};

export type WorkshopThemeUiRuntimeContribution = {
  entry: string;
  capabilities: WorkshopThemeUiCapability[];
};

export type WorkshopThemeSkinContribution = {
  mode: WorkshopThemeSkinMode;
  layout: WorkshopThemeSkinLayout;
  stages: WorkshopThemeSkinStages;
  assets?: WorkshopThemeSkinAssetPaths;
  effects: WorkshopThemeSkinEffects;
  identity: WorkshopThemeIdentityContribution;
  iconAtlas?: WorkshopThemeIconAtlasContribution;
};

export type WorkshopThemePresetContribution = {
  type: 'echo-workshop-theme-preset';
  schemaVersion: typeof workshopDataEntrySchemaVersion;
  id: string;
  title: string;
  description?: string;
  basePreset: AppThemePreset;
  light?: AppThemeToneOverride;
  dark?: AppThemeToneOverride;
  swatches?: string[];
  backgroundAsset?: string;
  skin?: WorkshopThemeSkinContribution;
  runtime?: WorkshopThemeUiRuntimeContribution;
};

export type WorkshopLyricsStyleSettings = {
  lyricsPageStyle?: LyricsPageStyle;
  lyricsFontSizePx?: number;
  lyricsSecondaryFontSizePx?: number;
  lyricsLineSpacingPercent?: number;
  lyricsContextOpacityPercent?: number;
  lyricsColor?: string;
  lyricsSmartReadableColorsEnabled?: boolean;
  lyricsWordHighlightEnabled?: boolean;
  lyricsImmersiveCoverStyleEnabled?: boolean;
  lyricsImmersiveCoverGlassEnabled?: boolean;
  lyricsMusicReactiveVisualsEnabled?: boolean;
  lyricsBackgroundMode?: Exclude<LyricsBackgroundMode, 'customWallpaper'>;
  lyricsCoverOpacityPercent?: number;
  lyricsCoverBlurPx?: number;
  lyricsCoverBrightnessPercent?: number;
  lyricsBackgroundScalePercent?: number;
};

export type WorkshopLyricsStyleContribution = {
  type: 'echo-workshop-lyrics-style';
  schemaVersion: typeof workshopDataEntrySchemaVersion;
  id: string;
  title: string;
  description?: string;
  settings?: WorkshopLyricsStyleSettings;
  scene?: WorkshopLyricsScene;
};

export type WorkshopVisualizerStyle = 'bars' | 'wave' | 'radial';

export type WorkshopVisualizerPresetContribution = {
  type: 'echo-workshop-visualizer-preset';
  schemaVersion: typeof workshopDataEntrySchemaVersion;
  id: string;
  title: string;
  description?: string;
  style: WorkshopVisualizerStyle;
  palette: string[];
  barCount: number;
  smoothing: number;
  sensitivity: number;
  decay: number;
  mirror: boolean;
};

export type WorkshopDspPresetContribution = {
  type: 'echo-workshop-dsp-preset';
  schemaVersion: typeof workshopDataEntrySchemaVersion;
  id: string;
  title: string;
  description?: string;
  preampDb: number;
  bands: EqBand[];
};

export type WorkshopAudioPluginParameterKind = 'continuous' | 'toggle' | 'choice';

export type WorkshopAudioPluginParameterContribution = {
  id: number;
  title: string;
  kind: WorkshopAudioPluginParameterKind;
  defaultValue: number;
  choices?: string[];
};

export type WorkshopAudioPluginPresetContribution = {
  id: string;
  title: string;
  values: Record<string, number>;
};

/**
 * A Workshop audio plug-in profile never contains or loads a native binary.
 * It identifies a plug-in installed by the subscriber and describes a portable
 * parameter mapping for an optional, separately installed Audio Core adapter.
 */
export type WorkshopAudioPluginProfileContribution = {
  type: 'echo-workshop-audio-plugin-profile';
  schemaVersion: typeof workshopDataEntrySchemaVersion;
  id: string;
  title: string;
  description?: string;
  format: 'vst3';
  role: 'effect' | 'instrument';
  plugin: {
    classId: string;
    name: string;
    vendor: string;
  };
  adapter: {
    api: 'echo.audio-plugin-adapter';
    minimumVersion: number;
  };
  routing: {
    placement: 'pre-dsp' | 'post-dsp';
  };
  parameters: WorkshopAudioPluginParameterContribution[];
  presets: WorkshopAudioPluginPresetContribution[];
};

export type WorkshopDataContributionByKind = {
  theme: WorkshopThemePresetContribution;
  'lyrics-style': WorkshopLyricsStyleContribution;
  'visualizer-preset': WorkshopVisualizerPresetContribution;
  'dsp-preset': WorkshopDspPresetContribution;
  'audio-plugin-profile': WorkshopAudioPluginProfileContribution;
};

export type WorkshopDataContribution = WorkshopDataContributionByKind[WorkshopDataContentKind];

export type WorkshopDataCatalogRecord = {
  sourceId: string;
  itemId: string;
  contentId: string;
  contentKind: WorkshopDataContentKind;
  version: string;
  manifestSha256: string;
  entryPath: string;
  contribution: WorkshopDataContribution;
  activatedAt: string;
};

export const workshopDataCatalogFormatVersion = 1 as const;

export type WorkshopDataCatalogSnapshot = {
  formatVersion: typeof workshopDataCatalogFormatVersion;
  revision: number;
  records: WorkshopDataCatalogRecord[];
};

export type WorkshopDataCatalogHealth = {
  writable: boolean;
  error: 'catalog-unreadable' | null;
};

export const isWorkshopDataContentKind = (
  value: WorkshopContentKind,
): value is WorkshopDataContentKind =>
  (workshopDataContentKinds as readonly WorkshopContentKind[]).includes(value);

export const toWorkshopEqSavePresetRequest = (
  contribution: WorkshopDspPresetContribution,
): EqSavePresetRequest => ({
  id: `workshop-${contribution.id}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
    .slice(0, 48),
  name: contribution.title,
  preampDb: contribution.preampDb,
  bands: contribution.bands.map((band) => ({ ...band })),
});
