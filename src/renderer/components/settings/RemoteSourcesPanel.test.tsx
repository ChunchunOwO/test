// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RemoteSourcesPanel, resetRemoteSourcesProUnlockCacheForTests } from './RemoteSourcesPanel';
import type * as I18nProviderModule from '../../i18n/I18nProvider';
import type {
  RemoteBackgroundGlobalStatus,
  RemoteBackgroundJobKind,
  RemoteBackgroundJobStatus,
  RemoteDirectoryItem,
  RemoteSource,
  RemoteSourceOverview,
  RemoteSyncPreview,
  RemoteSyncStatus,
  RemoteTrackLookupItem,
} from '../../../shared/types/remoteSources';

const remoteApiMocks = vi.hoisted(() => ({
  list: vi.fn(),
  getOverview: vi.fn(),
  previewAlbumGrouping: vi.fn(),
  listIssues: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  disconnect: vi.fn(),
  delete: vi.fn(),
  test: vi.fn(),
  browse: vi.fn(),
  previewSync: vi.fn(),
  sync: vi.fn(),
  cancelSync: vi.fn(),
  getSyncStatus: vi.fn(),
  createStreamUrl: vi.fn(),
  lookupTracks: vi.fn(),
  startBackgroundJobs: vi.fn(),
  pauseBackgroundJobs: vi.fn(),
  resumeBackgroundJobs: vi.fn(),
  getJobStatus: vi.fn(),
  retryFailedJobs: vi.fn(),
  setBackgroundPaused: vi.fn(),
  getBackgroundGlobalStatus: vi.fn(),
  updateRuntimeLimits: vi.fn(),
  authorizeZConnect: vi.fn(),
}));

const appApiMocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  setSettings: vi.fn(),
  openExternalUrl: vi.fn(),
  getEchoProAccountStatus: vi.fn(),
}));

const pluginApiMocks = vi.hoisted(() => ({
  list: vi.fn(),
}));

const connectApiMocks = vi.hoisted(() => ({
  getDonatorUnlockStatus: vi.fn(),
}));

const playbackQueueMocks = vi.hoisted(() => ({
  appendToQueue: vi.fn(),
  playTrack: vi.fn(),
}));

vi.mock('../../utils/echoBridge', () => ({
  getAppBridge: () => appApiMocks,
  getConnectBridge: () => connectApiMocks,
  getPluginsBridge: () => pluginApiMocks,
  getRemoteSourcesBridge: () => remoteApiMocks,
}));

vi.mock('../../stores/PlaybackQueueProvider', () => ({
  usePlaybackQueue: () => playbackQueueMocks,
}));

vi.mock('../../i18n/I18nProvider', async () => {
  const actual = await vi.importActual<typeof I18nProviderModule>('../../i18n/I18nProvider');

  return {
    ...actual,
    useI18n: () => ({
      locale: 'zh-CN',
      localeOptions: [],
      setLocale: vi.fn(),
      t: actual.translateFallback,
    }),
  };
});

const jobKinds: RemoteBackgroundJobKind[] = ['metadata', 'cover', 'lyrics', 'duration-backfill'];

const remoteSource = (overrides: Partial<RemoteSource> = {}): RemoteSource => ({
  id: 'source-1',
  provider: 'webdav',
  displayName: 'Mock AList',
  status: 'enabled',
  baseUrl: 'http://127.0.0.1:18080/dav',
  username: 'user',
  authType: 'basic',
  config: { rootPath: '/音乐 Space/', scanConcurrency: 2, metadataConcurrency: 1, coverConcurrency: 3 },
  syncMode: 'index',
  lastTestAt: null,
  lastSyncAt: null,
  lastError: null,
  indexedTrackCount: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const syncStatus = (sourceId = 'source-1'): RemoteSyncStatus => ({
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

const jobStatus = (sourceId = 'source-1'): RemoteBackgroundJobStatus => {
  const empty = Object.fromEntries(jobKinds.map((kind) => [kind, 0])) as Record<RemoteBackgroundJobKind, number>;
  return {
    sourceId,
    paused: false,
    concurrency: { metadata: 2, cover: 2, lyrics: 1, 'duration-backfill': 1 },
    pending: empty,
    running: empty,
    completed: empty,
    failed: empty,
    skipped: empty,
    current: [],
    lastError: null,
    updatedAt: null,
  };
};

type GlobalStatusOverrides = Partial<Omit<RemoteBackgroundGlobalStatus, 'concurrency'>> & {
  concurrency?: Partial<Record<RemoteBackgroundJobKind, number>>;
};

const defaultGlobalConcurrency: Record<RemoteBackgroundJobKind, number> = { metadata: 2, cover: 2, lyrics: 1, 'duration-backfill': 1 };

const globalStatus = (overrides: GlobalStatusOverrides = {}): RemoteBackgroundGlobalStatus => ({
  paused: overrides.paused ?? false,
  playbackActive: overrides.playbackActive ?? false,
  concurrency: { ...defaultGlobalConcurrency, ...(overrides.concurrency ?? {}) },
  updatedAt: overrides.updatedAt ?? null,
});

const directoryItem = (overrides: Partial<RemoteDirectoryItem> = {}): RemoteDirectoryItem => ({
  sourceId: 'source-1',
  provider: 'webdav',
  path: '/音乐 Space/Echo Song.mp3',
  name: 'Echo Song.mp3',
  kind: 'file',
  sizeBytes: 16,
  modifiedAt: null,
  etag: null,
  contentType: 'audio/mpeg',
  audio: true,
  ...overrides,
});

const lookupTrack = (overrides: Partial<RemoteTrackLookupItem> = {}): RemoteTrackLookupItem => ({
  trackId: 'remote-track-1',
  sourceId: 'source-1',
  remotePath: '/音乐 Space/Echo Song.mp3',
  title: 'Indexed Echo Song',
  artist: 'Echo Artist',
  album: 'Echo Album',
  duration: 123,
  codec: 'mp3',
  coverThumb: null,
  metadataStatus: 'ok',
  coverStatus: 'pending',
  lyricsStatus: 'not_found',
  availability: 'available',
  ...overrides,
});

const emptyStatusCounts = () => ({ pending: 0, searching: 0, partial: 0, ok: 0, not_found: 0, error: 0 });

const overviewFor = (items: RemoteSource[]): RemoteSourceOverview => {
  const overviewItems = items.map((source) => ({
    sourceId: source.id,
    provider: source.provider,
    displayName: source.displayName,
    status: source.status,
    syncMode: source.syncMode,
    trackCount: source.indexedTrackCount,
    albumCount: source.indexedTrackCount > 0 ? 1 : 0,
    artistCount: source.indexedTrackCount > 0 ? 1 : 0,
    totalSizeBytes: source.indexedTrackCount * 1024,
    missingTrackCount: 0,
    metadata: { ...emptyStatusCounts(), ok: source.indexedTrackCount },
    cover: { ...emptyStatusCounts(), ok: source.indexedTrackCount },
    lyrics: { ...emptyStatusCounts(), ok: source.indexedTrackCount },
    lastSyncAt: source.lastSyncAt,
    lastError: source.lastError,
  }));

  return {
    totalSources: overviewItems.length,
    enabledSources: overviewItems.filter((source) => source.status === 'enabled').length,
    disabledSources: overviewItems.filter((source) => source.status === 'disabled').length,
    errorSources: overviewItems.filter((source) => source.status === 'error').length,
    trackCount: overviewItems.reduce((total, source) => total + source.trackCount, 0),
    albumCount: overviewItems.reduce((total, source) => total + source.albumCount, 0),
    artistCount: overviewItems.reduce((total, source) => total + source.artistCount, 0),
    totalSizeBytes: overviewItems.reduce((total, source) => total + source.totalSizeBytes, 0),
    missingTrackCount: overviewItems.reduce((total, source) => total + source.missingTrackCount, 0),
    metadata: { ...emptyStatusCounts(), ok: overviewItems.reduce((total, source) => total + source.metadata.ok, 0) },
    cover: { ...emptyStatusCounts(), ok: overviewItems.reduce((total, source) => total + source.cover.ok, 0) },
    lyrics: { ...emptyStatusCounts(), ok: overviewItems.reduce((total, source) => total + source.lyrics.ok, 0) },
    sources: overviewItems,
  };
};

describe('RemoteSourcesPanel', () => {
  let sources: RemoteSource[] = [];

  beforeEach(() => {
    resetRemoteSourcesProUnlockCacheForTests();
    window.localStorage.clear();
    sources = [];
    for (const mock of Object.values(remoteApiMocks)) {
      mock?.mockReset();
    }
    for (const mock of Object.values(playbackQueueMocks)) {
      mock.mockReset();
    }
    for (const mock of Object.values(appApiMocks)) {
      mock.mockReset();
    }
    for (const mock of Object.values(pluginApiMocks)) {
      mock.mockReset();
    }
    connectApiMocks.getDonatorUnlockStatus.mockReset();
    connectApiMocks.getDonatorUnlockStatus.mockResolvedValue({
      unlocked: true,
    });
    remoteApiMocks.list.mockImplementation(() => Promise.resolve(sources));
    remoteApiMocks.getOverview.mockImplementation(() => Promise.resolve(overviewFor(sources)));
    remoteApiMocks.previewAlbumGrouping.mockResolvedValue({
      sourceId: null,
      sourceCount: 1,
      trackCount: 18,
      currentStrategy: 'conservative',
      targetStrategy: 'standard',
      currentAlbumCount: 3,
      targetAlbumCount: 2,
    });
    remoteApiMocks.listIssues.mockResolvedValue([]);
    remoteApiMocks.create.mockImplementation(async (input) => {
      const source = remoteSource({
        id: 'created-source',
        provider: input.provider,
        displayName: input.displayName,
        baseUrl: input.baseUrl,
        username: input.username,
        authType: input.authType,
        config: input.config,
        syncMode: input.syncMode,
      });
      sources = [...sources, source];
      return source;
    });
    remoteApiMocks.update.mockImplementation(async (input) => {
      sources = sources.map((source) => (source.id === input.id ? { ...source, ...input } : source));
      return sources.find((source) => source.id === input.id) ?? remoteSource(input);
    });
    remoteApiMocks.disconnect.mockImplementation(async (sourceId) => {
      sources = sources.map((source) => (
        source.id === sourceId
          ? { ...source, status: 'disabled', indexedTrackCount: 0, lastError: null }
          : source
      ));
    });
    remoteApiMocks.delete.mockImplementation(async (sourceId) => {
      sources = sources.filter((source) => source.id !== sourceId);
    });
    remoteApiMocks.test.mockResolvedValue({
      ok: true,
      status: 'enabled',
      message: '连接成功。',
      testedAt: '2026-01-01T00:00:00.000Z',
    });
    remoteApiMocks.browse.mockResolvedValue([directoryItem()]);
    remoteApiMocks.previewSync.mockResolvedValue({
      sourceId: 'source-1',
      rootPath: null,
      discoveredCount: 12,
      addedCount: 4,
      updatedCount: 2,
      unchangedCount: 6,
      missingCount: 1,
      failedCount: 0,
      complete: true,
      errors: [],
      previewedAt: '2026-07-11T00:00:00.000Z',
    } satisfies RemoteSyncPreview);
    remoteApiMocks.sync.mockResolvedValue(syncStatus('created-source'));
    remoteApiMocks.cancelSync.mockResolvedValue(syncStatus());
    remoteApiMocks.getSyncStatus.mockImplementation((sourceId) => Promise.resolve(syncStatus(sourceId)));
    remoteApiMocks.lookupTracks.mockResolvedValue([]);
    remoteApiMocks.getJobStatus.mockImplementation((sourceId) => Promise.resolve(jobStatus(sourceId)));
    remoteApiMocks.startBackgroundJobs.mockImplementation((sourceId) => Promise.resolve(jobStatus(sourceId)));
    remoteApiMocks.pauseBackgroundJobs.mockImplementation((sourceId) => Promise.resolve(jobStatus(sourceId)));
    remoteApiMocks.resumeBackgroundJobs.mockImplementation((sourceId) => Promise.resolve(jobStatus(sourceId)));
    remoteApiMocks.retryFailedJobs.mockImplementation((sourceId) => Promise.resolve(jobStatus(sourceId)));
    remoteApiMocks.updateRuntimeLimits.mockImplementation((sourceId) => Promise.resolve(jobStatus(sourceId)));
    remoteApiMocks.setBackgroundPaused.mockResolvedValue(globalStatus());
    remoteApiMocks.getBackgroundGlobalStatus.mockResolvedValue(globalStatus());
    remoteApiMocks.authorizeZConnect.mockResolvedValue({
      ok: true,
      baseUrl: 'https://remote-access-32769.zconnect.cn/',
      message: 'ZConnect 网页授权完成。',
    });
    appApiMocks.getSettings.mockResolvedValue({ remoteCoverLoadPerformanceMode: 'balanced' });
    appApiMocks.setSettings.mockImplementation(async (patch) => patch);
    appApiMocks.openExternalUrl.mockResolvedValue(undefined);
    appApiMocks.getEchoProAccountStatus.mockResolvedValue({ loggedIn: true, pro: true, status: 'active' });
    pluginApiMocks.list.mockResolvedValue({ directory: 'D:\\Echo\\plugins', plugins: [] });
    playbackQueueMocks.playTrack.mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('loads remote sources without checking a Pro account', async () => {
    appApiMocks.getEchoProAccountStatus.mockResolvedValueOnce({ pro: false });
    pluginApiMocks.list.mockResolvedValueOnce({ directory: 'D:\\Echo\\plugins', plugins: [] });

    render(<RemoteSourcesPanel />);

    await waitFor(() => expect(remoteApiMocks.list).toHaveBeenCalled());
    expect(screen.queryByText('网盘功能需要 ECHO Pro')).toBeNull();
    expect(appApiMocks.getEchoProAccountStatus).not.toHaveBeenCalled();
    expect(pluginApiMocks.list).not.toHaveBeenCalled();
  });

  it('loads remote sources directly when the account bridge is unavailable', async () => {
    appApiMocks.getEchoProAccountStatus.mockRejectedValueOnce(new Error('bridge unavailable'));
    render(<RemoteSourcesPanel />);

    await waitFor(() => expect(remoteApiMocks.list).toHaveBeenCalled());
    expect(screen.queryByText('网盘功能需要 ECHO Pro')).toBeNull();
    expect(appApiMocks.getEchoProAccountStatus).not.toHaveBeenCalled();
  });

  it('keeps the redesigned connection flow when a provider is selected', async () => {
    const { container } = render(<RemoteSourcesPanel />);
    await waitFor(() => expect(remoteApiMocks.list).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /网盘 \/ WebDAV/u }));

    expect(screen.getByRole('region', { name: '网盘 / WebDAV 连接设置' })).toBeTruthy();
    expect(screen.getByText('连接向导 · 网盘 / WebDAV')).toBeTruthy();
    expect(screen.getByText('来源位置')).toBeTruthy();
    expect(screen.getByText('登录与授权')).toBeTruthy();
    expect(screen.getByText('同步计划')).toBeTruthy();
    expect(container.querySelector('.remote-source-form')).toBeNull();
    expect(container.querySelector('.remote-connection-flow')).toBeTruthy();
  });

  it('opens the redesigned connection flow from an existing remote library', async () => {
    sources = [remoteSource()];
    const { container } = render(<RemoteSourcesPanel />);

    await screen.findAllByText('Mock AList');
    expect(container.querySelector('.remote-connection-flow')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '添加音乐库' }));
    fireEvent.click(screen.getByRole('button', { name: /网盘 \/ WebDAV/u }));

    expect(screen.getByRole('region', { name: '网盘 / WebDAV 连接设置' })).toBeTruthy();
    expect(container.querySelector('.remote-source-form')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '暂不连接' }));
    expect(container.querySelector('.remote-connection-flow')).toBeNull();
  });

  it('tests and saves a WebDAV source with the configured root path', async () => {
    render(<RemoteSourcesPanel />);
    await waitFor(() => expect(remoteApiMocks.list).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /网盘 \/ WebDAV/u }));

    const displayNameInput = screen.getByLabelText('显示名称') as HTMLInputElement;
    const serverUrlInput = screen.getByLabelText('服务器 URL') as HTMLInputElement;
    const usernameInput = screen.getByLabelText('用户名') as HTMLInputElement;
    const passwordInput = screen.getByLabelText('密码') as HTMLInputElement;
    fireEvent.change(displayNameInput, { target: { value: 'Mock AList' } });
    fireEvent.change(serverUrlInput, { target: { value: 'http://127.0.0.1:18080/dav' } });
    fireEvent.change(usernameInput, { target: { value: 'user' } });
    fireEvent.change(passwordInput, { target: { value: 'secret' } });
    fireEvent.change(screen.getByLabelText('根目录'), { target: { value: '/音乐 Space/' } });

    fireEvent.click(screen.getByRole('button', { name: /测试连接/u }));
    await waitFor(() => expect(screen.getAllByText(/连接成功/u).length).toBeGreaterThan(0));
    expect(remoteApiMocks.test).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'webdav',
      displayName: 'Mock AList',
      baseUrl: 'http://127.0.0.1:18080/dav',
      username: 'user',
      secret: 'secret',
      config: expect.objectContaining({ rootPath: '/音乐 Space/', coverConcurrency: 2 }),
    }));

    fireEvent.click(screen.getByRole('button', { name: /保存并同步/u }));
    await waitFor(() => expect(remoteApiMocks.create).toHaveBeenCalled());
    expect(remoteApiMocks.sync).toHaveBeenCalledWith('created-source');
    await waitFor(() => expect(displayNameInput.value).toBe('Mock AList'));
    expect(serverUrlInput.value).toBe('http://127.0.0.1:18080/dav');
    expect(usernameInput.value).toBe('user');
    expect(passwordInput.value).toBe('secret');

    fireEvent.click(screen.getByRole('button', { name: /^保存$/u }));
    await waitFor(() => expect(remoteApiMocks.update).toHaveBeenCalledWith(expect.objectContaining({
      id: 'created-source',
      displayName: 'Mock AList',
    })));
    expect(remoteApiMocks.create).toHaveBeenCalledTimes(1);
  });

  it('edits an existing source without clearing its saved secret', async () => {
    sources = [remoteSource()];
    render(<RemoteSourcesPanel />);
    await screen.findAllByText('Mock AList');

    fireEvent.click(screen.getByRole('button', { name: '编辑连接' }));
    expect(screen.getByText('编辑连接 · 网盘 / WebDAV')).toBeTruthy();
    expect((screen.getByLabelText('密码') as HTMLInputElement).placeholder).toBe('留空则保留现有凭据');
    fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: 'Updated WebDAV' } });
    fireEvent.change(screen.getByLabelText('服务器 URL'), { target: { value: 'https://updated.example.test/dav' } });
    fireEvent.click(screen.getByRole('button', { name: /^保存$/u }));

    await waitFor(() => expect(remoteApiMocks.update).toHaveBeenCalledWith(expect.objectContaining({
      id: 'source-1',
      displayName: 'Updated WebDAV',
      baseUrl: 'https://updated.example.test/dav',
    })));
    expect(remoteApiMocks.update.mock.calls[0]?.[0]).not.toHaveProperty('secret');
    expect(remoteApiMocks.create).not.toHaveBeenCalled();
    await screen.findAllByText('Updated WebDAV');
  });

  it('creates a second Subsonic source without overwriting the existing one', async () => {
    sources = [remoteSource({
      provider: 'subsonic',
      displayName: 'First Subsonic',
      baseUrl: 'https://first.music.example.test',
      username: 'first-user',
      config: { apiVersion: '1.16.1', clientName: 'ECHO', authMode: 'token' },
    })];
    render(<RemoteSourcesPanel />);
    await screen.findAllByText('First Subsonic');

    fireEvent.click(screen.getByRole('button', { name: '添加音乐库' }));
    fireEvent.click(screen.getByRole('button', { name: /连接 Navidrome/u }));
    fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: 'Second Subsonic' } });
    fireEvent.change(screen.getByLabelText('服务器 URL'), { target: { value: 'https://second.music.example.test' } });
    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'second-user' } });
    fireEvent.change(screen.getByLabelText('密码 / API token'), { target: { value: 'second-secret' } });

    fireEvent.click(screen.getByRole('button', { name: /测试连接/u }));
    await waitFor(() => expect(screen.getAllByText(/连接成功/u).length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: /保存并同步/u }));

    await waitFor(() => expect(remoteApiMocks.create).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'subsonic',
      displayName: 'Second Subsonic',
      baseUrl: 'https://second.music.example.test',
      username: 'second-user',
      status: 'enabled',
    })));
    expect(remoteApiMocks.update).not.toHaveBeenCalled();
    expect(remoteApiMocks.sync).toHaveBeenCalledWith('created-source');
    await screen.findAllByText('First Subsonic');
    await screen.findAllByText('Second Subsonic');
  });

  it('submits unauthenticated WebDAV when credentials are blank', async () => {
    render(<RemoteSourcesPanel />);
    await waitFor(() => expect(remoteApiMocks.list).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /网盘 \/ WebDAV/u }));

    fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: 'Open WebDAV' } });
    fireEvent.change(screen.getByLabelText('服务器 URL'), { target: { value: 'http://127.0.0.1:18080/dav' } });

    fireEvent.click(screen.getByRole('button', { name: /测试连接/u }));
    await waitFor(() => expect(remoteApiMocks.test).toHaveBeenCalled());

    expect(remoteApiMocks.test).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'webdav',
      displayName: 'Open WebDAV',
      baseUrl: 'http://127.0.0.1:18080/dav',
      username: null,
      secret: null,
      authType: 'none',
    }));
  });

  it('keeps a provider draft while switching between remote source types', async () => {
    render(<RemoteSourcesPanel />);
    await waitFor(() => expect(remoteApiMocks.list).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /网盘 \/ WebDAV/u }));

    fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: 'My WebDAV' } });
    fireEvent.change(screen.getByLabelText('服务器 URL'), { target: { value: 'https://music.example.test/dav' } });
    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'password-1' } });

    fireEvent.click(screen.getByRole('button', { name: /连接 Navidrome/u }));
    fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: 'My Subsonic' } });
    fireEvent.click(screen.getByRole('button', { name: /WebDAV/u }));

    expect((screen.getByLabelText('显示名称') as HTMLInputElement).value).toBe('My WebDAV');
    expect((screen.getByLabelText('服务器 URL') as HTMLInputElement).value).toBe('https://music.example.test/dav');
    expect((screen.getByLabelText('用户名') as HTMLInputElement).value).toBe('alice');
    expect((screen.getByLabelText('密码') as HTMLInputElement).value).toBe('password-1');

    fireEvent.click(screen.getByRole('button', { name: /连接 Navidrome/u }));
    expect((screen.getByLabelText('显示名称') as HTMLInputElement).value).toBe('My Subsonic');
  });

  it('sends the explicit certificate date bypass only for an opted-in Subsonic source', async () => {
    render(<RemoteSourcesPanel />);
    await waitFor(() => expect(remoteApiMocks.list).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /连接 Navidrome/u }));

    fireEvent.change(screen.getByLabelText('服务器 URL'), { target: { value: 'https://music.example.test' } });
    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'user' } });
    fireEvent.change(screen.getByLabelText('密码 / API token'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: /连接高级参数/u }));
    fireEvent.click(screen.getByRole('button', { name: /忽略 HTTPS 证书日期错误/u }));
    fireEvent.click(screen.getByRole('button', { name: /测试连接/u }));

    await waitFor(() => expect(remoteApiMocks.test).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'subsonic',
      config: expect.objectContaining({ allowCertificateDateErrors: true }),
    })));
  });

  it('authorizes a ZConnect web session and uses it for the Subsonic test', async () => {
    render(<RemoteSourcesPanel />);
    await waitFor(() => expect(remoteApiMocks.list).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /连接 Navidrome/u }));

    fireEvent.change(screen.getByLabelText('服务器 URL'), {
      target: { value: 'https://remote-access-32769.zconnect.cn/app/' },
    });
    fireEvent.click(screen.getByRole('button', { name: /授权 ZConnect 网页访问/u }));

    await waitFor(() => expect(remoteApiMocks.authorizeZConnect).toHaveBeenCalledWith(
      'https://remote-access-32769.zconnect.cn/app/',
    ));
    expect((await screen.findByRole('button', { name: /ZConnect 网页已授权/u })).getAttribute('aria-pressed')).toBe('true');

    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'user' } });
    fireEvent.change(screen.getByLabelText('密码 / API token'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: /测试连接/u }));

    await waitFor(() => expect(remoteApiMocks.test).toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: 'https://remote-access-32769.zconnect.cn/',
      config: expect.objectContaining({
        allowCertificateDateErrors: true,
        zconnectWebSession: true,
      }),
    })));
  });

  it('does not expose the retired cloud provider in the connection flow', async () => {
    render(<RemoteSourcesPanel />);
    await waitFor(() => expect(remoteApiMocks.list).toHaveBeenCalled());
    expect(screen.queryByText(/百度网盘|Baidu Netdisk/u)).toBeNull();
  });

  it('keeps Basic WebDAV auth when username has an empty password', async () => {
    render(<RemoteSourcesPanel />);
    await waitFor(() => expect(remoteApiMocks.list).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /网盘 \/ WebDAV/u }));

    fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: 'Empty Password WebDAV' } });
    fireEvent.change(screen.getByLabelText('服务器 URL'), { target: { value: 'http://127.0.0.1:18080/dav' } });
    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'user-no-pass' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: /测试连接/u }));
    await waitFor(() => expect(remoteApiMocks.test).toHaveBeenCalled());

    expect(remoteApiMocks.test).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'webdav',
      username: 'user-no-pass',
      secret: '',
      authType: 'basic',
    }));
  });

  it('browses folders from the remote workbench and returns to the root', async () => {
    sources = [remoteSource()];
    remoteApiMocks.browse.mockImplementation(async (_sourceId, path) => {
      if (path === '/音乐 Space/Album') {
        return [
          directoryItem({
            path: '/音乐 Space/Album/Deep Cut.flac',
            name: 'Deep Cut.flac',
            sizeBytes: 32,
            contentType: 'audio/flac',
          }),
        ];
      }
      return [
        directoryItem({
          path: '/音乐 Space/Album',
          name: 'Album',
          kind: 'directory',
          sizeBytes: null,
          contentType: null,
          audio: false,
        }),
        directoryItem({
          path: '/音乐 Space/Root Song.flac',
          name: 'Root Song.flac',
          sizeBytes: 32,
          contentType: 'audio/flac',
        }),
        directoryItem({
          path: '/音乐 Space/cover.jpg',
          name: 'cover.jpg',
          kind: 'file',
          sizeBytes: 4,
          contentType: 'image/jpeg',
          audio: false,
        }),
      ];
    });
    render(<RemoteSourcesPanel />);

    await screen.findAllByText('Mock AList');
    fireEvent.click(screen.getByRole('button', { name: /打开根目录/u }));
    await screen.findByText('Root Song.flac');
    expect(remoteApiMocks.browse).toHaveBeenCalledWith('source-1', null);

    fireEvent.click(screen.getByRole('button', { name: /^Album$/u }));
    await screen.findByText('Deep Cut.flac');
    expect(remoteApiMocks.browse).toHaveBeenCalledWith('source-1', '/音乐 Space/Album');

    fireEvent.click(screen.getByRole('button', { name: /上级/u }));
    await waitFor(() => expect(remoteApiMocks.browse).toHaveBeenLastCalledWith('source-1', null));
    await screen.findByText('Root Song.flac');
  });

  it('shows browse errors in the file browser', async () => {
    sources = [remoteSource()];
    remoteApiMocks.browse.mockRejectedValueOnce(new Error('network down'));
    render(<RemoteSourcesPanel />);

    await screen.findAllByText('Mock AList');
    fireEvent.click(screen.getByRole('button', { name: /打开根目录/u }));
    expect((await screen.findAllByText(/现在连接不上/u)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/network down/u).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /^重试$/u })).toBeTruthy();
    expect(remoteApiMocks.lookupTracks).not.toHaveBeenCalled();
  });

  it('retries an errored source once when the network comes back', async () => {
    sources = [remoteSource({ status: 'error', lastError: 'network down' })];
    render(<RemoteSourcesPanel />);

    expect((await screen.findAllByText(/现在连接不上/u)).length).toBeGreaterThan(0);
    remoteApiMocks.test.mockClear();
    window.dispatchEvent(new Event('online'));

    await waitFor(() => expect(remoteApiMocks.test).toHaveBeenCalledTimes(1));
    expect(remoteApiMocks.test).toHaveBeenCalledWith('source-1');
    await screen.findByText(/已恢复连接/u);
  });

  it('previews sync changes before starting the real sync', async () => {
    sources = [remoteSource()];
    render(<RemoteSourcesPanel />);

    const libraryHome = await screen.findByRole('region', { name: '已连接的远程音乐库' });
    expect(within(libraryHome).getByText(/还没有同步/u)).toBeTruthy();
    fireEvent.click(within(libraryHome).getByRole('button', { name: '预览同步' }));

    await waitFor(() => expect(remoteApiMocks.previewSync).toHaveBeenCalledWith('source-1', { rootPath: null, markMissing: true }));
    const preview = await screen.findByRole('region', { name: 'Mock AList 同步预览' });
    expect(within(preview).getByText('4')).toBeTruthy();
    expect(within(preview).getByText('2')).toBeTruthy();
    expect(within(preview).getByText('不会立即删除')).toBeTruthy();

    fireEvent.click(within(preview).getByRole('button', { name: '确认并同步' }));
    await waitFor(() => expect(remoteApiMocks.sync).toHaveBeenCalledWith('source-1', {
      rootPath: null,
      markMissing: true,
      includeCover: true,
    }));
  });

  it('uses indexed remote tracks when browser files are already in the library', async () => {
    sources = [remoteSource()];
    remoteApiMocks.lookupTracks.mockResolvedValue([lookupTrack()]);
    render(<RemoteSourcesPanel />);

    await screen.findAllByText('Mock AList');
    fireEvent.click(screen.getByRole('button', { name: /打开根目录/u }));
    await screen.findByText('Indexed Echo Song');
    expect(remoteApiMocks.lookupTracks).toHaveBeenCalledWith('source-1', ['/音乐 Space/Echo Song.mp3']);
    expect(screen.getAllByText('已入库').length).toBeGreaterThan(0);
    expect(screen.getByText(/Echo Artist/u)).toBeTruthy();
    expect(screen.getByText(/元数据 完成/u)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^播放$/u }));
    await waitFor(() => expect(playbackQueueMocks.playTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'remote-track-1',
        mediaType: 'remote',
        remotePath: '/音乐 Space/Echo Song.mp3',
        title: 'Indexed Echo Song',
      }),
      expect.objectContaining({ forceNewQueueItem: true }),
    ));
  });

  it('filters browser items by audio, indexed, and unindexed status', async () => {
    sources = [remoteSource()];
    remoteApiMocks.browse.mockResolvedValue([
      directoryItem({
        path: '/音乐 Space/Album',
        name: 'Album',
        kind: 'directory',
        sizeBytes: null,
        contentType: null,
        audio: false,
      }),
      directoryItem({
        path: '/音乐 Space/Indexed.flac',
        name: 'Indexed.flac',
        contentType: 'audio/flac',
        audio: true,
      }),
      directoryItem({
        path: '/音乐 Space/Loose.mp3',
        name: 'Loose.mp3',
        contentType: 'audio/mpeg',
        audio: true,
      }),
      directoryItem({
        path: '/音乐 Space/readme.txt',
        name: 'readme.txt',
        kind: 'file',
        sizeBytes: 8,
        contentType: 'text/plain',
        audio: false,
      }),
    ]);
    remoteApiMocks.lookupTracks.mockResolvedValue([
      lookupTrack({
        remotePath: '/音乐 Space/Indexed.flac',
        title: 'Indexed Song',
      }),
    ]);
    render(<RemoteSourcesPanel />);

    await screen.findAllByText('Mock AList');
    fireEvent.click(screen.getByRole('button', { name: /打开根目录/u }));
    await screen.findByText('Indexed Song');
    expect(screen.getByText('文件夹 1')).toBeTruthy();
    expect(screen.getByText('音频 2')).toBeTruthy();
    expect(screen.getByText('已入库 1')).toBeTruthy();
    expect(screen.getByText('未索引 1')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^已入库$/u }));
    expect(screen.getByText('Indexed Song')).toBeTruthy();
    expect(screen.queryByText('Loose.mp3')).toBeNull();
    expect(screen.queryByText('Album')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^未索引$/u }));
    expect(screen.getByText('Loose.mp3')).toBeTruthy();
    expect(screen.queryByText('Indexed Song')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^音频$/u }));
    expect(screen.getByText('Loose.mp3')).toBeTruthy();
    expect(screen.getByText('Indexed Song')).toBeTruthy();
    expect(screen.queryByText('readme.txt')).toBeNull();
  });

  it('offers play and queue actions only for audio files', async () => {
    sources = [remoteSource()];
    remoteApiMocks.browse.mockResolvedValue([
      directoryItem({
        path: '/音乐 Space/Echo Song.mp3',
        name: 'Echo Song.mp3',
        contentType: 'audio/mpeg',
        audio: true,
      }),
      directoryItem({
        path: '/音乐 Space/readme.txt',
        name: 'readme.txt',
        kind: 'file',
        sizeBytes: 8,
        contentType: 'text/plain',
        audio: false,
      }),
    ]);
    render(<RemoteSourcesPanel />);

    await screen.findAllByText('Mock AList');
    fireEvent.click(screen.getByRole('button', { name: /打开根目录/u }));
    await screen.findByText('Echo Song.mp3');
    expect(screen.getByText('不可播放')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^播放$/u }));
    await waitFor(() => expect(playbackQueueMocks.playTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaType: 'remote',
        sourceId: 'source-1',
        remotePath: '/音乐 Space/Echo Song.mp3',
        title: 'Echo Song',
      }),
      expect.objectContaining({ forceNewQueueItem: true }),
    ));

    fireEvent.click(screen.getByRole('button', { name: /加入队列/u }));
    expect(playbackQueueMocks.appendToQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaType: 'remote',
        sourceId: 'source-1',
        remotePath: '/音乐 Space/Echo Song.mp3',
      }),
      expect.objectContaining({ type: 'manual' }),
    );
  });

  it('never exposes the retired maintenance console during connected-library interactions', async () => {
    sources = [remoteSource({ status: 'error', lastError: 'net::ERR_CERT_DATE_INVALID' })];
    render(<RemoteSourcesPanel />);

    await screen.findAllByText('Mock AList');
    expect(screen.queryByText('远程库控制台')).toBeNull();
    expect(screen.queryByRole('button', { name: '管理与诊断' })).toBeNull();
    expect(screen.queryByRole('button', { name: '管理' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '添加音乐库' }));
    fireEvent.click(screen.getByRole('button', { name: /连接 Navidrome/u }));
    expect(screen.getByRole('region', { name: 'Subsonic / Navidrome 连接设置' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '暂不连接' }));

    expect(screen.queryByText('远程库控制台')).toBeNull();
  });

});
