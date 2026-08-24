import { getCrashReportService } from '../../diagnostics/CrashReportService';
import { getLibraryService } from '../../library/LibraryService';
import { getAudioSession, getEqBridge, getPlaybackSessionStore } from '../../audioPublicApi';
import { getIntegrationEventHub } from '../core/IntegrationEventHub';
import { SteamAchievementCoordinator } from './SteamAchievementCoordinator';
import { SteamStartupAchievementCoordinator } from './SteamStartupAchievementCoordinator';
import { getSteamAchievementService } from './SteamworksService';

let coordinator: SteamAchievementCoordinator | null = null;
let startupCoordinator: SteamStartupAchievementCoordinator | null = null;

export const initializeSteamStartupAchievementIntegration = (): boolean => {
  if (startupCoordinator) {
    return true;
  }
  try {
    startupCoordinator = new SteamStartupAchievementCoordinator({
      achievements: getSteamAchievementService(),
      crashes: getCrashReportService(),
    });
    startupCoordinator.start();
    return true;
  } catch (error) {
    startupCoordinator?.dispose();
    startupCoordinator = null;
    console.warn('[Steamworks] Startup achievement integration failed to initialize', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    return false;
  }
};

export const initializeSteamAchievementIntegration = (): boolean => {
  initializeSteamStartupAchievementIntegration();
  if (coordinator) {
    return true;
  }

  try {
    coordinator = new SteamAchievementCoordinator({
      achievements: getSteamAchievementService(),
      events: getIntegrationEventHub(),
      audio: getAudioSession(),
      library: getLibraryService(),
      playbackSession: getPlaybackSessionStore(),
      eq: getEqBridge(),
    });
    coordinator.start();
    return true;
  } catch (error) {
    coordinator?.dispose();
    coordinator = null;
    console.warn('[Steamworks] Achievement integration failed to initialize', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    return false;
  }
};

export const disposeSteamAchievementIntegration = (): void => {
  coordinator?.dispose();
  coordinator = null;
  startupCoordinator?.dispose();
  startupCoordinator = null;
};
