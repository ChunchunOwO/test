import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { app } from 'electron';
import type { AppSettings } from '../../shared/types/appSettings';

type ElectronAppLike = {
  getPath: (name: 'appData' | 'userData') => string;
};

const libraryFileName = 'echo-library.sqlite';
const settingsFileName = 'echo-settings.json';
const settingsLockFileName = 'echo-settings.sync.lock';
const lockRetryCount = 40;
const lockRetryDelayMs = 10;

const regularEditionFolderNames = [
  'ECHO',
  ['ECHO', 'NEXT'].join(' '),
  ['echo', 'next'].join('-'),
] as const;

const unsupportedSteamSettingKeys = new Set<keyof AppSettings>([
  // Migration versions belong to each edition's settings schema. Sharing the
  // regular edition's older version can make Steam re-run one-time migrations
  // after every settings update (for example, hiding Genres again).
  'appMemoryVersion',
  'steamListeningStatsEnabled',
  'artistStreamingAlbumsEnabled',
  'artistStreamingAlbumsProvider',
  'autoAccountCheckOnStartup',
  'downloadsFeatureKeyAccepted',
  'downloadsFeatureUnlocked',
  'mvEnabled',
  'mvEnabledProviders',
  'mvProviderOrder',
  'mvAutoSearch',
  'mvAutoPreload',
  'mvAutoApplyThreshold',
  'mvPreferHighestViewCount',
  'mvImmersiveBackground',
  'mvImmersiveBackgroundAutoScale',
  'mvImmersiveBackgroundScalePercent',
  'mvImmersiveBackgroundOffsetXPercent',
  'mvImmersiveBackgroundOffsetYPercent',
  'mvImmersiveBackgroundBlurPx',
  'mvImmersiveBackgroundBrightnessPercent',
  'mvImmersiveBackgroundOverlayOpacityPercent',
  'mvLyricsReadabilityEnhanced',
  'mvHideLyrics',
  'mvRestartAudioOnLoad',
  'mvSyncMode',
  'mvReplayAudioOnChange',
  'mvMaxQuality',
  'mvAllow60fps',
  'mvTitleOnlySearch',
  'osuDownloaderFeatureEnabled',
  'spotifyAutoLaunchOfficialPlayer',
  'spotifyClientId',
  'spotifyRedirectUri',
  'streamingDownloadActionsEnabled',
  'suppressAccountExpiryNotices',
  'tidalClientId',
  'tidalClientSecret',
  'tidalRedirectUri',
  'tidalCountryCode',
]);

const sleepSync = (milliseconds: number): void => {
  const signal = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(signal, 0, 0, milliseconds);
};

const readJsonObject = (filePath: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8').replace(/^\uFEFF/u, '')) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
};

const writeJsonObjectAtomically = (filePath: string, value: Record<string, unknown>): void => {
  mkdirSync(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    renameSync(temporaryPath, filePath);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
};

const withSettingsLock = <T>(settingsPath: string, action: () => T): T => {
  const lockPath = join(dirname(settingsPath), settingsLockFileName);
  mkdirSync(dirname(lockPath), { recursive: true });

  for (let attempt = 0; attempt < lockRetryCount; attempt += 1) {
    let descriptor: number | null = null;
    try {
      descriptor = openSync(lockPath, 'wx');
      return action();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST' || attempt === lockRetryCount - 1) {
        throw error;
      }
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > 10_000) {
          rmSync(lockPath, { force: true });
          continue;
        }
      } catch {
        // The other process released the lock between checks.
      }
      sleepSync(lockRetryDelayMs);
    } finally {
      if (descriptor !== null) {
        closeSync(descriptor);
        rmSync(lockPath, { force: true });
      }
    }
  }

  throw new Error('settings_sync_lock_timeout');
};

const scoreRegularEditionFolder = (folderPath: string): number => {
  let score = 0;
  for (const [fileName, weight] of [[libraryFileName, 10_000], [settingsFileName, 1_000]] as const) {
    const filePath = join(folderPath, fileName);
    try {
      const stats = statSync(filePath);
      score += weight + Math.min(999, Math.floor(stats.size / (1024 * 1024)));
    } catch {
      // A missing file contributes no score.
    }
  }
  return score;
};

export const isEditionDataSyncEnabled = (): boolean =>
  process.platform === 'win32' &&
  process.env.NODE_ENV !== 'test' &&
  process.env.ECHO_DISABLE_EDITION_DATA_SYNC !== '1';

export const resolveRegularEditionUserDataPath = (electronApp: ElectronAppLike = app): string => {
  const appDataPath = electronApp.getPath('appData');
  const candidates = regularEditionFolderNames.map((name) => join(appDataPath, name));
  const existing = candidates
    .filter((candidate) => existsSync(candidate))
    .map((candidate) => ({ path: candidate, score: scoreRegularEditionFolder(candidate) }))
    .sort((left, right) => right.score - left.score);

  return resolve(existing[0]?.path ?? candidates[0]);
};

export const getSharedLibraryDatabasePath = (electronApp: ElectronAppLike = app): string =>
  isEditionDataSyncEnabled()
    ? join(resolveRegularEditionUserDataPath(electronApp), libraryFileName)
    : join(electronApp.getPath('userData'), libraryFileName);

export const getLibraryDatabasePathForUserData = (
  userDataPath: string,
  electronApp: ElectronAppLike = app,
): string =>
  isEditionDataSyncEnabled() &&
  resolve(userDataPath).toLocaleLowerCase() === resolve(electronApp.getPath('userData')).toLocaleLowerCase()
    ? getSharedLibraryDatabasePath(electronApp)
    : join(userDataPath, libraryFileName);

export const getLibraryEntryPathForUserData = (
  userDataPath: string,
  name: string,
  electronApp: ElectronAppLike = app,
): string => join(dirname(getLibraryDatabasePathForUserData(userDataPath, electronApp)), name);

export const getRegularEditionSettingsPath = (electronApp: ElectronAppLike = app): string =>
  join(resolveRegularEditionUserDataPath(electronApp), settingsFileName);

export const isSteamSharedSettingKey = (key: string): key is keyof AppSettings =>
  !unsupportedSteamSettingKeys.has(key as keyof AppSettings);

export const readRegularEditionSharedSettings = (
  electronApp: ElectronAppLike = app,
): { path: string; mtimeMs: number; settings: Partial<AppSettings> } | null => {
  if (!isEditionDataSyncEnabled()) {
    return null;
  }

  const path = getRegularEditionSettingsPath(electronApp);
  let mtimeMs: number;
  try {
    mtimeMs = statSync(path).mtimeMs;
  } catch {
    return null;
  }

  const source = readJsonObject(path);
  const settings = Object.fromEntries(
    Object.entries(source).filter(([key]) => isSteamSharedSettingKey(key)),
  ) as Partial<AppSettings>;
  return { path, mtimeMs, settings };
};

export const writeRegularEditionSharedSettingsPatch = (
  patch: Partial<AppSettings>,
  electronApp: ElectronAppLike = app,
): void => {
  if (!isEditionDataSyncEnabled()) {
    return;
  }

  const sharedEntries = Object.entries(patch).filter(([key]) => isSteamSharedSettingKey(key));
  if (sharedEntries.length === 0) {
    return;
  }

  const settingsPath = getRegularEditionSettingsPath(electronApp);
  withSettingsLock(settingsPath, () => {
    const current = readJsonObject(settingsPath);
    for (const [key, value] of sharedEntries) {
      current[key] = value;
    }
    writeJsonObjectAtomically(settingsPath, current);
  });
};
