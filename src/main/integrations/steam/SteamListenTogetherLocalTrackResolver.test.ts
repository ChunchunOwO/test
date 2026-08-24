import { describe, expect, it, vi } from 'vitest';
import type { LibraryTrack } from '../../../shared/types/library';
import type { SteamListenTogetherTrack } from '../../../shared/types/steam';
import {
  scoreSteamListenTogetherLocalTrack,
  SteamListenTogetherLocalTrackResolver,
} from './SteamListenTogetherLocalTrackResolver';

const libraryTrack = (patch: Partial<LibraryTrack> = {}): LibraryTrack => ({
  id: 'local-1',
  mediaType: 'local',
  path: 'D:\\Music\\Starlight.flac',
  title: 'Starlight',
  artist: 'ECHO',
  album: 'Night Drive',
  albumArtist: 'ECHO',
  trackNo: 1,
  discNo: 1,
  year: 2026,
  genre: null,
  duration: 225,
  codec: 'flac',
  sampleRate: 96_000,
  bitDepth: 24,
  bitrate: 2_100_000,
  coverId: null,
  coverThumb: null,
  fieldSources: {},
  ...patch,
});

const remoteTrack: SteamListenTogetherTrack = {
  key: 'remote-key',
  title: 'Starlight',
  artist: 'ECHO',
  album: 'Night Drive',
  durationSeconds: 224,
};

describe('SteamListenTogetherLocalTrackResolver', () => {
  it('accepts only a strict local metadata match', () => {
    expect(scoreSteamListenTogetherLocalTrack(libraryTrack(), remoteTrack)).toBeGreaterThan(100);
    expect(scoreSteamListenTogetherLocalTrack(libraryTrack({ artist: 'Someone else' }), remoteTrack)).toBeNull();
    expect(scoreSteamListenTogetherLocalTrack(libraryTrack({ duration: 260 }), remoteTrack)).toBeNull();
    expect(scoreSteamListenTogetherLocalTrack(libraryTrack({ mediaType: 'remote' }), remoteTrack)).toBeNull();
  });

  it('plays the highest-confidence local match without exposing another machine path', async () => {
    const execute = vi.fn(async () => undefined);
    const resolver = new SteamListenTogetherLocalTrackResolver({
      getLibrary: () => ({
        getTracksPlaybackSafe: vi.fn(async () => ({
          items: [libraryTrack({ album: 'Other edition' }), libraryTrack()],
        })),
      }),
      relay: { execute },
    });

    await expect(resolver.findAndPlay(remoteTrack, 42)).resolves.toBe(true);
    expect(execute).toHaveBeenCalledWith({
      command: 'playLocalFile',
      args: [expect.objectContaining({
        filePath: 'D:\\Music\\Starlight.flac',
        trackId: 'local-1',
        startSeconds: 42,
        metadata: expect.objectContaining({ title: 'Starlight', artist: 'ECHO' }),
      })],
    });
  });
});
