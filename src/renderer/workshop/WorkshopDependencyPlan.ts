import type { WorkshopDependencySummary, WorkshopPluginSummary } from '../../shared/types/workshop';

export type WorkshopDependencyRow = {
  plugin: WorkshopPluginSummary;
  dependency: WorkshopDependencySummary;
  conflict: boolean;
};

export type WorkshopDependencyPlan = {
  rows: WorkshopDependencyRow[];
  compositionOrder: WorkshopPluginSummary[];
  missingRequiredItemIds: string[];
  bundleItemIds: string[];
};

const pluginKey = (plugin: WorkshopPluginSummary): string =>
  `${plugin.sourceId}:${plugin.itemId}:${plugin.pluginId}`;

export const buildWorkshopDependencyPlan = (
  plugins: WorkshopPluginSummary[],
): WorkshopDependencyPlan => {
  const rows = plugins.flatMap((plugin) => [
    ...(plugin.dependencies ?? []).map((dependency) => ({ plugin, dependency, conflict: false })),
    ...(plugin.conflicts ?? []).map((itemId) => ({
      plugin,
      dependency: {
        itemId,
        versionRange: null,
        optional: false,
        installedVersion: null,
        state: 'missing' as const,
      },
      conflict: true,
    })),
  ]);
  const byItemId = new Map(plugins.map((plugin) => [plugin.itemId, plugin]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const compositionOrder: WorkshopPluginSummary[] = [];
  const visit = (plugin: WorkshopPluginSummary): void => {
    const key = pluginKey(plugin);
    if (visited.has(key) || visiting.has(key)) return;
    visiting.add(key);
    (plugin.dependencies ?? []).forEach((dependency) => {
      const nested = byItemId.get(dependency.itemId);
      if (nested) visit(nested);
    });
    visiting.delete(key);
    visited.add(key);
    compositionOrder.push(plugin);
  };
  plugins.forEach(visit);
  const missingRequiredItemIds = Array.from(new Set(rows
    .filter(({ dependency, conflict }) => !conflict && !dependency.optional && dependency.state !== 'ready')
    .map(({ dependency }) => dependency.itemId)));
  const bundleItemIds = Array.from(new Set([
    ...compositionOrder.flatMap((plugin) => (plugin.dependencies ?? []).map((dependency) => dependency.itemId)),
    ...compositionOrder.map((plugin) => plugin.itemId),
  ]));
  return { rows, compositionOrder, missingRequiredItemIds, bundleItemIds };
};
