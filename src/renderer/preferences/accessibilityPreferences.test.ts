// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
  applyAccessibilityPreferences,
  normalizeAccessibilityPreferences,
} from './accessibilityPreferences';

describe('accessibility preferences', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-accessibility-reduce-motion');
    document.documentElement.removeAttribute('data-accessibility-high-contrast');
    document.documentElement.removeAttribute('data-accessibility-always-show-focus');
    document.documentElement.removeAttribute('data-accessibility-screen-reader-announcements');
    document.documentElement.removeAttribute('data-accessibility-scale');
    document.documentElement.removeAttribute('data-accessibility-large-ui');
  });

  it('applies the accessibility state to the document root', () => {
    applyAccessibilityPreferences({
      reduceMotionEnabled: true,
      highContrastEnabled: true,
      uiScalePercent: 130,
      alwaysShowFocusEnabled: true,
      screenReaderAnnouncementsEnabled: true,
    });

    expect(document.documentElement.dataset.accessibilityReduceMotion).toBe('true');
    expect(document.documentElement.dataset.accessibilityHighContrast).toBe('true');
    expect(document.documentElement.dataset.accessibilityAlwaysShowFocus).toBe('true');
    expect(document.documentElement.dataset.accessibilityScreenReaderAnnouncements).toBe('true');
    expect(document.documentElement.dataset.accessibilityScale).toBe('130');
    expect(document.documentElement.dataset.accessibilityLargeUi).toBe('true');
  });

  it('clamps and rounds custom scale values', () => {
    expect(normalizeAccessibilityPreferences({ uiScalePercent: 999 }).uiScalePercent).toBe(150);
    expect(normalizeAccessibilityPreferences({ uiScalePercent: 112 }).uiScalePercent).toBe(110);
  });

  it('keeps auxiliary windows at 100% UI scale', () => {
    applyAccessibilityPreferences({ uiScalePercent: 150 }, { applyUiScale: false });

    expect(document.documentElement.dataset.accessibilityScale).toBe('100');
    expect(document.documentElement.dataset.accessibilityLargeUi).toBe('false');
  });
});
