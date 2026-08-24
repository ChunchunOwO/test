import { describe, expect, it } from 'vitest';
import { getSteamPresenceCopy } from './SteamRichPresenceCopy';
import {
  collectSteamPresenceExtras,
  formatSteamPresenceBpm,
  formatSteamPresenceFileFormat,
  formatSteamPresencePlaybackOrder,
  formatSteamPresenceQuality,
  sanitizeSteamPresenceGenre,
} from './SteamRichPresenceFlavor';

const copy = getSteamPresenceCopy('en-US');

describe('SteamRichPresenceFlavor', () => {
  it('keeps the first genre tag and drops paths or unclassified values', () => {
    expect(sanitizeSteamPresenceGenre('Jazz; Smooth')).toBe('Jazz');
    expect(sanitizeSteamPresenceGenre('Rock / Pop')).toBe('Rock');
    expect(sanitizeSteamPresenceGenre('__unclassified__')).toBeNull();
    expect(sanitizeSteamPresenceGenre('C:\\Users\\listener\\Music')).toBeNull();
  });

  it('prefers shuffle, then repeat-one, then repeat-all', () => {
    expect(formatSteamPresencePlaybackOrder(copy, true, 'all')).toBe('Shuffle');
    expect(formatSteamPresencePlaybackOrder(copy, true, 'one')).toBe('Shuffle · Repeat one');
    expect(formatSteamPresencePlaybackOrder(copy, false, 'one')).toBe('Repeat one');
    expect(formatSteamPresencePlaybackOrder(copy, false, 'all')).toBe('Repeat all');
    expect(formatSteamPresencePlaybackOrder(copy, false, 'off')).toBeNull();
  });

  it('formats optional audio facts without exposing a file path', () => {
    expect(formatSteamPresenceBpm(154.6)).toBe('155 BPM');
    expect(formatSteamPresenceBpm(0)).toBeNull();
    expect(formatSteamPresenceQuality({ bitDepth: 16, sampleRate: 44_100, bitrate: 1_000_000 })).toBe('16bit / 44.1kHz');
    expect(formatSteamPresenceQuality({ bitDepth: null, sampleRate: 48_000, bitrate: 320_000 })).toBe('320kbps / 48kHz');
    expect(formatSteamPresenceFileFormat('flac')).toBe('FLAC');
    expect(formatSteamPresenceFileFormat(null)).toBeNull();
  });

  it('collects enabled audio facts from Audio Core and library metadata', () => {
    const extras = collectSteamPresenceExtras({
      currentTrackId: 'track-1',
      bitDepth: 24,
      bitrate: 2_000_000,
      fileSampleRate: 96_000,
      codec: 'flac',
      bitPerfectCandidate: true,
    } as never, {
      mode: 'detailed',
      preset: 'music',
      locale: 'en-US',
      showAlbum: false,
      showProgress: false,
      showGenre: false,
      showPlaybackOrder: false,
      showBpm: true,
      showQuality: true,
      showFormat: true,
      showBitPerfect: true,
    }, {
      getTrackMetadata: () => ({ genre: null, bpm: 128, codec: 'mp3', sampleRate: 44_100, bitDepth: null, bitrate: 320_000 }),
    });

    expect(extras).toMatchObject({
      bpm: '128 BPM',
      quality: '24bit / 96kHz',
      format: 'FLAC',
      bitPerfect: 'Bit-Perfect',
    });
  });
});
