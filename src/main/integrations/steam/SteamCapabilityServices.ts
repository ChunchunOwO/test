import type { SteamClient } from './SteamRuntimeService';
import type { SteamRuntimeService } from './SteamRuntimeService';
import { SteamWorkshopService } from './SteamWorkshopService';
import { SteamLeaderboardService } from './SteamLeaderboardService';
import { SteamListeningStatsService } from './SteamListeningStatsService';
import { SteamListenTogetherProbeService } from './SteamListenTogetherProbeService';
import { SteamListenTogetherService } from './SteamListenTogetherService';

type SteamClientProvider = Pick<SteamRuntimeService, 'getClient'>;

export type SteamPresenceMode = 'idle' | 'browsing-library' | 'playing-local-music';

export type SteamRichPresenceSnapshot = {
  display:
    | '#Status_Idle'
    | '#Status_BrowsingLibrary'
    | '#Status_LoadingLocalMusic'
    | '#Status_PlayingLocalMusic'
    | '#Status_PlayingLocalMusicNight'
    | '#Status_PausedLocalMusic'
    | '#Status_LoadingTrack'
    | '#Status_PlayingTrack'
    | '#Status_PausedTrack'
    | '#Status_LoadingTrackDetails'
    | '#Status_PlayingTrackDetails'
    | '#Status_PausedTrackDetails';
  status: string;
  title: string | null;
  artist: string | null;
  details: string | null;
};

const richPresenceKeys = [
  'steam_display', 'status', 'title', 'artist', 'details',
  'connect', 'steam_player_group', 'steam_player_group_size',
] as const;

const presenceByMode: Record<SteamPresenceMode, { display: string; status: string }> = {
  idle: { display: '#Status_Idle', status: 'In the listening room' },
  'browsing-library': { display: '#Status_BrowsingLibrary', status: 'In the library' },
  'playing-local-music': { display: '#Status_PlayingLocalMusic', status: 'Listening to local music' },
};

export class SteamPresenceService {
  constructor(private readonly runtime: SteamClientProvider) {}

  update(snapshot: SteamRichPresenceSnapshot): boolean {
    const client = this.runtime.getClient();
    if (!client) {
      return false;
    }

    try {
      client.localplayer.setRichPresence('title', snapshot.title);
      client.localplayer.setRichPresence('artist', snapshot.artist);
      client.localplayer.setRichPresence('details', snapshot.details);
      client.localplayer.setRichPresence('steam_display', snapshot.display);
      client.localplayer.setRichPresence('status', snapshot.status);
      return true;
    } catch {
      this.clear();
      return false;
    }
  }

  setMode(mode: SteamPresenceMode): boolean {
    const client = this.runtime.getClient();
    if (!client) {
      return false;
    }

    try {
      const presence = presenceByMode[mode];
      client.localplayer.setRichPresence('steam_display', presence.display);
      client.localplayer.setRichPresence('status', presence.status);
      return true;
    } catch {
      return false;
    }
  }

  clear(): boolean {
    const client = this.runtime.getClient();
    if (!client) {
      return false;
    }

    try {
      for (const key of richPresenceKeys) {
        client.localplayer.setRichPresence(key, null);
      }
      return true;
    } catch {
      return false;
    }
  }
}

export const steamAchievementIds = [
  'ECHO_FIRST_LAUNCH',
  'ECHO_FIRST_LOCAL_IMPORT',
  'ECHO_LIBRARY_OVER_500',
  'ECHO_MIDNIGHT_LISTENER',
  'ECHO_FIRST_CRASH_RECOVERY',
  'ECHO_FIRST_BIT_PERFECT',
  'ECHO_LONG_TRACK',
  'ECHO_FULL_ALBUM',
  'ECHO_FIRST_GAPLESS',
  'ECHO_LONG_TIME_NO_SEE',
  'ECHO_CONTINUOUS_PLAY_FIVE',
  'ECHO_CUSTOM_EQ_TRACK',
  'ECHO_STATS_LISTENING_100_HOURS',
  'ECHO_STATS_100_COMPLETED_TRACKS',
  'ECHO_STATS_SEVEN_DAY_STREAK',
  'ECHO_STATS_NIGHT_5_HOURS',
  'ECHO_STATS_FAVORITE_ALBUM',
  'ECHO_STATS_YEARBOOK',
  'ECHO_OLD_UNPLAYED_TREASURE',
  'ECHO_SAME_TITLE_DIFFERENT_ARTIST',
  'ECHO_FIVE_DECADES_SESSION',
  'ECHO_REVERSE_ALBUM',
  'ECHO_MIDNIGHT_BRIDGE',
  'ECHO_TEN_SHORT_TRACKS',
  'ECHO_DARK_SIDE_OF_THE_MOON',
  'ECHO_PF_WISH_YOU_WERE_HERE',
  'ECHO_PF_THE_WALL',
  'ECHO_PF_ANIMALS',
  'ECHO_PF_MEDDLE',
  'ECHO_PF_DIVISION_BELL',
  'ECHO_PF_ATOM_HEART_MOTHER',
  'ECHO_PF_ECHOES',
  'ECHO_PLAY_AGAIN',
  'ECHO_FAVORITE_PART',
  'ECHO_FLIP_SIDE',
  'ECHO_SHUFFLE_FATE',
  'ECHO_AFTER_CURTAIN',
  'ECHO_FOUR_SEASONS',
  'ECHO_COMPLETED_250',
  'ECHO_COMPLETED_500',
  'ECHO_COMPLETED_1000',
  'ECHO_COMPLETED_2500',
  'ECHO_COMPLETED_5000',
  'ECHO_COMPLETED_10000',
  'ECHO_REPEAT_ONE_FIVE',
  'ECHO_TRACK_THREE_IN_DAY',
  'ECHO_FIVE_GENRES_SESSION',
  'ECHO_TEN_ARTISTS_SESSION',
  'ECHO_GOLDEN_THREE_MINUTES',
  'ECHO_PAUSE_NEAR_END',
  'ECHO_UNINTERRUPTED_FOUR_MINUTES',
  'ECHO_FIVE_COVERLESS',
  'ECHO_MANUAL_QUEUE_THREE',
  'ECHO_ONE_HOUR_SESSION',
  'ECHO_THREE_DAY_TRACK_STREAK',
  'ECHO_ALBUM_ALL_DAY',
  'ECHO_ZHAO_XIAOLIU_HANDSOME',
  'ECHO_THREE_AUDIO_FORMATS',
  'ECHO_SHORT_AND_LONG',
  'ECHO_VOLUME_SLIDE',
  'ECHO_ALBUM_BOOKENDS',
  'ECHO_EARLY_BIRD',
  'ECHO_MIDNIGHT_THREE',
  'ECHO_TEN_ALBUMS',
] as const;
export type SteamAchievementId = (typeof steamAchievementIds)[number];

export class SteamAchievementService {
  constructor(private readonly runtime: SteamClientProvider) {}

  unlock(achievement: SteamAchievementId): boolean {
    try {
      return this.runtime.getClient()?.achievement.activate(achievement) ?? false;
    } catch {
      return false;
    }
  }

  isUnlocked(achievement: SteamAchievementId): boolean | null {
    const client = this.runtime.getClient();
    try {
      return client ? client.achievement.isActivated(achievement) : null;
    } catch {
      return null;
    }
  }
}

export const steamCloudProfileFileName = 'echo-steam-settings-v1.json';
const maxSteamCloudProfileBytes = 1024 * 1024;

export type SteamCloudWriteResult =
  | { ok: true }
  | { ok: false; reason: 'unavailable' | 'disabled' | 'invalid_profile' | 'profile_too_large' | 'write_failed' };

export class SteamCloudProfileService {
  constructor(private readonly runtime: SteamClientProvider) {}

  read(): Record<string, unknown> | null {
    const client = this.getEnabledClient();
    if (!client || !client.cloud.fileExists(steamCloudProfileFileName)) {
      return null;
    }

    try {
      const value = JSON.parse(client.cloud.readFile(steamCloudProfileFileName)) as unknown;
      return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }

  write(profile: Record<string, unknown>): SteamCloudWriteResult {
    const client = this.runtime.getClient();
    if (!client) {
      return { ok: false, reason: 'unavailable' };
    }
    try {
      if (!client.cloud.isEnabledForAccount() || !client.cloud.isEnabledForApp()) {
        return { ok: false, reason: 'disabled' };
      }
    } catch {
      return { ok: false, reason: 'unavailable' };
    }

    let serialized: string;
    try {
      serialized = JSON.stringify(profile);
    } catch {
      return { ok: false, reason: 'invalid_profile' };
    }
    if (Buffer.byteLength(serialized, 'utf8') > maxSteamCloudProfileBytes) {
      return { ok: false, reason: 'profile_too_large' };
    }

    try {
      return client.cloud.writeFile(steamCloudProfileFileName, serialized)
        ? { ok: true }
        : { ok: false, reason: 'write_failed' };
    } catch {
      return { ok: false, reason: 'write_failed' };
    }
  }

  private getEnabledClient(): SteamClient | null {
    const client = this.runtime.getClient();
    try {
      return client?.cloud.isEnabledForAccount() && client.cloud.isEnabledForApp() ? client : null;
    } catch {
      return null;
    }
  }
}

export type SteamEntitlementSnapshot = {
  available: boolean;
  baseAppSubscribed: boolean;
  dlcOwned: boolean | null;
  dlcInstalled: boolean | null;
};

export class SteamEntitlementService {
  constructor(private readonly runtime: SteamClientProvider) {}

  getSnapshot(dlcAppId?: number): SteamEntitlementSnapshot {
    const client = this.runtime.getClient();
    if (!client) {
      return { available: false, baseAppSubscribed: false, dlcOwned: null, dlcInstalled: null };
    }

    const validDlcAppId = typeof dlcAppId === 'number' && Number.isSafeInteger(dlcAppId) && dlcAppId > 0
      ? dlcAppId
      : null;
    try {
      return {
        available: true,
        baseAppSubscribed: client.apps.isSubscribed(),
        dlcOwned: validDlcAppId === null ? null : client.apps.isSubscribedApp(validDlcAppId),
        dlcInstalled: validDlcAppId === null ? null : client.apps.isDlcInstalled(validDlcAppId),
      };
    } catch {
      return { available: false, baseAppSubscribed: false, dlcOwned: null, dlcInstalled: null };
    }
  }
}

export type SteamCapabilityServices = {
  presence: SteamPresenceService;
  achievements: SteamAchievementService;
  cloudProfile: SteamCloudProfileService;
  entitlements: SteamEntitlementService;
  listeningStats: SteamListeningStatsService;
  leaderboards: SteamLeaderboardService;
  workshop: SteamWorkshopService;
  listenTogetherProbe: SteamListenTogetherProbeService;
  listenTogether: SteamListenTogetherService;
};

export const createSteamCapabilityServices = (runtime: SteamRuntimeService): SteamCapabilityServices => ({
  presence: new SteamPresenceService(runtime),
  achievements: new SteamAchievementService(runtime),
  cloudProfile: new SteamCloudProfileService(runtime),
  entitlements: new SteamEntitlementService(runtime),
  listeningStats: new SteamListeningStatsService({ runtime }),
  leaderboards: new SteamLeaderboardService({ runtime }),
  workshop: new SteamWorkshopService(runtime),
  listenTogetherProbe: new SteamListenTogetherProbeService(runtime),
  listenTogether: new SteamListenTogetherService(runtime),
});
