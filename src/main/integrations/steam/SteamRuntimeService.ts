import { createRequire } from 'node:module';
import { app } from 'electron';
import type { SteamStatus, SteamUnavailableReason } from '../../../shared/types/steam';
import { getSteamRuntimeConfiguration, type SteamRuntimeConfiguration } from './SteamRuntimeConfig';

export type SteamworksBindings = Pick<
  typeof import('steamworks.js'),
  'init' | 'restartAppIfNecessary' | 'electronEnableSteamOverlay'
>;
export type SteamClient = ReturnType<SteamworksBindings['init']>;

type SteamApp = Pick<typeof app, 'isPackaged' | 'quit'>;

type SteamRuntimeLogger = {
  info: (message: string, payload?: Record<string, unknown>) => void;
  warn: (message: string, payload?: Record<string, unknown>) => void;
};

type SteamRuntimeServiceOptions = {
  electronApp?: SteamApp;
  configuration?: SteamRuntimeConfiguration;
  loadBindings?: () => SteamworksBindings;
  logger?: SteamRuntimeLogger;
};

const require = createRequire(import.meta.url);

const defaultLogger: SteamRuntimeLogger = {
  info: (message, payload) => console.info(message, payload ?? ''),
  warn: (message, payload) => console.warn(message, payload ?? ''),
};

const createEmptyStatus = (
  configuration: SteamRuntimeConfiguration,
  message: string,
): SteamStatus => ({
  state: 'unconfigured',
  appId: configuration.appId,
  appIdSource: configuration.source,
  playerName: null,
  appBuildId: null,
  betaName: null,
  subscribed: null,
  runningOnSteamDeck: null,
  cloudEnabled: null,
  unavailableReason: configuration.missingReason,
  message,
});

const safeRead = <T>(read: () => T): T | null => {
  try {
    return read();
  } catch {
    return null;
  }
};

export class SteamRuntimeService {
  private readonly electronApp: SteamApp;
  private readonly configuration: SteamRuntimeConfiguration;
  private readonly loadBindings: () => SteamworksBindings;
  private readonly logger: SteamRuntimeLogger;
  private client: SteamClient | null = null;
  private attempted = false;
  private status: SteamStatus;

  constructor(options: SteamRuntimeServiceOptions = {}) {
    this.electronApp = options.electronApp ?? app;
    this.configuration = options.configuration ?? getSteamRuntimeConfiguration(this.electronApp.isPackaged);
    this.loadBindings = options.loadBindings ?? (() => require('steamworks.js') as SteamworksBindings);
    this.logger = options.logger ?? defaultLogger;
    this.status = createEmptyStatus(
      this.configuration,
      this.configuration.missingReason === 'release_app_id_missing'
        ? 'The packaged Steam release is missing its build-time App ID.'
        : 'Steamworks is not configured for this development session.',
    );
  }

  initialize(): SteamStatus {
    if (this.attempted) {
      return this.status;
    }
    this.attempted = true;

    const appId = this.configuration.appId;
    if (appId === null) {
      this.logger.warn('[Steamworks] Initialization skipped', {
        reason: this.configuration.missingReason ?? 'unknown',
      });
      return this.status;
    }

    let steamworks: SteamworksBindings;
    try {
      steamworks = this.loadBindings();
    } catch (error) {
      return this.fail('native_module_load_failed', 'The Steamworks native runtime could not be loaded.', error);
    }

    try {
      if (this.electronApp.isPackaged && steamworks.restartAppIfNecessary(appId)) {
        this.status = {
          ...createEmptyStatus(this.configuration, 'Restarting through the Steam client.'),
          state: 'restarting',
          unavailableReason: null,
        };
        this.electronApp.quit();
        return this.status;
      }

      // Must run before BrowserWindow creation for the overlay to render.
      steamworks.electronEnableSteamOverlay();
      this.client = steamworks.init(appId);
      this.status = this.createReadyStatus(this.client);
      this.logger.info('[Steamworks] Runtime initialized', {
        appId,
        appBuildId: this.status.appBuildId,
        betaName: this.status.betaName,
      });
      return this.status;
    } catch (error) {
      this.client = null;
      return this.fail('steam_client_unavailable', 'Steamworks could not connect to the Steam client.', error);
    }
  }

  getStatus(): SteamStatus {
    return this.status;
  }

  getClient(): SteamClient | null {
    return this.client;
  }

  getCurrentGameLanguage(): string | null {
    if (!this.client) {
      return null;
    }

    return safeRead(() => this.client?.apps.currentGameLanguage().trim() || null);
  }

  hasClient(): boolean {
    return this.client !== null;
  }

  private createReadyStatus(client: SteamClient): SteamStatus {
    const subscribed = safeRead(() => client.apps.isSubscribed());
    const playerName = safeRead(() => client.localplayer.getName()?.trim() || null);
    const cloudAccountEnabled = safeRead(() => client.cloud.isEnabledForAccount());
    const cloudAppEnabled = safeRead(() => client.cloud.isEnabledForApp());

    return {
      state: subscribed === false ? 'unavailable' : 'ready',
      appId: safeRead(() => client.utils.getAppId()) ?? this.configuration.appId,
      appIdSource: this.configuration.source,
      playerName,
      appBuildId: safeRead(() => client.apps.appBuildId()),
      betaName: safeRead(() => client.apps.currentBetaName()),
      subscribed,
      runningOnSteamDeck: safeRead(() => client.utils.isSteamRunningOnSteamDeck()),
      cloudEnabled:
        cloudAccountEnabled === null || cloudAppEnabled === null
          ? null
          : cloudAccountEnabled && cloudAppEnabled,
      unavailableReason: subscribed === false ? 'license_unavailable' : null,
      message: subscribed === false
        ? 'The active Steam account does not own this application.'
        : 'Steamworks is connected.',
    };
  }

  private fail(reason: SteamUnavailableReason, message: string, error: unknown): SteamStatus {
    this.status = {
      ...createEmptyStatus(this.configuration, message),
      state: reason === 'native_module_load_failed' ? 'error' : 'unavailable',
      unavailableReason: reason,
    };
    this.logger.warn('[Steamworks] Initialization failed', {
      reason,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    return this.status;
  }
}
