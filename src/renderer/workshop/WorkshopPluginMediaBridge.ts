import type {
  LibraryAlbum,
  LibraryArtist,
  LibraryGenre,
  LibraryPage,
  LibraryPlaylist,
  LibraryPlaylistItem,
  LibraryTrack,
} from '../../shared/types/library';
import { streamingStableKey } from '../../shared/mediaProviderIdentity';
import { isSidebarRouteId } from '../../shared/types/sidebar';
import type { useOptionalPlaybackQueue } from '../stores/PlaybackQueueProvider';

export type WorkshopPluginPlaybackQueue = ReturnType<typeof useOptionalPlaybackQueue>;

const maximumPageSize = 100;
const maximumTrackIds = 200;
const maximumDirectSourceUrlLength = 2_048;
const blockedPlatformHosts = new Set([
  'youtube.com',
  'youtu.be',
  'spotify.com',
  'soundcloud.com',
  'tidal.com',
  'qobuz.com',
  'music.163.com',
  'y.qq.com',
  'kugou.com',
  'bilibili.com',
]);

const boundedString = (value: unknown, maximumLength = 200): string | null =>
  typeof value === 'string' && value.length > 0 && value.length <= maximumLength ? value : null;

const boundedInteger = (value: unknown, minimum: number, maximum: number, fallback: number): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum
    ? value
    : fallback;

const readPageQuery = (payload: Record<string, unknown>) => {
  const page = boundedInteger(payload.page, 1, 100_000, 1);
  const pageSize = boundedInteger(payload.pageSize, 1, maximumPageSize, 50);
  const search = typeof payload.search === 'string' ? payload.search.trim().slice(0, 200) : '';
  return { page, pageSize, ...(search ? { search } : {}) };
};

const boundedTrackIds = (value: unknown): string[] => {
  if (!Array.isArray(value) || value.length === 0 || value.length > maximumTrackIds) return [];
  const ids = value.map((item) => boundedString(item, 160)).filter((item): item is string => item !== null);
  return ids.length === value.length ? [...new Set(ids)] : [];
};

const isBlockedPlatformHost = (hostname: string): boolean =>
  [...blockedPlatformHosts].some((host) => hostname === host || hostname.endsWith(`.${host}`));

const normalizeDirectSourceUrl = (value: unknown): URL => {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximumDirectSourceUrlLength) {
    throw new Error('direct-source-invalid');
  }
  try {
    const url = new URL(value.trim());
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
      throw new Error('direct-source-invalid');
    }
    if (isBlockedPlatformHost(url.hostname.toLowerCase())) {
      throw new Error('direct-source-platform-unsupported');
    }
    return url;
  } catch (error) {
    if (error instanceof Error && error.message === 'direct-source-platform-unsupported') throw error;
    throw new Error('direct-source-invalid');
  }
};

const encodeDirectSourceProviderTrackId = (url: string): string => {
  const bytes = new TextEncoder().encode(url);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
};

const hashText = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
};

export const getWorkshopPluginDirectSourceOrigin = (payload: Record<string, unknown>): string =>
  normalizeDirectSourceUrl(payload.url).origin;

const directSourceTrack = (payload: Record<string, unknown>): LibraryTrack => {
  const url = normalizeDirectSourceUrl(payload.url).toString();
  const providerTrackId = encodeDirectSourceProviderTrackId(url);
  const stableKey = streamingStableKey('m3u8', providerTrackId);
  const boundedMetadata = (value: unknown, fallback: string, maximumLength = 160): string =>
    typeof value === 'string' && value.trim() ? value.trim().slice(0, maximumLength) : fallback;
  const title = boundedMetadata(payload.title, new URL(url).hostname);
  const artist = boundedMetadata(payload.artist, 'Workshop Direct Source');
  return {
    id: `workshop-stream:${hashText(url.toLowerCase())}`,
    mediaType: 'streaming',
    isTemporary: true,
    isLiveStream: payload.live !== false,
    path: stableKey,
    provider: 'm3u8',
    providerTrackId,
    streamingQuality: 'standard',
    stableKey,
    title,
    artist,
    album: boundedMetadata(payload.album, 'Workshop Streams'),
    albumArtist: artist,
    trackNo: null,
    discNo: null,
    year: null,
    genre: null,
    duration: 0,
    codec: 'stream',
    sampleRate: null,
    bitDepth: null,
    bitrate: null,
    coverId: null,
    coverThumb: null,
    fieldSources: { title: 'workshop-plugin', artist: 'workshop-plugin', album: 'workshop-plugin' },
    unavailable: false,
  };
};

const safeCoverUrl = (value: unknown): string | null =>
  typeof value === 'string' && value.startsWith('echo-cover://') ? value : null;

export const sanitizeWorkshopPluginTrack = (track: LibraryTrack) => ({
  id: track.id,
  mediaType: track.mediaType ?? 'local',
  title: track.title,
  artist: track.artist,
  album: track.album,
  albumArtist: track.albumArtist,
  trackNo: track.trackNo,
  discNo: track.discNo,
  year: track.year,
  genre: track.genre,
  durationSeconds: Math.max(0, track.duration),
  codec: track.codec,
  sampleRate: track.sampleRate,
  bitDepth: track.bitDepth,
  bitrate: track.bitrate,
  coverUrl: safeCoverUrl(track.coverThumb),
  unavailable: track.unavailable === true,
});

const sanitizeAlbum = (album: LibraryAlbum) => ({
  id: album.id,
  mediaType: album.mediaType ?? 'local',
  title: album.title,
  albumArtist: album.albumArtist,
  year: album.year,
  trackCount: album.trackCount,
  durationSeconds: Math.max(0, album.duration),
  coverUrl: safeCoverUrl(album.coverThumb),
});

const sanitizeArtist = (artist: LibraryArtist) => ({
  id: artist.id,
  mediaType: artist.mediaType ?? 'local',
  name: artist.name,
  role: artist.role,
  trackCount: artist.trackCount,
  albumCount: artist.albumCount,
  coverUrl: safeCoverUrl(artist.avatarThumbUrl) ?? safeCoverUrl(artist.coverThumb),
});

const sanitizeGenre = (genre: LibraryGenre) => ({
  id: genre.genreKey,
  mediaType: genre.mediaType ?? 'local',
  name: genre.name,
  unclassified: genre.unclassified,
  trackCount: genre.trackCount,
  albumCount: genre.albumCount,
  coverUrl: safeCoverUrl(genre.coverThumb),
});

const isLocalPlaylist = (playlist: LibraryPlaylist): boolean => playlist.sourceProvider === 'local';

const sanitizePlaylist = (playlist: LibraryPlaylist) => ({
  id: playlist.id,
  name: playlist.name,
  description: playlist.description,
  kind: playlist.kind,
  itemCount: playlist.itemCount,
  coverUrl: safeCoverUrl(playlist.coverThumb),
});

const sanitizePlaylistItem = (item: LibraryPlaylistItem) => ({
  id: item.id,
  playlistId: item.playlistId,
  position: item.position,
  unavailable: item.unavailable,
  track: item.track ? sanitizeWorkshopPluginTrack(item.track) : null,
});

const sanitizePage = <TSource, TResult>(page: LibraryPage<TSource>, sanitize: (item: TSource) => TResult) => ({
  page: page.page,
  pageSize: page.pageSize,
  total: page.total,
  hasMore: page.hasMore,
  items: page.items.map(sanitize),
});

const loadTrack = async (trackId: unknown): Promise<LibraryTrack> => {
  const id = boundedString(trackId, 160);
  const track = id ? await window.echo?.library?.getTrack?.(id) : null;
  if (!track || track.unavailable) throw new Error('track-unavailable');
  return track;
};

export const snapshotWorkshopPluginQueue = (queue: WorkshopPluginPlaybackQueue) => ({
  currentQueueId: queue?.currentQueueId ?? null,
  currentTrack: queue?.currentTrack ? sanitizeWorkshopPluginTrack(queue.currentTrack) : null,
  canGoPrevious: queue?.canGoPrevious ?? false,
  canGoNext: queue?.canGoNext ?? false,
  items: queue?.items.slice(0, 500).map((item) => ({
    queueId: item.queueId,
    track: sanitizeWorkshopPluginTrack(item.track),
  })) ?? [],
});

export const runWorkshopPluginMediaAction = async (
  action: string,
  payload: Record<string, unknown>,
  queue: WorkshopPluginPlaybackQueue,
): Promise<unknown> => {
  if (action === 'sources:playDirect' || action === 'playback:playUrl') {
    if (!queue) throw new Error('queue-unavailable');
    const track = directSourceTrack(payload);
    await queue.playTrack(track, {
      source: { type: 'streaming', label: 'Workshop Direct Source', provider: 'm3u8' },
      routeToConnectOutput: false,
      forceRefresh: true,
    });
    return { track: sanitizeWorkshopPluginTrack(track) };
  }

  if (action === 'navigation:open') {
    const routeId = payload.routeId;
    if (!(isSidebarRouteId(routeId) || routeId === 'lyrics')) throw new Error('invalid-payload');
    window.dispatchEvent(new CustomEvent('app:navigate:route', { detail: routeId }));
    return null;
  }

  if (action.startsWith('queue:')) {
    if (!queue) throw new Error('queue-unavailable');
    if (action === 'queue:get') return snapshotWorkshopPluginQueue(queue);
    if (action === 'queue:playTrack') {
      const track = await loadTrack(payload.trackId);
      const requestedIds = boundedTrackIds(payload.queueTrackIds);
      const resolved = requestedIds.length > 0
        ? (await Promise.all(requestedIds.map((id) => window.echo?.library?.getTrack?.(id))))
          .filter((item): item is LibraryTrack => Boolean(item) && item?.unavailable !== true)
        : [track];
      if (!resolved.some((item) => item.id === track.id)) resolved.unshift(track);
      await queue.playTrack(track, {
        replaceQueueWith: resolved,
        source: { type: 'manual', label: '创意工坊插件' },
      });
      return { track: sanitizeWorkshopPluginTrack(track) };
    }
    if (action === 'queue:enqueueTrack') {
      const track = await loadTrack(payload.trackId);
      queue.appendToQueue(track, { type: 'manual', label: '创意工坊插件' });
      return { track: sanitizeWorkshopPluginTrack(track) };
    }
    const queueId = boundedString(payload.queueId, 160);
    if ((action === 'queue:playItem' || action === 'queue:removeItem') &&
        (!queueId || !queue.items.some((item) => item.queueId === queueId))) {
      throw new Error('invalid-payload');
    }
    if (action === 'queue:playItem') { await queue.playQueueItem(queueId!); return null; }
    if (action === 'queue:removeItem') { queue.removeQueueItem(queueId!); return null; }
    if (action === 'queue:clear') { queue.clearQueue(); return null; }
    throw new Error('action-unavailable');
  }

  const library = window.echo?.library;
  if (!library) throw new Error('library-unavailable');
  const query = readPageQuery(payload);
  const entityId = boundedString(payload.id, 200);

  if (action === 'library:getSummary') {
    const summary = await library.getSummary();
    return {
      trackCount: summary.songCount,
      albumCount: summary.albumCount,
      artistCount: summary.artistCount,
      totalDurationSeconds: summary.totalDuration,
    };
  }
  if (action === 'library:getTracks') return sanitizePage(await library.getTracks(query), sanitizeWorkshopPluginTrack);
  if (action === 'library:getAlbums') return sanitizePage(await library.getAlbums(query), sanitizeAlbum);
  if (action === 'library:getAlbumTracks') {
    if (!entityId) throw new Error('invalid-payload');
    return sanitizePage(await library.getAlbumTracks(entityId, query), sanitizeWorkshopPluginTrack);
  }
  if (action === 'library:getArtists') return sanitizePage(await library.getArtists(query), sanitizeArtist);
  if (action === 'library:getArtistTracks') {
    if (!entityId) throw new Error('invalid-payload');
    return sanitizePage(await library.getArtistTracks(entityId, query), sanitizeWorkshopPluginTrack);
  }
  if (action === 'library:getArtistAlbums') {
    if (!entityId) throw new Error('invalid-payload');
    return sanitizePage(await library.getArtistAlbums(entityId, query), sanitizeAlbum);
  }
  if (action === 'library:getGenres') return sanitizePage(await library.getGenres(query), sanitizeGenre);
  if (action === 'library:getGenreTracks') {
    if (!entityId) throw new Error('invalid-payload');
    return sanitizePage(await library.getGenreTracks(entityId, query), sanitizeWorkshopPluginTrack);
  }
  if (action === 'library:getGenreAlbums') {
    if (!entityId) throw new Error('invalid-payload');
    return sanitizePage(await library.getGenreAlbums(entityId, query), sanitizeAlbum);
  }
  if (action === 'library:getPlaylists') {
    return (await library.getPlaylists()).filter(isLocalPlaylist).map(sanitizePlaylist);
  }
  if (action === 'library:getPlaylistItems') {
    if (!entityId) throw new Error('invalid-payload');
    const playlist = await library.getPlaylist(entityId);
    if (!playlist || !isLocalPlaylist(playlist)) throw new Error('playlist-unavailable');
    return sanitizePage(await library.getPlaylistItems(entityId, query), sanitizePlaylistItem);
  }
  if (action === 'library:getLikedTracks') {
    return sanitizePage(await library.getLikedTracks(query), sanitizePlaylistItem);
  }
  if (action === 'library:getLikedTrackIds') {
    const trackIds = boundedTrackIds(payload.trackIds);
    if (trackIds.length === 0) throw new Error('invalid-payload');
    return library.getLikedTrackIds(trackIds);
  }
  if (action === 'library:toggleTrackLiked') {
    const trackId = boundedString(payload.trackId, 160);
    if (!trackId) throw new Error('invalid-payload');
    const result = await library.toggleTrackLiked(trackId);
    window.dispatchEvent(new Event('liked:tracks-changed'));
    return { trackId, liked: result.liked };
  }
  if (action === 'library:toggleAlbumLiked') {
    const albumId = boundedString(payload.albumId, 200);
    if (!albumId) throw new Error('invalid-payload');
    const result = await library.toggleAlbumLiked(albumId);
    return { albumId, liked: result.liked };
  }
  if (action === 'library:createPlaylist') {
    const name = typeof payload.name === 'string' ? payload.name.trim().slice(0, 120) : '';
    const description = typeof payload.description === 'string' ? payload.description.trim().slice(0, 500) : null;
    if (!name) throw new Error('invalid-payload');
    return sanitizePlaylist(await library.createPlaylist({ name, description }));
  }
  if (action === 'library:addTracksToPlaylist') {
    const playlistId = boundedString(payload.playlistId, 160);
    const trackIds = boundedTrackIds(payload.trackIds);
    const playlist = playlistId ? await library.getPlaylist(playlistId) : null;
    if (!playlist || !isLocalPlaylist(playlist) || trackIds.length === 0) throw new Error('invalid-payload');
    return (await library.addTracksToPlaylist(playlistId!, trackIds)).map(sanitizePlaylistItem);
  }
  throw new Error('action-unavailable');
};
