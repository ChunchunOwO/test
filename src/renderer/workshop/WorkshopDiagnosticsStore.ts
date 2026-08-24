import type { WorkshopDiagnosticEntry, WorkshopPluginSummary } from '../../shared/types/workshop';

const storageKey = 'echo:workshop:diagnostics:v1';
const maximumEntries = 300;
const maximumStoredBytes = 256 * 1024;
export const workshopDiagnosticsChangedEvent = 'echo:workshop:diagnostics-changed';

const readStored = (): WorkshopDiagnosticEntry[] => {
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey) ?? '[]') as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is WorkshopDiagnosticEntry => Boolean(entry)
      && typeof entry === 'object'
      && typeof (entry as WorkshopDiagnosticEntry).id === 'string'
      && typeof (entry as WorkshopDiagnosticEntry).message === 'string').slice(-maximumEntries);
  } catch {
    return [];
  }
};

const persist = (entries: WorkshopDiagnosticEntry[]): WorkshopDiagnosticEntry[] => {
  let bounded = entries.slice(-maximumEntries);
  while (bounded.length > 1 && new TextEncoder().encode(JSON.stringify(bounded)).byteLength > maximumStoredBytes) {
    bounded = bounded.slice(Math.ceil(bounded.length / 8));
  }
  try { window.localStorage.setItem(storageKey, JSON.stringify(bounded)); } catch { /* diagnostics stay best effort */ }
  window.dispatchEvent(new CustomEvent(workshopDiagnosticsChangedEvent, { detail: bounded }));
  return bounded;
};

export const readWorkshopDiagnostics = (): WorkshopDiagnosticEntry[] => readStored();

export const clearWorkshopDiagnostics = (): void => { persist([]); };

export const recordWorkshopDiagnostic = (input: {
  level?: WorkshopDiagnosticEntry['level'];
  plugin?: Pick<WorkshopPluginSummary, 'sourceId' | 'itemId' | 'pluginId'> | null;
  category: WorkshopDiagnosticEntry['category'];
  message: string;
  durationMs?: number | null;
}): WorkshopDiagnosticEntry => {
  const plugin = input.plugin ?? null;
  const entry: WorkshopDiagnosticEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    at: new Date().toISOString(),
    level: input.level ?? 'info',
    sourceId: plugin?.sourceId ?? null,
    itemId: plugin?.itemId ?? null,
    pluginId: plugin?.pluginId ?? null,
    category: input.category,
    message: input.message.trim().slice(0, 500),
    durationMs: typeof input.durationMs === 'number' && Number.isFinite(input.durationMs)
      ? Math.max(0, Math.round(input.durationMs)) : null,
  };
  persist([...readStored(), entry]);
  return entry;
};

