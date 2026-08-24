import { setImmediate as yieldToMainLoop } from 'node:timers/promises';
import type { RemoteSyncOptions, RemoteSyncPreview, RemoteSyncStatus } from '../../../shared/types/remoteSources';
import type { RemoteLibraryStore } from './RemoteLibraryStore';
import type { RemoteSourceAdapter, RemoteTrackWrite } from './remoteTypes';
import { remoteTrackIdFor } from './remoteIdentity';
import { sanitizeRemoteErrorMessage } from './remoteSourceSecurity';

const batchSize = 150;
const statusFlushIntervalMs = 300;
const statusFlushItemDelta = 64;
const scanYieldItemDelta = 100;
const nowIso = (): string => new Date().toISOString();
const throwIfAborted = (signal: AbortSignal): void => {
  if (!signal.aborted) {
    return;
  }
  const error = new Error('Remote source operation was cancelled.');
  error.name = 'AbortError';
  throw error;
};

const initialStatus = (sourceId: string): RemoteSyncStatus => ({
  sourceId,
  status: 'idle',
  phase: 'idle',
  discoveredCount: 0,
  parsedCount: 0,
  writtenCount: 0,
  skippedCount: 0,
  missingCount: 0,
  failedCount: 0,
  currentPath: null,
  errors: [],
  startedAt: null,
  finishedAt: null,
});

export class RemoteLibrarySyncService {
  private readonly statuses = new Map<string, RemoteSyncStatus>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly previewControllers = new Map<string, AbortController>();
  private readonly running = new Set<Promise<void>>();
  private readonly runningPreviews = new Set<Promise<RemoteSyncPreview>>();
  private readonly sourceRevisions = new Map<string, number>();
  private disposing = false;

  constructor(
    private readonly store: RemoteLibraryStore,
    private readonly getAdapter: (provider: string) => RemoteSourceAdapter,
    private readonly onTracksIndexed: (sourceId: string, tracks: RemoteTrackWrite[]) => void = () => undefined,
    private readonly onSyncSettled: (sourceId: string, status: RemoteSyncStatus, options: RemoteSyncOptions) => void = () => undefined,
  ) {}

  syncSource(sourceId: string, options: RemoteSyncOptions = {}): RemoteSyncStatus {
    if (this.disposing) {
      return this.getSyncStatus(sourceId);
    }
    if (this.controllers.has(sourceId)) {
      return this.getSyncStatus(sourceId);
    }

    const controller = new AbortController();
    const revision = this.getSourceRevision(sourceId);
    this.controllers.set(sourceId, controller);
    this.setStatus(sourceId, {
      ...initialStatus(sourceId),
      status: 'running',
      phase: 'testing',
      startedAt: nowIso(),
    });

    const running = this.runSync(sourceId, controller, options, revision).finally(() => {
      if (this.controllers.get(sourceId) === controller) {
        this.controllers.delete(sourceId);
      }
      this.running.delete(running);
    });
    this.running.add(running);

    return this.getSyncStatus(sourceId);
  }

  cancelSync(sourceId: string): RemoteSyncStatus {
    this.controllers.get(sourceId)?.abort();
    this.previewControllers.get(sourceId)?.abort();
    return this.getSyncStatus(sourceId);
  }

  invalidateSource(sourceId: string): void {
    this.sourceRevisions.set(sourceId, this.getSourceRevision(sourceId) + 1);
    this.controllers.get(sourceId)?.abort();
    this.previewControllers.get(sourceId)?.abort();
    this.controllers.delete(sourceId);
    this.previewControllers.delete(sourceId);
    this.statuses.set(sourceId, initialStatus(sourceId));
  }

  async dispose(): Promise<void> {
    this.disposing = true;
    for (const controller of this.controllers.values()) {
      controller.abort();
    }
    for (const controller of this.previewControllers.values()) {
      controller.abort();
    }
    await Promise.allSettled([...this.running, ...this.runningPreviews]);
  }

  getSyncStatus(sourceId: string): RemoteSyncStatus {
    return this.statuses.get(sourceId) ?? initialStatus(sourceId);
  }

  async previewSync(sourceId: string, options: RemoteSyncOptions = {}): Promise<RemoteSyncPreview> {
    if (this.controllers.has(sourceId) || this.previewControllers.has(sourceId)) {
      throw new Error('A sync or preview is already running for this source.');
    }
    const controller = new AbortController();
    const revision = this.getSourceRevision(sourceId);
    this.previewControllers.set(sourceId, controller);
    const running = this.runPreviewSync(sourceId, options, controller, revision);
    this.runningPreviews.add(running);
    try {
      return await running;
    } finally {
      if (this.previewControllers.get(sourceId) === controller) {
        this.previewControllers.delete(sourceId);
      }
      this.runningPreviews.delete(running);
    }
  }

  private async runPreviewSync(
    sourceId: string,
    options: RemoteSyncOptions,
    controller: AbortController,
    revision: number,
  ): Promise<RemoteSyncPreview> {
    this.assertSourceRevision(sourceId, revision, controller.signal);
    const source = this.store.getSourceWithSecret(sourceId);
    if (!source) {
      throw new Error(`Unknown remote source ${sourceId}`);
    }

    const adapter = this.getAdapter(source.provider);
    const test = await adapter.testConnection({ source, signal: controller.signal });
    this.assertSourceRevision(sourceId, revision, controller.signal);
    if (!test.ok) {
      throw new Error(test.message);
    }

    const errors: string[] = [];
    const existingFingerprints = this.store.getComparableFingerprints(sourceId);
    const scanCache = new Map<string, { fingerprint: string; payload: string; verifiedAt: string }>();
    const enumerationRunId = this.store.beginSyncEnumeration();
    let pendingSeenPaths: string[] = [];
    let discoveredCount = 0;
    let addedCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;

    const flushSeenPaths = (): void => {
      if (pendingSeenPaths.length === 0) {
        return;
      }
      this.store.recordSyncEnumerationPaths(enumerationRunId, sourceId, pendingSeenPaths);
      pendingSeenPaths = [];
    };

    try {
      for await (const item of adapter.scan({
        source,
        signal: controller.signal,
        rootPath: options.rootPath ?? null,
        scanCache: {
          get: (namespace, key) => scanCache.get(`${namespace}\0${key}`) ?? this.store.getProviderScanCache(sourceId, namespace, key),
          set: (namespace, key, fingerprint, payload, verifiedAt) => {
            scanCache.set(`${namespace}\0${key}`, { fingerprint, payload, verifiedAt: verifiedAt ?? nowIso() });
          },
        },
        onError: (path, error) => errors.push(`${path}: ${sanitizeRemoteErrorMessage(error)}`),
      })) {
        this.assertSourceRevision(sourceId, revision, controller.signal);
        pendingSeenPaths.push(item.path);
        if (pendingSeenPaths.length >= batchSize) {
          flushSeenPaths();
        }
        discoveredCount += 1;
        const existing = existingFingerprints.get(item.path) ?? null;
        if (!existing) {
          addedCount += 1;
        } else if (
          existing.etag === item.etag
          && existing.modifiedAt === item.modifiedAt
          && existing.sizeBytes === item.sizeBytes
        ) {
          unchangedCount += 1;
        } else {
          updatedCount += 1;
        }
        if (discoveredCount % scanYieldItemDelta === 0) {
          await yieldToMainLoop();
        }
      }

      this.assertSourceRevision(sourceId, revision, controller.signal);
      flushSeenPaths();

      const complete = errors.length === 0;
      const missingCount = complete && !options.rootPath
        ? this.store.countMissingFromSyncEnumeration(enumerationRunId, sourceId)
        : null;
      return {
        sourceId,
        rootPath: options.rootPath ?? null,
        discoveredCount,
        addedCount,
        updatedCount,
        unchangedCount,
        missingCount,
        failedCount: errors.length,
        complete,
        errors: errors.slice(-20),
        previewedAt: nowIso(),
      };
    } finally {
      this.store.finishSyncEnumeration(enumerationRunId);
    }
  }

  rescanChanged(sourceId: string): RemoteSyncStatus {
    return this.syncSource(sourceId);
  }

  removeMissingTracks(sourceId: string): number {
    return this.store.removeMissingTracks(sourceId);
  }

  private async runSync(sourceId: string, controller: AbortController, options: RemoteSyncOptions, revision: number): Promise<void> {
    this.assertSourceRevision(sourceId, revision, controller.signal);
    const source = this.store.getSourceWithSecret(sourceId);
    if (!source) {
      this.fail(sourceId, `Unknown remote source ${sourceId}`, {}, revision);
      return;
    }

    const adapter = this.getAdapter(source.provider);
    const errors: string[] = [];
    let enumerationRunId: string | null = null;
    let pendingSeenPaths: string[] = [];
    let batch: RemoteTrackWrite[] = [];
    let discoveredCount = 0;
    let parsedCount = 0;
    let writtenCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    let lastStatusFlushAt = 0;
    let lastDiscoveredCount = 0;
    let lastWrittenCount = 0;
    let itemsSinceYield = 0;
    let unchangedSeenPaths: string[] = [];
    const pendingScanCache = new Map<string, { namespace: string; key: string; fingerprint: string; payload: string; verifiedAt?: string }>();

    const flushUnchangedSeenPaths = (): void => {
      if (unchangedSeenPaths.length === 0) {
        return;
      }
      this.assertSourceRevision(sourceId, revision, controller.signal);
      this.store.markTracksSeen(sourceId, unchangedSeenPaths);
      unchangedSeenPaths = [];
    };

    const flushSeenPaths = (): void => {
      if (!enumerationRunId || pendingSeenPaths.length === 0) {
        return;
      }
      this.assertSourceRevision(sourceId, revision, controller.signal);
      this.store.recordSyncEnumerationPaths(enumerationRunId, sourceId, pendingSeenPaths);
      pendingSeenPaths = [];
    };

    const flushScanCache = (): void => {
      if (pendingScanCache.size === 0) {
        return;
      }
      this.assertSourceRevision(sourceId, revision, controller.signal);
      this.store.setProviderScanCaches(sourceId, Array.from(pendingScanCache.values()));
      pendingScanCache.clear();
    };

    const publishProgress = (force = false, patch: Partial<RemoteSyncStatus> = {}): void => {
      const now = Date.now();
      const shouldFlush =
        force ||
        now - lastStatusFlushAt >= statusFlushIntervalMs ||
        discoveredCount - lastDiscoveredCount >= statusFlushItemDelta ||
        writtenCount - lastWrittenCount >= statusFlushItemDelta;

      if (!shouldFlush) {
        return;
      }
      if (!this.isSourceRevisionCurrent(sourceId, revision)) {
        return;
      }

      lastStatusFlushAt = now;
      lastDiscoveredCount = discoveredCount;
      lastWrittenCount = writtenCount;
      this.patchStatus(sourceId, {
        discoveredCount,
        parsedCount,
        writtenCount,
        skippedCount,
        failedCount,
        errors: errors.slice(-20),
        ...patch,
      });
    };

    try {
      const test = await adapter.testConnection({ source, signal: controller.signal });
      this.assertSourceRevision(sourceId, revision, controller.signal);
      this.store.updateSourceTestResult(sourceId, test.ok, test.message, test.testedAt);
      if (!test.ok) {
        this.fail(sourceId, test.message, options, revision);
        return;
      }

      enumerationRunId = this.store.beginSyncEnumeration();
      const existingFingerprints = this.store.getComparableFingerprints(sourceId);
      publishProgress(true, { phase: 'scanning' });

      for await (const item of adapter.scan({
        source,
        signal: controller.signal,
        rootPath: options.rootPath ?? null,
        scanCache: {
          get: (namespace, key) => {
            const pending = pendingScanCache.get(`${namespace}\0${key}`);
            return pending
              ? { fingerprint: pending.fingerprint, payload: pending.payload, verifiedAt: pending.verifiedAt ?? nowIso() }
              : this.store.getProviderScanCache(sourceId, namespace, key);
          },
          set: (namespace, key, fingerprint, payload, verifiedAt) => {
            pendingScanCache.set(`${namespace}\0${key}`, { namespace, key, fingerprint, payload, verifiedAt });
            if (pendingScanCache.size >= 100) {
              flushScanCache();
            }
          },
        },
        onProgress: (entry) => {
          publishProgress(false, { currentPath: entry.path });
        },
        onError: (path, error) => {
          const message = `${path}: ${sanitizeRemoteErrorMessage(error)}`;
          errors.push(message);
          failedCount += 1;
          publishProgress(false, { currentPath: path });
        },
      })) {
        if (controller.signal.aborted || !this.isSourceRevisionCurrent(sourceId, revision)) {
          if (this.isSourceRevisionCurrent(sourceId, revision)) {
            this.cancelled(sourceId, options, revision);
          }
          return;
        }

        pendingSeenPaths.push(item.path);
        if (pendingSeenPaths.length >= batchSize) {
          flushSeenPaths();
        }
        discoveredCount += 1;
        itemsSinceYield += 1;
        publishProgress(false, { currentPath: item.path });

        const existing = existingFingerprints.get(item.path) ?? null;
        const unchanged =
          existing &&
          existing.etag === item.etag &&
          existing.modifiedAt === item.modifiedAt &&
          existing.sizeBytes === item.sizeBytes;

        if (unchanged) {
          unchangedSeenPaths.push(item.path);
          if (unchangedSeenPaths.length >= batchSize) {
            flushUnchangedSeenPaths();
          }
          skippedCount += 1;
          publishProgress();
          if (itemsSinceYield >= scanYieldItemDelta) {
            await yieldToMainLoop();
            itemsSinceYield = 0;
          }
          continue;
        }

        const metadata = item.metadata ?? this.createLayeredIndexMetadata(item.name);
        parsedCount += 1;
        batch.push({
          id: remoteTrackIdFor(sourceId, item.stableKey),
          sourceId,
          provider: source.provider,
          remotePath: item.path,
          remoteUrlHash: item.remoteUrlHash,
          stableKey: item.stableKey,
          title: metadata.title,
          artist: metadata.artist,
          album: metadata.album,
          albumArtist: metadata.albumArtist,
          trackNo: metadata.trackNo,
          discNo: metadata.discNo,
          year: metadata.year,
          genre: metadata.genre,
          duration: metadata.duration,
          codec: metadata.codec,
          sampleRate: metadata.sampleRate,
          bitDepth: metadata.bitDepth,
          bitrate: metadata.bitrate,
          sizeBytes: item.sizeBytes,
          modifiedAt: item.modifiedAt,
          etag: item.etag,
          coverId: null,
          coverStatus: 'pending',
          metadataStatus: metadata.status,
          lyricsStatus: 'pending',
          availability: 'available',
          fieldSources: metadata.fieldSources,
        });

        if (batch.length >= batchSize) {
          publishProgress(true, { phase: 'writing_database' });
          writtenCount += await this.flush(sourceId, batch, controller.signal, revision);
          batch = [];
          publishProgress(true, { phase: 'scanning' });
          await yieldToMainLoop();
          itemsSinceYield = 0;
        } else if (itemsSinceYield >= scanYieldItemDelta) {
          await yieldToMainLoop();
          itemsSinceYield = 0;
        }
      }

      this.assertSourceRevision(sourceId, revision, controller.signal);
      flushSeenPaths();
      flushUnchangedSeenPaths();
      flushScanCache();
      publishProgress(true, { phase: 'writing_database' });
      writtenCount += await this.flush(sourceId, batch, controller.signal, revision);
      await yieldToMainLoop();
      this.assertSourceRevision(sourceId, revision, controller.signal);
      publishProgress(true, { phase: 'marking_missing' });
      const enumerationComplete = failedCount === 0 && !controller.signal.aborted;
      const shouldMarkMissing = enumerationComplete && options.markMissing !== false && !options.rootPath;
      const missingCount = shouldMarkMissing && enumerationRunId
        ? this.store.markMissingFromSyncEnumeration(enumerationRunId, sourceId)
        : 0;
      const finishedAt = nowIso();
      this.patchStatus(sourceId, {
        status: enumerationComplete ? 'completed' : 'partial',
        phase: 'finished',
        discoveredCount,
        parsedCount,
        writtenCount,
        skippedCount,
        missingCount,
        failedCount,
        errors: errors.slice(-20),
        currentPath: null,
        finishedAt,
      });
      this.store.updateSourceSyncResult(sourceId, enumerationComplete, errors[0] ?? null, finishedAt);
      this.notifySyncSettled(sourceId, options, revision);
    } catch (error) {
      if (!this.isSourceRevisionCurrent(sourceId, revision)) {
        return;
      }
      if (controller.signal.aborted) {
        this.cancelled(sourceId, options, revision);
        return;
      }
      this.fail(sourceId, sanitizeRemoteErrorMessage(error), options, revision);
    } finally {
      if (enumerationRunId) {
        this.store.finishSyncEnumeration(enumerationRunId);
      }
    }
  }

  private async flush(sourceId: string, batch: RemoteTrackWrite[], signal: AbortSignal, revision: number): Promise<number> {
    if (batch.length === 0) {
      return 0;
    }

    this.assertSourceRevision(sourceId, revision, signal);
    const searchTerms = await this.store.prepareSearchTermsForTracks(batch);
    this.assertSourceRevision(sourceId, revision, signal);
    this.store.upsertTracks(batch, searchTerms);
    this.onTracksIndexed(sourceId, batch);
    return batch.length;
  }

  private createLayeredIndexMetadata(fileName: string): {
    status: 'pending';
    title: string;
    artist: string;
    album: string;
    albumArtist: string;
    trackNo: null;
    discNo: null;
    year: null;
    genre: null;
    duration: null;
    codec: null;
    sampleRate: null;
    bitDepth: null;
    bitrate: null;
    fieldSources: Record<string, string>;
  } {
    const title = fileName.replace(/\.[^.]+$/u, '').replace(/[_-]+/g, ' ').trim() || fileName;

    return {
      status: 'pending',
      title,
      artist: 'Unknown Artist',
      album: '',
      albumArtist: 'Unknown Artist',
      trackNo: null,
      discNo: null,
      year: null,
      genre: null,
      duration: null,
      codec: null,
      sampleRate: null,
      bitDepth: null,
      bitrate: null,
      fieldSources: {
        title: 'filename_fallback',
        artist: 'filename_fallback',
        album: 'filename_fallback',
        albumArtist: 'filename_fallback',
      },
    };
  }

  private fail(sourceId: string, message: string, options: RemoteSyncOptions = {}, revision = this.getSourceRevision(sourceId)): void {
    if (!this.isSourceRevisionCurrent(sourceId, revision)) {
      return;
    }
    const finishedAt = nowIso();
    this.patchStatus(sourceId, {
      status: 'failed',
      phase: 'failed',
      failedCount: this.getSyncStatus(sourceId).failedCount + 1,
      errors: [...this.getSyncStatus(sourceId).errors, message].slice(-20),
      currentPath: null,
      finishedAt,
    });
    this.store.updateSourceSyncResult(sourceId, false, message, finishedAt);
    this.notifySyncSettled(sourceId, options, revision);
  }

  private cancelled(sourceId: string, options: RemoteSyncOptions = {}, revision = this.getSourceRevision(sourceId)): void {
    if (!this.isSourceRevisionCurrent(sourceId, revision)) {
      return;
    }
    this.patchStatus(sourceId, {
      status: 'cancelled',
      phase: 'cancelled',
      currentPath: null,
      finishedAt: nowIso(),
    });
    this.notifySyncSettled(sourceId, options, revision);
  }

  private notifySyncSettled(sourceId: string, options: RemoteSyncOptions, revision: number): void {
    if (!this.isSourceRevisionCurrent(sourceId, revision)) {
      return;
    }
    try {
      this.onSyncSettled(sourceId, this.getSyncStatus(sourceId), options);
    } catch {
      // Status cleanup is best-effort; sync completion itself has already been recorded.
    }
  }

  private patchStatus(sourceId: string, patch: Partial<RemoteSyncStatus>): void {
    this.setStatus(sourceId, {
      ...this.getSyncStatus(sourceId),
      ...patch,
    });
  }

  private setStatus(sourceId: string, status: RemoteSyncStatus): void {
    this.statuses.set(sourceId, status);
  }

  getSourceRevision(sourceId: string): number {
    return this.sourceRevisions.get(sourceId) ?? 0;
  }

  isSourceRevisionCurrent(sourceId: string, revision: number): boolean {
    return this.getSourceRevision(sourceId) === revision;
  }

  private assertSourceRevision(sourceId: string, revision: number, signal: AbortSignal): void {
    throwIfAborted(signal);
    if (!this.isSourceRevisionCurrent(sourceId, revision)) {
      const error = new Error('Remote source operation was superseded by a newer source revision.');
      error.name = 'AbortError';
      throw error;
    }
  }
}
