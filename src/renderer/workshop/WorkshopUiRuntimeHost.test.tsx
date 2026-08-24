// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  defaultWorkshopThemeIdentity,
  defaultWorkshopThemeSkinEffects,
  defaultWorkshopThemeSkinLayout,
  defaultWorkshopThemeSkinStages,
  type WorkshopActiveThemeBackground,
} from '../../shared/types/workshop';

const queueMock = vi.hoisted(() => ({
  currentTrack: null,
  currentQueueId: null,
  canGoPrevious: false,
  canGoNext: false,
  items: [] as Array<{ queueId: string; track: Record<string, unknown> }>,
  playTrack: vi.fn(async () => undefined),
  playPrevious: vi.fn(async () => undefined),
  playNext: vi.fn(async () => undefined),
  appendToQueue: vi.fn(),
  playQueueItem: vi.fn(async () => undefined),
  removeQueueItem: vi.fn(),
  clearQueue: vi.fn(),
}));

vi.mock('../stores/PlaybackQueueProvider', () => ({
  useOptionalPlaybackQueue: () => queueMock,
}));

const background: WorkshopActiveThemeBackground = {
  sourceId: 'steam',
  itemId: '123',
  contentId: 'echo.independent-ui',
  version: '1.0.0',
  themeId: 'workshop:aaaaaaaaaaaaaaaaaaaa',
  url: null,
  mode: 'shell',
  layout: { ...defaultWorkshopThemeSkinLayout },
  stages: { ...defaultWorkshopThemeSkinStages },
  assets: {},
  effects: { ...defaultWorkshopThemeSkinEffects },
  identity: { ...defaultWorkshopThemeIdentity },
  iconAtlas: null,
  runtime: {
    entryUrl: 'echo-workshop://ui/steam/123/ui/index.html',
    capabilities: [
      'navigation',
      'playback:read',
      'playback:control',
      'library:read',
      'library:control',
      'queue:read',
      'queue:control',
      'window:control',
    ],
  },
};

vi.mock('./useActiveWorkshopThemeBackground', () => ({
  useActiveWorkshopThemeBackground: () => background,
}));

vi.mock('./useActiveWorkshopThemeSelection', () => ({
  useActiveWorkshopThemeSelection: () => true,
}));

import { WorkshopUiRuntimeHost } from './WorkshopUiRuntimeHost';

const play = vi.fn(async () => undefined);
const pause = vi.fn(async () => undefined);
const seek = vi.fn(async () => undefined);
const setOutput = vi.fn(async () => undefined);

beforeEach(() => {
  vi.clearAllMocks();
  window.echo = {
    playback: {
      getStatus: vi.fn(async () => ({
        state: 'playing',
        currentTrackId: 'track-1',
        positionMs: 1200,
        durationMs: 5000,
        filePath: 'C:\\private\\song.flac',
        volume: 0.75,
      })),
      play,
      pause,
      seek,
    },
    library: {
      getTrack: vi.fn(async () => ({
        id: 'track-1',
        path: 'C:\\private\\song.flac',
        title: 'Song',
        artist: 'Artist',
        album: 'Album',
        albumArtist: 'Artist',
        trackNo: 1,
        discNo: 1,
        year: 2026,
        genre: 'Jazz',
        duration: 120,
        codec: 'flac',
        sampleRate: 96000,
        bitDepth: 24,
        bitrate: 2304000,
        coverId: null,
        coverThumb: null,
        fieldSources: {},
      })),
      getTracks: vi.fn(async () => ({
        page: 1,
        pageSize: 50,
        total: 1,
        hasMore: false,
        items: [{
          id: 'track-1',
          path: 'C:\\private\\song.flac',
          title: 'Song',
          artist: 'Artist',
          album: 'Album',
          albumArtist: 'Artist',
          trackNo: 1,
          discNo: 1,
          year: 2026,
          genre: 'Jazz',
          duration: 120,
          codec: 'flac',
          sampleRate: 96000,
          bitDepth: 24,
          bitrate: 2304000,
          coverId: null,
          coverThumb: null,
          fieldSources: {},
        }],
      })),
      getLikedTrackIds: vi.fn(async () => ({ 'track-1': true })),
      getLikedTracks: vi.fn(async () => ({
        page: 1,
        pageSize: 100,
        total: 0,
        hasMore: false,
        items: [],
      })),
      toggleTrackLiked: vi.fn(async () => ({ liked: true })),
    },
    app: {
      getSettings: vi.fn(async () => ({ fixedVolumeEnabled: false })),
      setSettings: vi.fn(async () => undefined),
      minimize: vi.fn(async () => undefined),
      toggleMaximize: vi.fn(async () => undefined),
      toggleFullscreen: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    },
    audio: {
      setOutput,
    },
  } as unknown as Window['echo'];
});

afterEach(() => {
  cleanup();
  window.echo = undefined as unknown as Window['echo'];
});

describe('WorkshopUiRuntimeHost', () => {
  it('mounts an opaque script sandbox and exposes only the typed message bridge', async () => {
    const { getByTitle } = render(<WorkshopUiRuntimeHost />);
    const frame = getByTitle('创意工坊界面：echo.independent-ui') as HTMLIFrameElement;
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame.src).toBe('echo-workshop://ui/steam/123/ui/index.html');

    const postMessage = vi.spyOn(frame.contentWindow!, 'postMessage');
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: { type: 'echo:workshop-ui:ready' },
    }));

    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'echo:workshop-ui:init',
        capabilities: background.runtime?.capabilities,
      }),
      '*',
    ));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'echo:workshop-ui:state',
        playback: expect.not.objectContaining({ filePath: expect.anything() }),
      }),
      '*',
    ));

    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: {
        type: 'echo:workshop-ui:command',
        requestId: 'play-1',
        command: 'playPause',
      },
    }));
    await waitFor(() => expect(pause).toHaveBeenCalledOnce());
  });

  it('keeps a host-owned emergency exit above the injected UI', () => {
    const { getByRole, queryByTitle } = render(<WorkshopUiRuntimeHost />);
    fireEvent.click(getByRole('button', { name: '退出自定义 UI' }));
    expect(queryByTitle('创意工坊界面：echo.independent-ui')).toBeNull();
  });

  it('returns sanitized library data and plays a selected real track through the queue owner', async () => {
    const { getByTitle } = render(<WorkshopUiRuntimeHost />);
    const frame = getByTitle('创意工坊界面：echo.independent-ui') as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, 'postMessage');
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: {
        type: 'echo:workshop-ui:command',
        requestId: 'tracks-1',
        command: 'library:listTracks',
        payload: { page: 1, pageSize: 50 },
      },
    }));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'tracks-1',
        ok: true,
        value: expect.objectContaining({
          items: [expect.not.objectContaining({ path: expect.anything() })],
        }),
      }),
      '*',
    ));

    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: {
        type: 'echo:workshop-ui:command',
        requestId: 'play-track-1',
        command: 'queue:playTrack',
        payload: { trackId: 'track-1' },
      },
    }));
    await waitFor(() => expect(queueMock.playTrack).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'track-1' }),
      expect.objectContaining({ source: { type: 'manual', label: '创意工坊 UI' } }),
    ));
  });
});
