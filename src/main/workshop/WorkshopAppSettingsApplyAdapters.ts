import type { AppSettings, AppThemeCustomTheme } from '../../shared/types/appSettings';
import type {
  WorkshopDataContribution,
  WorkshopLyricsStyleContribution,
  WorkshopThemePresetContribution,
} from './WorkshopDataContributionTypes';
import {
  WorkshopContributionApplyError,
  type WorkshopContributionApplyAdapter,
  type WorkshopContributionApplyContext,
} from './WorkshopContributionApplyAdapter';
import type { WorkshopLyricsSceneService } from './WorkshopLyricsSceneService';
import type { WorkshopThemeBackgroundService } from './WorkshopThemeBackgroundService';
import { buildWorkshopThemeCustomId } from './workshopThemeCustomId';

export type WorkshopAppSettingsPort = {
  getSettings: () => AppSettings;
  applySettings: (patch: Partial<AppSettings>) => Promise<AppSettings>;
};

const maxCustomThemes = 24;

const requireThemeContribution = (
  contribution: WorkshopDataContribution,
): WorkshopThemePresetContribution => {
  if (contribution.type !== 'echo-workshop-theme-preset') {
    throw new WorkshopContributionApplyError('apply-failed');
  }
  return contribution;
};

const requireLyricsStyleContribution = (
  contribution: WorkshopDataContribution,
): WorkshopLyricsStyleContribution => {
  if (contribution.type !== 'echo-workshop-lyrics-style') {
    throw new WorkshopContributionApplyError('apply-failed');
  }
  return contribution;
};

const workshopThemeId = (context: WorkshopContributionApplyContext): string =>
  buildWorkshopThemeCustomId(context.sourceId, context.itemId, context.contentId);

export const createWorkshopThemeApplyAdapter = (
  settings: WorkshopAppSettingsPort,
  themeBackground: Pick<WorkshopThemeBackgroundService, 'getSelection' | 'select' | 'restore'>,
  now: () => Date = () => new Date(),
): WorkshopContributionApplyAdapter => ({
  contentKind: 'theme',
  apply: async (rawContribution, context) => {
    const contribution = requireThemeContribution(rawContribution);
    const current = settings.getSettings();
    const themes = [...(current.appearanceCustomThemes ?? [])];
    const id = workshopThemeId(context);
    const existingIndex = themes.findIndex((theme) => theme.id === id);
    if (existingIndex < 0 && themes.length >= maxCustomThemes) {
      throw new WorkshopContributionApplyError('theme-limit-reached');
    }

    const timestamp = now().toISOString();
    const theme: AppThemeCustomTheme = {
      id,
      name: contribution.title,
      basePreset: contribution.basePreset,
      createdAt: existingIndex >= 0 ? themes[existingIndex].createdAt : timestamp,
      updatedAt: timestamp,
      ...(contribution.light ? { light: { ...contribution.light } } : {}),
      ...(contribution.dark ? { dark: { ...contribution.dark } } : {}),
    };
    if (existingIndex >= 0) {
      themes[existingIndex] = theme;
    } else {
      themes.push(theme);
    }

    const previousBackground = themeBackground.getSelection();
    const applied = await settings.applySettings({
      appearanceThemePreset: contribution.basePreset,
      appearanceCustomThemes: themes,
      appearanceThemeCustomId: id,
    });
    if (
      applied.appearanceThemeCustomId !== id ||
      !applied.appearanceCustomThemes?.some((item) => item.id === id)
    ) {
      throw new WorkshopContributionApplyError('settings-apply-rejected');
    }
    try {
      themeBackground.select(contribution, context);
    } catch {
      try {
        themeBackground.restore(previousBackground);
      } catch {
        // Best-effort rollback; the original persistence failure remains authoritative.
      }
      throw new WorkshopContributionApplyError('apply-failed');
    }
  },
});

export const createWorkshopLyricsStyleApplyAdapter = (
  settings: WorkshopAppSettingsPort,
  lyricsScenes: Pick<WorkshopLyricsSceneService, 'getSelection' | 'select' | 'restore'>,
): WorkshopContributionApplyAdapter => ({
  contentKind: 'lyrics-style',
  apply: async (rawContribution, context) => {
    const contribution = requireLyricsStyleContribution(rawContribution);
    const current = settings.getSettings();
    const settingsPatch = { ...(contribution.settings ?? {}) };
    const previousPatch = Object.fromEntries(
      Object.keys(settingsPatch).map((key) => [key, current[key as keyof AppSettings]]),
    ) as Partial<AppSettings>;
    const previousSelection = lyricsScenes.getSelection();
    let settingsApplied = false;
    try {
      if (Object.keys(settingsPatch).length > 0) {
        await settings.applySettings(settingsPatch);
        settingsApplied = true;
      }
      lyricsScenes.select(contribution, context);
    } catch (error) {
      try {
        if (Object.keys(previousPatch).length > 0) {
          await settings.applySettings(previousPatch);
        }
        lyricsScenes.restore(previousSelection);
      } catch {
        // Best-effort rollback; the original persistence failure remains authoritative.
      }
      if (error instanceof WorkshopContributionApplyError) {
        throw error;
      }
      throw new WorkshopContributionApplyError(
        settingsApplied ? 'lyrics-scene-state-unavailable' : 'settings-apply-rejected',
      );
    }
  },
});
