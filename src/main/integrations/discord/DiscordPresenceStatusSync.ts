import type { AudioStatus } from '../../../shared/types/audio';
import type { AppSettings } from '../../../shared/types/appSettings';
import { getAppSettings } from '../../app/appSettings';
import { getAudioSession } from '../../audio/AudioSession';
import { getCrashReportService } from '../../diagnostics/CrashReportService';
import { disposeDiscordPresenceService, getDiscordPresenceService } from './getDiscordPresenceService';

type DiscordPresenceSyncState = {
  initialized: boolean;
  statusListener: ((status: AudioStatus) => void) | null;
};

const state: DiscordPresenceSyncState = {
  initialized: false,
  statusListener: null,
};

let lifecycleQueue: Promise<void> = Promise.resolve();

const enqueueLifecycle = (operation: () => Promise<void>): Promise<void> => {
  const queued = lifecycleQueue.catch(() => undefined).then(operation);
  lifecycleQueue = queued.catch(() => undefined);
  return queued;
};

const logWarn = (message: string, payload?: unknown): void => {
  getCrashReportService().getLogger()?.warn('main', message, payload);
  console.warn(message, payload ?? '');
};

export const syncDiscordPresenceStatus = async (status: AudioStatus = getAudioSession().getStatus()): Promise<void> => {
  try {
    await getDiscordPresenceService().updateFromAudioStatus(status);
  } catch (error) {
    logWarn('[DiscordPresence] Failed to sync audio status', { error: error instanceof Error ? error.message : String(error) });
  }
};

export const initializeDiscordPresenceIntegration = async (): Promise<void> => {
  if (state.initialized) {
    return;
  }

  try {
    await getDiscordPresenceService().initialize();
  } catch (error) {
    logWarn('[DiscordPresence] Initialization failed', { error: error instanceof Error ? error.message : String(error) });
  }

  state.statusListener = (status: AudioStatus) => {
    void syncDiscordPresenceStatus(status);
  };
  getAudioSession().on('status', state.statusListener);
  state.initialized = true;
  const initialStatus = getAudioSession().getStatus();
  if (initialStatus.state === 'playing' || initialStatus.state === 'loading') {
    await syncDiscordPresenceStatus(initialStatus);
  }
};

const disposeDiscordPresenceIntegrationNow = async (): Promise<void> => {
  if (!state.initialized) {
    await disposeDiscordPresenceService();
    return;
  }

  if (state.statusListener) {
    getAudioSession().off('status', state.statusListener);
  }

  state.initialized = false;
  state.statusListener = null;
  await disposeDiscordPresenceService();
};

export const disposeDiscordPresenceIntegration = (): Promise<void> =>
  enqueueLifecycle(disposeDiscordPresenceIntegrationNow);

export const syncDiscordPresenceIntegrationFromSettings = async (
  settings: AppSettings = getAppSettings(),
): Promise<void> => {
  const enabled = settings.discordRichPresenceEnabled === true;
  await enqueueLifecycle(async () => {
    if (enabled) {
      await initializeDiscordPresenceIntegration();
      return;
    }

    await disposeDiscordPresenceIntegrationNow();
  });
};
