import type { MenuItemConstructorOptions } from 'electron';
import type { GlobalShortcutAction } from '../../shared/types/globalShortcuts';

export type MacosApplicationMenuCallbacks = {
  dispatchCommand: (action: GlobalShortcutAction) => void;
  showMainWindow: () => void;
};

export const createMacosApplicationMenuTemplate = (
  appName: string,
  callbacks: MacosApplicationMenuCallbacks,
): MenuItemConstructorOptions[] => [{
  label: appName,
  submenu: [
    { role: 'about' },
    { type: 'separator' },
    {
      label: 'Settings…',
      accelerator: 'CommandOrControl+,',
      click: () => callbacks.dispatchCommand('openSettings'),
    },
    { type: 'separator' },
    { role: 'services' },
    { type: 'separator' },
    { role: 'hide' },
    { role: 'hideOthers' },
    { role: 'unhide' },
    { type: 'separator' },
    { role: 'quit' },
  ],
}, {
  label: 'File',
  submenu: [
    { label: 'Show ECHO', click: callbacks.showMainWindow },
    { type: 'separator' },
    { role: 'close' },
  ],
}, {
  label: 'Edit',
  submenu: [
    { role: 'undo' },
    { role: 'redo' },
    { type: 'separator' },
    { role: 'cut' },
    { role: 'copy' },
    { role: 'paste' },
    { role: 'selectAll' },
  ],
}, {
  label: 'Playback',
  submenu: [
    { label: 'Play / Pause', click: () => callbacks.dispatchCommand('playPause') },
    { label: 'Previous Track', click: () => callbacks.dispatchCommand('previousTrack') },
    { label: 'Next Track', click: () => callbacks.dispatchCommand('nextTrack') },
    { type: 'separator' },
    { label: 'Stop', click: () => callbacks.dispatchCommand('stop') },
  ],
}, {
  label: 'View',
  submenu: [
    { role: 'reload' },
    { role: 'toggleDevTools' },
    { type: 'separator' },
    { role: 'resetZoom' },
    { role: 'zoomIn' },
    { role: 'zoomOut' },
    { type: 'separator' },
    { role: 'togglefullscreen' },
  ],
}, {
  label: 'Window',
  submenu: [
    { role: 'minimize' },
    { role: 'zoom' },
    { type: 'separator' },
    { role: 'front' },
  ],
}];
