import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isSidebarRouteId } from '../../shared/types/sidebar';
import type {
  WorkshopThemeUiCapability,
} from '../../shared/types/workshop';
import type { PlaybackStatus } from '../../shared/types/playback';
import type { LibraryTrack } from '../../shared/types/library';
import { useOptionalPlaybackQueue } from '../stores/PlaybackQueueProvider';
import { useActiveWorkshopThemeBackground } from './useActiveWorkshopThemeBackground';
import { useActiveWorkshopThemeSelection } from './useActiveWorkshopThemeSelection';
import '../styles/workshop-ui-runtime.css';

const protocolVersion = 1;
const maximumCommandsPerSecond = 20;

type RuntimeCommand =
  | 'navigate'
  | 'play'
  | 'pause'
  | 'playPause'
  | 'previous'
  | 'next'
  | 'seek'
  | 'setVolume'
  | 'library:listTracks'
  | 'library:listLiked'
  | 'library:getLiked'
  | 'library:toggleLiked'
  | 'queue:get'
  | 'queue:playTrack'
  | 'queue:enqueueTrack'
  | 'queue:playItem'
  | 'queue:removeItem'
  | 'queue:clear'
  | 'window:minimize'
  | 'window:toggleMaximize'
  | 'window:toggleFullscreen'
  | 'window:close';

const capabilityByCommand: Record<RuntimeCommand, WorkshopThemeUiCapability> = {
  navigate: 'navigation',
  play: 'playback:control',
  pause: 'playback:control',
  playPause: 'playback:control',
  previous: 'playback:control',
  next: 'playback:control',
  seek: 'playback:control',
  setVolume: 'playback:control',
  'library:listTracks': 'library:read',
  'library:listLiked': 'library:read',
  'library:getLiked': 'library:read',
  'library:toggleLiked': 'library:control',
  'queue:get': 'queue:read',
  'queue:playTrack': 'queue:control',
  'queue:enqueueTrack': 'queue:control',
  'queue:playItem': 'queue:control',
  'queue:removeItem': 'queue:control',
  'queue:clear': 'queue:control',
  'window:minimize': 'window:control',
  'window:toggleMaximize': 'window:control',
  'window:toggleFullscreen': 'window:control',
  'window:close': 'window:control',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isRuntimeCommand = (value: unknown): value is RuntimeCommand =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(capabilityByCommand, value);

const boundedRequestId = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 && value.length <= 80 ? value : null;

const sanitizePlaybackStatus = (status: PlaybackStatus) => ({
  state: status.state,
  currentTrackId: status.currentTrackId,
  positionSeconds: Math.max(0, status.positionMs / 1000),
  durationSeconds: Math.max(0, status.durationMs / 1000),
  volume: typeof status.volume === 'number' ? status.volume : null,
});

const sanitizeTrack = (track: LibraryTrack) => ({
  id: track.id,
  mediaType: track.mediaType ?? 'local',
  title: track.title,
  artist: track.artist,
  album: track.album,
  albumArtist: track.albumArtist,
  trackNo: track.trackNo,
  discNo: track.discNo,
  year: track.year,
  genre: track.genre,
  durationSeconds: Math.max(0, track.duration),
  codec: track.codec,
  sampleRate: track.sampleRate,
  bitDepth: track.bitDepth,
  bitrate: track.bitrate,
  coverUrl: track.coverThumb,
  unavailable: track.unavailable === true,
});

const boundedString = (value: unknown, maximumLength = 200): string | null =>
  typeof value === 'string' && value.length > 0 && value.length <= maximumLength ? value : null;

const boundedInteger = (value: unknown, minimum: number, maximum: number, fallback: number): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum
    ? value
    : fallback;

const boundedTrackIds = (value: unknown): string[] => {
  if (!Array.isArray(value) || value.length > 200) return [];
  const ids = value.map((item) => boundedString(item, 160)).filter((item): item is string => item !== null);
  return ids.length === value.length ? [...new Set(ids)] : [];
};

const loadTrack = async (trackId: unknown): Promise<LibraryTrack> => {
  const id = boundedString(trackId, 160);
  const library = window.echo?.library;
  if (!id || !library?.getTrack) throw new Error('invalid-payload');
  const track = await library.getTrack(id);
  if (!track || track.unavailable) throw new Error('track-unavailable');
  return track;
};

const safeCommandError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : '';
  return [
    'invalid-payload',
    'track-unavailable',
    'library-unavailable',
    'queue-unavailable',
    'playback-unavailable',
    'window-control-unavailable',
    'command-unavailable',
  ].includes(message) ? message : 'command-failed';
};

const postToFrame = (frame: HTMLIFrameElement | null, message: unknown): void => {
  frame?.contentWindow?.postMessage(message, '*');
};

const readNumber = (value: unknown, minimum: number, maximum: number): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : null;

const runPlaybackCommand = async (
  command: RuntimeCommand,
  payload: Record<string, unknown>,
  playbackQueue: ReturnType<typeof useOptionalPlaybackQueue>,
): Promise<void> => {
  const playback = window.echo?.playback;
  if (!playback) {
    throw new Error('playback-unavailable');
  }
  if (command === 'seek') {
    const positionSeconds = readNumber(payload.positionSeconds, 0, 7 * 24 * 60 * 60);
    if (positionSeconds === null) throw new Error('invalid-payload');
    await playback.seek(positionSeconds);
    return;
  }
  if (command === 'setVolume') {
    const volume = readNumber(payload.volume, 0, 1);
    if (volume === null) throw new Error('invalid-payload');
    const settings = await window.echo?.app?.getSettings?.().catch(() => null);
    const effectiveVolume = settings?.fixedVolumeEnabled === true ? 1 : volume;
    const audio = window.echo?.audio;
    if (!audio?.setOutput) throw new Error('playback-unavailable');
    await audio.setOutput({ volume: effectiveVolume });
    await window.echo?.app?.setSettings?.({ playerVolume: effectiveVolume }).catch(() => undefined);
    return;
  }
  if (command === 'previous' || command === 'next') {
    if (!playbackQueue) throw new Error('queue-unavailable');
    if (command === 'previous') {
      if (!playbackQueue.canGoPrevious) throw new Error('command-unavailable');
      await playbackQueue.playPrevious();
    } else {
      if (!playbackQueue.canGoNext) throw new Error('command-unavailable');
      await playbackQueue.playNext();
    }
    return;
  }
  if (command === 'play' || command === 'pause') {
    await playback[command]();
    return;
  }
  if (command === 'playPause') {
    const status = await playback.getStatus();
    await (status.state === 'playing' || status.state === 'loading' ? playback.pause() : playback.play());
    return;
  }
  throw new Error('command-unavailable');
};

const runWindowCommand = async (command: RuntimeCommand): Promise<void> => {
  const app = window.echo?.app;
  if (!app) throw new Error('window-control-unavailable');
  switch (command) {
    case 'window:minimize': await app.minimize(); return;
    case 'window:toggleMaximize': await app.toggleMaximize(); return;
    case 'window:toggleFullscreen': await app.toggleFullscreen(); return;
    case 'window:close': await app.close(); return;
    default: throw new Error('command-unavailable');
  }
};

export const WorkshopUiRuntimeHost = (): JSX.Element | null => {
  const background = useActiveWorkshopThemeBackground();
  const selected = useActiveWorkshopThemeSelection(background);
  const playbackQueue = useOptionalPlaybackQueue();
  const runtime = background?.runtime ?? null;
  const [dismissed, setDismissed] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const rateRef = useRef({ startedAt: 0, count: 0 });
  const capabilitySet = useMemo(() => new Set(runtime?.capabilities ?? []), [runtime?.capabilities]);

  useEffect(() => setDismissed(false), [runtime?.entryUrl]);

  useEffect(() => {
    const workshop = window.echo?.workshop;
    const active = Boolean(selected && runtime && !dismissed);
    if (!workshop?.setUiRuntimeActive) return undefined;
    void workshop.setUiRuntimeActive(active).catch(() => undefined);
    const unsubscribe = active
      ? workshop.onUiRuntimeEmergencyExit?.(() => setDismissed(true))
      : undefined;
    return () => {
      unsubscribe?.();
      void workshop.setUiRuntimeActive(false).catch(() => undefined);
    };
  }, [dismissed, runtime, selected]);

  const sendState = useCallback(async (): Promise<void> => {
    if (!capabilitySet.has('playback:read') && !capabilitySet.has('queue:read')) return;
    try {
      const status = capabilitySet.has('playback:read')
        ? await window.echo?.playback?.getStatus()
        : null;
      postToFrame(iframeRef.current, {
        type: 'echo:workshop-ui:state',
        protocolVersion,
        ...(status ? { playback: sanitizePlaybackStatus(status) } : {}),
        ...(playbackQueue && capabilitySet.has('queue:read') ? {
          currentTrack: playbackQueue.currentTrack ? sanitizeTrack(playbackQueue.currentTrack) : null,
          queue: {
            currentQueueId: playbackQueue.currentQueueId,
            canGoPrevious: playbackQueue.canGoPrevious,
            canGoNext: playbackQueue.canGoNext,
            items: playbackQueue.items.slice(0, 500).map((item) => ({
              queueId: item.queueId,
              track: sanitizeTrack(item.track),
            })),
          },
        } : {}),
      });
    } catch {
      // A missing status snapshot does not grant the runtime any fallback authority.
    }
  }, [capabilitySet, playbackQueue]);

  const sendInit = useCallback((): void => {
    if (!background || !runtime) return;
    postToFrame(iframeRef.current, {
      type: 'echo:workshop-ui:init',
      protocolVersion,
      theme: {
        id: background.contentId,
        version: background.version,
      },
      capabilities: [...runtime.capabilities],
    });
    void sendState();
  }, [background, runtime, sendState]);

  useEffect(() => {
    if (!selected || !runtime || dismissed) return undefined;
    const timer = capabilitySet.has('playback:read') || capabilitySet.has('queue:read')
      ? window.setInterval(() => void sendState(), 1000)
      : null;
    const onMessage = (event: MessageEvent): void => {
      if (event.source !== iframeRef.current?.contentWindow || !isRecord(event.data)) return;
      if (event.data.type === 'echo:workshop-ui:ready') {
        sendInit();
        return;
      }
      if (event.data.type !== 'echo:workshop-ui:command') return;
      const requestId = boundedRequestId(event.data.requestId);
      const command = event.data.command;
      if (!requestId || !isRuntimeCommand(command)) return;
      const now = performance.now();
      if (now - rateRef.current.startedAt >= 1000) {
        rateRef.current = { startedAt: now, count: 0 };
      }
      rateRef.current.count += 1;
      const reply = (ok: boolean, value?: unknown, error?: string): void => postToFrame(iframeRef.current, {
        type: 'echo:workshop-ui:result',
        protocolVersion,
        requestId,
        ok,
        ...(value !== undefined ? { value } : {}),
        ...(error ? { error } : {}),
      });
      if (rateRef.current.count > maximumCommandsPerSecond) {
        reply(false, undefined, 'rate-limited');
        return;
      }
      if (!capabilitySet.has(capabilityByCommand[command])) {
        reply(false, undefined, 'capability-denied');
        return;
      }
      const payload = isRecord(event.data.payload) ? event.data.payload : {};
      const operation = Promise.resolve().then(async (): Promise<unknown> => {
        if (command === 'navigate') {
            const routeId = payload.routeId;
            if (!(isSidebarRouteId(routeId) || routeId === 'lyrics')) {
              throw new Error('invalid-payload');
            }
            window.dispatchEvent(new CustomEvent('app:navigate:route', { detail: routeId }));
            if (payload.dismissRuntime === true) setDismissed(true);
            return null;
        }
        if (command.startsWith('window:')) {
          await runWindowCommand(command);
          return null;
        }
        if (command === 'library:listTracks') {
          const library = window.echo?.library;
          if (!library?.getTracks) throw new Error('library-unavailable');
          const page = boundedInteger(payload.page, 1, 100000, 1);
          const pageSize = boundedInteger(payload.pageSize, 1, 100, 50);
          const search = typeof payload.search === 'string' && payload.search.length <= 200
            ? payload.search.trim()
            : '';
          const result = await library.getTracks({ page, pageSize, ...(search ? { search } : {}) });
          return {
            page: result.page,
            pageSize: result.pageSize,
            total: result.total,
            hasMore: result.hasMore,
            items: result.items.map(sanitizeTrack),
          };
        }
        if (command === 'library:getLiked') {
          const library = window.echo?.library;
          const trackIds = boundedTrackIds(payload.trackIds);
          if (!library?.getLikedTrackIds || trackIds.length === 0) throw new Error('invalid-payload');
          return library.getLikedTrackIds(trackIds);
        }
        if (command === 'library:listLiked') {
          const library = window.echo?.library;
          if (!library?.getLikedTracks) throw new Error('library-unavailable');
          const page = boundedInteger(payload.page, 1, 100000, 1);
          const pageSize = boundedInteger(payload.pageSize, 1, 100, 100);
          const search = typeof payload.search === 'string' && payload.search.length <= 200
            ? payload.search.trim()
            : '';
          const result = await library.getLikedTracks({ page, pageSize, ...(search ? { search } : {}) });
          return {
            page: result.page,
            pageSize: result.pageSize,
            total: result.total,
            hasMore: result.hasMore,
            items: result.items.flatMap((item) => item.track && !item.unavailable ? [sanitizeTrack(item.track)] : []),
          };
        }
        if (command === 'library:toggleLiked') {
          const library = window.echo?.library;
          const trackId = boundedString(payload.trackId, 160);
          if (!library?.toggleTrackLiked || !trackId) throw new Error('invalid-payload');
          const result = await library.toggleTrackLiked(trackId);
          window.dispatchEvent(new Event('liked:tracks-changed'));
          return { trackId, liked: result.liked };
        }
        if (command === 'queue:get') {
          if (!playbackQueue) throw new Error('queue-unavailable');
          return {
            currentQueueId: playbackQueue.currentQueueId,
            items: playbackQueue.items.slice(0, 500).map((item) => ({
              queueId: item.queueId,
              track: sanitizeTrack(item.track),
            })),
          };
        }
        if (command === 'queue:playTrack') {
          if (!playbackQueue) throw new Error('queue-unavailable');
          const track = await loadTrack(payload.trackId);
          const requestedIds = boundedTrackIds(payload.queueTrackIds);
          const resolvedQueue = requestedIds.length > 0
            ? (await Promise.all(requestedIds.map((id) => window.echo?.library?.getTrack(id))))
              .filter((item): item is LibraryTrack => item !== null && item !== undefined && item.unavailable !== true)
            : [track];
          if (!resolvedQueue.some((item) => item.id === track.id)) resolvedQueue.unshift(track);
          await playbackQueue.playTrack(track, {
            replaceQueueWith: resolvedQueue,
            source: { type: 'manual', label: '创意工坊 UI' },
          });
          return { track: sanitizeTrack(track) };
        }
        if (command === 'queue:enqueueTrack') {
          if (!playbackQueue) throw new Error('queue-unavailable');
          const track = await loadTrack(payload.trackId);
          playbackQueue.appendToQueue(track, { type: 'manual', label: '创意工坊 UI' });
          return { track: sanitizeTrack(track) };
        }
        if (command === 'queue:playItem') {
          if (!playbackQueue) throw new Error('queue-unavailable');
          const queueId = boundedString(payload.queueId, 160);
          if (!queueId || !playbackQueue.items.some((item) => item.queueId === queueId)) throw new Error('invalid-payload');
          await playbackQueue.playQueueItem(queueId);
          return null;
        }
        if (command === 'queue:removeItem') {
          if (!playbackQueue) throw new Error('queue-unavailable');
          const queueId = boundedString(payload.queueId, 160);
          if (!queueId || !playbackQueue.items.some((item) => item.queueId === queueId)) throw new Error('invalid-payload');
          playbackQueue.removeQueueItem(queueId);
          return null;
        }
        if (command === 'queue:clear') {
          if (!playbackQueue) throw new Error('queue-unavailable');
          playbackQueue.clearQueue();
          return null;
        }
        await runPlaybackCommand(command, payload, playbackQueue);
        return null;
      });
      operation
        .then((value) => {
          reply(true, value);
          void sendState();
        })
        .catch((error) => reply(false, undefined, safeCommandError(error)));
    };
    const onEmergencyExit = (event: KeyboardEvent): void => {
      if (event.ctrlKey && event.shiftKey && event.key === 'F12') {
        event.preventDefault();
        setDismissed(true);
      }
    };
    window.addEventListener('message', onMessage);
    window.addEventListener('keydown', onEmergencyExit, true);
    return () => {
      if (timer !== null) window.clearInterval(timer);
      window.removeEventListener('message', onMessage);
      window.removeEventListener('keydown', onEmergencyExit, true);
    };
  }, [capabilitySet, dismissed, playbackQueue, runtime, selected, sendInit, sendState]);

  if (!selected || !runtime || dismissed) return null;

  return (
    <section className="workshop-ui-runtime" aria-label="创意工坊自定义界面">
      <iframe
        ref={iframeRef}
        className="workshop-ui-runtime__frame"
        src={runtime.entryUrl}
        title={`创意工坊界面：${background?.contentId ?? ''}`}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        onLoad={sendInit}
      />
      <button
        className="workshop-ui-runtime__escape"
        type="button"
        title="退出本次自定义 UI（Ctrl+Shift+F12）"
        onClick={() => setDismissed(true)}
      >
        退出自定义 UI
      </button>
    </section>
  );
};
