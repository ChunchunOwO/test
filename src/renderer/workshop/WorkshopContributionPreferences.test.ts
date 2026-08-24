// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkshopPluginSummary } from '../../shared/types/workshop';
import {
  collectWorkshopContributionDescriptors,
  isWorkshopContributionVisible,
  readWorkshopContributionPreferences,
  sortWorkshopContributions,
  workshopContributionKey,
  workshopContributionPreferencesChangedEvent,
  writeWorkshopContributionPreferences,
} from './WorkshopContributionPreferences';

const plugin: WorkshopPluginSummary = {
  sourceId: 'steam',
  itemId: '42',
  contentId: 'community.tools',
  version: '1.0.0',
  pluginId: 'community.tools',
  name: 'Community Tools',
  permissions: [],
  commands: [{ id: 'status', title: 'Status', description: null }],
  panels: [{ id: 'home-card', title: 'Home card', placement: 'home', entryUrl: 'echo-workshop://plugin/home' }],
  agents: [],
  settings: [],
  networkHosts: [],
  runtimeEntryUrl: 'echo-workshop://plugin/runtime',
  enabled: true,
  error: null,
};

describe('WorkshopContributionPreferences', () => {
  beforeEach(() => window.localStorage.clear());

  it('persists independent visibility and broadcasts the change', () => {
    const changed = vi.fn();
    window.addEventListener(workshopContributionPreferencesChangedEvent, changed);
    writeWorkshopContributionPreferences(plugin, {
      hidden: [workshopContributionKey('command', 'status')],
      pinned: [],
      order: [],
    });

    expect(isWorkshopContributionVisible(plugin, 'command', 'status')).toBe(false);
    expect(isWorkshopContributionVisible(plugin, 'panel', 'home-card')).toBe(true);
    expect(changed).toHaveBeenCalledOnce();
  });

  it('sorts pinned contributions before the user-defined order', () => {
    const descriptors = collectWorkshopContributionDescriptors(plugin);
    const commandKey = workshopContributionKey('command', 'status');
    const panelKey = workshopContributionKey('panel', 'home-card');
    const preferences = writeWorkshopContributionPreferences(plugin, {
      hidden: [],
      pinned: [panelKey],
      order: [commandKey, panelKey],
    });

    expect(sortWorkshopContributions(descriptors, preferences).map((item) => item.key)).toEqual([panelKey, commandKey]);
    expect(readWorkshopContributionPreferences(plugin)).toEqual(preferences);
  });
});
