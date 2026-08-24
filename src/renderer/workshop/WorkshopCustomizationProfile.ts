import type {
  WorkshopCustomizationProfile,
  WorkshopPluginSummary,
} from '../../shared/types/workshop';
import { normalizeWorkshopAutomationRules, readWorkshopAutomationRules, writeWorkshopAutomationRules } from './WorkshopAutomationStore';
import {
  readWorkshopContributionPreferences,
  writeWorkshopContributionPreferences,
  type WorkshopContributionKey,
} from './WorkshopContributionPreferences';
import { readWorkshopPluginSettings, writeWorkshopPluginSettings } from './WorkshopPluginStorage';

export const createWorkshopCustomizationProfile = (
  name: string,
  plugins: readonly WorkshopPluginSummary[],
): WorkshopCustomizationProfile => ({
  type: 'echo-workshop-customization',
  schemaVersion: 1,
  exportedAt: new Date().toISOString(),
  name: name.trim().slice(0, 120) || 'My ECHO Workshop setup',
  plugins: plugins.map((plugin) => ({
    sourceId: plugin.sourceId,
    itemId: plugin.itemId,
    pluginId: plugin.pluginId,
    version: plugin.version,
    settings: readWorkshopPluginSettings(plugin),
    contributions: readWorkshopContributionPreferences(plugin),
  })),
  automations: readWorkshopAutomationRules(),
});

export const applyWorkshopCustomizationProfile = (
  profile: WorkshopCustomizationProfile,
  plugins: readonly WorkshopPluginSummary[],
): { appliedPlugins: number; missingPlugins: string[]; automations: number } => {
  if (profile.type !== 'echo-workshop-customization' || profile.schemaVersion !== 1) {
    throw new Error('workshop-customization-version-unsupported');
  }
  let appliedPlugins = 0;
  const missingPlugins: string[] = [];
  for (const saved of profile.plugins.slice(0, 256)) {
    const plugin = plugins.find((entry) => entry.sourceId === saved.sourceId
      && entry.itemId === saved.itemId && entry.pluginId === saved.pluginId);
    if (!plugin) {
      missingPlugins.push(saved.pluginId);
      continue;
    }
    const knownSettings = Object.fromEntries(Object.entries(saved.settings)
      .filter(([settingId]) => plugin.settings.some((setting) => setting.id === settingId)));
    if (Object.keys(knownSettings).length > 0) writeWorkshopPluginSettings(plugin, knownSettings);
    writeWorkshopContributionPreferences(plugin, {
      hidden: saved.contributions.hidden as WorkshopContributionKey[],
      pinned: saved.contributions.pinned as WorkshopContributionKey[],
      order: saved.contributions.order as WorkshopContributionKey[],
    });
    appliedPlugins += 1;
  }
  const automations = writeWorkshopAutomationRules(normalizeWorkshopAutomationRules(profile.automations)).length;
  return { appliedPlugins, missingPlugins, automations };
};
