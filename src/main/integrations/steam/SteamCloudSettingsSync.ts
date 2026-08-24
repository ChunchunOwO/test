import { createHash } from 'node:crypto';
import { app } from 'electron';
import type { AppSettings } from '../../../shared/types/appSettings';
import type {
  SteamCloudSettingsDownloadResult,
  SteamCloudSettingsError,
  SteamCloudSettingsStatus,
  SteamCloudSettingsUploadResult,
} from '../../../shared/types/steam';
import { getSteamCloudProfileService, getSteamStatus } from './SteamworksService';
import { steamCloudProfileFileName, type SteamCloudProfileService } from './SteamCapabilityServices';

const steamCloudSettingsFormat = 'echo-steam-cloud-settings';
const steamCloudSettingsVersion = 1;
const automaticUploadDelayMs = 1_200;
const automaticRetryDelaysMs = [5_000, 15_000, 60_000, 5 * 60_000] as const;

const localOnlySettingKeys = new Set([
  'appMemoryVersion',
  'autoDataBackupDirectory',
  'autoDataBackupEnabled',
  'autoDataBackupIntervalDays',
  'autoDataBackupLastError',
  'autoDataBackupLastPath',
  'autoDataBackupLastRunAt',
  'connectAutoStartReceiversEnabled',
  'coverCacheDir',
  'desktopLyricsBounds',
  'downloadsFeatureUnlocked',
  'finalThemeUnlockVersion',
  'hiddenAudioDeviceKeys',
  'hqPlayer',
  'launchAtLoginEnabled',
  'miniPlayerBounds',
  'networkProxyBypassRules',
  'networkProxyMode',
  'networkProxyPacUrl',
  'networkProxyUrl',
  'obsBrowserSourceEnabled',
  'petBounds',
  'rememberedAudioOutput',
  'rememberedWindowSize',
  'rememberWindowSizeEnabled',
  'safeModeEnabled',
  'stageApiEnabled',
  'steamListeningStatsEnabled',
  'steamLeaderboardsEnabled',
]);

const localOnlySettingPrefixes = [
  'airPlay',
  'echoLink',
  'mqtt',
  'onlineAlbumInfo',
  'onlineArtistInfo',
  'spotify',
  'tidal',
];

const sensitiveKeyPattern = /(?:apiKey|auth|authorization|cookie|credential|device|filePath|hwid|machine|password|path|secret|sessionKey|token)$/iu;

type SteamCloudSettingsSnapshot = {
  format: typeof steamCloudSettingsFormat;
  version: typeof steamCloudSettingsVersion;
  updatedAt: string;
  appVersion: string;
  digest: string;
  settings: Partial<AppSettings>;
};

type CloudProfileStorage = Pick<SteamCloudProfileService, 'read' | 'write'>;

type SteamCloudSettingsDependencies = {
  profile: CloudProfileStorage;
  getCloudEnabled: () => boolean | null;
  getAppVersion: () => string;
  now: () => Date;
};

type SteamCloudStartupReconcileInput = {
  getSettings: () => AppSettings;
  getLocalUpdatedAt: () => string | null;
  applySettings: (settings: Partial<AppSettings>) => AppSettings;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const isLocalOnlyKey = (key: string): boolean =>
  localOnlySettingKeys.has(key) ||
  localOnlySettingPrefixes.some((prefix) => key.startsWith(prefix)) ||
  sensitiveKeyPattern.test(key);

const sanitizePortableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sanitizePortableValue);
  }
  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isLocalOnlyKey(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sanitizePortableValue(item)]),
  );
};

export const createPortableSteamCloudSettings = (settings: AppSettings | Record<string, unknown>): Partial<AppSettings> =>
  sanitizePortableValue(settings) as Partial<AppSettings>;

const digestSettings = (settings: Partial<AppSettings>): string =>
  createHash('sha256').update(JSON.stringify(settings), 'utf8').digest('hex');

const parseTimestamp = (value: unknown): string | null => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    return null;
  }
  return new Date(value).toISOString();
};

const parseSnapshot = (value: Record<string, unknown> | null): SteamCloudSettingsSnapshot | null => {
  if (
    !value ||
    value.format !== steamCloudSettingsFormat ||
    value.version !== steamCloudSettingsVersion ||
    !isRecord(value.settings)
  ) {
    return null;
  }

  const updatedAt = parseTimestamp(value.updatedAt);
  if (!updatedAt || typeof value.appVersion !== 'string' || typeof value.digest !== 'string') {
    return null;
  }

  const settings = createPortableSteamCloudSettings(value.settings);
  if (digestSettings(settings) !== value.digest) {
    return null;
  }

  return {
    format: steamCloudSettingsFormat,
    version: steamCloudSettingsVersion,
    updatedAt,
    appVersion: value.appVersion,
    digest: value.digest,
    settings,
  };
};

const createSnapshot = (
  settings: AppSettings | Record<string, unknown>,
  appVersion: string,
  updatedAt: string,
): SteamCloudSettingsSnapshot => {
  const portableSettings = createPortableSteamCloudSettings(settings);
  return {
    format: steamCloudSettingsFormat,
    version: steamCloudSettingsVersion,
    updatedAt,
    appVersion,
    digest: digestSettings(portableSettings),
    settings: portableSettings,
  };
};

export class SteamCloudSettingsSyncService {
  private lastUploadedAt: string | null = null;
  private lastDownloadedAt: string | null = null;
  private lastAttemptedAt: string | null = null;
  private lastSucceededAt: string | null = null;
  private lastError: SteamCloudSettingsError | null = null;
  private pendingUpload = false;
  private uploadTimer: NodeJS.Timeout | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private retryCount = 0;
  private nextRetryAt: string | null = null;

  constructor(private readonly dependencies: SteamCloudSettingsDependencies) {}

  getStatus(): SteamCloudSettingsStatus {
    const profile = this.dependencies.profile.read();
    const snapshot = parseSnapshot(profile);
    const invalidSnapshot = profile !== null && snapshot === null;
    return this.createStatus(snapshot, invalidSnapshot ? 'invalid_snapshot' : this.lastError);
  }

  upload(settings: AppSettings | Record<string, unknown>): SteamCloudSettingsUploadResult {
    this.clearUploadTimer();
    this.clearRetryTimer();
    return this.performUpload(settings, () => settings);
  }

  private performUpload(
    settings: AppSettings | Record<string, unknown>,
    getSettings: () => AppSettings | Record<string, unknown>,
  ): SteamCloudSettingsUploadResult {
    const updatedAt = this.dependencies.now().toISOString();
    this.lastAttemptedAt = updatedAt;
    const snapshot = createSnapshot(settings, this.dependencies.getAppVersion(), updatedAt);
    const result = this.dependencies.profile.write(snapshot as unknown as Record<string, unknown>);
    if (!result.ok) {
      this.lastError = result.reason;
      if (result.reason === 'unavailable' || result.reason === 'write_failed') {
        this.scheduleRetry(() => this.performUpload(getSettings(), getSettings));
      }
      return { ...this.createStatus(null, result.reason), uploaded: false };
    }

    this.lastUploadedAt = updatedAt;
    this.markReconcileSucceeded(updatedAt);
    return { ...this.createStatus(snapshot, null), uploaded: true };
  }

  async downloadAndApply(
    applySettings: (settings: Partial<AppSettings>) => Promise<AppSettings>,
  ): Promise<SteamCloudSettingsDownloadResult> {
    this.lastAttemptedAt = this.dependencies.now().toISOString();
    const profile = this.dependencies.profile.read();
    const snapshot = parseSnapshot(profile);
    if (!snapshot) {
      const error = profile ? 'invalid_snapshot' : null;
      this.lastError = error;
      return { ...this.createStatus(null, error), applied: false, settings: null };
    }

    try {
      const settings = await applySettings(snapshot.settings);
      this.lastDownloadedAt = this.dependencies.now().toISOString();
      this.markReconcileSucceeded(this.lastDownloadedAt);
      return { ...this.createStatus(snapshot, null), applied: true, settings };
    } catch {
      this.lastError = 'apply_failed';
      return { ...this.createStatus(snapshot, 'apply_failed'), applied: false, settings: null };
    }
  }

  reconcileAtStartup(input: SteamCloudStartupReconcileInput): SteamCloudSettingsStatus {
    this.lastAttemptedAt = this.dependencies.now().toISOString();
    const cloudEnabled = this.dependencies.getCloudEnabled();
    if (cloudEnabled !== true) {
      this.lastError = cloudEnabled === false ? 'disabled' : 'unavailable';
      if (cloudEnabled === null) {
        this.scheduleRetry(() => this.reconcileAtStartup(input));
      }
      return this.createStatus(null, this.lastError);
    }

    const profile = this.dependencies.profile.read();
    const remote = parseSnapshot(profile);
    if (!remote) {
      if (profile) {
        this.lastError = 'invalid_snapshot';
        return this.createStatus(null, this.lastError);
      }
      return this.performUpload(input.getSettings(), input.getSettings);
    }

    const localSettings = input.getSettings();
    const localPortable = createPortableSteamCloudSettings(localSettings);
    if (digestSettings(localPortable) === remote.digest) {
      this.markReconcileSucceeded();
      return this.createStatus(remote, null);
    }

    const localUpdatedAt = input.getLocalUpdatedAt();
    const localUpdatedAtMs = localUpdatedAt ? Date.parse(localUpdatedAt) : Number.NaN;
    if (!Number.isFinite(localUpdatedAtMs) || Date.parse(remote.updatedAt) > localUpdatedAtMs) {
      try {
        input.applySettings(remote.settings);
        this.lastDownloadedAt = this.dependencies.now().toISOString();
        this.markReconcileSucceeded(this.lastDownloadedAt);
        return this.createStatus(remote, null);
      } catch {
        this.lastError = 'apply_failed';
        return this.createStatus(remote, this.lastError);
      }
    }

    return this.performUpload(localSettings, input.getSettings);
  }

  scheduleUpload(getSettings: () => AppSettings | Record<string, unknown>): void {
    if (this.dependencies.getCloudEnabled() !== true) {
      return;
    }
    this.clearUploadTimer();
    this.clearRetryTimer();
    this.retryCount = 0;
    this.pendingUpload = true;
    this.uploadTimer = setTimeout(() => {
      this.uploadTimer = null;
      this.pendingUpload = false;
      this.performUpload(getSettings(), getSettings);
    }, automaticUploadDelayMs);
    this.uploadTimer.unref?.();
  }

  dispose(): void {
    this.clearUploadTimer();
    this.clearRetryTimer();
  }

  private clearUploadTimer(): void {
    if (this.uploadTimer) {
      clearTimeout(this.uploadTimer);
      this.uploadTimer = null;
    }
    this.pendingUpload = false;
  }

  private clearRetryTimer(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.nextRetryAt = null;
  }

  private scheduleRetry(operation: () => unknown): void {
    if (this.retryTimer) return;
    const delay = automaticRetryDelaysMs[Math.min(this.retryCount, automaticRetryDelaysMs.length - 1)];
    this.retryCount += 1;
    this.pendingUpload = true;
    this.nextRetryAt = new Date(this.dependencies.now().getTime() + delay).toISOString();
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.nextRetryAt = null;
      this.pendingUpload = false;
      operation();
    }, delay);
    this.retryTimer.unref?.();
  }

  private markReconcileSucceeded(succeededAt = this.dependencies.now().toISOString()): void {
    this.clearRetryTimer();
    this.retryCount = 0;
    this.lastSucceededAt = succeededAt;
    this.lastError = null;
    this.pendingUpload = false;
  }

  private createStatus(
    snapshot: SteamCloudSettingsSnapshot | null,
    error: SteamCloudSettingsError | null,
  ): SteamCloudSettingsStatus {
    const enabled = this.dependencies.getCloudEnabled();
    const nextRetryAt = this.nextRetryAt;
    const syncState: SteamCloudSettingsStatus['syncState'] = enabled === false
      ? 'disabled'
      : nextRetryAt
        ? 'retrying'
        : this.pendingUpload
          ? 'pending'
          : error
            ? 'error'
            : snapshot
              ? 'synced'
              : 'idle';
    return {
      enabled,
      available: snapshot !== null,
      syncState,
      fileName: steamCloudProfileFileName,
      remoteUpdatedAt: snapshot?.updatedAt ?? null,
      lastAttemptedAt: this.lastAttemptedAt,
      lastSucceededAt: this.lastSucceededAt,
      lastUploadedAt: this.lastUploadedAt,
      lastDownloadedAt: this.lastDownloadedAt,
      nextRetryAt,
      retryCount: this.retryCount,
      settingsCount: snapshot ? Object.keys(snapshot.settings).length : 0,
      pendingUpload: this.pendingUpload,
      lastError: error,
    };
  }
}

let defaultService: SteamCloudSettingsSyncService | null = null;

export const getSteamCloudSettingsSyncService = (): SteamCloudSettingsSyncService => {
  if (!defaultService) {
    defaultService = new SteamCloudSettingsSyncService({
      profile: getSteamCloudProfileService(),
      getCloudEnabled: () => getSteamStatus().cloudEnabled,
      getAppVersion: () => app.getVersion(),
      now: () => new Date(),
    });
  }
  return defaultService;
};

export const scheduleSteamCloudSettingsUpload = (
  getSettings: () => AppSettings | Record<string, unknown>,
): void => getSteamCloudSettingsSyncService().scheduleUpload(getSettings);

export const disposeSteamCloudSettingsIntegration = (): void => {
  getSteamCloudSettingsSyncService().dispose();
};
