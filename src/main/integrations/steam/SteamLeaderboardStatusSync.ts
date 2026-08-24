import { getAppSettings } from '../../app/appSettings';
import { getLibraryService } from '../../library/LibraryService';
import { getSteamLeaderboardService } from './SteamworksService';

const syncIntervalMs = 10 * 60 * 1000;
let syncTimer: ReturnType<typeof setInterval> | null = null;

export const syncSteamLeaderboardsNow = async () => {
  const enabled = getAppSettings().steamLeaderboardsEnabled === true;
  if (!enabled) return getSteamLeaderboardService().getStatus(false);
  try {
    return await getSteamLeaderboardService().sync(
      getLibraryService().getSteamLeaderboardHistoryStats(),
      true,
    );
  } catch {
    return getSteamLeaderboardService().getStatus(true);
  }
};

export const initializeSteamLeaderboardIntegration = (): void => {
  if (syncTimer) return;
  void syncSteamLeaderboardsNow();
  syncTimer = setInterval(() => void syncSteamLeaderboardsNow(), syncIntervalMs);
  syncTimer.unref?.();
};

export const disposeSteamLeaderboardIntegration = (): void => {
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = null;
};
