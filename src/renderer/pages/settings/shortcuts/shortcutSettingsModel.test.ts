import { describe, expect, it } from 'vitest';
import { globalShortcutActions } from '../../../../shared/types/globalShortcuts';
import {
  globalShortcutActionMeta,
  groupShortcutActionMeta,
  shortcutActionCategory,
  shortcutCategories,
} from './shortcutSettingsModel';

describe('shortcut settings groups', () => {
  it('assigns every shortcut action a category and keeps Steam MV out of the settings list', () => {
    expect(globalShortcutActionMeta.some((item) => item.action === 'openMvSettings')).toBe(false);

    for (const action of globalShortcutActions) {
      expect(shortcutActionCategory[action]).toBeTruthy();
    }

    for (const item of globalShortcutActionMeta) {
      expect(shortcutCategories).toContain(shortcutActionCategory[item.action]);
    }
  });

  it('groups visible shortcut actions without dropping or duplicating them', () => {
    const grouped = groupShortcutActionMeta(globalShortcutActionMeta);
    const groupedActions = grouped.flatMap((group) => group.items.map((item) => item.action));

    expect(grouped.map((group) => group.category)).toEqual([...shortcutCategories]);
    expect(groupedActions).toHaveLength(globalShortcutActionMeta.length);
    expect(new Set(groupedActions).size).toBe(globalShortcutActionMeta.length);
    expect(groupedActions).toEqual(
      expect.arrayContaining(globalShortcutActionMeta.map((item) => item.action)),
    );
  });
});
