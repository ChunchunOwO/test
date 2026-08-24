import { describe, expect, it } from 'vitest';
import type { AppSettings } from '../../shared/types/appSettings';
import { createSettingsChangePatch } from './settingsChangePatch';

describe('createSettingsChangePatch', () => {
  it('keeps unrelated full settings snapshots out of a volume-only update', () => {
    const previous = {
      appearanceTheme: 'dark',
      playerVolume: 0.5,
      accessibilityPreferences: { uiScalePercent: 100 },
    } as Partial<AppSettings>;
    const next = {
      appearanceTheme: 'dark',
      playerVolume: 0.6,
      accessibilityPreferences: { uiScalePercent: 100 },
    } as Partial<AppSettings>;

    expect(createSettingsChangePatch(previous, next)).toEqual({ playerVolume: 0.6 });
  });

  it('includes changed object settings and removed values', () => {
    const previous = {
      appearanceTheme: 'dark',
      appearanceThemePresetOverrides: { classic: { dark: { accent: '#111111' } } },
    } as Partial<AppSettings>;
    const next = {
      appearanceTheme: 'light',
    } as Partial<AppSettings>;

    expect(createSettingsChangePatch(previous, next)).toEqual({
      appearanceTheme: 'light',
      appearanceThemePresetOverrides: undefined,
    });
  });
});
