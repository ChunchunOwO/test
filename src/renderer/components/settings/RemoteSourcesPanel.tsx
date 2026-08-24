import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  Check,
  Database,
  ExternalLink,
  File,
  FolderOpen,
  Gauge,
  HardDrive,
  History,
  KeyRound,
  ListPlus,
  Minus,
  Music2,
  PauseCircle,
  Pencil,
  Pin,
  PinOff,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  ShieldCheck,
  Trash2,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react';
import type {
  RemoteBackgroundGlobalStatus,
  RemoteBackgroundJobKind,
  RemoteBackgroundJobStatus,
  RemoteAlbumGroupingPreview,
  RemoteDirectoryItem,
  RemoteSourceIssueItem,
  RemoteSourceIssueKind,
  RemoteSourceOverview,
  RemoteSourceOverviewItem,
  RemoteSource,
  RemoteSourceInput,
  RemoteSourceProvider,
  RemoteRuntimeLimits,
  RemoteSourceSyncMode,
  RemoteSyncStatus,
  RemoteSyncPreview,
  RemoteTrackLookupItem,
  RemoteTrackStatus,
  TestRemoteSourceResult,
} from '../../../shared/types/remoteSources';
import type {
  AppSettings,
  RemoteAlbumMergeStrategy,
  RemoteBackgroundConcurrencySettings,
  RemoteCoverLoadPerformanceMode,
} from '../../../shared/types/appSettings';
import type { LibraryTrack } from '../../../shared/types/library';
import { useI18n } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n/locales';
import { translateStatic } from '../../i18n/translateStatic';
import { usePlaybackQueue } from '../../stores/PlaybackQueueProvider';
import { useSharedPlaybackIsPlaying } from '../../stores/playbackStatusStore';
import { getAppBridge, getRemoteSourcesBridge } from '../../utils/echoBridge';
import {
  loadRemoteSourceUxMemory,
  rememberRemoteLocation,
  removeRemoteSourceUxMemory,
  saveRemoteSourceUxMemory,
  toggleRemoteLocationPinned,
  toggleRemoteSourcePinned,
  type RemoteSourceUxMemory,
} from '../../preferences/remoteSourceUxMemory';
import { ZConnectAuthorizationControl } from './ZConnectAuthorizationControl';

type Tab = {
  provider: RemoteSourceProvider;
  labelKey: TranslationKey;
  supported: boolean;
};

const tabs: Tab[] = [
  { provider: 'webdav', labelKey: 'settings.remote.provider.webdav.label', supported: true },
  { provider: 'subsonic', labelKey: 'settings.remote.provider.subsonic.label', supported: true },
  { provider: 'smb', labelKey: 'settings.remote.provider.smb.label', supported: true },
  { provider: 'jellyfin', labelKey: 'settings.remote.provider.jellyfin.label', supported: true },
  { provider: 'emby', labelKey: 'settings.remote.provider.emby.label', supported: true },
  { provider: 'sshfs', labelKey: 'settings.remote.provider.sshfs.label', supported: true },
];

const navidromeDockerDocsUrl = 'https://www.navidrome.org/docs/installation/docker/';
const remoteLibraryPreview = new URL('../../assets/remote-library-preview.png', import.meta.url).href;

type RemoteSourceFormState = {
  displayName: string;
  baseUrl: string;
  username: string;
  secret: string;
  authType: RemoteSourceInput['authType'];
  rootPath: string;
  syncMode: RemoteSourceSyncMode;
  scanConcurrency: number;
  metadataConcurrency: number;
  coverConcurrency: number;
  durationBackfillConcurrency: number;
  apiVersion: string;
  allowCertificateDateErrors: boolean;
  zconnectWebSession: boolean;
  mountGrantId: string;
  mountDisplayName: string;
};

type RemoteReconnectState = 'idle' | 'testing' | 'ready' | 'failed';

const createDefaultRemoteSourceForm = (): RemoteSourceFormState => ({
  displayName: '',
  baseUrl: '',
  username: '',
  secret: '',
  authType: 'basic',
  rootPath: '/',
  syncMode: 'index',
  scanConcurrency: 3,
  metadataConcurrency: 2,
  coverConcurrency: 2,
  durationBackfillConcurrency: 1,
  apiVersion: '1.16.1',
  allowCertificateDateErrors: false,
  zconnectWebSession: false,
  mountGrantId: '',
  mountDisplayName: '',
});

let remoteSourcesProUnlockCache = true;

export const resetRemoteSourcesProUnlockCacheForTests = (): void => {
  remoteSourcesProUnlockCache = true;
};

const syncModeOptions: Array<{ value: RemoteSourceSyncMode; labelKey: TranslationKey }> = [
  { value: 'browse', labelKey: 'settings.remote.syncMode.browse.option' },
  { value: 'index', labelKey: 'settings.remote.syncMode.index.option' },
  { value: 'mirror', labelKey: 'settings.remote.syncMode.mirror.option' },
];

const syncModeLabelKeys: Record<RemoteSourceSyncMode, TranslationKey> = {
  browse: 'settings.remote.syncMode.browse.label',
  index: 'settings.remote.syncMode.index.label',
  mirror: 'settings.remote.syncMode.mirror.label',
};

const remoteCoverLoadPerformanceOptions: Array<{
  value: RemoteCoverLoadPerformanceMode;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
}> = [
  { value: 'low', labelKey: 'settings.remote.coverPerformance.option.low', descriptionKey: 'settings.remote.coverPerformance.option.low.description' },
  { value: 'balanced', labelKey: 'settings.remote.coverPerformance.option.balanced', descriptionKey: 'settings.remote.coverPerformance.option.balanced.description' },
  { value: 'aggressive', labelKey: 'settings.remote.coverPerformance.option.aggressive', descriptionKey: 'settings.remote.coverPerformance.option.aggressive.description' },
  { value: 'lan', labelKey: 'settings.remote.coverPerformance.option.lan', descriptionKey: 'settings.remote.coverPerformance.option.lan.description' },
];

const remoteCoverBackgroundLimits: Record<RemoteCoverLoadPerformanceMode, Pick<RemoteBackgroundGlobalStatus['concurrency'], 'cover'>> = {
  low: { cover: 1 },
  balanced: { cover: 2 },
  aggressive: { cover: 6 },
  lan: { cover: 48 },
};

const defaultRemoteBackgroundConcurrency: RemoteBackgroundConcurrencySettings = {
  metadata: 2,
  cover: 2,
  lyrics: 1,
  durationBackfill: 1,
};

const remoteBackgroundConcurrencyFields: Array<{
  key: keyof RemoteBackgroundConcurrencySettings;
  labelKey: TranslationKey;
  ariaLabelKey: TranslationKey;
  min: number;
  max: number;
}> = [
  { key: 'metadata', labelKey: 'settings.remote.job.metadata', ariaLabelKey: 'settings.remote.background.concurrency.metadata.aria', min: 1, max: 8 },
  { key: 'cover', labelKey: 'settings.remote.job.cover', ariaLabelKey: 'settings.remote.background.concurrency.cover.aria', min: 1, max: 48 },
  { key: 'lyrics', labelKey: 'settings.remote.job.lyrics', ariaLabelKey: 'settings.remote.background.concurrency.lyrics.aria', min: 1, max: 4 },
  { key: 'durationBackfill', labelKey: 'settings.remote.job.durationBackfill', ariaLabelKey: 'settings.remote.background.concurrency.durationBackfill.aria', min: 1, max: 4 },
];

const normalizeRemoteBackgroundConcurrency = (value: unknown): RemoteBackgroundConcurrencySettings => {
  const input = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<Record<keyof RemoteBackgroundConcurrencySettings, unknown>>
    : {};
  const normalizeValue = (key: keyof RemoteBackgroundConcurrencySettings, min: number, max: number): number => {
    const numeric = Number(input[key]);
    return Number.isFinite(numeric)
      ? Math.max(min, Math.min(max, Math.round(numeric)))
      : defaultRemoteBackgroundConcurrency[key];
  };

  return Object.fromEntries(remoteBackgroundConcurrencyFields.map((field) => [
    field.key,
    normalizeValue(field.key, field.min, field.max),
  ])) as unknown as RemoteBackgroundConcurrencySettings;
};

const remoteBackgroundConcurrencyToRuntimeLimits = (concurrency: RemoteBackgroundConcurrencySettings): RemoteRuntimeLimits => ({
  metadataConcurrency: concurrency.metadata,
  coverConcurrency: concurrency.cover,
  lyricsConcurrency: concurrency.lyrics,
  durationBackfillConcurrency: concurrency.durationBackfill,
});

const remoteBackgroundConcurrencyToJobConcurrency = (
  concurrency: RemoteBackgroundConcurrencySettings,
  playbackActive: boolean,
): RemoteBackgroundGlobalStatus['concurrency'] => {
  const normalized = normalizeRemoteBackgroundConcurrency(concurrency);
  if (playbackActive) {
    return {
      metadata: Math.min(normalized.metadata, 1),
      cover: 0,
      lyrics: 0,
      'duration-backfill': Math.min(normalized.durationBackfill, 1),
    };
  }

  return {
    metadata: normalized.metadata,
    cover: normalized.cover,
    lyrics: normalized.lyrics,
    'duration-backfill': normalized.durationBackfill,
  };
};

const remoteAlbumMergeOptions: Array<{
  value: RemoteAlbumMergeStrategy;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
}> = [
  { value: 'conservative', labelKey: 'settings.remote.albumMerge.option.conservative', descriptionKey: 'settings.remote.albumMerge.option.conservative.description' },
  { value: 'standard', labelKey: 'settings.remote.albumMerge.option.standard', descriptionKey: 'settings.remote.albumMerge.option.standard.description' },
];

const normalizeRemoteCoverLoadPerformanceMode = (value: unknown): RemoteCoverLoadPerformanceMode =>
  value === 'low' || value === 'aggressive' || value === 'lan' || value === 'balanced' ? value : 'balanced';

const normalizeRemoteAlbumMergeStrategy = (value: unknown): RemoteAlbumMergeStrategy =>
  value === 'standard' ? 'standard' : 'conservative';

const jobKinds: RemoteBackgroundJobKind[] = ['metadata', 'cover', 'lyrics', 'duration-backfill'];

const jobLabelKeys: Record<RemoteBackgroundJobKind, TranslationKey> = {
  metadata: 'settings.remote.job.metadata',
  cover: 'settings.remote.job.cover',
  lyrics: 'settings.remote.job.lyrics',
  'duration-backfill': 'settings.remote.job.durationBackfill',
};

const jobLabel = (kind: RemoteBackgroundJobKind): string => translateStatic(jobLabelKeys[kind]);

const providerLabelKeys: Record<RemoteSourceProvider, TranslationKey> = {
  webdav: 'settings.remote.provider.webdav.label',
  jellyfin: 'settings.remote.provider.jellyfin.label',
  emby: 'settings.remote.provider.emby.label',
  smb: 'settings.remote.provider.smb.label',
  sshfs: 'settings.remote.provider.sshfs.label',
  subsonic: 'settings.remote.provider.subsonic.label',
};

const providerDefaultNames: Record<RemoteSourceProvider, string> = {
  webdav: 'WebDAV / AList',
  jellyfin: 'Jellyfin',
  emby: 'Emby',
  smb: 'NAS / SMB',
  sshfs: 'SSHFS',
  subsonic: 'Subsonic / Navidrome',
};

const providerGuides: Record<RemoteSourceProvider, {
  intentKey: TranslationKey;
  summaryKey: TranslationKey;
  fitKey: TranslationKey;
  toneKey: TranslationKey;
  promiseKey: TranslationKey;
  actionKey: TranslationKey;
  emptyTextKey: TranslationKey;
}> = {
  webdav: {
    intentKey: 'settings.remote.provider.webdav.intent',
    summaryKey: 'settings.remote.provider.webdav.summary',
    fitKey: 'settings.remote.provider.webdav.fit',
    toneKey: 'settings.remote.provider.webdav.tone',
    promiseKey: 'settings.remote.provider.webdav.promise',
    actionKey: 'settings.remote.provider.webdav.action',
    emptyTextKey: 'settings.remote.provider.webdav.emptyText',
  },
  jellyfin: {
    intentKey: 'settings.remote.provider.jellyfin.intent',
    summaryKey: 'settings.remote.provider.jellyfin.summary',
    fitKey: 'settings.remote.provider.jellyfin.fit',
    toneKey: 'settings.remote.provider.jellyfin.tone',
    promiseKey: 'settings.remote.provider.jellyfin.promise',
    actionKey: 'settings.remote.provider.jellyfin.action',
    emptyTextKey: 'settings.remote.provider.jellyfin.emptyText',
  },
  emby: {
    intentKey: 'settings.remote.provider.emby.intent',
    summaryKey: 'settings.remote.provider.emby.summary',
    fitKey: 'settings.remote.provider.emby.fit',
    toneKey: 'settings.remote.provider.emby.tone',
    promiseKey: 'settings.remote.provider.emby.promise',
    actionKey: 'settings.remote.provider.emby.action',
    emptyTextKey: 'settings.remote.provider.emby.emptyText',
  },
  smb: {
    intentKey: 'settings.remote.provider.smb.intent',
    summaryKey: 'settings.remote.provider.smb.summary',
    fitKey: 'settings.remote.provider.smb.fit',
    toneKey: 'settings.remote.provider.smb.tone',
    promiseKey: 'settings.remote.provider.smb.promise',
    actionKey: 'settings.remote.provider.smb.action',
    emptyTextKey: 'settings.remote.provider.smb.emptyText',
  },
  sshfs: {
    intentKey: 'settings.remote.provider.sshfs.intent',
    summaryKey: 'settings.remote.provider.sshfs.summary',
    fitKey: 'settings.remote.provider.sshfs.fit',
    toneKey: 'settings.remote.provider.sshfs.tone',
    promiseKey: 'settings.remote.provider.sshfs.promise',
    actionKey: 'settings.remote.provider.sshfs.action',
    emptyTextKey: 'settings.remote.provider.sshfs.emptyText',
  },
  subsonic: {
    intentKey: 'settings.remote.provider.subsonic.intent',
    summaryKey: 'settings.remote.provider.subsonic.summary',
    fitKey: 'settings.remote.provider.subsonic.fit',
    toneKey: 'settings.remote.provider.subsonic.tone',
    promiseKey: 'settings.remote.provider.subsonic.promise',
    actionKey: 'settings.remote.provider.subsonic.action',
    emptyTextKey: 'settings.remote.provider.subsonic.emptyText',
  },
};

const emptyStatus = (sourceId: string): RemoteSyncStatus => ({
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

const emptyJobStatus = (sourceId: string): RemoteBackgroundJobStatus => ({
  sourceId,
  paused: false,
  concurrency: { metadata: 2, cover: 2, lyrics: 1, 'duration-backfill': 1 },
  pending: { metadata: 0, cover: 0, lyrics: 0, 'duration-backfill': 0 },
  running: { metadata: 0, cover: 0, lyrics: 0, 'duration-backfill': 0 },
  completed: { metadata: 0, cover: 0, lyrics: 0, 'duration-backfill': 0 },
  failed: { metadata: 0, cover: 0, lyrics: 0, 'duration-backfill': 0 },
  skipped: { metadata: 0, cover: 0, lyrics: 0, 'duration-backfill': 0 },
  current: [],
  lastError: null,
  updatedAt: null,
});

const emptyGlobalStatus = (): RemoteBackgroundGlobalStatus => ({
  paused: false,
  playbackActive: false,
  concurrency: { metadata: 2, cover: 2, lyrics: 1, 'duration-backfill': 1 },
  updatedAt: null,
});

const emptyStatusCounts = (): RemoteSourceOverviewItem['metadata'] => ({
  pending: 0,
  searching: 0,
  partial: 0,
  ok: 0,
  not_found: 0,
  error: 0,
});

const emptyOverview = (): RemoteSourceOverview => ({
  totalSources: 0,
  enabledSources: 0,
  disabledSources: 0,
  errorSources: 0,
  trackCount: 0,
  albumCount: 0,
  artistCount: 0,
  totalSizeBytes: 0,
  missingTrackCount: 0,
  metadata: emptyStatusCounts(),
  cover: emptyStatusCounts(),
  lyrics: emptyStatusCounts(),
  sources: [],
});

const emptyOverviewItem = (source: RemoteSource): RemoteSourceOverviewItem => ({
  sourceId: source.id,
  provider: source.provider,
  displayName: source.displayName,
  status: source.status,
  syncMode: source.syncMode,
  trackCount: source.indexedTrackCount,
  albumCount: 0,
  artistCount: 0,
  totalSizeBytes: 0,
  missingTrackCount: 0,
  metadata: emptyStatusCounts(),
  cover: emptyStatusCounts(),
  lyrics: emptyStatusCounts(),
  lastSyncAt: source.lastSyncAt,
  lastError: source.lastError,
});

const phaseLabelKeys: Record<RemoteSyncStatus['phase'], TranslationKey> = {
  idle: 'settings.remote.ux.phase.idle',
  testing: 'settings.remote.ux.phase.testing',
  scanning: 'settings.remote.ux.phase.scanning',
  reading_metadata: 'settings.remote.ux.phase.readingMetadata',
  writing_database: 'settings.remote.ux.phase.writingDatabase',
  marking_missing: 'settings.remote.ux.phase.markingMissing',
  finished: 'settings.remote.ux.phase.finished',
  cancelled: 'settings.remote.ux.phase.cancelled',
  failed: 'settings.remote.ux.phase.failed',
};

const phaseLabel = (phase: RemoteSyncStatus['phase']): string =>
  phaseLabelKeys[phase] ? translateStatic(phaseLabelKeys[phase]) : phase;

const clampPercent = (value: number): number => Math.max(0, Math.min(100, value));

const syncProgressFor = (status: RemoteSyncStatus): { processed: number; total: number; percent: number; active: boolean; label: string } => {
  const total = Math.max(0, status.discoveredCount);
  const processed = Math.min(total, Math.max(0, status.writtenCount + status.skippedCount + status.missingCount + status.failedCount));
  const active = status.status === 'running';
  const percent = total > 0 ? clampPercent(Math.round((processed / total) * 100)) : 0;
  const phase = phaseLabel(status.phase);
  const label = total > 0
    ? `${phase} · ${processed}/${total} · ${percent}%`
    : active
      ? `${phase} · ${translateStatic('settings.remote.ux.sync.discovering')}`
      : phase;

  return { processed, total, percent, active, label };
};

const formatDate = (value: string | null): string =>
  value ? new Date(value).toLocaleString() : translateStatic('settings.remote.ux.date.never');
const formatCount = (value: number): string => new Intl.NumberFormat().format(Math.max(0, value));
const formatBytes = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size >= 10 || unitIndex === 0 ? Math.round(size) : size.toFixed(1)} ${units[unitIndex]}`;
};

type RemoteSourceErrorPresentation = {
  title: string;
  description: string;
};

const remoteSourceErrorPresentation = (error: unknown, fallback?: string): RemoteSourceErrorPresentation => {
  const defaultFallback = translateStatic('settings.remote.ux.unavailableFallback');
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : (fallback ?? defaultFallback);
  const message = raw.trim() || fallback || defaultFallback;

  if (/timeout|timed out|ETIMEDOUT|AbortError|aborted/iu.test(message)) {
    return {
      title: translateStatic('settings.remote.ux.error.timeout.title'),
      description: translateStatic('settings.remote.ux.error.timeout.description'),
    };
  }

  if (/ENOTFOUND|EAI_AGAIN|DNS|getaddrinfo|name.*not.*resolved/iu.test(message)) {
    return {
      title: translateStatic('settings.remote.ux.error.dns.title'),
      description: translateStatic('settings.remote.ux.error.dns.description'),
    };
  }

  if (/ECONNREFUSED|ECONNRESET|network down|fetch failed|network|socket hang up|self[- ]signed|certificate|TLS|SSL/iu.test(message)) {
    return {
      title: translateStatic('settings.remote.ux.error.network.title'),
      description: translateStatic('settings.remote.ux.error.network.description'),
    };
  }

  if (/401|403|unauthorized|forbidden|invalid token|access token|permission|denied|credential|password/iu.test(message)) {
    return {
      title: translateStatic('settings.remote.ux.error.auth.title'),
      description: translateStatic('settings.remote.ux.error.auth.description'),
    };
  }

  if (/404|not found|root path|path.*missing|ENOENT/iu.test(message)) {
    return {
      title: translateStatic('settings.remote.ux.error.path.title'),
      description: translateStatic('settings.remote.ux.error.path.description'),
    };
  }

  return {
    title: translateStatic('settings.remote.ux.error.generic.title'),
    description: translateStatic('settings.remote.ux.error.generic.description'),
  };
};

const remoteSourceErrorText = (error: unknown, fallback?: string): string => {
  const defaultFallback = translateStatic('settings.remote.ux.operationFailed');
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : (fallback ?? defaultFallback);
  const presentation = remoteSourceErrorPresentation(error, fallback ?? defaultFallback);
  const message = raw.trim() || fallback || defaultFallback;
  return `${presentation.title}. ${presentation.description} ${translateStatic('settings.remote.ux.error.rawReason', { message })}`;
};

const sumKinds = (values: Record<RemoteBackgroundJobKind, number>): number => jobKinds.reduce((total, kind) => total + values[kind], 0);
const isJobKindActive = (status: RemoteBackgroundJobStatus, kind: RemoteBackgroundJobKind): boolean => status.pending[kind] + status.running[kind] > 0;

const statusCompletionText = (counts: RemoteSourceOverviewItem['metadata']): string => {
  const done = counts.ok;
  const total = counts.pending + counts.searching + counts.partial + counts.ok + counts.not_found + counts.error;
  if (total <= 0) {
    return translateStatic('settings.remote.ux.noData');
  }

  const percent = Math.round((done / total) * 100);
  return translateStatic('settings.remote.ux.completion', {
    done: formatCount(done),
    total: formatCount(total),
    percent,
  });
};

const sourceIssueTotal = (source: RemoteSourceOverviewItem): number =>
  source.missingTrackCount
  + source.metadata.error + source.metadata.partial + source.metadata.not_found
  + source.cover.error + source.cover.not_found
  + source.lyrics.error + source.lyrics.not_found;

const sourceHealthSummary = (
  source: RemoteSource,
  overview: RemoteSourceOverviewItem,
  syncStatus: RemoteSyncStatus,
  reconnectState: RemoteReconnectState,
): { tone: 'healthy' | 'attention' | 'offline' | 'paused' | 'working'; title: string; description: string } => {
  if (reconnectState === 'testing') {
    return {
      tone: 'working',
      title: translateStatic('settings.remote.ux.health.reconnecting.title'),
      description: translateStatic('settings.remote.ux.health.reconnecting.description'),
    };
  }
  if (syncStatus.status === 'running') {
    return {
      tone: 'working',
      title: translateStatic('settings.remote.ux.health.syncing.title'),
      description: translateStatic('settings.remote.ux.health.syncing.description', {
        count: formatCount(syncStatus.discoveredCount),
      }),
    };
  }
  if (source.status === 'error') {
    const presentation = remoteSourceErrorPresentation(source.lastError);
    return { tone: 'offline', title: presentation.title, description: presentation.description };
  }
  if (source.status === 'disabled') {
    return {
      tone: 'paused',
      title: translateStatic('settings.remote.ux.health.paused.title'),
      description: translateStatic('settings.remote.ux.health.paused.description'),
    };
  }
  const issues = sourceIssueTotal(overview);
  if (issues > 0) {
    return {
      tone: 'attention',
      title: translateStatic('settings.remote.ux.health.issues.title', { count: formatCount(issues) }),
      description: translateStatic('settings.remote.ux.health.issues.description'),
    };
  }
  if (!source.lastSyncAt) {
    return {
      tone: 'attention',
      title: translateStatic('settings.remote.ux.health.neverSynced.title'),
      description: translateStatic('settings.remote.ux.health.neverSynced.description'),
    };
  }
  const lastSyncAt = new Date(source.lastSyncAt).getTime();
  const stale = Number.isFinite(lastSyncAt) && Date.now() - lastSyncAt > 7 * 24 * 60 * 60 * 1000;
  return stale
    ? {
        tone: 'attention',
        title: translateStatic('settings.remote.ux.health.stale.title'),
        description: translateStatic('settings.remote.ux.health.stale.description', { date: formatDate(source.lastSyncAt) }),
      }
    : {
        tone: 'healthy',
        title: translateStatic('settings.remote.ux.health.healthy.title'),
        description: translateStatic('settings.remote.ux.health.healthy.description', { date: formatDate(source.lastSyncAt) }),
      };
};

const recommendedIssueKind = (source: RemoteSourceOverviewItem): RemoteSourceIssueKind | null => {
  if (source.metadata.error + source.metadata.partial + source.metadata.not_found > 0) {
    return 'metadata';
  }
  if (source.cover.error + source.cover.not_found > 0) {
    return 'cover';
  }
  if (source.lyrics.error + source.lyrics.not_found > 0) {
    return 'lyrics';
  }
  if (source.missingTrackCount > 0) {
    return 'missing';
  }
  return null;
};

const issueKindLabelKeys: Record<RemoteSourceIssueKind, TranslationKey> = {
  metadata: 'settings.remote.job.metadata',
  cover: 'settings.remote.job.cover',
  lyrics: 'settings.remote.job.lyrics',
  missing: 'settings.remote.ux.issue.missing',
};

const issueKindLabel = (kind: RemoteSourceIssueKind): string => translateStatic(issueKindLabelKeys[kind]);

const sourceStatusLabelKeys: Record<RemoteSource['status'], TranslationKey> = {
  enabled: 'settings.remote.ux.source.enabled',
  disabled: 'settings.remote.ux.source.disabled',
  error: 'settings.remote.ux.source.error',
};

const sourceStatusLabel = (status: RemoteSource['status']): string => translateStatic(sourceStatusLabelKeys[status]);

const statusKindTotal = (counts: RemoteSourceOverviewItem['metadata']): number =>
  counts.pending + counts.searching + counts.partial + counts.ok + counts.not_found + counts.error;

const statusIssueCount = (counts: RemoteSourceOverviewItem['metadata']): number =>
  counts.partial + counts.not_found + counts.error;

const completionPercent = (counts: RemoteSourceOverviewItem['metadata']): number | null => {
  const total = statusKindTotal(counts);
  return total <= 0 ? null : clampPercent(Math.round((counts.ok / total) * 100));
};

const completionPercentText = (counts: RemoteSourceOverviewItem['metadata']): string => {
  const percent = completionPercent(counts);
  return percent === null ? translateStatic('settings.remote.ux.noData') : `${percent}%`;
};

const coverProgressFor = (
  counts: RemoteSourceOverviewItem['cover'],
  status: RemoteBackgroundJobStatus,
): { processed: number; total: number; pending: number; running: number; percent: number; active: boolean; label: string } => {
  const total = statusKindTotal(counts);
  const processed = Math.min(total, Math.max(0, counts.ok + counts.not_found + counts.error));
  const pending = Math.max(0, total - processed);
  const running = status.running.cover;
  const active = status.pending.cover + status.running.cover > 0 || counts.searching > 0;
  const percent = total > 0 ? clampPercent(Math.round((processed / total) * 100)) : 0;
  const label = total > 0
    ? translateStatic('settings.remote.ux.cover.progress', {
        processed: formatCount(processed),
        total: formatCount(total),
        pending: formatCount(pending),
        running: formatCount(running),
      })
    : translateStatic('settings.remote.ux.cover.none');

  return { processed, total, pending, running, percent, active, label };
};

const recommendationText = (source: RemoteSourceOverviewItem): string | null => {
  const metadataIssues = source.metadata.error + source.metadata.partial + source.metadata.not_found;
  const coverIssues = source.cover.error + source.cover.not_found;
  const lyricsIssues = source.lyrics.error + source.lyrics.not_found;

  if (metadataIssues > 0) {
    return translateStatic('settings.remote.ux.recommend.metadata', { count: formatCount(metadataIssues) });
  }
  if (coverIssues > 0) {
    return translateStatic('settings.remote.ux.recommend.cover', { count: formatCount(coverIssues) });
  }
  if (lyricsIssues > 0) {
    return translateStatic('settings.remote.ux.recommend.lyrics', { count: formatCount(lyricsIssues) });
  }
  if (source.missingTrackCount > 0) {
    return translateStatic('settings.remote.ux.recommend.missing', { count: formatCount(source.missingTrackCount) });
  }
  return null;
};

const overviewFromSources = (sources: RemoteSourceOverviewItem[]): RemoteSourceOverview => {
  const sumStatusCounts = (key: 'metadata' | 'cover' | 'lyrics'): RemoteSourceOverviewItem['metadata'] =>
    sources.reduce((counts, source) => ({
      pending: counts.pending + source[key].pending,
      searching: counts.searching + source[key].searching,
      partial: counts.partial + source[key].partial,
      ok: counts.ok + source[key].ok,
      not_found: counts.not_found + source[key].not_found,
      error: counts.error + source[key].error,
    }), emptyStatusCounts());

  return {
    ...emptyOverview(),
    sources,
    totalSources: sources.length,
    enabledSources: sources.filter((source) => source.status === 'enabled').length,
    disabledSources: sources.filter((source) => source.status === 'disabled').length,
    errorSources: sources.filter((source) => source.status === 'error').length,
    trackCount: sources.reduce((total, source) => total + source.trackCount, 0),
    albumCount: sources.reduce((total, source) => total + source.albumCount, 0),
    artistCount: sources.reduce((total, source) => total + source.artistCount, 0),
    totalSizeBytes: sources.reduce((total, source) => total + source.totalSizeBytes, 0),
    missingTrackCount: sources.reduce((total, source) => total + source.missingTrackCount, 0),
    metadata: sumStatusCounts('metadata'),
    cover: sumStatusCounts('cover'),
    lyrics: sumStatusCounts('lyrics'),
  };
};

const removeOverviewSource = (overview: RemoteSourceOverview, sourceId: string): RemoteSourceOverview => {
  const nextSources = overview.sources.filter((source) => source.sourceId !== sourceId);
  return nextSources.length === overview.sources.length ? overview : overviewFromSources(nextSources);
};

const mergeOverviewSources = (overview: RemoteSourceOverview, sources: RemoteSourceOverviewItem[]): RemoteSourceOverview => {
  if (sources.length === 0) {
    return overview;
  }

  const byId = new Map(overview.sources.map((source) => [source.sourceId, source]));
  for (const source of sources) {
    byId.set(source.sourceId, source);
  }
  return overviewFromSources(Array.from(byId.values()));
};

type RemoteSourcesBridge = NonNullable<NonNullable<Window['echo']>['remoteSources']>;

type RemoteSourcesSnapshot = {
  sources: RemoteSource[];
  overview: RemoteSourceOverview;
  syncStatuses: Record<string, RemoteSyncStatus>;
  jobStatuses: Record<string, RemoteBackgroundJobStatus>;
  globalStatus: RemoteBackgroundGlobalStatus;
};

type RemoteSourcesSnapshotCache = RemoteSourcesSnapshot & {
  bridge: RemoteSourcesBridge;
  generation: number;
  loadedAtMs: number;
};

const isRendererTestEnvironment = (): boolean =>
  typeof navigator !== 'undefined' && /jsdom/iu.test(navigator.userAgent);

const remoteSourcesRouteSettleDelayMs = isRendererTestEnvironment() ? 0 : 180;
const remoteSourcesSnapshotCacheTtlMs = isRendererTestEnvironment() ? 0 : 6_000;
const remoteSourcesPlaybackSnapshotCacheTtlMs = isRendererTestEnvironment() ? 0 : 30_000;
const remoteAlbumPreviewCacheTtlMs = isRendererTestEnvironment() ? 0 : 10_000;

let remoteSourcesSnapshotCache: RemoteSourcesSnapshotCache | null = null;
let remoteSourcesSnapshotRequest: { bridge: RemoteSourcesBridge; generation: number; promise: Promise<RemoteSourcesSnapshot> } | null = null;
let remoteSourcesSnapshotGeneration = 0;
let remoteAlbumPreviewCache: {
  bridge: RemoteSourcesBridge;
  key: string;
  generation: number;
  loadedAtMs: number;
  preview: RemoteAlbumGroupingPreview | null;
} | null = null;
let remoteAlbumPreviewRequest: {
  bridge: RemoteSourcesBridge;
  key: string;
  generation: number;
  promise: Promise<RemoteAlbumGroupingPreview | null>;
} | null = null;

const invalidateRemoteSourcesSnapshotCache = (): void => {
  remoteSourcesSnapshotGeneration += 1;
  remoteSourcesSnapshotCache = null;
  remoteAlbumPreviewCache = null;
};

const isFreshRemoteSourcesSnapshot = (bridge: RemoteSourcesBridge, maxAgeMs = remoteSourcesSnapshotCacheTtlMs): boolean =>
  remoteSourcesSnapshotCache?.bridge === bridge &&
  Date.now() - remoteSourcesSnapshotCache.loadedAtMs <= maxAgeMs;

const loadRemoteSourcesSnapshot = (
  remoteApi: RemoteSourcesBridge,
  options: { force?: boolean; maxAgeMs?: number } = {},
): Promise<RemoteSourcesSnapshot> => {
  if (options.force) {
    invalidateRemoteSourcesSnapshotCache();
  } else if (isFreshRemoteSourcesSnapshot(remoteApi, options.maxAgeMs) && remoteSourcesSnapshotCache) {
    return Promise.resolve(remoteSourcesSnapshotCache);
  } else if (remoteSourcesSnapshotRequest?.bridge === remoteApi) {
    return remoteSourcesSnapshotRequest.promise;
  }

  const generation = remoteSourcesSnapshotGeneration;
  const promise = (async (): Promise<RemoteSourcesSnapshot> => {
    const [sources, overview] = await Promise.all([
      remoteApi.list(),
      remoteApi.getOverview().catch(() => emptyOverview()),
    ]);
    const sourceIds = Array.from(new Set(sources.map((source) => source.id).filter(Boolean)));
    const [statuses, jobs, globalStatus] = await Promise.all([
      Promise.all(sourceIds.map((sourceId) => remoteApi.getSyncStatus(sourceId).catch(() => emptyStatus(sourceId)))),
      Promise.all(sourceIds.map((sourceId) => remoteApi.getJobStatus(sourceId).catch(() => emptyJobStatus(sourceId)))),
      remoteApi.getBackgroundGlobalStatus().catch(() => emptyGlobalStatus()),
    ]);
    const snapshot: RemoteSourcesSnapshot = {
      sources,
      overview,
      syncStatuses: Object.fromEntries(statuses.map((status) => [status.sourceId, status])),
      jobStatuses: Object.fromEntries(jobs.map((status) => [status.sourceId, status])),
      globalStatus,
    };

    if (generation === remoteSourcesSnapshotGeneration) {
      remoteSourcesSnapshotCache = {
        ...snapshot,
        bridge: remoteApi,
        generation,
        loadedAtMs: Date.now(),
      };
    }

    return snapshot;
  })();

  remoteSourcesSnapshotRequest = { bridge: remoteApi, generation, promise };
  void promise.then(() => {
    if (remoteSourcesSnapshotRequest?.promise === promise) {
      remoteSourcesSnapshotRequest = null;
    }
  }, () => {
    if (remoteSourcesSnapshotRequest?.promise === promise) {
      remoteSourcesSnapshotRequest = null;
    }
  });
  return promise;
};

const loadRemoteAlbumPreview = (
  remoteApi: RemoteSourcesBridge,
  strategy: RemoteAlbumMergeStrategy,
): Promise<RemoteAlbumGroupingPreview | null> => {
  const key = strategy;
  if (
    remoteAlbumPreviewCache?.bridge === remoteApi &&
    remoteAlbumPreviewCache.key === key &&
    Date.now() - remoteAlbumPreviewCache.loadedAtMs <= remoteAlbumPreviewCacheTtlMs
  ) {
    return Promise.resolve(remoteAlbumPreviewCache.preview);
  }
  if (remoteAlbumPreviewRequest?.bridge === remoteApi && remoteAlbumPreviewRequest.key === key) {
    return remoteAlbumPreviewRequest.promise;
  }

  const generation = remoteSourcesSnapshotGeneration;
  const promise = remoteApi.previewAlbumGrouping(strategy)
    .then((preview) => {
      if (generation === remoteSourcesSnapshotGeneration) {
        remoteAlbumPreviewCache = {
          bridge: remoteApi,
          key,
          generation,
          loadedAtMs: Date.now(),
          preview,
        };
      }
      return preview;
    })
    .catch(() => null);

  remoteAlbumPreviewRequest = { bridge: remoteApi, key, generation, promise };
  void promise.finally(() => {
    if (remoteAlbumPreviewRequest?.promise === promise) {
      remoteAlbumPreviewRequest = null;
    }
  });
  return promise;
};

const readConfigNumber = (source: RemoteSource, key: string, fallback: number): number => {
  const value = source.config[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

const readConfigText = (source: RemoteSource, key: string, fallback: string): string => {
  const value = source.config[key];
  return typeof value === 'string' ? value : fallback;
};

const readConfigBoolean = (source: RemoteSource, key: string): boolean => source.config[key] === true;

const createRemoteSourceFormFromSource = (source: RemoteSource): RemoteSourceFormState => ({
  ...createDefaultRemoteSourceForm(),
  displayName: source.displayName,
  baseUrl: source.baseUrl ?? '',
  username: source.username ?? '',
  secret: '',
  authType: source.authType,
  rootPath: readConfigText(source, 'rootPath', '/'),
  syncMode: source.syncMode,
  scanConcurrency: readConfigNumber(source, 'scanConcurrency', 3),
  metadataConcurrency: readConfigNumber(source, 'metadataConcurrency', 2),
  coverConcurrency: readConfigNumber(source, 'coverConcurrency', 2),
  durationBackfillConcurrency: readConfigNumber(source, 'durationBackfillConcurrency', 1),
  apiVersion: readConfigText(source, 'apiVersion', '1.16.1'),
  allowCertificateDateErrors: readConfigBoolean(source, 'allowCertificateDateErrors'),
  zconnectWebSession: readConfigBoolean(source, 'zconnectWebSession'),
  mountDisplayName: source.provider === 'smb' || source.provider === 'sshfs' ? '保持当前挂载目录' : '',
});

const defaultNameFor = (provider: RemoteSourceProvider): string => providerDefaultNames[provider];
const withoutSourceKey = <T,>(sourceId: string, values: Record<string, T>): Record<string, T> => {
  const next = { ...values };
  delete next[sourceId];
  return next;
};

type RemoteBrowserState = {
  path: string | null;
  items: RemoteDirectoryItem[];
  indexedTracks: Record<string, RemoteTrackLookupItem>;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  lookupError: string | null;
};

const emptyBrowserState = (): RemoteBrowserState => ({
  path: null,
  items: [],
  indexedTracks: {},
  loading: false,
  loaded: false,
  error: null,
  lookupError: null,
});

type RemoteBrowserFilter = 'all' | 'audio' | 'unindexed' | 'indexed';

const browserFilterOptions = (): Array<{ value: RemoteBrowserFilter; label: string }> => [
  { value: 'all', label: translateStatic('settings.remote.ux.browser.filter.all') },
  { value: 'audio', label: translateStatic('settings.remote.ux.browser.filter.audio') },
  { value: 'unindexed', label: translateStatic('settings.remote.ux.browser.filter.unindexed') },
  { value: 'indexed', label: translateStatic('settings.remote.ux.browser.filter.indexed') },
];

const remoteTrackStatusLabelKeys: Record<RemoteTrackStatus, TranslationKey> = {
  pending: 'settings.remote.ux.task.pending',
  searching: 'settings.remote.ux.task.searching',
  partial: 'settings.remote.ux.task.partial',
  ok: 'settings.remote.ux.task.ok',
  not_found: 'settings.remote.ux.task.notFound',
  error: 'settings.remote.ux.task.error',
};

const remoteTrackStatusLabel = (status: RemoteTrackStatus): string =>
  translateStatic(remoteTrackStatusLabelKeys[status]);

const normalizeBrowserPath = (value: string | null | undefined): string => {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === '/') {
    return '/';
  }

  return `/${trimmed.replace(/^\/+/u, '').replace(/\/+$/u, '')}`;
};

const rootPathForSource = (source: RemoteSource): string => {
  const rootPath = source.config.rootPath;
  return normalizeBrowserPath(typeof rootPath === 'string' ? rootPath : '/');
};

const displayPathForBrowser = (source: RemoteSource, path: string | null): string =>
  path ? normalizeBrowserPath(path) : rootPathForSource(source);

const parentBrowserPath = (source: RemoteSource, path: string | null): string | null => {
  const rootPath = rootPathForSource(source);
  const currentPath = displayPathForBrowser(source, path);
  if (currentPath === rootPath) {
    return null;
  }

  const parent = currentPath.slice(0, currentPath.lastIndexOf('/')) || '/';
  return parent === rootPath ? null : parent;
};

const browserBreadcrumbs = (source: RemoteSource, path: string | null): Array<{ label: string; path: string | null }> => {
  const rootPath = rootPathForSource(source);
  const currentPath = displayPathForBrowser(source, path);
  const relativePath = rootPath === '/'
    ? currentPath.replace(/^\/+/u, '')
    : currentPath.startsWith(`${rootPath}/`)
      ? currentPath.slice(rootPath.length + 1)
      : '';
  const crumbs: Array<{ label: string; path: string | null }> = [
    { label: translateStatic('settings.remote.ux.browser.root'), path: null },
  ];
  if (!relativePath) {
    return crumbs;
  }

  let cursor = rootPath === '/' ? '' : rootPath;
  for (const segment of relativePath.split('/').filter(Boolean)) {
    cursor = normalizeBrowserPath(`${cursor}/${segment}`);
    crumbs.push({ label: segment, path: cursor });
  }
  return crumbs;
};

const nameForDirectoryItem = (item: RemoteDirectoryItem): string => {
  if (item.name.trim()) {
    return item.name;
  }
  const normalizedPath = normalizeBrowserPath(item.path);
  return normalizedPath.split('/').filter(Boolean).at(-1) ?? normalizedPath;
};

const audioFormatFor = (item: RemoteDirectoryItem): string => {
  const name = nameForDirectoryItem(item);
  const match = name.match(/\.([a-z0-9]+)$/iu);
  return match?.[1]?.toUpperCase() ?? (item.contentType?.split('/').at(-1)?.toUpperCase() || 'AUDIO');
};

const titleForAudioItem = (item: RemoteDirectoryItem): string =>
  nameForDirectoryItem(item).replace(/\.[^.]+$/u, '').replace(/[_-]+/gu, ' ').trim() || nameForDirectoryItem(item);

const sourceQueueLabel = (source: RemoteSource): string => `网盘：${source.displayName}`;

const remoteBrowserTrackId = (source: RemoteSource, item: RemoteDirectoryItem): string =>
  `remote-browser:${source.id}:${item.path}`;

const trackFromBrowserItem = (source: RemoteSource, item: RemoteDirectoryItem): LibraryTrack => ({
  id: remoteBrowserTrackId(source, item),
  mediaType: 'remote',
  isTemporary: true,
  path: `remote://${source.id}${item.path}`,
  sourceId: source.id,
  sourceDisplayName: source.displayName,
  provider: source.provider,
  remotePath: item.path,
  stableKey: `${source.id}:${item.path}:${item.etag ?? item.modifiedAt ?? item.sizeBytes ?? 'unknown'}`,
  title: titleForAudioItem(item),
  artist: 'Unknown Artist',
  album: source.displayName,
  albumArtist: 'Unknown Artist',
  trackNo: null,
  discNo: null,
  year: null,
  genre: null,
  duration: 0,
  codec: audioFormatFor(item).toLowerCase(),
  sampleRate: null,
  bitDepth: null,
  bitrate: null,
  coverId: null,
  coverThumb: null,
  metadataStatus: 'pending',
  embeddedMetadataStatus: 'pending',
  embeddedCoverStatus: 'pending',
  fieldSources: {
    title: 'remote-browser',
    artist: 'remote-browser',
    album: 'remote-source',
  },
});

const trackFromLookupItem = (source: RemoteSource, track: RemoteTrackLookupItem): LibraryTrack => ({
  id: track.trackId,
  mediaType: 'remote',
  path: `remote://${source.id}${track.remotePath}`,
  sourceId: source.id,
  sourceDisplayName: source.displayName,
  provider: source.provider,
  remotePath: track.remotePath,
  stableKey: null,
  title: track.title,
  artist: track.artist,
  album: track.album,
  albumArtist: track.artist,
  trackNo: null,
  discNo: null,
  year: null,
  genre: null,
  duration: track.duration ?? 0,
  codec: track.codec,
  sampleRate: null,
  bitDepth: null,
  bitrate: null,
  coverId: null,
  coverThumb: track.coverThumb,
  metadataStatus: track.metadataStatus,
  embeddedMetadataStatus: 'pending',
  embeddedCoverStatus: track.coverStatus === 'ok' ? 'present' : 'pending',
  fieldSources: {
    title: 'remote-index',
    artist: 'remote-index',
    album: 'remote-index',
  },
  unavailable: track.availability === 'missing',
});

const sortDirectoryItems = (items: RemoteDirectoryItem[]): RemoteDirectoryItem[] =>
  [...items].sort((left, right) => {
    const kindRank = (item: RemoteDirectoryItem): number => item.kind === 'directory' ? 0 : item.audio ? 1 : 2;
    const rankDiff = kindRank(left) - kindRank(right);
    return rankDiff !== 0 ? rankDiff : nameForDirectoryItem(left).localeCompare(nameForDirectoryItem(right), 'zh-Hans-CN');
  });

const indexedTrackMap = (tracks: RemoteTrackLookupItem[]): Record<string, RemoteTrackLookupItem> =>
  Object.fromEntries(tracks.map((track) => [track.remotePath, track]));

const shouldShowBrowserItem = (item: RemoteDirectoryItem, indexedTrack: RemoteTrackLookupItem | undefined, filter: RemoteBrowserFilter): boolean => {
  if (filter === 'audio') {
    return item.audio;
  }
  if (filter === 'indexed') {
    return item.audio && Boolean(indexedTrack);
  }
  if (filter === 'unindexed') {
    return item.audio && !indexedTrack;
  }
  return true;
};

const credentialTextForSource = (source: RemoteSource): string => {
  if (source.authType === 'none') {
    return translateStatic('settings.remote.ux.auth.none');
  }
  if (source.authType === 'apiKey') {
    return 'API Key';
  }
  if (source.authType === 'token') {
    return 'Token';
  }
  return source.username
    ? translateStatic('settings.remote.ux.auth.password')
    : translateStatic('settings.remote.ux.auth.generic');
};

export const RemoteSourcesPanel = (): JSX.Element => {
  const appApi = getAppBridge();
  const remoteApi = getRemoteSourcesBridge();
  const { t } = useI18n();
  const { appendToQueue, playTrack } = usePlaybackQueue();
  const remotePanelPlaybackActive = useSharedPlaybackIsPlaying();
  const [activeProvider, setActiveProvider] = useState<RemoteSourceProvider>('webdav');
  const [sources, setSources] = useState<RemoteSource[]>([]);
  const [overview, setOverview] = useState<RemoteSourceOverview>(() => emptyOverview());
  const [syncStatuses, setSyncStatuses] = useState<Record<string, RemoteSyncStatus>>({});
  const [jobStatuses, setJobStatuses] = useState<Record<string, RemoteBackgroundJobStatus>>({});
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [browserStates, setBrowserStates] = useState<Record<string, RemoteBrowserState>>({});
  const [browserFilter, setBrowserFilter] = useState<RemoteBrowserFilter>('all');
  const [issuePreviews, setIssuePreviews] = useState<Record<string, RemoteSourceIssueItem[]>>({});
  const [globalJobStatus, setGlobalJobStatus] = useState<RemoteBackgroundGlobalStatus>(emptyGlobalStatus);
  const [form, setForm] = useState<RemoteSourceFormState>(() => createDefaultRemoteSourceForm());
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [remoteCoverLoadPerformanceMode, setRemoteCoverLoadPerformanceMode] = useState<RemoteCoverLoadPerformanceMode>('balanced');
  const [remoteBackgroundConcurrency, setRemoteBackgroundConcurrency] = useState<RemoteBackgroundConcurrencySettings>(() => ({ ...defaultRemoteBackgroundConcurrency }));
  const [remoteAlbumMergeStrategy, setRemoteAlbumMergeStrategy] = useState<RemoteAlbumMergeStrategy>('conservative');
  const [pendingRemoteAlbumMergeStrategy, setPendingRemoteAlbumMergeStrategy] = useState<RemoteAlbumMergeStrategy>('conservative');
  const [remoteAlbumGroupingPreview, setRemoteAlbumGroupingPreview] = useState<RemoteAlbumGroupingPreview | null>(null);
  const [remoteAlbumGroupingBusy, setRemoteAlbumGroupingBusy] = useState(false);
  const [remoteAlbumScanBusy, setRemoteAlbumScanBusy] = useState(false);
  const [remoteAlbumGroupingMessage, setRemoteAlbumGroupingMessage] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [connectionAdvancedOpen, setConnectionAdvancedOpen] = useState(false);
  const [showEmptyConnectionForm, setShowEmptyConnectionForm] = useState(false);
  const [showConnectionOptions, setShowConnectionOptions] = useState(false);
  const [uxMemory, setUxMemory] = useState<RemoteSourceUxMemory>(() => loadRemoteSourceUxMemory());
  const [reconnectStates, setReconnectStates] = useState<Record<string, RemoteReconnectState>>({});
  const [syncPreview, setSyncPreview] = useState<{ sourceId: string; rootPath: string | null; result: RemoteSyncPreview } | null>(null);
  const [syncPreviewBusySourceId, setSyncPreviewBusySourceId] = useState<string | null>(null);
  const [remoteBackgroundConcurrencySaving, setRemoteBackgroundConcurrencySaving] = useState(false);
  const [testResult, setTestResult] = useState<TestRemoteSourceResult | null>(null);
  const remoteSourcesProUnlocked = remoteSourcesProUnlockCache;
  const terminalSyncEventsRef = useRef<Record<string, string>>({});
  const browserRequestTokensRef = useRef<Record<string, number>>({});
  const syncPreviewCancelRequestedRef = useRef(false);
  const formDraftsRef = useRef<Partial<Record<RemoteSourceProvider, RemoteSourceFormState>>>({
    webdav: createDefaultRemoteSourceForm(),
  });
  const formSectionRef = useRef<HTMLElement | null>(null);
  const browserSectionRef = useRef<HTMLElement | null>(null);

  const activeTab = useMemo(() => tabs.find((tab) => tab.provider === activeProvider) ?? tabs[0], [activeProvider]);
  const visibleSources = useMemo(() => sources.filter((source) => source.provider === activeProvider), [activeProvider, sources]);
  const visibleSourceIds = useMemo(() => visibleSources.map((source) => source.id), [visibleSources]);
  const selectedSource = useMemo(
    () => visibleSources.find((source) => source.id === selectedSourceId) ?? visibleSources[0] ?? null,
    [selectedSourceId, visibleSources],
  );
  const selectedBrowser = selectedSource ? browserStates[selectedSource.id] ?? emptyBrowserState() : null;
  const overviewBySourceId = useMemo(() => new Map(overview.sources.map((source) => [source.sourceId, source])), [overview.sources]);
  const playbackLoadReduced = globalJobStatus.playbackActive && !globalJobStatus.paused;

  const updateUxMemory = useCallback((updater: (current: RemoteSourceUxMemory) => RemoteSourceUxMemory): void => {
    setUxMemory((current) => {
      const next = updater(current);
      saveRemoteSourceUxMemory(next);
      return next;
    });
  }, []);

  const setRememberedForm = useCallback((updater: RemoteSourceFormState | ((current: RemoteSourceFormState) => RemoteSourceFormState)): void => {
    setForm((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      formDraftsRef.current[activeProvider] = next;
      return next;
    });
  }, [activeProvider]);

  const setProviderFormDraft = useCallback((provider: RemoteSourceProvider, nextForm: RemoteSourceFormState): void => {
    formDraftsRef.current[provider] = nextForm;
    if (provider === activeProvider) {
      setForm(nextForm);
    }
  }, [activeProvider]);

  const switchRemoteProvider = useCallback((
    provider: RemoteSourceProvider,
    options: { clearSelection?: boolean; message?: string | null; scrollToForm?: boolean } = {},
  ): void => {
    formDraftsRef.current[activeProvider] = form;
    const nextForm = formDraftsRef.current[provider] ?? createDefaultRemoteSourceForm();
    formDraftsRef.current[provider] = nextForm;
    setActiveProvider(provider);
    setForm(nextForm);
    setTestResult(null);
    if (provider !== activeProvider) {
      setEditingSourceId(null);
    }
    if (options.clearSelection) {
      setSelectedSourceId(null);
    }
    if (options.message !== undefined) {
      setMessage(options.message);
    } else if (provider !== activeProvider) {
      setMessage(null);
    }
    if (options.scrollToForm) {
      window.setTimeout(() => {
        formSectionRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      }, 0);
    }
  }, [activeProvider, form]);

  const startAddingRemoteProvider = useCallback((provider: RemoteSourceProvider): void => {
    setEditingSourceId(null);
    setShowConnectionOptions(true);
    setShowEmptyConnectionForm(true);
    setConnectionAdvancedOpen(false);
    switchRemoteProvider(provider, {
      clearSelection: true,
      message: t('settings.remote.message.providerSelected').replace('{provider}', t(providerGuides[provider].intentKey)),
      scrollToForm: true,
    });
  }, [switchRemoteProvider, t]);

  const startEditingRemoteSource = useCallback((source: RemoteSource): void => {
    const nextForm = createRemoteSourceFormFromSource(source);
    formDraftsRef.current[source.provider] = nextForm;
    setActiveProvider(source.provider);
    setForm(nextForm);
    setSelectedSourceId(source.id);
    setEditingSourceId(source.id);
    setShowConnectionOptions(true);
    setShowEmptyConnectionForm(true);
    setConnectionAdvancedOpen(false);
    setTestResult(null);
    setMessage(`正在编辑 ${source.displayName}；密码留空会保留现有凭据。`);
    window.setTimeout(() => {
      formSectionRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    }, 0);
  }, []);


  const providerSummaries = useMemo(() => tabs.map((tab) => {
    const overviewSources = overview.sources.filter((source) => source.provider === tab.provider);
    const listedSources = sources.filter((source) => source.provider === tab.provider);
    const countBase = overviewSources.length > 0 ? overviewSources : listedSources.map(emptyOverviewItem);
    return {
      provider: tab.provider,
      sourceCount: Math.max(overviewSources.length, listedSources.length),
      enabledCount: listedSources.length > 0
        ? listedSources.filter((source) => source.status === 'enabled').length
        : overviewSources.filter((source) => source.status === 'enabled').length,
      errorCount: listedSources.length > 0
        ? listedSources.filter((source) => source.status === 'error').length
        : overviewSources.filter((source) => source.status === 'error').length,
      trackCount: countBase.reduce((total, source) => total + source.trackCount, 0),
      issueCount: countBase.reduce((total, source) => total + sourceIssueTotal(source), 0),
    };
  }), [overview.sources, sources]);
  const activeProviderSummary = providerSummaries.find((summary) => summary.provider === activeProvider);
  const overviewIssueCount = useMemo(() => overview.sources.reduce((total, source) => total + sourceIssueTotal(source), 0), [overview.sources]);
  const runningSyncCount = useMemo(() => Object.values(syncStatuses).filter((status) => status.status === 'running').length, [syncStatuses]);
  const queuedJobCount = useMemo(() => Object.values(jobStatuses).reduce((total, status) => total + sumKinds(status.pending) + sumKinds(status.running), 0), [jobStatuses]);
  const activeVisibleSourceIds = useMemo(
    () => visibleSourceIds.filter((sourceId) => {
      const syncStatus = syncStatuses[sourceId];
      const jobStatus = jobStatuses[sourceId];
      return syncStatus?.status === 'running'
        || (jobStatus ? sumKinds(jobStatus.pending) + sumKinds(jobStatus.running) > 0 : false);
    }),
    [jobStatuses, syncStatuses, visibleSourceIds],
  );
  const activeVisibleSourceIdKey = activeVisibleSourceIds.join('\u0000');
  const hasVisibleActiveRemoteWork = activeVisibleSourceIds.length > 0;
  const commandStatusLabel = globalJobStatus.paused
    ? t('settings.remote.commandStatus.paused')
    : playbackLoadReduced
      ? t('settings.remote.commandStatus.playbackReduced')
      : queuedJobCount > 0 || runningSyncCount > 0
        ? t('settings.remote.commandStatus.processing')
        : t('settings.remote.commandStatus.idle');
  const activeProviderGuide = providerGuides[activeProvider];

  useEffect(() => {
    let disposed = false;

    const loadSettings = (): void => {
      void appApi?.getSettings?.()
        .then((settings) => {
          if (!disposed) {
            setRemoteCoverLoadPerformanceMode(normalizeRemoteCoverLoadPerformanceMode(settings?.remoteCoverLoadPerformanceMode));
            setRemoteBackgroundConcurrency(normalizeRemoteBackgroundConcurrency(settings?.remoteBackgroundConcurrency));
            const nextRemoteAlbumMergeStrategy = normalizeRemoteAlbumMergeStrategy(settings?.remoteAlbumMergeStrategy);
            setRemoteAlbumMergeStrategy(nextRemoteAlbumMergeStrategy);
            setPendingRemoteAlbumMergeStrategy(nextRemoteAlbumMergeStrategy);
          }
        })
        .catch(() => undefined);
    };

    const handleSettingsChanged = (event: Event): void => {
      const detail = event instanceof CustomEvent ? (event.detail as Partial<AppSettings> | null | undefined) : null;
      if (detail && 'remoteCoverLoadPerformanceMode' in detail) {
        setRemoteCoverLoadPerformanceMode(normalizeRemoteCoverLoadPerformanceMode(detail.remoteCoverLoadPerformanceMode));
      }
      if (detail && 'remoteBackgroundConcurrency' in detail) {
        setRemoteBackgroundConcurrency(normalizeRemoteBackgroundConcurrency(detail.remoteBackgroundConcurrency));
      }
      if (detail && 'remoteAlbumMergeStrategy' in detail) {
        const nextRemoteAlbumMergeStrategy = normalizeRemoteAlbumMergeStrategy(detail.remoteAlbumMergeStrategy);
        setRemoteAlbumMergeStrategy(nextRemoteAlbumMergeStrategy);
        setPendingRemoteAlbumMergeStrategy(nextRemoteAlbumMergeStrategy);
        return;
      }
      if (!detail) {
        loadSettings();
      }
    };

    loadSettings();
    window.addEventListener('settings:changed', handleSettingsChanged);
    return () => {
      disposed = true;
      window.removeEventListener('settings:changed', handleSettingsChanged);
    };
  }, [appApi]);

  const updateRemoteCoverLoadPerformanceMode = useCallback(
    async (mode: RemoteCoverLoadPerformanceMode): Promise<void> => {
      setRemoteCoverLoadPerformanceMode(mode);
      try {
        const settings = await appApi?.setSettings?.({ remoteCoverLoadPerformanceMode: mode });
        const nextMode = normalizeRemoteCoverLoadPerformanceMode(settings?.remoteCoverLoadPerformanceMode ?? mode);
        setRemoteCoverLoadPerformanceMode(nextMode);
        window.dispatchEvent(new CustomEvent('settings:changed', { detail: { remoteCoverLoadPerformanceMode: nextMode } }));
      } catch (settingsError) {
        setMessage(settingsError instanceof Error ? settingsError.message : '保存远程封面加载设置失败。');
      }
    },
    [appApi],
  );

  const refreshRemoteAlbumGroupingPreview = useCallback(
    async (strategy = pendingRemoteAlbumMergeStrategy): Promise<RemoteAlbumGroupingPreview | null> => {
      if (remoteSourcesProUnlocked !== true || !remoteApi?.previewAlbumGrouping) {
        return null;
      }
      const preview = await loadRemoteAlbumPreview(remoteApi, strategy);
      setRemoteAlbumGroupingPreview(preview);
      return preview;
    },
    [pendingRemoteAlbumMergeStrategy, remoteApi, remoteSourcesProUnlocked],
  );

  const scanRemoteAlbumsForGrouping = useCallback(async (): Promise<void> => {
    if (!remoteApi) {
      return;
    }
    const enabledSources = sources.filter((source) => source.status === 'enabled');
    if (enabledSources.length === 0) {
      setRemoteAlbumGroupingMessage('没有可扫描的已启用远程来源。');
      return;
    }

    try {
      setRemoteAlbumScanBusy(true);
      setRemoteAlbumGroupingMessage(null);
      await Promise.all(enabledSources.map((source) => remoteApi.sync(source.id, { includeCover: false }).catch(() => null)));
      invalidateRemoteSourcesSnapshotCache();
      const preview = await refreshRemoteAlbumGroupingPreview();
      setRemoteAlbumGroupingMessage(
        preview
          ? `已开始扫描 ${enabledSources.length} 个远程来源。当前可见统计：${formatCount(preview.currentAlbumCount)} -> ${formatCount(preview.targetAlbumCount)} 张专辑。`
          : `已开始扫描 ${enabledSources.length} 个远程来源。`,
      );
    } catch (scanError) {
      setMessage(scanError instanceof Error ? scanError.message : '扫描远程曲库失败。');
    } finally {
      setRemoteAlbumScanBusy(false);
    }
  }, [refreshRemoteAlbumGroupingPreview, remoteApi, sources]);

  const applyRemoteAlbumMergeStrategy = useCallback(
    async (): Promise<void> => {
      if (!appApi) {
        setMessage('Desktop bridge unavailable. Open ECHO in Electron to refresh remote album grouping.');
        return;
      }

      try {
        setRemoteAlbumGroupingBusy(true);
        setRemoteAlbumGroupingMessage(null);
        const preview = await refreshRemoteAlbumGroupingPreview(pendingRemoteAlbumMergeStrategy);
        const settings = await appApi.setSettings?.({ remoteAlbumMergeStrategy: pendingRemoteAlbumMergeStrategy });
        const nextStrategy = normalizeRemoteAlbumMergeStrategy(settings?.remoteAlbumMergeStrategy ?? pendingRemoteAlbumMergeStrategy);
        setRemoteAlbumMergeStrategy(nextStrategy);
        setPendingRemoteAlbumMergeStrategy(nextStrategy);
        window.dispatchEvent(new CustomEvent('settings:changed', { detail: { remoteAlbumMergeStrategy: nextStrategy } }));
        window.dispatchEvent(new Event('library:changed'));
        invalidateRemoteSourcesSnapshotCache();
        const afterPreview = await refreshRemoteAlbumGroupingPreview(nextStrategy);
        const beforeCount = preview?.currentAlbumCount ?? afterPreview?.currentAlbumCount ?? 0;
        const afterCount = preview?.targetAlbumCount ?? afterPreview?.targetAlbumCount ?? 0;
        const delta = beforeCount - afterCount;
        const deltaText = delta > 0 ? `减少 ${formatCount(delta)} 张` : delta < 0 ? `增加 ${formatCount(Math.abs(delta))} 张` : '数量未变化';
        setRemoteAlbumGroupingMessage(
          `远程专辑分组已更新：${formatCount(beforeCount)} -> ${formatCount(afterCount)} 张专辑，${deltaText}。`,
        );
      } catch (settingsError) {
        setMessage(settingsError instanceof Error ? settingsError.message : '保存远程专辑合并设置失败。');
      } finally {
        setRemoteAlbumGroupingBusy(false);
      }
    },
    [appApi, pendingRemoteAlbumMergeStrategy, refreshRemoteAlbumGroupingPreview],
  );

  const refreshStatuses = useCallback(async (sourceIds: string[], replace = false, includeOverview = false): Promise<void> => {
    if (remoteSourcesProUnlocked !== true || !remoteApi) {
      return;
    }

    const uniqueIds = Array.from(new Set(sourceIds.filter(Boolean)));
    const [statuses, jobs, globalStatus, nextOverview] = await Promise.all([
      Promise.all(uniqueIds.map((sourceId) => remoteApi.getSyncStatus(sourceId).catch(() => emptyStatus(sourceId)))),
      Promise.all(uniqueIds.map((sourceId) => remoteApi.getJobStatus(sourceId).catch(() => emptyJobStatus(sourceId)))),
      remoteApi.getBackgroundGlobalStatus().catch(() => emptyGlobalStatus()),
      includeOverview ? remoteApi.getOverview().catch(() => null) : Promise.resolve(null),
    ]);

    const nextStatuses = Object.fromEntries(statuses.map((status) => [status.sourceId, status]));
    const nextJobs = Object.fromEntries(jobs.map((status) => [status.sourceId, status]));
    setSyncStatuses((current) => (replace ? nextStatuses : { ...current, ...nextStatuses }));
    setJobStatuses((current) => (replace ? nextJobs : { ...current, ...nextJobs }));
    setGlobalJobStatus(globalStatus);
    if (nextOverview) {
      setOverview(nextOverview);
    }
  }, [remoteApi, remoteSourcesProUnlocked]);

  const refreshVisibleOverview = useCallback(async (sourceIds: string[]): Promise<void> => {
    if (remoteSourcesProUnlocked !== true || !remoteApi) {
      return;
    }

    const uniqueIds = Array.from(new Set(sourceIds.filter(Boolean)));
    if (uniqueIds.length === 0) {
      return;
    }

    const sourceOverviews = await Promise.all(uniqueIds.map((sourceId) => remoteApi.getOverview(sourceId).catch(() => null)));
    const updatedSources = sourceOverviews.flatMap((sourceOverview) => sourceOverview?.sources ?? []);
    if (updatedSources.length > 0) {
      setOverview((current) => mergeOverviewSources(current, updatedSources));
    }
  }, [remoteApi, remoteSourcesProUnlocked]);

  const applyRemoteSourcesSnapshot = useCallback((snapshot: RemoteSourcesSnapshot): void => {
    setSources(snapshot.sources);
    setOverview(snapshot.overview);
    setSyncStatuses(snapshot.syncStatuses);
    setJobStatuses(snapshot.jobStatuses);
    setGlobalJobStatus(snapshot.globalStatus);
  }, []);

  const updateRemoteBackgroundConcurrencyDraft = useCallback(
    (key: keyof RemoteBackgroundConcurrencySettings, value: number): void => {
      setRemoteBackgroundConcurrency((current) => normalizeRemoteBackgroundConcurrency({ ...current, [key]: value }));
      setMessage(null);
    },
    [],
  );

  const stepRemoteBackgroundConcurrencyDraft = useCallback(
    (key: keyof RemoteBackgroundConcurrencySettings, delta: number): void => {
      const field = remoteBackgroundConcurrencyFields.find((item) => item.key === key);
      if (!field) {
        return;
      }
      setRemoteBackgroundConcurrency((current) => normalizeRemoteBackgroundConcurrency({
        ...current,
        [key]: Math.max(field.min, Math.min(field.max, current[key] + delta)),
      }));
      setMessage(null);
    },
    [],
  );

  const saveRemoteBackgroundConcurrency = useCallback(async (): Promise<void> => {
    const nextConcurrency = normalizeRemoteBackgroundConcurrency(remoteBackgroundConcurrency);
    setRemoteBackgroundConcurrency(nextConcurrency);
    setRemoteBackgroundConcurrencySaving(true);
    try {
      const settings = await appApi?.setSettings?.({ remoteBackgroundConcurrency: nextConcurrency });
      const savedConcurrency = normalizeRemoteBackgroundConcurrency(settings?.remoteBackgroundConcurrency ?? nextConcurrency);
      const runtimeLimits = remoteBackgroundConcurrencyToRuntimeLimits(savedConcurrency);

      setRemoteBackgroundConcurrency(savedConcurrency);
      setGlobalJobStatus((current) => ({
        ...current,
        concurrency: remoteBackgroundConcurrencyToJobConcurrency(savedConcurrency, current.playbackActive),
      }));
      window.dispatchEvent(new CustomEvent('settings:changed', { detail: { remoteBackgroundConcurrency: savedConcurrency } }));
      if (remoteApi && sources.length > 0) {
        const statuses = await Promise.all(sources.map((source) => remoteApi.updateRuntimeLimits(source.id, runtimeLimits)));
        setJobStatuses((current) => ({
          ...current,
          ...Object.fromEntries(statuses.map((status) => [status.sourceId, status])),
        }));
      }
      setMessage('后台任务并发已保存；播放中仍会自动降载，空闲后按新并发继续。');
    } catch (settingsError) {
      setMessage(settingsError instanceof Error ? settingsError.message : '保存后台任务并发失败。');
    } finally {
      setRemoteBackgroundConcurrencySaving(false);
    }
  }, [appApi, remoteApi, remoteBackgroundConcurrency, sources]);

  const refreshSources = useCallback(async (force = false): Promise<void> => {
    if (remoteSourcesProUnlocked !== true || !remoteApi) {
      return;
    }

    const snapshot = await loadRemoteSourcesSnapshot(remoteApi, { force });
    applyRemoteSourcesSnapshot(snapshot);
  }, [applyRemoteSourcesSnapshot, remoteApi, remoteSourcesProUnlocked]);

  useEffect(() => {
    if (remoteSourcesProUnlocked !== true || !remoteApi) {
      return undefined;
    }

    let disposed = false;
    const snapshotMaxAgeMs = remotePanelPlaybackActive ? remoteSourcesPlaybackSnapshotCacheTtlMs : remoteSourcesSnapshotCacheTtlMs;
    const routeSettleDelayMs = remotePanelPlaybackActive ? 900 : remoteSourcesRouteSettleDelayMs;
    const timer = window.setTimeout(() => {
      void loadRemoteSourcesSnapshot(remoteApi, { maxAgeMs: snapshotMaxAgeMs })
        .then((snapshot) => {
          if (!disposed) {
            applyRemoteSourcesSnapshot(snapshot);
          }
        })
        .catch(() => undefined);
    }, routeSettleDelayMs);

    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [applyRemoteSourcesSnapshot, remoteApi, remotePanelPlaybackActive, remoteSourcesProUnlocked]);

  useEffect(() => {
    if (remoteSourcesProUnlocked !== true || !remoteApi?.previewAlbumGrouping || sources.length === 0) {
      setRemoteAlbumGroupingPreview(null);
      return undefined;
    }
    if (remotePanelPlaybackActive) {
      return undefined;
    }

    let disposed = false;
    const timer = window.setTimeout(() => {
      void loadRemoteAlbumPreview(remoteApi, pendingRemoteAlbumMergeStrategy)
        .then((preview) => {
          if (!disposed) {
            setRemoteAlbumGroupingPreview(preview);
          }
        })
        .catch(() => undefined);
    }, remoteSourcesRouteSettleDelayMs);

    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [pendingRemoteAlbumMergeStrategy, remoteApi, remotePanelPlaybackActive, remoteSourcesProUnlocked, sources.length]);

  useEffect(() => {
    if (visibleSources.length === 0) {
      setSelectedSourceId(null);
      return;
    }
    if (selectedSourceId && visibleSources.some((source) => source.id === selectedSourceId)) {
      return;
    }
    setSelectedSourceId(visibleSources[0].id);
  }, [selectedSourceId, visibleSources]);

  useEffect(() => {
    if (!hasVisibleActiveRemoteWork || !remoteApi) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      void refreshStatuses(visibleSourceIds);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [hasVisibleActiveRemoteWork, refreshStatuses, remoteApi, visibleSourceIds]);

  useEffect(() => {
    if (!hasVisibleActiveRemoteWork || !remoteApi) {
      return undefined;
    }

    const sourceIds = activeVisibleSourceIdKey.split('\u0000').filter(Boolean);
    const timer = window.setInterval(() => {
      void refreshVisibleOverview(sourceIds);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [activeVisibleSourceIdKey, hasVisibleActiveRemoteWork, refreshVisibleOverview, remoteApi]);

  useEffect(() => {
    let shouldRefreshSources = false;
    let shouldRefreshLibrary = false;

    for (const status of Object.values(syncStatuses)) {
      if (status.status !== 'completed' && status.status !== 'failed' && status.status !== 'cancelled') {
        continue;
      }
      if (!status.finishedAt) {
        continue;
      }

      const eventKey = `${status.status}:${status.finishedAt}`;
      if (terminalSyncEventsRef.current[status.sourceId] === eventKey) {
        continue;
      }

      terminalSyncEventsRef.current[status.sourceId] = eventKey;
      shouldRefreshSources = true;
      shouldRefreshLibrary = true;
    }

    if (shouldRefreshLibrary) {
      window.dispatchEvent(new Event('library:changed'));
    }
    if (shouldRefreshSources) {
      void refreshSources(true);
    }
  }, [refreshSources, syncStatuses]);

  const loadBrowserDirectory = useCallback(async (source: RemoteSource, path: string | null = null): Promise<void> => {
    if (!remoteApi) {
      return;
    }

    const requestToken = (browserRequestTokensRef.current[source.id] ?? 0) + 1;
    browserRequestTokensRef.current[source.id] = requestToken;
    setSelectedSourceId(source.id);
    setBrowserStates((current) => ({
      ...current,
      [source.id]: {
        ...(current[source.id] ?? emptyBrowserState()),
        path,
        items: [],
        indexedTracks: {},
        loading: true,
        error: null,
        lookupError: null,
      },
    }));

    try {
      const items = sortDirectoryItems(await remoteApi.browse(source.id, path));
      const audioPaths = items.filter((item) => item.audio).map((item) => item.path);
      let indexedTracks: Record<string, RemoteTrackLookupItem> = {};
      let lookupError: string | null = null;
      if (audioPaths.length > 0) {
        try {
          indexedTracks = indexedTrackMap(await remoteApi.lookupTracks(source.id, audioPaths));
        } catch (error) {
          lookupError = remoteSourceErrorText(error, '读取入库状态失败。');
        }
      }
      if (browserRequestTokensRef.current[source.id] !== requestToken) {
        return;
      }
      setBrowserStates((current) => ({
        ...current,
        [source.id]: {
          path,
          items,
          indexedTracks,
          loading: false,
          loaded: true,
          error: null,
          lookupError,
        },
      }));
      setMessage(lookupError
        ? `已打开 ${source.displayName}：${formatCount(items.length)} 个项目，入库状态暂未读取。`
        : `已打开 ${source.displayName}：${formatCount(items.length)} 个项目。`);
      updateUxMemory((current) => rememberRemoteLocation(current, {
        sourceId: source.id,
        path: path ?? rootPathForSource(source),
      }));
    } catch (error) {
      if (browserRequestTokensRef.current[source.id] !== requestToken) {
        return;
      }
      const message = remoteSourceErrorText(error, '读取目录失败。');
      setBrowserStates((current) => ({
        ...current,
        [source.id]: {
          ...(current[source.id] ?? emptyBrowserState()),
          path,
          loading: false,
          loaded: true,
          error: message,
          lookupError: null,
        },
      }));
      setMessage(message);
    }
  }, [remoteApi, updateUxMemory]);

  const cancelBrowserLoading = useCallback((source: RemoteSource): void => {
    browserRequestTokensRef.current[source.id] = (browserRequestTokensRef.current[source.id] ?? 0) + 1;
    setBrowserStates((current) => {
      const state = current[source.id];
      if (!state?.loading) {
        return current;
      }
      return { ...current, [source.id]: { ...state, loading: false } };
    });
    setMessage(`已停止读取 ${source.displayName} 的目录，连接信息和现有索引不受影响。`);
  }, []);

  const openSourceBrowser = useCallback(async (source: RemoteSource, path: string | null = null): Promise<void> => {
    switchRemoteProvider(source.provider);
    setShowConnectionOptions(false);
    await loadBrowserDirectory(source, path);
    window.setTimeout(() => {
      browserSectionRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    }, 0);
  }, [loadBrowserDirectory, switchRemoteProvider]);

  const togglePinnedSource = useCallback((sourceId: string): void => {
    updateUxMemory((current) => toggleRemoteSourcePinned(current, sourceId));
  }, [updateUxMemory]);

  const togglePinnedLocation = useCallback((source: RemoteSource, path: string): void => {
    updateUxMemory((current) => toggleRemoteLocationPinned(current, { sourceId: source.id, path }));
  }, [updateUxMemory]);

  const retrySourceConnection = useCallback(async (source: RemoteSource, automatic = false): Promise<void> => {
    if (!remoteApi || source.status === 'disabled' || reconnectStates[source.id] === 'testing') {
      return;
    }
    setReconnectStates((current) => ({ ...current, [source.id]: 'testing' }));
    if (!automatic) {
      setMessage(`正在重新连接 ${source.displayName}…`);
    }
    try {
      const result = await remoteApi.test(source.id);
      setReconnectStates((current) => ({ ...current, [source.id]: result.ok ? 'ready' : 'failed' }));
      if (result.ok) {
        setMessage(automatic
          ? `${source.displayName} 已恢复连接，现有索引和浏览位置都已保留。`
          : `${source.displayName} 已重新连接。`);
      } else {
        const presentation = remoteSourceErrorPresentation(result.message, '重新连接失败。');
        setMessage(`${presentation.title}。${presentation.description}`);
      }
      await refreshSources(true);
    } catch (error) {
      const presentation = remoteSourceErrorPresentation(error, '重新连接失败。');
      setReconnectStates((current) => ({ ...current, [source.id]: 'failed' }));
      setMessage(`${presentation.title}。${presentation.description}`);
    }
  }, [reconnectStates, refreshSources, remoteApi]);

  useEffect(() => {
    const handleOnline = (): void => {
      sources.filter((source) => source.status === 'error').forEach((source) => {
        void retrySourceConnection(source, true);
      });
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [retrySourceConnection, sources]);

  const previewSourceSync = useCallback(async (source: RemoteSource, rootPath: string | null = null): Promise<void> => {
    if (!remoteApi?.previewSync) {
      setMessage('当前桌面桥接版本不支持同步预览，请重启 ECHO 后再试。');
      return;
    }
    if (remotePanelPlaybackActive) {
      setMessage('正在播放，暂不启动远程扫描。播放结束后再预览同步变化。');
      return;
    }
    setSyncPreviewBusySourceId(source.id);
    setSyncPreview(null);
    syncPreviewCancelRequestedRef.current = false;
    setMessage(`正在只读扫描 ${source.displayName}，不会修改曲库…`);
    try {
      const result = await remoteApi.previewSync(source.id, { rootPath, markMissing: rootPath === null });
      setSyncPreview({ sourceId: source.id, rootPath, result });
      setMessage(null);
    } catch (error) {
      if (syncPreviewCancelRequestedRef.current) {
        setMessage(`已停止预览 ${source.displayName}，现有索引不受影响。`);
      } else {
        const presentation = remoteSourceErrorPresentation(error, '同步预览失败。');
        setMessage(`${presentation.title}。${presentation.description}`);
      }
    } finally {
      syncPreviewCancelRequestedRef.current = false;
      setSyncPreviewBusySourceId(null);
    }
  }, [remoteApi, remotePanelPlaybackActive]);

  const cancelPreviewSync = useCallback(async (source: RemoteSource): Promise<void> => {
    if (!remoteApi) {
      return;
    }
    syncPreviewCancelRequestedRef.current = true;
    setMessage(`正在停止预览 ${source.displayName}…`);
    try {
      await remoteApi.cancelSync(source.id);
    } catch (error) {
      syncPreviewCancelRequestedRef.current = false;
      setMessage(remoteSourceErrorText(error, '停止预览失败。'));
    }
  }, [remoteApi]);

  const confirmSyncPreview = useCallback(async (): Promise<void> => {
    if (!remoteApi || !syncPreview) {
      return;
    }
    const source = sources.find((item) => item.id === syncPreview.sourceId);
    if (!source) {
      setSyncPreview(null);
      return;
    }
    const key = `sync:${source.id}`;
    setBusy(key);
    try {
      const status = await remoteApi.sync(source.id, {
        rootPath: syncPreview.rootPath,
        markMissing: syncPreview.rootPath === null,
        includeCover: true,
      });
      setSyncStatuses((current) => ({ ...current, [status.sourceId]: status }));
      setSyncPreview(null);
      setMessage(`已确认同步 ${source.displayName}。后台任务会优先保证本地播放。`);
    } catch (error) {
      setMessage(remoteSourceErrorText(error, '开始同步失败。'));
    } finally {
      setBusy(null);
    }
  }, [remoteApi, sources, syncPreview]);

  const playBrowserItem = useCallback(async (source: RemoteSource, item: RemoteDirectoryItem, indexedTrack?: RemoteTrackLookupItem): Promise<void> => {
    const track = indexedTrack ? trackFromLookupItem(source, indexedTrack) : trackFromBrowserItem(source, item);
    setBusy(`play:${source.id}:${item.path}`);
    setMessage(null);
    try {
      await playTrack(track, {
        source: { type: 'manual', label: sourceQueueLabel(source) },
        forceNewQueueItem: true,
      });
      setMessage(`正在播放：${track.title}`);
    } catch (error) {
      setMessage(remoteSourceErrorText(error, '播放失败。'));
    } finally {
      setBusy(null);
    }
  }, [playTrack]);

  const queueBrowserItem = useCallback((source: RemoteSource, item: RemoteDirectoryItem, indexedTrack?: RemoteTrackLookupItem): void => {
    const track = indexedTrack ? trackFromLookupItem(source, indexedTrack) : trackFromBrowserItem(source, item);
    appendToQueue(track, { type: 'manual', label: sourceQueueLabel(source) });
    setMessage(`已加入队列：${track.title}`);
  }, [appendToQueue]);

  const showSourceInSongs = useCallback((source: RemoteSource): void => {
    window.dispatchEvent(new CustomEvent('app:navigate:songs', { detail: { remoteSourceId: source.id } }));
    setMessage(`已切换到歌曲列表：${source.displayName}`);
  }, []);

  const updateForm = (patch: Partial<RemoteSourceFormState>): void => {
    setRememberedForm((current) => ({ ...current, ...patch }));
    setTestResult(null);
    setMessage(null);
  };

  const toInput = useCallback(
    (provider: RemoteSourceProvider, formState: RemoteSourceFormState = form): RemoteSourceInput => {
      const config: Record<string, unknown> = {
        scanConcurrency: formState.scanConcurrency,
        metadataConcurrency: formState.metadataConcurrency,
        coverConcurrency: formState.coverConcurrency,
        durationBackfillConcurrency: formState.durationBackfillConcurrency,
      };

      if (provider === 'webdav' || provider === 'smb' || provider === 'sshfs') {
        config.rootPath = formState.rootPath.trim() || '/';
      }
      if (provider === 'smb' || provider === 'sshfs') {
        config.accessMode = 'mounted';
        config.pathStyle = provider === 'smb' ? 'unc' : 'posix';
        config.mountGrantId = formState.mountGrantId;
      }
      if (provider === 'subsonic') {
        config.apiVersion = formState.apiVersion.trim() || '1.16.1';
        config.clientName = 'ECHO';
        config.authMode = 'token';
        config.allowCertificateDateErrors = formState.allowCertificateDateErrors;
        config.zconnectWebSession = formState.zconnectWebSession;
      }

      const webDavAuthType = provider === 'webdav' && formState.authType === 'basic' && !formState.username.trim() && !formState.secret
        ? 'none'
        : formState.authType;

      return {
        provider,
        displayName: formState.displayName.trim() || defaultNameFor(provider),
        baseUrl: provider === 'smb' || provider === 'sshfs' ? null : formState.baseUrl.trim(),
        username: webDavAuthType === 'basic' ? formState.username.trim() || null : null,
        secret: webDavAuthType === 'none' ? null : formState.secret,
        authType: webDavAuthType,
        config,
        syncMode: formState.syncMode,
      };
    },
    [form],
  );

  const runFormAction = async (action: 'test' | 'save' | 'saveSync'): Promise<void> => {
    if (!remoteApi || !activeTab.supported) {
      return;
    }

    setBusy(action);
    setMessage(null);
    try {
      const input = toInput(activeProvider, form);
      const sourceToUpdate = editingSourceId
        ? sources.find((source) => source.id === editingSourceId && source.provider === activeProvider) ?? null
        : null;
      if (action === 'test') {
        const result = await remoteApi.test(sourceToUpdate && !form.secret ? sourceToUpdate.id : input);
        const nextResult = result.ok ? result : { ...result, message: remoteSourceErrorText(result.message, '测试连接失败。') };
        setTestResult(nextResult);
        setMessage(nextResult.message);
        return;
      }

      const status = action === 'saveSync' || testResult?.ok === true ? { status: 'enabled' as const } : {};
      const updateInput = { ...input };
      if (sourceToUpdate && !form.secret && input.authType !== 'none') {
        delete updateInput.secret;
      }
      const saved = sourceToUpdate
        ? await remoteApi.update({ id: sourceToUpdate.id, ...updateInput, ...status })
        : await remoteApi.create({ ...input, ...status });
      const savedForm = saved.provider === 'smb' || saved.provider === 'sshfs'
        ? { ...form, mountGrantId: '' }
        : form;
      setProviderFormDraft(saved.provider, savedForm);
      setSelectedSourceId(saved.id);
      setEditingSourceId(saved.id);
      const resultVerb = sourceToUpdate ? '更新' : '保存';
      setMessage(action === 'saveSync' ? `来源已${resultVerb}，正在开始同步。之后切回来会继续停在这个来源。` : `来源已${resultVerb}，之后切回来会继续停在这个来源。`);
      if (action === 'saveSync') {
        await remoteApi.sync(saved.id);
      }
      await refreshSources(true);
    } catch (error) {
      const text = remoteSourceErrorText(error, '操作失败。');
      setMessage(text);
    } finally {
      setBusy(null);
    }
  };

  const authorizeZConnect = async (): Promise<void> => {
    if (!remoteApi || activeProvider !== 'subsonic') {
      return;
    }
    setBusy('authorizeZConnect');
    setMessage(null);
    try {
      const result = await remoteApi.authorizeZConnect(form.baseUrl);
      setRememberedForm((current) => ({
        ...current,
        baseUrl: result.baseUrl,
        zconnectWebSession: result.ok,
        allowCertificateDateErrors: result.ok || current.allowCertificateDateErrors,
      }));
      setTestResult(null);
      setMessage(result.message);
    } catch (error) {
      setMessage(remoteSourceErrorText(error, 'ZConnect 网页授权失败。'));
    } finally {
      setBusy(null);
    }
  };

  const openNavidromeDockerDocs = async (): Promise<void> => {
    if (!appApi?.openExternalUrl) {
      setMessage('桌面桥接不可用，不能打开 Navidrome Docker 文档。');
      return;
    }

    try {
      await appApi.openExternalUrl(navidromeDockerDocsUrl);
      setMessage('已用系统浏览器打开 Navidrome Docker 部署文档。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '打开 Navidrome Docker 文档失败。');
    }
  };

  const selectMountedRoot = async (): Promise<void> => {
    if (!remoteApi || (activeProvider !== 'smb' && activeProvider !== 'sshfs')) {
      return;
    }

    setBusy('selectMountedRoot');
    setMessage(null);
    try {
      const grant = await remoteApi.selectMountedRoot(activeProvider);
      if (grant) {
        updateForm({ mountDisplayName: grant.displayName, mountGrantId: grant.grantId });
        setMessage('已通过系统目录选择器授权该挂载目录。');
      }
    } catch (error) {
      setMessage(remoteSourceErrorText(error, '选择挂载目录失败。'));
    } finally {
      setBusy(null);
    }
  };

  const runSourceAction = useCallback(async (
    source: RemoteSource,
    action: 'test' | 'sync' | 'metadata' | 'cover' | 'match' | 'retryFailed' | 'pauseJobs' | 'toggle' | 'disconnect' | 'delete' | 'cancel' | 'browse',
  ): Promise<void> => {
    if (!remoteApi) {
      return;
    }

    const key = `${action}:${source.id}`;
    setBusy(key);
    setMessage(null);
    try {
      if (action !== 'test' && action !== 'browse') {
        invalidateRemoteSourcesSnapshotCache();
      }
      if (action === 'test') {
        const result = await remoteApi.test(source.id);
        setMessage(result.ok ? result.message : remoteSourceErrorText(result.message, '测试连接失败。'));
      } else if (action === 'sync') {
        await previewSourceSync(source);
        return;
      } else if (action === 'metadata') {
        await remoteApi.startBackgroundJobs(source.id, ['metadata', 'duration-backfill']);
        setMessage('已加入元数据补齐任务。');
      } else if (action === 'cover') {
        const limits = remoteCoverBackgroundLimits[remoteCoverLoadPerformanceMode];
        const runtimeStatus = await remoteApi.updateRuntimeLimits(source.id, { coverConcurrency: limits.cover });
        setJobStatuses((current) => ({ ...current, [source.id]: runtimeStatus }));
        await remoteApi.startBackgroundJobs(source.id, ['cover']);
        const latestGlobalStatus = await remoteApi.getBackgroundGlobalStatus().catch(() => globalJobStatus);
        setGlobalJobStatus(latestGlobalStatus);
        setMessage(latestGlobalStatus.playbackActive
          ? '\u5df2\u52a0\u5165\u7f3a\u5931\u5c01\u9762\u4efb\u52a1\uff1b\u64ad\u653e\u4e2d\u4f1a\u4fdd\u6301\u4f4e\u8d1f\u8f7d\uff0c\u7a7a\u95f2\u540e\u7ee7\u7eed\u5904\u7406\u3002'
          : '\u5df2\u52a0\u5165\u4e00\u5c0f\u6279\u7f3a\u5931\u5c01\u9762\u626b\u63cf\u4efb\u52a1\u3002');
        await refreshStatuses([source.id], false, true);
        return;
      } else if (action === 'match') {
        await remoteApi.startBackgroundJobs(source.id, ['lyrics']);
        const latestGlobalStatus = await remoteApi.getBackgroundGlobalStatus().catch(() => globalJobStatus);
        setGlobalJobStatus(latestGlobalStatus);
        setMessage(latestGlobalStatus.playbackActive
          ? '\u5df2\u52a0\u5165\u6b4c\u8bcd\u5339\u914d\u4efb\u52a1\uff1b\u64ad\u653e\u4e2d\u4f1a\u4fdd\u6301\u4f4e\u8d1f\u8f7d\uff0c\u7a7a\u95f2\u540e\u7ee7\u7eed\u5904\u7406\u3002'
          : '\u5df2\u52a0\u5165\u4e00\u5c0f\u6279\u6b4c\u8bcd\u5339\u914d\u4efb\u52a1\u3002');
        await refreshStatuses([source.id]);
        return;
      } else if (action === 'retryFailed') {
        await remoteApi.retryFailedJobs(source.id, ['metadata', 'duration-backfill']);
        setMessage('\u5df2\u91cd\u8bd5\u5931\u8d25\u7684\u5143\u6570\u636e\u4efb\u52a1\u3002');
      } else if (action === 'pauseJobs') {
        const paused = jobStatuses[source.id]?.paused === true;
        const nextStatus = paused
          ? await remoteApi.resumeBackgroundJobs(source.id)
          : await remoteApi.pauseBackgroundJobs(source.id);
        setJobStatuses((current) => ({ ...current, [source.id]: nextStatus }));
        window.setTimeout(() => {
          void refreshStatuses([source.id], false, true);
        }, 150);
        setMessage(paused ? '\u5df2\u6062\u590d\u8be5\u6765\u6e90\u540e\u53f0\u4efb\u52a1\u3002' : '\u5df2\u6682\u505c\u8be5\u6765\u6e90\u540e\u53f0\u4efb\u52a1\u3002');
        return;
      } else if (action === 'toggle') {
        const enabling = source.status === 'disabled';
        if (!enabling) {
          await remoteApi.cancelSync(source.id).catch(() => undefined);
          browserRequestTokensRef.current[source.id] = (browserRequestTokensRef.current[source.id] ?? 0) + 1;
          setBrowserStates((current) => {
            const state = current[source.id];
            if (!state?.loading) {
              return current;
            }
            return { ...current, [source.id]: { ...state, loading: false } };
          });
        }
        await remoteApi.update({ id: source.id, status: enabling ? 'enabled' : 'disabled' });
        setMessage(enabling
          ? `已重新连接 ${source.displayName}，可以继续浏览和同步。`
          : `已断开 ${source.displayName}；连接信息和本地索引都保留，随时可以重新连接。`);
      } else if (action === 'disconnect') {
        if (!window.confirm(`断开远程来源“${source.displayName}”？本地远程索引会移除，但连接 URL、用户名和密钥会保留，之后可以直接启用并重新同步。`)) {
          return;
        }
        await remoteApi.disconnect(source.id);
        setSources((current) => current.map((item) => (
          item.id === source.id
            ? { ...item, status: 'disabled', indexedTrackCount: 0, lastError: null }
            : item
        )));
        setSyncStatuses((current) => withoutSourceKey(source.id, current));
        setJobStatuses((current) => withoutSourceKey(source.id, current));
        setBrowserStates((current) => withoutSourceKey(source.id, current));
        setSelectedSourceId(source.id);
        setIssuePreviews((current) => withoutSourceKey(source.id, current));
        setOverview((current) => removeOverviewSource(current, source.id));
        window.dispatchEvent(new Event('library:changed'));
        setMessage('来源已断开，连接信息已保留，本地远程索引已移除。');
        await refreshSources(true).catch(() => undefined);
        return;
      } else if (action === 'delete') {
        if (!window.confirm(`删除远程来源“${source.displayName}”？本地远程索引和连接配置都会移除；不会删除服务器上的音乐文件。`)) {
          return;
        }
        await remoteApi.delete(source.id);
        setSources((current) => current.filter((item) => item.id !== source.id));
        setSyncStatuses((current) => withoutSourceKey(source.id, current));
        setJobStatuses((current) => withoutSourceKey(source.id, current));
        setBrowserStates((current) => withoutSourceKey(source.id, current));
        setSelectedSourceId(null);
        setIssuePreviews((current) => withoutSourceKey(source.id, current));
        setOverview((current) => removeOverviewSource(current, source.id));
        updateUxMemory((current) => removeRemoteSourceUxMemory(current, source.id));
        window.dispatchEvent(new Event('library:changed'));
        setMessage('来源已删除，本地远程索引和连接配置已移除；服务器文件不会被删除。');
        await refreshSources(true).catch(() => undefined);
        return;
      } else if (action === 'cancel') {
        await remoteApi.cancelSync(source.id);
      } else if (action === 'browse') {
        await loadBrowserDirectory(source, null);
        return;
      }
      await refreshSources(true);
    } catch (error) {
      setMessage(remoteSourceErrorText(error, '操作失败。'));
    } finally {
      setBusy(null);
    }
  }, [globalJobStatus, jobStatuses, loadBrowserDirectory, previewSourceSync, refreshSources, refreshStatuses, remoteApi, remoteCoverLoadPerformanceMode, updateUxMemory]);

  const syncBrowserDirectory = useCallback(async (source: RemoteSource): Promise<void> => {
    const state = browserStates[source.id] ?? emptyBrowserState();
    const rootPath = state.path ?? rootPathForSource(source);
    await previewSourceSync(source, rootPath);
  }, [browserStates, previewSourceSync]);

  const showSourceIssues = async (source: RemoteSource, kind: RemoteSourceIssueKind): Promise<void> => {
    if (!remoteApi) {
      return;
    }

    const key = `issues:${kind}:${source.id}`;
    setBusy(key);
    setMessage(null);
    try {
      const items = await remoteApi.listIssues(source.id, kind, 6);
      setIssuePreviews((current) => ({ ...current, [source.id]: items }));
      setMessage(items.length > 0
        ? translateStatic('settings.remote.ux.issue.listed', {
            name: source.displayName,
            kind: issueKindLabel(kind),
          })
        : translateStatic('settings.remote.ux.issue.none', {
            name: source.displayName,
            kind: issueKindLabel(kind),
          }));
    } catch (error) {
      setMessage(remoteSourceErrorText(error, '读取问题列表失败。'));
    } finally {
      setBusy(null);
    }
  };

  const hasAnyRemoteSource = overview.totalSources > 0 || sources.length > 0;
  const providerIcon = (provider: RemoteSourceProvider, size = 18): JSX.Element => (
    provider === 'subsonic' || provider === 'jellyfin' || provider === 'emby'
      ? <Server size={size} />
      : provider === 'webdav'
        ? <HardDrive size={size} />
        : <FolderOpen size={size} />
  );

  const renderConnectedLibraryHome = (): JSX.Element => (
    <section className="remote-library-home" aria-label={t('settings.remote.home.sourcesAria')}>
      <header className="remote-library-home-header">
        <div>
          <span>{t('settings.remote.home.eyebrow')}</span>
          <h2>{t('settings.remote.library.title')}</h2>
          <p>{t('settings.remote.home.description')}</p>
        </div>
        <div className="remote-library-home-header-actions">
          <button
            type="button"
            aria-expanded={showConnectionOptions}
            onClick={() => {
              setShowEmptyConnectionForm(false);
              setShowConnectionOptions((current) => !current);
            }}
          >
            <Plus size={16} />
            {showConnectionOptions ? t('settings.remote.home.hideAdd') : t('settings.remote.home.add')}
          </button>
        </div>
      </header>

      <div className="remote-library-home-summary" aria-label={t('settings.remote.overview.aria')}>
        <span>
          <strong>{formatCount(sources.length)}</strong>
          <small>{t('settings.remote.metric.sources')}</small>
        </span>
        <span>
          <strong>{formatCount(overview.trackCount)}</strong>
          <small>{t('settings.remote.metric.indexedTracks')}</small>
        </span>
        <span data-tone={overviewIssueCount > 0 ? 'warning' : 'ready'}>
          <strong>{formatCount(overviewIssueCount)}</strong>
          <small>{t('settings.remote.metric.issues')}</small>
        </span>
        <span data-tone={globalJobStatus.paused || playbackLoadReduced ? 'warning' : 'ready'}>
          <strong>{commandStatusLabel}</strong>
          <small>{t('settings.remote.metric.backgroundStatus')}</small>
        </span>
      </div>

      <div className="remote-library-home-list">
        {sources.map((source) => {
          const sourceOverview = overviewBySourceId.get(source.id) ?? emptyOverviewItem(source);
          const syncStatus = syncStatuses[source.id] ?? emptyStatus(source.id);
          const sourceSummary = sourceHealthSummary(source, sourceOverview, syncStatus, reconnectStates[source.id] ?? 'idle');
          const browserLoading = browserStates[source.id]?.loading === true;
          const syncBusy = syncPreviewBusySourceId === source.id;
          const unavailable = source.status === 'disabled';
          return (
            <article key={source.id} data-tone={sourceSummary.tone}>
              <div className="remote-library-home-source-icon" aria-hidden="true">
                {providerIcon(source.provider, 22)}
              </div>
              <div className="remote-library-home-source-copy">
                <span>{t(providerLabelKeys[source.provider])}</span>
                <h3>{source.displayName}</h3>
                <p>{sourceSummary.title} · {sourceSummary.description}</p>
              </div>
              <div className="remote-library-home-source-stats">
                <span>
                  <strong>{formatCount(sourceOverview.trackCount)}</strong>
                  <small>{t('settings.remote.unit.songs')}</small>
                </span>
                <span>
                  <strong>{formatCount(sourceOverview.albumCount)}</strong>
                  <small>{t('settings.remote.unit.albums')}</small>
                </span>
                <span>
                  <strong>{formatDate(source.lastSyncAt)}</strong>
                  <small>{t('settings.remote.home.lastSync')}</small>
                </span>
              </div>
              <div className="remote-library-home-source-actions">
                <button type="button" onClick={() => startEditingRemoteSource(source)}>
                  <Pencil size={15} />
                  编辑连接
                </button>
                {browserLoading ? (
                  <button type="button" data-variant="stop" onClick={() => cancelBrowserLoading(source)}>
                    <XCircle size={15} />
                    {t('settings.remote.home.stopOpening')}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={unavailable}
                    onClick={() => void openSourceBrowser(source)}
                  >
                    <FolderOpen size={15} />
                    {t('settings.remote.home.open')}
                  </button>
                )}
                {source.status === 'error' ? (
                  <button type="button" disabled={reconnectStates[source.id] === 'testing'} onClick={() => void retrySourceConnection(source)}>
                    <Wifi size={15} />
                    {reconnectStates[source.id] === 'testing' ? t('settings.remote.home.reconnecting') : t('settings.remote.home.reconnect')}
                  </button>
                ) : unavailable ? (
                  <button
                    type="button"
                    disabled={busy === `toggle:${source.id}`}
                    onClick={() => void runSourceAction(source, 'toggle')}
                  >
                    <Wifi size={15} />
                    {t('settings.remote.home.reconnect')}
                  </button>
                ) : syncBusy ? (
                  <button type="button" data-variant="stop" onClick={() => void cancelPreviewSync(source)}>
                    <XCircle size={15} />
                    {t('settings.remote.home.stopPreview')}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={remotePanelPlaybackActive}
                    onClick={() => void previewSourceSync(source)}
                  >
                    <RefreshCw size={15} />
                    {remotePanelPlaybackActive ? t('settings.remote.home.playing') : t('settings.remote.home.sync')}
                  </button>
                )}
                {source.status !== 'disabled' ? (
                  <button
                    type="button"
                    data-variant="disconnect"
                    disabled={busy === `toggle:${source.id}`}
                    onClick={() => void runSourceAction(source, 'toggle')}
                  >
                    <WifiOff size={15} />
                    {t('settings.remote.home.disconnect')}
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );

  const renderConnectionLanding = (): JSX.Element => {
    return (
      <section className="remote-empty-library" aria-label={t('settings.remote.start.aria')}>
        <header className="remote-empty-library-header">
          <div>
            <h2>{t('settings.remote.hero.title')}</h2>
            <p>{t(hasAnyRemoteSource ? 'settings.remote.library.description' : 'settings.remote.empty.lede')}</p>
          </div>
          <div className="remote-empty-library-trust">
            <ShieldCheck size={17} />
            <strong>{t('settings.remote.guardrail.title')}</strong>
            <span>{t('settings.remote.guardrail.description')}</span>
          </div>
        </header>

        <section className="remote-empty-recommended" aria-label={t('settings.remote.badge.recommended')}>
          <div className="remote-empty-recommended-icon" aria-hidden="true">
            <Server size={28} />
          </div>
          <div className="remote-empty-recommended-copy">
            <span>{t('settings.remote.badge.recommended')}</span>
            <h3>Navidrome / Subsonic</h3>
            <p>{t('settings.remote.provider.subsonic.summary')}</p>
          </div>
          <button type="button" onClick={() => startAddingRemoteProvider('subsonic')}>
            {t('settings.remote.provider.subsonic.action')}
            <ChevronRight size={17} />
          </button>
        </section>

        <div className="remote-empty-library-body">
          <section className="remote-empty-alternatives">
            <h3>{t('settings.remote.empty.alternatives')}</h3>
            <div className="remote-empty-alternative-list">
              {tabs.filter((tab) => tab.provider !== 'subsonic').map((tab) => {
                const guide = providerGuides[tab.provider];
                return (
                  <button
                    key={tab.provider}
                    type="button"
                    data-active={showEmptyConnectionForm && activeProvider === tab.provider ? 'true' : undefined}
                    onClick={() => startAddingRemoteProvider(tab.provider)}
                  >
                    <i aria-hidden="true">{providerIcon(tab.provider)}</i>
                    <span>
                      <strong>{t(tab.labelKey)}</strong>
                      <small>{t(guide.promiseKey)}</small>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                );
              })}
            </div>
          </section>

          {hasAnyRemoteSource ? (
            <aside className="remote-empty-preview">
              <h3>{t('settings.remote.library.title')}</h3>
              <div className="remote-empty-preview-list">
                {sources.map((source) => {
                  const sourceOverview = overviewBySourceId.get(source.id) ?? emptyOverviewItem(source);
                  return (
                    <span key={source.id}>
                      {providerIcon(source.provider)}
                      <span>
                        <strong>{source.displayName}</strong>
                        <small>
                          {t(providerLabelKeys[source.provider])} · {t('settings.remote.metric.indexedTracks')} {formatCount(sourceOverview.trackCount)}
                        </small>
                      </span>
                    </span>
                  );
                })}
              </div>
            </aside>
          ) : (
            <aside className="remote-empty-preview">
              <img src={remoteLibraryPreview} alt="" />
              <h3>{t('settings.remote.empty.preview.title')}</h3>
              <div className="remote-empty-preview-list">
                <span>
                  <Music2 size={18} />
                  <span>
                    <strong>{t('settings.remote.empty.preview.browse.title')}</strong>
                    <small>{t('settings.remote.empty.preview.browse.description')}</small>
                  </span>
                </span>
                <span>
                  <RefreshCw size={18} />
                  <span>
                    <strong>{t('settings.remote.empty.preview.sync.title')}</strong>
                    <small>{t('settings.remote.empty.preview.sync.description')}</small>
                  </span>
                </span>
                <span>
                  <Check size={18} />
                  <span>
                    <strong>{t('settings.remote.empty.preview.playback.title')}</strong>
                    <small>{t('settings.remote.empty.preview.playback.description')}</small>
                  </span>
                </span>
              </div>
            </aside>
          )}
        </div>

        {showEmptyConnectionForm ? (
          <div className="remote-empty-connection-form">
            <div className="remote-section-heading remote-section-heading--compact">
              <div>
                <span>{t(activeProviderGuide.fitKey)}</span>
                <h3>{t(activeProviderGuide.actionKey)}</h3>
              </div>
              <p>{t(activeProviderGuide.summaryKey)}</p>
            </div>
            {activeTab.supported ? renderForm() : (
              <section className="remote-source-coming-soon">
                <Play size={18} />
                <strong>{t('settings.remote.comingSoon.title').replace('{provider}', t(activeTab.labelKey))}</strong>
                <span>{t('settings.remote.comingSoon.description')}</span>
              </section>
            )}
          </div>
        ) : null}
      </section>
    );
  };

  const renderHumanizedHub = (): JSX.Element => {
    const sourceById = new Map(sources.map((source) => [source.id, source]));
    const recentLocations = uxMemory.recentLocations
      .flatMap((item) => {
        const source = sourceById.get(item.sourceId);
        return source ? [{ item, source }] : [];
      })
      .slice(0, 5);
    const pinnedSources = uxMemory.pinnedSourceIds
      .map((sourceId) => sourceById.get(sourceId))
      .filter((source): source is RemoteSource => Boolean(source));
    const pinnedLocations = uxMemory.pinnedLocations
      .flatMap((item) => {
        const source = sourceById.get(item.sourceId);
        return source ? [{ item, source }] : [];
      });
    const errorSources = sources.filter((source) => source.status === 'error');
    const hasPins = pinnedSources.length > 0 || pinnedLocations.length > 0;

    return (
      <div className="remote-humanized-stack">
        <section className="remote-humanized-hub" aria-label="远程音乐快捷入口">
          <article className="remote-humanized-panel">
            <header>
              <span><History size={17} />继续浏览</span>
              {recentLocations.length > 0 ? (
                <button type="button" onClick={() => updateUxMemory((current) => ({ ...current, recentLocations: [] }))}>清空</button>
              ) : null}
            </header>
            {recentLocations.length > 0 ? (
              <div className="remote-humanized-list">
                {recentLocations.map(({ item, source }) => (
                  <button key={`${item.sourceId}:${item.path}`} type="button" onClick={() => void loadBrowserDirectory(source, item.path)}>
                    <FolderOpen size={17} />
                    <span>
                      <strong>{item.path}</strong>
                      <small>{source.displayName} · {formatDate(item.visitedAt)}</small>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                ))}
              </div>
            ) : (
              <p>浏览过的远程目录会留在这里，下次可以直接回到上次的位置。</p>
            )}
          </article>

          <article className="remote-humanized-panel">
            <header>
              <span><Pin size={17} />收藏与置顶</span>
            </header>
            {hasPins ? (
              <div className="remote-humanized-list">
                {pinnedSources.map((source) => (
                  <div className="remote-humanized-row" key={`source:${source.id}`}>
                    <button type="button" onClick={() => void loadBrowserDirectory(source, null)}>
                      <Server size={17} />
                      <span><strong>{source.displayName}</strong><small>{t(providerLabelKeys[source.provider])} · 已置顶来源</small></span>
                      <ChevronRight size={16} />
                    </button>
                    <button type="button" aria-label={`取消置顶 ${source.displayName}`} onClick={() => togglePinnedSource(source.id)}><PinOff size={15} /></button>
                  </div>
                ))}
                {pinnedLocations.map(({ item, source }) => (
                  <div className="remote-humanized-row" key={`path:${item.sourceId}:${item.path}`}>
                    <button type="button" onClick={() => void loadBrowserDirectory(source, item.path)}>
                      <FolderOpen size={17} />
                      <span><strong>{item.path}</strong><small>{source.displayName} · 收藏目录</small></span>
                      <ChevronRight size={16} />
                    </button>
                    <button type="button" aria-label={`取消收藏 ${item.path}`} onClick={() => togglePinnedLocation(source, item.path)}><PinOff size={15} /></button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="remote-pin-suggestions">
                <p>把常用来源放在手边，目录也可以在文件浏览器里收藏。</p>
                <div>
                  {sources.slice(0, 3).map((source) => (
                    <button key={source.id} type="button" onClick={() => togglePinnedSource(source.id)}>
                      <Pin size={14} />置顶 {source.displayName}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </article>
        </section>

        {errorSources.length > 0 ? (
          <section className="remote-reconnect-center" aria-label="需要恢复连接的来源">
            {errorSources.map((source) => {
              const presentation = remoteSourceErrorPresentation(source.lastError);
              const reconnectState = reconnectStates[source.id] ?? 'idle';
              return (
                <article key={source.id}>
                  <AlertTriangle size={18} />
                  <div>
                    <strong>{source.displayName} · {presentation.title}</strong>
                    <span>{presentation.description}</span>
                  </div>
                  <button type="button" disabled={reconnectState === 'testing'} onClick={() => void retrySourceConnection(source)}>
                    {reconnectState === 'testing' ? <RefreshCw className="spinning-icon" size={15} /> : <Wifi size={15} />}
                    {reconnectState === 'testing' ? '正在重连' : '重新连接'}
                  </button>
                </article>
              );
            })}
            <p>网络恢复时，ECHO 只会为异常来源自动测试一次，不会循环打扰服务器。</p>
          </section>
        ) : null}
      </div>
    );
  };

  const renderSourceHealthCenter = (): JSX.Element => (
    <section className="remote-health-center" aria-label="来源健康摘要">
      <header>
        <div>
          <span>来源健康</span>
          <h3>{sources.every((source) => source.status === 'enabled') ? '你的远程音乐都在正常待命' : '有来源需要留意'}</h3>
        </div>
        <small>只显示用户需要知道的结论，技术细节仍放在高级维护中。</small>
      </header>
      <div>
        {sources.map((source) => {
          const sourceOverview = overviewBySourceId.get(source.id) ?? emptyOverviewItem(source);
          const syncStatus = syncStatuses[source.id] ?? emptyStatus(source.id);
          const summary = sourceHealthSummary(source, sourceOverview, syncStatus, reconnectStates[source.id] ?? 'idle');
          return (
            <article key={source.id} data-tone={summary.tone}>
              <i aria-hidden="true" />
              <span>
                <strong>{source.displayName}</strong>
                <small>{t(providerLabelKeys[source.provider])}</small>
              </span>
              <span>
                <strong>{summary.title}</strong>
                <small>{summary.description}</small>
              </span>
              {source.status === 'error' ? (
                <button type="button" onClick={() => void retrySourceConnection(source)}>重新连接</button>
              ) : syncPreviewBusySourceId === source.id ? (
                <button type="button" data-variant="stop" onClick={() => void cancelPreviewSync(source)}>停止预览</button>
              ) : (
                <button
                  type="button"
                  disabled={remotePanelPlaybackActive}
                  onClick={() => void previewSourceSync(source)}
                >
                  {remotePanelPlaybackActive ? '播放中' : '预览同步'}
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );

  const renderSyncPreview = (): JSX.Element | null => {
    if (!syncPreview) {
      return null;
    }
    const source = sources.find((item) => item.id === syncPreview.sourceId);
    if (!source) {
      return null;
    }
    const { result } = syncPreview;
    return (
      <section className="remote-sync-preview" aria-label={`${source.displayName} 同步预览`}>
        <header>
          <div>
            <span>只读预览 · {syncPreview.rootPath ? `目录 ${syncPreview.rootPath}` : '完整来源'}</span>
            <h3>{result.complete ? '确认这些变化后再同步' : '这次扫描没有完整结束'}</h3>
          </div>
          <button type="button" onClick={() => setSyncPreview(null)}>关闭</button>
        </header>
        <div className="remote-sync-preview-counts">
          <span data-tone="added"><em>新增</em><strong>{formatCount(result.addedCount)}</strong><small>首歌曲</small></span>
          <span data-tone="updated"><em>更新</em><strong>{formatCount(result.updatedCount)}</strong><small>首歌曲</small></span>
          <span><em>没有变化</em><strong>{formatCount(result.unchangedCount)}</strong><small>首歌曲</small></span>
          <span data-tone={result.missingCount && result.missingCount > 0 ? 'missing' : undefined}>
            <em>暂时找不到</em><strong>{result.missingCount === null ? '未知' : formatCount(result.missingCount)}</strong><small>不会立即删除</small>
          </span>
        </div>
        <p>
          {result.complete
            ? `本次共发现 ${formatCount(result.discoveredCount)} 首。确认后才会写入索引；暂时找不到的歌曲只会标记状态，不会删除服务器文件。`
            : `有 ${formatCount(result.failedCount)} 个位置读取失败，因此没有计算缺失歌曲。请先恢复连接后重新预览。`}
        </p>
        <footer>
          <button type="button" onClick={() => setSyncPreview(null)}>先不处理</button>
          <button type="button" disabled={!result.complete || busy === `sync:${source.id}`} onClick={() => void confirmSyncPreview()}>
            {busy === `sync:${source.id}` ? '正在开始' : '确认并同步'}
          </button>
        </footer>
      </section>
    );
  };

  const renderOverview = (): JSX.Element => {
    return (
      <section className="remote-command-center" aria-label={t('settings.remote.overview.aria')}>
      <div className="remote-command-panel">
        <div className="remote-command-eyebrow">
          <ShieldCheck size={16} />
          <span>{t('settings.remote.guardrail.title')}</span>
        </div>
        <div>
          <h3>{t('settings.remote.overview.title')}</h3>
          <p>{t('settings.remote.overview.description')}</p>
        </div>
        <div className="remote-command-status-row">
          <span data-tone={globalJobStatus.paused ? 'paused' : playbackLoadReduced ? 'warning' : 'ready'}>
            <Activity size={15} />
            {commandStatusLabel}
          </span>
          <span>
            <RefreshCw size={15} />
            {t('settings.remote.metric.sync')} {formatCount(runningSyncCount)}
          </span>
          <span>
            <Gauge size={15} />
            {t('settings.remote.metric.queue')} {formatCount(queuedJobCount)}
          </span>
          <span data-tone={overviewIssueCount > 0 ? 'warning' : 'ready'}>
            <AlertTriangle size={15} />
            {t('settings.remote.metric.issues')} {formatCount(overviewIssueCount)}
          </span>
        </div>
      </div>
      <div className="remote-overview-grid">
        <span>
          <Server size={17} />
          <em>{t('settings.remote.metric.sources')}</em>
          <strong>{formatCount(overview.totalSources)}</strong>
          <small>{t('settings.remote.metric.enabled')} {formatCount(overview.enabledSources)} / {t('settings.remote.metric.error')} {formatCount(overview.errorSources)}</small>
        </span>
        <span>
          <Music2 size={17} />
          <em>{t('settings.remote.metric.indexedTracks')}</em>
          <strong>{formatCount(overview.trackCount)}</strong>
          <small>{formatCount(overview.albumCount)} {t('settings.remote.unit.albums')} / {formatCount(overview.artistCount)} {t('settings.remote.unit.artists')}</small>
        </span>
        <span>
          <HardDrive size={17} />
          <em>{t('settings.remote.metric.knownSize')}</em>
          <strong>{formatBytes(overview.totalSizeBytes)}</strong>
          <small>{t('settings.remote.metric.missing')} {formatCount(overview.missingTrackCount)} {t('settings.remote.unit.tracks')}</small>
        </span>
        <span>
          <Database size={17} />
          <em>{t('settings.remote.metric.metadataCompletion')}</em>
          <strong>{statusCompletionText(overview.metadata)}</strong>
          <small>{t('settings.remote.metric.abnormal')} {formatCount(statusIssueCount(overview.metadata))} {t('settings.remote.unit.tracks')}</small>
        </span>
        <span>
          <FolderOpen size={17} />
          <em>{t('settings.remote.metric.coverCompletion')}</em>
          <strong>{statusCompletionText(overview.cover)}</strong>
          <small>{t('settings.remote.metric.failed')} {formatCount(statusIssueCount(overview.cover))} {t('settings.remote.unit.tracks')}</small>
        </span>
        <span>
          <Gauge size={17} />
          <em>{t('settings.remote.metric.backgroundStatus')}</em>
          <strong>{commandStatusLabel}</strong>
          <small>{globalJobStatus.updatedAt ? formatDate(globalJobStatus.updatedAt) : t('settings.remote.overview.backgroundFallback')}</small>
        </span>
      </div>
    </section>
    );
  };

  const renderProviderWorkspace = (): JSX.Element => {
    const activeSummary = activeProviderSummary;
    const hasSources = (activeSummary?.sourceCount ?? 0) > 0;
    const providerIcon = (provider: RemoteSourceProvider, size = 18): JSX.Element => (
      provider === 'subsonic' || provider === 'jellyfin' || provider === 'emby'
        ? <Server size={size} />
        : provider === 'webdav'
          ? <HardDrive size={size} />
          : <FolderOpen size={size} />
    );

    return (
      <section className="remote-provider-workspace" aria-label={t('settings.remote.providerWorkspace.aria')}>
        <div className="remote-section-heading">
          <div>
            <span>{t('settings.remote.providerWorkspace.eyebrow')}</span>
            <h3>{t('settings.remote.providerWorkspace.title')}</h3>
          </div>
          <p>{t('settings.remote.providerWorkspace.description')}</p>
        </div>
        <div className="remote-provider-workspace-body">
          <nav className="remote-source-tabs remote-provider-choice-grid" aria-label={t('settings.remote.providerWorkspace.choiceAria')}>
            {tabs.map((tab) => {
              const summary = providerSummaries.find((item) => item.provider === tab.provider);
              const recommended = tab.provider === 'subsonic';
              const guide = providerGuides[tab.provider];
              const statusText = summary && summary.sourceCount > 0
                ? `${recommended ? `${t('settings.remote.badge.recommended')} · ` : ''}${formatCount(summary.sourceCount)} ${t('settings.remote.unit.sources')} · ${formatCount(summary.trackCount)} ${t('settings.remote.unit.tracks')}`
                : recommended ? `${t('settings.remote.badge.recommended')} · ${t('settings.remote.status.disconnected')}` : t('settings.remote.status.disconnected');
              return (
                <button
                  key={tab.provider}
                  type="button"
                  className={`remote-provider-choice${tab.provider === activeProvider ? ' active' : ''}`}
                  data-recommended={recommended ? 'true' : undefined}
                  onClick={() => switchRemoteProvider(tab.provider)}
                >
                  <i aria-hidden="true">{providerIcon(tab.provider)}</i>
                  <span>
                    <strong>{t(guide.intentKey)}</strong>
                    <em>{t(tab.labelKey)}</em>
                    <small>{t(guide.promiseKey)}</small>
                  </span>
                  <b>{statusText}</b>
                </button>
              );
            })}
          </nav>

          <aside className="remote-provider-focus" aria-label={`${t(activeTab.labelKey)} ${t('settings.remote.providerWorkspace.currentEntry')}`}>
            <div className="remote-provider-focus-icon">
              {providerIcon(activeProvider, 22)}
            </div>
            <div className="remote-provider-focus-copy">
              <span>{t(activeProviderGuide.fitKey)}</span>
              <strong>{t(activeProviderGuide.actionKey)}</strong>
              <p>{t(activeProviderGuide.summaryKey)}</p>
            </div>
            <div className="remote-provider-focus-stats">
              <span data-tone={activeProvider === 'subsonic' ? 'ready' : undefined}>{t(activeProviderGuide.toneKey)}</span>
              <span>{hasSources ? `${t('settings.remote.metric.sources')} ${formatCount(activeSummary?.sourceCount ?? 0)}` : t('settings.remote.status.disconnected')}</span>
              <span>{formatCount(activeSummary?.trackCount ?? 0)} {t('settings.remote.unit.songs')}</span>
              <span data-tone={(activeSummary?.issueCount ?? 0) + (activeSummary?.errorCount ?? 0) > 0 ? 'warning' : 'ready'}>
                {t('settings.remote.metric.issues')} {formatCount((activeSummary?.issueCount ?? 0) + (activeSummary?.errorCount ?? 0))}
              </span>
            </div>
            <div className="remote-provider-focus-actions">
              <button type="button" onClick={() => startAddingRemoteProvider(activeProvider)}>
                <Plus size={15} />
                {t('settings.remote.action.startConnection')}
              </button>
              {selectedSource ? (
                <button type="button" onClick={() => void runSourceAction(selectedSource, 'browse')}>
                  <FolderOpen size={15} />
                  {t('settings.remote.action.openCurrentSource')}
                </button>
              ) : null}
            </div>
          </aside>
        </div>
      </section>
    );
  };

  const renderBrowserWorkbench = (): JSX.Element | null => {
    if (
      !activeTab.supported ||
      visibleSources.length === 0 ||
      !selectedSource ||
      !selectedBrowser ||
      (!selectedBrowser.loading && !selectedBrowser.loaded && !selectedBrowser.error)
    ) {
      return null;
    }

    const sourceOverview = overviewBySourceId.get(selectedSource.id) ?? emptyOverviewItem(selectedSource);
    const syncStatus = syncStatuses[selectedSource.id] ?? emptyStatus(selectedSource.id);
    const syncProgress = syncProgressFor(syncStatus);
    const currentPath = displayPathForBrowser(selectedSource, selectedBrowser.path);
    const currentLocationPinned = uxMemory.pinnedLocations.some((item) => item.sourceId === selectedSource.id && item.path === currentPath);
    const parentPath = parentBrowserPath(selectedSource, selectedBrowser.path);
    const canGoUp = currentPath !== rootPathForSource(selectedSource);
    const breadcrumbs = browserBreadcrumbs(selectedSource, selectedBrowser.path);
    const directoryCount = selectedBrowser.items.filter((item) => item.kind === 'directory').length;
    const audioItems = selectedBrowser.items.filter((item) => item.audio);
    const indexedAudioCount = audioItems.filter((item) => selectedBrowser.indexedTracks[item.path]).length;
    const unindexedAudioCount = Math.max(0, audioItems.length - indexedAudioCount);
    const filteredItems = selectedBrowser.items.filter((item) => shouldShowBrowserItem(item, selectedBrowser.indexedTracks[item.path], browserFilter));

    return (
      <section ref={browserSectionRef} className="remote-browser-workbench" aria-label="网盘文件浏览器">
        <aside className="remote-browser-sources" aria-label="远程来源">
          <div className="remote-browser-panel-head">
            <strong>来源</strong>
            <span>{formatCount(visibleSources.length)} 个</span>
          </div>
          <div className="remote-browser-source-list">
            {visibleSources.map((source) => {
              const itemOverview = overviewBySourceId.get(source.id) ?? emptyOverviewItem(source);
              const state = browserStates[source.id];
              const selected = source.id === selectedSource.id;
              return (
                <div key={source.id} className={selected ? 'remote-browser-source-item active' : 'remote-browser-source-item'}>
                  <button
                    type="button"
                    className="remote-browser-source-select"
                    onClick={() => {
                      setSelectedSourceId(source.id);
                      if (!state?.loaded && !state?.loading) {
                        void loadBrowserDirectory(source, null);
                      }
                    }}
                  >
                    <span>
                      <strong>{source.displayName}</strong>
                      <small>{t(providerLabelKeys[source.provider])} · {sourceStatusLabel(source.status)}</small>
                    </span>
                    <em>{formatCount(itemOverview.trackCount)} {t('settings.remote.unit.tracks')}</em>
                  </button>
                  {source.status !== 'disabled' ? (
                    <button
                      type="button"
                      className="remote-browser-source-delete remote-browser-source-disconnect"
                      aria-label={`${t('settings.remote.home.disconnect')} ${source.displayName}`}
                      title={t('settings.remote.home.disconnect')}
                      disabled={busy === `toggle:${source.id}`}
                      onClick={() => void runSourceAction(source, 'toggle')}
                    >
                      <WifiOff size={14} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="remote-browser-source-delete remote-browser-source-reconnect"
                      aria-label={`${t('settings.remote.home.reconnect')} ${source.displayName}`}
                      title={t('settings.remote.home.reconnect')}
                      disabled={busy === `toggle:${source.id}`}
                      onClick={() => void runSourceAction(source, 'toggle')}
                    >
                      <Wifi size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="remote-browser-source-delete"
                    aria-label={`${t('settings.remote.action.deleteSource')} ${source.displayName}`}
                    title={t('settings.remote.action.deleteSource')}
                    onClick={() => void runSourceAction(source, 'delete')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </aside>

        <div className="remote-file-browser">
          <div className="remote-file-browser-head">
            <div>
              <span className="remote-file-browser-eyebrow">
                <FolderOpen size={15} />
                {t(providerLabelKeys[selectedSource.provider])}
              </span>
              <h3>{selectedSource.displayName}</h3>
              <p>{currentPath}</p>
            </div>
            <div className="remote-file-browser-actions">
              <button
                type="button"
                aria-pressed={currentLocationPinned}
                onClick={() => togglePinnedLocation(selectedSource, currentPath)}
              >
                {currentLocationPinned ? <PinOff size={15} /> : <Pin size={15} />}
                {currentLocationPinned ? '取消收藏' : '收藏目录'}
              </button>
              <button type="button" disabled={!canGoUp || selectedBrowser.loading} onClick={() => void loadBrowserDirectory(selectedSource, parentPath)}>
                <ChevronLeft size={15} />{t('settings.remote.browser.up')}
              </button>
              <button type="button" disabled={selectedBrowser.loading} onClick={() => void loadBrowserDirectory(selectedSource, selectedBrowser.path)}>
                <RefreshCw size={15} />{t('settings.remote.browser.refreshDirectory')}
              </button>
              {syncPreviewBusySourceId === selectedSource.id ? (
                <button type="button" data-variant="stop" onClick={() => void cancelPreviewSync(selectedSource)}>
                  <XCircle size={15} />停止预览
                </button>
              ) : (
                <button type="button" disabled={remotePanelPlaybackActive} onClick={() => void syncBrowserDirectory(selectedSource)}>
                  <Database size={15} />{remotePanelPlaybackActive ? '播放中' : '预览同步'}
                </button>
              )}
            </div>
          </div>

          <div className="remote-browser-breadcrumbs" aria-label={t('settings.remote.browser.currentDirectory')}>
            {breadcrumbs.map((crumb, index) => {
              const isCurrent = (selectedBrowser.path === null && crumb.path === null) || selectedBrowser.path === crumb.path;
              return (
                <button
                  key={`${crumb.path ?? 'root'}:${index}`}
                  type="button"
                  disabled={isCurrent || selectedBrowser.loading}
                  aria-current={isCurrent ? 'page' : undefined}
                  onClick={() => void loadBrowserDirectory(selectedSource, crumb.path)}
                >
                  {crumb.label}
                </button>
              );
            })}
          </div>

          <div className="remote-browser-summary" aria-label={`${selectedSource.displayName} ${t('settings.remote.browser.summary')}`}>
            <span><Music2 size={15} />{t('settings.remote.metric.indexed')} {formatCount(sourceOverview.trackCount)} {t('settings.remote.unit.tracks')}</span>
            <span><HardDrive size={15} />{t('settings.remote.metric.size')} {formatBytes(sourceOverview.totalSizeBytes)}</span>
            <span><Gauge size={15} />{selectedSource.syncMode === 'browse' ? t('settings.remote.syncMode.browse.short') : t('settings.remote.syncMode.indexable.short')}</span>
          </div>

          {syncStatus.status === 'running' || syncStatus.currentPath ? (
            <div
              className={`remote-scan-progress${syncProgress.active ? ' remote-scan-progress--active' : ''}`}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={syncProgress.total || 100}
              aria-valuenow={syncProgress.total > 0 ? syncProgress.processed : undefined}
              aria-label={`${selectedSource.displayName} 当前目录同步进度`}
            >
              <div className="remote-scan-progress-head">
                <span>当前目录同步</span>
                <strong>{syncProgress.label}</strong>
              </div>
              <div className="remote-scan-progress-track">
                <span style={{ width: `${syncProgress.total > 0 ? syncProgress.percent : syncProgress.active ? 18 : 0}%` }} />
              </div>
              {syncStatus.currentPath ? <small>当前路径：{syncStatus.currentPath}</small> : null}
            </div>
          ) : null}

          {selectedBrowser.loaded ? (
            <div className="remote-browser-toolbar" aria-label="当前目录统计和筛选">
              <div className="remote-browser-directory-stats">
                <span>文件夹 {formatCount(directoryCount)}</span>
                <span>音频 {formatCount(audioItems.length)}</span>
                <span>已入库 {formatCount(indexedAudioCount)}</span>
                <span>未索引 {formatCount(unindexedAudioCount)}</span>
              </div>
              <div className="remote-browser-filter" role="group" aria-label="文件筛选">
                {browserFilterOptions().map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={browserFilter === option.value ? 'active' : ''}
                    onClick={() => setBrowserFilter(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {selectedBrowser.loading ? (
            <div className="remote-browser-loading-note">
              <p className="settings-inline-note">正在读取目录...</p>
              <button type="button" onClick={() => cancelBrowserLoading(selectedSource)}>
                <XCircle size={14} />停止读取
              </button>
            </div>
          ) : null}
          {selectedBrowser.lookupError ? <p className="settings-inline-note">入库状态暂未读取：{selectedBrowser.lookupError}</p> : null}
          {selectedBrowser.error ? (
            <div className="remote-browser-error">
              <AlertTriangle size={16} />
              <span>{selectedBrowser.error}</span>
              <button type="button" onClick={() => void loadBrowserDirectory(selectedSource, selectedBrowser.path)}>重试</button>
            </div>
          ) : null}
          {!selectedBrowser.loaded && !selectedBrowser.loading ? (
            <div className="remote-browser-empty">
              <FolderOpen size={22} />
              <div>
                <strong>打开文件夹浏览这个来源</strong>
                <span>这里只按需读取当前目录，不会开始全盘扫描或下载。</span>
              </div>
              <button type="button" onClick={() => void loadBrowserDirectory(selectedSource, null)}>打开根目录</button>
            </div>
          ) : null}
          {selectedBrowser.loaded && !selectedBrowser.loading && !selectedBrowser.error && selectedBrowser.items.length === 0 ? (
            <div className="remote-browser-empty">
              <FolderOpen size={22} />
              <div>
                <strong>这个目录没有可显示项目</strong>
                <span>可以返回上级目录，或检查远程来源的根目录设置。</span>
              </div>
            </div>
          ) : null}
          {!selectedBrowser.error && selectedBrowser.loaded && selectedBrowser.items.length > 0 && filteredItems.length === 0 ? (
            <div className="remote-browser-empty">
              <FolderOpen size={22} />
              <div>
                <strong>当前筛选没有匹配项目</strong>
                <span>可以切回全部，或进入其它目录查看。</span>
              </div>
            </div>
          ) : null}
          {!selectedBrowser.error && filteredItems.length > 0 ? (
            <div className="remote-file-list" aria-label={`${selectedSource.displayName} 文件列表`}>
              {filteredItems.map((item) => {
                const itemName = nameForDirectoryItem(item);
                const isDirectory = item.kind === 'directory';
                const indexedTrack = selectedBrowser.indexedTracks[item.path];
                const playKey = `play:${selectedSource.id}:${item.path}`;
                return (
                  <div className="remote-file-row" key={item.path} data-kind={isDirectory ? 'directory' : item.audio ? 'audio' : 'file'}>
                    <div className="remote-file-row-main">
                      <span className="remote-file-kind">
                        {isDirectory ? <FolderOpen size={16} /> : item.audio ? <Music2 size={16} /> : <File size={16} />}
                      </span>
                      <div>
                        {isDirectory ? (
                          <button type="button" className="remote-file-name-button" onClick={() => void loadBrowserDirectory(selectedSource, item.path)}>
                            {itemName}
                          </button>
                        ) : indexedTrack ? (
                          <strong>{indexedTrack.title}</strong>
                        ) : (
                          <strong>{itemName}</strong>
                        )}
                        <small>
                          {isDirectory
                            ? '文件夹'
                            : indexedTrack
                              ? `${itemName} · ${indexedTrack.artist} · ${indexedTrack.album}`
                              : item.audio
                                ? `${audioFormatFor(item)} · 未索引 / 可直接播放`
                                : item.contentType ?? '普通文件'}
                          {' · '}
                          {formatBytes(item.sizeBytes ?? 0)}
                          {item.modifiedAt ? ` · ${formatDate(item.modifiedAt)}` : ''}
                        </small>
                        {indexedTrack ? (
                          <div className="remote-file-meta-strip">
                            <span data-tone="ready">已入库</span>
                            <span>{translateStatic('settings.remote.ux.browser.metadataLabel', { status: remoteTrackStatusLabel(indexedTrack.metadataStatus) })}</span>
                            <span>{translateStatic('settings.remote.ux.browser.coverLabel', { status: remoteTrackStatusLabel(indexedTrack.coverStatus) })}</span>
                            <span>{translateStatic('settings.remote.ux.browser.lyricsLabel', { status: remoteTrackStatusLabel(indexedTrack.lyricsStatus) })}</span>
                          </div>
                        ) : item.audio ? (
                          <div className="remote-file-meta-strip">
                            <span data-tone="warning">未索引</span>
                            <span>可直接播放</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="remote-file-row-actions">
                      {isDirectory ? (
                        <button type="button" onClick={() => void loadBrowserDirectory(selectedSource, item.path)}>
                          打开
                        </button>
                      ) : item.audio ? (
                        <>
                          <button type="button" disabled={busy === playKey} onClick={() => void playBrowserItem(selectedSource, item, indexedTrack)}>
                            <Play size={14} />播放
                          </button>
                          <button type="button" onClick={() => queueBrowserItem(selectedSource, item, indexedTrack)}>
                            <ListPlus size={14} />加入队列
                          </button>
                          {indexedTrack ? (
                            <button type="button" onClick={() => showSourceInSongs(selectedSource)}>
                              歌曲列表
                            </button>
                          ) : null}
                        </>
                      ) : (
                        <span>不可播放</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </section>
    );
  };

  const renderForm = (): JSX.Element => (
    <section
      className={`remote-connection-flow remote-connection-flow--${activeProvider}`}
      ref={formSectionRef}
      aria-label={`${t(activeTab.labelKey)} 连接设置`}
    >
      <header className="remote-connection-flow-header">
        <div className="remote-connection-flow-provider-icon" aria-hidden="true">
          {activeProvider === 'subsonic' || activeProvider === 'jellyfin' || activeProvider === 'emby'
            ? <Server size={23} />
            : activeProvider === 'webdav'
              ? <HardDrive size={23} />
              : <FolderOpen size={23} />}
        </div>
        <div>
          <span>{editingSourceId ? '编辑连接' : '连接向导'} · {t(activeTab.labelKey)}</span>
          <h3>{editingSourceId ? form.displayName || defaultNameFor(activeProvider) : t(activeProviderGuide.actionKey)}</h3>
          <p>{t(activeProviderGuide.summaryKey)}</p>
        </div>
        <button type="button" onClick={() => setShowEmptyConnectionForm(false)}>{editingSourceId ? '暂不修改' : '暂不连接'}</button>
      </header>

      <ol className="remote-connection-steps" aria-label="连接步骤">
        <li data-state="complete"><Check size={14} /><span><strong>选择来源</strong><small>{t(activeTab.labelKey)}</small></span></li>
        <li data-state="current"><KeyRound size={14} /><span><strong>填写连接</strong><small>地址与授权</small></span></li>
        <li><Wifi size={14} /><span><strong>验证保存</strong><small>测试后开始同步</small></span></li>
      </ol>

      <div className="remote-connection-flow-body">
        {activeProvider === 'subsonic' ? (
          <div className="remote-source-navidrome-guide" aria-label="Navidrome 推荐">
            <div>
              <Server size={17} />
              <strong>推荐使用 Navidrome</strong>
              <span>轻量、稳定、兼容 Subsonic API；ECHO 只做索引和按需取流，不会直接改动服务端音乐文件。</span>
            </div>
            <button type="button" onClick={() => void openNavidromeDockerDocs()}>
              <ExternalLink size={15} />Docker 部署
            </button>
          </div>
        ) : null}

        <section className="remote-connection-card" aria-labelledby="remote-connection-location-title">
          <header>
            <i>1</i>
            <div>
              <h4 id="remote-connection-location-title">来源位置</h4>
              <p>给这个来源起一个容易识别的名字，并填写音乐所在位置。</p>
            </div>
          </header>
          <div className="remote-connection-field-grid">
            <label>
              <span>显示名称</span>
              <input value={form.displayName} placeholder={defaultNameFor(activeProvider)} onChange={(event) => updateForm({ displayName: event.target.value })} />
            </label>
            <label className="remote-connection-field--wide">
              <span>{activeProvider === 'smb' || activeProvider === 'sshfs' ? '挂载目录' : '服务器 URL'}</span>
              <input
                value={activeProvider === 'smb' || activeProvider === 'sshfs' ? form.mountDisplayName : form.baseUrl}
                readOnly={activeProvider === 'smb' || activeProvider === 'sshfs'}
                placeholder={activeProvider === 'webdav' ? 'https://example.com/dav' : activeProvider === 'smb' || activeProvider === 'sshfs' ? '请使用下方按钮选择目录' : 'https://music.example.com'}
                onChange={(event) => updateForm({
                  baseUrl: event.target.value,
                  mountGrantId: '',
                  zconnectWebSession: false,
                })}
              />
            </label>
            {activeProvider === 'smb' || activeProvider === 'sshfs' ? (
              <div className="remote-source-actions remote-connection-field--wide">
                <button type="button" disabled={busy === 'selectMountedRoot'} onClick={() => void selectMountedRoot()}>
                  <FolderOpen size={15} />选择挂载目录
                </button>
              </div>
            ) : null}
            {activeProvider === 'webdav' || activeProvider === 'smb' || activeProvider === 'sshfs' ? (
              <label>
                <span>{activeProvider === 'webdav' ? '根目录' : '挂载子目录'}</span>
                <input value={form.rootPath} onChange={(event) => updateForm({ rootPath: event.target.value })} />
              </label>
            ) : null}
          </div>
          {activeProvider === 'smb' || activeProvider === 'sshfs' ? (
            <p className="remote-connection-card-note">
              <ShieldCheck size={15} />使用系统已挂载或可直接访问的路径。Windows 可填写 \\NAS\Music 或 Z:\Music；SSHFS 请先在系统中挂载。
            </p>
          ) : null}
        </section>

        <section className="remote-connection-card" aria-labelledby="remote-connection-auth-title">
          <header>
            <i>2</i>
            <div>
              <h4 id="remote-connection-auth-title">登录与授权</h4>
              <p>凭据只用于连接这个远程来源。</p>
            </div>
          </header>
          <div className="remote-connection-field-grid">
            <label>
              <span>用户名</span>
              <input value={form.username} onChange={(event) => updateForm({ username: event.target.value })} />
            </label>
            <label>
              <span>{activeProvider === 'webdav' ? '密码' : activeProvider === 'subsonic' ? '密码 / API token' : '密码 / API Key'}</span>
              <input
                type="password"
                value={form.secret}
                placeholder={editingSourceId ? '留空则保留现有凭据' : undefined}
                onChange={(event) => updateForm({ secret: event.target.value })}
              />
            </label>
            <label>
              <span>认证方式</span>
              <select value={form.authType} onChange={(event) => updateForm({ authType: event.target.value as RemoteSourceInput['authType'] })}>
                <option value="basic">{translateStatic('settings.remote.ux.auth.password')}</option>
                <option value="apiKey">API Key</option>
                <option value="token">Token</option>
                <option value="none">{translateStatic('settings.remote.ux.auth.none')}</option>
              </select>
            </label>
            {activeProvider === 'subsonic' ? (
              <ZConnectAuthorizationControl
                baseUrl={form.baseUrl}
                authorized={form.zconnectWebSession}
                busy={busy === 'authorizeZConnect'}
                onAuthorize={() => void authorizeZConnect()}
              />
            ) : null}
          </div>
        </section>

        <section className="remote-connection-card remote-connection-card--plan" aria-labelledby="remote-connection-plan-title">
          <header>
            <i>3</i>
            <div>
              <h4 id="remote-connection-plan-title">同步计划</h4>
              <p>先选日常使用方式；性能参数保持默认即可。</p>
            </div>
          </header>
          <div className="remote-connection-field-grid">
            <label>
              <span>同步模式</span>
              <select value={form.syncMode} onChange={(event) => updateForm({ syncMode: event.target.value as RemoteSourceSyncMode })}>
                {syncModeOptions.map((option) => <option key={option.value} value={option.value}>{t(option.labelKey)}</option>)}
              </select>
            </label>
          </div>
          <button className="remote-connection-advanced-toggle" type="button" aria-expanded={connectionAdvancedOpen} onClick={() => setConnectionAdvancedOpen((current) => !current)}>
            <Gauge size={15} />
            <span><strong>连接高级参数</strong><small>API 兼容与后台并发</small></span>
            <ChevronRight size={16} />
          </button>
          {connectionAdvancedOpen ? (
            <div className="remote-connection-field-grid remote-connection-advanced-fields">
              {activeProvider === 'subsonic' ? (
                <>
                  <label><span>API 版本</span><input value={form.apiVersion} onChange={(event) => updateForm({ apiVersion: event.target.value })} /></label>
                  <label><span>Subsonic 认证</span><select value="token" disabled><option value="token">Token salt，推荐</option></select></label>
                  <button
                    type="button"
                    className="remote-connection-advanced-toggle remote-connection-field--wide"
                    aria-pressed={form.allowCertificateDateErrors}
                    onClick={() => updateForm({ allowCertificateDateErrors: !form.allowCertificateDateErrors })}
                  >
                    <AlertTriangle size={15} />
                    <span>
                      <strong>忽略 HTTPS 证书日期错误</strong>
                      <small>仅此来源生效；证书过期或尚未生效时继续连接，其他证书错误仍会拦截。</small>
                    </span>
                    <Check size={16} aria-hidden="true" opacity={form.allowCertificateDateErrors ? 1 : 0.2} />
                  </button>
                </>
              ) : null}
              <label><span>扫描并发</span><input type="number" min={1} max={8} value={form.scanConcurrency} onChange={(event) => updateForm({ scanConcurrency: Number(event.target.value) })} /></label>
              <label><span>元数据并发</span><input type="number" min={1} max={8} value={form.metadataConcurrency} onChange={(event) => updateForm({ metadataConcurrency: Number(event.target.value) })} /></label>
              <label><span>封面并发</span><input type="number" min={1} max={8} value={form.coverConcurrency} onChange={(event) => updateForm({ coverConcurrency: Number(event.target.value) })} /></label>
              <label><span>时长回填并发</span><input type="number" min={1} max={4} value={form.durationBackfillConcurrency} onChange={(event) => updateForm({ durationBackfillConcurrency: Number(event.target.value) })} /></label>
            </div>
          ) : null}
        </section>
      </div>

      <footer className="remote-connection-flow-footer">
        <div>
          <ShieldCheck size={16} />
          <span><strong>本地播放优先</strong><small>同步与补齐会在后台限速，播放时自动降载。</small></span>
        </div>
        <div className="remote-source-actions">
          <button type="button" disabled={busy === 'test'} onClick={() => void runFormAction('test')}><Wifi size={15} />测试连接</button>
          <button type="button" disabled={busy === 'save'} onClick={() => void runFormAction('save')}><Save size={15} />保存</button>
          <button className="remote-connection-primary-action" type="button" disabled={busy === 'saveSync'} onClick={() => void runFormAction('saveSync')}><RefreshCw size={15} />保存并同步</button>
        </div>
      </footer>
      {testResult ? <p className="remote-connection-result" data-tone={testResult.ok ? 'success' : 'error'}>{testResult.ok ? '测试通过：' : '测试失败：'}{testResult.message}</p> : null}
    </section>
  );

  const setGlobalBackgroundPaused = useCallback(async (): Promise<void> => {
    if (!remoteApi) {
      return;
    }
    const nextStatus = await remoteApi.setBackgroundPaused(!globalJobStatus.paused);
    invalidateRemoteSourcesSnapshotCache();
    setGlobalJobStatus(nextStatus);
    window.setTimeout(() => {
      void refreshStatuses(visibleSourceIds, false, true);
    }, 150);
  }, [globalJobStatus.paused, refreshStatuses, remoteApi, visibleSourceIds]);

  const renderAdvancedPanel = (): JSX.Element => {
    const coverPerformanceOption = remoteCoverLoadPerformanceOptions.find((option) => option.value === remoteCoverLoadPerformanceMode);
    const albumMergeOption = remoteAlbumMergeOptions.find((option) => option.value === remoteAlbumMergeStrategy);
    const pendingAlbumMergeOption = remoteAlbumMergeOptions.find((option) => option.value === pendingRemoteAlbumMergeStrategy);
    const backgroundStatusLabel = globalJobStatus.paused ? '已暂停' : playbackLoadReduced ? '低负载运行' : '运行中';

    return (
      <section className={`remote-advanced-panel${advancedOpen ? ' remote-advanced-panel--open' : ''}`} aria-label="远程高级维护">
        <div className="remote-advanced-summary">
          <div className="remote-advanced-summary-copy">
            <span>高级维护</span>
            <h3>加载、整理和后台</h3>
            <p>日常只需要连接、同步和浏览；需要调性能、合并专辑或控制后台任务时再展开。</p>
          </div>
          <div className="remote-advanced-summary-pills" aria-label="当前高级维护状态">
            <span><Gauge size={14} /><em>封面</em><strong>{coverPerformanceOption ? t(coverPerformanceOption.labelKey) : t('settings.remote.coverPerformance.option.balanced')}</strong></span>
            <span><Database size={14} /><em>专辑</em><strong>{albumMergeOption ? t(albumMergeOption.labelKey) : t('settings.remote.albumMerge.option.conservative')}</strong></span>
            <span><ShieldCheck size={14} /><em>后台</em><strong>{backgroundStatusLabel}</strong></span>
          </div>
          <button
            className="remote-advanced-toggle"
            type="button"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((current) => !current)}
          >
            {advancedOpen ? '收起高级维护' : '展开高级维护'}
          </button>
        </div>

        {advancedOpen ? (
          <div className="remote-advanced-body">
            <div className="remote-advanced-grid" aria-label="远程体验设置">
              <section className="remote-source-card remote-cover-performance-card" aria-label={t('settings.remote.coverPerformance.aria')}>
                <div className="remote-source-card-head">
                  <div>
                    <h3>{t('settings.remote.coverPerformance.title')}</h3>
                    <p>{t('settings.remote.coverPerformance.description')}</p>
                  </div>
                  <span className="remote-source-status">
                    {coverPerformanceOption ? t(coverPerformanceOption.labelKey) : t('settings.remote.coverPerformance.option.balanced')}
                  </span>
                </div>
                <div className="remote-source-actions">
                  <div className="remote-source-action-group" aria-label={t('settings.remote.coverPerformance.groupAria')}>
                    {remoteCoverLoadPerformanceOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        data-state={remoteCoverLoadPerformanceMode === option.value ? 'active' : undefined}
                        aria-pressed={remoteCoverLoadPerformanceMode === option.value}
                        title={t(option.descriptionKey)}
                        onClick={() => void updateRemoteCoverLoadPerformanceMode(option.value)}
                      >
                        <Gauge size={15} />
                        {t(option.labelKey)}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="settings-inline-note">
                  {t(coverPerformanceOption?.descriptionKey ?? 'settings.remote.coverPerformance.option.balanced.description')}
                </p>
              </section>

              <section className="remote-source-card remote-cover-performance-card" aria-label={t('settings.remote.albumMerge.aria')}>
                <div className="remote-source-card-head">
                  <div>
                    <h3>{t('settings.remote.albumMerge.title')}</h3>
                    <p>{t('settings.remote.albumMerge.description')}</p>
                  </div>
                  <span className="remote-source-status">
                    {albumMergeOption ? t(albumMergeOption.labelKey) : t('settings.remote.albumMerge.option.conservative')}
                  </span>
                </div>
                <div className="remote-source-actions">
                  <div className="remote-source-action-group" aria-label={t('settings.remote.albumMerge.groupAria')}>
                    {remoteAlbumMergeOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        data-state={pendingRemoteAlbumMergeStrategy === option.value ? 'active' : undefined}
                        aria-pressed={pendingRemoteAlbumMergeStrategy === option.value}
                        title={t(option.descriptionKey)}
                        onClick={() => {
                          setPendingRemoteAlbumMergeStrategy(option.value);
                          setRemoteAlbumGroupingMessage(null);
                          void refreshRemoteAlbumGroupingPreview(option.value);
                        }}
                      >
                        <Database size={15} />
                        {t(option.labelKey)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="settings-status-grid">
                  <span>
                    <em>{t('settings.remote.albumMerge.stat.current')}</em>
                    <strong>{remoteAlbumGroupingPreview ? formatCount(remoteAlbumGroupingPreview.currentAlbumCount) : t('settings.remote.albumMerge.pending')}</strong>
                  </span>
                  <span>
                    <em>{t('settings.remote.albumMerge.stat.target')}</em>
                    <strong>{remoteAlbumGroupingPreview ? formatCount(remoteAlbumGroupingPreview.targetAlbumCount) : t('settings.remote.albumMerge.pending')}</strong>
                  </span>
                  <span>
                    <em>{t('settings.remote.albumMerge.stat.tracks')}</em>
                    <strong>{remoteAlbumGroupingPreview ? formatCount(remoteAlbumGroupingPreview.trackCount) : t('settings.remote.albumMerge.pending')}</strong>
                  </span>
                </div>
                <div className="remote-source-actions">
                  <button type="button" onClick={() => void scanRemoteAlbumsForGrouping()} disabled={remoteAlbumScanBusy}>
                    <RefreshCw className={remoteAlbumScanBusy ? 'spinning-icon' : undefined} size={15} />
                    {remoteAlbumScanBusy ? t('settings.remote.albumMerge.action.scanning') : t('settings.remote.albumMerge.action.scan')}
                  </button>
                  <button type="button" onClick={() => void applyRemoteAlbumMergeStrategy()} disabled={remoteAlbumGroupingBusy}>
                    <Check size={15} />
                    {remoteAlbumGroupingBusy ? t('settings.remote.albumMerge.action.applying') : t('settings.remote.albumMerge.action.apply')}
                  </button>
                </div>
                <p className="settings-inline-note">
                  {t(pendingAlbumMergeOption?.descriptionKey ?? 'settings.remote.albumMerge.option.conservative.description')}
                </p>
                {remoteAlbumGroupingMessage ? <p className="settings-inline-note">{remoteAlbumGroupingMessage}</p> : null}
              </section>
            </div>

            <section className="remote-source-card remote-background-card">
              <div className="remote-source-card-head">
                <div>
                  <h3>后台任务</h3>
                  <p>播放时会自动降低远程后台负载，优先保证播放稳定；空闲后会自动恢复。</p>
                  {playbackLoadReduced ? (
                    <p className="settings-inline-note">
                      播放中，后台任务已降低负载：元数据和时长保留单并发，封面和歌词会在空闲后继续。
                    </p>
                  ) : null}
                </div>
                <span className="remote-source-status">{backgroundStatusLabel}</span>
              </div>
              <div className="remote-background-summary" aria-label="远程后台任务摘要">
                <span><Activity size={15} />同步 {formatCount(runningSyncCount)}</span>
                <span><Gauge size={15} />队列 {formatCount(queuedJobCount)}</span>
                <span><ShieldCheck size={15} />{playbackLoadReduced ? '播放保护中' : '常规限速'}</span>
              </div>
              <div className="remote-background-panel">
                <div className="remote-background-editor">
                  <div className="remote-background-section-head">
                    <div>
                      <strong>并发上限</strong>
                      <span>修改后会应用到当前远程来源，播放中仍按低负载策略保护。</span>
                    </div>
                    <button className="remote-background-apply" type="button" disabled={remoteBackgroundConcurrencySaving} onClick={() => void saveRemoteBackgroundConcurrency()}>
                      <Save size={15} />{remoteBackgroundConcurrencySaving ? '应用中' : '应用后台并发'}
                    </button>
                  </div>
                  <div className="remote-background-concurrency-controls" aria-label="后台任务并发设置">
                    {remoteBackgroundConcurrencyFields.map((field) => (
                      <div className="remote-background-concurrency-item" key={field.key}>
                        <span>{t(field.labelKey)}</span>
                        <strong>{t('settings.remote.background.concurrency.value')} {remoteBackgroundConcurrency[field.key]}</strong>
                        <div className="remote-background-stepper">
                          <button
                            type="button"
                            aria-label={`${t(field.labelKey)}${t('settings.remote.background.concurrency.decrease')}`}
                            disabled={remoteBackgroundConcurrency[field.key] <= field.min}
                            onClick={() => stepRemoteBackgroundConcurrencyDraft(field.key, -1)}
                          >
                            <Minus size={14} />
                          </button>
                          <input
                            type="number"
                            min={field.min}
                            max={field.max}
                            value={remoteBackgroundConcurrency[field.key]}
                            aria-label={t(field.ariaLabelKey)}
                            onChange={(event) => updateRemoteBackgroundConcurrencyDraft(field.key, Number(event.target.value))}
                          />
                          <button
                            type="button"
                            aria-label={`${t(field.labelKey)}${t('settings.remote.background.concurrency.increase')}`}
                            disabled={remoteBackgroundConcurrency[field.key] >= field.max}
                            onClick={() => stepRemoteBackgroundConcurrencyDraft(field.key, 1)}
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <aside className="remote-background-effective" aria-label="当前生效的后台任务并发">
                  <div className="remote-background-section-head">
                    <div>
                      <strong>当前生效</strong>
                      <span>{globalJobStatus.paused ? '已暂停后台队列' : playbackLoadReduced ? '播放保护已介入' : '按常规限速运行'}</span>
                    </div>
                  </div>
                  <div className="remote-job-grid remote-background-effective-grid">
                    {jobKinds.map((kind) => (
                      <span key={kind}>
                        <em>{jobLabel(kind)}</em>
                        <strong>并发 {globalJobStatus.concurrency[kind]}</strong>
                      </span>
                    ))}
                  </div>
                  <button className="remote-background-pause" type="button" data-state={globalJobStatus.paused ? 'paused' : undefined} aria-pressed={globalJobStatus.paused} onClick={() => void setGlobalBackgroundPaused()}>
                    {globalJobStatus.paused ? '恢复后台任务' : '全局暂停后台任务'}
                  </button>
                </aside>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    );
  };

  if (!hasAnyRemoteSource) {
    return (
      <div className="remote-sources-panel remote-sources-panel--empty">
        {renderConnectionLanding()}
        {message ? <p className="settings-inline-note">{message}</p> : null}
      </div>
    );
  }

  return (
    <div className="remote-sources-panel">
      {renderConnectedLibraryHome()}
      {showConnectionOptions ? renderConnectionLanding() : null}
      {message ? <p className="settings-inline-note remote-library-home-message" role="status">{message}</p> : null}
      {renderSyncPreview()}
      {renderBrowserWorkbench()}

    </div>
  );
};
