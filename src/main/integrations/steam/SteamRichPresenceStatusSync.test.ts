import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioStatus } from '../../../shared/types/audio';
import {
  getSteamRichPresenceStatus,
  syncSteamRichPresenceStatus,
  syncSteamRichPresenceIntegrationFromSettings,
} from './SteamRichPresenceStatusSync';
import { createSteamRichPresenceSnapshot, resolveSteamRichPresencePolicy } from './SteamRichPresencePolicy';
import type { SteamRichPresencePolicy } from './SteamRichPresencePolicy';

const integrationMocks = vi.hoisted(() => ({
  audioSession: {
    getStatus: vi.fn(() => ({
      state: 'stopped',
      positionSeconds: 0,
      durationSeconds: 0,
    })),
    on: vi.fn(),
    off: vi.fn(),
  },
  update: vi.fn(() => true),
  clear: vi.fn(),
}));

vi.mock('../../app/appSettings', () => ({
  getAppSettings: vi.fn(() => ({ steamRichPresenceEnabled: true })),
}));

vi.mock('../../audio/AudioSession', () => ({
  getAudioSession: vi.fn(() => integrationMocks.audioSession),
}));

vi.mock('./SteamworksService', () => ({
  getSteamPresenceService: vi.fn(() => ({
    update: integrationMocks.update,
    clear: integrationMocks.clear,
  })),
}));

vi.mock('../../lyrics/LyricsProgressTracker', () => ({
  getCurrentLyricsProgress: vi.fn(() => null),
}));

vi.mock('../../library/LibraryService', () => ({
  getLibraryService: vi.fn(() => ({ getTrack: vi.fn(() => null) })),
}));

vi.mock('../../audio/PlaybackSessionStore', () => ({
  getPlaybackSessionStore: vi.fn(() => ({ load: vi.fn(() => null) })),
}));

const createStatus = (overrides: Partial<AudioStatus> = {}): AudioStatus => ({
  state: 'playing',
  currentTrackTitle: 'Starlight',
  currentTrackArtist: 'ECHO',
  currentTrackAlbum: 'Night Drive',
  currentTrackAlbumArtist: null,
  currentFilePath: 'C:\\Users\\listener\\Private Music\\secret.flac',
  positionSeconds: 75,
  durationSeconds: 225,
  ...overrides,
} as AudioStatus);

const policy = (overrides: Partial<SteamRichPresencePolicy> = {}): SteamRichPresencePolicy => ({
  mode: 'detailed', preset: 'music', locale: 'en-US', showAlbum: true, showProgress: true,
  showGenre: false, showPlaybackOrder: false, showBpm: false, showQuality: false, showFormat: false, showBitPerfect: false, ...overrides,
});

const atHour = (hour: number): Date => {
  const date = new Date('2026-08-13T12:00:00');
  date.setHours(hour, 15, 0, 0);
  return date;
};

describe('SteamRichPresenceStatusSync', () => {
  beforeEach(async () => {
    integrationMocks.update.mockReset().mockReturnValue(true);
    integrationMocks.clear.mockClear();
    integrationMocks.audioSession.on.mockClear();
    integrationMocks.audioSession.off.mockClear();
    await syncSteamRichPresenceIntegrationFromSettings({ steamRichPresenceMode: 'off' } as never);
    integrationMocks.clear.mockClear();
  });

  it('defaults every detailed field on while preserving explicit opt-outs', () => {
    expect(resolveSteamRichPresencePolicy({ steamRichPresenceEnabled: true } as never)).toEqual({
      mode: 'detailed',
      preset: 'music',
      locale: 'en-US',
      showAlbum: true,
      showProgress: true,
      showGenre: false,
      showPlaybackOrder: false,
      showBpm: false,
      showQuality: false,
      showFormat: false,
      showBitPerfect: false,
    });
    expect(resolveSteamRichPresencePolicy({
      steamRichPresenceMode: 'detailed',
      steamRichPresenceShowAlbum: false,
      steamRichPresenceShowProgress: false,
    } as never)).toEqual(policy({ showAlbum: false, showProgress: false }));
  });

  it('uses privacy-safe playback activity in basic mode', () => {
    expect(createSteamRichPresenceSnapshot(createStatus(), policy({ mode: 'basic', preset: 'privacy', showAlbum: false, showProgress: false }), atHour(15))).toEqual({
      display: '#Status_PlayingLocalMusic',
      status: 'Listening to local music',
      title: null,
      artist: null,
      details: null,
    });
  });

  it('shares title and artist only unless detailed fields are explicitly enabled', () => {
    expect(createSteamRichPresenceSnapshot(createStatus(), policy({ showAlbum: false, showProgress: false }))).toEqual({
      display: '#Status_PlayingTrack',
      status: 'Starlight — ECHO',
      title: 'Starlight',
      artist: 'ECHO',
      details: null,
    });

    expect(createSteamRichPresenceSnapshot(createStatus(), policy())).toMatchObject({
      display: '#Status_PlayingTrackDetails',
      details: 'Night Drive · 1:15 / 3:45',
    });
  });

  it('never falls back to the local file path when metadata is missing', () => {
    const snapshot = createSteamRichPresenceSnapshot(createStatus({
      currentTrackTitle: null,
      currentTrackArtist: null,
      currentTrackAlbum: null,
    }), policy({ showProgress: false }));

    expect(snapshot.title).toBe('Unknown track');
    expect(snapshot.status).not.toContain('Private Music');
    expect(JSON.stringify(snapshot)).not.toContain('secret.flac');
  });

  it('clears stale track fields outside active playback states', () => {
    expect(createSteamRichPresenceSnapshot(createStatus({ state: 'stopped' }), policy())).toEqual({
      display: '#Status_BrowsingLibrary',
      status: 'In the library',
      title: null,
      artist: null,
      details: null,
    });
    expect(createSteamRichPresenceSnapshot(createStatus({ state: 'idle' }), policy())).toMatchObject({
      display: '#Status_Idle',
      status: 'In the listening room',
    });
  });

  it('supports stable music, minimal, and privacy presets', () => {
    expect(createSteamRichPresenceSnapshot(createStatus(), policy({ preset: 'minimal' }))).toMatchObject({ details: null });
    expect(createSteamRichPresenceSnapshot(createStatus(), policy({ preset: 'privacy' }), atHour(15))).toMatchObject({ title: null, artist: null, status: 'Listening to local music' });
    expect(createSteamRichPresenceSnapshot(createStatus(), policy({ preset: 'privacy' }), atHour(0))).toMatchObject({
      display: '#Status_PlayingLocalMusicNight',
      status: 'Listening after midnight',
    });
    expect(createSteamRichPresenceSnapshot(createStatus(), policy({ preset: 'privacy' }), atHour(5))).toMatchObject({
      display: '#Status_PlayingLocalMusic',
      status: 'Listening to local music',
    });
  });

  it('uses distinct copy for loading, paused, and library browsing', () => {
    expect(createSteamRichPresenceSnapshot(createStatus({ state: 'loading' }), policy()).status).toMatch(/^Cueing · /u);
    expect(createSteamRichPresenceSnapshot(createStatus({ state: 'paused' }), policy()).status).toMatch(/^Paused · /u);
    expect(createSteamRichPresenceSnapshot(createStatus({ state: 'stopped' }), policy()).status).toBe('In the library');
  });

  it('attaches to Audio Core when enabled and clears Steam immediately when disabled', async () => {
    await syncSteamRichPresenceIntegrationFromSettings({ steamRichPresenceMode: 'basic' } as never);

    expect(integrationMocks.audioSession.on).toHaveBeenCalledWith('status', expect.any(Function));
    expect(integrationMocks.update).toHaveBeenCalledWith(expect.objectContaining({
      display: '#Status_BrowsingLibrary',
    }));

    await syncSteamRichPresenceIntegrationFromSettings({ steamRichPresenceMode: 'off' } as never);

    expect(integrationMocks.audioSession.off).toHaveBeenCalledWith('status', expect.any(Function));
    expect(integrationMocks.clear).toHaveBeenCalledTimes(1);
  });

  it('retries an unchanged snapshot after Steam rejects an update', async () => {
    await syncSteamRichPresenceIntegrationFromSettings({ steamRichPresenceMode: 'detailed' } as never);
    integrationMocks.update.mockClear().mockReturnValueOnce(false).mockReturnValueOnce(true);

    syncSteamRichPresenceStatus(createStatus());
    expect(getSteamRichPresenceStatus()).toMatchObject({ publicationState: 'error', lastError: 'write_failed' });
    syncSteamRichPresenceStatus(createStatus());

    expect(integrationMocks.update).toHaveBeenCalledTimes(2);
    expect(getSteamRichPresenceStatus()).toMatchObject({
      mode: 'detailed',
      publicationState: 'published',
      preview: 'Starlight — ECHO · Night Drive · 1:15 / 3:45',
      lastError: null,
    });
  });

  it('updates progress at 15-second boundaries instead of every telemetry tick', async () => {
    await syncSteamRichPresenceIntegrationFromSettings({ steamRichPresenceMode: 'detailed' } as never);
    integrationMocks.update.mockClear();

    syncSteamRichPresenceStatus(createStatus({ positionSeconds: 76 }));
    syncSteamRichPresenceStatus(createStatus({ positionSeconds: 89 }));
    syncSteamRichPresenceStatus(createStatus({ positionSeconds: 90 }));

    expect(integrationMocks.update).toHaveBeenCalledTimes(2);
    expect(getSteamRichPresenceStatus().preview).toContain('1:30 / 3:45');
  });

  it('localizes the fallback status and publishes stable context fields', () => {
    expect(createSteamRichPresenceSnapshot(createStatus(), policy({ locale: 'zh-CN' })).status).toBe('正在听 Starlight · ECHO · Night Drive · 1:15 / 3:45');
    expect(createSteamRichPresenceSnapshot(createStatus(), policy({
      showAlbum: false, showProgress: false, showGenre: true, showPlaybackOrder: true,
    }), atHour(15), {
      genre: 'Jazz',
      playbackOrder: 'Shuffle',
    }).details).toBe('Jazz · Shuffle');
    expect(createSteamRichPresenceSnapshot(createStatus(), policy({
      showAlbum: false, showProgress: false, showBpm: true, showQuality: true, showFormat: true, showBitPerfect: true,
    }), atHour(15), {
      genre: null,
      playbackOrder: null,
      bpm: '155 BPM',
      quality: '16bit / 44.1kHz',
      format: 'FLAC',
      bitPerfect: 'Bit-Perfect',
    }).details).toBe('155 BPM · 16bit / 44.1kHz · FLAC · Bit-Perfect');
  });
});
