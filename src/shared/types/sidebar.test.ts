import { describe, expect, it } from 'vitest';
import {
  defaultSidebarHiddenRouteIds,
  defaultSidebarRouteOrder,
  migrateSidebarHiddenRouteIds,
  normalizeSidebarRouteOrder,
  sidebarHiddenGenresDefaultVersion,
} from './sidebar';

describe('sidebar hidden defaults', () => {
  it('hides genres by default', () => {
    expect(defaultSidebarHiddenRouteIds).toContain('genres');
  });

  it('hides the community center by default while keeping it beside the Workshop', () => {
    expect(defaultSidebarHiddenRouteIds).toContain('community');
    expect(defaultSidebarRouteOrder.indexOf('community')).toBe(defaultSidebarRouteOrder.indexOf('workshop') - 1);
  });

  it('keeps Mods immediately below Settings for older saved orders', () => {
    const order = normalizeSidebarRouteOrder(['home', 'settings', 'audio-settings', 'import-file']);
    expect(order.indexOf('mods')).toBe(order.indexOf('settings') + 1);
  });

  it('hides genres for settings saved before the default changed', () => {
    expect(migrateSidebarHiddenRouteIds(['audio-cd', 'inbox'], sidebarHiddenGenresDefaultVersion - 1)).toEqual([
      'audio-cd',
      'inbox',
      'genres',
    ]);
  });

  it('keeps genres visible after the user unhides them', () => {
    expect(migrateSidebarHiddenRouteIds(['audio-cd'], sidebarHiddenGenresDefaultVersion)).toEqual(['audio-cd']);
  });
});
