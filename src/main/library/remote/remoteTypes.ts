import type {
  RemoteDirectoryItem,
  RemoteCoverResult,
  RemoteLibraryTrack,
  RemoteMetadataResult,
  RemoteScanItem,
  RemoteSource,
  RemoteSourceProvider,
  RemoteStreamUrlResult,
  TestRemoteSourceResult,
} from '../../../shared/types/remoteSources';

export type RemoteSourceSecret = RemoteSource & {
  secret: string | null;
};

export type RemoteAdapterInput = {
  source: RemoteSourceSecret;
  signal?: AbortSignal;
};

export type RemoteBrowseInput = RemoteAdapterInput & {
  path?: string | null;
};

export type RemoteReadMetadataInput = RemoteAdapterInput & {
  item: RemoteScanItem;
};

export type RemoteReadCoverInput = RemoteAdapterInput & {
  item: RemoteScanItem;
  size?: number;
};

export type RemoteReadLyricsInput = RemoteAdapterInput & {
  remotePath: string;
  title?: string | null;
  artist?: string | null;
};

export type RemoteLyricsResult = {
  provider: 'subsonic';
  providerLyricsId: string | null;
  displayTitle: string | null;
  displayArtist: string | null;
  language: string | null;
  synced: boolean;
  offsetMs: number;
  lines: Array<{
    startMs: number | null;
    text: string;
  }>;
};

export type RemoteStreamInput = RemoteAdapterInput & {
  remotePath: string;
  stableKey?: string | null;
  expiresInSeconds?: number;
};

export type RemoteProxyRequest = {
  url?: string;
  filePath?: string;
  headers?: Record<string, string>;
  fetchTransport?: 'network-proxy' | 'node';
  allowCertificateDateErrors?: boolean;
  zconnectWebSession?: boolean;
};

export type RemoteScanInput = RemoteAdapterInput & {
  rootPath?: string | null;
  onProgress?: (item: RemoteDirectoryItem) => void;
  onError?: (path: string, error: Error) => void;
  scanCache?: {
    get: (namespace: string, key: string) => { fingerprint: string; payload: string; verifiedAt: string } | null;
    set: (namespace: string, key: string, fingerprint: string, payload: string, verifiedAt?: string) => void;
  };
};

export type RemoteTrackWrite = Omit<RemoteLibraryTrack, 'coverThumb' | 'createdAt' | 'updatedAt'> & {
  remoteUrlHash: string;
  createdAt?: string;
  updatedAt?: string;
};

export interface RemoteSourceAdapter {
  provider: RemoteSourceProvider;
  clearSourceState?(sourceId: string): void;
  testConnection(input: RemoteAdapterInput): Promise<TestRemoteSourceResult>;
  browse(input: RemoteBrowseInput): Promise<RemoteDirectoryItem[]>;
  scan(input: RemoteScanInput): AsyncGenerator<RemoteScanItem>;
  readMetadata(input: RemoteReadMetadataInput): Promise<RemoteMetadataResult>;
  readCover?(input: RemoteReadCoverInput): Promise<RemoteCoverResult>;
  readLyrics?(input: RemoteReadLyricsInput): Promise<RemoteLyricsResult | null>;
  createProxyRequest?(input: RemoteStreamInput): Promise<RemoteProxyRequest> | RemoteProxyRequest;
  createStreamUrl(input: RemoteStreamInput): Promise<RemoteStreamUrlResult>;
}
