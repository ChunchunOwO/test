// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings } from '../../../../shared/types/appSettings';
import { SteamRichPresenceSettings } from './SteamRichPresenceSettings';

const createSteamStatus = (preview = 'Playing: Starlight - ECHO', showAlbum = false) => ({
  state: 'ready' as const,
  richPresence: {
    mode: 'detailed' as const,
    preset: 'music' as const,
    enabled: true,
    showAlbum,
    showProgress: false,
    showGenre: false,
    showPlaybackOrder: false,
    showBpm: false,
    showQuality: false,
    showFormat: false,
    showBitPerfect: false,
    publicationState: 'published' as const,
    preview,
    lastPublishedAt: '2026-08-11T04:00:00.000Z',
    lastError: null,
  },
});

const expandDetails = (): void => {
  fireEvent.click(screen.getByRole('button', { name: '展开 Rich Presence 详情' }));
};

describe('SteamRichPresenceSettings', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });
  beforeEach(() => {
    window.echo = {
      steam: {
        getStatus: vi.fn().mockResolvedValue(createSteamStatus()),
      },
    } as unknown as Window['echo'];
  });

  it('defaults legacy enabled settings to detailed mode', () => {
    render(<SteamRichPresenceSettings locale="zh-CN" settings={{ steamRichPresenceEnabled: true } as AppSettings} onPatch={vi.fn()} />);

    expect(screen.getByRole('button', { name: '详细' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '展开 Rich Presence 详情' }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('专辑')).toBeNull();
    expandDetails();
    expect(screen.getByText('专辑')).toBeTruthy();
    expect(screen.getByText('歌名')).toBeTruthy();
    expect(screen.getByText('艺人')).toBeTruthy();
    expect(screen.getByText('已选择 4 / 10')).toBeTruthy();
    expect(screen.getByText('曲目')).toBeTruthy();
    expect(screen.getByText('氛围')).toBeTruthy();
    expect(screen.getByRole('button', { name: '专辑: 已启用' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '播放进度: 已启用' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('requires an explicit detailed choice before exposing metadata options', () => {
    const onPatch = vi.fn();
    const { rerender } = render(
      <SteamRichPresenceSettings locale="zh-CN" settings={{ steamRichPresenceMode: 'basic' } as AppSettings} onPatch={onPatch} />,
    );

    expandDetails();
    fireEvent.click(screen.getByRole('button', { name: '详细' }));
    expect(onPatch).toHaveBeenCalledWith({ steamRichPresenceMode: 'detailed', steamRichPresenceEnabled: true, steamRichPresencePreset: 'music' });

    rerender(
      <SteamRichPresenceSettings
        locale="zh-CN"
        settings={{ steamRichPresenceMode: 'detailed', steamRichPresenceShowAlbum: false } as AppSettings}
        onPatch={onPatch}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /专辑/u }));
    expect(onPatch).toHaveBeenLastCalledWith({ steamRichPresenceShowAlbum: true });
    fireEvent.click(screen.getByRole('button', { name: /曲风/u }));
    expect(onPatch).toHaveBeenLastCalledWith({ steamRichPresenceShowGenre: true });
    fireEvent.click(screen.getByRole('button', { name: /BPM/u }));
    expect(onPatch).toHaveBeenLastCalledWith({ steamRichPresenceShowBpm: true });
    fireEvent.click(screen.getByRole('button', { name: /歌曲质量/u }));
    expect(onPatch).toHaveBeenLastCalledWith({ steamRichPresenceShowQuality: true });
    fireEvent.click(screen.getByRole('button', { name: /文件格式/u }));
    expect(onPatch).toHaveBeenLastCalledWith({ steamRichPresenceShowFormat: true });
    fireEvent.click(screen.getByRole('button', { name: /Bit-Perfect/u }));
    expect(onPatch).toHaveBeenLastCalledWith({ steamRichPresenceShowBitPerfect: true });
  });

  it('shows typed Steam connection diagnostics and the sanitized preview', async () => {
    render(<SteamRichPresenceSettings locale="zh-CN" settings={{ steamRichPresenceMode: 'detailed' } as AppSettings} onPatch={vi.fn()} />);

    expandDetails();
    expect(await screen.findByText('Steamworks 已连接')).toBeTruthy();
    expect(screen.getAllByText('已提交').length).toBeGreaterThan(0);
    expect(screen.getByText(/Playing: Starlight - ECHO/u)).toBeTruthy();
  });

  it('updates the preview and replaces metadata controls immediately in off mode', () => {
    const onPatch = vi.fn();
    render(<SteamRichPresenceSettings locale="zh-CN" settings={{ steamRichPresenceMode: 'detailed' } as AppSettings} onPatch={onPatch} />);

    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expandDetails();

    expect(onPatch).toHaveBeenCalledWith({ steamRichPresenceMode: 'off', steamRichPresenceEnabled: false, steamRichPresencePreset: 'music' });
    expect(screen.getByText('Rich Presence 已关闭')).toBeTruthy();
    expect(screen.getByText('完全停止发布')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /专辑/u })).toBeNull();
    expect(screen.queryByRole('button', { name: /播放进度/u })).toBeNull();
  });

  it('explains the privacy boundary instead of showing detailed fields in basic mode', () => {
    render(<SteamRichPresenceSettings locale="zh-CN" settings={{ steamRichPresenceMode: 'basic' } as AppSettings} onPatch={vi.fn()} />);

    expandDetails();
    expect(screen.getByText('仅公开 ECHO 活动')).toBeTruthy();
    expect(screen.getByText('不会公开歌名、艺人、专辑或播放进度。')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /专辑/u })).toBeNull();
  });

  it('offers only stable music, minimal, and privacy presets', () => {
    const onPatch = vi.fn();
    render(<SteamRichPresenceSettings locale="zh-CN" settings={{ steamRichPresenceMode: 'detailed', steamRichPresencePreset: 'music' } as AppSettings} onPatch={onPatch} />);

    expandDetails();
    expect(screen.getByRole('button', { name: /音乐完整曲目信息/u })).toBeTruthy();
    expect(screen.getByRole('button', { name: /极简只显示歌名艺人/u })).toBeTruthy();
    expect(screen.getByRole('button', { name: /隐私隐藏全部元数据/u })).toBeTruthy();
    expect(screen.getByText('歌曲质量')).toBeTruthy();
    expect(screen.getByText('文件格式')).toBeTruthy();
    expect(screen.getByText('Bit-Perfect')).toBeTruthy();
  });

  it('keeps the newest diagnostics result when an older request finishes later', async () => {
    vi.useFakeTimers();
    let resolveOlderRequest: ((value: ReturnType<typeof createSteamStatus>) => void) | undefined;
    const olderRequest = new Promise<ReturnType<typeof createSteamStatus>>((resolve) => { resolveOlderRequest = resolve; });
    const getStatus = vi.fn()
      .mockImplementationOnce(() => olderRequest)
      .mockResolvedValueOnce(createSteamStatus('Playing: New result - ECHO', true));
    window.echo = { steam: { getStatus } } as unknown as Window['echo'];

    render(
      <SteamRichPresenceSettings
        locale="zh-CN"
        settings={{ steamRichPresenceMode: 'detailed', steamRichPresenceShowAlbum: false } as AppSettings}
        onPatch={vi.fn()}
      />,
    );

    expandDetails();
    expect(screen.getByText('正在检查 Steamworks')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /专辑/u }));
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(screen.getByText('Playing: New result - ECHO')).toBeTruthy();

    await act(async () => { resolveOlderRequest?.(createSteamStatus('Playing: Old result - ECHO')); });
    expect(screen.queryByText('Playing: Old result - ECHO')).toBeNull();
    expect(screen.getByText('Playing: New result - ECHO')).toBeTruthy();
  });

  it('renders only the submitted text instead of a simulated Steam friend card', async () => {
    window.echo = {
      steam: {
        getStatus: vi.fn().mockResolvedValue({
          ...createSteamStatus('正在听 Starlight · ECHO · Night Drive · 1:15 / 3:45'),
          playerName: 'Ryan',
        }),
      },
    } as unknown as Window['echo'];

    render(<SteamRichPresenceSettings locale="zh-CN" settings={{ steamRichPresenceMode: 'detailed' } as AppSettings} onPatch={vi.fn()} />);

    expandDetails();
    expect(await screen.findByText('正在听 Starlight · ECHO · Night Drive · 1:15 / 3:45')).toBeTruthy();
    expect(screen.getByText('当前提交文本')).toBeTruthy();
    expect(screen.queryByText('Ryan')).toBeNull();
  });
});
