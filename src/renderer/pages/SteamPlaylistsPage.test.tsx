// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { LibraryPage, LibraryPlaylist, LibraryPlaylistItem, LibraryTrack } from '../../shared/types/library';
import { SteamPlaylistsPage } from './SteamPlaylistsPage';

const playbackMocks = vi.hoisted(() => ({
  appendTracksToQueue: vi.fn(),
  playTrack: vi.fn(),
  playTrackNext: vi.fn(),
}));

vi.mock('../stores/PlaybackQueueProvider', () => ({
  usePlaybackQueue: () => ({
    appendTracksToQueue: playbackMocks.appendTracksToQueue,
    currentTrackId: null,
    playTrack: playbackMocks.playTrack,
    playTrackNext: playbackMocks.playTrackNext,
  }),
}));

vi.mock('../components/library/TrackList', () => ({
  TrackList: ({ tracks }: { tracks: LibraryTrack[] }) => (
    <div data-testid="steam-playlist-track-list">
      {tracks.map((track) => <span key={track.playlistItemId ?? track.id}>{track.title}</span>)}
    </div>
  ),
}));

vi.mock('../i18n/I18nProvider', () => ({
  useI18n: () => ({
    locale: 'zh-CN',
    t: (key: string, options?: Record<string, string | number>) => {
      const translations: Record<string, string> = {
        'route.playlists.label': '歌单',
        'playlistsPage.action.importFile': '导入 M3U/M3U8 歌单',
        'playlistsPage.action.newLocal': '新建本地歌单',
        'playlistsPage.form.nameAria': '本地歌单名称',
        'playlistsPage.form.placeholder': '新建本地歌单',
        'playlistsPage.form.create': '创建',
        'playlistsPage.form.cancel': '取消创建',
        'playlistsPage.empty.local': '还没有本地歌单。',
        'playlistsPage.empty.createFirst': '创建第一个本地歌单',
        'playlistsPage.empty.create': '创建歌单',
        'playlistsPage.status.loading': '正在加载歌单...',
        'albumMenu.playlistSubmenu.itemCount': `${options?.count ?? 0} 首`,
      };
      return translations[key] ?? key;
    },
  }),
}));

const playlist = (overrides: Partial<LibraryPlaylist> = {}): LibraryPlaylist => ({
  id: 'playlist-1',
  name: 'Road Mix',
  description: 'Manual local playlist',
  kind: 'manual',
  sourceProvider: 'local',
  sourcePlaylistId: null,
  coverId: null,
  coverThumb: null,
  sortMode: 'manual',
  itemCount: 1,
  createdAt: '2026-08-09T00:00:00.000Z',
  updatedAt: '2026-08-09T00:00:00.000Z',
  ...overrides,
});

const track = (overrides: Partial<LibraryTrack> = {}): LibraryTrack => ({
  id: 'track-1',
  path: 'D:\\Music\\Song.flac',
  title: 'Song One',
  artist: 'Artist',
  album: 'Album',
  albumArtist: 'Artist',
  trackNo: null,
  discNo: null,
  year: null,
  genre: null,
  duration: 180,
  codec: 'FLAC',
  sampleRate: 44100,
  bitDepth: 16,
  bitrate: 900000,
  coverId: null,
  coverThumb: null,
  fieldSources: {},
  ...overrides,
});

const item = (overrides: Partial<LibraryPlaylistItem> = {}): LibraryPlaylistItem => ({
  id: 'item-1',
  playlistId: 'playlist-1',
  mediaType: 'track',
  mediaId: 'track-1',
  sourceProvider: 'local',
  sourceItemId: null,
  titleSnapshot: 'Song One',
  artistSnapshot: 'Artist',
  albumSnapshot: 'Album',
  durationSnapshot: 180,
  coverId: null,
  coverThumb: null,
  position: 0,
  addedAt: '2026-08-09T00:00:00.000Z',
  addedFrom: 'manual',
  unavailable: false,
  track: track(),
  ...overrides,
});

const page = (items: LibraryPlaylistItem[]): LibraryPage<LibraryPlaylistItem> => ({
  items,
  page: 1,
  pageSize: 100,
  total: items.length,
  hasMore: false,
});

afterEach(() => {
  cleanup();
  playbackMocks.appendTracksToQueue.mockReset();
  playbackMocks.playTrack.mockReset();
  playbackMocks.playTrackNext.mockReset();
  Reflect.deleteProperty(window, 'echo');
});

describe('SteamPlaylistsPage', () => {
  it('uses the playlist workspace structure and renders local playlist tracks', async () => {
    const getPlaylists = vi.fn().mockResolvedValue([
      playlist(),
      playlist({ id: 'streaming-1', name: 'Online Mix', sourceProvider: 'netease' }),
    ]);
    const getPlaylistItems = vi.fn().mockResolvedValue(page([item()]));
    Object.defineProperty(window, 'echo', {
      configurable: true,
      value: {
        library: {
          getPlaylists,
          getPlaylistItems,
        },
      },
    });

    const { container } = render(<SteamPlaylistsPage />);

    await waitFor(() => expect(screen.getAllByText('Road Mix')).toHaveLength(2));
    expect(screen.queryByText('Online Mix')).toBeNull();
    await waitFor(() => expect(screen.getByText('Song One')).toBeTruthy());

    expect(container.querySelector('.playlists-page > .playlist-sidebar')).toBeTruthy();
    expect(container.querySelector('.playlist-sidebar-panel > .playlist-list > .playlist-list-item[data-active="true"]')).toBeTruthy();
    expect(container.querySelector('.playlists-page > .playlist-detail > .playlist-detail-panel')).toBeTruthy();
    expect(container.querySelector('.playlist-detail-header .playlist-detail-copy h2')?.textContent).toBe('Road Mix');
    expect(container.querySelector('.playlist-main')).toBeNull();
    expect(getPlaylistItems).toHaveBeenCalledWith('playlist-1', { page: 1, pageSize: 100, search: '' });
  });

  it('guides an empty playlist toward adding files or choosing songs', async () => {
    const getPlaylists = vi.fn().mockResolvedValue([playlist({ itemCount: 0 })]);
    let filesAdded = false;
    const getPlaylistItems = vi.fn().mockImplementation(async () => page(filesAdded ? [item()] : []));
    const chooseImportFiles = vi.fn().mockResolvedValue(['D:\\Music\\Song.flac']);
    const addLocalAudioFilesToPlaylist = vi.fn().mockImplementation(async () => {
      filesAdded = true;
      return {
        importedCount: 1,
        addedCount: 1,
        skippedCount: 0,
        failedCount: 0,
        trackIds: ['track-1'],
        items: [item()],
      };
    });
    Object.defineProperty(window, 'echo', {
      configurable: true,
      value: {
        library: {
          getPlaylists,
          getPlaylistItems,
          chooseImportFiles,
          addLocalAudioFilesToPlaylist,
        },
      },
    });

    render(<SteamPlaylistsPage />);

    expect(await screen.findByText('让这个歌单开始播放')).toBeTruthy();
    expect(await screen.findByText('之后也可以在歌曲菜单中继续添加到歌单')).toBeTruthy();

    const navigateListener = vi.fn();
    window.addEventListener('app:navigate:route', navigateListener);
    fireEvent.click(screen.getByRole('button', { name: '去歌曲库挑选' }));
    expect(navigateListener).toHaveBeenCalledWith(expect.objectContaining({ detail: 'songs' }));
    window.removeEventListener('app:navigate:route', navigateListener);

    fireEvent.click(screen.getAllByRole('button', { name: '添加本地歌曲' })[0]);
    await waitFor(() => expect(addLocalAudioFilesToPlaylist).toHaveBeenCalledWith('playlist-1', ['D:\\Music\\Song.flac']));
    await waitFor(() => expect(screen.getByText('Song One')).toBeTruthy());
  });

  it('generates a local smart playlist from the Steam page', async () => {
    const smartPlaylist = playlist({ id: 'smart-1', name: '最近常听', itemCount: 1 });
    const getPlaylists = vi.fn().mockResolvedValueOnce([playlist()]).mockResolvedValue([playlist(), smartPlaylist]);
    const getPlaylistItems = vi.fn().mockResolvedValue(page([item({ playlistId: 'smart-1' })]));
    const createSmartPlaylist = vi.fn().mockResolvedValue({
      playlist: smartPlaylist,
      items: [item({ playlistId: 'smart-1' })],
      candidateCount: 5,
      requestedLimit: 30,
      recentDays: 180,
    });
    Object.defineProperty(window, 'echo', {
      configurable: true,
      value: { library: { getPlaylists, getPlaylistItems, createSmartPlaylist } },
    });

    render(<SteamPlaylistsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /智能生成/ }));

    await waitFor(() => expect(createSmartPlaylist).toHaveBeenCalledWith({ limit: 30, recentDays: 180 }));
    await waitFor(() => expect(screen.getAllByText('最近常听')).toHaveLength(2));
  });

  it('restores local playlist import, rename, sort, export, and cover actions', async () => {
    const current = playlist();
    const getPlaylists = vi.fn().mockResolvedValue([current]);
    const getPlaylistItems = vi.fn().mockResolvedValue(page([item()]));
    const importPlaylistFile = vi.fn().mockResolvedValue(null);
    const updatePlaylist = vi.fn().mockImplementation(async (request: { name?: string; sortMode?: LibraryPlaylist['sortMode'] }) => ({
      ...current,
      name: request.name ?? current.name,
      sortMode: request.sortMode ?? current.sortMode,
    }));
    const exportPlaylist = vi.fn().mockResolvedValue('D:\\Music\\Road Mix.m3u8');
    const chooseTrackCover = vi.fn().mockResolvedValue({ path: 'D:\\Pictures\\cover.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' });
    Object.defineProperty(window, 'echo', {
      configurable: true,
      value: { library: { getPlaylists, getPlaylistItems, importPlaylistFile, updatePlaylist, exportPlaylist, chooseTrackCover } },
    });
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Night Drive');

    render(<SteamPlaylistsPage />);
    await screen.findAllByText('Road Mix');

    fireEvent.click(screen.getByRole('button', { name: '导入 M3U/M3U8 歌单' }));
    await waitFor(() => expect(importPlaylistFile).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: '更换歌单封面' }));
    await waitFor(() => expect(updatePlaylist).toHaveBeenCalledWith({ playlistId: 'playlist-1', coverPath: 'D:\\Pictures\\cover.png' }));

    fireEvent.click(screen.getByRole('button', { name: '更多歌单操作' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '重命名歌单' }));
    await waitFor(() => expect(updatePlaylist).toHaveBeenCalledWith({ playlistId: 'playlist-1', name: 'Night Drive' }));

    fireEvent.click(screen.getByRole('button', { name: '更多歌单操作' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: '最近添加' }));
    await waitFor(() => expect(updatePlaylist).toHaveBeenCalledWith({ playlistId: 'playlist-1', sortMode: 'addedDesc' }));

    fireEvent.click(screen.getByRole('button', { name: '更多歌单操作' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'M3U8' }));
    await waitFor(() => expect(exportPlaylist).toHaveBeenCalledWith({ playlistId: 'playlist-1', format: 'm3u8', sourceProvider: 'local' }));
    promptSpy.mockRestore();
  });
});
