import { release } from 'node:os';
import type { BrowserWindow } from 'electron';
import type { AppSettings } from '../../shared/types/appSettings';
import { resolveEffectivePerformancePolicy } from '../../shared/utils/performancePolicy';

export const mainWindowAcrylicBackgroundColor = '#00000000';

export const resolveMainWindowBackgroundColor = (
  acrylicEnabled: boolean,
  opaqueBackgroundColor = '#f7f9fc',
): string => acrylicEnabled ? mainWindowAcrylicBackgroundColor : opaqueBackgroundColor;

const minimumWindowsAcrylicBuild = 22621;

export const isMainWindowAcrylicSupportedPlatform = (
  platform: NodeJS.Platform = process.platform,
  systemRelease = release(),
): boolean => {
  if (platform !== 'win32') {
    return false;
  }

  const windowsBuild = Number.parseInt(systemRelease.split('.')[2] ?? '', 10);
  return Number.isFinite(windowsBuild) && windowsBuild >= minimumWindowsAcrylicBuild;
};

export const applyMainWindowBackgroundMaterial = (
  window: BrowserWindow,
  settings: Pick<AppSettings, 'appWindowAcrylicEnabled' | 'appWindowAcrylicKeepWhenUnfocusedEnabled' | 'lowSpecModeEnabled'>,
  acrylicSupported = isMainWindowAcrylicSupportedPlatform(),
): void => {
  if (window.isDestroyed()) {
    return;
  }

  const acrylicEnabled = acrylicSupported && resolveEffectivePerformancePolicy(settings).appWindowAcrylicEnabled;

  if (acrylicSupported) {
    if (acrylicEnabled) {
      window.setBackgroundMaterial('acrylic');
      window.setBackgroundColor(resolveMainWindowBackgroundColor(true));
    } else {
      window.setBackgroundColor(resolveMainWindowBackgroundColor(false));
      window.setBackgroundMaterial('none');
    }
    return;
  }

  window.setBackgroundColor(resolveMainWindowBackgroundColor(false));
};
