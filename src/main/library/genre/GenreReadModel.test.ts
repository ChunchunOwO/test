import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, type EchoDatabase } from '../../database/createDatabase';
import { unclassifiedGenreKey } from '../../../shared/library/genreKey';
import { GenreReadModel } from './GenreReadModel';

const now = '2026-05-20T00:00:00.000Z';

let database: EchoDatabase | null = null;

const createModel = (): GenreReadModel => {
  database = createDatabase(':memory:');
  database
    .prepare('INSERT INTO folders (id, path, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run('folder-1', 'D:\\Music', 'Music', now, now);
  return new GenreReadModel(database);
};

const insertTrack = (
  overrides: {
    id: string;
    title?: string;
    artist?: string;
    album?: string;
    albumArtist?: string;
    genre?: string | null;
    coverId?: string | null;
    missing?: number;
    trackNo?: number;
  },
): void => {
  database!
    .prepare(
      `INSERT INTO tracks (
        id, path, folder_id, size_bytes, mtime_ms, title, artist, album, album_artist,
        track_no, genre, duration, search_terms, cover_id, field_sources_json, missing, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      overrides.id,
      `D:\\Music\\${overrides.id}.flac`,
      'folder-1',
      1024,
      1,
      overrides.title ?? overrides.id,
      overrides.artist ?? 'Artist',
      overrides.album ?? 'Album',
      overrides.albumArtist ?? overrides.artist ?? 'Artist',
      overrides.trackNo ?? 1,
      overrides.genre ?? null,
      180,
      overrides.id,
      overrides.coverId ?? null,
      '{}',
      overrides.missing ?? 0,
      now,
      now,
    );
};

const insertAlbum = (id: string, title: string, albumArtist: string, trackIds: string[]): void => {
  database!
    .prepare(
      `INSERT INTO albums (id, album_key, title, album_artist, year, track_count, duration, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, id, title, albumArtist, 2024, trackIds.length, trackIds.length * 180, now, now);
  const insertAlbumTrack = database!.prepare(
    'INSERT INTO album_tracks (album_id, track_id, disc_no, track_no, position) VALUES (?, ?, 1, ?, ?)',
  );
  trackIds.forEach((trackId, index) => {
    insertAlbumTrack.run(id, trackId, index + 1, index);
  });
};

const seedRemoteSource = (id = 'remote-1', provider = 'webdav', status = 'enabled'): void => {
  database!
    .prepare(
      `INSERT INTO remote_sources (
        id, provider, display_name, status, base_url, username, auth_type, encrypted_secret,
        config_json, sync_mode, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, provider, 'Cloud', status, 'https://example.test', null, 'none', null, '{}', 'index', now, now);
};

const insertRemoteTrack = (
  overrides: {
    id: string;
    sourceId?: string;
    provider?: string;
    genre?: string | null;
    album?: string;
    albumArtist?: string;
    availability?: string;
  },
): void => {
  const sourceId = overrides.sourceId ?? 'remote-1';
  const provider = overrides.provider ?? 'webdav';
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
      overrides.id,
      sourceId,
      provider,
      `/Music/${overrides.id}.flac`,
      `hash-${overrides.id}`,
      `stable-${overrides.id}`,
      overrides.id,
      'Artist',
      overrides.album ?? 'Album',
      overrides.albumArtist ?? 'Artist',
      1,
      null,
      null,
      overrides.genre ?? null,
      180,
      'flac',
      44100,
      16,
      900000,
      1024,
      now,
      null,
      null,
      'pending',
      'ok',
      'pending',
      'pending',
      overrides.availability ?? 'available',
      '{}',
      overrides.id,
      now,
      now,
    );
};

afterEach(() => {
  database?.close();
  database = null;
});

describe('GenreReadModel', () => {
  it('groups letter-case and spacing as one genre and keeps the most common original casing', () => {
    const model = createModel();
    insertTrack({ id: 'rock-1', genre: 'Rock' });
    insertTrack({ id: 'rock-2', genre: 'ROCK' });
    insertTrack({ id: 'rock-3', genre: '  Rock  ' });
    insertTrack({ id: 'rock-4', genre: 'Rock' });

    const page = model.getGenres({ pageSize: 20 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      genreKey: 'rock',
      name: 'Rock',
      unclassified: false,
      trackCount: 4,
    });
    expect(model.getGenre('ROCK')?.name).toBe('Rock');
  });

  it('keeps compound tags as a single card instead of splitting them', () => {
    const model = createModel();
    insertTrack({ id: 'jp-1', genre: 'J-Pop/Anime' });
    insertTrack({ id: 'jp-2', genre: 'j-pop/anime' });

    const [genre] = model.getGenres({ pageSize: 20 }).items;
    expect(genre).toMatchObject({
      genreKey: 'j-pop/anime',
      trackCount: 2,
    });
  });

  it('sends empty tags to the unclassified bucket and sorts that bucket last', () => {
    const model = createModel();
    insertTrack({ id: 'empty-1', genre: null });
    insertTrack({ id: 'empty-2', genre: '   ' });
    insertTrack({ id: 'jazz-1', genre: 'Jazz' });
    insertTrack({ id: 'missing-1', genre: 'Jazz', missing: 1 });

    const page = model.getGenres({ pageSize: 20, sort: 'titleAsc' });
    expect(page.items.map((item) => item.genreKey)).toEqual(['jazz', unclassifiedGenreKey]);
    expect(page.items[1]).toMatchObject({
      genreKey: unclassifiedGenreKey,
      unclassified: true,
      name: '',
      trackCount: 2,
    });
    expect(model.getGenre(unclassifiedGenreKey)?.trackCount).toBe(2);
  });

  it('keeps one card per genre even when covers differ', () => {
    const model = createModel();
    insertTrack({ id: 'rock-a', genre: 'Rock', coverId: 'cover-a' });
    insertTrack({ id: 'rock-b', genre: 'Rock', coverId: 'cover-b' });
    insertTrack({ id: 'empty-a', genre: null, coverId: 'cover-c' });
    insertTrack({ id: 'empty-b', genre: '   ', coverId: 'cover-d' });

    const page = model.getGenres({ pageSize: 20 });
    expect(page.items.map((item) => item.genreKey)).toEqual(['rock', unclassifiedGenreKey]);
    expect(page.items[0]).toMatchObject({ name: 'Rock', unclassified: false, trackCount: 2 });
    expect(page.items[1]).toMatchObject({ unclassified: true, trackCount: 2 });
  });

  it('lists local tracks and albums for a genre', () => {
    const model = createModel();
    insertTrack({ id: 'a', title: 'Alpha', album: 'First', genre: 'Rock', trackNo: 1 });
    insertTrack({ id: 'b', title: 'Beta', album: 'Second', genre: 'Rock', trackNo: 1 });
    insertTrack({ id: 'c', title: 'Gamma', album: 'First', genre: 'Jazz', trackNo: 2 });
    insertAlbum('album-first', 'First', 'Artist', ['a', 'c']);
    insertAlbum('album-second', 'Second', 'Artist', ['b']);

    const tracks = model.getGenreTracks('rock', { pageSize: 20 });
    expect(tracks.items.map((track) => track.id)).toEqual(['a', 'b']);
    expect(tracks.total).toBe(2);

    const albums = model.getGenreAlbums('rock', { pageSize: 20 });
    expect(albums.items.map((album) => album.id).sort()).toEqual(['album-first', 'album-second']);
    expect(model.getGenres({ pageSize: 20 }).items.find((item) => item.genreKey === 'rock')?.albumCount).toBe(2);
  });

  it('groups remote tracks by enabled sources and ignores missing availability', () => {
    const model = createModel();
    seedRemoteSource('remote-1', 'webdav', 'enabled');
    seedRemoteSource('remote-off', 'jellyfin', 'disabled');
    insertRemoteTrack({ id: 'remote-rock-1', genre: 'Rock', album: 'Cloud One' });
    insertRemoteTrack({ id: 'remote-rock-2', genre: 'rock', album: 'Cloud Two' });
    insertRemoteTrack({ id: 'remote-missing', genre: 'Rock', availability: 'missing' });
    insertRemoteTrack({ id: 'remote-disabled', sourceId: 'remote-off', provider: 'jellyfin', genre: 'Rock' });

    const page = model.getGenres({ sourceProvider: 'remote', pageSize: 20 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      genreKey: 'rock',
      mediaType: 'remote',
      trackCount: 2,
      albumCount: 2,
    });

    const tracks = model.getGenreTracks('Rock', { sourceProvider: 'remote', pageSize: 20 });
    expect(tracks.items.map((track) => track.id).sort()).toEqual(['remote-rock-1', 'remote-rock-2']);
  });
});
