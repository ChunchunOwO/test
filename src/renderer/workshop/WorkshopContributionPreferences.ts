import type { WorkshopPluginSummary } from '../../shared/types/workshop';

export const workshopContributionKinds = [
  'command',
  'panel',
  'agent',
  'source-provider',
  'lyrics-provider',
  'metadata-provider',
  'cover-provider',
  'theme-preset',
  'track-action',
  'player-action',
  'settings',
] as const;

export type WorkshopContributionKind = (typeof workshopContributionKinds)[number];
export type WorkshopContributionKey = `${WorkshopContributionKind}:${string}`;

export type WorkshopContributionDescriptor = {
  key: WorkshopContributionKey;
  kind: WorkshopContributionKind;
  id: string;
  title: string;
  description: string | null;
  placement: string | null;
};

export type WorkshopContributionPreferences = {
  hidden: WorkshopContributionKey[];
  pinned: WorkshopContributionKey[];
  order: WorkshopContributionKey[];
};

const storageVersion = 1;
const storagePrefix = 'echo:workshop:contributions:v1:';
export const workshopContributionPreferencesChangedEvent = 'echo:workshop:contributions-changed';

export const workshopPluginPreferenceId = (plugin: Pick<WorkshopPluginSummary, 'sourceId' | 'itemId' | 'pluginId'>): string =>
  `${plugin.sourceId}:${plugin.itemId}:${plugin.pluginId}`;

export const workshopContributionKey = (kind: WorkshopContributionKind, id: string): WorkshopContributionKey =>
  `${kind}:${id}`;

const emptyPreferences = (): WorkshopContributionPreferences => ({ hidden: [], pinned: [], order: [] });

const normalizeKeys = (value: unknown): WorkshopContributionKey[] => {
  if (!Array.isArray(value)) return [];
  const keys = value.filter((entry): entry is WorkshopContributionKey =>
    typeof entry === 'string'
    && workshopContributionKinds.some((kind) => entry.startsWith(`${kind}:`)))
    .slice(0, 256);
  return [...new Set(keys)];
};

export const readWorkshopContributionPreferences = (
  plugin: Pick<WorkshopPluginSummary, 'sourceId' | 'itemId' | 'pluginId'>,
): WorkshopContributionPreferences => {
  try {
    const raw = window.localStorage.getItem(`${storagePrefix}${workshopPluginPreferenceId(plugin)}`);
    if (!raw) return emptyPreferences();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.version !== storageVersion) return emptyPreferences();
    return {
      hidden: normalizeKeys(parsed.hidden),
      pinned: normalizeKeys(parsed.pinned),
      order: normalizeKeys(parsed.order),
    };
  } catch {
    return emptyPreferences();
  }
};

export const writeWorkshopContributionPreferences = (
  plugin: Pick<WorkshopPluginSummary, 'sourceId' | 'itemId' | 'pluginId'>,
  preferences: WorkshopContributionPreferences,
): WorkshopContributionPreferences => {
  const normalized = {
    hidden: normalizeKeys(preferences.hidden),
    pinned: normalizeKeys(preferences.pinned),
    order: normalizeKeys(preferences.order),
  };
  try {
    window.localStorage.setItem(`${storagePrefix}${workshopPluginPreferenceId(plugin)}`, JSON.stringify({
      version: storageVersion,
      ...normalized,
    }));
    window.dispatchEvent(new CustomEvent(workshopContributionPreferencesChangedEvent, {
      detail: { pluginId: workshopPluginPreferenceId(plugin), preferences: normalized },
    }));
  } catch {
    // Keep the current session usable when persistence is unavailable.
  }
  return normalized;
};

export const isWorkshopContributionVisible = (
  plugin: Pick<WorkshopPluginSummary, 'sourceId' | 'itemId' | 'pluginId'>,
  kind: WorkshopContributionKind,
  id: string,
): boolean => !readWorkshopContributionPreferences(plugin).hidden.includes(workshopContributionKey(kind, id));

const contribution = (
  kind: WorkshopContributionKind,
  id: string,
  title: string,
  description: string | null = null,
  placement: string | null = null,
): WorkshopContributionDescriptor => ({
  key: workshopContributionKey(kind, id),
  kind,
  id,
  title,
  description,
  placement,
});

export const collectWorkshopContributionDescriptors = (plugin: WorkshopPluginSummary): WorkshopContributionDescriptor[] => [
  ...plugin.commands.map((item) => contribution('command', item.id, item.title, item.description)),
  ...plugin.panels.map((item) => contribution('panel', item.id, item.title, null, item.placement)),
  ...plugin.agents.map((item) => contribution('agent', item.id, item.title, item.description)),
  ...(plugin.sourceProviders ?? []).map((item) => contribution('source-provider', item.id, item.title, item.description)),
  ...(plugin.lyricsProviders ?? []).map((item) => contribution('lyrics-provider', item.id, item.title, item.description)),
  ...(plugin.metadataProviders ?? []).map((item) => contribution('metadata-provider', item.id, item.title, item.description)),
  ...(plugin.coverProviders ?? []).map((item) => contribution('cover-provider', item.id, item.title, item.description)),
  ...(plugin.themePresets ?? []).map((item) => contribution('theme-preset', item.id, item.title, item.description)),
  ...(plugin.trackContextMenus ?? []).map((item) => contribution('track-action', item.id, item.title, item.description)),
  ...(plugin.playerBarActions ?? []).map((item) => contribution('player-action', item.id, item.title, item.description)),
  ...(plugin.settings.length > 0 ? [contribution('settings', 'host-form', '插件设置', `${plugin.settings.length} 项宿主设置`)] : []),
];

export const sortWorkshopContributions = <T extends { key: WorkshopContributionKey }>(
  items: readonly T[],
  preferences: WorkshopContributionPreferences,
): T[] => {
  const order = new Map(preferences.order.map((key, index) => [key, index]));
  const pinned = new Set(preferences.pinned);
  return [...items].sort((left, right) => {
    const pinnedDelta = Number(pinned.has(right.key)) - Number(pinned.has(left.key));
    if (pinnedDelta !== 0) return pinnedDelta;
    return (order.get(left.key) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.key) ?? Number.MAX_SAFE_INTEGER);
  });
};

