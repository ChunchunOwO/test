import {
  uiScalePercentMax,
  uiScalePercentMin,
  uiScalePercentStep,
} from '../../shared/types/appSettings';
import type { AccessibilityPreferences } from '../../shared/types/appSettings';

export const defaultAccessibilityPreferences: AccessibilityPreferences = {
  reduceMotionEnabled: false,
  highContrastEnabled: false,
  uiScalePercent: 100,
  alwaysShowFocusEnabled: false,
  screenReaderAnnouncementsEnabled: false,
};

const normalizeUiScalePercent = (value: unknown): number => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return defaultAccessibilityPreferences.uiScalePercent;
  }
  const clampedValue = Math.max(uiScalePercentMin, Math.min(uiScalePercentMax, numericValue));
  return Math.round(clampedValue / uiScalePercentStep) * uiScalePercentStep;
};

export const normalizeAccessibilityPreferences = (
  value: Partial<AccessibilityPreferences> | null | undefined,
): AccessibilityPreferences => {
  return {
    reduceMotionEnabled: value?.reduceMotionEnabled === true,
    highContrastEnabled: value?.highContrastEnabled === true,
    uiScalePercent: normalizeUiScalePercent(value?.uiScalePercent),
    alwaysShowFocusEnabled: value?.alwaysShowFocusEnabled === true,
    screenReaderAnnouncementsEnabled: value?.screenReaderAnnouncementsEnabled === true,
  };
};

export const applyAccessibilityPreferences = (
  value: Partial<AccessibilityPreferences> | null | undefined,
  options: { applyUiScale?: boolean } = {},
): AccessibilityPreferences => {
  const preferences = normalizeAccessibilityPreferences(value);
  const root = document.documentElement;
  const appliedUiScalePercent = options.applyUiScale === false
    ? defaultAccessibilityPreferences.uiScalePercent
    : preferences.uiScalePercent;

  root.dataset.accessibilityReduceMotion = preferences.reduceMotionEnabled ? 'true' : 'false';
  root.dataset.accessibilityHighContrast = preferences.highContrastEnabled ? 'true' : 'false';
  root.dataset.accessibilityAlwaysShowFocus = preferences.alwaysShowFocusEnabled ? 'true' : 'false';
  root.dataset.accessibilityScreenReaderAnnouncements = preferences.screenReaderAnnouncementsEnabled ? 'true' : 'false';
  root.dataset.accessibilityScale = String(appliedUiScalePercent);
  root.dataset.accessibilityLargeUi = appliedUiScalePercent >= 115 ? 'true' : 'false';
  return preferences;
};
