import { describe, expect, it, vi } from 'vitest';
import { hideMainWindowToTray, showMainWindowFromTray } from './mainWindowTrayVisibility';

const createWindow = ({
  destroyed = false,
}: {
  destroyed?: boolean;
} = {}) => {
  const calls: string[] = [];
  return {
    calls,
    window: {
      hide: vi.fn(() => calls.push('hide')),
      isDestroyed: vi.fn(() => destroyed),
      setSkipTaskbar: vi.fn((skip: boolean) => calls.push(`skip-taskbar:${skip}`)),
    },
  };
};

describe('hideMainWindowToTray', () => {
  it('keeps the hidden window out of the taskbar without minimizing it', () => {
    const { calls, window } = createWindow();

    hideMainWindowToTray(window);

    expect(calls).toEqual(['skip-taskbar:true', 'hide']);
  });

  it('does not touch a destroyed window', () => {
    const destroyed = createWindow({ destroyed: true });
    hideMainWindowToTray(destroyed.window);
    expect(destroyed.calls).toEqual([]);
  });
});

describe('showMainWindowFromTray', () => {
  it('restores the already-mounted minimized window before focusing it', () => {
    const calls: string[] = [];
    const window = {
      focus: vi.fn(() => calls.push('focus')),
      isDestroyed: vi.fn(() => false),
      isMinimized: vi.fn(() => true),
      restore: vi.fn(() => calls.push('restore')),
      setSkipTaskbar: vi.fn((skip: boolean) => calls.push(`skip-taskbar:${skip}`)),
      show: vi.fn(() => calls.push('show')),
    };

    showMainWindowFromTray(window);

    expect(calls).toEqual(['show', 'restore', 'skip-taskbar:false', 'focus']);
  });
});
