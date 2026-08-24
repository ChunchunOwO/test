import type { FSWatcher } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { disposeSharedSettingsWatcher, initializeSharedSettingsWatcher } from './SharedSettingsWatcher';

describe('SharedSettingsWatcher', () => {
  afterEach(() => {
    disposeSharedSettingsWatcher();
    vi.useRealTimers();
  });

  it('debounces notifications for the shared settings file and ignores other files', async () => {
    vi.useFakeTimers();
    const settingsPath = resolve('tmp', 'ECHO', 'echo-settings.json');
    const close = vi.fn();
    const onChanged = vi.fn();
    const notifications: Array<(eventType: string, fileName: string | Buffer | null) => void> = [];
    const watcher = {
      close,
      on: vi.fn().mockReturnThis(),
    } as unknown as FSWatcher;
    const watchDirectory = vi.fn((
      _path: string,
      _options: { persistent: boolean },
      listener: (eventType: string, fileName: string | Buffer | null) => void,
    ) => {
      notifications.push(listener);
      return watcher;
    });

    expect(initializeSharedSettingsWatcher(onChanged, {
      debounceMs: 100,
      directoryExists: () => true,
      enabled: true,
      settingsPath,
      watchDirectory,
    })).toBe(true);
    expect(watchDirectory).toHaveBeenCalledWith(dirname(settingsPath), { persistent: false }, expect.any(Function));
    const notify = notifications[0];
    if (!notify) {
      throw new Error('Expected the watcher listener to be registered.');
    }

    notify('change', 'other.json');
    await vi.advanceTimersByTimeAsync(100);
    expect(onChanged).not.toHaveBeenCalled();

    notify('rename', 'echo-settings.json');
    notify('change', Buffer.from('echo-settings.json'));
    await vi.advanceTimersByTimeAsync(99);
    expect(onChanged).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onChanged).toHaveBeenCalledTimes(1);

    disposeSharedSettingsWatcher();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
