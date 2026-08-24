import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, type EchoDatabase } from '../database/createDatabase';
import { LibraryStore } from './LibraryStore';
import { RemoteLibraryStore } from './remote/RemoteLibraryStore';

const now = '2026-01-01T00:00:00.000Z';
let database: EchoDatabase | null = null;

const makeStore = (remoteAlbumMergeStrategy: 'conservative' | 'standard' = 'conservative'): LibraryStore => {
  database = createDatabase(':memory:');
  return new LibraryStore(database, () => ({ remoteAlbumMergeStrategy }));
};

const seedRemoteSource = (provider = 'webdav'): string => {
  const sourceId = `${provider}-source`;
  database!
    .prepare(
      `INSERT INTO remote_sources (
        id, provider, display_name, status, base_url, username, auth_type, encrypted_secret,
        config_json, sync_mode, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(sourceId, provider, provider, 'enabled', 'https://example.test', null, 'none', null, '{}', 'index', now, now);
  return sourceId;
};

const seedRemoteTrack = (
  sourceId: string,
  provider: string,
  id: string,
  overrides: {
    path?: string;
    title?: string;
    artist?: string;
    album?: string;
    albumArtist?: string;
    trackNo?: number | null;
    year?: number | null;
    coverId?: string | null;
    fieldSources?: Record<string, string>;
  } = {},
): void => {
  const remotePath = overrides.path ?? `/Music/${overrides.album ?? 'Album'}/${id}.flac`;
  database!
    .prepare(
      `INSERT INTO remote_tracks (
        id, source_id, provider, remote_path, remote_url_hash, stable_key, title, artist,
        album, album_artist, track_no, disc_no, year, genre, duration, codec, sample_rate,
        bit_depth, bitrate, size_bytes, modified_at, etag, cover_id, cover_status,
        metadata_status, lyrics_status, mv_status, availability, field_sources_json,
        search_terms, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      sourceId,
      provider,
      remotePath,
      `hash-${id}`,
      `stable-${id}`,
      overrides.title ?? id,
      overrides.artist ?? 'Artist',
      overrides.album ?? 'Album',
      overrides.albumArtist ?? overrides.artist ?? 'Artist',
      overrides.trackNo ?? null,
      null,
      overrides.year ?? null,
      null,
      180,
      'flac',
      44100,
      16,
      900000,
      1024,
      now,
      null,
      overrides.coverId ?? null,
      overrides.coverId ? 'ok' : 'pending',
      'ok',
      'pending',
      'pending',
      'available',
      JSON.stringify(overrides.fieldSources ?? {}),
      '',
      now,
      now,
    );
};

afterEach(() => {
  database?.close();
  database = null;
});

describe('LibraryStore remote album grouping', () => {
  it('groups Subsonic tracks by server album id even when track artists differ', () => {
    const store = makeStore();
    const sourceId = seedRemoteSource('subsonic');

    seedRemoteTrack(sourceId, 'subsonic', 'song-1', {
      title: 'One',
      artist: 'Artist One',
      album: 'Shared Album',
      albumArtist: 'Artist One',
      trackNo: 1,
      fieldSources: { albumId: 'server-album-1', coverArt: 'cover-1' },
    });
    seedRemoteTrack(sourceId, 'subsonic', 'song-2', {
      title: 'Two',
      artist: 'Artist Two',
      album: 'Shared Album',
      albumArtist: 'Artist Two',
      trackNo: 2,
      fieldSources: { albumId: 'server-album-1', coverArt: 'cover-1' },
    });

    const albums = store.getAlbums({ sourceProvider: 'remote', sourceId, pageSize: 10 });

    expect(albums.total).toBe(1);
    expect(albums.items[0]).toMatchObject({
      mediaType: 'remote',
      sourceId,
      provider: 'subsonic',
      title: 'Shared Album',
      albumArtist: 'Various Artists',
      trackCount: 2,
    });
    expect(albums.items[0]!.coverThumb).toContain('echo-image://subsonic-cover/');
    expect(albums.items[0]!.coverThumb).toContain('coverArt=cover-1');
    expect(albums.items[0]!.coverThumb).toContain('size=320');
    expect(store.getAlbum(albums.items[0]!.id)).toMatchObject({
      id: albums.items[0]!.id,
      coverThumb: albums.items[0]!.coverThumb,
      coverLarge: albums.items[0]!.coverThumb,
    });
    expect(store.getAlbumForTrack('song-1')).toMatchObject({ id: albums.items[0]!.id });
    expect(store.getAlbumTracks(albums.items[0]!.id).items.map((track) => track.id)).toEqual(['song-1', 'song-2']);
    const queryPlan = database!.prepare(`EXPLAIN QUERY PLAN
      SELECT id FROM remote_tracks
      WHERE source_id = ? AND provider = ?
        AND NULLIF(TRIM(COALESCE(json_extract(field_sources_json, '$.albumId'), json_extract(field_sources_json, '$.serverAlbumId'), '')), '') = ?
        AND availability != 'missing'`).all(sourceId, 'subsonic', 'server-album-1') as Array<{ detail: string }>;
    expect(queryPlan.some((step) => step.detail.includes('idx_remote_tracks_server_album'))).toBe(true);
  });

  it('reads Subsonic artists and their tracks and albums without rebuilding the unified remote library', () => {
    const store = makeStore();
    const sourceId = seedRemoteSource('subsonic');

    seedRemoteTrack(sourceId, 'subsonic', 'shared-a', {
      artist: 'Artist Alpha',
      album: 'Shared Album',
      fieldSources: { albumId: 'shared-album' },
    });
    seedRemoteTrack(sourceId, 'subsonic', 'shared-b', {
      artist: 'Artist B',
      album: 'Shared Album',
      fieldSources: { albumId: 'shared-album' },
    });
    seedRemoteTrack(sourceId, 'subsonic', 'solo-a', {
      artist: 'Artist Alpha',
      album: 'Solo Album',
      fieldSources: { albumId: 'solo-album' },
    });

    const artists = store.getArtists({ sourceProvider: 'remote', sourceId, pageSize: 10 });
    const artistA = artists.items.find((artist) => artist.name === 'Artist Alpha');

    expect(artists.total).toBe(2);
    expect(artistA).toMatchObject({ mediaType: 'remote', sourceId, trackCount: 2, albumCount: 2 });
    expect(store.getArtist(artistA!.id)).toMatchObject({ id: artistA!.id, trackCount: 2, albumCount: 2 });
    expect(store.getArtistTracks(artistA!.id).items.map((track) => track.id).sort()).toEqual(['shared-a', 'solo-a']);
    expect(store.getArtistAlbums(artistA!.id).items).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Shared Album', trackCount: 2 }),
      expect.objectContaining({ title: 'Solo Album', trackCount: 1 }),
    ]));
    expect(store.getAlbums({ sourceProvider: 'remote', sourceId, search: 'Shared', pageSize: 10 }).items).toEqual([
      expect.objectContaining({ title: 'Shared Album' }),
    ]);
    expect(store.getArtists({ sourceProvider: 'remote', sourceId, search: 'Alpha', pageSize: 10 }).items).toEqual([
      expect.objectContaining({ name: 'Artist Alpha' }),
    ]);

    database!.prepare(
      `INSERT INTO playback_history_stats (
        history_key, track_path, media_type, provider, stable_key, title, artist, album,
        play_count, completed_count, total_played_seconds, duration_seconds, last_started_at, updated_at
      ) VALUES (?, ?, 'remote', 'subsonic', ?, ?, 'Artist A', 'Solo Album', 8, 8, 0, 180, ?, ?)`,
    ).run('remote-solo-a', '/solo-a', 'stable-solo-a', 'Solo A', now, now);
    expect(store.getAlbums({ sourceProvider: 'remote', sourceId, sort: 'playCountDesc', pageSize: 10 }).items[0]).toMatchObject({
      title: 'Solo Album',
    });
  });

  it('does not split Subsonic albums by per-track coverArt when server album id is missing', () => {
    const store = makeStore();
    const sourceId = seedRemoteSource('subsonic');

    seedRemoteTrack(sourceId, 'subsonic', 'song-1', {
      title: 'One',
      artist: 'Artist One',
      album: 'Exploded Album',
      albumArtist: 'Artist One',
      trackNo: 1,
      fieldSources: { coverArt: 'song-cover-1' },
    });
    seedRemoteTrack(sourceId, 'subsonic', 'song-2', {
      title: 'Two',
      artist: 'Artist Two',
      album: 'Exploded Album',
      albumArtist: 'Artist Two',
      trackNo: 2,
      fieldSources: { coverArt: 'song-cover-2' },
    });

    const albums = store.getAlbums({ sourceProvider: 'remote', pageSize: 10 });

    expect(albums.total).toBe(1);
    expect(albums.items[0]).toMatchObject({
      provider: 'subsonic',
      title: 'Exploded Album',
      albumArtist: 'Various Artists',
      trackCount: 2,
    });
  });

  it('groups fallback WebDAV album artists only inside the same source folder', () => {
    const store = makeStore();
    const sourceId = seedRemoteSource('webdav');

    seedRemoteTrack(sourceId, 'webdav', 'same-folder-1', {
      path: '/Music/Compilation/01.flac',
      artist: 'Artist One',
      album: 'Greatest Hits',
      albumArtist: 'Artist One',
      trackNo: 1,
      fieldSources: { albumArtist: 'artist_fallback' },
    });
    seedRemoteTrack(sourceId, 'webdav', 'same-folder-2', {
      path: '/Music/Compilation/02.flac',
      artist: 'Artist Two',
      album: 'Greatest Hits',
      albumArtist: 'Artist Two',
      trackNo: 2,
      fieldSources: { albumArtist: 'artist_fallback' },
    });
    seedRemoteTrack(sourceId, 'webdav', 'other-folder', {
      path: '/Music/Other/01.flac',
      artist: 'Other Artist',
      album: 'Greatest Hits',
      albumArtist: 'Other Artist',
      trackNo: 1,
      fieldSources: { albumArtist: 'artist_fallback' },
    });

    const albums = store.getAlbums({ sourceProvider: 'remote', search: 'Greatest Hits', pageSize: 10 });

    expect(albums.total).toBe(2);
    expect(albums.items.map((album) => album.trackCount).sort((left, right) => left - right)).toEqual([1, 2]);
    expect(albums.items.find((album) => album.trackCount === 2)).toMatchObject({
      albumArtist: 'Various Artists',
    });
  });

  it('keeps title suffix variants split in conservative mode', () => {
    const store = makeStore('conservative');
    const sourceId = seedRemoteSource('subsonic');

    seedRemoteTrack(sourceId, 'subsonic', 'epic-1', {
      path: '/Music/Spangle call Lilli line/epic/01.flac',
      title: 'epic',
      artist: 'Spangle call Lilli line',
      album: 'epic',
      albumArtist: 'Spangle call Lilli line',
      trackNo: 1,
    });
    seedRemoteTrack(sourceId, 'subsonic', 'epic-single-1', {
      path: '/Music/Spangle call Lilli line/epic/02.flac',
      title: 'epic - Single',
      artist: 'Spangle call Lilli line',
      album: 'epic - Single',
      albumArtist: 'Spangle call Lilli line',
      trackNo: 2,
    });

    const albums = store.getAlbums({ sourceProvider: 'remote', search: 'epic', pageSize: 10 });

    expect(albums.total).toBe(2);
  });

  it('merges remote title suffix variants in standard mode', () => {
    const store = makeStore('standard');
    const sourceId = seedRemoteSource('subsonic');

    seedRemoteTrack(sourceId, 'subsonic', 'epic-1', {
      path: '/Music/Spangle call Lilli line/epic/01.flac',
      title: 'epic',
      artist: 'Spangle call Lilli line',
      album: 'epic',
      albumArtist: 'Spangle call Lilli line',
      trackNo: 1,
    });
    seedRemoteTrack(sourceId, 'subsonic', 'epic-single-1', {
      path: '/Music/Spangle call Lilli line/epic/02.flac',
      title: 'epic - Single',
      artist: 'Spangle call Lilli line',
      album: 'epic - Single',
      albumArtist: 'Spangle call Lilli line',
      trackNo: 2,
    });

    const albums = store.getAlbums({ sourceProvider: 'remote', search: 'epic', pageSize: 10 });

    expect(albums.total).toBe(1);
    expect(albums.items[0]).toMatchObject({
      provider: 'subsonic',
      title: 'epic',
      albumArtist: 'Spangle call Lilli line',
      trackCount: 2,
    });
    expect(store.getAlbumTracks(albums.items[0]!.id).items.map((track) => track.id)).toEqual(['epic-1', 'epic-single-1']);
  });

  it('previews remote album counts before applying a merge strategy', () => {
    makeStore('conservative');
    const sourceId = seedRemoteSource('subsonic');

    seedRemoteTrack(sourceId, 'subsonic', 'epic-1', {
      path: '/Music/Spangle call Lilli line/epic/01.flac',
      artist: 'Spangle call Lilli line',
      album: 'epic',
      albumArtist: 'Spangle call Lilli line',
      trackNo: 1,
    });
    seedRemoteTrack(sourceId, 'subsonic', 'epic-single-1', {
      path: '/Music/Spangle call Lilli line/epic/02.flac',
      artist: 'Spangle call Lilli line',
      album: 'epic - Single',
      albumArtist: 'Spangle call Lilli line',
      trackNo: 2,
    });

    const preview = new RemoteLibraryStore(database!).previewAlbumGrouping('conservative', 'standard');

    expect(preview).toMatchObject({
      sourceCount: 1,
      trackCount: 2,
      currentAlbumCount: 2,
      targetAlbumCount: 1,
    });
  });
});
