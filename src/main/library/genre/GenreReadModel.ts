import type { EchoDatabase } from '../../database/createDatabase';
import { genreKeyFromSqlValue, genreKeyFromTag, isUnclassifiedGenreKey, unclassifiedGenreKey } from '../../../shared/library/genreKey';
import type { LibraryAlbum, LibraryGenre, LibraryPage, LibraryPageQuery, LibraryTrack } from '../../../shared/types/library';

type DbRow = Record<string, unknown>;

const defaultPageSize = 96;
const maxPageSize = 500;
const remoteProvidersSql = "('webdav', 'jellyfin', 'emby', 'smb', 'sshfs', 'subsonic')";
const registeredGenreKeyFunctions = new WeakSet<EchoDatabase>();

const textOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const numberOrNull = (value: unknown): number | null => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const parseJsonObject = (value: unknown): Record<string, string> => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
  } catch {
    return {};
  }
};

const toCoverUrl = (coverId: string | null, variant: 'thumb' | 'album'): string | null =>
  coverId ? `echo-cover://${variant}/${encodeURIComponent(coverId)}` : null;

const emptyPage = <T>(page: number, pageSize: number): LibraryPage<T> => ({
  items: [],
  page,
  pageSize,
  total: 0,
  hasMore: false,
});

const pageFromQuery = (query?: LibraryPageQuery): { page: number; pageSize: number; search: string; sort: string; sourceId: string | null } => ({
  page: Math.max(1, Math.floor(Number(query?.page ?? 1))),
  pageSize: Math.min(maxPageSize, Math.max(1, Math.floor(Number(query?.pageSize ?? defaultPageSize)))),
  search: typeof query?.search === 'string' ? query.search.trim() : '',
  sort: query?.sort ?? 'default',
  sourceId: typeof query?.sourceId === 'string' && query.sourceId.trim().length > 0 ? query.sourceId.trim() : null,
});

const isRemoteQuery = (query?: LibraryPageQuery): boolean => query?.sourceProvider === 'remote';

const ensureGenreKeyFunction = (database: EchoDatabase): void => {
  if (registeredGenreKeyFunctions.has(database)) {
    return;
  }
  if (typeof database.function !== 'function') {
    return;
  }
  database.function('echo_genre_key', { deterministic: true }, (value: unknown) => genreKeyFromSqlValue(value));
  registeredGenreKeyFunctions.add(database);
};

const localTaggedSql = `
  SELECT
    echo_genre_key(tracks.genre) AS genre_key,
    tracks.genre AS display_name,
    tracks.id AS track_id,
    tracks.album AS album_title,
    tracks.album_artist AS album_artist,
    tracks.cover_id AS cover_id
  FROM tracks
  WHERE tracks.missing = 0
`;

const remoteTaggedSql = `
  SELECT
    echo_genre_key(remote_tracks.genre) AS genre_key,
    remote_tracks.genre AS display_name,
    remote_tracks.id AS track_id,
    remote_tracks.album AS album_title,
    remote_tracks.album_artist AS album_artist,
    remote_tracks.cover_id AS cover_id
  FROM remote_tracks
  INNER JOIN remote_sources ON remote_sources.id = remote_tracks.source_id
  WHERE remote_tracks.availability != 'missing'
    AND remote_sources.status = 'enabled'
    AND remote_sources.provider IN ${remoteProvidersSql}
`;

const genreOrderSql = (sort: string): string => {
  const unclassifiedLast = `CASE WHEN genre_key = '${unclassifiedGenreKey}' THEN 1 ELSE 0 END`;
  if (sort === 'titleAsc') {
    return `ORDER BY ${unclassifiedLast}, display_name COLLATE NOCASE ASC`;
  }
  if (sort === 'titleDesc') {
    return `ORDER BY ${unclassifiedLast}, display_name COLLATE NOCASE DESC`;
  }
  if (sort === 'trackCountAsc') {
    return `ORDER BY ${unclassifiedLast}, track_count ASC, display_name COLLATE NOCASE ASC`;
  }
  if (sort === 'random') {
    return 'ORDER BY RANDOM()';
  }
  return `ORDER BY ${unclassifiedLast}, track_count DESC, display_name COLLATE NOCASE ASC`;
};

const trackOrderSql = (sort: string): string => {
  if (sort === 'titleAsc' || sort === 'title') {
    return 'ORDER BY title COLLATE NOCASE ASC';
  }
  if (sort === 'titleDesc') {
    return 'ORDER BY title COLLATE NOCASE DESC';
  }
  if (sort === 'durationDesc') {
    return 'ORDER BY duration DESC, title COLLATE NOCASE ASC';
  }
  if (sort === 'durationAsc') {
    return 'ORDER BY duration ASC, title COLLATE NOCASE ASC';
  }
  if (sort === 'random') {
    return 'ORDER BY RANDOM()';
  }
  return 'ORDER BY album COLLATE NOCASE ASC, disc_no ASC, track_no ASC, title COLLATE NOCASE ASC';
};

const mapGenre = (row: DbRow, mediaType: 'local' | 'remote'): LibraryGenre => {
  const genreKey = String(row.genre_key ?? unclassifiedGenreKey);
  const unclassified = isUnclassifiedGenreKey(genreKey);
  const coverId = textOrNull(row.cover_id);
  return {
    genreKey,
    name: unclassified ? '' : String(row.display_name ?? ''),
    unclassified,
    mediaType,
    sourceId: textOrNull(row.source_id),
    sourceDisplayName: textOrNull(row.source_display_name),
    trackCount: Number(row.track_count ?? 0),
    albumCount: Number(row.album_count ?? 0),
    coverId,
    coverThumb: toCoverUrl(coverId, 'thumb'),
  };
};

const mapTrack = (row: DbRow): LibraryTrack => {
  const mediaType = row.media_type === 'remote' ? 'remote' : 'local';
  const coverId = textOrNull(row.cover_id);
  return {
    id: String(row.id),
    mediaType,
    path: String(row.path ?? ''),
    sourceId: textOrNull(row.source_id),
    sourceDisplayName: textOrNull(row.source_display_name),
    provider: textOrNull(row.provider),
    remotePath: textOrNull(row.remote_path),
    stableKey: textOrNull(row.stable_key),
    title: String(row.title ?? ''),
    artist: String(row.artist ?? 'Unknown Artist'),
    album: String(row.album ?? ''),
    albumArtist: String(row.album_artist ?? row.artist ?? 'Unknown Artist'),
    trackNo: numberOrNull(row.track_no),
    discNo: numberOrNull(row.disc_no),
    year: numberOrNull(row.year),
    genre: textOrNull(row.genre),
    duration: Number(row.duration ?? 0),
    codec: textOrNull(row.codec),
    sampleRate: numberOrNull(row.sample_rate),
    bitDepth: numberOrNull(row.bit_depth),
    bitrate: numberOrNull(row.bitrate),
    coverId,
    coverThumb: toCoverUrl(coverId, 'thumb'),
    fieldSources: parseJsonObject(row.field_sources_json),
  };
};

const mapAlbum = (row: DbRow): LibraryAlbum => {
  const coverId = textOrNull(row.cover_id);
  return {
    id: String(row.id),
    mediaType: row.media_type === 'remote' ? 'remote' : 'local',
    sourceId: textOrNull(row.source_id),
    sourceDisplayName: textOrNull(row.source_display_name),
    provider: textOrNull(row.provider),
    albumKey: String(row.album_key ?? row.id),
    title: String(row.title ?? ''),
    albumArtist: String(row.album_artist ?? 'Unknown Artist'),
    year: numberOrNull(row.year),
    trackCount: Number(row.track_count ?? 0),
    duration: Number(row.duration ?? 0),
    coverId,
    coverThumb: toCoverUrl(coverId, 'album'),
  };
};

export class GenreReadModel {
  constructor(private readonly database: EchoDatabase) {
    ensureGenreKeyFunction(database);
  }

  getGenres(query?: LibraryPageQuery): LibraryPage<LibraryGenre> {
    const { page, pageSize, search, sort, sourceId } = pageFromQuery(query);
    const offset = (page - 1) * pageSize;
    const remote = isRemoteQuery(query);
    const taggedSql = remote ? remoteTaggedSql : localTaggedSql;
    const sourceFilterSql = remote && sourceId ? 'AND remote_tracks.source_id = ?' : '';
    const searchSql = search ? 'WHERE grouped.display_name LIKE ? ESCAPE \'\\\'' : '';
    const searchParam = search ? `%${search.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%` : null;
    const sourceParams = remote && sourceId ? [sourceId] : [];
    const rows = this.allRows(
      `WITH tagged AS (
        ${taggedSql}
        ${sourceFilterSql}
      ),
      casing AS (
        SELECT
          genre_key,
          display_name,
          ROW_NUMBER() OVER (PARTITION BY genre_key ORDER BY COUNT(*) DESC, display_name COLLATE NOCASE ASC) AS rn
        FROM tagged
        GROUP BY genre_key, display_name
      ),
      covers AS (
        SELECT
          genre_key,
          cover_id,
          ROW_NUMBER() OVER (
            PARTITION BY genre_key
            ORDER BY CASE WHEN cover_id IS NULL OR TRIM(cover_id) = '' THEN 1 ELSE 0 END, track_id
          ) AS rn
        FROM tagged
      ),
      grouped AS (
        SELECT
          tagged.genre_key AS genre_key,
          MAX(casing.display_name) AS display_name,
          COUNT(DISTINCT tagged.track_id) AS track_count,
          COUNT(DISTINCT tagged.album_title || CHAR(31) || tagged.album_artist) AS album_count,
          MAX(covers.cover_id) AS cover_id
        FROM tagged
        INNER JOIN casing ON casing.genre_key = tagged.genre_key AND casing.rn = 1
        LEFT JOIN covers ON covers.genre_key = tagged.genre_key AND covers.rn = 1
        GROUP BY tagged.genre_key
      )
      SELECT
        genre_key, display_name, track_count, album_count, cover_id,
        COUNT(*) OVER () AS total_count
      FROM grouped
      ${searchSql}
      ${genreOrderSql(sort)}
      LIMIT ? OFFSET ?`,
      ...sourceParams,
      ...(searchParam ? [searchParam] : []),
      pageSize,
      offset,
    );
    const total = Number(rows[0]?.total_count ?? 0);
    const mediaType = remote ? 'remote' : 'local';

    return {
      items: rows.map((row) => mapGenre(row, mediaType)),
      page,
      pageSize,
      total,
      hasMore: offset + rows.length < total,
    };
  }

  getGenre(genreKey: string, query?: LibraryPageQuery): LibraryGenre | null {
    const normalizedKey = isUnclassifiedGenreKey(genreKey) ? unclassifiedGenreKey : genreKeyFromTag(genreKey);
    const remote = isRemoteQuery(query);
    const sourceId = typeof query?.sourceId === 'string' && query.sourceId.trim().length > 0 ? query.sourceId.trim() : null;
    const taggedSql = remote ? remoteTaggedSql : localTaggedSql;
    const sourceFilterSql = remote && sourceId ? 'AND remote_tracks.source_id = ?' : '';
    const row = this.getRow(
      `WITH tagged AS (
        ${taggedSql}
        ${sourceFilterSql}
      ),
      casing AS (
        SELECT
          genre_key,
          display_name,
          ROW_NUMBER() OVER (PARTITION BY genre_key ORDER BY COUNT(*) DESC, display_name COLLATE NOCASE ASC) AS rn
        FROM tagged
        WHERE genre_key = ?
        GROUP BY genre_key, display_name
      ),
      covers AS (
        SELECT
          genre_key,
          cover_id,
          ROW_NUMBER() OVER (
            PARTITION BY genre_key
            ORDER BY CASE WHEN cover_id IS NULL OR TRIM(cover_id) = '' THEN 1 ELSE 0 END, track_id
          ) AS rn
        FROM tagged
        WHERE genre_key = ?
      )
      SELECT
        tagged.genre_key AS genre_key,
        MAX(casing.display_name) AS display_name,
        COUNT(DISTINCT tagged.track_id) AS track_count,
        COUNT(DISTINCT tagged.album_title || CHAR(31) || tagged.album_artist) AS album_count,
        MAX(covers.cover_id) AS cover_id
      FROM tagged
      INNER JOIN casing ON casing.genre_key = tagged.genre_key AND casing.rn = 1
      LEFT JOIN covers ON covers.genre_key = tagged.genre_key AND covers.rn = 1
      WHERE tagged.genre_key = ?
      GROUP BY tagged.genre_key`,
      ...(remote && sourceId ? [sourceId] : []),
      normalizedKey,
      normalizedKey,
      normalizedKey,
    );

    return row ? mapGenre(row, remote ? 'remote' : 'local') : null;
  }

  getGenreTracks(genreKey: string, query?: LibraryPageQuery): LibraryPage<LibraryTrack> {
    const { page, pageSize, sort, sourceId } = pageFromQuery(query);
    const offset = (page - 1) * pageSize;
    const normalizedKey = isUnclassifiedGenreKey(genreKey) ? unclassifiedGenreKey : genreKeyFromTag(genreKey);
    const remote = isRemoteQuery(query);

    if (remote) {
      const sourceFilterSql = sourceId ? 'AND remote_tracks.source_id = ?' : '';
      const params = [normalizedKey, ...(sourceId ? [sourceId] : [])];
      const totalRow = this.getRow(
        `SELECT COUNT(*) AS total
         FROM remote_tracks
         INNER JOIN remote_sources ON remote_sources.id = remote_tracks.source_id
         WHERE remote_tracks.availability != 'missing'
           AND remote_sources.status = 'enabled'
           AND remote_sources.provider IN ${remoteProvidersSql}
           AND echo_genre_key(remote_tracks.genre) = ?
           ${sourceFilterSql}`,
        ...params,
      );
      const rows = this.allRows(
        `SELECT
          remote_tracks.id, remote_tracks.remote_path AS path, remote_tracks.remote_path, remote_tracks.stable_key,
          remote_tracks.title, remote_tracks.artist, remote_tracks.album, remote_tracks.album_artist,
          remote_tracks.track_no, remote_tracks.disc_no, remote_tracks.year, remote_tracks.genre,
          remote_tracks.duration, remote_tracks.codec, remote_tracks.sample_rate, remote_tracks.bit_depth, remote_tracks.bitrate,
          remote_tracks.cover_id, remote_tracks.field_sources_json, remote_tracks.source_id, remote_tracks.provider,
          remote_sources.display_name AS source_display_name, 'remote' AS media_type
         FROM remote_tracks
         INNER JOIN remote_sources ON remote_sources.id = remote_tracks.source_id
         WHERE remote_tracks.availability != 'missing'
           AND remote_sources.status = 'enabled'
           AND remote_sources.provider IN ${remoteProvidersSql}
           AND echo_genre_key(remote_tracks.genre) = ?
           ${sourceFilterSql}
         ${trackOrderSql(sort)}
         LIMIT ? OFFSET ?`,
        ...params,
        pageSize,
        offset,
      );
      const total = Number(totalRow?.total ?? 0);
      return {
        items: rows.map((row) => mapTrack(row)),
        page,
        pageSize,
        total,
        hasMore: offset + rows.length < total,
      };
    }

    const totalRow = this.getRow(
      `SELECT COUNT(*) AS total
       FROM tracks
       WHERE tracks.missing = 0
         AND echo_genre_key(tracks.genre) = ?`,
      normalizedKey,
    );
    const rows = this.allRows(
      `SELECT
        tracks.id, tracks.path, tracks.title, tracks.artist, tracks.album, tracks.album_artist,
        tracks.track_no, tracks.disc_no, tracks.year, tracks.genre,
        tracks.duration, tracks.codec, tracks.sample_rate, tracks.bit_depth, tracks.bitrate,
        tracks.cover_id, tracks.field_sources_json, 'local' AS media_type
       FROM tracks
       WHERE tracks.missing = 0
         AND echo_genre_key(tracks.genre) = ?
       ${trackOrderSql(sort)}
       LIMIT ? OFFSET ?`,
      normalizedKey,
      pageSize,
      offset,
    );
    const total = Number(totalRow?.total ?? 0);
    return {
      items: rows.map((row) => mapTrack(row)),
      page,
      pageSize,
      total,
      hasMore: offset + rows.length < total,
    };
  }

  getGenreAlbums(genreKey: string, query?: LibraryPageQuery): LibraryPage<LibraryAlbum> {
    const { page, pageSize, sort, sourceId } = pageFromQuery(query);
    const offset = (page - 1) * pageSize;
    const normalizedKey = isUnclassifiedGenreKey(genreKey) ? unclassifiedGenreKey : genreKeyFromTag(genreKey);
    const remote = isRemoteQuery(query);

    if (remote) {
      const sourceFilterSql = sourceId ? 'AND remote_tracks.source_id = ?' : '';
      const params = [normalizedKey, ...(sourceId ? [sourceId] : [])];
      const albumOrderSql = sort === 'titleDesc'
        ? 'ORDER BY title COLLATE NOCASE DESC'
        : sort === 'yearDesc'
          ? 'ORDER BY year DESC, title COLLATE NOCASE ASC'
          : 'ORDER BY title COLLATE NOCASE ASC';
      const totalRow = this.getRow(
        `SELECT COUNT(*) AS total FROM (
           SELECT remote_tracks.source_id, remote_tracks.album, remote_tracks.album_artist
           FROM remote_tracks
           INNER JOIN remote_sources ON remote_sources.id = remote_tracks.source_id
           WHERE remote_tracks.availability != 'missing'
             AND remote_sources.status = 'enabled'
             AND remote_sources.provider IN ${remoteProvidersSql}
             AND echo_genre_key(remote_tracks.genre) = ?
             ${sourceFilterSql}
           GROUP BY remote_tracks.source_id, remote_tracks.album, remote_tracks.album_artist
         )`,
        ...params,
      );
      const rows = this.allRows(
        `SELECT
          MIN(remote_tracks.id) AS id,
          remote_tracks.album AS title,
          remote_tracks.album_artist AS album_artist,
          MIN(remote_tracks.year) AS year,
          COUNT(*) AS track_count,
          SUM(COALESCE(remote_tracks.duration, 0)) AS duration,
          MIN(remote_tracks.cover_id) AS cover_id,
          remote_tracks.source_id AS source_id,
          remote_tracks.provider AS provider,
          remote_sources.display_name AS source_display_name,
          MIN(remote_tracks.id) AS album_key,
          'remote' AS media_type
         FROM remote_tracks
         INNER JOIN remote_sources ON remote_sources.id = remote_tracks.source_id
         WHERE remote_tracks.availability != 'missing'
           AND remote_sources.status = 'enabled'
           AND remote_sources.provider IN ${remoteProvidersSql}
           AND echo_genre_key(remote_tracks.genre) = ?
           ${sourceFilterSql}
         GROUP BY remote_tracks.source_id, remote_tracks.album, remote_tracks.album_artist, remote_tracks.provider, remote_sources.display_name
         ${albumOrderSql}
         LIMIT ? OFFSET ?`,
        ...params,
        pageSize,
        offset,
      );
      const total = Number(totalRow?.total ?? 0);
      return {
        items: rows.map((row) => mapAlbum(row)),
        page,
        pageSize,
        total,
        hasMore: offset + rows.length < total,
      };
    }

    const albumOrderSql = sort === 'titleDesc'
      ? 'ORDER BY albums.title COLLATE NOCASE DESC'
      : sort === 'yearDesc'
        ? 'ORDER BY albums.year DESC, albums.title COLLATE NOCASE ASC'
        : 'ORDER BY albums.title COLLATE NOCASE ASC';
    const totalRow = this.getRow(
      `SELECT COUNT(DISTINCT albums.id) AS total
       FROM albums
       INNER JOIN album_tracks ON album_tracks.album_id = albums.id
       INNER JOIN tracks ON tracks.id = album_tracks.track_id
       WHERE tracks.missing = 0
         AND echo_genre_key(tracks.genre) = ?`,
      normalizedKey,
    );
    const rows = this.allRows(
      `SELECT
        albums.id, albums.album_key, albums.title, albums.album_artist, albums.year,
        albums.track_count, albums.duration, albums.cover_id, 'local' AS media_type
       FROM albums
       WHERE albums.id IN (
         SELECT DISTINCT album_tracks.album_id
         FROM album_tracks
         INNER JOIN tracks ON tracks.id = album_tracks.track_id
         WHERE tracks.missing = 0
           AND echo_genre_key(tracks.genre) = ?
       )
       ${albumOrderSql}
       LIMIT ? OFFSET ?`,
      normalizedKey,
      pageSize,
      offset,
    );
    const total = Number(totalRow?.total ?? 0);
    if (total === 0 && rows.length === 0) {
      return emptyPage(page, pageSize);
    }
    return {
      items: rows.map((row) => mapAlbum(row)),
      page,
      pageSize,
      total,
      hasMore: offset + rows.length < total,
    };
  }

  private getRow(sql: string, ...params: unknown[]): DbRow | null {
    return this.database.prepare(sql).get(...params) as DbRow | undefined ?? null;
  }

  private allRows(sql: string, ...params: unknown[]): DbRow[] {
    return this.database.prepare(sql).all(...params) as DbRow[];
  }
}
