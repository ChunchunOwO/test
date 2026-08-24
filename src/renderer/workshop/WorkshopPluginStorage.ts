import type {
  WorkshopPluginSettingSummary,
  WorkshopPluginSummary,
} from '../../shared/types/workshop';

const maximumStorageBytes = 64 * 1024;
const maximumStorageEntryBytes = 16 * 1024;
const maximumSettingStringLength = 4_000;
const storageKeyPattern = /^(?!__)[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

export type WorkshopPluginSettingsValues = Record<string, string | number | boolean | null>;

const storageNamespace = (plugin: WorkshopPluginSummary): string =>
  `echo.workshop.plugin.v1:${encodeURIComponent(plugin.sourceId)}:${encodeURIComponent(plugin.itemId)}:${encodeURIComponent(plugin.pluginId)}`;

const readEntries = (plugin: WorkshopPluginSummary): Map<string, unknown> => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageNamespace(plugin)) ?? '') as unknown;
    if (!Array.isArray(parsed)) return new Map();
    return new Map(parsed.filter((entry): entry is [string, unknown] =>
      Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string'));
  } catch {
    return new Map();
  }
};

const writeEntries = (plugin: WorkshopPluginSummary, entries: Map<string, unknown>): void => {
  const serialized = JSON.stringify([...entries.entries()]);
  if (new TextEncoder().encode(serialized).byteLength > maximumStorageBytes) {
    throw new Error('storage-quota-exceeded');
  }
  window.localStorage.setItem(storageNamespace(plugin), serialized);
};

const settingStorageKey = (settingId: string): string => `__settings.${settingId}`;

const findSetting = (plugin: WorkshopPluginSummary, settingId: unknown): WorkshopPluginSettingSummary => {
  const setting = typeof settingId === 'string'
    ? plugin.settings.find((entry) => entry.id === settingId)
    : undefined;
  if (!setting) throw new Error('setting-undeclared');
  return setting;
};

const defaultSettingValue = (setting: WorkshopPluginSettingSummary): string | number | boolean | null => {
  if (setting.defaultValue !== null) return setting.defaultValue;
  if (setting.type === 'boolean') return false;
  if (setting.type === 'number') return setting.min ?? 0;
  if (setting.type === 'select') return setting.options[0]?.value ?? null;
  return '';
};

export const normalizeWorkshopPluginSettingValue = (
  setting: WorkshopPluginSettingSummary,
  value: unknown,
): string | number | boolean | null => {
  if (value === null && !setting.required) return null;
  if (setting.type === 'boolean') {
    if (typeof value !== 'boolean') throw new Error('setting-value-invalid');
    return value;
  }
  if (setting.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('setting-value-invalid');
    if (setting.min !== null && value < setting.min) throw new Error('setting-value-invalid');
    if (setting.max !== null && value > setting.max) throw new Error('setting-value-invalid');
    return value;
  }
  if (typeof value !== 'string' || value.length > maximumSettingStringLength) {
    throw new Error('setting-value-invalid');
  }
  if (setting.required && !value.trim()) throw new Error('setting-value-required');
  if (setting.type === 'select' && !setting.options.some((option) => option.value === value)) {
    throw new Error('setting-value-invalid');
  }
  return value;
};

export const readWorkshopPluginSettings = (plugin: WorkshopPluginSummary): WorkshopPluginSettingsValues => {
  const entries = readEntries(plugin);
  return Object.fromEntries(plugin.settings.map((setting) => {
    const stored = entries.get(settingStorageKey(setting.id));
    try {
      return [setting.id, stored === undefined
        ? defaultSettingValue(setting)
        : normalizeWorkshopPluginSettingValue(setting, stored)];
    } catch {
      return [setting.id, defaultSettingValue(setting)];
    }
  }));
};

export const writeWorkshopPluginSetting = (
  plugin: WorkshopPluginSummary,
  settingId: unknown,
  value: unknown,
): WorkshopPluginSettingsValues => {
  const setting = findSetting(plugin, settingId);
  return writeWorkshopPluginSettings(plugin, { [setting.id]: value });
};

export const writeWorkshopPluginSettings = (
  plugin: WorkshopPluginSummary,
  patch: Record<string, unknown>,
): WorkshopPluginSettingsValues => {
  const entries = readEntries(plugin);
  const normalized = Object.entries(patch).map(([settingId, value]) => {
    const setting = findSetting(plugin, settingId);
    return [setting.id, normalizeWorkshopPluginSettingValue(setting, value)] as const;
  });
  for (const [settingId, value] of normalized) {
    entries.set(settingStorageKey(settingId), value);
  }
  writeEntries(plugin, entries);
  return readWorkshopPluginSettings(plugin);
};

export const runWorkshopPluginStorageAction = (
  plugin: WorkshopPluginSummary,
  action: string,
  payload: Record<string, unknown>,
): unknown => {
  const key = typeof payload.key === 'string' && storageKeyPattern.test(payload.key) ? payload.key : null;
  if (!key) throw new Error('invalid-payload');
  const entries = readEntries(plugin);
  if (action === 'storage:get') return entries.get(key) ?? null;
  if (action === 'storage:remove') {
    entries.delete(key);
    writeEntries(plugin, entries);
    return null;
  }
  if (action === 'storage:set') {
    const serialized = JSON.stringify(payload.value);
    if (serialized === undefined || new TextEncoder().encode(serialized).byteLength > maximumStorageEntryBytes) {
      throw new Error('storage-quota-exceeded');
    }
    entries.set(key, JSON.parse(serialized) as unknown);
    writeEntries(plugin, entries);
    return null;
  }
  throw new Error('action-unavailable');
};
