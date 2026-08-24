import type { AudioStatus } from '../../../shared/types/audio';
import type { AppSettings } from '../../../shared/types/appSettings';
import type { SteamRichPresenceStatus } from '../../../shared/types/steam';
import { getAppSettings } from '../../app/appSettings';
import { getAudioSession } from '../../audio/AudioSession';
import type { SteamRichPresenceSnapshot } from './SteamCapabilityServices';
import {
  createSteamRichPresenceSnapshot,
  resolveSteamRichPresencePolicy,
  type SteamRichPresencePolicy,
} from './SteamRichPresencePolicy';
import { isSteamMidnightListeningHour } from './SteamRichPresenceCopy';
import { collectSteamPresenceExtras } from './SteamRichPresenceFlavor';
import { getSteamPresenceService } from './SteamworksService';

type SteamPresenceSyncState = {
  initialized: boolean;
  statusListener: ((status: AudioStatus) => void) | null;
  lastSignature: string | null;
  policy: SteamRichPresencePolicy;
  publicationState: SteamRichPresenceStatus['publicationState'];
  preview: string | null;
  lastPublishedAt: string | null;
  lastError: SteamRichPresenceStatus['lastError'];
};

const state: SteamPresenceSyncState = {
  initialized: false,
  statusListener: null,
  lastSignature: null,
  policy: {
    mode: 'detailed', preset: 'music', locale: 'en-US',
    showAlbum: true, showProgress: true,
    showGenre: false, showPlaybackOrder: false,
    showBpm: false, showQuality: false, showFormat: false, showBitPerfect: false,
  },
  publicationState: 'waiting',
  preview: null,
  lastPublishedAt: null,
  lastError: null,
};

let lifecycleQueue: Promise<void> = Promise.resolve();

const enqueueLifecycle = (operation: () => Promise<void>): Promise<void> => {
  const queued = lifecycleQueue.catch(() => undefined).then(operation);
  lifecycleQueue = queued.catch(() => undefined);
  return queued;
};

const createSignature = (status: AudioStatus, snapshot: SteamRichPresenceSnapshot): string => JSON.stringify([
  snapshot.display,
  snapshot.title,
  snapshot.artist,
  snapshot.details,
  state.policy.locale,
  state.policy.showAlbum,
  state.policy.showProgress,
  state.policy.showGenre,
  state.policy.showPlaybackOrder,
  state.policy.showBpm,
  state.policy.showQuality,
  state.policy.showFormat,
  state.policy.showBitPerfect,
  state.policy.preset,
  state.policy.showProgress ? Math.floor(Math.max(0, status.positionSeconds || 0) / 15) : null,
  Math.floor(Math.max(0, status.durationSeconds || 0)),
  (state.policy.mode === 'basic' || state.policy.preset === 'privacy') && isSteamMidnightListeningHour(new Date()),
]);

export const syncSteamRichPresenceStatus = (status: AudioStatus = getAudioSession().getStatus()): void => {
  const now = new Date();
  const extras = collectSteamPresenceExtras(status, state.policy);
  const snapshot = createSteamRichPresenceSnapshot(status, state.policy, now, extras);
  state.preview = snapshot.status;
  const signature = createSignature(status, snapshot);
  if (signature === state.lastSignature) {
    return;
  }

  if (getSteamPresenceService().update(snapshot)) {
    state.lastSignature = signature;
    state.publicationState = 'published';
    state.lastPublishedAt = new Date().toISOString();
    state.lastError = null;
  } else {
    state.publicationState = 'error';
    state.lastError = 'write_failed';
  }
};

export const getSteamRichPresenceStatus = (): SteamRichPresenceStatus => ({
  mode: state.policy.mode,
  preset: state.policy.preset,
  enabled: state.policy.mode !== 'off',
  showAlbum: state.policy.showAlbum,
  showProgress: state.policy.showProgress,
  showGenre: state.policy.showGenre,
  showPlaybackOrder: state.policy.showPlaybackOrder,
  showBpm: state.policy.showBpm,
  showQuality: state.policy.showQuality,
  showFormat: state.policy.showFormat,
  showBitPerfect: state.policy.showBitPerfect,
  publicationState: state.publicationState,
  preview: state.preview,
  lastPublishedAt: state.lastPublishedAt,
  lastError: state.lastError,
});

export const initializeSteamRichPresenceIntegration = async (policy: SteamRichPresencePolicy): Promise<void> => {
  state.policy = policy;
  if (state.initialized) {
    state.lastSignature = null;
    syncSteamRichPresenceStatus(getAudioSession().getStatus());
    return;
  }

  state.statusListener = (status: AudioStatus) => syncSteamRichPresenceStatus(status);
  getAudioSession().on('status', state.statusListener);
  state.initialized = true;
  state.lastSignature = null;
  state.publicationState = 'waiting';
  state.lastError = null;
  syncSteamRichPresenceStatus(getAudioSession().getStatus());
};

const disposeSteamRichPresenceIntegrationNow = async (): Promise<void> => {
  if (state.statusListener) {
    getAudioSession().off('status', state.statusListener);
  }
  state.initialized = false;
  state.statusListener = null;
  state.lastSignature = null;
  state.publicationState = 'disabled';
  state.preview = null;
  state.lastError = null;
  getSteamPresenceService().clear();
};

export const disposeSteamRichPresenceIntegration = (): Promise<void> =>
  enqueueLifecycle(disposeSteamRichPresenceIntegrationNow);

export const syncSteamRichPresenceIntegrationFromSettings = (
  settings: AppSettings = getAppSettings(),
): Promise<void> => enqueueLifecycle(async () => {
  const policy = resolveSteamRichPresencePolicy(settings);
  if (policy.mode !== 'off') {
    await initializeSteamRichPresenceIntegration(policy);
    return;
  }
  state.policy = policy;
  await disposeSteamRichPresenceIntegrationNow();
});
