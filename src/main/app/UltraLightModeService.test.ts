import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const statusListeners = new Set<(status: Record<string, unknown>) => void>();
  const audioStatus = {
    state: 'playing',
    currentTrackId: 'track-1',
    currentFilePath: 'C:\\Music\\one.flac',
    positionSeconds: 2,
    volume: 0.8,
  };
  const audioSession = {
    getStatus: vi.fn(() => ({ ...audioStatus })),
    on: vi.fn((_event: string, listener: (status: Record<string, unknown>) => void) => statusListeners.add(listener)),
    off: vi.fn((_event: string, listener: (status: Record<string, unknown>) => void) => statusListeners.delete(listener)),
    play: vi.fn(async () => ({ ...audioStatus, state: 'playing' })),
    pause: vi.fn(async () => ({ ...audioStatus, state: 'paused' })),
    stop: vi.fn(async () => ({ ...audioStatus, state: 'stopped' })),
    seek: vi.fn(async () => ({ ...audioStatus })),
    setOutput: vi.fn(async () => ({ ...audioStatus })),
    syncQueueToBackend: vi.fn(async () => undefined),
    playLocalFile: vi.fn(async () => ({ ...audioStatus })),
  };
  const session = {
    version: 1 as const,
    revision: 4,
    items: [
      {
        queueId: 'queue-1',
        track: { id: 'track-1', path: 'C:\\Music\\one.flac', title: 'One', artist: 'A', album: 'Album', albumArtist: 'A', coverThumb: null },
        source: { type: 'manual' as const, label: 'Queue' },
        addedAt: '2026-08-05T00:00:00.000Z',
      },
      {
        queueId: 'queue-2',
        track: { id: 'track-2', path: 'C:\\Music\\two.flac', title: 'Two', artist: 'A', album: 'Album', albumArtist: 'A', coverThumb: null },
        source: { type: 'manual' as const, label: 'Queue' },
        addedAt: '2026-08-05T00:00:01.000Z',
      },
    ],
    currentQueueId: 'queue-1',
    currentTrackId: 'track-1',
    lastPlayedTrack: null,
    history: [],
    mode: { isShuffleEnabled: false, repeatMode: 'off' as const, automixEnabled: false },
    resume: null,
    updatedAt: '2026-08-05T00:00:00.000Z',
  };
  const playbackStore = {
    load: vi.fn(() => session),
    save: vi.fn((next) => next),
    saveResumeFromAudioStatus: vi.fn(() => session),
  };
  const registered = new Map<string, () => void>();
  const window = {
    isDestroyed: vi.fn(() => false),
    destroy: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    once: vi.fn((_event: string, listener: () => void) => listener()),
  };
  return {
    audioSession,
    audioStatus,
    playbackStore,
    registered,
    window,
    ensureTray: vi.fn(),
    closeDevConsoleWindow: vi.fn(),
    closeDesktopLyricsWindow: vi.fn(),
    closeMiniPlayerWindow: vi.fn(),
    closePetWindow: vi.fn(),
    setTaskbarHostWindowMode: vi.fn(),
    hideTaskbarHost: vi.fn(),
    showTaskbarHost: vi.fn(),
    startTaskbarHost: vi.fn(() => true),
    stopTaskbarHostAndWait: vi.fn(async (): Promise<void> => undefined),
    updateTaskbarHostState: vi.fn(),
    restoreDesktopLyricsWindowOnStartup: vi.fn(),
    restoreMiniPlayerWindowOnStartup: vi.fn(),
    restorePetWindowOnStartup: vi.fn(),
    createMainWindow: vi.fn(() => window),
    ultraLightGpuDisabled: false,
    isUltraLightGpuRuntime: false,
    relaunch: vi.fn(),
    exit: vi.fn(),
    shouldUseDarkColors: false,
    libraryTrack: { title: 'One', artist: 'A', albumArtist: 'A', coverId: null as string | null },
  };
});

vi.mock('electron', () => ({
  app: { relaunch: mocks.relaunch, exit: mocks.exit },
  nativeTheme: { get shouldUseDarkColors() { return mocks.shouldUseDarkColors; } },
  BrowserWindow: { getAllWindows: vi.fn(() => [mocks.window]) },
  globalShortcut: {
    isRegistered: vi.fn((accelerator: string) => mocks.registered.has(accelerator)),
    register: vi.fn((accelerator: string, callback: () => void) => {
      if (mocks.registered.has(accelerator)) return false;
      mocks.registered.set(accelerator, callback);
      return true;
    }),
    unregister: vi.fn((accelerator: string) => mocks.registered.delete(accelerator)),
  },
}));
vi.mock('../audioPublicApi', () => ({
  getAudioSession: () => mocks.audioSession,
  getPlaybackSessionStore: () => mocks.playbackStore,
}));
vi.mock('../library/LibraryService', () => ({
  getLibraryService: () => ({ getTrack: () => mocks.libraryTrack }),
}));
vi.mock('../diagnostics/DevConsoleService', () => ({ closeDevConsoleWindow: mocks.closeDevConsoleWindow }));
vi.mock('./windowManager', () => ({ getMainWindow: () => null }));
vi.mock('./tray', () => ({ ensureTray: mocks.ensureTray }));
vi.mock('./desktopLyricsWindow', () => ({
  closeDesktopLyricsWindow: mocks.closeDesktopLyricsWindow,
  restoreDesktopLyricsWindowOnStartup: mocks.restoreDesktopLyricsWindowOnStartup,
}));
vi.mock('./miniPlayerWindow', () => ({
  closeMiniPlayerWindow: mocks.closeMiniPlayerWindow,
  restoreMiniPlayerWindowOnStartup: mocks.restoreMiniPlayerWindowOnStartup,
}));
vi.mock('./petWindow', () => ({
  closePetWindow: mocks.closePetWindow,
  restorePetWindowOnStartup: mocks.restorePetWindowOnStartup,
}));
vi.mock('./appSettings', () => ({ getAppSettings: () => ({
  taskbarMiniPlayerEnabled: false,
  ultraLightGpuDisabled: mocks.ultraLightGpuDisabled,
}) }));
vi.mock('./ultraLightGpuRuntime', () => ({
  isUltraLightGpuRuntime: () => mocks.isUltraLightGpuRuntime,
  createUltraLightGpuRuntimeArgs: () => ['.', '--echo-ultra-light-gpu-runtime'],
  prepareNormalRuntimeRelaunch: () => [],
}));
vi.mock('./taskbarHostProcess', () => ({
  setTaskbarHostWindowMode: mocks.setTaskbarHostWindowMode,
  hideTaskbarHost: mocks.hideTaskbarHost,
  showTaskbarHost: mocks.showTaskbarHost,
  startTaskbarHost: mocks.startTaskbarHost,
  stopTaskbarHostAndWait: mocks.stopTaskbarHostAndWait,
  updateTaskbarHostState: mocks.updateTaskbarHostState,
}));
vi.mock('./createMainWindow', () => ({ createMainWindow: mocks.createMainWindow }));

describe('UltraLightModeService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    mocks.registered.clear();
    mocks.ultraLightGpuDisabled = false;
    mocks.isUltraLightGpuRuntime = false;
    mocks.shouldUseDarkColors = false;
  });

  it('fails closed when the guaranteed restore shortcut is unavailable', async () => {
    mocks.registered.set('CommandOrControl+Shift+E', vi.fn());
    const { enterUltraLightMode } = await import('./UltraLightModeService');

    const status = await enterUltraLightMode();

    expect(status.active).toBe(false);
    expect(status.error).toBe('ultra_light_mode_restore_shortcut_unavailable');
    expect(mocks.window.destroy).not.toHaveBeenCalled();
  });

  it('destroys every UI window while keeping the main audio session alive', async () => {
    const { enterUltraLightMode } = await import('./UltraLightModeService');

    const status = await enterUltraLightMode();
    await vi.advanceTimersByTimeAsync(100);

    expect(status.active).toBe(true);
    expect(mocks.playbackStore.saveResumeFromAudioStatus).toHaveBeenCalled();
    expect(mocks.closeDesktopLyricsWindow).toHaveBeenCalled();
    expect(mocks.closeMiniPlayerWindow).toHaveBeenCalled();
    expect(mocks.closePetWindow).toHaveBeenCalled();
    expect(mocks.setTaskbarHostWindowMode).toHaveBeenCalledWith('ultra-light-floating');
    expect(mocks.showTaskbarHost).toHaveBeenCalled();
    expect(mocks.startTaskbarHost).toHaveBeenCalled();
    expect(mocks.updateTaskbarHostState).toHaveBeenCalledWith(expect.objectContaining({
      playing: true,
      lyrics: '',
      colorScheme: 'light',
      volume: 0.8,
    }));
    expect(mocks.window.destroy).toHaveBeenCalled();
    expect(mocks.audioSession.stop).not.toHaveBeenCalled();
  });

  it('publishes the effective application dark theme to the native mini player', async () => {
    mocks.shouldUseDarkColors = true;
    const { enterUltraLightMode } = await import('./UltraLightModeService');

    await enterUltraLightMode();

    expect(mocks.updateTaskbarHostState).toHaveBeenCalledWith(expect.objectContaining({
      colorScheme: 'dark',
    }));
  });

  it('plays the next persisted local queue item without a renderer', async () => {
    const { dispatchUltraLightModeAction, enterUltraLightMode } = await import('./UltraLightModeService');
    await enterUltraLightMode();

    await dispatchUltraLightModeAction('nextTrack');

    expect(mocks.audioSession.syncQueueToBackend).toHaveBeenCalledWith(expect.any(Array), 'off', 'queue-2');
    expect(mocks.audioSession.playLocalFile).toHaveBeenCalledWith(expect.objectContaining({
      filePath: 'C:\\Music\\two.flac',
      trackId: 'track-2',
    }));
    expect(mocks.playbackStore.save).toHaveBeenCalledWith(expect.objectContaining({
      currentQueueId: 'queue-2',
      currentTrackId: 'track-2',
    }), { preserveRevision: true });
  });

  it('handles native SMTC media commands without forwarding to a renderer', async () => {
    const { dispatchUltraLightModeSmtcCommand, enterUltraLightMode } = await import('./UltraLightModeService');
    await enterUltraLightMode();

    await dispatchUltraLightModeSmtcCommand('pause');
    await dispatchUltraLightModeSmtcCommand({ type: 'seek', positionSeconds: 42 });

    expect(mocks.audioSession.pause).toHaveBeenCalledTimes(1);
    expect(mocks.audioSession.seek).toHaveBeenCalledWith(42);
  });

  it('resumes playback when the focused Ultralight shortcut is used from a non-playing state', async () => {
    mocks.audioStatus.state = 'stopped';
    const { dispatchUltraLightModeAction, enterUltraLightMode } = await import('./UltraLightModeService');
    await enterUltraLightMode();

    await dispatchUltraLightModeAction('playPause');

    expect(mocks.audioSession.play).toHaveBeenCalledTimes(1);
    mocks.audioStatus.state = 'playing';
  });

  it('replays the current track and resets playback speed without a renderer', async () => {
    const { dispatchUltraLightModeAction, enterUltraLightMode } = await import('./UltraLightModeService');
    await enterUltraLightMode();

    await dispatchUltraLightModeAction('replayCurrentTrack');
    await dispatchUltraLightModeAction('resetPlaybackSpeed');

    expect(mocks.audioSession.seek).toHaveBeenCalledWith(0);
    expect(mocks.audioSession.setOutput).toHaveBeenCalledWith({ playbackRate: 1 });
  });

  it('cycles playback order and plays a selected persisted queue item without a renderer', async () => {
    const { cycleUltraLightModePlaybackOrder, enterUltraLightMode, playUltraLightModeQueueItemAt } = await import('./UltraLightModeService');
    await enterUltraLightMode();

    await cycleUltraLightModePlaybackOrder();
    await playUltraLightModeQueueItemAt(1);

    expect(mocks.playbackStore.save).toHaveBeenCalledWith(expect.objectContaining({
      mode: expect.objectContaining({ isShuffleEnabled: true, repeatMode: 'off' }),
    }), { preserveRevision: true });
    expect(mocks.audioSession.playLocalFile).toHaveBeenCalledWith(expect.objectContaining({
      filePath: 'C:\\Music\\two.flac',
      trackId: 'track-2',
    }));
  });

  it('relaunches into the GPU-disabled runtime only when the ultra-light option is enabled', async () => {
    mocks.ultraLightGpuDisabled = true;
    const { enterUltraLightMode } = await import('./UltraLightModeService');

    const status = await enterUltraLightMode();

    expect(status.phase).toBe('entering');
    expect(mocks.playbackStore.saveResumeFromAudioStatus).toHaveBeenCalled();
    expect(mocks.relaunch).toHaveBeenCalledWith({ args: ['.', '--echo-ultra-light-gpu-runtime'] });
    expect(mocks.exit).toHaveBeenCalledWith(0);
    expect(mocks.window.destroy).not.toHaveBeenCalled();
  });

  it('relaunches back into the normal GPU runtime when restoring the interface', async () => {
    mocks.isUltraLightGpuRuntime = true;
    const { enterUltraLightMode, restoreUltraLightMode } = await import('./UltraLightModeService');
    await enterUltraLightMode();

    await restoreUltraLightMode();

    expect(mocks.hideTaskbarHost).toHaveBeenCalled();
    expect(mocks.stopTaskbarHostAndWait).toHaveBeenCalled();
    expect(mocks.setTaskbarHostWindowMode).toHaveBeenLastCalledWith('taskbar');
    expect(mocks.relaunch).toHaveBeenCalledWith({ args: [] });
    expect(mocks.exit).toHaveBeenCalledWith(0);
    expect(mocks.stopTaskbarHostAndWait.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.relaunch.mock.invocationCallOrder[0]!,
    );
  });

  it('waits for the floating host to exit before relaunching the normal runtime', async () => {
    mocks.isUltraLightGpuRuntime = true;
    let finishHostStop!: () => void;
    mocks.stopTaskbarHostAndWait.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishHostStop = resolve;
    }));
    const { enterUltraLightMode, restoreUltraLightMode } = await import('./UltraLightModeService');
    await enterUltraLightMode();

    const restoring = restoreUltraLightMode();
    await Promise.resolve();

    expect(mocks.relaunch).not.toHaveBeenCalled();
    finishHostStop();
    await restoring;

    expect(mocks.setTaskbarHostWindowMode).toHaveBeenLastCalledWith('taskbar');
    expect(mocks.relaunch).toHaveBeenCalledWith({ args: [] });
  });

  it('stops the floating host before restoring a newly created main window', async () => {
    const { enterUltraLightMode, restoreUltraLightMode } = await import('./UltraLightModeService');
    await enterUltraLightMode();

    await restoreUltraLightMode();

    expect(mocks.hideTaskbarHost).toHaveBeenCalled();
    expect(mocks.stopTaskbarHostAndWait).toHaveBeenCalled();
    expect(mocks.setTaskbarHostWindowMode).toHaveBeenLastCalledWith('taskbar');
    expect(mocks.createMainWindow).toHaveBeenCalledTimes(1);
    expect(mocks.window.show).toHaveBeenCalled();
    expect(mocks.restoreDesktopLyricsWindowOnStartup).toHaveBeenCalled();
  });
});
