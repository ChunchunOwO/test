import type { WorkshopManagerThemeSummary } from '../../shared/types/workshop';
import type { WorkshopDataCatalogRecord, WorkshopThemePresetContribution } from './WorkshopDataContributionTypes';
import { buildWorkshopThemeCustomId } from './workshopThemeCustomId';

const collectThemeSwatches = (theme: WorkshopThemePresetContribution): string[] => {
  const candidates = theme.swatches ?? [
    theme.dark?.accent,
    theme.dark?.appBg,
    theme.dark?.panel,
    theme.light?.accent,
    theme.light?.appBg,
    theme.light?.panel,
  ];
  return [...new Set(candidates.filter((value): value is string => typeof value === 'string'))].slice(0, 6);
};

export const buildWorkshopManagerThemeSummary = (
  record: WorkshopDataCatalogRecord | undefined,
  activeThemeId: string | null,
): WorkshopManagerThemeSummary | null => {
  if (!record || record.contentKind !== 'theme') {
    return null;
  }
  const theme = record.contribution as WorkshopThemePresetContribution;
  const themeId = buildWorkshopThemeCustomId(record.sourceId, record.itemId, record.contentId);
  return {
    themeId,
    title: theme.title,
    description: theme.description ?? null,
    basePreset: theme.basePreset,
    swatches: collectThemeSwatches(theme),
    colorModes: [
      ...(theme.light ? ['light' as const] : []),
      ...(theme.dark ? ['dark' as const] : []),
    ],
    skin: theme.skin ? {
      mode: theme.skin.mode,
      layout: { ...theme.skin.layout },
      stages: { ...theme.skin.stages },
      assetCount: Object.keys(theme.skin.assets ?? {}).length,
    } : null,
    uiRuntime: theme.runtime ? {
      capabilities: [...theme.runtime.capabilities],
    } : null,
    active: activeThemeId === themeId,
  };
};
