import type { BrowserWindow } from 'electron';
import type { AudioStatus } from '../../shared/types/audio';
import { getAudioSession } from '../audioPublicApi';

type AudioStatusSource = {
  getStatus(): AudioStatus;
  on(event: 'status', listener: (status: AudioStatus) => void): unknown;
  off(event: 'status', listener: (status: AudioStatus) => void): unknown;
};

const nativeHostOutputModes = new Set<AudioStatus['outputMode']>([
  'shared',
  'exclusive',
  'asio',
  'ks',
]);

export const shouldThrottleHiddenMainWindow = (
  isVisible: boolean,
  outputMode: AudioStatus['outputMode'] | null | undefined,
): boolean => !isVisible && outputMode !== undefined && outputMode !== null && nativeHostOutputModes.has(outputMode);

export const bindMainWindowBackgroundThrottling = (
  window: BrowserWindow,
  audioSession: AudioStatusSource = getAudioSession(),
): (() => void) => {
  let disposed = false;
  let readyForBackgroundThrottling = false;
  // WebPreferences starts at false. Do not throttle startup or first paint.
  let applied = false;

  const apply = (allowed: boolean): void => {
    if (
      disposed ||
      applied === allowed ||
      window.isDestroyed() ||
      window.webContents.isDestroyed()
    ) {
      return;
    }

    try {
      window.webContents.setBackgroundThrottling(allowed);
      applied = allowed;
    } catch {
      // Fail open for renderer timers. A later window/status event may retry.
    }
  };

  const refresh = (status?: AudioStatus): void => {
    if (disposed || window.isDestroyed()) {
      return;
    }

    if (!readyForBackgroundThrottling || (window.isVisible() && !window.isMinimized())) {
      apply(false);
      return;
    }

    try {
      const outputMode = status?.outputMode ?? audioSession.getStatus().outputMode;
      apply(shouldThrottleHiddenMainWindow(false, outputMode));
    } catch {
      apply(false);
    }
  };

  const handleShow = (): void => apply(false);
  const handleRestore = (): void => apply(false);
  const handleHiddenState = (): void => refresh();
  const handleReadyToShow = (): void => {
    readyForBackgroundThrottling = true;
    refresh();
  };
  const handleStatus = (status: AudioStatus): void => refresh(status);
  const dispose = (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    audioSession.off('status', handleStatus);
    window.off('ready-to-show', handleReadyToShow);
    window.off('hide', handleHiddenState);
    window.off('minimize', handleHiddenState);
    window.off('restore', handleRestore);
    window.off('show', handleShow);
    window.off('closed', dispose);
  };

  audioSession.on('status', handleStatus);
  window.on('ready-to-show', handleReadyToShow);
  window.on('hide', handleHiddenState);
  window.on('minimize', handleHiddenState);
  window.on('restore', handleRestore);
  window.on('show', handleShow);
  window.on('closed', dispose);

  return dispose;
};
