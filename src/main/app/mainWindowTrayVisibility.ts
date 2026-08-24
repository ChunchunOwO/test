import type { BrowserWindow } from 'electron';

type TrayBackgroundWindow = Pick<
  BrowserWindow,
  'hide' | 'isDestroyed' | 'setSkipTaskbar'
>;

type TrayForegroundWindow = Pick<
  BrowserWindow,
  'focus' | 'isDestroyed' | 'isMinimized' | 'restore' | 'setSkipTaskbar' | 'show'
>;

export const hideMainWindowToTray = (
  window: TrayBackgroundWindow,
): void => {
  if (window.isDestroyed()) {
    return;
  }

  // A hidden window must not be minimized afterwards: on Windows that native
  // transition can surface it again. Keep it tray-only until explicit restore.
  window.setSkipTaskbar(true);
  window.hide();
};

export const showMainWindowFromTray = (window: TrayForegroundWindow): void => {
  if (window.isDestroyed()) {
    return;
  }

  window.show();
  if (window.isMinimized()) {
    window.restore();
  }
  window.setSkipTaskbar(false);
  window.focus();
};
