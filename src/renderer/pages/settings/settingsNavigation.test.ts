import { describe, expect, it } from 'vitest';
import {
  normalizeSettingsNavKey,
  resolveSettingsEscapeAction,
  settingsNavGroups,
  settingsNavItems,
} from './settingsNavigation';

describe('settings navigation structure', () => {
  it('exposes one collapsed advanced settings destination instead of a separate lab', () => {
    expect(settingsNavItems.some((item) => item.key === 'experimental')).toBe(false);
    expect(settingsNavItems.some((item) => item.key === 'advancedCustom')).toBe(true);
    expect(settingsNavGroups.find((group) => group.id === 'advanced')?.itemKeys).toEqual([
      'shortcuts',
      'advancedCustom',
      'about',
      'danger',
    ]);
  });

  it('redirects legacy experimental links to advanced settings', () => {
    expect(normalizeSettingsNavKey('experimental')).toBe('advancedCustom');
    expect(normalizeSettingsNavKey('advancedCustom')).toBe('advancedCustom');
    expect(normalizeSettingsNavKey('missing')).toBeNull();
  });

  it('promotes Steam Rich Presence to its own navigation destination', () => {
    expect(settingsNavItems.some((item) => item.key === 'steamPresence')).toBe(true);
    expect(settingsNavGroups.find((group) => group.id === 'extensions')?.itemKeys).toEqual([
      'integrations',
      'steamPresence',
      'accounts',
      'remote',
    ]);
  });
});

describe('resolveSettingsEscapeAction', () => {
  const base = {
    defaultPrevented: false,
    isContributorsPage: false,
    isEditableTarget: false,
    isSearchInput: false,
    searchQuery: '',
  };

  it('clears search before leaving settings', () => {
    expect(resolveSettingsEscapeAction({ ...base, searchQuery: 'eq' })).toBe('clear-search');
    expect(resolveSettingsEscapeAction({ ...base, searchQuery: '  eq  ', isContributorsPage: true })).toBe('clear-search');
  });

  it('returns from the contributors page next', () => {
    expect(resolveSettingsEscapeAction({ ...base, isContributorsPage: true })).toBe('leave-contributors');
  });

  it('leaves settings from the search field when the query is empty', () => {
    expect(resolveSettingsEscapeAction({ ...base, isEditableTarget: true, isSearchInput: true })).toBe('leave-settings');
  });

  it('ignores Escape in other editable fields', () => {
    expect(resolveSettingsEscapeAction({ ...base, isEditableTarget: true })).toBe('none');
  });

  it('leaves settings from the page chrome', () => {
    expect(resolveSettingsEscapeAction(base)).toBe('leave-settings');
  });

  it('does not override an already handled Escape', () => {
    expect(resolveSettingsEscapeAction({ ...base, defaultPrevented: true, searchQuery: 'eq' })).toBe('none');
  });
});
