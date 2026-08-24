import { describe, expect, it, vi } from 'vitest';
import {
  SteamAchievementService,
  SteamCloudProfileService,
  SteamEntitlementService,
  SteamPresenceService,
  steamAchievementIds,
  steamCloudProfileFileName,
} from './SteamCapabilityServices';
import type { SteamClient } from './SteamRuntimeService';

const createClient = (): SteamClient => ({
  achievement: {
    activate: vi.fn(() => true),
    isActivated: vi.fn(() => false),
  },
  apps: {
    isSubscribed: vi.fn(() => true),
    isSubscribedApp: vi.fn((appId: number) => appId === 654321),
    isDlcInstalled: vi.fn((appId: number) => appId === 654321),
  },
  cloud: {
    isEnabledForAccount: vi.fn(() => true),
    isEnabledForApp: vi.fn(() => true),
    fileExists: vi.fn(() => true),
    readFile: vi.fn(() => '{"theme":"dark"}'),
    writeFile: vi.fn(() => true),
  },
  localplayer: {
    setRichPresence: vi.fn(),
  },
} as unknown as SteamClient);

describe('Steam capability services', () => {
  it('publishes detailed track Rich Presence fields', () => {
    const client = createClient();
    const presence = new SteamPresenceService({ getClient: () => client });

    expect(presence.update({
      display: '#Status_PlayingTrack',
      status: 'Playing: Starlight - ECHO | Night Drive / 1:15 / 3:45',
      title: 'Starlight',
      artist: 'ECHO',
      details: 'Night Drive / 1:15 / 3:45',
    })).toBe(true);
    expect(client.localplayer.setRichPresence).toHaveBeenCalledWith('title', 'Starlight');
    expect(client.localplayer.setRichPresence).toHaveBeenCalledWith('artist', 'ECHO');
    expect(client.localplayer.setRichPresence).toHaveBeenCalledWith('details', 'Night Drive / 1:15 / 3:45');
    expect(client.localplayer.setRichPresence).toHaveBeenCalledWith('steam_display', '#Status_PlayingTrack');
  });

  it('clears every detailed Rich Presence field when disabled', () => {
    const client = createClient();
    const presence = new SteamPresenceService({ getClient: () => client });

    expect(presence.clear()).toBe(true);
    for (const key of ['steam_display', 'status', 'title', 'artist', 'details']) {
      expect(client.localplayer.setRichPresence).toHaveBeenCalledWith(key, null);
    }
  });

  it('clears partial fields when a Rich Presence write fails', () => {
    const client = createClient();
    const setRichPresence = vi.mocked(client.localplayer.setRichPresence);
    setRichPresence.mockImplementationOnce(() => undefined).mockImplementationOnce(() => {
      throw new Error('Steam rejected update');
    });
    const presence = new SteamPresenceService({ getClient: () => client });

    expect(presence.update({
      display: '#Status_PlayingTrack',
      status: 'Playing: Starlight - ECHO',
      title: 'Starlight',
      artist: 'ECHO',
      details: null,
    })).toBe(false);
    expect(setRichPresence).toHaveBeenCalledWith('steam_display', null);
  });

  it('uses a fixed achievement registry instead of renderer-provided names', () => {
    const client = createClient();
    const achievements = new SteamAchievementService({ getClient: () => client });

    expect(achievements.unlock('ECHO_FIRST_LOCAL_IMPORT')).toBe(true);
    expect(client.achievement.activate).toHaveBeenCalledWith('ECHO_FIRST_LOCAL_IMPORT');
    expect(steamAchievementIds).toContain('ECHO_FIRST_BIT_PERFECT');
    expect(steamAchievementIds).toContain('ECHO_STATS_YEARBOOK');
    expect(steamAchievementIds).toContain('ECHO_REVERSE_ALBUM');
    expect(steamAchievementIds).toContain('ECHO_TEN_SHORT_TRACKS');
    expect(steamAchievementIds).toContain('ECHO_DARK_SIDE_OF_THE_MOON');
    expect(steamAchievementIds).toContain('ECHO_PF_WISH_YOU_WERE_HERE');
    expect(steamAchievementIds).toContain('ECHO_PF_THE_WALL');
    expect(steamAchievementIds).toContain('ECHO_PF_ANIMALS');
    expect(steamAchievementIds).toContain('ECHO_PF_MEDDLE');
    expect(steamAchievementIds).toContain('ECHO_PF_DIVISION_BELL');
    expect(steamAchievementIds).toContain('ECHO_PF_ATOM_HEART_MOTHER');
    expect(steamAchievementIds).toContain('ECHO_PF_ECHOES');
    expect(steamAchievementIds).toContain('ECHO_PLAY_AGAIN');
    expect(steamAchievementIds).toContain('ECHO_FAVORITE_PART');
    expect(steamAchievementIds).toContain('ECHO_FLIP_SIDE');
    expect(steamAchievementIds).toContain('ECHO_SHUFFLE_FATE');
    expect(steamAchievementIds).toContain('ECHO_AFTER_CURTAIN');
    expect(steamAchievementIds).toContain('ECHO_FOUR_SEASONS');
    expect(steamAchievementIds).toContain('ECHO_COMPLETED_250');
    expect(steamAchievementIds).toContain('ECHO_COMPLETED_500');
    expect(steamAchievementIds).toContain('ECHO_COMPLETED_1000');
    expect(steamAchievementIds).toContain('ECHO_COMPLETED_2500');
    expect(steamAchievementIds).toContain('ECHO_COMPLETED_5000');
    expect(steamAchievementIds).toContain('ECHO_COMPLETED_10000');
    expect(steamAchievementIds).toContain('ECHO_REPEAT_ONE_FIVE');
    expect(steamAchievementIds).toContain('ECHO_TRACK_THREE_IN_DAY');
    expect(steamAchievementIds).toContain('ECHO_FIVE_GENRES_SESSION');
    expect(steamAchievementIds).toContain('ECHO_TEN_ARTISTS_SESSION');
    expect(steamAchievementIds).toContain('ECHO_GOLDEN_THREE_MINUTES');
    expect(steamAchievementIds).toContain('ECHO_PAUSE_NEAR_END');
    expect(steamAchievementIds).toContain('ECHO_UNINTERRUPTED_FOUR_MINUTES');
    expect(steamAchievementIds).toContain('ECHO_FIVE_COVERLESS');
    expect(steamAchievementIds).toContain('ECHO_MANUAL_QUEUE_THREE');
    expect(steamAchievementIds).toContain('ECHO_ONE_HOUR_SESSION');
    expect(steamAchievementIds).toContain('ECHO_THREE_DAY_TRACK_STREAK');
    expect(steamAchievementIds).toContain('ECHO_ALBUM_ALL_DAY');
    expect(steamAchievementIds).toContain('ECHO_ZHAO_XIAOLIU_HANDSOME');
    expect(steamAchievementIds).toContain('ECHO_THREE_AUDIO_FORMATS');
    expect(steamAchievementIds).toContain('ECHO_SHORT_AND_LONG');
    expect(steamAchievementIds).toContain('ECHO_VOLUME_SLIDE');
    expect(steamAchievementIds).toContain('ECHO_ALBUM_BOOKENDS');
    expect(steamAchievementIds).toContain('ECHO_EARLY_BIRD');
    expect(steamAchievementIds).toContain('ECHO_MIDNIGHT_THREE');
    expect(steamAchievementIds).toContain('ECHO_TEN_ALBUMS');
  });

  it('only reads and writes the dedicated versioned Cloud profile', () => {
    const client = createClient();
    const cloud = new SteamCloudProfileService({ getClient: () => client });

    expect(cloud.read()).toEqual({ theme: 'dark' });
    expect(cloud.write({ theme: 'light' })).toEqual({ ok: true });
    expect(client.cloud.readFile).toHaveBeenCalledWith(steamCloudProfileFileName);
    expect(client.cloud.writeFile).toHaveBeenCalledWith(steamCloudProfileFileName, '{"theme":"light"}');
  });

  it('fails entitlement checks closed when Steam is unavailable', () => {
    const entitlements = new SteamEntitlementService({ getClient: () => null });
    expect(entitlements.getSnapshot(654321)).toEqual({
      available: false,
      baseAppSubscribed: false,
      dlcOwned: null,
      dlcInstalled: null,
    });
  });

  it('uses DLC ownership as the entitlement fact without requiring a separate depot install', () => {
    const client = createClient();
    const entitlements = new SteamEntitlementService({ getClient: () => client });

    expect(entitlements.getSnapshot(654321)).toEqual({
      available: true,
      baseAppSubscribed: true,
      dlcOwned: true,
      dlcInstalled: true,
    });
    expect(client.apps.isSubscribedApp).toHaveBeenCalledWith(654321);
  });
});
