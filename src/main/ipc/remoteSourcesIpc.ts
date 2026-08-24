import { BrowserWindow, dialog, ipcMain } from 'electron';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import type { RemoteAlbumMergeStrategy } from '../../shared/types/appSettings';
import type {
  RemoteBackgroundJobKind,
  RemoteDirectoryItem,
  RemoteDirectoryPreviewOptions,
  RemoteIndexedTracksQuery,
  RemoteSource,
  RemoteSourceIssueKind,
  RemoteRuntimeLimits,
  RemoteSourceInput,
  RemoteSourceProvider,
  RemoteSourceSyncMode,
  RemoteSourceUpdate,
  RemoteSyncOptions,
  RemoteVisibleHydrationOptions,
} from '../../shared/types/remoteSources';
import type { LibrarySort } from '../../shared/types/library';
import { getRemoteSourceService } from '../library/remote/RemoteSourceService';
import { RemoteMountedRootGrantStore } from '../library/remote/RemoteMountedRootGrantStore';
import { isAuthorizationFailure } from './entitlementIpcGuards';
import { requireLocalPro } from '../plugins/LocalProEntitlements';
import { requireTrustedMainRenderer } from '../app/trustedRenderer';
import {
  assertRemoteSourceConfigInput,
  normalizeRemoteSourceBaseUrl,
  sanitizeRemoteSourceConfig,
} from '../library/remote/remoteSourceSecurity';
import {
  isZConnectRemoteAccessUrl,
  startZConnectWebAuthorization,
} from '../library/remote/ZConnectWebAuthorizationService';

const providers = new Set<RemoteSourceProvider>(['webdav', 'jellyfin', 'emby', 'smb', 'sshfs', 'subsonic']);
const mountedProviders = new Set<RemoteSourceProvider>(['smb', 'sshfs']);
const mountedRootGrants = new RemoteMountedRootGrantStore();
const syncModes = new Set<RemoteSourceSyncMode>(['browse', 'index', 'mirror']);
const remoteAlbumMergeStrategies = new Set<RemoteAlbumMergeStrategy>(['conservative', 'standard']);
const backgroundJobKinds = new Set<RemoteBackgroundJobKind>(['metadata', 'cover', 'lyrics', 'duration-backfill']);
const issueKinds = new Set<RemoteSourceIssueKind>(['metadata', 'cover', 'lyrics', 'missing']);
const sortValues = new Set<LibrarySort>([
  'default',
  'createdAsc',
  'createdDesc',
  'yearAsc',
  'yearDesc',
  'titleAsc',
  'titleDesc',
  'durationAsc',
  'durationDesc',
  'fileModifiedAsc',
  'fileModifiedDesc',
  'qualityAsc',
  'qualityDesc',
  'codecAsc',
  'codecDesc',
  'audioSpecAsc',
  'audioSpecDesc',
  'bitrateAsc',
  'bitrateDesc',
  'bpmAsc',
  'bpmDesc',
  'trackNumber',
  'frequent',
  'random',
  'title',
  'artist',
  'artistAlbum',
  'album',
  'recent',
]);

const requireLightweightRemoteSourcesProUnlock = (): void => requireLocalPro('remote-sources');

const requireTrustedRemoteSourcesSender = (event: unknown): void => {
  requireTrustedMainRenderer(event, 'Remote source IPC');
};

const withRemoteSourcesProUnlock = <TArgs extends unknown[], TResult>(
  handler: (...args: TArgs) => TResult | Promise<TResult>,
): ((...args: TArgs) => Promise<TResult>) =>
  async (...args: TArgs): Promise<TResult> => {
    requireTrustedRemoteSourcesSender(args[0]);
    requireLightweightRemoteSourcesProUnlock();
    return handler(...args);
  };

const withOptionalRemoteSourcesProUnlock = <TArgs extends unknown[], TResult>(
  fallback: TResult,
  handler: (...args: TArgs) => TResult | Promise<TResult>,
): ((...args: TArgs) => Promise<TResult>) =>
  async (...args: TArgs): Promise<TResult> => {
    requireTrustedRemoteSourcesSender(args[0]);
    try {
      requireLightweightRemoteSourcesProUnlock();
    } catch (error) {
      if (isAuthorizationFailure(error)) {
        return fallback;
      }
      throw error;
    }
    return handler(...args);
  };

const requireText = (value: unknown, name: string, maximumLength = 4_096): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  const normalized = value.trim();
  if (normalized.length > maximumLength) {
    throw new Error(`${name} is too long`);
  }
  return normalized;
};

const optionalText = (value: unknown, maximumLength = 4_096): string | null => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  return value.trim().slice(0, maximumLength);
};

const normalizeConfig = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};

const normalizeJobKinds = (value: unknown): RemoteBackgroundJobKind[] | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error('Background job kinds must be an array.');
  }

  const unsupportedKind = value.find(
    (item) => typeof item !== 'string' || !backgroundJobKinds.has(item as RemoteBackgroundJobKind),
  );
  if (unsupportedKind !== undefined) {
    throw new Error('Unsupported background job kind.');
  }

  return Array.from(new Set(value as RemoteBackgroundJobKind[]));
};

const normalizeBoolean = (value: unknown): boolean => value === true;

const normalizeRemoteAlbumMergeStrategy = (value: unknown): RemoteAlbumMergeStrategy | undefined =>
  remoteAlbumMergeStrategies.has(value as RemoteAlbumMergeStrategy) ? (value as RemoteAlbumMergeStrategy) : undefined;

const normalizeTrackIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0 && item.trim().length <= 512)
    .map((item) => item.trim())))
    .slice(0, 40);
};

const normalizeRemotePaths = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0 && item.trim().length <= 4_096)
    .map((item) => item.trim())))
    .slice(0, 200);
};

const normalizePreviewDirectoryItems = (value: unknown): RemoteDirectoryItem[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
    .map((item): RemoteDirectoryItem => {
      const path = requireText(item.path, 'path');
      return {
        sourceId: optionalText(item.sourceId) ?? '',
        provider: providers.has(item.provider as RemoteSourceProvider) ? (item.provider as RemoteSourceProvider) : 'webdav',
        path,
        name: optionalText(item.name) ?? path,
        kind: item.kind === 'directory' ? 'directory' : 'file',
        sizeBytes: typeof item.sizeBytes === 'number' && Number.isFinite(item.sizeBytes) ? item.sizeBytes : null,
        modifiedAt: optionalText(item.modifiedAt),
        etag: optionalText(item.etag),
        contentType: optionalText(item.contentType),
        audio: item.audio === true,
      };
    })
    .slice(0, 40);
};

const normalizeDirectoryPreviewOptions = (value: unknown): RemoteDirectoryPreviewOptions => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const input = value as Record<string, unknown>;
  return {
    limit: typeof input.limit === 'number' && Number.isFinite(input.limit) ? input.limit : undefined,
    includeCover: typeof input.includeCover === 'boolean' ? input.includeCover : undefined,
  };
};

const normalizeVisibleHydrationOptions = (value: unknown): RemoteVisibleHydrationOptions => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const input = value as Record<string, unknown>;
  return {
    metadata: typeof input.metadata === 'boolean' ? input.metadata : undefined,
    cover: typeof input.cover === 'boolean' ? input.cover : undefined,
    priority: typeof input.priority === 'number' && Number.isFinite(input.priority) ? input.priority : undefined,
    immediateCover: typeof input.immediateCover === 'boolean' ? input.immediateCover : undefined,
  };
};

const normalizeRemoteSyncOptions = (value: unknown): RemoteSyncOptions => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const input = value as Record<string, unknown>;
  return {
    rootPath: optionalText(input.rootPath),
    markMissing: typeof input.markMissing === 'boolean' ? input.markMissing : undefined,
    includeCover: typeof input.includeCover === 'boolean' ? input.includeCover : undefined,
  };
};

const normalizeIndexedTracksQuery = (value: unknown): RemoteIndexedTracksQuery => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const input = value as Record<string, unknown>;
  return {
    rootPath: optionalText(input.rootPath),
    page: typeof input.page === 'number' && Number.isFinite(input.page) ? Math.max(1, Math.floor(input.page)) : undefined,
    pageSize: typeof input.pageSize === 'number' && Number.isFinite(input.pageSize) ? Math.max(1, Math.min(500, Math.floor(input.pageSize))) : undefined,
    search: optionalText(input.search) ?? undefined,
    sort: sortValues.has(input.sort as LibrarySort) ? (input.sort as LibrarySort) : undefined,
    cursor: optionalText(input.cursor),
  };
};

const normalizeRuntimeLimits = (value: unknown): RemoteRuntimeLimits => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const input = value as Record<string, unknown>;
  const limitKeys: Array<keyof RemoteRuntimeLimits> = [
    'scanConcurrency',
    'metadataConcurrency',
    'coverConcurrency',
    'lyricsConcurrency',
    'durationBackfillConcurrency',
  ];
  const output: RemoteRuntimeLimits = {};

  for (const key of limitKeys) {
    if (typeof input[key] === 'number' && Number.isFinite(input[key])) {
      output[key] = input[key];
    }
  }

  return output;
};

const normalizeIssueKind = (value: unknown): RemoteSourceIssueKind => {
  if (value === undefined || value === null) {
    return 'metadata';
  }

  if (typeof value === 'string' && issueKinds.has(value as RemoteSourceIssueKind)) {
    return value as RemoteSourceIssueKind;
  }

  throw new Error('Unsupported remote source issue kind.');
};

const normalizeIssueLimit = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const redactRemoteSourceForRenderer = (source: RemoteSource): RemoteSource => {
  const clone = { ...source };
  if (source.config) {
    clone.config = { ...source.config };
  }
  if (mountedProviders.has(source.provider)) {
    clone.baseUrl = null;
  }
  return clone;
};

const normalizeInput = (value: unknown, options: { consumeMountedGrant?: boolean } = {}): RemoteSourceInput => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('remote source input must be an object');
  }

  const input = value as Record<string, unknown>;
  if (!providers.has(input.provider as RemoteSourceProvider)) {
    throw new Error('Unsupported remote source provider.');
  }
  const provider = input.provider as RemoteSourceProvider;
  const syncMode = syncModes.has(input.syncMode as RemoteSourceSyncMode) ? (input.syncMode as RemoteSourceSyncMode) : 'index';
  const requestedAuthType = input.authType === 'none' || input.authType === 'token' || input.authType === 'apiKey'
    ? input.authType
    : 'basic';
  const username = optionalText(input.username);
  const secret = typeof input.secret === 'string' ? input.secret : null;
  const authType = provider === 'subsonic'
    ? 'basic'
    : requestedAuthType === 'basic' && !username && !secret
      ? 'none'
      : requestedAuthType;
  const rawConfig = normalizeConfig(input.config);
  assertRemoteSourceConfigInput(rawConfig);
  let baseUrl = optionalText(input.baseUrl);

  if (mountedProviders.has(provider)) {
    if (baseUrl) {
      throw new Error('Mounted remote source paths must not be sent by the renderer. Use the system folder picker grant.');
    }
    const mountGrantId = optionalText(rawConfig.mountGrantId);
    const grantedPath = options.consumeMountedGrant
      ? mountedRootGrants.consume(provider as 'smb' | 'sshfs', mountGrantId)
      : mountedRootGrants.resolve(provider as 'smb' | 'sshfs', mountGrantId);
    if (!grantedPath) {
      throw new Error('Mounted remote sources require a path selected through the system folder picker.');
    }
    baseUrl = grantedPath;
    delete rawConfig.mountGrantId;
  } else {
    baseUrl = normalizeRemoteSourceBaseUrl(provider, baseUrl, authType);
  }

  if (provider === 'webdav' && authType === 'basic' && !username) {
    throw new Error('WebDAV password authentication requires a username.');
  }
  if (provider === 'webdav' && (authType === 'token' || authType === 'apiKey') && !secret) {
    throw new Error('WebDAV token authentication requires a token or API key.');
  }
  if (provider === 'subsonic' && (!username || !secret)) {
    throw new Error('Subsonic-compatible sources require a username and password.');
  }
  if ((provider === 'jellyfin' || provider === 'emby') && (authType === 'token' || authType === 'apiKey') && !secret) {
    throw new Error(`${provider} token authentication requires a token or API key.`);
  }
  const config = sanitizeRemoteSourceConfig(provider, rawConfig);
  if (config.zconnectWebSession === true && (provider !== 'subsonic' || !baseUrl || !isZConnectRemoteAccessUrl(baseUrl))) {
    throw new Error('ZConnect 网页授权只能用于对应的 HTTPS remote-access 地址。');
  }
  return {
    provider,
    displayName: requireText(input.displayName, 'displayName', 200),
    baseUrl,
    username: authType === 'none' || authType === 'token' || authType === 'apiKey' ? null : username,
    secret: authType === 'none' ? null : secret,
    authType,
    config,
    syncMode,
    status: input.status === 'disabled' || input.status === 'error' ? input.status : 'enabled',
  };
};

const normalizeUpdate = (value: unknown): RemoteSourceUpdate => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('remote source update must be an object');
  }

  const input = value as Record<string, unknown>;
  const update: RemoteSourceUpdate = {
    id: requireText(input.id, 'id'),
  };

  if (input.provider !== undefined) {
    if (!providers.has(input.provider as RemoteSourceProvider)) {
      throw new Error('Unsupported remote source provider.');
    }
    update.provider = input.provider as RemoteSourceProvider;
  }
  if (input.displayName !== undefined) {
    update.displayName = requireText(input.displayName, 'displayName');
  }
  if (input.baseUrl !== undefined) {
    update.baseUrl = optionalText(input.baseUrl);
  }
  if (input.username !== undefined) {
    update.username = optionalText(input.username);
  }
  if (input.secret !== undefined) {
    update.secret = typeof input.secret === 'string' ? input.secret : null;
  }
  if (input.authType !== undefined) {
    update.authType = input.authType === 'none' || input.authType === 'token' || input.authType === 'apiKey' ? input.authType : 'basic';
  }
  if (input.config !== undefined) {
    const config = normalizeConfig(input.config);
    assertRemoteSourceConfigInput(config);
    update.config = config;
  }
  if (input.syncMode !== undefined) {
    update.syncMode = syncModes.has(input.syncMode as RemoteSourceSyncMode) ? (input.syncMode as RemoteSourceSyncMode) : 'index';
  }
  if (input.status !== undefined) {
    update.status = input.status === 'disabled' || input.status === 'error' ? input.status : 'enabled';
  }

  if (update.authType === 'none') {
    update.username = null;
    update.secret = null;
  }

  return update;
};

export const registerRemoteSourcesIpc = (): void => {
  ipcMain.handle(IpcChannels.RemoteSourcesList, withOptionalRemoteSourcesProUnlock([], () =>
    getRemoteSourceService().listSources().map(redactRemoteSourceForRenderer),
  ));
  ipcMain.handle(IpcChannels.RemoteSourcesGetOverview, withRemoteSourcesProUnlock((_event, sourceId?: unknown) =>
    getRemoteSourceService().getOverview(optionalText(sourceId)),
  ));
  ipcMain.handle(IpcChannels.RemoteSourcesPreviewAlbumGrouping, withRemoteSourcesProUnlock((_event, strategy?: unknown, sourceId?: unknown) =>
    getRemoteSourceService().previewAlbumGrouping(normalizeRemoteAlbumMergeStrategy(strategy), optionalText(sourceId)),
  ));
  ipcMain.handle(IpcChannels.RemoteSourcesListIssues, withRemoteSourcesProUnlock((_event, sourceId: unknown, kind: unknown, limit?: unknown) =>
    getRemoteSourceService().listIssues(requireText(sourceId, 'sourceId'), normalizeIssueKind(kind), normalizeIssueLimit(limit)),
  ));
  ipcMain.handle(IpcChannels.RemoteSourcesCreate, withRemoteSourcesProUnlock((_event, input: unknown) =>
    redactRemoteSourceForRenderer(getRemoteSourceService().createSource(normalizeInput(input, { consumeMountedGrant: true }))),
  ));
  ipcMain.handle(IpcChannels.RemoteSourcesUpdate, withRemoteSourcesProUnlock((_event, input: unknown) => {
    const update = normalizeUpdate(input);
    const current = getRemoteSourceService().listSources().find((source) => source.id === update.id) ?? null;
    if (current) {
      const provider = current.provider;
      const effectiveAuthType = provider === 'subsonic' ? 'basic' : update.authType ?? current.authType;
      if (provider === 'subsonic') {
        update.authType = 'basic';
      }
      if (!mountedProviders.has(provider)) {
        update.baseUrl = normalizeRemoteSourceBaseUrl(
          provider,
          update.baseUrl !== undefined ? update.baseUrl : current.baseUrl,
          effectiveAuthType,
        );
      }
      if (update.config && !mountedProviders.has(provider)) {
        update.config = sanitizeRemoteSourceConfig(provider, update.config);
      }
      const effectiveBaseUrl = update.baseUrl !== undefined ? update.baseUrl : current.baseUrl;
      const effectiveConfig = update.config ?? current.config;
      if (effectiveConfig.zconnectWebSession === true && (!effectiveBaseUrl || !isZConnectRemoteAccessUrl(effectiveBaseUrl))) {
        throw new Error('ZConnect 网页授权只能用于对应的 HTTPS remote-access 地址。');
      }
    }
    if (current && mountedProviders.has(current.provider)) {
      const config = update.config ? { ...update.config } : null;
      const mountGrantId = optionalText(config?.mountGrantId);
      if (update.baseUrl) {
        throw new Error('Mounted remote source paths must not be sent by the renderer. Use the system folder picker grant.');
      }
      if (mountGrantId) {
        const grantedPath = mountedRootGrants.consume(current.provider as 'smb' | 'sshfs', mountGrantId);
        if (!grantedPath) {
          throw new Error('Changing a mounted remote source requires a path selected through the system folder picker.');
        }
        update.baseUrl = grantedPath;
      } else if (update.baseUrl !== undefined) {
        delete update.baseUrl;
      }
      if (config) {
        delete config.mountGrantId;
        update.config = sanitizeRemoteSourceConfig(current.provider, config);
      }
    }
    return redactRemoteSourceForRenderer(getRemoteSourceService().updateSource(update));
  }));
  ipcMain.handle(IpcChannels.RemoteSourcesDisconnect, withRemoteSourcesProUnlock((_event, sourceId: unknown) => getRemoteSourceService().disconnectSource(requireText(sourceId, 'sourceId'))));
  ipcMain.handle(IpcChannels.RemoteSourcesDelete, withRemoteSourcesProUnlock((_event, sourceId: unknown) => getRemoteSourceService().deleteSource(requireText(sourceId, 'sourceId'))));
  ipcMain.handle(IpcChannels.RemoteSourcesTest, withRemoteSourcesProUnlock((_event, input: unknown) =>
    typeof input === 'string' ? getRemoteSourceService().testSource(requireText(input, 'sourceId')) : getRemoteSourceService().testSource(normalizeInput(input)),
  ));
  ipcMain.handle(IpcChannels.RemoteSourcesBrowse, withRemoteSourcesProUnlock((_event, sourceId: unknown, path?: unknown) =>
    getRemoteSourceService().browse(requireText(sourceId, 'sourceId'), optionalText(path)),
  ));
  ipcMain.handle(IpcChannels.RemoteSourcesSync, withRemoteSourcesProUnlock((_event, sourceId: unknown, options?: unknown) =>
    getRemoteSourceService().syncSource(requireText(sourceId, 'sourceId'), normalizeRemoteSyncOptions(options)),
  ));
  ipcMain.handle(IpcChannels.RemoteSourcesPreviewSync, withRemoteSourcesProUnlock((_event, sourceId: unknown, options?: unknown) =>
    getRemoteSourceService().previewSync(requireText(sourceId, 'sourceId'), normalizeRemoteSyncOptions(options)),
  ));
  ipcMain.handle(IpcChannels.RemoteSourcesCancelSync, withRemoteSourcesProUnlock((_event, sourceId: unknown) => getRemoteSourceService().cancelSync(requireText(sourceId, 'sourceId'))));
  ipcMain.handle(IpcChannels.RemoteSourcesGetSyncStatus, withRemoteSourcesProUnlock((_event, sourceId: unknown) =>
    getRemoteSourceService().getSyncStatus(requireText(sourceId, 'sourceId')),
  ));
  ipcMain.handle(IpcChannels.RemoteSourcesCreateStreamUrl, withRemoteSourcesProUnlock((_event, input: unknown) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('stream URL input must be an object');
    }

    const request = input as Record<string, unknown>;
    return getRemoteSourceService().createStreamUrl({ trackId: requireText(request.trackId, 'trackId') });
  }));
  ipcMain.handle(IpcChannels.RemoteSourcesHydrateVisibleTracks, withRemoteSourcesProUnlock((_event, trackIds: unknown, options: unknown) =>
    getRemoteSourceService().hydrateVisibleTracks(normalizeTrackIds(trackIds), normalizeVisibleHydrationOptions(options)),
  ));
  ipcMain.handle(IpcChannels.RemoteSourcesLookupTracks, withRemoteSourcesProUnlock((_event, sourceId: unknown, remotePaths: unknown) =>
    getRemoteSourceService().lookupTracks(requireText(sourceId, 'sourceId'), normalizeRemotePaths(remotePaths)),
  ));
  ipcMain.handle(IpcChannels.RemoteSourcesListIndexedTracks, withRemoteSourcesProUnlock((_event, sourceId: unknown, rootPath: unknown) =>
    getRemoteSourceService().listIndexedTracks(requireText(sourceId, 'sourceId'), optionalText(rootPath)),
  ));
  ipcMain.handle(IpcChannels.RemoteSourcesListIndexedTracksPage, withRemoteSourcesProUnlock((_event, sourceId: unknown, query: unknown) =>
    getRemoteSourceService().listIndexedTracksPage(requireText(sourceId, 'sourceId'), normalizeIndexedTracksQuery(query)),
  ));
  ipcMain.handle(IpcChannels.RemoteSourcesGetIndexedFolderStats, withRemoteSourcesProUnlock((_event, sourceId: unknown, rootPath: unknown) =>
    getRemoteSourceService().getIndexedFolderStats(requireText(sourceId, 'sourceId'), optionalText(rootPath)),
  ));
  ipcMain.handle(IpcChannels.RemoteSourcesPreviewDirectoryItems, withRemoteSourcesProUnlock((_event, sourceId: unknown, items: unknown, options: unknown) =>
    getRemoteSourceService().previewDirectoryItems(
      requireText(sourceId, 'sourceId'),
      normalizePreviewDirectoryItems(items),
      normalizeDirectoryPreviewOptions(options),
    ),
  ));
  ipcMain.handle(IpcChannels.RemoteSourcesStartBackgroundJobs, withRemoteSourcesProUnlock((_event, sourceId: unknown, kinds?: unknown) =>
    getRemoteSourceService().startBackgroundJobs(requireText(sourceId, 'sourceId'), normalizeJobKinds(kinds)),
  ));
  ipcMain.handle(IpcChannels.RemoteSourcesPauseBackgroundJobs, withRemoteSourcesProUnlock((_event, sourceId: unknown) =>
    getRemoteSourceService().pauseBackgroundJobs(requireText(sourceId, 'sourceId')),
  ));
  ipcMain.handle(IpcChannels.RemoteSourcesResumeBackgroundJobs, withRemoteSourcesProUnlock((_event, sourceId: unknown) =>
    getRemoteSourceService().resumeBackgroundJobs(requireText(sourceId, 'sourceId')),
  ));
  ipcMain.handle(IpcChannels.RemoteSourcesGetJobStatus, withRemoteSourcesProUnlock((_event, sourceId: unknown) =>
    getRemoteSourceService().getJobStatus(requireText(sourceId, 'sourceId')),
  ));
  ipcMain.handle(IpcChannels.RemoteSourcesRetryFailedJobs, withRemoteSourcesProUnlock((_event, sourceId: unknown, kinds?: unknown) =>
    getRemoteSourceService().retryFailedJobs(requireText(sourceId, 'sourceId'), normalizeJobKinds(kinds)),
  ));
  ipcMain.handle(IpcChannels.RemoteSourcesSetBackgroundPaused, withRemoteSourcesProUnlock((_event, paused: unknown) =>
    getRemoteSourceService().setBackgroundPaused(normalizeBoolean(paused)),
  ));
  ipcMain.handle(IpcChannels.RemoteSourcesGetBackgroundGlobalStatus, withRemoteSourcesProUnlock(() => getRemoteSourceService().getBackgroundGlobalStatus()));
  ipcMain.handle(IpcChannels.RemoteSourcesUpdateRuntimeLimits, withRemoteSourcesProUnlock((_event, sourceId: unknown, limits: unknown) =>
    getRemoteSourceService().updateRuntimeLimits(requireText(sourceId, 'sourceId'), normalizeRuntimeLimits(limits)),
  ));
  ipcMain.handle(IpcChannels.RemoteSourcesSelectMountedRoot, withRemoteSourcesProUnlock(async (_event, provider: unknown) => {
    if (provider !== 'smb' && provider !== 'sshfs') {
      throw new Error('Mounted root selection is only available for SMB and SSHFS sources.');
    }
    const result = await dialog.showOpenDialog({
      title: provider === 'smb' ? '选择 NAS / SMB 音乐目录' : '选择 SSHFS 挂载目录',
      properties: ['openDirectory'],
    });
    const selectedPath = result.canceled ? null : result.filePaths[0]?.trim() || null;
    return selectedPath ? mountedRootGrants.issue(provider, selectedPath) : null;
  }));
  ipcMain.handle(IpcChannels.RemoteSourcesAuthorizeZConnect, withRemoteSourcesProUnlock((event, baseUrl: unknown) =>
    startZConnectWebAuthorization(
      requireText(baseUrl, 'ZConnect URL', 2_048),
      BrowserWindow.fromWebContents(event.sender),
    ),
  ));
};
