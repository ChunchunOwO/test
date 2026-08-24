import type { SteamStatus } from '../../../shared/types/steam';
import { createSteamCapabilityServices } from './SteamCapabilityServices';
import { SteamRuntimeService } from './SteamRuntimeService';

const runtime = new SteamRuntimeService();
const capabilities = createSteamCapabilityServices(runtime);

/** Compatibility facade for startup and IPC. Steam SDK ownership stays in main. */
export const initializeSteamworks = (): SteamStatus => {
  const status = runtime.initialize();
  capabilities.listenTogetherProbe.initialize();
  capabilities.listenTogether.initialize();
  return status;
};

export const getSteamStatus = (): SteamStatus => runtime.getStatus();

export const getSteamCurrentGameLanguage = (): string | null => runtime.getCurrentGameLanguage();

export const hasSteamworksClient = (): boolean => runtime.hasClient();

export const getSteamPresenceService = () => capabilities.presence;

export const getSteamAchievementService = () => capabilities.achievements;

export const getSteamCloudProfileService = () => capabilities.cloudProfile;

export const getSteamEntitlementService = () => capabilities.entitlements;

export const getSteamListeningStatsService = () => capabilities.listeningStats;

export const getSteamLeaderboardService = () => capabilities.leaderboards;

export const getSteamWorkshopService = () => capabilities.workshop;

export const getSteamListenTogetherProbeService = () => capabilities.listenTogetherProbe;

export const getSteamListenTogetherService = () => capabilities.listenTogether;

export const disposeSteamListenTogetherProbeService = (): void => {
  capabilities.listenTogetherProbe.dispose();
  capabilities.listenTogether.dispose();
};
