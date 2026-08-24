// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkshopPluginSummary } from '../../shared/types/workshop';

const queueMock = vi.hoisted(() => ({
  currentQueueId: 'queue-1',
  currentTrack: null,
  canGoPrevious: false,
  canGoNext: false,
  items: [{
    queueId: 'queue-1',
    track: {
      id: 'track-1',
      path: 'C:\\private\\song.flac',
      title: 'Song',
      artist: 'Artist',
      album: 'Album',
      duration: 180,
    },
  }],
  playTrack: vi.fn(async () => undefined),
}));

vi.mock('../stores/PlaybackQueueProvider', () => ({
  useOptionalPlaybackQueue: () => queueMock,
}));

vi.mock('../stores/playbackStatusStore', () => ({
  useThrottledSharedPlaybackStatus: () => ({ audioStatus: null }),
}));

import { WorkshopPluginHost } from './WorkshopPluginHost';
import {
  getWorkshopLyricsProvidersSnapshot,
  searchWorkshopLyricsProvider,
  workshopLyricsProviderKey,
} from './WorkshopLyricsProviderRegistry';
import { getWorkshopTrackContextActions } from './WorkshopTrackContextActions';
import { getWorkshopTrackProviderSnapshot } from './WorkshopTrackProviderRegistry';
import { getWorkshopPlayerBarActions } from './WorkshopPlayerBarActions';
import { writeWorkshopAutomationRules } from './WorkshopAutomationStore';

const plugin: WorkshopPluginSummary = {
  sourceId: 'steam',
  itemId: '123',
  contentId: 'echo.community-tools',
  version: '1.0.0',
  pluginId: 'echo.community-tools',
  name: 'Community Tools',
  permissions: ['playback:read', 'playback:share', 'library:read', 'queue:read', 'sources:provide', 'sources:direct', 'network:request', 'agent:runtime', 'lyrics:provide', 'fs:plugin'],
  commands: [{ id: 'show-status', title: '显示状态', description: null }],
  trackContextMenus: [{
    id: 'inspect-track',
    title: '检查歌曲',
    description: '读取清理后的歌曲信息',
    commandId: 'show-status',
    localOnly: true,
  }],
  playerBarActions: [{
    id: 'quick-status',
    title: '快捷状态',
    description: '从播放器栏运行命令',
    commandId: 'show-status',
    icon: 'sparkles',
  }],
  panels: [{
    id: 'main',
    title: '工具面板',
    placement: 'utility',
    entryUrl: 'echo-workshop://plugin/steam/123/panel.html',
  }],
  agents: [{
    id: 'library-helper',
    title: '曲库助手',
    description: '由作者实现的 Agent',
    inputPlaceholder: '问问曲库',
  }],
  sourceProviders: [{ id: 'community-radio', title: '社区电台', description: '搜索作者提供的合法直链目录' }],
  lyricsProviders: [{ id: 'community-lyrics', title: '社区歌词源', description: null }],
  metadataProviders: [{ id: 'community-metadata', title: '社区元数据', description: null }],
  coverProviders: [{ id: 'community-covers', title: '社区封面', description: null }],
  settings: [
    {
      id: 'compact-mode',
      title: '紧凑模式',
      description: '减少面板留白',
      type: 'boolean',
      defaultValue: true,
      options: [],
      placeholder: null,
      min: null,
      max: null,
      required: false,
    },
    {
      id: 'result-count',
      title: '结果数量',
      description: null,
      type: 'number',
      defaultValue: 12,
      options: [],
      placeholder: null,
      min: 1,
      max: 50,
      required: true,
    },
  ],
  networkHosts: ['share.example', 'api.example'],
  runtimeEntryUrl: 'echo-workshop://plugin/steam/123/__runtime__.html',
  enabled: true,
  error: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  window.localStorage.clear();
  window.echo = {
    workshop: {
      getPlugins: vi.fn(async () => ({ plugins: [plugin] })),
      getPluginShareInfo: vi.fn(async () => ({
        available: true,
        reason: null,
        track: {
          id: 'track-1', title: 'Song', artist: 'Artist', album: 'Album', durationSeconds: 180, codec: 'flac', sizeBytes: 1024,
        },
        allowedHosts: ['share.example'],
      })),
      sharePluginCurrentTrack: vi.fn(async () => ({
        id: 'task-1', state: 'queued', bytesSent: 0, totalBytes: 1024, progress: 0, playbackUrl: null, expiresAt: null, error: null,
        track: { id: 'track-1', title: 'Song', artist: 'Artist', album: 'Album', durationSeconds: 180, codec: 'flac', sizeBytes: 1024 },
      })),
      getPluginShareTask: vi.fn(async () => ({
        id: 'task-1', state: 'ready', bytesSent: 1024, totalBytes: 1024, progress: 1, playbackUrl: 'https://share.example/track/1', expiresAt: null, error: null,
        track: { id: 'track-1', title: 'Song', artist: 'Artist', album: 'Album', durationSeconds: 180, codec: 'flac', sizeBytes: 1024 },
      })),
      requestPluginNetwork: vi.fn(async () => ({
        url: 'https://api.example/catalog', status: 200, statusText: 'OK', ok: true,
        headers: { 'content-type': 'application/json' }, body: '{"tracks":[]}',
      })),
    },
    playback: {
      getStatus: vi.fn(async () => ({
        state: 'playing',
        currentTrackId: 'track-1',
        positionMs: 1500,
        durationMs: 5000,
        filePath: 'C:\\private\\song.flac',
        volume: 0.8,
      })),
      play: vi.fn(async () => undefined),
      pause: vi.fn(async () => undefined),
      seek: vi.fn(async () => undefined),
    },
    library: {
      getSummary: vi.fn(async () => ({
        songCount: 10,
        albumCount: 2,
        artistCount: 3,
        folderCount: 1,
        totalDuration: 600,
        lastScanAt: null,
      })),
      getTracks: vi.fn(async () => ({ page: 1, pageSize: 50, total: 0, hasMore: false, items: [] })),
      getAlbums: vi.fn(async () => ({ page: 1, pageSize: 50, total: 0, hasMore: false, items: [] })),
      createPlaylist: vi.fn(async () => ({ id: 'playlist-1', name: 'Ideas' })),
      onLibraryChanged: vi.fn(() => () => undefined),
      onLikedTracksChanged: vi.fn(() => () => undefined),
    },
  } as unknown as Window['echo'];
});

afterEach(() => {
  cleanup();
  window.echo = undefined as unknown as Window['echo'];
});

describe('WorkshopPluginHost', () => {
  it('runs automation only from the host-provided ended status', async () => {
    let onAudioStatus: ((status: unknown) => void) | null = null;
    (window.echo as NonNullable<Window['echo']>).audio = {
      onStatus: vi.fn((handler) => { onAudioStatus = handler as (status: unknown) => void; return () => undefined; }),
    } as never;
    writeWorkshopAutomationRules([{
      id: 'ended-rule', title: 'Ended', enabled: true, trigger: 'track-ended', intervalMinutes: null,
      sourceId: plugin.sourceId, itemId: plugin.itemId, pluginId: plugin.pluginId,
      targetKind: 'command', targetId: 'show-status', agentPrompt: null, cooldownSeconds: 0,
    }]);
    const { getByTitle } = render(<WorkshopPluginHost />);
    const frame = await waitFor(() => getByTitle('创意工坊插件运行时：Community Tools')) as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, 'postMessage');
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: { channel: 'echo:workshop-plugin', version: 1, type: 'register-command', commandId: 'show-status' },
    }));
    await waitFor(() => expect(onAudioStatus).not.toBeNull());
    onAudioStatus!({
      state: 'ended', currentTrackId: 'track-1', positionSeconds: 5, durationSeconds: 5,
      outputDeviceId: 'default', outputDeviceName: 'Speakers',
    });
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'invoke-command', commandId: 'show-status' }), '*'));
  });

  it('runs enabled plugins in opaque frames and returns sanitized host state', async () => {
    const { getByTitle } = render(<WorkshopPluginHost />);
    const frame = await waitFor(() => getByTitle('创意工坊插件运行时：Community Tools')) as HTMLIFrameElement;
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame.src).toBe('echo-workshop://plugin/steam/123/__runtime__.html');
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    const postMessage = vi.spyOn(frame.contentWindow!, 'postMessage');

    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: {
        channel: 'echo:workshop-plugin',
        version: 1,
        type: 'request',
        requestId: 'status-1',
        action: 'playback:getStatus',
      },
    }));

    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'response',
        requestId: 'status-1',
        ok: true,
        value: expect.not.objectContaining({ filePath: expect.anything() }),
      }),
      '*',
    ));
  });

  it('shows declared commands and panels while keeping the panel sandboxed', async () => {
    const { getByRole, getByTitle } = render(<WorkshopPluginHost />);
    const frame = await waitFor(() => getByTitle('创意工坊插件运行时：Community Tools')) as HTMLIFrameElement;
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: {
        channel: 'echo:workshop-plugin',
        version: 1,
        type: 'register-command',
        commandId: 'show-status',
      },
    }));

    fireEvent.click(getByRole('button', { name: /插件/ }));
    await waitFor(() => expect((getByRole('menuitem', { name: /显示状态/ }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(getByRole('menuitem', { name: /工具面板/ }));
    const panel = getByTitle('Community Tools：工具面板') as HTMLIFrameElement;
    expect(panel.getAttribute('sandbox')).toBe('allow-scripts');
    expect(panel.src).toBe('echo-workshop://plugin/steam/123/panel.html');
    expect(panel.closest('.workshop-plugin-panel')?.getAttribute('data-placement')).toBe('utility');
  });

  it('publishes declared player bar actions and runs only registered commands', async () => {
    const { getByTitle } = render(<WorkshopPluginHost />);
    const frame = await waitFor(() => getByTitle('创意工坊插件运行时：Community Tools')) as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, 'postMessage');
    expect(getWorkshopPlayerBarActions()[0]?.ready).toBe(false);

    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: { channel: 'echo:workshop-plugin', version: 1, type: 'register-command', commandId: 'show-status' },
    }));
    const action = await waitFor(() => {
      const next = getWorkshopPlayerBarActions()[0];
      expect(next?.ready).toBe(true);
      return next!;
    });
    const runPromise = action.run();
    const invocation = await waitFor(() => {
      const next = postMessage.mock.calls.map(([message]) => message as Record<string, unknown>)
        .find((message) => message.type === 'invoke-command');
      expect(next).toBeDefined();
      return next!;
    });
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: {
        channel: 'echo:workshop-plugin', version: 1, type: 'command-result',
        invocationId: invocation.invocationId, ok: true, value: null,
      },
    }));
    await runPromise;
  });

  it('opens the searchable plug-in dock with Ctrl Shift P', async () => {
    const { getByLabelText, getByRole, getByText } = render(<WorkshopPluginHost />);
    await waitFor(() => expect(getByRole('button', { name: /插件/ })).toBeTruthy());
    fireEvent.keyDown(window, { key: 'P', code: 'KeyP', ctrlKey: true, shiftKey: true });
    const search = getByLabelText('搜索创意工坊插件功能');
    fireEvent.change(search, { target: { value: '工具面板' } });
    expect(getByText('工具面板')).toBeTruthy();
  });

  it('publishes declared track actions and invokes their command with sanitized track data', async () => {
    const { getByTitle } = render(<WorkshopPluginHost />);
    const frame = await waitFor(() => getByTitle('创意工坊插件运行时：Community Tools')) as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, 'postMessage');
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: { channel: 'echo:workshop-plugin', version: 1, type: 'register-command', commandId: 'show-status' },
    }));

    const action = await waitFor(() => {
      const next = getWorkshopTrackContextActions().find((item) => item.title === '检查歌曲');
      expect(next?.ready).toBe(true);
      return next!;
    });
    const runPromise = action.run({
      id: 'track-1',
      path: 'C:\\private\\song.flac',
      title: 'Song',
      artist: 'Artist',
      album: 'Album',
      albumArtist: 'Artist',
      trackNo: 1,
      discNo: 1,
      year: 2026,
      genre: null,
      duration: 180,
      codec: 'flac',
      sampleRate: 48_000,
      bitDepth: 24,
      bitrate: 1_000_000,
      coverId: null,
      coverThumb: null,
      fieldSources: {},
    });
    const invocation = await waitFor(() => {
      const next = postMessage.mock.calls
        .map(([message]) => message as Record<string, unknown>)
        .find((message) => message.type === 'invoke-command');
      expect(next).toBeDefined();
      return next!;
    });
    expect(invocation.args).toEqual([expect.objectContaining({ id: 'track-1', title: 'Song' })]);
    expect((invocation.args as Array<Record<string, unknown>>)[0]).not.toHaveProperty('path');
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: {
        channel: 'echo:workshop-plugin', version: 1, type: 'command-result',
        invocationId: invocation.invocationId, ok: true, value: null,
      },
    }));
    await runPromise;
  });

  it('publishes metadata and cover providers and sanitizes their candidate results', async () => {
    const { getByTitle } = render(<WorkshopPluginHost />);
    const frame = await waitFor(() => getByTitle('创意工坊插件运行时：Community Tools')) as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, 'postMessage');
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: { channel: 'echo:workshop-plugin', version: 1, type: 'register-metadata-provider', providerId: 'community-metadata' },
    }));
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: { channel: 'echo:workshop-plugin', version: 1, type: 'register-cover-provider', providerId: 'community-covers' },
    }));

    const snapshot = await waitFor(() => {
      const next = getWorkshopTrackProviderSnapshot();
      expect(next.metadataProviders[0]?.ready).toBe(true);
      expect(next.coverProviders[0]?.ready).toBe(true);
      return next;
    });
    const request = { track: { id: 'track-1', title: 'Song', artist: 'Artist', album: 'Album', albumArtist: 'Artist', durationSeconds: 180 } };
    const metadataPromise = snapshot.metadataProviders[0].lookup(request);
    const metadataInvocation = await waitFor(() => {
      const next = postMessage.mock.calls.map(([message]) => message as Record<string, unknown>)
        .find((message) => message.type === 'invoke-metadata-provider');
      expect(next).toBeDefined();
      return next!;
    });
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: {
        channel: 'echo:workshop-plugin', version: 1, type: 'metadata-provider-result',
        invocationId: metadataInvocation.invocationId, ok: true,
        value: { candidates: [{ title: ' Better Song ', artist: 'Better Artist', path: 'C:\\private\\song.flac', confidence: 2 }] },
      },
    }));
    await expect(metadataPromise).resolves.toEqual([{ title: 'Better Song', artist: 'Better Artist', confidence: 1 }]);

    const coverPromise = snapshot.coverProviders[0].lookup(request);
    const coverInvocation = await waitFor(() => {
      const next = postMessage.mock.calls.map(([message]) => message as Record<string, unknown>)
        .find((message) => message.type === 'invoke-cover-provider');
      expect(next).toBeDefined();
      return next!;
    });
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: {
        channel: 'echo:workshop-plugin', version: 1, type: 'cover-provider-result',
        invocationId: coverInvocation.invocationId, ok: true,
        value: { candidates: [{ imageUrl: 'https://images.example/cover.jpg', width: 600, headers: { cookie: 'blocked' } }] },
      },
    }));
    await expect(coverPromise).resolves.toEqual([{ imageUrl: 'https://images.example/cover.jpg', width: 600 }]);
  });

  it('returns the host-owned sanitized queue and denies undeclared library writes', async () => {
    const { getByTitle } = render(<WorkshopPluginHost />);
    const frame = await waitFor(() => getByTitle('创意工坊插件运行时：Community Tools')) as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, 'postMessage');

    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: {
        channel: 'echo:workshop-plugin',
        version: 1,
        type: 'request',
        requestId: 'queue-1',
        action: 'queue:get',
      },
    }));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'response',
        requestId: 'queue-1',
        ok: true,
        value: expect.objectContaining({
          items: [expect.objectContaining({ track: expect.not.objectContaining({ path: expect.anything() }) })],
        }),
      }),
      '*',
    ));

    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: {
        channel: 'echo:workshop-plugin',
        version: 1,
        type: 'request',
        requestId: 'write-1',
        action: 'library:createPlaylist',
        payload: { name: 'Should not exist' },
      },
    }));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'response',
        requestId: 'write-1',
        ok: false,
        error: 'capability-denied',
      }),
      '*',
    ));
    expect(window.echo?.library.createPlaylist).not.toHaveBeenCalled();
  });

  it('plays an approved direct source through the host-owned queue', async () => {
    const { getByTitle } = render(<WorkshopPluginHost />);
    const frame = await waitFor(() => getByTitle('创意工坊插件运行时：Community Tools')) as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, 'postMessage');

    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: {
        channel: 'echo:workshop-plugin',
        version: 1,
        type: 'request',
        requestId: 'source-1',
        action: 'sources:playDirect',
        payload: { url: 'https://radio.example/live.mp3', title: 'Community Radio' },
      },
    }));

    await waitFor(() => expect(queueMock.playTrack).toHaveBeenCalledWith(
      expect.objectContaining({ mediaType: 'streaming', provider: 'm3u8', title: 'Community Radio' }),
      expect.objectContaining({ routeToConnectOutput: false, forceRefresh: true }),
    ));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('https://radio.example'));
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'source-1', ok: true }), '*');
  });

  it('routes approved network requests through the typed Workshop bridge', async () => {
    const { getByTitle } = render(<WorkshopPluginHost />);
    const frame = await waitFor(() => getByTitle('创意工坊插件运行时：Community Tools')) as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, 'postMessage');

    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: {
        channel: 'echo:workshop-plugin',
        version: 1,
        type: 'request',
        requestId: 'network-1',
        action: 'network:request',
        payload: {
          url: 'https://api.example/catalog',
          method: 'GET',
          headers: { accept: 'application/json', cookie: 42 },
        },
      },
    }));

    await waitFor(() => expect(window.echo?.workshop.requestPluginNetwork).toHaveBeenCalledWith({
      sourceId: 'steam',
      itemId: '123',
      url: 'https://api.example/catalog',
      method: 'GET',
      headers: { accept: 'application/json' },
    }));
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'response', requestId: 'network-1', ok: true,
    }), '*');
  });

  it('hosts declared source providers and keeps resolution inside the direct-source handoff', async () => {
    const { getByRole, getByText, getByTitle } = render(<WorkshopPluginHost />);
    const runtime = await waitFor(() => getByTitle('创意工坊插件运行时：Community Tools')) as HTMLIFrameElement;
    const postMessage = vi.spyOn(runtime.contentWindow!, 'postMessage');

    window.dispatchEvent(new MessageEvent('message', {
      source: runtime.contentWindow,
      data: {
        channel: 'echo:workshop-plugin', version: 1, type: 'register-source-provider', providerId: 'community-radio',
      },
    }));
    fireEvent.click(getByRole('button', { name: /插件/ }));
    await waitFor(() => expect((getByRole('menuitem', { name: /社区电台/ }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(getByRole('menuitem', { name: /社区电台/ }));
    fireEvent.click(getByRole('button', { name: '搜索' }));

    const searchInvocation = await waitFor(() => {
      const value = postMessage.mock.calls
        .map(([message]) => message as Record<string, unknown>)
        .find((message) => message.type === 'invoke-source-provider' && message.operation === 'search');
      expect(value).toBeDefined();
      return value!;
    });
    window.dispatchEvent(new MessageEvent('message', {
      source: runtime.contentWindow,
      data: {
        channel: 'echo:workshop-plugin', version: 1, type: 'source-provider-result',
        invocationId: searchInvocation.invocationId, ok: true,
        value: { tracks: [{ providerTrackId: 'night', title: '夜间电台', artist: 'Community', live: true }], total: 1 },
      },
    }));

    await waitFor(() => expect(getByText('夜间电台')).toBeTruthy());
    fireEvent.click(getByRole('button', { name: '播放 夜间电台' }));
    const resolveInvocation = await waitFor(() => {
      const value = postMessage.mock.calls
        .map(([message]) => message as Record<string, unknown>)
        .find((message) => message.type === 'invoke-source-provider' && message.operation === 'resolve');
      expect(value).toBeDefined();
      return value!;
    });
    window.dispatchEvent(new MessageEvent('message', {
      source: runtime.contentWindow,
      data: {
        channel: 'echo:workshop-plugin', version: 1, type: 'source-provider-result',
        invocationId: resolveInvocation.invocationId, ok: true,
        value: { url: 'https://radio.example/night.mp3', title: '夜间电台', live: true, headers: { cookie: 'blocked' } },
      },
    }));

    await waitFor(() => expect(queueMock.playTrack).toHaveBeenCalledWith(
      expect.objectContaining({ title: '夜间电台', providerTrackId: expect.any(String) }),
      expect.objectContaining({ routeToConnectOutput: false, forceRefresh: true }),
    ));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('https://radio.example'));
  });

  it('restores the playback share contract through a per-upload host confirmation', async () => {
    const { getByTitle } = render(<WorkshopPluginHost />);
    const frame = await waitFor(() => getByTitle('创意工坊插件运行时：Community Tools')) as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, 'postMessage');

    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: {
        channel: 'echo:workshop-plugin',
        version: 1,
        type: 'request',
        requestId: 'share-1',
        action: 'playback:shareCurrentTrack',
        payload: { uploadUrl: 'https://share.example/api/tracks', roomId: 'room-1' },
      },
    }));

    await waitFor(() => expect(window.echo?.workshop.sharePluginCurrentTrack).toHaveBeenCalledWith({
      sourceId: 'steam',
      itemId: '123',
      uploadUrl: 'https://share.example/api/tracks',
      roomId: 'room-1',
    }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Song'));
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'response', requestId: 'share-1', ok: true, value: expect.objectContaining({ id: 'task-1' }),
    }), '*');
  });

  it('runs only declared author agents and returns the bounded result to a panel', async () => {
    const { getByRole, getByTitle } = render(<WorkshopPluginHost />);
    const runtime = await waitFor(() => getByTitle('创意工坊插件运行时：Community Tools')) as HTMLIFrameElement;
    window.dispatchEvent(new MessageEvent('message', {
      source: runtime.contentWindow,
      data: { channel: 'echo:workshop-plugin', version: 1, type: 'register-agent', agentId: 'library-helper' },
    }));
    fireEvent.click(getByRole('button', { name: /插件/ }));
    await waitFor(() => expect((getByRole('menuitem', { name: /曲库助手/ }) as HTMLButtonElement).disabled).toBe(false));

    const panelSource = runtime.contentWindow;
    const postMessage = vi.spyOn(runtime.contentWindow!, 'postMessage');
    window.dispatchEvent(new MessageEvent('message', {
      source: panelSource,
      data: {
        channel: 'echo:workshop-plugin',
        version: 1,
        type: 'request',
        requestId: 'agent-request-1',
        action: 'agent:run',
        payload: { agentId: 'library-helper', input: '推荐一首歌' },
      },
    }));

    const invocation = await waitFor(() => {
      const value = postMessage.mock.calls
        .map(([message]) => message as Record<string, unknown>)
        .find((message) => message.type === 'invoke-agent');
      expect(value).toBeDefined();
      return value!;
    });
    window.dispatchEvent(new MessageEvent('message', {
      source: runtime.contentWindow,
      data: {
        channel: 'echo:workshop-plugin',
        version: 1,
        type: 'agent-result',
        invocationId: invocation.invocationId,
        ok: true,
        value: { answer: '从本地曲库选择' },
      },
    }));

    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'response',
      requestId: 'agent-request-1',
      ok: true,
      value: { answer: '从本地曲库选择' },
    }), '*'));
  });

  it('renders declared settings in a host-owned form and exposes bounded values to the sandbox', async () => {
    const { getByLabelText, getByRole, getByText, getByTitle } = render(<WorkshopPluginHost />);
    const runtime = await waitFor(() => getByTitle('创意工坊插件运行时：Community Tools')) as HTMLIFrameElement;
    const postMessage = vi.spyOn(runtime.contentWindow!, 'postMessage');

    fireEvent.click(getByRole('button', { name: /插件/ }));
    fireEvent.click(getByRole('menuitem', { name: /插件设置/ }));
    expect(getByText('紧凑模式')).toBeTruthy();
    fireEvent.click(getByLabelText('紧凑模式'));
    fireEvent.change(getByLabelText('结果数量'), { target: { value: '24' } });
    fireEvent.click(getByRole('button', { name: '保存设置' }));

    window.dispatchEvent(new MessageEvent('message', {
      source: runtime.contentWindow,
      data: {
        channel: 'echo:workshop-plugin',
        version: 1,
        type: 'request',
        requestId: 'settings-1',
        action: 'settings:get',
      },
    }));

    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'response',
      requestId: 'settings-1',
      ok: true,
      value: { 'compact-mode': false, 'result-count': 24 },
    }), '*'));
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'event',
      eventName: 'settings:changed',
      payload: { 'compact-mode': false, 'result-count': 24 },
    }), '*');
  });

  it('routes a selected declared lyrics provider without exposing a local path', async () => {
    const { getByTitle } = render(<WorkshopPluginHost />);
    const runtime = await waitFor(() => getByTitle('创意工坊插件运行时：Community Tools')) as HTMLIFrameElement;
    const postMessage = vi.spyOn(runtime.contentWindow!, 'postMessage');
    window.dispatchEvent(new MessageEvent('message', {
      source: runtime.contentWindow,
      data: {
        channel: 'echo:workshop-plugin', version: 1, type: 'register-lyrics-provider', providerId: 'community-lyrics',
      },
    }));

    await waitFor(() => expect(getWorkshopLyricsProvidersSnapshot()).toEqual([
      expect.objectContaining({ id: 'community-lyrics', ready: true }),
    ]));
    const lookup = searchWorkshopLyricsProvider(workshopLyricsProviderKey(plugin, 'community-lyrics'), {
      track: { id: 'track-1', title: 'Song', artist: 'Artist', album: 'Album', durationSeconds: 180 },
    });
    const invocation = await waitFor(() => {
      const value = postMessage.mock.calls
        .map(([message]) => message as Record<string, unknown>)
        .find((message) => message.type === 'invoke-lyrics-provider');
      expect(value).toBeDefined();
      expect((value?.request as { track?: unknown })?.track).not.toHaveProperty('path');
      return value!;
    });
    window.dispatchEvent(new MessageEvent('message', {
      source: runtime.contentWindow,
      data: {
        channel: 'echo:workshop-plugin', version: 1, type: 'lyrics-provider-result',
        invocationId: invocation.invocationId, ok: true,
        value: { candidates: [{ title: 'Song', lrc: '[00:00.00]Hello', ignored: 'drop-me' }] },
      },
    }));

    await expect(lookup).resolves.toEqual([expect.objectContaining({ title: 'Song', lrc: '[00:00.00]Hello' })]);
    await expect(lookup).resolves.toEqual([expect.not.objectContaining({ ignored: expect.anything() })]);
  });
});
