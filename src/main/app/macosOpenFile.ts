export type MacosOpenFileEvent = {
  preventDefault: () => void;
};

export type MacosOpenFileWindow = {
  focus: () => void;
  isDestroyed: () => boolean;
  isMinimized: () => boolean;
  restore: () => void;
  show: () => void;
};

export type HandleMacosOpenFileOptions = {
  platform: NodeJS.Platform | string;
  event: MacosOpenFileEvent;
  filePath: string;
  appReady: boolean;
  recoveryMode: boolean;
  getWindow: () => MacosOpenFileWindow | null;
  createWindow: () => MacosOpenFileWindow;
  dispatchFiles: (paths: string[]) => void;
};

/**
 * Bridges Finder/LaunchServices `open-file` events into the existing typed
 * local-file open queue. Register the Electron listener before `whenReady()`:
 * macOS can deliver the first event while the application is still starting.
 */
export const handleMacosOpenFile = (options: HandleMacosOpenFileOptions): boolean => {
  if (options.platform !== 'darwin') {
    return false;
  }

  options.event.preventDefault();
  if (options.recoveryMode || !options.filePath.trim()) {
    return true;
  }

  let window = options.getWindow();
  if (!window && options.appReady) {
    window = options.createWindow();
  }

  if (window && !window.isDestroyed()) {
    if (window.isMinimized()) {
      window.restore();
    }
    window.show();
    window.focus();
  }

  // dispatchFiles owns validation and queues the path until the renderer has
  // finished loading. No renderer-side file or playback truth is introduced.
  options.dispatchFiles([options.filePath]);
  return true;
};
