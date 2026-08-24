import { describe, expect, it } from 'vitest';
import { albumTrackFileName, sortAlbumTracks, type AlbumTrackSort } from './albumTrackSort';
import type { LibraryTrack } from '../../../shared/types/library';

const track = (id: string, overrides: Partial<LibraryTrack> = {}): LibraryTrack => ({
  id,
  path: `D:\\Music\\${id}.flac`,
  title: `Track ${id}`,
  artist: 'Artist',
  album: 'Album',
  albumArtist: 'Artist',
  trackNo: Number(id.replace(/\D/g, '')) || 1,
  discNo: 1,
  year: 2026,
  genre: null,
  duration: 180,
  codec: 'flac',
  sampleRate: 96000,
  bitDepth: 24,
  bitrate: 900000,
  coverId: null,
  coverThumb: null,
  embeddedMetadataStatus: 'present',
  embeddedCoverStatus: 'missing',
  networkMetadataStatus: 'none',
  fieldSources: {},
  ...overrides,
});

describe('albumTrackSort', () => {
  it('keeps default disc/track order unchanged', () => {
    const tracks = [track('1'), track('2')];
    expect(sortAlbumTracks(tracks, 'default')).toBe(tracks);
  });

  it('sorts by title, duration, artist, and filename', () => {
    const tracks = [
      track('1', { title: 'Zebra', artist: 'B', duration: 90, path: 'D:\\Music\\b.flac' }),
      track('2', { title: 'Alpha', artist: 'A', duration: 200, path: 'D:\\Music\\a.flac' }),
    ];

    const ids = (sort: AlbumTrackSort): string[] => sortAlbumTracks(tracks, sort).map((item) => item.id);

    expect(ids('titleAsc')).toEqual(['2', '1']);
    expect(ids('titleDesc')).toEqual(['1', '2']);
    expect(ids('durationAsc')).toEqual(['1', '2']);
    expect(ids('durationDesc')).toEqual(['2', '1']);
    expect(ids('artist')).toEqual(['2', '1']);
    expect(ids('filename')).toEqual(['2', '1']);
  });

  it('reads the file name from windows and posix paths', () => {
    expect(albumTrackFileName('D:\\Music\\Disc 2\\02. Song.flac')).toBe('02. Song.flac');
    expect(albumTrackFileName('/Music/Disc 2/02. Song.flac')).toBe('02. Song.flac');
  });
});
