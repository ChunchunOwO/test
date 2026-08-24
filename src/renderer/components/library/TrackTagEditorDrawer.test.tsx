// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TrackTagEditorDrawer } from './TrackTagEditorDrawer';
import type { LibraryTrack } from '../../../shared/types/library';
import type { LyricsSearchCandidate, TrackLyrics } from '../../../shared/types/lyrics';
import { clearWorkshopTrackProvidersForTests, publishWorkshopTrackProviders } from '../../workshop/WorkshopTrackProviderRegistry';

const track = (overrides: Partial<LibraryTrack> = {}): LibraryTrack => ({
  id: 'track-1',
  path: 'D:\\Music\\Local Song.flac',
  title: 'Local Song',
  artist: 'Local Artist',
  album: 'Local Album',
  albumArtist: 'Local Artist',
  trackNo: 1,
  discNo: null,
  year: null,
  genre: null,
  duration: 180,
  codec: 'flac',
  sampleRate: 44100,
  bitDepth: 16,
  bitrate: 900000,
  coverId: null,
  coverThumb: null,
  embeddedMetadataStatus: 'present',
  embeddedCoverStatus: 'missing',
  networkMetadataStatus: 'none',
  fieldSources: {},
  ...overrides,
});

const lyricsCandidate = (overrides: Partial<LyricsSearchCandidate> = {}): LyricsSearchCandidate => ({
  id: 'lyrics-candidate-1',
  provider: 'lrclib',
  providerLyricsId: 'lrclib-1',
  title: 'Local Song',
  artist: 'Local Artist',
  album: 'Local Album',
  durationSeconds: 180,
  instrumental: false,
  hasSynced: true,
  hasPlain: true,
  score: 0.96,
  sourceLabel: 'LRCLIB',
  risk: 'low',
  previewLines: ['Preview first line', 'Preview second line'],
  ...overrides,
});

const trackLyrics = (overrides: Partial<TrackLyrics> = {}): TrackLyrics => ({
  id: 'lyrics-1',
  trackId: 'track-1',
  provider: 'lrclib',
  providerLyricsId: 'lrclib-1',
  kind: 'synced',
  title: 'Local Song',
  artist: 'Local Artist',
  album: 'Local Album',
  durationSeconds: 180,
  lines: [{ timeMs: 1000, text: 'Line' }],
  plainText: 'Line',
  syncedText: '[00:01.00]Line',
  offsetMs: 0,
  score: 0.96,
  cachedAt: '2026-05-22T00:00:00.000Z',
  updatedAt: '2026-05-22T00:00:00.000Z',
  ...overrides,
});

const installEcho = (
  searchNetworkTagCandidates = vi.fn(),
  lyricsOverrides: Partial<NonNullable<typeof window.echo>['lyrics']> = {},
  pluginOverrides: Partial<NonNullable<typeof window.echo>['plugins']> = {},
) => {
  const currentTrack = track();
  window.echo = {
    library: {
      searchNetworkTagCandidates,
      chooseTrackCover: vi.fn(),
      loadEmbeddedTrackTags: vi.fn().mockResolvedValue({
        tags: {
          title: currentTrack.title,
          artist: currentTrack.artist,
          album: currentTrack.album,
          albumArtist: currentTrack.albumArtist,
          trackNo: currentTrack.trackNo,
          discNo: currentTrack.discNo,
          year: currentTrack.year,
          genre: currentTrack.genre,
          composer: null,
          totalTracks: null,
          totalDiscs: null,
          comment: null,
        },
        coverId: currentTrack.coverId,
        coverThumb: currentTrack.coverThumb,
        track: currentTrack,
      }),
      updateTrackTags: vi.fn(),
      copyTrackOriginalCover: vi.fn().mockResolvedValue(true),
      copyTrackPath: vi.fn().mockResolvedValue(undefined),
      measureTrackBpm: vi.fn().mockResolvedValue({
        trackId: currentTrack.id,
        bpm: 127.6,
        confidence: 0.91,
        beatOffsetMs: 48,
        status: 'complete',
        error: null,
        updatedAt: '2026-08-09T00:00:00.000Z',
      }),
    },
    lyrics: {
      getForTrack: vi.fn().mockResolvedValue(null),
      searchCandidates: vi.fn().mockResolvedValue([]),
      previewCandidate: vi.fn().mockResolvedValue(trackLyrics()),
      applyCandidate: vi.fn().mockResolvedValue(trackLyrics()),
      applyCustomLrc: vi.fn().mockResolvedValue(trackLyrics({ provider: 'manual' })),
      embedToTrack: vi.fn().mockResolvedValue({
        trackId: 'track-1',
        provider: 'lrclib',
        kind: 'synced',
        textKind: 'synced',
        queued: true,
        message: '已加入后台写入队列；如果正在播放或加载音频，会自动延后写入。',
      }),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
      ...lyricsOverrides,
    },
    plugins: {
      list: vi.fn().mockResolvedValue({ directory: 'D:\\Echo\\plugins', plugins: [] }),
      queryMetadata: vi.fn().mockResolvedValue({ providers: [], candidates: [] }),
      queryLyrics: vi.fn().mockResolvedValue({ providers: [], candidates: [] }),
      queryCovers: vi.fn().mockResolvedValue({ providers: [], candidates: [] }),
      getLogs: vi.fn().mockResolvedValue([]),
      ...pluginOverrides,
    },
  } as unknown as typeof window.echo;
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  clearWorkshopTrackProvidersForTests();
});

describe('TrackTagEditorDrawer', () => {
  it('renders professional Chinese field labels', () => {
    installEcho();

    render(<TrackTagEditorDrawer track={track()} isOpen isSaving={false} error={null} onClose={vi.fn()} onSave={vi.fn()} />);

    expect(screen.getByRole('heading', { name: '编辑标签' })).toBeTruthy();
    expect(screen.getByLabelText('标题')).toBeTruthy();
    expect(screen.getByLabelText('艺术家')).toBeTruthy();
    expect(screen.getByLabelText('作曲')).toBeTruthy();
    expect(screen.getByLabelText('专辑')).toBeTruthy();
    expect(screen.getByLabelText('专辑艺术家')).toBeTruthy();
    expect(screen.getByLabelText('音轨号')).toBeTruthy();
    expect(screen.getByLabelText('总音轨数')).toBeTruthy();
    expect(screen.getByLabelText('碟片号')).toBeTruthy();
    expect(screen.getByLabelText('总碟数')).toBeTruthy();
    expect(screen.getByLabelText('BPM')).toBeTruthy();
    expect(screen.getByLabelText('年份')).toBeTruthy();
    expect(screen.getByLabelText('流派')).toBeTruthy();
    expect(screen.getByLabelText('注释')).toBeTruthy();
  });

  it('saves an edited genre from the basic tag fields', () => {
    const onSave = vi.fn();
    installEcho();

    render(<TrackTagEditorDrawer track={track()} isOpen isSaving={false} error={null} onClose={vi.fn()} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText('流派'), { target: { value: 'Jazz' } });
    fireEvent.click(screen.getByRole('button', { name: '保存标签' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'track-1' }),
      expect.objectContaining({ genre: 'Jazz' }),
      null,
      null,
      null,
    );
  });

  it('applies Workshop metadata and cover candidates through the existing save flow', async () => {
    const onSave = vi.fn();
    installEcho();
    publishWorkshopTrackProviders({
      metadataProviders: [{
        key: 'metadata', pluginName: 'Community Tools', providerId: 'tags', title: 'Tags', description: null, ready: true,
        lookup: vi.fn(async () => [{ title: 'Workshop Song', artist: 'Workshop Artist', genre: 'Ambient', year: 2025 }]),
      }],
      coverProviders: [{
        key: 'covers', pluginName: 'Community Tools', providerId: 'covers', title: 'Covers', description: null, ready: true,
        lookup: vi.fn(async () => [{ imageUrl: 'https://images.example/cover.jpg', title: 'Workshop Cover' }]),
      }],
    });
    render(<TrackTagEditorDrawer track={track()} isOpen isSaving={false} error={null} onClose={vi.fn()} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: '查找标签' }));
    await waitFor(() => expect(screen.getByText('Workshop Song')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '应用' }));
    fireEvent.click(screen.getByRole('button', { name: '查找封面' }));
    fireEvent.click(await screen.findByRole('button', { name: '选择封面 Workshop Cover' }));
    fireEvent.click(screen.getByRole('button', { name: '保存标签' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'track-1' }),
      expect.objectContaining({ title: 'Workshop Song', artist: 'Workshop Artist', genre: 'Ambient', year: 2025 }),
      null,
      'https://images.example/cover.jpg',
      null,
    );
  });

  it('keeps the drawer focused on local tags, lyrics, and file information', () => {
    const searchNetworkTagCandidates = vi.fn();
    installEcho(searchNetworkTagCandidates);

    render(<TrackTagEditorDrawer track={track()} isOpen isSaving={false} error={null} onClose={vi.fn()} onSave={vi.fn()} />);

    expect(Array.from(document.querySelectorAll('.tag-editor-tabs [role="tab"]')).map((tab) => tab.textContent)).toEqual(['标签', '歌词', '文件']);
    expect(screen.queryByRole('tab', { name: '网络候选' })).toBeNull();
    expect(screen.queryByRole('button', { name: '搜标签' })).toBeNull();
    expect(screen.getByRole('button', { name: '更换封面' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '读取内嵌标签' })).toBeTruthy();
    expect(searchNetworkTagCandidates).not.toHaveBeenCalled();
  });

  it('switches tag groups as independent pages', () => {
    installEcho();

    render(<TrackTagEditorDrawer track={track()} isOpen isSaving={false} error={null} onClose={vi.fn()} onSave={vi.fn()} />);

    const basicPage = document.querySelector<HTMLElement>('[data-section="basic"]')!;
    const albumPage = document.querySelector<HTMLElement>('[data-section="album"]')!;
    const orderPage = document.querySelector<HTMLElement>('[data-section="order"]')!;

    expect(basicPage.hidden).toBe(false);
    expect(albumPage.hidden).toBe(true);
    expect(orderPage.hidden).toBe(true);

    fireEvent.click(screen.getByRole('tab', { name: '专辑信息' }));

    expect(basicPage.hidden).toBe(true);
    expect(albumPage.hidden).toBe(false);
    expect(orderPage.hidden).toBe(true);
    expect(screen.getByRole('tab', { name: '专辑信息' }).getAttribute('aria-selected')).toBe('true');

    fireEvent.click(screen.getByRole('tab', { name: '排序与其他' }));

    expect(albumPage.hidden).toBe(true);
    expect(orderPage.hidden).toBe(false);
  });

  it('loading embedded tags updates the form and notifies the parent with the refreshed track', async () => {
    const onTrackUpdated = vi.fn();
    const updatedTrack = track({
      title: '山海',
      artist: '草东没有派对',
      album: '丑奴儿',
      albumArtist: '草东没有派对',
      trackNo: 10,
      year: 2016,
      coverThumb: 'echo-cover://thumb/reloaded',
    });
    installEcho();
    window.echo.library.loadEmbeddedTrackTags = vi.fn().mockResolvedValue({
      tags: {
        title: updatedTrack.title,
        artist: updatedTrack.artist,
        album: updatedTrack.album,
        albumArtist: updatedTrack.albumArtist,
        trackNo: updatedTrack.trackNo,
        discNo: updatedTrack.discNo,
        year: updatedTrack.year,
        genre: updatedTrack.genre,
        composer: '草东没有派对',
        totalTracks: 12,
        totalDiscs: 1,
        comment: '2016 studio release',
      },
      coverId: 'reloaded',
      coverThumb: updatedTrack.coverThumb,
      track: updatedTrack,
    });

    const { rerender } = render(
      <TrackTagEditorDrawer track={track()} isOpen isSaving={false} error={null} onClose={vi.fn()} onSave={vi.fn()} onTrackUpdated={onTrackUpdated} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '读取内嵌标签' }));

    await waitFor(() => expect(window.echo.library.loadEmbeddedTrackTags).toHaveBeenCalledWith('track-1'));
    expect(onTrackUpdated).toHaveBeenCalledWith(updatedTrack);
    rerender(
      <TrackTagEditorDrawer track={updatedTrack} isOpen isSaving={false} error={null} onClose={vi.fn()} onSave={vi.fn()} onTrackUpdated={onTrackUpdated} />,
    );
    expect((screen.getByLabelText('标题') as HTMLInputElement).value).toBe('山海');
    expect((screen.getByLabelText('艺术家') as HTMLInputElement).value).toBe('草东没有派对');
    expect((screen.getByLabelText('作曲') as HTMLInputElement).value).toBe('草东没有派对');
    expect((screen.getByLabelText('总音轨数') as HTMLInputElement).value).toBe('12');
    expect((screen.getByLabelText('注释') as HTMLTextAreaElement).value).toBe('2016 studio release');
    expect(screen.getByText('已从源文件内嵌标签重新加载，并同步更新媒体库。')).toBeTruthy();
    expect(screen.getByText('没有待保存的修改')).toBeTruthy();
  });

  it('loads and saves extended embedded fields without dropping untouched values', async () => {
    const onSave = vi.fn();
    const currentTrack = track();
    installEcho();
    window.echo.library.loadEmbeddedTrackTags = vi.fn().mockResolvedValue({
      tags: {
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.album,
        albumArtist: currentTrack.albumArtist,
        trackNo: 3,
        totalTracks: 12,
        discNo: 1,
        totalDiscs: 2,
        bpm: 144.5,
        year: 2024,
        genre: 'Rock',
        composer: 'Original Composer',
        comment: 'Original note',
      },
      coverId: null,
      coverThumb: null,
      track: currentTrack,
    });

    render(<TrackTagEditorDrawer track={currentTrack} isOpen isSaving={false} error={null} onClose={vi.fn()} onSave={onSave} />);

    await waitFor(() => expect((screen.getByLabelText('作曲') as HTMLInputElement).value).toBe('Original Composer'));
    fireEvent.change(screen.getByLabelText('作曲'), { target: { value: 'Updated Composer' } });
    fireEvent.change(screen.getByLabelText('注释'), { target: { value: 'Updated note' } });
    fireEvent.click(screen.getByRole('button', { name: '保存标签' }));

    expect(onSave).toHaveBeenCalledWith(
      currentTrack,
      expect.objectContaining({
        composer: 'Updated Composer',
        comment: 'Updated note',
        trackNo: 3,
        totalTracks: 12,
        discNo: 1,
        totalDiscs: 2,
        bpm: 144.5,
      }),
      null,
      null,
      null,
    );
  });

  it('copies the original cover from the tag editor cover context menu', async () => {
    installEcho();

    render(
      <TrackTagEditorDrawer
        track={track({ coverId: 'cover-1', coverThumb: 'echo-cover://thumb/cover-1' })}
        isOpen
        isSaving={false}
        error={null}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    fireEvent.contextMenu(document.querySelector('.tag-editor-cover')!);

    await waitFor(() => expect(window.echo.library.copyTrackOriginalCover).toHaveBeenCalledWith('track-1'));
    expect(screen.getByText('已复制封面原图。')).toBeTruthy();
  });

  it('blocks saving invalid positive integer fields', () => {
    const onSave = vi.fn();
    installEcho();

    render(<TrackTagEditorDrawer track={track()} isOpen isSaving={false} error={null} onClose={vi.fn()} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText('年份'), { target: { value: 'twenty' } });
    fireEvent.submit(document.querySelector('.tag-editor-drawer')!);

    expect(screen.getByText('年份必须是正整数或留空')).toBeTruthy();
    expect(screen.getByText('请先修正标红字段，再保存标签。')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('asks for confirmation before closing with unsaved changes', () => {
    const onClose = vi.fn();
    installEcho();

    render(<TrackTagEditorDrawer track={track()} isOpen isSaving={false} error={null} onClose={onClose} onSave={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('标题'), { target: { value: 'Changed Song' } });
    fireEvent.click(screen.getAllByRole('button', { name: '关闭编辑标签' })[1]);

    expect(screen.getByText('有未保存更改，确认关闭并丢弃吗？')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '丢弃更改' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the changed-field count and can restore the original local values', () => {
    installEcho();

    render(<TrackTagEditorDrawer track={track()} isOpen isSaving={false} error={null} onClose={vi.fn()} onSave={vi.fn()} />);

    expect((screen.getByRole('button', { name: '保存标签' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: 'Changed Song' } });
    expect(screen.getByText('1 项修改尚未保存')).toBeTruthy();
    expect((screen.getByRole('button', { name: '保存标签' }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: '撤销修改' }));

    expect((screen.getByLabelText('标题') as HTMLInputElement).value).toBe('Local Song');
    expect(screen.getByText('没有待保存的修改')).toBeTruthy();
    expect((screen.getByRole('button', { name: '保存标签' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('searches exact controls across tabs and focuses the selected field', async () => {
    installEcho();

    render(<TrackTagEditorDrawer track={track()} isOpen isSaving={false} error={null} onClose={vi.fn()} onSave={vi.fn()} />);

    fireEvent.keyDown(window, { key: 'f', ctrlKey: true });
    const searchInput = screen.getByRole('textbox', { name: '搜索编辑标签内容' });
    expect(document.activeElement).toBe(searchInput);
    fireEvent.change(searchInput, { target: { value: 'BPM' } });
    fireEvent.keyDown(searchInput, { key: 'Enter' });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('BPM')));
    expect(screen.getByRole('tab', { name: /标签/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByRole('listbox', { name: /匹配项/ })).toBeNull();
  });

  it('restores a single changed field without discarding other edits', () => {
    installEcho();

    render(<TrackTagEditorDrawer track={track()} isOpen isSaving={false} error={null} onClose={vi.fn()} onSave={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('标题'), { target: { value: 'Changed Song' } });
    fireEvent.change(screen.getByLabelText('艺术家'), { target: { value: 'Changed Artist' } });
    fireEvent.click(screen.getByRole('button', { name: '还原标题' }));

    expect((screen.getByLabelText('标题') as HTMLInputElement).value).toBe('Local Song');
    expect((screen.getByLabelText('艺术家') as HTMLInputElement).value).toBe('Changed Artist');
    expect(screen.getByText('1 项修改尚未保存')).toBeTruthy();
  });

  it('saves valid changes with the Ctrl+Enter shortcut', () => {
    const onSave = vi.fn();
    installEcho();

    render(<TrackTagEditorDrawer track={track()} isOpen isSaving={false} error={null} onClose={vi.fn()} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText('艺术家'), { target: { value: 'Shortcut Artist' } });
    fireEvent.keyDown(screen.getByLabelText('艺术家'), { key: 'Enter', ctrlKey: true });

    expect(onSave).toHaveBeenCalledWith(track(), expect.objectContaining({ artist: 'Shortcut Artist' }), null, null, null);
  });

  it('copies the file path and presents localized field sources', async () => {
    installEcho();

    render(
      <TrackTagEditorDrawer
        track={track({ fieldSources: { title: 'embedded', bpm: 'audio_analysis' } })}
        isOpen
        isSaving={false}
        error={null}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: '文件' }));
    expect(screen.getByText('内嵌标签')).toBeTruthy();
    expect(screen.getByText('音频分析')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '复制文件路径' }));

    await waitFor(() => expect(window.echo.library.copyTrackPath).toHaveBeenCalledWith('track-1'));
    expect(screen.getByText('已复制文件路径。')).toBeTruthy();
  });

  it('searches lyrics and applies a candidate to the lyrics cache without saving tags', async () => {
    const onSave = vi.fn();
    const searchCandidates = vi.fn().mockResolvedValue([
      lyricsCandidate({ id: 'lyrics-candidate-cache', title: 'Lyrics Song', artist: 'Lyrics Artist' }),
    ]);
    const applyCandidate = vi.fn().mockResolvedValue(trackLyrics({ title: 'Lyrics Song', artist: 'Lyrics Artist' }));
    const queryLyrics = vi.fn();
    installEcho(vi.fn(), { searchCandidates, applyCandidate }, { queryLyrics });

    render(<TrackTagEditorDrawer track={track()} isOpen isSaving={false} error={null} onClose={vi.fn()} onSave={onSave} />);

    fireEvent.click(screen.getByRole('tab', { name: '歌词' }));
    expect(document.querySelector('.track-tag-editor-drawer')?.getAttribute('data-active-tab')).toBe('lyrics');
    expect(screen.queryByRole('textbox', { name: '搜索编辑标签内容' })).toBeNull();
    expect(screen.queryByLabelText('歌词搜索关键词')).toBeNull();
    expect(screen.queryByLabelText('歌词来源筛选')).toBeNull();
    expect(screen.queryByText('搜索歌词候选')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '搜索歌词' }));
    await screen.findByText('Lyrics Song');
    expect(searchCandidates).toHaveBeenCalledWith('track-1', 'Local Song Local Artist', expect.any(String));
    fireEvent.click(screen.getByRole('button', { name: '应用到歌词库' }));

    await waitFor(() => expect(applyCandidate).toHaveBeenCalledWith('track-1', 'lyrics-candidate-cache'));
    expect(screen.getByText('已应用到歌词库，不会写入源音频文件。')).toBeTruthy();
    expect(queryLyrics).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('rejects track and disc numbers that exceed their totals', () => {
    const onSave = vi.fn();
    installEcho();

    render(<TrackTagEditorDrawer track={track()} isOpen isSaving={false} error={null} onClose={vi.fn()} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText('音轨号'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('总音轨数'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('碟片号'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('总碟数'), { target: { value: '2' } });
    fireEvent.submit(document.querySelector('.tag-editor-drawer')!);

    expect(screen.getByText('音轨号不能大于总音轨数')).toBeTruthy();
    expect(screen.getByText('碟片号不能大于总碟数')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('accepts decimal BPM and rejects out-of-range values', () => {
    const onSave = vi.fn();
    installEcho();

    render(<TrackTagEditorDrawer track={track()} isOpen isSaving={false} error={null} onClose={vi.fn()} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText('BPM'), { target: { value: '144.5' } });
    fireEvent.click(screen.getByRole('button', { name: '保存标签' }));
    expect(onSave).toHaveBeenCalledWith(track(), expect.objectContaining({ bpm: 144.5 }), null, null, null);

    fireEvent.change(screen.getByLabelText('BPM'), { target: { value: '1000' } });
    expect(screen.getByText('BPM 必须是小于 1000 的正数或留空')).toBeTruthy();
  });

  it('measures BPM into the draft and waits for an explicit tag save', async () => {
    const onSave = vi.fn();
    installEcho();

    render(<TrackTagEditorDrawer track={track()} isOpen isSaving={false} error={null} onClose={vi.fn()} onSave={onSave} />);

    fireEvent.click(screen.getByRole('tab', { name: '排序与其他' }));
    fireEvent.click(screen.getByRole('button', { name: '测量 BPM' }));

    await waitFor(() => expect((screen.getByLabelText('BPM') as HTMLInputElement).value).toBe('127.6'));
    expect(window.echo.library.measureTrackBpm).toHaveBeenCalledWith('track-1');
    expect(screen.getByText('测量结果 127.6 BPM · 91% 置信度，保存后写入标签。')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: '保存标签' }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: '保存标签' }));
    expect(onSave).toHaveBeenCalledWith(track(), expect.objectContaining({ bpm: 127.6 }), null, null, null);
  });

  it('warns when the measured BPM has low confidence', async () => {
    installEcho();
    window.echo.library.measureTrackBpm = vi.fn().mockResolvedValue({
      trackId: 'track-1',
      bpm: 121,
      confidence: 0.51,
      beatOffsetMs: null,
      status: 'low_confidence',
      error: null,
      updatedAt: '2026-08-09T00:00:00.000Z',
    });

    render(<TrackTagEditorDrawer track={track()} isOpen isSaving={false} error={null} onClose={vi.fn()} onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: '排序与其他' }));
    fireEvent.click(screen.getByRole('button', { name: '测量 BPM' }));

    const warning = await screen.findByText('测量结果 121 BPM · 51% 置信度，置信度偏低，请试听确认。');
    expect(warning.getAttribute('data-tone')).toBe('warning');
  });

  it('explains how to enable BPM measurement when audio analysis is disabled', async () => {
    installEcho();
    window.echo.library.measureTrackBpm = vi.fn().mockRejectedValue(new Error('BPM analysis is disabled in Settings'));

    render(<TrackTagEditorDrawer track={track()} isOpen isSaving={false} error={null} onClose={vi.fn()} onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: '排序与其他' }));
    fireEvent.click(screen.getByRole('button', { name: '测量 BPM' }));

    expect(await screen.findByText('请先在设置中开启“音频分析”，再测量 BPM。')).toBeTruthy();
    expect((screen.getByRole('button', { name: '保存标签' }) as HTMLButtonElement).disabled).toBe(true);
  });

  // Retained as a non-Steam integration specification; network lyrics remain covered by the active test above.
  it.skip('surfaces plugin lyrics and applies them through the host lyrics cache', async () => {
    const queryLyrics = vi.fn().mockResolvedValue({
      providers: [{ pluginId: 'echo.lyrics', id: 'provider', title: 'Lyrics Plugin' }],
      candidates: [{
        pluginId: 'echo.lyrics',
        providerId: 'provider',
        title: 'Plugin Lyrics Song',
        lrc: '[00:01.00]Plugin line',
        source: 'Lyrics Plugin',
        confidence: 0.9,
      }],
    });
    const applyCustomLrc = vi.fn().mockResolvedValue(trackLyrics({ provider: 'manual', title: 'Plugin Lyrics Song' }));
    installEcho(vi.fn(), { applyCustomLrc }, { queryLyrics });

    render(<TrackTagEditorDrawer track={track()} isOpen isSaving={false} error={null} onClose={vi.fn()} onSave={vi.fn()} />);

    fireEvent.click(screen.getByRole('tab', { name: '歌词' }));
    fireEvent.click(screen.getByRole('button', { name: '搜索歌词' }));
    await screen.findByText('Plugin Lyrics Song');
    fireEvent.click(screen.getByRole('button', { name: '应用到歌词库' }));

    await waitFor(() => expect(applyCustomLrc).toHaveBeenCalledWith(
      'track-1',
      '[00:01.00]Plugin line',
      'Lyrics Plugin.lrc',
    ));
  });

  it('embeds a lyrics candidate through the new lyrics API', async () => {
    const searchCandidates = vi.fn().mockResolvedValue([
      lyricsCandidate({ id: 'lyrics-candidate-embed', title: 'Embed Lyrics', artist: 'Lyrics Artist' }),
    ]);
    const embedToTrack = vi.fn().mockResolvedValue({
      trackId: 'track-1',
      provider: 'lrclib',
      kind: 'synced',
      textKind: 'synced',
      queued: true,
      message: '已加入后台写入队列；如果正在播放或加载音频，会自动延后写入。',
    });
    installEcho(vi.fn(), { searchCandidates, embedToTrack, getForTrack: vi.fn().mockResolvedValue(trackLyrics()) });

    render(<TrackTagEditorDrawer track={track()} isOpen isSaving={false} error={null} onClose={vi.fn()} onSave={vi.fn()} />);

    fireEvent.click(screen.getByRole('tab', { name: '歌词' }));
    fireEvent.click(screen.getByRole('button', { name: '搜索歌词' }));
    await screen.findByText('Embed Lyrics');
    fireEvent.click(screen.getByRole('button', { name: '应用并嵌入文件' }));

    await waitFor(() =>
      expect(embedToTrack).toHaveBeenCalledWith('track-1', {
        candidateId: 'lyrics-candidate-embed',
        preferSynced: true,
      }),
    );
    expect(screen.getByText('已加入后台写入队列；如果正在播放或加载音频，会自动延后写入。')).toBeTruthy();
  });

  it('previews the current lyrics before embedding them', async () => {
    const completeLines = Array.from({ length: 10 }, (_, index) => ({
      timeMs: (index + 1) * 1000,
      text: `Current preview line ${index + 1}`,
    }));
    installEcho(vi.fn(), {
      getForTrack: vi.fn().mockResolvedValue(trackLyrics({
        lines: completeLines,
      })),
    });

    render(<TrackTagEditorDrawer track={track()} isOpen isSaving={false} error={null} onClose={vi.fn()} onSave={vi.fn()} />);

    fireEvent.click(screen.getByRole('tab', { name: '歌词' }));
    expect(await screen.findByText('Current preview line 1')).toBeTruthy();
    expect(screen.getByText('Current preview line 10')).toBeTruthy();
    expect(screen.getByText('[00:01.00]')).toBeTruthy();
    expect(screen.getByText('[00:10.00]')).toBeTruthy();
    expect(screen.getByText('同步时间轴 · 10 行')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /收起/u })).toBeNull();
  });

  it('loads a complete candidate preview without applying it', async () => {
    const searchCandidates = vi.fn().mockResolvedValue([
      lyricsCandidate({ id: 'lyrics-candidate-preview', title: 'Complete Preview' }),
    ]);
    const previewCandidate = vi.fn().mockResolvedValue(trackLyrics({
      lines: [
        { timeMs: 1230, text: 'First complete candidate line' },
        { timeMs: 62_340, text: 'Last complete candidate line' },
      ],
    }));
    const applyCandidate = vi.fn();
    installEcho(vi.fn(), { searchCandidates, previewCandidate, applyCandidate });

    render(<TrackTagEditorDrawer track={track()} isOpen isSaving={false} error={null} onClose={vi.fn()} onSave={vi.fn()} />);

    fireEvent.click(screen.getByRole('tab', { name: '歌词' }));
    fireEvent.click(screen.getByRole('button', { name: '搜索歌词' }));
    await screen.findByText('Complete Preview');
    fireEvent.click(screen.getByRole('button', { name: '预览 Complete Preview 的完整歌词' }));

    expect(await screen.findByText('First complete candidate line')).toBeTruthy();
    expect(screen.getByText('Last complete candidate line')).toBeTruthy();
    expect(screen.getByText('[00:01.23]')).toBeTruthy();
    expect(screen.getByText('[01:02.34]')).toBeTruthy();
    expect(previewCandidate).toHaveBeenCalledWith('track-1', 'lyrics-candidate-preview');
    expect(applyCandidate).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '预览 Complete Preview 的完整歌词' })).toBeNull();
    expect(screen.queryByRole('button', { name: /收起/u })).toBeNull();
  });

  it('disables file embedding for remote tracks while keeping lyrics cache actions available', async () => {
    const searchCandidates = vi.fn().mockResolvedValue([
      lyricsCandidate({ id: 'lyrics-candidate-remote', title: 'Remote Lyrics' }),
    ]);
    installEcho(vi.fn(), { searchCandidates });

    render(<TrackTagEditorDrawer track={track({ mediaType: 'remote' })} isOpen isSaving={false} error={null} onClose={vi.fn()} onSave={vi.fn()} />);

    fireEvent.click(screen.getByRole('tab', { name: '歌词' }));
    fireEvent.click(screen.getByRole('button', { name: '搜索歌词' }));
    await screen.findByText('Remote Lyrics');

    expect(screen.getByText('此曲目只能应用到歌词库，不能写入源文件。')).toBeTruthy();
    expect((screen.getByRole('button', { name: '应用并嵌入文件' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '应用到歌词库' }) as HTMLButtonElement).disabled).toBe(false);
  });

});
