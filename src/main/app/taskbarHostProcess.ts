/**
 * Manages the echo-taskbar-host.exe native process.
 *
 * This is a pure Win32 + Direct2D executable. By default it creates
 * its window in the system-tools band, which keeps the mini player stable
 * across Start menu, Win+D, and taskbar z-order changes.
 *
 * IPC protocol: JSON over stdio.
 *   We send: {"type":"state","title":"...","artist":"...","playing":true,"position":12.5,"duration":180.0}
 *            {"type":"show"} / {"type":"hide"} / {"type":"quit"}
 *   We recv: {"type":"ready"}
 *            {"type":"click","action":"playPause"|"next"|"prev"}
 *            {"type":"seek","position":12.5}
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { app } from 'electron';
import { recordMainRuntimeIssue } from '../diagnostics/DevConsoleService';

export type TaskbarHostState =
  | 'unsupported'
  | 'missing'
  | 'stopped'
  | 'starting'
  | 'ready'
  | 'restarting'
  | 'stopping'
  | 'error';

export type TaskbarHostDiagnostics = {
  state: TaskbarHostState;
  hostPathAvailable: boolean;
  restartAttempts: number;
  lastError: string | null;
  lastExitAt: string | null;
};

export type TaskbarHostWindowMode = 'taskbar' | 'ultra-light-floating';

let taskbarHostProcess: ChildProcess | null = null;
let isReady = false;
let pendingState: string | null = null;
let pendingShow = false;
let windowMode: TaskbarHostWindowMode = 'taskbar';
let hostState: TaskbarHostState = process.platform === 'win32' ? 'stopped' : 'unsupported';
let lastError: string | null = null;
let lastExitAt: string | null = null;
let restartTimer: ReturnType<typeof setTimeout> | null = null;
const stoppingHosts = new WeakSet<ChildProcess>();
const restartAttempts: number[] = [];
const restartWindowMs = 60_000;
const maxRestartAttemptsPerWindow = 3;
const restartDelayMs = [500, 1_500, 4_000] as const;

const resolveHostPath = (): string | null => {
  const exeName = 'echo-taskbar-host.exe';
  const candidates: string[] = [];

  if (process.resourcesPath) {
    candidates.push(join(process.resourcesPath, exeName));
  }

  const appPath = app.getAppPath();
  candidates.push(join(appPath, '..', '..', 'electron-app', 'build', exeName));
  candidates.push(join(appPath, 'electron-app', 'build', exeName));
  candidates.push(join(process.cwd(), 'electron-app', 'build', exeName));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
};

type ClickCallback = (action: 'playPause' | 'next' | 'prev' | 'cycleOrder' | 'toggleQueue' | 'exitUltraLight') => void;
let clickCallback: ClickCallback | null = null;

type SeekCallback = (positionSeconds: number) => void;
let seekCallback: SeekCallback | null = null;

type VolumeCallback = (volume: number) => void;
let volumeCallback: VolumeCallback | null = null;

type QueueItemCallback = (index: number) => void;
let queueItemCallback: QueueItemCallback | null = null;

type ShortcutCallback = (accelerator: string) => void;
let shortcutCallback: ShortcutCallback | null = null;

type DoubleClickCallback = () => void;
let doubleClickCallback: DoubleClickCallback | null = null;

type ReadyCallback = () => void;
let readyCallback: ReadyCallback | null = null;

type StateChangedCallback = () => void;
let stateChangedCallback: StateChangedCallback | null = null;

export const setTaskbarHostClickCallback = (cb: ClickCallback): void => {
  clickCallback = cb;
};

export const setTaskbarHostSeekCallback = (cb: SeekCallback): void => {
  seekCallback = cb;
};

export const setTaskbarHostVolumeCallback = (cb: VolumeCallback): void => {
  volumeCallback = cb;
};

export const setTaskbarHostQueueItemCallback = (cb: QueueItemCallback): void => {
  queueItemCallback = cb;
};

export const setTaskbarHostShortcutCallback = (cb: ShortcutCallback): void => {
  shortcutCallback = cb;
};

export const setTaskbarHostDoubleClickCallback = (cb: DoubleClickCallback): void => {
  doubleClickCallback = cb;
};

export const setTaskbarHostReadyCallback = (cb: ReadyCallback): void => {
  readyCallback = cb;
};

export const setTaskbarHostStateChangedCallback = (cb: StateChangedCallback): void => {
  stateChangedCallback = cb;
};

const emitStateChanged = (): void => {
  try {
    stateChangedCallback?.();
  } catch {
    // State observers are best-effort and must not destabilize the native host.
  }
};

const clearRestartTimer = (): void => {
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
};

const pruneRestartAttempts = (now = Date.now()): void => {
  while (restartAttempts.length > 0 && now - restartAttempts[0] > restartWindowMs) {
    restartAttempts.shift();
  }
};

const scheduleTaskbarHostRestart = (reason: string): void => {
  if (!pendingShow || restartTimer || process.platform !== 'win32') {
    return;
  }

  const now = Date.now();
  pruneRestartAttempts(now);
  if (restartAttempts.length >= maxRestartAttemptsPerWindow) {
    hostState = 'error';
    lastError = `${reason}; automatic restart limit reached`;
    recordMainRuntimeIssue('taskbar-host-restart-limit', lastError, {
      reason: `${restartAttempts.length} attempts within ${restartWindowMs}ms`,
    });
    emitStateChanged();
    return;
  }

  const attemptIndex = restartAttempts.length;
  const delayMs = restartDelayMs[Math.min(attemptIndex, restartDelayMs.length - 1)];
  restartAttempts.push(now);
  hostState = 'restarting';
  lastError = reason;
  emitStateChanged();

  restartTimer = setTimeout(() => {
    restartTimer = null;
    if (!pendingShow) {
      hostState = 'stopped';
      emitStateChanged();
      return;
    }

    if (!startTaskbarHost()) {
      scheduleTaskbarHostRestart(lastError ?? 'taskbar host restart failed');
    }
  }, delayMs);
};

const handleTaskbarHostTermination = (
  child: ChildProcess,
  reason: string,
  issueCode: string,
): void => {
  if (taskbarHostProcess !== child) {
    return;
  }

  taskbarHostProcess = null;
  isReady = false;
  lastExitAt = new Date().toISOString();

  if (stoppingHosts.has(child)) {
    hostState = 'stopped';
    lastError = null;
    stoppingHosts.delete(child);
    emitStateChanged();
    return;
  }

  hostState = 'error';
  lastError = reason;
  recordMainRuntimeIssue(issueCode, reason, {});
  emitStateChanged();
  scheduleTaskbarHostRestart(reason);
};

export const startTaskbarHost = (): boolean => {
  if (taskbarHostProcess) {
    return true;
  }

  if (restartTimer) {
    return true;
  }

  if (process.platform !== 'win32') {
    hostState = 'unsupported';
    lastError = 'Taskbar mini player is only available on Windows';
    emitStateChanged();
    return false;
  }

  const hostPath = resolveHostPath();
  if (!hostPath) {
    console.log('[taskbar-host] echo-taskbar-host.exe not found');
    hostState = 'missing';
    lastError = 'echo-taskbar-host.exe not found';
    emitStateChanged();
    return false;
  }

  try {
    const hostEnv = {
      ...process.env,
      ECHO_TASKBAR_WINDOW_BAND: process.env.ECHO_TASKBAR_WINDOW_BAND ?? 'system-tools',
      ECHO_TASKBAR_WINDOW_MODE: windowMode,
    };

    hostState = 'starting';
    lastError = null;
    emitStateChanged();

    const child = spawn(hostPath, [], {
      env: hostEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: false,
    });
    taskbarHostProcess = child;

    let stdoutBuffer = '';
    child.stdout?.on('data', (data: Buffer) => {
      stdoutBuffer += data.toString('utf8');
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        try {
          const msg = JSON.parse(trimmed);
          if (msg.type === 'ready') {
            isReady = true;
            hostState = 'ready';
            lastError = null;
            console.log('[taskbar-host] ready');
            sendToHost(JSON.stringify({ type: 'mode', mode: windowMode }));
            if (pendingState) {
              sendToHost(pendingState);
              pendingState = null;
            }
            if (pendingShow) {
              sendToHost('{"type":"show"}');
            }
            if (readyCallback) {
              try { readyCallback(); } catch { /* best-effort */ }
            }
            emitStateChanged();
          } else if (msg.type === 'click' && clickCallback) {
            clickCallback(msg.action);
          } else if (msg.type === 'seek' && seekCallback && typeof msg.position === 'number' && Number.isFinite(msg.position)) {
            seekCallback(Math.max(0, msg.position));
          } else if (msg.type === 'volume' && volumeCallback && typeof msg.volume === 'number' && Number.isFinite(msg.volume)) {
            volumeCallback(Math.max(0, Math.min(1, msg.volume)));
          } else if (msg.type === 'queueItem' && queueItemCallback && Number.isInteger(msg.index) && msg.index >= 0) {
            queueItemCallback(msg.index);
          } else if (msg.type === 'shortcut' && shortcutCallback && typeof msg.accelerator === 'string' && msg.accelerator.length <= 64) {
            shortcutCallback(msg.accelerator);
          } else if (msg.type === 'doubleClick' && doubleClickCallback) {
            doubleClickCallback();
          }
        } catch {
          // Non-JSON output; ignore.
        }
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString('utf8').trim();
      if (text) {
        console.log(`[taskbar-host] stderr: ${text}`);
      }
    });

    child.once('exit', (code, signal) => {
      console.log(`[taskbar-host] exited (code=${code}, signal=${signal})`);
      handleTaskbarHostTermination(
        child,
        `Taskbar host exited unexpectedly (code=${code}, signal=${signal})`,
        'taskbar-host-unexpected-exit',
      );
    });

    child.once('error', (err) => {
      console.log(`[taskbar-host] process error: ${err.message}`);
      handleTaskbarHostTermination(child, err.message, 'taskbar-host-process-error');
    });

    return true;
  } catch (e) {
    console.log(`[taskbar-host] Failed to start: ${e}`);
    hostState = 'error';
    lastError = e instanceof Error ? e.message : String(e);
    recordMainRuntimeIssue('taskbar-host-start-failed', lastError, {});
    emitStateChanged();
    return false;
  }
};

const sendToHost = (json: string): void => {
  if (!taskbarHostProcess?.stdin?.writable) {
    return;
  }
  taskbarHostProcess.stdin.write(`${json}\n`);
};

export const updateTaskbarHostState = (state: {
  title: string;
  artist: string;
  playing: boolean;
  position: number;
  duration: number;
  coverPath?: string;
  lyrics?: string;
  queueText?: string;
  queueCurrentIndex?: number;
  playbackOrder?: string;
  playbackOrderMode?: 'sequential' | 'shuffle' | 'repeat-one';
  colorScheme?: 'light' | 'dark';
  volume?: number;
}): void => {
  const json = JSON.stringify({ type: 'state', ...state });
  if (isReady) {
    sendToHost(json);
  } else {
    pendingState = json;
  }
};

export const setTaskbarHostWindowMode = (mode: TaskbarHostWindowMode): void => {
  windowMode = mode;
  if (isReady) {
    sendToHost(JSON.stringify({ type: 'mode', mode }));
  }
};

export const showTaskbarHost = (): void => {
  pendingShow = true;
  if (isReady) {
    sendToHost('{"type":"show"}');
  }
};

export const hideTaskbarHost = (preserveFailure = false): void => {
  pendingShow = false;
  clearRestartTimer();
  if (!taskbarHostProcess && !preserveFailure) {
    hostState = process.platform === 'win32' ? 'stopped' : 'unsupported';
    lastError = null;
    emitStateChanged();
  }
  if (isReady) {
    sendToHost('{"type":"hide"}');
  }
};

export const stopTaskbarHost = (): void => {
  pendingShow = false;
  clearRestartTimer();
  restartAttempts.splice(0);

  const child = taskbarHostProcess;
  if (child) {
    stoppingHosts.add(child);
    hostState = 'stopping';
    emitStateChanged();
    try {
      sendToHost('{"type":"quit"}');
      setTimeout(() => {
        if (taskbarHostProcess === child) {
          child.kill();
          taskbarHostProcess = null;
          isReady = false;
          hostState = 'stopped';
          lastError = null;
          emitStateChanged();
        }
      }, 1000);
    } catch {
      if (taskbarHostProcess === child) {
        child.kill();
        taskbarHostProcess = null;
        isReady = false;
        hostState = 'stopped';
        lastError = null;
        emitStateChanged();
      }
    }
  }

  isReady = false;
  if (!child) {
    hostState = process.platform === 'win32' ? 'stopped' : 'unsupported';
    lastError = null;
    emitStateChanged();
  }
};

export const stopTaskbarHostAndWait = async (): Promise<void> => {
  const child = taskbarHostProcess;
  if (!child) {
    stopTaskbarHost();
    return;
  }

  let timeout: ReturnType<typeof setTimeout> | null = null;
  let resolveExit!: () => void;
  const exited = new Promise<void>((resolve) => {
    resolveExit = resolve;
  });
  const handleExit = (): void => resolveExit();
  child.once('exit', handleExit);

  stopTaskbarHost();
  await Promise.race([
    exited,
    new Promise<void>((resolve) => {
      timeout = setTimeout(resolve, 1_250);
      timeout.unref?.();
    }),
  ]);
  if (timeout) {
    clearTimeout(timeout);
  }
  child.removeListener('exit', handleExit);
};

export const isTaskbarHostReady = (): boolean => isReady;

export const getTaskbarHostDiagnostics = (): TaskbarHostDiagnostics => {
  pruneRestartAttempts();
  return {
    state: hostState,
    hostPathAvailable: process.platform === 'win32' && resolveHostPath() !== null,
    restartAttempts: restartAttempts.length,
    lastError,
    lastExitAt,
  };
};
