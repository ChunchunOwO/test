import {
  createDefaultGlobalShortcuts,
  createDefaultLocalShortcuts,
  globalShortcutActions,
  normalizeGlobalShortcutAccelerator,
  type GlobalShortcutAction,
  type GlobalShortcutSettings,
  type LocalShortcutSettings,
} from '../../shared/types/globalShortcuts';

const acceleratorKey = (accelerator: string): string => {
  const normalized = normalizeGlobalShortcutAccelerator(accelerator) ?? accelerator;
  return normalized
    .replace(/^CommandOrControl\+/u, process.platform === 'darwin' ? 'Command+' : 'Ctrl+')
    .toLowerCase();
};

export const resolveUltraLightShortcutAction = (
  accelerator: string,
  localShortcuts: LocalShortcutSettings | undefined,
  globalShortcuts: GlobalShortcutSettings | undefined,
): GlobalShortcutAction | null => {
  const localDefaults = createDefaultLocalShortcuts();
  const globalDefaults = createDefaultGlobalShortcuts();
  const pressedKey = acceleratorKey(accelerator);
  const globalKeys = new Set<string>();

  for (const action of globalShortcutActions) {
    const binding = globalShortcuts?.[action] ?? globalDefaults[action];
    if (binding.enabled && binding.accelerator) {
      globalKeys.add(acceleratorKey(binding.accelerator));
    }
  }

  if (globalKeys.has(pressedKey)) {
    return null;
  }

  for (const action of globalShortcutActions) {
    const binding = localShortcuts?.[action] ?? localDefaults[action];
    if (binding.enabled && binding.accelerator && acceleratorKey(binding.accelerator) === pressedKey) {
      return action;
    }
  }
  return null;
};
