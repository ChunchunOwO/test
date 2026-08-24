import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { opendir, realpath, stat } from 'node:fs/promises';
import { parseFile } from 'music-metadata';
import type {
  RemoteCoverResult,
  RemoteDirectoryItem,
  RemoteMetadataResult,
  RemoteScanItem,
  RemoteSourceProvider,
  RemoteStreamUrlResult,
  TestRemoteSourceResult,
} from '../../../../shared/types/remoteSources';
import type {
  RemoteAdapterInput,
  RemoteBrowseInput,
  RemoteReadCoverInput,
  RemoteReadMetadataInput,
  RemoteScanInput,
  RemoteSourceAdapter,
  RemoteStreamInput,
} from '../remoteTypes';
import {
  normalizeRemoteDirectoryPath,
  normalizeRemotePath,
  remoteUrlHashFor,
  stableKeyForFileSystem,
} from '../remoteIdentity';
import { SCANNABLE_AUDIO_EXTENSIONS } from '../../../../shared/constants/audioExtensions';
import { sanitizeRemoteErrorMessage } from '../remoteSourceSecurity';

type FileSystemProvider = Extract<RemoteSourceProvider, 'smb' | 'sshfs'>;

const audioExtensions = SCANNABLE_AUDIO_EXTENSIONS;
const maximumFileSystemDirectoriesPerScan = 100_000;
const maximumFileSystemEntriesPerDirectory = 20_000;
const maximumFileSystemTracksPerScan = 1_000_000;

const nowIso = (): string => new Date().toISOString();
const cleanText = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);
const cleanNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};
const clampInt = (value: unknown, fallback: number, min: number, max: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
};

const displayNameFor = (provider: FileSystemProvider): string => (provider === 'smb' ? 'NAS / SMB' : 'SSHFS');

const trimPathPart = (value: string): string => value.replace(/^[/\\]+|[/\\]+$/gu, '');

const inferTitle = (remotePath: string): string => basename(remotePath, extname(remotePath)).replace(/[_-]+/g, ' ').trim() || 'Untitled';

class RemoteFileSystemScanLimitError extends Error {}

type RemoteFileSystemScanState = {
  discoveredDirectories: number;
  discoveredTracks: number;
  fatalError: RemoteFileSystemScanLimitError | null;
};

export class RemoteFileSystemAdapter implements RemoteSourceAdapter {
  private streamUrlResolver: ((input: RemoteStreamInput) => Promise<RemoteStreamUrlResult>) | null = null;

  constructor(readonly provider: FileSystemProvider) {}

  setStreamUrlResolver(resolver: (input: RemoteStreamInput) => Promise<RemoteStreamUrlResult>): void {
    this.streamUrlResolver = resolver;
  }

  async testConnection(input: RemoteAdapterInput): Promise<TestRemoteSourceResult> {
    const testedAt = nowIso();
    try {
      const root = await this.resolveRoot(input.source);
      const rootStat = await stat(root);
      if (!rootStat.isDirectory()) {
        return { ok: false, status: 'error', message: `${displayNameFor(this.provider)} 路径不是文件夹。`, testedAt };
      }

      return { ok: true, status: 'enabled', message: '连接成功。', testedAt };
    } catch (error) {
      return {
        ok: false,
        status: 'error',
        message: `${displayNameFor(this.provider)} 路径不可访问：${sanitizeRemoteErrorMessage(error)}`,
        testedAt,
      };
    }
  }

  async browse(input: RemoteBrowseInput): Promise<RemoteDirectoryItem[]> {
    const root = await this.resolveRoot(input.source);
    const requestedPath = normalizeRemoteDirectoryPath(input.path ?? '/');
    const directoryPath = await this.resolveItemPath(input.source, requestedPath);
    const directory = await opendir(directoryPath);
    const items: RemoteDirectoryItem[] = [];
    let entryCount = 0;

    for await (const entry of directory) {
      entryCount += 1;
      if (entryCount > maximumFileSystemEntriesPerDirectory) {
        throw new Error('Mounted directory contains too many entries to browse safely.');
      }
      if (entry.isSymbolicLink()) {
        continue;
      }
      const absolutePath = await realpath(join(directoryPath, entry.name));
      this.assertContained(root, absolutePath);
      const entryStat = await stat(absolutePath);
      const remotePath = this.remotePathFor(root, absolutePath, entry.isDirectory());
      const extension = extname(entry.name).toLocaleLowerCase();
      items.push({
        sourceId: input.source.id,
        provider: this.provider,
        path: remotePath,
        name: entry.name,
        kind: entry.isDirectory() ? 'directory' : 'file',
        sizeBytes: entry.isFile() ? entryStat.size : null,
        modifiedAt: entryStat.mtime.toISOString(),
        etag: null,
        contentType: null,
        audio: entry.isFile() && audioExtensions.has(extension),
      });
    }

    return items.sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === 'directory' ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });
  }

  async *scan(input: RemoteScanInput): AsyncGenerator<RemoteScanItem> {
    const root = await this.resolveRoot(input.source);
    const scanRoot = input.rootPath ? await this.resolveItemPath(input.source, input.rootPath) : root;
    const concurrency = clampInt(input.source.config.scanConcurrency, 3, 1, 6);
    const pendingDirectories = [scanRoot];
    const readyFiles: RemoteScanItem[] = [];
    const inFlight = new Set<Promise<void>>();
    const scanState: RemoteFileSystemScanState = {
      discoveredDirectories: 1,
      discoveredTracks: 0,
      fatalError: null,
    };

    const startNext = (): void => {
      while (!input.signal?.aborted && !scanState.fatalError && pendingDirectories.length > 0 && inFlight.size < concurrency) {
        const current = pendingDirectories.shift()!;
        const task = this.scanDirectory(input, root, current, pendingDirectories, readyFiles, scanState)
          .catch((error: unknown) => {
            if (error instanceof RemoteFileSystemScanLimitError) {
              scanState.fatalError = error;
              return;
            }
            input.onError?.(this.remotePathFor(root, current, true), error instanceof Error ? error : new Error(String(error)));
          })
          .finally(() => {
            inFlight.delete(task);
          });
        inFlight.add(task);
      }
    };

    while (!input.signal?.aborted) {
      startNext();
      if (scanState.fatalError) {
        throw scanState.fatalError;
      }
      if (readyFiles.length > 0) {
        yield readyFiles.shift()!;
        continue;
      }
      if (inFlight.size === 0) {
        return;
      }
      await Promise.race(inFlight);
      if (scanState.fatalError) {
        throw scanState.fatalError;
      }
    }
  }

  async readMetadata(input: RemoteReadMetadataInput): Promise<RemoteMetadataResult> {
    const fallback = this.fallbackMetadata(input.item.path);
    try {
      const filePath = await this.resolveItemPath(input.source, input.item.path);
      const metadata = await parseFile(filePath, { duration: true, skipCovers: true });
      const common = metadata.common;
      const format = metadata.format;
      const artist = cleanText(common.artist) ?? fallback.artist;
      const albumArtist = cleanText(common.albumartist) ?? artist;
      const duration = cleanNumber(format.duration);

      return {
        status: duration ? 'ok' : 'partial',
        title: cleanText(common.title) ?? fallback.title,
        artist,
        album: cleanText(common.album) ?? fallback.album,
        albumArtist,
        trackNo: cleanNumber(common.track.no),
        discNo: cleanNumber(common.disk.no),
        year: cleanNumber(common.year),
        genre: Array.isArray(common.genre) ? cleanText(common.genre[0]) : null,
        duration,
        codec: cleanText(format.codec) ?? (extname(input.item.path).slice(1).toUpperCase() || null),
        sampleRate: cleanNumber(format.sampleRate),
        bitDepth: cleanNumber(format.bitsPerSample),
        bitrate: cleanNumber(format.bitrate),
        fieldSources: {
          title: common.title ? 'embedded' : 'filename_fallback',
          artist: common.artist ? 'embedded' : 'filename_fallback',
          album: common.album ? 'embedded' : 'filename_fallback',
          albumArtist: common.albumartist ? 'embedded' : common.artist ? 'artist_fallback' : 'filename_fallback',
          duration: duration ? 'technical' : 'unknown',
        },
        warnings: duration ? [] : ['duration_unavailable'],
        errors: [],
      };
    } catch (error) {
      return {
        ...fallback,
        errors: [sanitizeRemoteErrorMessage(error)],
      };
    }
  }

  async readCover(input: RemoteReadCoverInput): Promise<RemoteCoverResult> {
    try {
      const filePath = await this.resolveItemPath(input.source, input.item.path);
      const metadata = await parseFile(filePath, { duration: false, skipCovers: false });
      const picture = metadata.common.picture?.[0];
      if (!picture?.data?.byteLength) {
        return this.emptyCover('cover_not_found');
      }

      return {
        status: 'ok',
        data: picture.data,
        mimeType: picture.format || null,
        fieldSources: { cover: 'embedded' },
        warnings: [],
        errors: [],
      };
    } catch (error) {
      return {
        ...this.emptyCover('cover_read_failed'),
        errors: [sanitizeRemoteErrorMessage(error)],
      };
    }
  }

  async createProxyRequest(input: RemoteStreamInput): Promise<{ filePath: string }> {
    return { filePath: await this.resolveItemPath(input.source, input.remotePath) };
  }

  async createStreamUrl(input: RemoteStreamInput): Promise<RemoteStreamUrlResult> {
    if (!this.streamUrlResolver) {
      throw new Error('Remote stream proxy is not available');
    }
    return this.streamUrlResolver(input);
  }

  private async scanDirectory(
    input: RemoteScanInput,
    root: string,
    directoryPath: string,
    pendingDirectories: string[],
    readyFiles: RemoteScanItem[],
    scanState: RemoteFileSystemScanState,
  ): Promise<void> {
    const directory = await opendir(directoryPath);
    let entryCount = 0;
    for await (const entry of directory) {
      if (input.signal?.aborted || scanState.fatalError) {
        return;
      }

      entryCount += 1;
      if (entryCount > maximumFileSystemEntriesPerDirectory) {
        throw new RemoteFileSystemScanLimitError('Mounted directory contains too many entries to scan safely.');
      }

      if (entry.isSymbolicLink()) {
        continue;
      }
      const absolutePath = await realpath(join(directoryPath, entry.name));
      this.assertContained(root, absolutePath);
      const entryStat = await stat(absolutePath);
      const remotePath = this.remotePathFor(root, absolutePath, entry.isDirectory());
      const item: RemoteDirectoryItem = {
        sourceId: input.source.id,
        provider: this.provider,
        path: remotePath,
        name: entry.name,
        kind: entry.isDirectory() ? 'directory' : 'file',
        sizeBytes: entry.isFile() ? entryStat.size : null,
        modifiedAt: entryStat.mtime.toISOString(),
        etag: null,
        contentType: null,
        audio: entry.isFile() && audioExtensions.has(extname(entry.name).toLocaleLowerCase()),
      };
      input.onProgress?.(item);

      if (entry.isDirectory()) {
        scanState.discoveredDirectories += 1;
        if (scanState.discoveredDirectories > maximumFileSystemDirectoriesPerScan) {
          throw new RemoteFileSystemScanLimitError('Mounted source scan exceeded the safe directory limit.');
        }
        pendingDirectories.push(absolutePath);
      } else if (item.audio) {
        scanState.discoveredTracks += 1;
        if (scanState.discoveredTracks > maximumFileSystemTracksPerScan) {
          throw new RemoteFileSystemScanLimitError('Mounted source scan exceeded the safe track limit.');
        }
        readyFiles.push({
          ...item,
          remoteUrlHash: remoteUrlHashFor(input.source.id, item.path),
          stableKey: stableKeyForFileSystem({
            provider: this.provider,
            sourceId: input.source.id,
            remotePath: item.path,
            sizeBytes: item.sizeBytes,
            modifiedAt: item.modifiedAt,
          }),
        });
      }
    }
  }

  private async resolveRoot(source: RemoteAdapterInput['source']): Promise<string> {
    const base = cleanText(source.baseUrl);
    if (!base) {
      throw new Error(`${displayNameFor(this.provider)} 路径不能为空`);
    }

    const rootPath = cleanText(source.config.rootPath);
    const basePath = await realpath(resolve(base));
    if (!rootPath || rootPath === '/' || rootPath === '\\') {
      return basePath;
    }

    if (isAbsolute(rootPath)) {
      throw new Error('Mounted source rootPath must be relative to the configured base path');
    }

    const resolvedRoot = await realpath(resolve(basePath, trimPathPart(rootPath)));
    this.assertContained(basePath, resolvedRoot);
    return resolvedRoot;
  }

  private async resolveItemPath(source: RemoteAdapterInput['source'], remotePath: string): Promise<string> {
    const root = await this.resolveRoot(source);
    const parts = normalizeRemotePath(remotePath).split('/').filter(Boolean);
    const absolutePath = await realpath(resolve(root, ...parts));
    this.assertContained(root, absolutePath);
    return absolutePath;
  }

  private assertContained(root: string, absolutePath: string): void {
    const relativePath = relative(root, absolutePath);
    if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
      throw new Error('Remote path escapes the configured source root');
    }
  }

  private remotePathFor(root: string, absolutePath: string, directory: boolean): string {
    const relativePath = relative(root, absolutePath).split(sep).join('/');
    const normalized = normalizeRemotePath(relativePath || '/');
    return directory ? normalizeRemoteDirectoryPath(normalized) : normalized;
  }

  private fallbackMetadata(remotePath: string): RemoteMetadataResult {
    return {
      status: 'partial',
      title: inferTitle(remotePath),
      artist: 'Unknown Artist',
      album: '',
      albumArtist: 'Unknown Artist',
      trackNo: null,
      discNo: null,
      year: null,
      genre: null,
      duration: null,
      codec: extname(remotePath).slice(1).toUpperCase() || null,
      sampleRate: null,
      bitDepth: null,
      bitrate: null,
      fieldSources: {
        title: 'filename_fallback',
        artist: 'filename_fallback',
        album: 'filename_fallback',
        albumArtist: 'filename_fallback',
      },
      warnings: ['metadata_fallback'],
      errors: [],
    };
  }

  private emptyCover(reason: string): RemoteCoverResult {
    return {
      status: reason === 'cover_not_found' ? 'not_found' : 'partial',
      data: null,
      mimeType: null,
      fieldSources: {},
      warnings: [reason],
      errors: [],
    };
  }
}
