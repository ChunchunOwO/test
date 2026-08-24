export const sidebarRouteIds = [
  'home',
  'songs',
  'albums',
  'artists',
  'genres',
  'folders',
  'audio-cd',
  'remote',
  'connect',
  'community',
  'workshop',
  'dsp',
  'queue',
  'history',
  'playlists',
  'inbox',
  'plugins',
  'liked',
  'settings',
  'mods',
  'audio-settings',
  'lyrics-settings',
  'import-folder',
  'import-file',
] as const;

export type SidebarRouteId = typeof sidebarRouteIds[number];

export const defaultSidebarRouteOrder: SidebarRouteId[] = [...sidebarRouteIds];
export const defaultSidebarHiddenRouteIds: SidebarRouteId[] = [
  'genres',
  'audio-cd',
  'community',
  'inbox',
  'import-folder',
  'audio-settings',
  'lyrics-settings',
  'import-file',
];
export const sidebarHiddenGenresDefaultVersion = 7;
export const lockedVisibleSidebarRouteIds: SidebarRouteId[] = ['settings'];
export const lockedHiddenSidebarRouteIds: SidebarRouteId[] = [];

const sidebarRouteIdSet = new Set<string>(sidebarRouteIds);
const lockedVisibleSidebarRouteIdSet = new Set<string>(lockedVisibleSidebarRouteIds);
const lockedHiddenSidebarRouteIdSet = new Set<string>(lockedHiddenSidebarRouteIds);

export const isSidebarRouteId = (value: unknown): value is SidebarRouteId =>
  typeof value === 'string' && sidebarRouteIdSet.has(value);

export const normalizeSidebarRouteOrder = (value: unknown): SidebarRouteId[] => {
  const order: SidebarRouteId[] = [];
  const seen = new Set<SidebarRouteId>();

  if (Array.isArray(value)) {
    for (const item of value) {
      if (!isSidebarRouteId(item) || seen.has(item)) {
        continue;
      }

      order.push(item);
      seen.add(item);
    }
  }

  for (const routeId of defaultSidebarRouteOrder) {
    if (!seen.has(routeId)) {
      order.push(routeId);
    }
  }

  const modsIndex = order.indexOf('mods');
  const settingsIndex = order.indexOf('settings');
  if (modsIndex !== settingsIndex + 1) {
    order.splice(modsIndex, 1);
    order.splice(order.indexOf('settings') + 1, 0, 'mods');
  }

  return order;
};

export const normalizeSidebarHiddenRouteIds = (value: unknown): SidebarRouteId[] => {
  const hiddenRouteIds: SidebarRouteId[] = [...lockedHiddenSidebarRouteIds];
  const seen = new Set<SidebarRouteId>(lockedHiddenSidebarRouteIds);

  if (!Array.isArray(value)) {
    return hiddenRouteIds;
  }

  for (const item of value) {
    if (!isSidebarRouteId(item) || lockedVisibleSidebarRouteIdSet.has(item) || lockedHiddenSidebarRouteIdSet.has(item) || seen.has(item)) {
      continue;
    }

    hiddenRouteIds.push(item);
    seen.add(item);
  }

  return hiddenRouteIds;
};

export const migrateSidebarHiddenRouteIds = (value: unknown, sourceAppMemoryVersion: number): SidebarRouteId[] => {
  const hiddenRouteIds = normalizeSidebarHiddenRouteIds(value);
  if (sourceAppMemoryVersion >= sidebarHiddenGenresDefaultVersion) {
    return hiddenRouteIds;
  }

  return normalizeSidebarHiddenRouteIds([...hiddenRouteIds, 'genres']);
};
