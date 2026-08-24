import type { AudioStatus } from '../../shared/types/audio';
import type { PlaybackStatus } from '../../shared/types/playback';
import type { PlaybackStatusSnapshot } from './playbackStatusStore';

const joinPart = (value: string | number | boolean | null | undefined): string =>
  value === null || value === undefined ? '' : String(value);

const automixUiKey = (audioStatus: AudioStatus | null): string => {
  const automix = audioStatus?.automix;
  if (!automix) {
    return '';
  }

  return [
    joinPart(automix.enabled),
    joinPart(automix.active),
    joinPart(automix.mode),
    joinPart(automix.runtimeState),
    joinPart(automix.handoffProfile),
    joinPart(automix.transitionMode),
    joinPart(automix.overlapSeconds),
    joinPart(automix.automixBypassed),
    joinPart(automix.transitionStartsInSeconds),
  ].join('\u001f');
};

const audioStatusChromeKey = (audioStatus: AudioStatus | null): string => {
  if (!audioStatus) {
    return '';
  }

  return [
    joinPart(audioStatus.state),
    joinPart(audioStatus.currentTrackId),
    joinPart(audioStatus.currentFilePath),
    joinPart(Math.round((audioStatus.durationSeconds ?? 0) * 1000)),
    joinPart(audioStatus.volume),
    joinPart(audioStatus.error),
    joinPart(audioStatus.playbackRate),
    joinPart(audioStatus.outputMode),
    joinPart(audioStatus.outputDeviceId),
    joinPart(audioStatus.outputDeviceName),
    joinPart(audioStatus.eqEnabled),
    joinPart(audioStatus.dspActive),
    joinPart(audioStatus.clippingRisk),
    joinPart(audioStatus.dspClippingRisk),
    joinPart(audioStatus.outputBackend),
    joinPart(audioStatus.sharedBackend),
    joinPart(audioStatus.activeOutputBackendImpl),
    audioStatus.warnings?.join('\u001f') ?? '',
  ].join('\u0001');
};

const playbackStatusChromeKey = (playbackStatus: PlaybackStatus | null): string => {
  if (!playbackStatus) {
    return '';
  }

  return [
    joinPart(playbackStatus.state),
    joinPart(playbackStatus.currentTrackId),
    joinPart(playbackStatus.filePath),
    joinPart(Math.round(playbackStatus.durationMs)),
  ].join('\u0001');
};

export const getPlaybackChromeRevision = (snapshot: PlaybackStatusSnapshot): string => {
  const intent = snapshot.playbackVisualIntent;
  return [
    joinPart(snapshot.error),
    joinPart(intent?.type),
    joinPart(intent?.state),
    joinPart(intent?.currentTrackId),
    joinPart(intent?.filePath),
    playbackStatusChromeKey(snapshot.playbackStatus),
    audioStatusChromeKey(snapshot.audioStatus),
  ].join('\u0002');
};

export const getPlaybackUiRevision = (snapshot: PlaybackStatusSnapshot): string => {
  const intent = snapshot.playbackVisualIntent;
  return [
    getPlaybackChromeRevision(snapshot),
    joinPart(intent?.expectedPositionMs),
    joinPart(snapshot.audioStatus?.positionSeconds),
    joinPart(snapshot.playbackStatus?.positionMs),
    automixUiKey(snapshot.audioStatus),
  ].join('\u0002');
};

export const arePlaybackChromeSnapshotsEqual = (
  left: PlaybackStatusSnapshot,
  right: PlaybackStatusSnapshot,
): boolean => getPlaybackChromeRevision(left) === getPlaybackChromeRevision(right);

export const arePlaybackUiSnapshotsEqual = (
  left: PlaybackStatusSnapshot,
  right: PlaybackStatusSnapshot,
): boolean => getPlaybackUiRevision(left) === getPlaybackUiRevision(right);
