import type { AudioStatus } from '../../../shared/types/audio';
import type { AppSettings } from '../../../shared/types/appSettings';
import { getAppSettings } from '../../app/appSettings';
import { getAudioSession } from '../../audio/AudioSession';
import { getCrashReportService } from '../../diagnostics/CrashReportService';
import { disposeLastFmService, getLastFmService } from './getLastFmService';

type LastFmSyncState = {
  initialized: boolean;
  statusListener: ((status: AudioStatus) => void) | null;
};

const state: LastFmSyncState = {
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

export const syncLastFmStatus = (status: AudioStatus = getAudioSession().getStatus()): void => {
  try {
    getLastFmService().updateFromAudioStatus(status);
  } catch (error) {
    logWarn('[Last.fm] failed to sync audio status', { error: error instanceof Error ? error.message : String(error) });
  }
};

export const initializeLastFmIntegration = (): void => {
  if (state.initialized) {
    return;
  }

  try {
    getLastFmService().initialize();
  } catch (error) {
    logWarn('[Last.fm] initialization failed', { error: error instanceof Error ? error.message : String(error) });
  }

  state.statusListener = (status: AudioStatus) => {
    syncLastFmStatus(status);
  };
  getAudioSession().on('status', state.statusListener);
  state.initialized = true;
};

const disposeLastFmIntegrationNow = async (): Promise<void> => {
  if (!state.initialized) {
    await disposeLastFmService();
    return;
  }

  if (state.statusListener) {
    getAudioSession().off('status', state.statusListener);
  }

  state.initialized = false;
  state.statusListener = null;
  await disposeLastFmService();
};

export const disposeLastFmIntegration = (): Promise<void> =>
  enqueueLifecycle(disposeLastFmIntegrationNow);

export const syncLastFmIntegrationFromSettings = async (
  settings: AppSettings = getAppSettings(),
): Promise<void> => {
  const enabled = settings.lastFmEnabled === true;
  await enqueueLifecycle(async () => {
    if (enabled) {
      initializeLastFmIntegration();
      return;
    }

    await disposeLastFmIntegrationNow();
  });
};
