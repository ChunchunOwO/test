import { getAppSettings } from '../../app/appSettings';
import { getLibraryService } from '../../library/LibraryService';
import { getSteamListeningStatsService } from './SteamworksService';

const syncIntervalMs = 10 * 60 * 1000;
const retryDelaysMs = [5_000, 15_000, 60_000, 5 * 60_000] as const;
let syncTimer: ReturnType<typeof setInterval> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryCount = 0;
let activeSync: ReturnType<typeof runSteamListeningStatsSync> | null = null;
let disposed = false;

const getEnabled = (): boolean => getAppSettings().steamListeningStatsEnabled === true;

const clearRetryTimer = (): void => {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
};

const scheduleRetry = (): void => {
  if (disposed || retryTimer) return;
  const delay = retryDelaysMs[Math.min(retryCount, retryDelaysMs.length - 1)];
  retryCount += 1;
  const nextRetryAt = new Date(Date.now() + delay).toISOString();
  getSteamListeningStatsService().setRetryState(getEnabled(), nextRetryAt, retryCount);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void syncSteamListeningStatsNow({ preserveRetryCount: true });
  }, delay);
  retryTimer.unref?.();
};

export const getSteamListeningStatsStatus = (
  enabled = getEnabled(),
) => {
  try {
    return getSteamListeningStatsService().preview(
      getLibraryService().getSteamLeaderboardHistoryStats(),
      enabled,
    );
  } catch {
    return getSteamListeningStatsService().getStatus(enabled);
  }
};

const runSteamListeningStatsSync = async () => {
  const enabled = getEnabled();
  try {
    const status = await getSteamListeningStatsService().sync(
      getLibraryService().getSteamLeaderboardHistoryStats(),
      enabled,
    );
    if (status.lastError) {
      scheduleRetry();
      return getSteamListeningStatsService().getStatus(enabled);
    }
    clearRetryTimer();
    retryCount = 0;
    getSteamListeningStatsService().setRetryState(enabled, null, 0);
    return status;
  } catch {
    scheduleRetry();
    return getSteamListeningStatsService().getStatus(enabled);
  }
};

export const syncSteamListeningStatsNow = (options: { preserveRetryCount?: boolean } = {}) => {
  if (activeSync) return activeSync;
  disposed = false;
  clearRetryTimer();
  if (!options.preserveRetryCount) retryCount = 0;
  const operation = runSteamListeningStatsSync();
  activeSync = operation;
  operation.then(
    () => { if (activeSync === operation) activeSync = null; },
    () => { if (activeSync === operation) activeSync = null; },
  );
  return operation;
};

export const initializeSteamListeningStatsIntegration = (): void => {
  if (syncTimer) return;
  disposed = false;
  void syncSteamListeningStatsNow();
  syncTimer = setInterval(() => void syncSteamListeningStatsNow(), syncIntervalMs);
  syncTimer.unref?.();
};

export const disposeSteamListeningStatsIntegration = (): void => {
  disposed = true;
  if (syncTimer) clearInterval(syncTimer);
  clearRetryTimer();
  syncTimer = null;
};
