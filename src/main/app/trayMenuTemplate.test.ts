import { describe, expect, it, vi } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';
import { createTrayMenuTemplate, formatTrayRemainingTime, type TrayMenuCallbacks } from './trayMenuTemplate';

const callbacks = (): TrayMenuCallbacks => ({
  showMainWindow: vi.fn(),
  hideMainWindow: vi.fn(),
  sendPlaybackCommand: vi.fn(),
  openAudioSettings: vi.fn(),
  startSleepTimer: vi.fn(),
  cancelSleepTimer: vi.fn(),
  quitApp: vi.fn(),
});

const findItem = (
  items: MenuItemConstructorOptions[],
  label: string,
): MenuItemConstructorOptions => {
  const item = items.find((candidate) => candidate.label === label);
  if (!item) {
    throw new Error(`Missing menu item: ${label}`);
  }
  return item;
};

describe('createTrayMenuTemplate', () => {
  it('uses compact grouped controls and the current main-window action', () => {
    const handlers = callbacks();
    const template = createTrayMenuTemplate({
      isMainWindowVisible: true,
      isUltraLightModeActive: false,
      sleepTimer: { isActive: false, remainingMs: 0, action: 'pause', fadeOutEnabled: false, durationMinutes: 0 },
    }, handlers);

    findItem(template, '隐藏主界面').click?.({} as never, {} as never, {} as never);
    expect(handlers.hideMainWindow).toHaveBeenCalledOnce();

    const playbackItems = findItem(template, '播放控制').submenu as MenuItemConstructorOptions[];
    findItem(playbackItems, '前进 10 秒').click?.({} as never, {} as never, {} as never);
    expect(handlers.sendPlaybackCommand).toHaveBeenCalledWith('seekForward');

    const featureItems = findItem(template, '快捷功能').submenu as MenuItemConstructorOptions[];
    findItem(featureItems, '显示 / 隐藏桌面歌词').click?.({} as never, {} as never, {} as never);
    expect(handlers.sendPlaybackCommand).toHaveBeenCalledWith('toggleDesktopLyrics');
  });

  it('starts a quick timer with fade-friendly preset semantics', () => {
    const handlers = callbacks();
    const template = createTrayMenuTemplate({
      isMainWindowVisible: false,
      isUltraLightModeActive: false,
      sleepTimer: { isActive: false, remainingMs: 0, action: 'pause', fadeOutEnabled: false, durationMinutes: 0 },
    }, handlers);

    const timerItems = findItem(template, '睡眠定时器').submenu as MenuItemConstructorOptions[];
    findItem(timerItems, '30 分钟后停止播放').click?.({} as never, {} as never, {} as never);
    expect(handlers.startSleepTimer).toHaveBeenCalledWith(30, 'stop');
  });

  it('shows active timer state and exposes cancellation', () => {
    const handlers = callbacks();
    const template = createTrayMenuTemplate({
      isMainWindowVisible: false,
      isUltraLightModeActive: true,
      sleepTimer: { isActive: true, remainingMs: 65_001, action: 'quit', fadeOutEnabled: true, durationMinutes: 60 },
    }, handlers);

    const timer = findItem(template, '睡眠定时器 · 01:06');
    const timerItems = timer.submenu as MenuItemConstructorOptions[];
    expect(findItem(timerItems, '到期后：退出 ECHO').enabled).toBe(false);
    findItem(timerItems, '取消睡眠定时器').click?.({} as never, {} as never, {} as never);
    expect(handlers.cancelSleepTimer).toHaveBeenCalledOnce();
    expect(findItem(template, '恢复 ECHO 主界面')).toBeTruthy();
  });
});

describe('formatTrayRemainingTime', () => {
  it('rounds up to avoid displaying zero too early', () => {
    expect(formatTrayRemainingTime(60_001)).toBe('01:01');
    expect(formatTrayRemainingTime(-1)).toBe('00:00');
  });
});
