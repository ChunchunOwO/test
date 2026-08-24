import { existsSync, watch, type FSWatcher } from 'node:fs';
import { basename, dirname } from 'node:path';
import { getRegularEditionSettingsPath, isEditionDataSyncEnabled } from './editionDataSync';

type WatchDirectory = (
  path: string,
  options: { persistent: boolean },
  listener: (eventType: string, fileName: string | Buffer | null) => void,
) => FSWatcher;

type SharedSettingsWatcherOptions = {
  debounceMs?: number;
  directoryExists?: (path: string) => boolean;
  enabled?: boolean;
  settingsPath?: string;
  watchDirectory?: WatchDirectory;
};

let activeWatcher: FSWatcher | null = null;
let pendingNotification: NodeJS.Timeout | null = null;

export const disposeSharedSettingsWatcher = (): void => {
  if (pendingNotification) {
    clearTimeout(pendingNotification);
    pendingNotification = null;
  }
  activeWatcher?.close();
  activeWatcher = null;
};

export const initializeSharedSettingsWatcher = (
  onChanged: () => void,
  options: SharedSettingsWatcherOptions = {},
): boolean => {
  disposeSharedSettingsWatcher();

  if ((options.enabled ?? isEditionDataSyncEnabled()) !== true) {
    return false;
  }

  const settingsPath = options.settingsPath ?? getRegularEditionSettingsPath();
  const settingsDirectory = dirname(settingsPath);
  if (!(options.directoryExists ?? existsSync)(settingsDirectory)) {
    return false;
  }

  const watchedName = basename(settingsPath).toLocaleLowerCase();
  const debounceMs = Math.max(0, options.debounceMs ?? 120);
  const watchDirectory = options.watchDirectory ?? watch;

  try {
    const watcher = watchDirectory(
      settingsDirectory,
      { persistent: false },
      (_eventType, fileName) => {
        if (fileName && basename(fileName.toString()).toLocaleLowerCase() !== watchedName) {
          return;
        }

        if (pendingNotification) {
          clearTimeout(pendingNotification);
        }
        pendingNotification = setTimeout(() => {
          pendingNotification = null;
          onChanged();
        }, debounceMs);
      },
    );
    activeWatcher = watcher;
    watcher.on('error', () => {
      if (activeWatcher === watcher) {
        disposeSharedSettingsWatcher();
      }
    });
    return true;
  } catch {
    disposeSharedSettingsWatcher();
    return false;
  }
};
