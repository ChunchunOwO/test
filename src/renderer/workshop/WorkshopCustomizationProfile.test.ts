// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { WorkshopPluginSummary } from '../../shared/types/workshop';
import { writeWorkshopAutomationRules } from './WorkshopAutomationStore';
import { createWorkshopCustomizationProfile, applyWorkshopCustomizationProfile } from './WorkshopCustomizationProfile';
import { readWorkshopContributionPreferences, writeWorkshopContributionPreferences } from './WorkshopContributionPreferences';
import { readWorkshopPluginSettings, writeWorkshopPluginSettings } from './WorkshopPluginStorage';

const plugin: WorkshopPluginSummary = {
  sourceId: 'steam', itemId: '123', contentId: 'echo.tools', version: '2.0.0', pluginId: 'echo.tools', name: 'Tools',
  permissions: ['fs:plugin'], commands: [{ id: 'run', title: 'Run', description: null }], panels: [], agents: [], settings: [{
    id: 'mode', title: 'Mode', description: null, type: 'select', defaultValue: 'a', options: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }],
    placeholder: null, min: null, max: null, required: true,
  }], networkHosts: [], runtimeEntryUrl: '', enabled: true, error: null,
};

describe('WorkshopCustomizationProfile', () => {
  beforeEach(() => window.localStorage.clear());

  it('round-trips plugin settings, contribution layout, and automations', () => {
    writeWorkshopPluginSettings(plugin, { mode: 'b' });
    writeWorkshopContributionPreferences(plugin, { hidden: ['command:run'], pinned: [], order: ['command:run'] });
    writeWorkshopAutomationRules([{
      id: 'rule', title: 'Rule', enabled: true, trigger: 'track-started', intervalMinutes: null,
      sourceId: 'steam', itemId: '123', pluginId: 'echo.tools', targetKind: 'command', targetId: 'run', agentPrompt: null, cooldownSeconds: 2,
    }]);
    const profile = createWorkshopCustomizationProfile('Setup', [plugin]);
    window.localStorage.clear();
    const result = applyWorkshopCustomizationProfile(profile, [plugin]);
    expect(result).toEqual({ appliedPlugins: 1, missingPlugins: [], automations: 1 });
    expect(readWorkshopPluginSettings(plugin).mode).toBe('b');
    expect(readWorkshopContributionPreferences(plugin).hidden).toEqual(['command:run']);
  });
});
