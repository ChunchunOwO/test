import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, type EchoDatabase } from '../../database/createDatabase';
import {
  AlbumArtistReadModel,
  albumArtistCreditForNames,
  albumArtistLocatorFromId,
  encodeAlbumArtistId,
} from './AlbumArtistReadModel';

const now = '2026-05-20T00:00:00.000Z';

let database: EchoDatabase | null = null;

const createModel = (): AlbumArtistReadModel => {
  database = createDatabase(':memory:');
  database
    .prepare('INSERT INTO folders (id, path, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run('folder-1', 'D:\\Music', 'Music', now, now);
  return new AlbumArtistReadModel(database);
};

const insertTrack = (overrides: {
  id: string;
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  missing?: number;
}): void => {
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
      1,
      null,
      180,
      overrides.id,
      null,
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

const seedRemoteSource = (id = 'remote-1', provider = 'webdav'): void => {
  database!
    .prepare(
      `INSERT INTO remote_sources (
        id, provider, display_name, status, base_url, username, auth_type, encrypted_secret,
        config_json, sync_mode, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, provider, 'Cloud', 'enabled', 'https://example.test', null, 'none', null, '{}', 'index', now, now);
};

const insertRemoteTrack = (overrides: {
  id: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  sourceId?: string;
}): void => {
  const sourceId = overrides.sourceId ?? 'remote-1';
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
      'webdav',
      `/Music/${overrides.id}.flac`,
      `hash-${overrides.id}`,
      `stable-${overrides.id}`,
      overrides.id,
      overrides.artist ?? 'Artist',
      overrides.album ?? 'Album',
      overrides.albumArtist ?? overrides.artist ?? 'Artist',
      1,
      null,
      null,
      null,
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
      'available',
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

describe('AlbumArtistReadModel', () => {
  it('does not register sqlite javascript functions on the hot path', () => {
    createModel();
    expect(() => database!.prepare('SELECT echo_album_artist_key(?, ?)').get('2PM', '2PM/尹恩惠')).toThrow(/no such function/i);
  });

  it('prefers the unsplit track credit over a primary-only album artist tag', () => {
    expect(albumArtistCreditForNames('2PM', '2PM/尹恩惠')).toBe('2PM/尹恩惠');
    expect(albumArtistCreditForNames('Ado', 'Ado feat. 初音ミク')).toBe('Ado feat. 初音ミク');
    expect(albumArtistCreditForNames('2PM/尹恩惠', '')).toBe('2PM/尹恩惠');
  });

  it('keeps collaboration credits as one album artist instead of splitting them', () => {
    const model = createModel();
    insertTrack({ id: 'duet', title: 'Duet Song', artist: '2PM/尹恩惠', album: 'Duet Album', albumArtist: '2PM/尹恩惠' });
    insertTrack({ id: 'solo', title: 'Solo Song', artist: '2PM', album: 'Solo Album', albumArtist: '2PM' });
    insertAlbum('album-duet', 'Duet Album', '2PM/尹恩惠', ['duet']);
    insertAlbum('album-solo', 'Solo Album', '2PM', ['solo']);

    const page = model.getArtists({ pageSize: 20, sort: 'titleAsc' });
    const names = page.items.map((artist) => artist.name);

    expect(names).toEqual(['2PM', '2PM/尹恩惠']);
    expect(page.items.find((artist) => artist.name === '2PM/尹恩惠')).toMatchObject({ trackCount: 1, albumCount: 1 });
    expect(page.items.find((artist) => artist.name === '尹恩惠')).toBeUndefined();
  });

  it('falls back to the unsplit track artist when album artist is missing', () => {
    const model = createModel();
    insertTrack({ id: 'pile', title: 'Pile Song', artist: 'Alpha / Beta / Gamma', album: 'Pile Album', albumArtist: '' });

    const [artist] = model.getArtists({ pageSize: 10 }).items;

    expect(artist?.name).toBe('Alpha / Beta / Gamma');
    expect(artist?.trackCount).toBe(1);
  });

  it('keeps the unsplit track pile when album artist is only the primary name', () => {
    const model = createModel();
    insertTrack({
      id: 'duet',
      title: 'Duet Song',
      artist: '2PM/尹恩惠',
      album: 'Duet Album',
      albumArtist: '2PM',
    });

    const page = model.getArtists({ pageSize: 10 });
    const names = page.items.map((artist) => artist.name);

    expect(names).toEqual(['2PM/尹恩惠']);
    expect(names).not.toContain('2PM');
    expect(names).not.toContain('尹恩惠');

    const [artist] = page.items;
    expect(model.getArtist(artist.id)?.name).toBe('2PM/尹恩惠');
    expect(model.getArtistTracks(artist.id, { pageSize: 10 }).items.map((track) => track.title)).toEqual(['Duet Song']);
  });

  it('keeps feat credits together even when album artist is the primary name', () => {
    const model = createModel();
    insertTrack({
      id: 'featured',
      title: 'Featured Song',
      artist: 'Ado feat. 初音ミク',
      album: 'Single',
      albumArtist: 'Ado',
    });

    const names = model.getArtists({ pageSize: 10 }).items.map((artist) => artist.name);

    expect(names).toEqual(['Ado feat. 初音ミク']);
    expect(names).not.toContain('Ado');
    expect(names).not.toContain('初音ミク');
  });

  it('returns tracks and albums for the unsplit album artist id', () => {
    const model = createModel();
    insertTrack({ id: 'duet', title: 'Duet Song', artist: '2PM/尹恩惠', album: 'Duet Album', albumArtist: '2PM/尹恩惠' });
    insertTrack({ id: 'solo', title: 'Solo Song', artist: '2PM', album: 'Solo Album', albumArtist: '2PM' });
    insertAlbum('album-duet', 'Duet Album', '2PM/尹恩惠', ['duet']);
    insertAlbum('album-solo', 'Solo Album', '2PM', ['solo']);

    const collaboration = model.getArtists({ search: '2PM/尹恩惠', pageSize: 10 }).items[0];
    expect(collaboration).toBeDefined();
    expect(albumArtistLocatorFromId(collaboration.id)).toMatchObject({ mediaType: 'local' });
    expect(model.getArtist(collaboration.id)?.name).toBe('2PM/尹恩惠');
    expect(model.getArtistTracks(collaboration.id, { pageSize: 10 }).items.map((track) => track.title)).toEqual(['Duet Song']);
    expect(model.getArtistAlbums(collaboration.id, { pageSize: 10 }).items.map((album) => album.title)).toEqual(['Duet Album']);
  });

  it('groups remote album artists without splitting credits', () => {
    const model = createModel();
    seedRemoteSource();
    insertRemoteTrack({ id: 'remote-duet', artist: 'Afterglow,FLOW', album: 'Split', albumArtist: 'Afterglow,FLOW' });

    const page = model.getArtists({ sourceProvider: 'remote', pageSize: 10 });

    expect(page.items.map((artist) => artist.name)).toEqual(['Afterglow,FLOW']);
    expect(encodeAlbumArtistId(albumArtistLocatorFromId(page.items[0].id)!)).toBe(page.items[0].id);
    expect(model.getArtistTracks(page.items[0].id, { pageSize: 10 }).items.map((track) => track.id)).toEqual(['remote-duet']);
  });
});
