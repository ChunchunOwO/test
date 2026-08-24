import { app, BrowserWindow, globalShortcut, nativeTheme } from 'electron';
import type { AudioStatus } from '../../shared/types/audio';
import type { GlobalShortcutAction } from '../../shared/types/globalShortcuts';
import type { PersistedPlaybackSessionV1, PersistedQueueItem, PlaybackOrderMode } from '../../shared/types/playback';
import type { UltraLightModePhase, UltraLightModeStatus } from '../../shared/types/ultraLightMode';
import type { SmtcCommand } from '../../shared/types/smtc';
import { getAudioSession, getPlaybackSessionStore } from '../audioPublicApi';
import { closeDevConsoleWindow } from '../diagnostics/DevConsoleService';
import { getLibraryService } from '../library/LibraryService';
import { getAppSettings } from './appSettings';
import { resolveTaskbarCoverPath } from './taskbarCoverPath';
import {
  hideTaskbarHost,
  setTaskbarHostWindowMode,
  showTaskbarHost,
  startTaskbarHost,
  stopTaskbarHostAndWait,
  updateTaskbarHostState,
} from './taskbarHostProcess';
import { getMainWindow } from './windowManager';
import {
  createUltraLightGpuRuntimeArgs,
  isUltraLightGpuRuntime,
  prepareNormalRuntimeRelaunch,
} from './ultraLightGpuRuntime';

export const ultraLightModeRestoreAccelerator = 'CommandOrControl+Shift+E';

const fallbackMediaShortcuts = new Map<string, GlobalShortcutAction>([
  ['MediaPlayPause', 'playPause'],
  ['MediaPreviousTrack', 'previousTrack'],
  ['MediaNextTrack', 'nextTrack'],
  ['MediaStop', 'stop'],
]);

const isLocalQueueItem = (item: PersistedQueueItem): boolean =>
  item.track.unavailable !== true &&
  (item.track.mediaType === undefined || item.track.mediaType === 'local') &&
  typeof item.track.path === 'string' &&
  item.track.path.trim().length > 0;

const replayGainFromQueueItem = (item: PersistedQueueItem) => {
  const replayGain = {
    trackGainDb: item.track.replayGainTrackGainDb ?? null,
    albumGainDb: item.track.replayGainAlbumGainDb ?? null,
    trackPeak: item.track.replayGainTrackPeak ?? null,
    albumPeak: item.track.replayGainAlbumPeak ?? null,
    integratedLufs: item.track.replayGainIntegratedLufs ?? null,
  };
  return Object.values(replayGain).some((value) => typeof value === 'number' && Number.isFinite(value))
    ? replayGain
    : undefined;
};

const findCurrentQueueIndex = (session: PersistedPlaybackSessionV1): number => {
  const queueIndex = session.currentQueueId
    ? session.items.findIndex((item) => item.queueId === session.currentQueueId)
    : -1;
  if (queueIndex >= 0) {
    return queueIndex;
  }
  return session.currentTrackId
    ? session.items.findIndex((item) => item.track.id === session.currentTrackId)
    : -1;
};

const selectAdjacentItem = (
  session: PersistedPlaybackSessionV1,
  direction: 'previous' | 'next',
): PersistedQueueItem | null => {
  const playableItems = session.items.filter(isLocalQueueItem);
  if (playableItems.length === 0) {
    return null;
  }

  const currentIndex = findCurrentQueueIndex(session);
  const current = currentIndex >= 0 ? session.items[currentIndex] ?? null : null;
  if (session.mode.isShuffleEnabled) {
    const candidates = playableItems.filter((item) => item.queueId !== current?.queueId);
    return candidates.length > 0
      ? candidates[Math.floor(Math.random() * candidates.length)] ?? null
      : playableItems[0] ?? null;
  }

  if (direction === 'previous') {
    for (let index = currentIndex - 1; index >= 0; index -= 1) {
      if (isLocalQueueItem(session.items[index]!)) {
        return session.items[index]!;
      }
    }
    if (session.mode.repeatMode === 'all') {
      return [...session.items].reverse().find(isLocalQueueItem) ?? null;
    }
    return null;
  }

  for (let index = Math.max(-1, currentIndex) + 1; index < session.items.length; index += 1) {
    if (isLocalQueueItem(session.items[index]!)) {
      return session.items[index]!;
    }
  }
  if (session.mode.repeatMode === 'all') {
    return session.items.find(isLocalQueueItem) ?? null;
  }
  return currentIndex < 0 ? playableItems[0] ?? null : null;
};

class UltraLightModeService {
  private phase: UltraLightModePhase = 'inactive';
  private error: string | null = null;
  private readonly ownedShortcuts = new Set<string>();
  private statusListener: ((status: AudioStatus) => void) | null = null;
  private lastPersistedQueueId: string | null = null;
  private operationLane: Promise<void> = Promise.resolve();
  private volumeBeforeMute = 1;
  private uiDestroyTimer: ReturnType<typeof setTimeout> | null = null;
  private miniPlayerRefreshTimer: ReturnType<typeof setInterval> | null = null;

  getStatus(): UltraLightModeStatus {
    return {
      phase: this.phase,
      active: this.phase !== 'inactive',
      restoreAccelerator: ultraLightModeRestoreAccelerator,
      error: this.error,
    };
  }

  isActive(): boolean {
    return this.phase !== 'inactive';
  }

  async enter(): Promise<UltraLightModeStatus> {
    if (this.isActive()) {
      return this.getStatus();
    }
    if (this.phase === 'restoring') {
      return this.fail('ultra_light_mode_restore_in_progress');
    }

    if (getAppSettings().ultraLightGpuDisabled === true && !isUltraLightGpuRuntime()) {
      return this.relaunchIntoGpuDisabledRuntime();
    }

    this.phase = 'entering';
    this.error = null;
    if (!this.registerRestoreShortcut()) {
      return this.fail('ultra_light_mode_restore_shortcut_unavailable');
    }

    this.registerFallbackMediaShortcuts();
    const { ensureTray } = await import('./tray');
    ensureTray();
    const audioSession = getAudioSession();
    try {
      getPlaybackSessionStore().saveResumeFromAudioStatus(audioSession.getStatus());
    } catch (error) {
      console.warn('[UltraLightMode] failed to persist playback resume before UI unload', error);
    }
    this.bindAudioStatusPersistence();
    this.phase = 'active';

    if (isUltraLightGpuRuntime()) {
      const resume = getPlaybackSessionStore().load()?.resume;
      if (resume?.state === 'playing') {
        try {
          await audioSession.play();
        } catch (error) {
          console.warn('[UltraLightMode] failed to resume playback after GPU-runtime handoff', error);
        }
      }
    }

    this.uiDestroyTimer = setTimeout(() => {
      this.uiDestroyTimer = null;
      if (this.phase === 'active') {
        void this.destroyAllUiWindows();
      }
    }, 80);
    this.uiDestroyTimer.unref?.();
    return this.getStatus();
  }

  async restore(): Promise<UltraLightModeStatus> {
    if (this.phase === 'inactive') {
      const window = getMainWindow();
      if (window && !window.isDestroyed()) {
        window.show();
        window.focus();
      }
      return this.getStatus();
    }
    if (this.phase === 'restoring') {
      return this.getStatus();
    }

    this.phase = 'restoring';
    this.error = null;
    if (this.uiDestroyTimer) {
      clearTimeout(this.uiDestroyTimer);
      this.uiDestroyTimer = null;
    }
    try {
      const audioSession = getAudioSession();
      getPlaybackSessionStore().saveResumeFromAudioStatus(audioSession.getStatus());
      // The native floating player is a separate process. Always stop it before
      // either recreating the renderer or relaunching out of the GPU-disabled
      // runtime; app.exit() does not run the normal cleanup path.
      this.unbindAudioStatusPersistence();
      await this.stopNativeMiniPlayer();
      this.unregisterOwnedShortcuts();
      if (isUltraLightGpuRuntime()) {
        app.relaunch({ args: prepareNormalRuntimeRelaunch() });
        app.exit(0);
        return this.getStatus();
      }
      const { createMainWindow } = await import('./createMainWindow');
      const existingWindow = getMainWindow();
      if (existingWindow && !existingWindow.isDestroyed()) {
        existingWindow.show();
        existingWindow.focus();
        void this.restoreAuxiliaryWindows();
      } else {
        const window = createMainWindow();
        // createMainWindow owns its first visible frame. Showing a newly-created
        // BrowserWindow before ready-to-show exposes Chromium's blank surface.
        window.once('ready-to-show', () => {
          if (!window.isDestroyed()) {
            window.show();
            window.focus();
          }
          void this.restoreAuxiliaryWindows();
        });
      }
      this.phase = 'inactive';
      const { ensureTray } = await import('./tray');
      ensureTray();
      return this.getStatus();
    } catch (error) {
      this.phase = 'active';
      this.error = error instanceof Error ? error.message : String(error);
      return this.getStatus();
    }
  }

  dispatch(action: GlobalShortcutAction): Promise<void> {
    if (!this.isActive()) {
      return Promise.resolve();
    }

    if (
      action === 'showMainWindow' ||
      action === 'openAudioSettings' ||
      action === 'openPlaybackQueue' ||
      action === 'openSearch' ||
      action === 'openSettings' ||
      action === 'openLiked' ||
      action === 'toggleLyrics' ||
      action === 'locateCurrentTrack' ||
      action === 'revealCurrentTrackInFolder'
    ) {
      return this.restore().then(() => undefined);
    }

    const operation = async (): Promise<void> => {
      const audioSession = getAudioSession();
      const status = audioSession.getStatus();
      switch (action) {
        case 'playPause':
          if (status.state === 'playing' || status.state === 'loading') {
            await audioSession.pause();
          } else {
            await audioSession.play();
          }
          return;
        case 'stop':
          await audioSession.stop();
          return;
        case 'nextTrack':
          await this.playAdjacent('next');
          return;
        case 'previousTrack':
          if (status.positionSeconds > 5) {
            await audioSession.seek(0);
          } else {
            await this.playAdjacent('previous');
          }
          return;
        case 'seekBackward':
          await audioSession.seek(Math.max(0, status.positionSeconds - 10));
          return;
        case 'seekForward':
          await audioSession.seek(Math.max(0, status.positionSeconds + 10));
          return;
        case 'volumeUp':
          await audioSession.setOutput({ volume: Math.min(1, status.volume + 0.05) });
          return;
        case 'volumeDown':
          await audioSession.setOutput({ volume: Math.max(0, status.volume - 0.05) });
          return;
        case 'toggleMute':
          if (status.volume > 0) {
            this.volumeBeforeMute = status.volume;
            await audioSession.setOutput({ volume: 0 });
          } else {
            await audioSession.setOutput({ volume: Math.max(0.05, this.volumeBeforeMute) });
          }
          return;
        case 'speedUp':
          await audioSession.setOutput({ playbackRate: Math.min(2, (status.playbackRate ?? 1) + 0.1) });
          return;
        case 'speedDown':
          await audioSession.setOutput({ playbackRate: Math.max(0.5, (status.playbackRate ?? 1) - 0.1) });
          return;
        case 'resetPlaybackSpeed':
          await audioSession.setOutput({ playbackRate: 1 });
          return;
        case 'replayCurrentTrack':
          await audioSession.seek(0);
          return;
        case 'toggleCurrentTrackLiked':
          if (status.currentTrackId) getLibraryService().toggleTrackLiked(status.currentTrackId);
          return;
        case 'toggleShuffle':
          this.updatePlaybackMode((mode) => ({ ...mode, isShuffleEnabled: !mode.isShuffleEnabled }));
          return;
        case 'cycleRepeatMode':
          this.updatePlaybackMode((mode) => ({ ...mode, repeatMode: mode.repeatMode === 'one' ? 'off' : 'one' }));
          return;
        default:
          return;
      }
    };

    const queued = this.operationLane.then(operation, operation);
    this.operationLane = queued.catch((error) => {
      console.warn(`[UltraLightMode] shortcut ${action} failed`, error);
    });
    return queued;
  }

  dispatchSmtc(command: SmtcCommand): Promise<void> {
    if (typeof command === 'object') {
      const operation = () => getAudioSession().seek(Math.max(0, command.positionSeconds)).then(() => undefined);
      const queued = this.operationLane.then(operation, operation);
      this.operationLane = queued.catch((error) => {
        console.warn('[UltraLightMode] SMTC seek failed', error);
      });
      return queued;
    }
    if (command === 'previous') return this.dispatch('previousTrack');
    if (command === 'next') return this.dispatch('nextTrack');
    if (command === 'stop') return this.dispatch('stop');
    if (command === 'playPause') return this.dispatch('playPause');

    const status = getAudioSession().getStatus();
    if (command === 'play' && status.state === 'paused') return this.dispatch('playPause');
    if (command === 'pause' && (status.state === 'playing' || status.state === 'loading')) return this.dispatch('playPause');
    return Promise.resolve();
  }

  cyclePlaybackOrder(): Promise<void> {
    const operation = async (): Promise<void> => {
      const store = getPlaybackSessionStore();
      const session = store.load();
      if (!session) return;
      const current: PlaybackOrderMode = session.mode.isShuffleEnabled
        ? 'shuffle'
        : session.mode.repeatMode === 'one'
          ? 'repeat-one'
          : 'sequential';
      const next: PlaybackOrderMode = current === 'sequential'
        ? 'shuffle'
        : current === 'shuffle'
          ? 'repeat-one'
          : 'sequential';
      store.save({
        ...session,
        mode: {
          ...session.mode,
          isShuffleEnabled: next === 'shuffle',
          repeatMode: next === 'repeat-one' ? 'one' : 'off',
        },
      }, { preserveRevision: true });
      this.refreshNativeMiniPlayer();
    };
    const queued = this.operationLane.then(operation, operation);
    this.operationLane = queued.catch((error) => console.warn('[UltraLightMode] playback order change failed', error));
    return queued;
  }

  playQueueItemAt(index: number): Promise<void> {
    const operation = async (): Promise<void> => {
      const session = getPlaybackSessionStore().load();
      const target = session?.items.filter(isLocalQueueItem)[index] ?? null;
      if (!session || !target || !isLocalQueueItem(target)) return;
      await this.playQueueItem(session, target);
    };
    const queued = this.operationLane.then(operation, operation);
    this.operationLane = queued.catch((error) => console.warn('[UltraLightMode] queue item selection failed', error));
    return queued;
  }

  private fail(message: string): UltraLightModeStatus {
    this.unregisterOwnedShortcuts();
    this.phase = 'inactive';
    this.error = message;
    return this.getStatus();
  }

  private relaunchIntoGpuDisabledRuntime(): UltraLightModeStatus {
    try {
      const audioSession = getAudioSession();
      getPlaybackSessionStore().saveResumeFromAudioStatus(audioSession.getStatus());
      this.phase = 'entering';
      this.error = null;
      app.relaunch({ args: createUltraLightGpuRuntimeArgs() });
      app.exit(0);
      return this.getStatus();
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : String(error));
    }
  }

  private registerRestoreShortcut(): boolean {
    try {
      if (globalShortcut.isRegistered(ultraLightModeRestoreAccelerator)) {
        return false;
      }
      if (!globalShortcut.register(ultraLightModeRestoreAccelerator, () => {
        void this.restore();
      })) {
        return false;
      }
      this.ownedShortcuts.add(ultraLightModeRestoreAccelerator);
      return true;
    } catch {
      return false;
    }
  }

  private registerFallbackMediaShortcuts(): void {
    for (const [accelerator, action] of fallbackMediaShortcuts) {
      try {
        if (globalShortcut.isRegistered(accelerator)) {
          continue;
        }
        if (globalShortcut.register(accelerator, () => {
          void this.dispatch(action);
        })) {
          this.ownedShortcuts.add(accelerator);
        }
      } catch {
        // Media keys are best-effort. Restore remains guaranteed by the dedicated shortcut and tray.
      }
    }
  }

  private unregisterOwnedShortcuts(): void {
    for (const accelerator of this.ownedShortcuts) {
      try {
        globalShortcut.unregister(accelerator);
      } catch {
      }
    }
    this.ownedShortcuts.clear();
  }

  private async playAdjacent(direction: 'previous' | 'next'): Promise<void> {
    const store = getPlaybackSessionStore();
    const session = store.load();
    if (!session) {
      return;
    }
    const target = selectAdjacentItem(session, direction);
    if (!target) {
      return;
    }

    await this.playQueueItem(session, target);
  }

  private updatePlaybackMode(
    update: (mode: PersistedPlaybackSessionV1['mode']) => PersistedPlaybackSessionV1['mode'],
  ): void {
    const store = getPlaybackSessionStore();
    const session = store.load();
    if (!session) return;
    store.save({ ...session, mode: update(session.mode) }, { preserveRevision: true });
    this.refreshNativeMiniPlayer();
  }

  private async playQueueItem(session: PersistedPlaybackSessionV1, target: PersistedQueueItem): Promise<void> {
    const audioSession = getAudioSession();
    const backendQueue = session.items.filter(isLocalQueueItem).map((item) => ({
      itemId: item.queueId,
      trackId: item.track.id,
      filePath: item.track.path,
      sampleRate: item.track.sampleRate ?? undefined,
      startSeconds: 0,
      metadata: {
        title: item.track.title,
        artist: item.track.artist,
        album: item.track.album,
        albumArtist: item.track.albumArtist,
        coverUrl: item.track.coverThumb,
      },
    }));
    await audioSession.syncQueueToBackend(backendQueue, session.mode.repeatMode, target.queueId);
    await audioSession.playLocalFile({
      filePath: target.track.path,
      trackId: target.track.id,
      metadata: {
        title: target.track.title,
        artist: target.track.artist,
        album: target.track.album,
        albumArtist: target.track.albumArtist,
        coverUrl: target.track.coverThumb,
      },
      replayGain: replayGainFromQueueItem(target),
    });
    this.persistCurrentQueueItem(session, target);
  }

  private persistCurrentQueueItem(session: PersistedPlaybackSessionV1, target: PersistedQueueItem): void {
    this.lastPersistedQueueId = target.queueId;
    getPlaybackSessionStore().save({
      ...session,
      currentQueueId: target.queueId,
      currentTrackId: target.track.id,
      lastPlayedTrack: target.track,
      resume: null,
    }, { preserveRevision: true });
  }

  private bindAudioStatusPersistence(): void {
    if (this.statusListener) {
      return;
    }
    this.statusListener = (status: AudioStatus): void => {
      if (!this.isActive()) {
        return;
      }
      this.publishNativeMiniPlayerState(status);
      if (!status.currentTrackId) return;
      const store = getPlaybackSessionStore();
      const session = store.load();
      const target = session?.items.find((item) => item.track.id === status.currentTrackId) ?? null;
      if (!session || !target || target.queueId === this.lastPersistedQueueId) {
        return;
      }
      try {
        this.persistCurrentQueueItem(session, target);
      } catch (error) {
        console.warn('[UltraLightMode] failed to persist host queue advance', error);
      }
    };
    getAudioSession().on('status', this.statusListener);
    this.startNativeMiniPlayer();
  }

  private unbindAudioStatusPersistence(): void {
    if (!this.statusListener) {
      return;
    }
    getAudioSession().off('status', this.statusListener);
    this.statusListener = null;
    this.lastPersistedQueueId = null;
    if (this.miniPlayerRefreshTimer) {
      clearInterval(this.miniPlayerRefreshTimer);
      this.miniPlayerRefreshTimer = null;
    }
  }

  refreshNativeMiniPlayer(): void {
    if (!this.isActive()) return;
    this.publishNativeMiniPlayerState(getAudioSession().getStatus());
  }

  private startNativeMiniPlayer(): void {
    setTaskbarHostWindowMode('ultra-light-floating');
    this.refreshNativeMiniPlayer();
    showTaskbarHost();
    startTaskbarHost();
    if (!this.miniPlayerRefreshTimer) {
      this.miniPlayerRefreshTimer = setInterval(() => this.refreshNativeMiniPlayer(), 1_000);
      this.miniPlayerRefreshTimer.unref?.();
    }
  }

  private async stopNativeMiniPlayer(): Promise<void> {
    // A floating UltraLight host is not reusable as a normal taskbar host.
    // Reusing it can make Windows retain its popup bounds and surface a blank
    // full-screen native window during restore. A normal taskbar player, when
    // enabled, is started cleanly by the restored main window.
    hideTaskbarHost();
    await stopTaskbarHostAndWait();
    setTaskbarHostWindowMode('taskbar');
  }

  private publishNativeMiniPlayerState(status: AudioStatus): void {
    const track = status.currentTrackId ? getLibraryService().getTrack(status.currentTrackId) : null;
    const session = getPlaybackSessionStore().load();
    const queueItems = session?.items.filter(isLocalQueueItem) ?? [];
    const queueCurrentIndex = queueItems.findIndex((item) => item.queueId === session?.currentQueueId || item.track.id === status.currentTrackId);
    const playbackOrder = session?.mode.isShuffleEnabled
      ? '随机播放'
      : session?.mode.repeatMode === 'one'
        ? '单曲循环'
        : '顺序播放';
    updateTaskbarHostState({
      title: track?.title?.trim() || status.currentTrackTitle?.trim() || 'No Track',
      artist: track?.artist?.trim() || track?.albumArtist?.trim() || status.currentTrackArtist?.trim() || status.currentTrackAlbumArtist?.trim() || '',
      playing: status.state === 'playing' || status.state === 'loading',
      position: status.positionSeconds || 0,
      duration: status.durationSeconds || 0,
      coverPath: resolveTaskbarCoverPath(track?.coverId),
      lyrics: '',
      queueText: queueItems.slice(0, 12).map((item) => `${item.track.title} · ${item.track.artist}`).join('\n'),
      queueCurrentIndex,
      playbackOrder,
      playbackOrderMode: session?.mode.isShuffleEnabled
        ? 'shuffle'
        : session?.mode.repeatMode === 'one'
          ? 'repeat-one'
          : 'sequential',
      colorScheme: nativeTheme.shouldUseDarkColors ? 'dark' : 'light',
      volume: Math.max(0, Math.min(1, status.volume)),
    });
  }

  private async destroyAllUiWindows(): Promise<void> {
    try {
      closeDevConsoleWindow();
      const [{ closeDesktopLyricsWindow }, { closeMiniPlayerWindow }, { closePetWindow }] = await Promise.all([
        import('./desktopLyricsWindow'),
        import('./miniPlayerWindow'),
        import('./petWindow'),
      ]);
      closeDesktopLyricsWindow();
      closeMiniPlayerWindow();
      closePetWindow();
    } catch (error) {
      console.warn('[UltraLightMode] auxiliary UI cleanup was incomplete', error);
    }

    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.destroy();
      }
    }
  }

  private async restoreAuxiliaryWindows(): Promise<void> {
    const [{ restoreDesktopLyricsWindowOnStartup }, { restoreMiniPlayerWindowOnStartup }, { restorePetWindowOnStartup }] = await Promise.all([
      import('./desktopLyricsWindow'),
      import('./miniPlayerWindow'),
      import('./petWindow'),
    ]);
    restoreDesktopLyricsWindowOnStartup();
    restoreMiniPlayerWindowOnStartup();
    restorePetWindowOnStartup();
  }
}

const ultraLightModeService = new UltraLightModeService();

export const getUltraLightModeStatus = (): UltraLightModeStatus => ultraLightModeService.getStatus();
export const isUltraLightModeActive = (): boolean => ultraLightModeService.isActive();
export const enterUltraLightMode = (): Promise<UltraLightModeStatus> => ultraLightModeService.enter();
export const restoreUltraLightMode = (): Promise<UltraLightModeStatus> => ultraLightModeService.restore();
export const dispatchUltraLightModeAction = (action: GlobalShortcutAction): Promise<void> => ultraLightModeService.dispatch(action);
export const dispatchUltraLightModeSmtcCommand = (command: SmtcCommand): Promise<void> => ultraLightModeService.dispatchSmtc(command);
export const refreshUltraLightModeMiniPlayer = (): void => ultraLightModeService.refreshNativeMiniPlayer();
export const cycleUltraLightModePlaybackOrder = (): Promise<void> => ultraLightModeService.cyclePlaybackOrder();
export const playUltraLightModeQueueItemAt = (index: number): Promise<void> => ultraLightModeService.playQueueItemAt(index);
