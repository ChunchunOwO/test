/** ECHO Workshop sandbox plug-in API v2. See echo-workshop-sdk.json for the version contract. */

type EchoWorkshopUnsubscribe = () => void;

interface EchoWorkshopPlaybackStatus {
  state: string;
  currentTrackId: string | null;
  positionSeconds: number;
  durationSeconds: number;
  volume: number | null;
}

interface EchoWorkshopSpectrum {
  bands: number[];
  energy: number;
  transient: number;
  state: string;
}

interface EchoWorkshopPageQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

interface EchoWorkshopTrack {
  id: string;
  mediaType?: string;
  title: string;
  artist?: string | null;
  album?: string | null;
  albumArtist?: string | null;
  durationSeconds?: number | null;
  codec?: string | null;
  sampleRate?: number | null;
  bitDepth?: number | null;
  bitrate?: number | null;
}

interface EchoWorkshopPage<T> {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  items: T[];
}

interface EchoWorkshopDirectSource {
  url: string;
  title?: string;
  artist?: string;
  album?: string;
  live?: boolean;
}

interface EchoWorkshopSourceTrack {
  providerTrackId: string;
  title: string;
  artist?: string;
  album?: string;
  durationSeconds?: number | null;
  source?: string;
  playable?: boolean;
  unavailableReason?: string;
}

interface EchoWorkshopSourceSearchRequest {
  query: string;
  page: number;
  pageSize: number;
}

interface EchoWorkshopSourceSearchResult {
  tracks: EchoWorkshopSourceTrack[];
  total?: number | null;
  hasMore?: boolean;
}

interface EchoWorkshopSourceProviderHandlers {
  search(request: EchoWorkshopSourceSearchRequest): EchoWorkshopSourceSearchResult | Promise<EchoWorkshopSourceSearchResult>;
  resolve(request: { providerTrackId: string }): EchoWorkshopDirectSource | Promise<EchoWorkshopDirectSource>;
}

interface EchoWorkshopLyricsCandidate {
  title?: string;
  language?: string;
  source?: string;
  sourceUrl?: string;
  confidence?: number;
  lrc?: string;
  text?: string;
}

interface EchoWorkshopLyricsRequest {
  track: {
    id: string | null;
    title: string;
    artist: string;
    album: string;
    durationSeconds: number;
  };
  query?: string;
}

interface EchoWorkshopMetadataCandidate {
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  genre?: string;
  year?: number;
  trackNo?: number;
  discNo?: number;
  bpm?: number;
  confidence?: number;
  source?: string;
  sourceUrl?: string;
}

interface EchoWorkshopCoverCandidate {
  imageUrl: string;
  title?: string;
  source?: string;
  sourceUrl?: string;
  width?: number;
  height?: number;
  confidence?: number;
}

interface EchoWorkshopNetworkRequest {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
}

interface EchoWorkshopNetworkResponse {
  url: string;
  status: number;
  statusText: string;
  ok: boolean;
  headers: Record<string, string>;
  body: string;
}

interface EchoWorkshopApi {
  commands: {
    /** A trackContextMenus command receives one sanitized EchoWorkshopTrack as its first argument. */
    register(id: string, metadata: { title: string }, handler: (...args: unknown[]) => unknown | Promise<unknown>): void;
  };
  events: {
    on(eventName: 'playback:status' | 'audio:spectrum' | 'queue:changed' | 'library:changed' | 'library:liked-changed' | 'settings:changed', handler: (payload: unknown) => unknown): EchoWorkshopUnsubscribe;
  };
  navigation: {
    open(routeId: string): Promise<null>;
  };
  playback: {
    getStatus(): Promise<EchoWorkshopPlaybackStatus>;
    play(): Promise<null>;
    pause(): Promise<null>;
    seek(positionSeconds: number): Promise<null>;
    getShareInfo(): Promise<unknown>;
    shareCurrentTrack(options: { uploadUrl: string; roomId?: string; headers?: Record<string, string> }): Promise<unknown>;
    getShareTask(taskId: string): Promise<unknown>;
    playUrl(url: string, metadata?: Omit<EchoWorkshopDirectSource, 'url'>): Promise<unknown>;
  };
  audio: {
    getSpectrum(): Promise<EchoWorkshopSpectrum>;
  };
  library: {
    getSummary(): Promise<Record<string, number | string | null>>;
    getTracks(query?: EchoWorkshopPageQuery): Promise<EchoWorkshopPage<EchoWorkshopTrack>>;
    getAlbums(query?: EchoWorkshopPageQuery): Promise<EchoWorkshopPage<Record<string, unknown>>>;
    getAlbumTracks(id: string, query?: EchoWorkshopPageQuery): Promise<EchoWorkshopPage<EchoWorkshopTrack>>;
    getArtists(query?: EchoWorkshopPageQuery): Promise<EchoWorkshopPage<Record<string, unknown>>>;
    getArtistTracks(id: string, query?: EchoWorkshopPageQuery): Promise<EchoWorkshopPage<EchoWorkshopTrack>>;
    getArtistAlbums(id: string, query?: EchoWorkshopPageQuery): Promise<EchoWorkshopPage<Record<string, unknown>>>;
    getGenres(query?: EchoWorkshopPageQuery): Promise<EchoWorkshopPage<Record<string, unknown>>>;
    getGenreTracks(id: string, query?: EchoWorkshopPageQuery): Promise<EchoWorkshopPage<EchoWorkshopTrack>>;
    getGenreAlbums(id: string, query?: EchoWorkshopPageQuery): Promise<EchoWorkshopPage<Record<string, unknown>>>;
    getPlaylists(): Promise<Array<Record<string, unknown>>>;
    getPlaylistItems(id: string, query?: EchoWorkshopPageQuery): Promise<EchoWorkshopPage<EchoWorkshopTrack>>;
    getLikedTracks(query?: EchoWorkshopPageQuery): Promise<EchoWorkshopPage<EchoWorkshopTrack>>;
    getLikedTrackIds(trackIds: string[]): Promise<string[]>;
    toggleTrackLiked(trackId: string): Promise<unknown>;
    toggleAlbumLiked(albumId: string): Promise<unknown>;
    createPlaylist(input: { name: string; description?: string }): Promise<Record<string, unknown>>;
    addTracksToPlaylist(playlistId: string, trackIds: string[]): Promise<unknown>;
  };
  queue: {
    get(): Promise<Record<string, unknown>>;
    playTrack(trackId: string, queueTrackIds?: string[]): Promise<unknown>;
    enqueueTrack(trackId: string): Promise<unknown>;
    playItem(queueId: string): Promise<unknown>;
    removeItem(queueId: string): Promise<unknown>;
    clear(): Promise<unknown>;
  };
  sources: {
    playDirect(source: EchoWorkshopDirectSource): Promise<unknown>;
    registerProvider(id: string, metadata: { title: string }, handlers: EchoWorkshopSourceProviderHandlers): void;
    search(providerId: string, request: Partial<EchoWorkshopSourceSearchRequest>): Promise<EchoWorkshopSourceSearchResult>;
    resolve(providerId: string, providerTrackId: string): Promise<EchoWorkshopDirectSource>;
  };
  agents: {
    register(id: string, metadata: { title: string }, handler: (input: unknown, context: { agentId: string }) => unknown | Promise<unknown>): void;
    run(agentId: string, input: unknown): Promise<unknown>;
  };
  network: {
    request(options: EchoWorkshopNetworkRequest): Promise<EchoWorkshopNetworkResponse>;
    get(url: string, options?: Omit<EchoWorkshopNetworkRequest, 'url' | 'method' | 'body'>): Promise<EchoWorkshopNetworkResponse>;
    post(url: string, body: string, options?: Omit<EchoWorkshopNetworkRequest, 'url' | 'method' | 'body'>): Promise<EchoWorkshopNetworkResponse>;
  };
  lyrics: {
    registerProvider(id: string, metadata: { title: string }, handler: (request: EchoWorkshopLyricsRequest) => { candidates: EchoWorkshopLyricsCandidate[] } | Promise<{ candidates: EchoWorkshopLyricsCandidate[] }>): void;
  };
  metadata: {
    registerProvider(id: string, metadata: { title: string }, handler: (request: { track: EchoWorkshopTrack }) => { candidates: EchoWorkshopMetadataCandidate[] } | Promise<{ candidates: EchoWorkshopMetadataCandidate[] }>): void;
  };
  covers: {
    registerProvider(id: string, metadata: { title: string }, handler: (request: { track: EchoWorkshopTrack }) => { candidates: EchoWorkshopCoverCandidate[] } | Promise<{ candidates: EchoWorkshopCoverCandidate[] }>): void;
  };
  settings: {
    get(): Promise<Record<string, string | number | boolean | null>>;
    get(settingId: string): Promise<string | number | boolean | null>;
    set(settingId: string, value: string | number | boolean | null): Promise<Record<string, string | number | boolean | null>>;
    onChanged(handler: (values: Record<string, string | number | boolean | null>) => unknown): EchoWorkshopUnsubscribe;
  };
  storage: {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<unknown>;
    remove(key: string): Promise<unknown>;
  };
  ui: {
    notify(message: string): Promise<null>;
  };
}

declare const echo: EchoWorkshopApi;
