import { describe, expect, it, vi } from 'vitest';
import { createMacosApplicationMenuTemplate } from './macosApplicationMenu';

describe('macOS application menu', () => {
  it('provides native app, playback, edit, view and window menus', () => {
    const dispatchCommand = vi.fn();
    const template = createMacosApplicationMenuTemplate('ECHO', {
      dispatchCommand,
      showMainWindow: vi.fn(),
    });

    expect(template.map((item) => item.label)).toEqual([
      'ECHO',
      'File',
      'Edit',
      'Playback',
      'View',
      'Window',
    ]);

    const playback = template.find((item) => item.label === 'Playback');
    const playbackItems = Array.isArray(playback?.submenu) ? playback.submenu : [];
    playbackItems.find((item) => item.label === 'Play / Pause')?.click?.(
      {} as never,
      {} as never,
      {} as never,
    );
    expect(dispatchCommand).toHaveBeenCalledWith('playPause');
  });
});
