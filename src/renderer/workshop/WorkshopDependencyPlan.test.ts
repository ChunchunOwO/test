import { describe, expect, it } from 'vitest';
import type { WorkshopPluginSummary } from '../../shared/types/workshop';
import { buildWorkshopDependencyPlan } from './WorkshopDependencyPlan';

const plugin = (itemId: string, dependencies: WorkshopPluginSummary['dependencies'] = []): WorkshopPluginSummary => ({
  sourceId: 'steam', itemId, contentId: `content-${itemId}`, version: '1.0.0', pluginId: `plugin-${itemId}`,
  name: `Plugin ${itemId}`, permissions: [], commands: [], panels: [], agents: [], settings: [],
  networkHosts: [], dependencies, conflicts: [], runtimeEntryUrl: 'echo-workshop://plugin/index.html',
  enabled: true, error: null,
});

describe('buildWorkshopDependencyPlan', () => {
  it('orders dependencies first and returns a unique one-click subscription plan', () => {
    const child = plugin('200');
    const root = plugin('100', [
      { itemId: '200', versionRange: '^1.0.0', optional: false, installedVersion: '1.0.0', state: 'ready' },
      { itemId: '300', versionRange: '^2.0.0', optional: false, installedVersion: null, state: 'missing' },
      { itemId: '400', versionRange: null, optional: true, installedVersion: null, state: 'missing' },
    ]);

    const plan = buildWorkshopDependencyPlan([root, child]);

    expect(plan.compositionOrder.map((entry) => entry.itemId)).toEqual(['200', '100']);
    expect(plan.missingRequiredItemIds).toEqual(['300']);
    expect(plan.bundleItemIds).toEqual(['200', '300', '400', '100']);
  });
});
