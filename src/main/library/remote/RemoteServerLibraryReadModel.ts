import type { EchoDatabase } from '../../database/createDatabase';
import type { ArtistInsights, ArtistInsightsOptions, LibraryArtist, LibraryPage } from '../../../shared/types/library';

type DbRow = Record<string, unknown>;

type RemoteServerPage = {
  rows: DbRow[];
  total: number;
};

type ServerAlbumSqlOptions = {
  includePlaybackStats?: boolean;
  includeSearchBlob?: boolean;
};

export type RemoteServerArtistLocator = {
  sourceId: string;
  artistKey: string;
};

export const remoteServerLibraryConfigurationKey = (options: {
  artistMergeStrategy?: unknown;
  remoteAlbumMergeStrategy?: unknown;
}): string => `${String(options.artistMergeStrategy ?? '')}\0${String(options.remoteAlbumMergeStrategy ?? '')}`;

export const remoteServerArtistInsights = (
  artist: LibraryArtist,
  options: ArtistInsightsOptions,
  generatedAt: string,
): ArtistInsights => ({
  artist,
  nodes: [],
  edges: [],
  onlineInfo: {
    status: 'empty',
    bio: null,
    imageCredits: [],
    externalLinks: [],
    sourceLabels: [],
    fetchedAt: null,
  },
  concerts: {
    status: 'not_configured',
    region: options.region ?? null,
    sources: [],
    events: [],
    fetchedAt: null,
    message: 'Configure artist event providers in Settings to load concerts.',
  },
  generatedAt,
});

const remoteArtistPrefix = 'remote-artist:';
const serverProvidersSql = "('subsonic', 'jellyfin', 'emby')";
const remoteProvidersSql = "('webdav', 'jellyfin', 'emby', 'smb', 'sshfs', 'subsonic')";
const eligibilityCacheTtlMs = 5_000;
const eligibilityCache = new WeakMap<EchoDatabase, Map<string, { checkedAt: number; result: boolean }>>();
const summaryCacheRefreshThrottleMs = 2_000;
const albumSummaryCacheTable = 'echo_remote_server_album_summaries';
const artistSummaryCacheTable = 'echo_remote_server_artist_summaries';
const artistTrackCacheTable = 'echo_remote_server_artist_tracks';
type SummaryCacheState = {
  initialized: boolean;
  dirty: boolean;
  builtAt: number;
  configurationKey: string;
  dataVersion: number;
};
const summaryCache = new WeakMap<EchoDatabase, SummaryCacheState>();
const readDatabaseDataVersion = (database: EchoDatabase): number => {
  const row = database.prepare('PRAGMA data_version').get() as { data_version?: number } | undefined;
  return Number(row?.data_version ?? 0);
};
const serverAlbumIdentitySql = (tableName: string): string =>
  `NULLIF(TRIM(COALESCE(json_extract(${tableName}.field_sources_json, '$.albumId'), json_extract(${tableName}.field_sources_json, '$.serverAlbumId'), '')), '')`;
const artistNameSql = (tableName: string): string =>
  `COALESCE(NULLIF(TRIM(${tableName}.artist), ''), 'Unknown Artist')`;
const artistKeySql = (tableName: string): string => `echo_artist_merge_key(${artistNameSql(tableName)})`;

const pageFromRows = (rows: DbRow[]): RemoteServerPage => ({
  rows,
  total: Number(rows[0]?.total_count ?? 0),
});

export const mapRemoteServerPage = <Item>(
  result: RemoteServerPage,
  page: number,
  pageSize: number,
  offset: number,
  mapRow: (row: DbRow) => Item,
): LibraryPage<Item> => ({
  items: result.rows.map(mapRow),
  page,
  pageSize,
  total: result.total,
  hasMore: offset + result.rows.length < result.total,
});

const sqlString = (value: string): string => `'${value.replaceAll("'", "''")}'`;
const selectedSourceSql = (sourceId: string | null, tableName: string, bindSource = true): string =>
  sourceId ? ` AND ${tableName}.source_id = ${bindSource ? '?' : sqlString(sourceId)}` : '';

const enabledServerSourceParams = (sourceId: string | null): unknown[] => (sourceId ? [sourceId] : []);

export const invalidateRemoteServerLibraryReadModel = (database: EchoDatabase): void => {
  eligibilityCache.delete(database);
  const state = summaryCache.get(database);
  if (state) {
    state.dirty = true;
  }
};

const rebuildRemoteServerSummaryCache = (database: EchoDatabase, configurationKey: string): void => {
  database.exec(`
    DROP TABLE IF EXISTS temp.${albumSummaryCacheTable};
    DROP TABLE IF EXISTS temp.${artistSummaryCacheTable};
    DROP TABLE IF EXISTS temp.${artistTrackCacheTable};

    CREATE TEMP TABLE ${albumSummaryCacheTable} AS
    ${serverAlbumsCte(null, null, false, { includeSearchBlob: true })}
    SELECT id, media_type, source_id, source_display_name, provider, album_key, title, album_artist,
      year, track_count, duration, cover_id, cover_art, cover_track_id, created_at, updated_at, added_at,
      sort_mtime_ms, playback_play_count, last_played_at, search_blob
    FROM server_albums;
    CREATE UNIQUE INDEX echo_remote_server_album_summaries_id ON ${albumSummaryCacheTable}(id);
    CREATE INDEX echo_remote_server_album_summaries_source ON ${albumSummaryCacheTable}(source_id);

    CREATE TEMP TABLE ${artistSummaryCacheTable} AS
    ${serverArtistsCte(null, false)}
    SELECT id, media_type, source_id, source_display_name, provider, artist_key, name, sort_name, role,
      track_count, album_count, cover_id, cover_source
    FROM server_artist_summaries;
    CREATE UNIQUE INDEX echo_remote_server_artist_summaries_id ON ${artistSummaryCacheTable}(id);
    CREATE INDEX echo_remote_server_artist_summaries_source ON ${artistSummaryCacheTable}(source_id);

    CREATE TEMP TABLE ${artistTrackCacheTable} AS
    SELECT remote_tracks.source_id,
      ${artistKeySql('remote_tracks')} AS artist_key,
      remote_tracks.id AS track_id
    FROM remote_tracks
    INNER JOIN remote_sources ON remote_sources.id = remote_tracks.source_id
    WHERE remote_tracks.availability != 'missing'
      AND remote_sources.status = 'enabled'
      AND remote_tracks.provider IN ${serverProvidersSql};
    CREATE UNIQUE INDEX echo_remote_server_artist_tracks_track ON ${artistTrackCacheTable}(track_id);
    CREATE INDEX echo_remote_server_artist_tracks_lookup ON ${artistTrackCacheTable}(source_id, artist_key);
  `);
  summaryCache.set(database, {
    initialized: true,
    dirty: false,
    builtAt: Date.now(),
    configurationKey,
    dataVersion: readDatabaseDataVersion(database),
  });
};

export const refreshRemoteServerLibraryReadModel = (database: EchoDatabase, configurationKey = ''): void => {
  rebuildRemoteServerSummaryCache(database, configurationKey);
};

const ensureRemoteServerSummaryCache = (database: EchoDatabase, configurationKey: string): boolean => {
  const state = summaryCache.get(database);
  if (state && state.dataVersion !== readDatabaseDataVersion(database)) {
    state.dirty = true;
  }
  if (
    state?.initialized
    && state.configurationKey === configurationKey
    && (!state.dirty || Date.now() - state.builtAt < summaryCacheRefreshThrottleMs)
  ) {
    return true;
  }

  try {
    rebuildRemoteServerSummaryCache(database, configurationKey);
    return true;
  } catch {
    summaryCache.delete(database);
    return false;
  }
};

export const canUseRemoteServerLibraryReadModel = (
  database: EchoDatabase,
  sourceId: string | null,
  configurationKey = '',
): boolean => {
  const cacheKey = sourceId ?? '*';
  const cached = eligibilityCache.get(database)?.get(cacheKey);
  if (cached && Date.now() - cached.checkedAt < eligibilityCacheTtlMs) {
    return cached.result && ensureRemoteServerSummaryCache(database, configurationKey);
  }

  const remember = (result: boolean): boolean => {
    const entries = eligibilityCache.get(database) ?? new Map<string, { checkedAt: number; result: boolean }>();
    entries.set(cacheKey, { checkedAt: Date.now(), result });
    eligibilityCache.set(database, entries);
    return result;
  };
  const sourceFilter = sourceId ? 'AND remote_sources.id = ?' : '';
  const sourceParams = enabledServerSourceParams(sourceId);
  const sourceSummary = database.prepare(`
    SELECT
      COUNT(*) AS enabled_count,
      SUM(CASE WHEN remote_sources.provider IN ${serverProvidersSql} THEN 0 ELSE 1 END) AS unsupported_count
    FROM remote_sources
    WHERE remote_sources.status = 'enabled' ${sourceFilter}
  `).get(...sourceParams) as DbRow | undefined;

  if (Number(sourceSummary?.enabled_count ?? 0) <= 0 || Number(sourceSummary?.unsupported_count ?? 0) > 0) {
    return remember(false);
  }

  const missingServerAlbum = database.prepare(`
    SELECT 1
    FROM remote_tracks
    INNER JOIN remote_sources ON remote_sources.id = remote_tracks.source_id
    WHERE remote_tracks.availability != 'missing'
      AND remote_sources.status = 'enabled'
      AND remote_tracks.provider IN ${serverProvidersSql}
      ${selectedSourceSql(sourceId, 'remote_tracks')}
      AND ${serverAlbumIdentitySql('remote_tracks')} IS NULL
    LIMIT 1
  `).get(...sourceParams);

  return remember(!missingServerAlbum && ensureRemoteServerSummaryCache(database, configurationKey));
};

export const supportsRemoteServerAlbumSort = (_sort: string): boolean => true;

const albumOrderSql = (sort: string): string => {
  switch (sort) {
    case 'artist':
    case 'artistAlbum':
      return 'ORDER BY echo_library_sort_key(album_artist) COLLATE NOCASE, album_artist COLLATE NOCASE, title COLLATE NOCASE';
    case 'recent':
      return 'ORDER BY added_at DESC, updated_at DESC, title COLLATE NOCASE';
    case 'trackCountAsc':
      return 'ORDER BY track_count ASC, title COLLATE NOCASE';
    case 'trackCountDesc':
      return 'ORDER BY track_count DESC, title COLLATE NOCASE';
    case 'yearAsc':
      return 'ORDER BY year IS NULL, year ASC, title COLLATE NOCASE';
    case 'yearDesc':
      return 'ORDER BY year IS NULL, year DESC, title COLLATE NOCASE';
    case 'createdDesc':
      return 'ORDER BY updated_at DESC, title COLLATE NOCASE';
    case 'createdAsc':
      return 'ORDER BY created_at ASC, title COLLATE NOCASE';
    case 'titleDesc':
      return 'ORDER BY echo_library_sort_key(title) COLLATE NOCASE DESC, title COLLATE NOCASE DESC';
    case 'durationAsc':
      return 'ORDER BY duration ASC, title COLLATE NOCASE';
    case 'durationDesc':
      return 'ORDER BY duration DESC, title COLLATE NOCASE';
    case 'fileModifiedAsc':
      return 'ORDER BY sort_mtime_ms ASC, title COLLATE NOCASE';
    case 'fileModifiedDesc':
      return 'ORDER BY sort_mtime_ms DESC, title COLLATE NOCASE';
    case 'random':
      return 'ORDER BY RANDOM()';
    default:
      return 'ORDER BY echo_library_sort_key(title) COLLATE NOCASE, title COLLATE NOCASE, echo_library_sort_key(album_artist) COLLATE NOCASE, album_artist COLLATE NOCASE';
  }
};

const serverAlbumsCte = (
  sourceId: string | null,
  artistLocator: RemoteServerArtistLocator | null,
  bindSource = true,
  options: ServerAlbumSqlOptions = {},
): string => {
  const playbackStatsCte = options.includePlaybackStats
    ? `remote_track_playback_stats AS (
        SELECT provider, stable_key, SUM(completed_count) AS play_count, MAX(last_started_at) AS last_played_at
        FROM playback_history_stats
        WHERE media_type = 'remote' AND stable_key IS NOT NULL
        GROUP BY provider, stable_key
      ),`
    : '';
  const playbackStatsJoin = options.includePlaybackStats
    ? `LEFT JOIN remote_track_playback_stats
        ON remote_track_playback_stats.provider = remote_tracks.provider
       AND remote_track_playback_stats.stable_key = remote_tracks.stable_key`
    : '';
  const playbackStatsColumns = options.includePlaybackStats
    ? 'COALESCE(remote_track_playback_stats.play_count, 0) AS playback_play_count, remote_track_playback_stats.last_played_at'
    : '0 AS playback_play_count, NULL AS last_played_at';
  const albumScopeCte = artistLocator
    ? `matching_album_ids AS (
        SELECT DISTINCT ${serverAlbumIdentitySql('matching_tracks')} AS server_album_id
        FROM ${artistTrackCacheTable} AS matching_artist_tracks
        INNER JOIN remote_tracks AS matching_tracks ON matching_tracks.id = matching_artist_tracks.track_id
        WHERE matching_artist_tracks.source_id = ?
          AND matching_artist_tracks.artist_key = ?
          AND ${serverAlbumIdentitySql('matching_tracks')} IS NOT NULL
      ),`
    : '';
  const albumScopeFilter = artistLocator
    ? `AND ${serverAlbumIdentitySql('remote_tracks')} IN (SELECT server_album_id FROM matching_album_ids)`
    : '';

  return `WITH ${playbackStatsCte}${albumScopeCte}
    target_track_base AS (
      SELECT remote_tracks.*, remote_sources.display_name AS source_display_name,
        ${serverAlbumIdentitySql('remote_tracks')} AS server_album_id,
        ${playbackStatsColumns}
      FROM remote_tracks
      INNER JOIN remote_sources ON remote_sources.id = remote_tracks.source_id
      ${playbackStatsJoin}
      WHERE remote_tracks.availability != 'missing'
        AND remote_sources.status = 'enabled'
        AND remote_tracks.provider IN ${serverProvidersSql}
        ${selectedSourceSql(sourceId, 'remote_tracks', bindSource)}
        ${albumScopeFilter}
    ),
    target_tracks AS (
      SELECT target_track_base.*,
        'remote-album:' || lower(hex(source_id || char(31) || provider || char(31) || 'server-album' || char(31) || server_album_id)) AS album_id,
        ${artistNameSql('target_track_base')} AS artist_name
      FROM target_track_base
      WHERE server_album_id IS NOT NULL
    ),
    remote_albums AS (
      SELECT album_id AS id, 'remote' AS media_type, source_id, MIN(source_display_name) AS source_display_name,
        provider, album_id AS album_key, MIN(COALESCE(NULLIF(TRIM(album), ''), 'Unknown Album')) AS title,
        MIN(COALESCE(NULLIF(TRIM(album_artist), ''), NULLIF(TRIM(artist), ''), 'Unknown Artist')) AS fallback_album_artist,
        MIN(year) AS year, COUNT(*) AS track_count, COALESCE(SUM(COALESCE(duration, 0)), 0) AS duration,
        MIN(cover_id) AS cover_id,
        MIN(NULLIF(TRIM(COALESCE(json_extract(field_sources_json, '$.coverArt'), '')), '')) AS cover_art,
        MIN(CASE WHEN NULLIF(TRIM(COALESCE(json_extract(field_sources_json, '$.coverArt'), '')), '') IS NOT NULL THEN id END) AS cover_track_id,
        MIN(created_at) AS created_at, MAX(updated_at) AS updated_at, MAX(created_at) AS added_at,
        MAX(COALESCE(CAST(strftime('%s', modified_at) AS INTEGER) * 1000, 0)) AS sort_mtime_ms,
        COALESCE(SUM(playback_play_count), 0) AS playback_play_count, MAX(last_played_at) AS last_played_at,
        ${options.includeSearchBlob
          ? "GROUP_CONCAT(COALESCE(search_terms, '') || ' ' || title || ' ' || artist || ' ' || album_artist || ' ' || COALESCE(genre, '') || ' ' || remote_path, ' ')"
          : "''"} AS search_blob
      FROM target_tracks
      GROUP BY album_id, source_id, provider
    ),
    album_artist_counts AS (
      SELECT album_id, ${artistKeySql('target_tracks')} AS artist_key, MIN(artist_name) AS artist_name,
        COUNT(*) AS artist_track_count
      FROM target_tracks
      GROUP BY album_id, artist_key
    ),
    album_artist_ranked AS (
      SELECT album_id, artist_name, artist_track_count,
        SUM(artist_track_count) OVER (PARTITION BY album_id) AS album_track_count,
        COUNT(*) OVER (PARTITION BY album_id) AS artist_group_count,
        LEAD(artist_track_count, 1, 0) OVER (PARTITION BY album_id ORDER BY artist_track_count DESC, artist_name COLLATE NOCASE) AS next_artist_track_count,
        ROW_NUMBER() OVER (PARTITION BY album_id ORDER BY artist_track_count DESC, artist_name COLLATE NOCASE) AS artist_rank
      FROM album_artist_counts
    ),
    server_albums AS (
      SELECT remote_albums.*,
        CASE
          WHEN album_artist_ranked.artist_group_count <= 1 THEN COALESCE(album_artist_ranked.artist_name, remote_albums.fallback_album_artist)
          WHEN album_artist_ranked.artist_track_count >= CAST((album_artist_ranked.album_track_count + 1) * 0.65 AS INTEGER)
            AND album_artist_ranked.artist_track_count > album_artist_ranked.next_artist_track_count
          THEN album_artist_ranked.artist_name
          ELSE 'Various Artists'
        END AS album_artist
      FROM remote_albums
      LEFT JOIN album_artist_ranked ON album_artist_ranked.album_id = remote_albums.id AND album_artist_ranked.artist_rank = 1
    )`;
};

export const remoteServerAlbumsSql = (
  sourceId: string | null,
  options: ServerAlbumSqlOptions = {},
): string => options.includePlaybackStats
  ? `${serverAlbumsCte(sourceId, null, false, options)},
    library_albums AS (SELECT * FROM server_albums)`
  : `WITH library_albums AS (SELECT * FROM ${albumSummaryCacheTable})`;

const albumQueryParams = (
  sourceId: string | null,
  artistLocator: RemoteServerArtistLocator | null,
  pageSize: number,
  offset: number,
): unknown[] => [
  ...(artistLocator ? [artistLocator.sourceId, artistLocator.artistKey] : []),
  ...enabledServerSourceParams(sourceId),
  pageSize,
  offset,
];

const serverArtistsCte = (sourceId: string | null, bindSource = true): string => `WITH target_tracks AS (
  SELECT remote_tracks.*, remote_sources.display_name AS source_display_name,
    ${artistKeySql('remote_tracks')} AS artist_key,
    ${artistNameSql('remote_tracks')} AS artist_name,
    ${serverAlbumIdentitySql('remote_tracks')} AS server_album_id
  FROM remote_tracks
  INNER JOIN remote_sources ON remote_sources.id = remote_tracks.source_id
  WHERE remote_tracks.availability != 'missing'
    AND remote_sources.status = 'enabled'
    AND remote_tracks.provider IN ${serverProvidersSql}
    ${selectedSourceSql(sourceId, 'remote_tracks', bindSource)}
), server_artist_summaries AS (
  SELECT 'remote-artist:' || lower(hex(source_id || char(31) || artist_key)) AS id,
    'remote' AS media_type, source_id, MIN(source_display_name) AS source_display_name, provider,
    artist_key, MIN(artist_name) AS name, artist_key AS sort_name, 'both' AS role,
    COUNT(*) AS track_count, COUNT(DISTINCT server_album_id) AS album_count, MIN(cover_id) AS cover_id,
    NULL AS cover_source
  FROM target_tracks
  GROUP BY source_id, provider, artist_key
), server_artists AS (
  SELECT server_artist_summaries.*,
    artist_image_cache.status AS avatar_status, artist_image_cache.provider AS avatar_provider,
    artist_image_cache.source_hash AS avatar_source_hash, artist_image_cache.thumb_path AS avatar_thumb_path,
    artist_image_cache.medium_path AS avatar_medium_path, artist_image_cache.large_path AS avatar_large_path
  FROM server_artist_summaries
  LEFT JOIN artist_image_cache ON artist_image_cache.artist_key = server_artist_summaries.artist_key
)`;

export const remoteServerArtistsSql = (_sourceId: string | null): string => `WITH library_artists AS (
  SELECT ${artistSummaryCacheTable}.*,
    artist_image_cache.status AS avatar_status, artist_image_cache.provider AS avatar_provider,
    artist_image_cache.source_hash AS avatar_source_hash, artist_image_cache.thumb_path AS avatar_thumb_path,
    artist_image_cache.medium_path AS avatar_medium_path, artist_image_cache.large_path AS avatar_large_path
  FROM ${artistSummaryCacheTable}
  LEFT JOIN artist_image_cache ON artist_image_cache.artist_key = ${artistSummaryCacheTable}.artist_key
)`;

export const remoteServerArtistLocatorFromId = (artistId: string): RemoteServerArtistLocator | null => {
  if (!artistId.startsWith(remoteArtistPrefix)) return null;
  const encoded = artistId.slice(remoteArtistPrefix.length);
  if (!encoded || encoded.length % 2 !== 0 || !/^[0-9a-f]+$/iu.test(encoded)) return null;
  const decoded = Buffer.from(encoded, 'hex').toString('utf8');
  if (Buffer.from(decoded, 'utf8').toString('hex') !== encoded.toLowerCase()) return null;
  const [sourceId, artistKey, ...extra] = decoded.split('\u001f');
  return sourceId && artistKey && extra.length === 0 ? { sourceId, artistKey } : null;
};

const isEnabledServerArtist = (database: EchoDatabase, locator: RemoteServerArtistLocator): boolean => Boolean(database.prepare(`
  SELECT 1 FROM remote_sources
  WHERE id = ? AND status = 'enabled' AND provider IN ${serverProvidersSql}
  LIMIT 1
`).get(locator.sourceId));

const isEnabledRemoteArtist = (database: EchoDatabase, locator: RemoteServerArtistLocator): boolean => Boolean(database.prepare(`
  SELECT 1 FROM remote_sources
  WHERE id = ? AND status = 'enabled' AND provider IN ${remoteProvidersSql}
  LIMIT 1
`).get(locator.sourceId));

export const readRemoteArtistTracks = (
  database: EchoDatabase,
  artistId: string,
  pageSize: number,
  offset: number,
): RemoteServerPage | null => {
  const locator = remoteServerArtistLocatorFromId(artistId);
  if (!locator || !isEnabledRemoteArtist(database, locator)) return null;
  const useServerCache = isEnabledServerArtist(database, locator)
    && canUseRemoteServerLibraryReadModel(database, locator.sourceId);
  const artistJoin = useServerCache
    ? `INNER JOIN ${artistTrackCacheTable} AS remote_artist_tracks
        ON remote_artist_tracks.track_id = remote_tracks.id
       AND remote_artist_tracks.source_id = ?
       AND remote_artist_tracks.artist_key = ?`
    : '';
  const artistFilter = useServerCache ? '' : `AND ${artistKeySql('remote_tracks')} = ?`;
  const artistParams = useServerCache
    ? [locator.sourceId, locator.artistKey, locator.sourceId]
    : [locator.sourceId, locator.artistKey];
  const rows = database.prepare(`
    SELECT remote_tracks.id, 'remote' AS media_type,
      'remote://' || remote_tracks.source_id || remote_tracks.remote_path AS path,
      remote_tracks.source_id, remote_sources.display_name AS source_display_name, remote_tracks.provider,
      remote_tracks.remote_path, remote_tracks.stable_key, remote_tracks.title, remote_tracks.artist,
      remote_tracks.album, remote_tracks.album_artist, remote_tracks.track_no, remote_tracks.disc_no,
      remote_tracks.year, remote_tracks.genre, COALESCE(remote_tracks.duration, 0) AS duration,
      remote_tracks.codec, remote_tracks.sample_rate, remote_tracks.bit_depth, remote_tracks.bitrate,
      NULL AS bpm, NULL AS bpm_confidence, NULL AS beat_offset_ms, 'none' AS analysis_status,
      NULL AS analysis_updated_at, remote_tracks.cover_id, remote_tracks.metadata_status,
      'present' AS embedded_metadata_status,
      CASE WHEN remote_tracks.cover_id IS NULL THEN 'missing' ELSE 'present' END AS embedded_cover_status,
      'none' AS network_metadata_status, remote_tracks.field_sources_json, remote_tracks.availability,
      COUNT(*) OVER () AS total_count
    FROM remote_tracks
    INNER JOIN remote_sources ON remote_sources.id = remote_tracks.source_id
    ${artistJoin}
    WHERE remote_tracks.source_id = ?
      AND remote_sources.status = 'enabled'
      AND remote_tracks.provider IN ${remoteProvidersSql}
      AND remote_tracks.availability != 'missing'
      ${artistFilter}
    ORDER BY remote_tracks.album COLLATE NOCASE, COALESCE(remote_tracks.disc_no, 0),
      COALESCE(remote_tracks.track_no, 0), remote_tracks.title COLLATE NOCASE
    LIMIT ? OFFSET ?
  `).all(...artistParams, pageSize, offset) as DbRow[];
  return pageFromRows(rows);
};

export const readRemoteServerArtistAlbums = (
  database: EchoDatabase,
  artistId: string,
  pageSize: number,
  offset: number,
  sort: string,
): RemoteServerPage | null => {
  const locator = remoteServerArtistLocatorFromId(artistId);
  if (
    !locator
    || !isEnabledServerArtist(database, locator)
    || !supportsRemoteServerAlbumSort(sort)
    || !canUseRemoteServerLibraryReadModel(database, locator.sourceId)
  ) return null;
  const rows = database.prepare(`
    ${serverAlbumsCte(locator.sourceId, locator, true, {
      includePlaybackStats: sort === 'lastPlayed' || sort === 'playCountAsc' || sort === 'playCountDesc',
    })}
    SELECT id, media_type, source_id, source_display_name, provider, album_key, title, album_artist,
      year, track_count, duration, cover_id, cover_art, cover_track_id, COUNT(*) OVER () AS total_count
    FROM server_albums
    ${albumOrderSql(sort)}
    LIMIT ? OFFSET ?
  `).all(...albumQueryParams(locator.sourceId, locator, pageSize, offset)) as DbRow[];
  return pageFromRows(rows);
};
