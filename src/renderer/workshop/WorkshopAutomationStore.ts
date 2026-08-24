import {
  workshopAutomationTriggers,
  type WorkshopAutomationRule,
  type WorkshopAutomationTrigger,
} from '../../shared/types/workshop';

const storageKey = 'echo:workshop:automations:v1';
const maximumRules = 128;
export const workshopAutomationsChangedEvent = 'echo:workshop:automations-changed';

const normalizeText = (value: unknown, maximum: number): string =>
  typeof value === 'string' ? value.trim().slice(0, maximum) : '';

const normalizeRule = (value: unknown): WorkshopAutomationRule | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const rule = value as Partial<WorkshopAutomationRule>;
  const trigger = workshopAutomationTriggers.includes(rule.trigger as WorkshopAutomationTrigger)
    ? rule.trigger as WorkshopAutomationTrigger
    : null;
  const targetKind = rule.targetKind === 'command' || rule.targetKind === 'agent' ? rule.targetKind : null;
  const id = normalizeText(rule.id, 80);
  const title = normalizeText(rule.title, 120);
  const sourceId = normalizeText(rule.sourceId, 64);
  const itemId = normalizeText(rule.itemId, 128);
  const pluginId = normalizeText(rule.pluginId, 80);
  const targetId = normalizeText(rule.targetId, 80);
  if (!id || !title || !trigger || !sourceId || !itemId || !pluginId || !targetKind || !targetId) return null;
  const intervalMinutes = trigger === 'timer'
    ? Math.max(1, Math.min(1440, Number.isFinite(rule.intervalMinutes) ? Math.round(rule.intervalMinutes!) : 15))
    : null;
  const cooldownSeconds = Math.max(0, Math.min(86400,
    Number.isFinite(rule.cooldownSeconds) ? Math.round(rule.cooldownSeconds!) : 2));
  return {
    id,
    title,
    enabled: rule.enabled !== false,
    trigger,
    intervalMinutes,
    sourceId,
    itemId,
    pluginId,
    targetKind,
    targetId,
    agentPrompt: targetKind === 'agent' ? normalizeText(rule.agentPrompt, 4_000) || null : null,
    cooldownSeconds,
  };
};

export const normalizeWorkshopAutomationRules = (value: unknown): WorkshopAutomationRule[] => {
  if (!Array.isArray(value)) return [];
  const result: WorkshopAutomationRule[] = [];
  const ids = new Set<string>();
  for (const entry of value.slice(0, maximumRules)) {
    const rule = normalizeRule(entry);
    if (!rule || ids.has(rule.id)) continue;
    ids.add(rule.id);
    result.push(rule);
  }
  return result;
};

export const readWorkshopAutomationRules = (): WorkshopAutomationRule[] => {
  try {
    return normalizeWorkshopAutomationRules(JSON.parse(window.localStorage.getItem(storageKey) ?? '[]'));
  } catch {
    return [];
  }
};

export const writeWorkshopAutomationRules = (rules: readonly WorkshopAutomationRule[]): WorkshopAutomationRule[] => {
  const normalized = normalizeWorkshopAutomationRules(rules);
  window.localStorage.setItem(storageKey, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent(workshopAutomationsChangedEvent, { detail: normalized }));
  return normalized;
};

