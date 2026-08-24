import { describe, expect, it, vi } from 'vitest';
import { handleMacosOpenFile, type MacosOpenFileWindow } from './macosOpenFile';

const createWindow = (): MacosOpenFileWindow => ({
  focus: vi.fn(),
  isDestroyed: vi.fn(() => false),
  isMinimized: vi.fn(() => false),
  restore: vi.fn(),
  show: vi.fn(),
});

describe('macOS open-file bridge', () => {
  it('queues an early Finder file event without creating a window before app readiness', () => {
    const event = { preventDefault: vi.fn() };
    const dispatchFiles = vi.fn();
    const createMainWindow = vi.fn(createWindow);

    expect(handleMacosOpenFile({
      platform: 'darwin',
      event,
      filePath: '/Users/test/Music/song.flac',
      appReady: false,
      recoveryMode: false,
      getWindow: () => null,
      createWindow: createMainWindow,
      dispatchFiles,
    })).toBe(true);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(createMainWindow).not.toHaveBeenCalled();
    expect(dispatchFiles).toHaveBeenCalledWith(['/Users/test/Music/song.flac']);
  });

  it('restores and focuses the existing window for a running app', () => {
    const window = createWindow();
    vi.mocked(window.isMinimized).mockReturnValue(true);

    handleMacosOpenFile({
      platform: 'darwin',
      event: { preventDefault: vi.fn() },
      filePath: '/Users/test/Music/song.m4a',
      appReady: true,
      recoveryMode: false,
      getWindow: () => window,
      createWindow,
      dispatchFiles: vi.fn(),
    });

    expect(window.restore).toHaveBeenCalledOnce();
    expect(window.show).toHaveBeenCalledOnce();
    expect(window.focus).toHaveBeenCalledOnce();
  });

  it('does not intercept non-macOS events or open media during recovery mode', () => {
    const nonMacEvent = { preventDefault: vi.fn() };
    expect(handleMacosOpenFile({
      platform: 'win32',
      event: nonMacEvent,
      filePath: 'C:\\Music\\song.flac',
      appReady: true,
      recoveryMode: false,
      getWindow: () => null,
      createWindow,
      dispatchFiles: vi.fn(),
    })).toBe(false);
    expect(nonMacEvent.preventDefault).not.toHaveBeenCalled();

    const dispatchFiles = vi.fn();
    handleMacosOpenFile({
      platform: 'darwin',
      event: { preventDefault: vi.fn() },
      filePath: '/Users/test/Music/song.flac',
      appReady: true,
      recoveryMode: true,
      getWindow: () => null,
      createWindow,
      dispatchFiles,
    });
    expect(dispatchFiles).not.toHaveBeenCalled();
  });
});
