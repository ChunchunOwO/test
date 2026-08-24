import { EventEmitter } from 'node:events';
import type { BrowserWindow } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import type { AudioStatus } from '../../shared/types/audio';
import {
  bindMainWindowBackgroundThrottling,
  shouldThrottleHiddenMainWindow,
} from './mainWindowBackgroundThrottling';

const createStatus = (outputMode: AudioStatus['outputMode']): AudioStatus => ({ outputMode } as AudioStatus);

class FakeWindow extends EventEmitter {
  visible = false;
  minimized = false;
  destroyed = false;
  readonly setBackgroundThrottling = vi.fn();
  readonly webContents = {
    isDestroyed: (): boolean => this.destroyed,
    setBackgroundThrottling: this.setBackgroundThrottling,
  };

  isDestroyed(): boolean {
    return this.destroyed;
  }

  isVisible(): boolean {
    return this.visible;
  }

  isMinimized(): boolean {
    return this.minimized;
  }
}

class FakeAudioSession extends EventEmitter {
  status = createStatus('shared');

  getStatus(): AudioStatus {
    return this.status;
  }
}

describe('shouldThrottleHiddenMainWindow', () => {
  it('only allows throttling for hidden native-host output modes', () => {
    expect(shouldThrottleHiddenMainWindow(false, 'shared')).toBe(true);
    expect(shouldThrottleHiddenMainWindow(false, 'exclusive')).toBe(true);
    expect(shouldThrottleHiddenMainWindow(false, 'asio')).toBe(true);
    expect(shouldThrottleHiddenMainWindow(false, 'ks')).toBe(true);
    expect(shouldThrottleHiddenMainWindow(false, 'system')).toBe(false);
    expect(shouldThrottleHiddenMainWindow(false, undefined)).toBe(false);
    expect(shouldThrottleHiddenMainWindow(true, 'shared')).toBe(false);
  });
});

describe('bindMainWindowBackgroundThrottling', () => {
  it('waits for first paint, follows host output truth, and restores visible timers', () => {
    const window = new FakeWindow();
    const audioSession = new FakeAudioSession();
    const dispose = bindMainWindowBackgroundThrottling(
      window as unknown as BrowserWindow,
      audioSession,
    );

    expect(window.setBackgroundThrottling).not.toHaveBeenCalled();

    audioSession.emit('status', audioSession.status);
    expect(window.setBackgroundThrottling).not.toHaveBeenCalled();

    window.emit('ready-to-show');
    expect(window.setBackgroundThrottling).toHaveBeenLastCalledWith(true);

    audioSession.status = createStatus('system');
    audioSession.emit('status', audioSession.status);
    expect(window.setBackgroundThrottling).toHaveBeenLastCalledWith(false);

    audioSession.status = createStatus('shared');
    audioSession.emit('status', audioSession.status);
    expect(window.setBackgroundThrottling).toHaveBeenLastCalledWith(true);

    window.visible = true;
    window.emit('show');
    expect(window.setBackgroundThrottling).toHaveBeenLastCalledWith(false);

    window.minimized = true;
    window.emit('minimize');
    expect(window.setBackgroundThrottling).toHaveBeenLastCalledWith(true);

    window.minimized = false;
    window.emit('restore');
    expect(window.setBackgroundThrottling).toHaveBeenLastCalledWith(false);

    dispose();
    audioSession.emit('status', createStatus('shared'));
    expect(window.setBackgroundThrottling).toHaveBeenCalledTimes(6);
  });

  it('keeps system-output renderer timers running while minimized', () => {
    const window = new FakeWindow();
    const audioSession = new FakeAudioSession();
    audioSession.status = createStatus('system');
    bindMainWindowBackgroundThrottling(window as unknown as BrowserWindow, audioSession);

    window.visible = true;
    window.emit('ready-to-show');
    window.minimized = true;
    window.emit('minimize');

    expect(window.setBackgroundThrottling).not.toHaveBeenCalled();
  });

  it('does not reapply an unchanged throttle state during repeated status updates', () => {
    const window = new FakeWindow();
    const audioSession = new FakeAudioSession();
    window.visible = true;
    bindMainWindowBackgroundThrottling(window as unknown as BrowserWindow, audioSession);

    window.emit('ready-to-show');
    window.minimized = true;
    window.emit('minimize');

    for (let update = 0; update < 50; update += 1) {
      audioSession.emit('status', createStatus('shared'));
    }

    expect(window.setBackgroundThrottling).toHaveBeenCalledTimes(1);
    expect(window.setBackgroundThrottling).toHaveBeenLastCalledWith(true);

    window.minimized = false;
    window.emit('restore');
    expect(window.setBackgroundThrottling).toHaveBeenCalledTimes(2);
    expect(window.setBackgroundThrottling).toHaveBeenLastCalledWith(false);
  });

  it('keeps timers unthrottled when status cannot be read', () => {
    const window = new FakeWindow();
    const audioSession = new FakeAudioSession();
    audioSession.getStatus = (): AudioStatus => {
      throw new Error('status unavailable');
    };
    bindMainWindowBackgroundThrottling(window as unknown as BrowserWindow, audioSession);

    window.emit('ready-to-show');

    expect(window.setBackgroundThrottling).not.toHaveBeenCalled();
  });
});
