import type { EchoDatabase } from '../../database/createDatabase';

type DbRow = Record<string, unknown>;

export type RemoteServerAlbumLocator = {
  sourceId: string;
  provider: 'subsonic' | 'jellyfin' | 'emby';
  serverAlbumId: string;
};

export type RemoteServerAlbumTrackPage = {
  rows: DbRow[];
  total: number;
};

const remoteAlbumPrefix = 'remote-album:';
const serverAlbumProviders = new Set<RemoteServerAlbumLocator['provider']>(['subsonic', 'jellyfin', 'emby']);
const serverAlbumIdentitySql = "NULLIF(TRIM(COALESCE(json_extract(remote_tracks.field_sources_json, '$.albumId'), json_extract(remote_tracks.field_sources_json, '$.serverAlbumId'), '')), '')";

const serverAlbumIdFromLocator = (locator: RemoteServerAlbumLocator): string =>
  `${remoteAlbumPrefix}${Buffer.from([locator.sourceId, locator.provider, 'server-album', locator.serverAlbumId].join('\u001f'), 'utf8').toString('hex')}`;

export const remoteServerAlbumLocatorFromId = (albumId: string): RemoteServerAlbumLocator | null => {
  if (!albumId.startsWith(remoteAlbumPrefix)) return null;
  const encoded = albumId.slice(remoteAlbumPrefix.length);
  if (!encoded || encoded.length % 2 !== 0 || !/^[0-9a-f]+$/iu.test(encoded)) return null;
  const decoded = Buffer.from(encoded, 'hex').toString('utf8');
  if (Buffer.from(decoded, 'utf8').toString('hex') !== encoded.toLocaleLowerCase()) return null;
  const [sourceId, rawProvider, kind, serverAlbumId, ...extra] = decoded.split('\u001f');
  if (!sourceId || !serverAlbumId || kind !== 'server-album' || extra.length > 0 || !serverAlbumProviders.has(rawProvider as RemoteServerAlbumLocator['provider'])) return null;
  return { sourceId, provider: rawProvider as RemoteServerAlbumLocator['provider'], serverAlbumId };
};

export const remoteServerAlbumIdForTrack = (database: EchoDatabase, trackId: string): string | null => {
  const row = database.prepare<[string], DbRow>(`
    SELECT remote_tracks.source_id, remote_tracks.provider, ${serverAlbumIdentitySql} AS server_album_id
    FROM remote_tracks
    INNER JOIN remote_sources ON remote_sources.id = remote_tracks.source_id
    WHERE remote_tracks.id = ?
      AND remote_tracks.availability != 'missing'
      AND remote_sources.status = 'enabled'
      AND remote_tracks.provider IN ('subsonic', 'jellyfin', 'emby')
    LIMIT 1
  `).get(trackId);
  const sourceId = typeof row?.source_id === 'string' ? row.source_id : '';
  const provider = typeof row?.provider === 'string' ? row.provider : '';
  const serverAlbumId = typeof row?.server_album_id === 'string' ? row.server_album_id : '';
  return sourceId && serverAlbumId && serverAlbumProviders.has(provider as RemoteServerAlbumLocator['provider'])
    ? serverAlbumIdFromLocator({ sourceId, provider: provider as RemoteServerAlbumLocator['provider'], serverAlbumId })
    : null;
};

export const readRemoteServerAlbum = (database: EchoDatabase, albumId: string): DbRow | null => {
  const locator = remoteServerAlbumLocatorFromId(albumId);
  if (!locator) return null;
  return database.prepare<[string, string, string, string, string], DbRow>(`
    WITH target_tracks AS (
      SELECT remote_tracks.*, remote_sources.display_name AS source_display_name
      FROM remote_tracks
      INNER JOIN remote_sources ON remote_sources.id = remote_tracks.source_id
      WHERE remote_tracks.source_id = ? AND remote_tracks.provider = ?
        AND ${serverAlbumIdentitySql} = ?
        AND remote_tracks.availability != 'missing' AND remote_sources.status = 'enabled'
    ), artist_counts AS (
      SELECT COALESCE(NULLIF(TRIM(artist), ''), 'Unknown Artist') AS artist_name, COUNT(*) AS artist_track_count
      FROM target_tracks GROUP BY echo_artist_merge_key(COALESCE(NULLIF(TRIM(artist), ''), 'Unknown Artist'))
    ), artist_ranked AS (
      SELECT artist_name, artist_track_count, SUM(artist_track_count) OVER () AS album_track_count,
        COUNT(*) OVER () AS artist_group_count,
        LEAD(artist_track_count, 1, 0) OVER (ORDER BY artist_track_count DESC, artist_name COLLATE NOCASE) AS next_artist_track_count,
        ROW_NUMBER() OVER (ORDER BY artist_track_count DESC, artist_name COLLATE NOCASE) AS artist_rank
      FROM artist_counts
    ), album_summary AS (
      SELECT ? AS id, 'remote' AS media_type, MIN(source_id) AS source_id, MIN(source_display_name) AS source_display_name,
        MIN(provider) AS provider, ? AS album_key, MIN(COALESCE(NULLIF(TRIM(album), ''), 'Unknown Album')) AS title,
        MIN(COALESCE(NULLIF(TRIM(album_artist), ''), NULLIF(TRIM(artist), ''), 'Unknown Artist')) AS fallback_album_artist,
        MIN(year) AS year, COUNT(*) AS track_count, COALESCE(SUM(COALESCE(duration, 0)), 0) AS duration,
        MIN(cover_id) AS cover_id,
        MIN(NULLIF(TRIM(COALESCE(json_extract(field_sources_json, '$.coverArt'), '')), '')) AS cover_art,
        MIN(CASE WHEN NULLIF(TRIM(COALESCE(json_extract(field_sources_json, '$.coverArt'), '')), '') IS NOT NULL THEN id END) AS cover_track_id
      FROM target_tracks HAVING COUNT(*) > 0
    )
    SELECT album_summary.*,
      CASE WHEN artist_ranked.artist_group_count <= 1 THEN COALESCE(artist_ranked.artist_name, album_summary.fallback_album_artist)
        WHEN artist_ranked.artist_track_count >= CAST((artist_ranked.album_track_count + 1) * 0.65 AS INTEGER)
          AND artist_ranked.artist_track_count > artist_ranked.next_artist_track_count THEN artist_ranked.artist_name
        ELSE 'Various Artists' END AS album_artist
    FROM album_summary LEFT JOIN artist_ranked ON artist_ranked.artist_rank = 1
  `).get(locator.sourceId, locator.provider, locator.serverAlbumId, albumId, albumId) ?? null;
};

export const readRemoteServerAlbumTracks = (
  database: EchoDatabase,
  albumId: string,
  pageSize: number,
  offset: number,
): RemoteServerAlbumTrackPage | null => {
  const locator = remoteServerAlbumLocatorFromId(albumId);
  if (!locator) return null;
  const params = [locator.sourceId, locator.provider, locator.serverAlbumId] as const;
  const rows = database.prepare<[string, string, string, number, number], DbRow>(`
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
    WHERE remote_tracks.source_id = ? AND remote_tracks.provider = ?
      AND ${serverAlbumIdentitySql} = ?
      AND remote_tracks.availability != 'missing' AND remote_sources.status = 'enabled'
    ORDER BY COALESCE(remote_tracks.disc_no, 1),
      CASE WHEN remote_tracks.track_no IS NULL THEN 1 ELSE 0 END,
      remote_tracks.track_no, remote_tracks.title COLLATE NOCASE
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);
  const total = Number(rows[0]?.total_count ?? (offset > 0 ? database.prepare<[string, string, string], { total: number }>(`
    SELECT COUNT(*) AS total FROM remote_tracks
    INNER JOIN remote_sources ON remote_sources.id = remote_tracks.source_id
    WHERE remote_tracks.source_id = ? AND remote_tracks.provider = ? AND ${serverAlbumIdentitySql} = ?
      AND remote_tracks.availability != 'missing' AND remote_sources.status = 'enabled'
  `).get(...params)?.total ?? 0 : 0));
  return { rows, total };
};
