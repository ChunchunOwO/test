import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';

const ECHO_DIR = 'echo-steam';

const isLinux = (): boolean => process.platform === 'linux';

const envVar = (name: string, defaultPath: string): string =>
  process.env[name]?.trim() || defaultPath;

let _configPath: string | null = null;
let _dataPath: string | null = null;
let _cachePath: string | null = null;

/** Resolved XDG config path (~/.config/echo-steam). */
export const getConfigPath = (): string => {
  if (!_configPath) throw new Error('xdgPaths: not initialized');
  return _configPath;
};

/** Resolved XDG data path (~/.local/share/echo-steam). */
export const getDataPath = (): string => {
  if (!_dataPath) throw new Error('xdgPaths: not initialized');
  return _dataPath;
};

/** Resolved XDG cache path (~/.cache/echo-steam). */
export const getCachePath = (): string => {
  if (!_cachePath) throw new Error('xdgPaths: not initialized');
  return _cachePath;
};

/**
 * Initialise XDG base directory paths.
 * Must be called once at app startup, before any path-dependent service.
 *
 * On Linux the three XDG directories are created and `app.setPath('userData')`
 * is pointed at the config directory so existing `app.getPath('userData')`
 * consumers continue to work for config-like files.
 * Data from another ECHO distribution is never migrated automatically.
 *
 * On Windows / macOS — no-op (Electron defaults are used unchanged).
 *
 * Returns the config path (the new `userData`).
 */
export const initializeXdgPaths = (): string => {
  if (_configPath) return _configPath;

  if (!isLinux()) {
    _configPath = app.getPath('userData');
    _dataPath = app.getPath('userData');
    _cachePath = app.getPath('userData');
    return _configPath;
  }

  const xdgConfigHome = envVar('XDG_CONFIG_HOME', join(process.env.HOME ?? '/tmp', '.config'));
  const xdgDataHome = envVar('XDG_DATA_HOME', join(process.env.HOME ?? '/tmp', '.local', 'share'));
  const xdgCacheHome = envVar('XDG_CACHE_HOME', join(process.env.HOME ?? '/tmp', '.cache'));

  _configPath = join(xdgConfigHome, ECHO_DIR);
  _dataPath = join(xdgDataHome, ECHO_DIR);
  _cachePath = join(xdgCacheHome, ECHO_DIR);

  mkdirSync(_configPath, { recursive: true });
  mkdirSync(_dataPath, { recursive: true });
  mkdirSync(_cachePath, { recursive: true });

  if (app.setPath) {
    app.setPath('userData', _configPath);
  }

  return _configPath;
};

/** Retained as a no-op API for callers from older builds. */
export const migrateLegacyXdgData = (): void => {
  // Use the explicit backup/import flow so Steam never absorbs another ECHO profile.
};

/** Alias for getConfigPath — drop-in for existing `app.getPath('userData')` call sites. */
export const getUserDataPath = (): string => getConfigPath();
