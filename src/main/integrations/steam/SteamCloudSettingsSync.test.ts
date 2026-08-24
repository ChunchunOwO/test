import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings } from '../../../shared/types/appSettings';

vi.mock('electron', () => ({ app: { getVersion: () => 'test' } }));
vi.mock('./SteamworksService', () => ({
  getSteamCloudProfileService: vi.fn(),
  getSteamStatus: vi.fn(() => ({ cloudEnabled: true })),
}));

import {
  createPortableSteamCloudSettings,
  SteamCloudSettingsSyncService,
} from './SteamCloudSettingsSync';

const createSettings = (overrides: Partial<AppSettings> = {}): AppSettings => ({
  appearanceTheme: 'dark',
  albumMergeStrategy: 'standard',
  artistWallAlbumArtwork: true,
  coverCacheDir: 'D:\\ECHO\\covers',
  hideToTrayOnClose: true,
  appCustomWallpaperPath: 'D:\\Pictures\\private.png',
  appWallpaperScalePercent: 100,
  appWallpaperBlurPx: 0,
  appWallpaperBrightnessPercent: 100,
  appWallpaperUiOpacityPercent: 100,
  appWallpaperUnifiedOpacityEnabled: true,
  networkMetadataEnabled: true,
  networkMetadataProviders: [],
  lyricsNetworkEnabled: true,
  lyricsPreferredProvider: 'lrclib',
  lyricsProviderOrder: [],
  lyricsDeepSearchEnabled: false,
  lyricsAutoSearch: true,
  lyricsAutoAcceptScore: 0.8,
  lyricsDefaultOffsetMs: 0,
  lyricsGlobalSyncOffsetMs: 0,
  lyricsEnabled: true,
  lyricsHeaderHidden: false,
  lyricsEmptyStateHidden: false,
  lyricsRomanizationEnabled: true,
  lyricsTranslationEnabled: true,
  lyricsFontSizePx: 32,
  lyricsColor: '#ffffff',
  lyricsBackgroundMode: 'theme',
  lyricsCustomWallpaperPath: 'D:\\Pictures\\lyrics.png',
  lyricsCoverOpacityPercent: 100,
  lyricsCoverBlurPx: 0,
  lyricsCoverBrightnessPercent: 100,
  lyricsBackgroundScalePercent: 100,
  desktopLyricsEnabled: false,
  desktopLyricsLocked: false,
  desktopLyricsFontSizePx: 32,
  desktopLyricsScalePercent: 100,
  desktopLyricsFontFamily: 'system-ui',
  desktopLyricsColorMode: 'theme',
  desktopLyricsColor: '#ffffff',
  desktopLyricsStrokeColor: '#000000',
  desktopLyricsGradientStartColor: '#ffffff',
  desktopLyricsGradientEndColor: '#ffffff',
  desktopLyricsOpacityPercent: 100,
  desktopLyricsTextDirection: 'horizontal',
  desktopLyricsRomanizationEnabled: true,
  desktopLyricsTranslationEnabled: true,
  desktopLyricsHideWhenNoLyricsEnabled: false,
  miniPlayerEnabled: false,
  miniPlayerLocked: false,
  miniPlayerAutoHideMainWindow: false,
  petEnabled: false,
  petScalePercent: 100,
  playerVolume: 0.8,
  channelBalance: { enabled: false, leftGain: 1, rightGain: 1 },
  ...overrides,
} as unknown as AppSettings);

const createHarness = () => {
  let stored: Record<string, unknown> | null = null;
  const profile = {
    read: vi.fn(() => stored),
    write: vi.fn((value: Record<string, unknown>) => {
      stored = value;
      return { ok: true } as const;
    }),
  };
  const service = new SteamCloudSettingsSyncService({
    profile,
    getCloudEnabled: () => true,
    getAppVersion: () => '1.2.3',
    now: () => new Date('2026-08-14T04:00:00.000Z'),
  });
  return { profile, service, getStored: () => stored };
};

describe('Steam Cloud settings sync', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps portable preferences and strips local hardware, paths, endpoints, and credentials', () => {
    const portable = createPortableSteamCloudSettings(createSettings({
      rememberedAudioOutput: { enabled: true, outputMode: 'asio', deviceName: 'Private DAC' },
      networkProxyUrl: 'http://user:password@localhost:8080',
      mqttBrokerUrl: 'mqtt://private-host:1883',
      onlineArtistInfoTicketmasterApiKey: 'private-api-key',
      lastFmSessionKey: 'secret-session',
      steamListeningStatsEnabled: true,
      steamLeaderboardsEnabled: true,
    }));

    expect(portable.appearanceTheme).toBe('dark');
    expect(portable.playerVolume).toBe(0.8);
    expect(portable.rememberedAudioOutput).toBeUndefined();
    expect(portable.coverCacheDir).toBeUndefined();
    expect(portable.appCustomWallpaperPath).toBeUndefined();
    expect(portable.lyricsCustomWallpaperPath).toBeUndefined();
    expect(portable.networkProxyUrl).toBeUndefined();
    expect(portable.mqttBrokerUrl).toBeUndefined();
    expect(portable.onlineArtistInfoTicketmasterApiKey).toBeUndefined();
    expect(portable.lastFmSessionKey).toBeUndefined();
    expect(portable.steamListeningStatsEnabled).toBeUndefined();
    expect(portable.steamLeaderboardsEnabled).toBeUndefined();
  });

  it('writes a versioned integrity-checked snapshot', () => {
    const { getStored, service } = createHarness();

    expect(service.upload(createSettings())).toMatchObject({ uploaded: true, available: true });
    expect(getStored()).toMatchObject({
      format: 'echo-steam-cloud-settings',
      version: 1,
      updatedAt: '2026-08-14T04:00:00.000Z',
      appVersion: '1.2.3',
    });
    expect(getStored()?.digest).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('applies a newer cloud snapshot but preserves machine-local settings', async () => {
    const { service } = createHarness();
    service.upload(createSettings({ appearanceTheme: 'light', playerVolume: 0.4 }));
    const applySettings = vi.fn(async (patch: Partial<AppSettings>) => createSettings({
      ...patch,
      coverCacheDir: 'E:\\LocalCache',
    }));

    const result = await service.downloadAndApply(applySettings);

    expect(result.applied).toBe(true);
    expect(applySettings).toHaveBeenCalledWith(expect.objectContaining({ appearanceTheme: 'light', playerVolume: 0.4 }));
    expect(applySettings.mock.calls[0]?.[0].coverCacheDir).toBeUndefined();
    expect(result.settings?.coverCacheDir).toBe('E:\\LocalCache');
  });

  it('uploads local preferences when they are newer than a different cloud snapshot', () => {
    const { profile, service } = createHarness();
    service.upload(createSettings({ appearanceTheme: 'light' }));
    profile.write.mockClear();

    service.reconcileAtStartup({
      getSettings: () => createSettings({ appearanceTheme: 'dark' }),
      getLocalUpdatedAt: () => '2026-08-14T05:00:00.000Z',
      applySettings: vi.fn((settings) => createSettings(settings)),
    });

    expect(profile.write).toHaveBeenCalledTimes(1);
  });

  it('retries startup reconciliation when Steam becomes available after app startup', async () => {
    vi.useFakeTimers();
    let cloudEnabled: boolean | null = null;
    let stored: Record<string, unknown> | null = null;
    const profile = {
      read: vi.fn(() => stored),
      write: vi.fn((value: Record<string, unknown>) => {
        stored = value;
        return { ok: true } as const;
      }),
    };
    const service = new SteamCloudSettingsSyncService({
      profile,
      getCloudEnabled: () => cloudEnabled,
      getAppVersion: () => '1.2.3',
      now: () => new Date('2026-08-14T04:00:00.000Z'),
    });

    const initial = service.reconcileAtStartup({
      getSettings: () => createSettings({ appearanceTheme: 'light' }),
      getLocalUpdatedAt: () => null,
      applySettings: vi.fn((settings) => createSettings(settings)),
    });

    expect(initial).toMatchObject({ syncState: 'retrying', retryCount: 1, lastError: 'unavailable' });
    expect(initial.nextRetryAt).toBe('2026-08-14T04:00:05.000Z');

    cloudEnabled = true;
    await vi.advanceTimersByTimeAsync(5_000);

    expect(profile.write).toHaveBeenCalledTimes(1);
    expect(service.getStatus()).toMatchObject({ syncState: 'synced', retryCount: 0, lastError: null });
    service.dispose();
  });
});
