import type { LibraryTrack } from '../../../shared/types/library';
import type { PlaybackStartRequest } from '../../../shared/types/playback';
import type { SteamListenTogetherTrack } from '../../../shared/types/steam';

type LocalLibraryReader = {
  getTracksPlaybackSafe: (query: { search?: string; page?: number; pageSize?: number }) => Promise<{ items: LibraryTrack[] }>;
};

type PlaybackRelay = {
  execute: (request: { command: 'playLocalFile'; args: [PlaybackStartRequest] }) => Promise<unknown>;
};

type ResolverOptions = {
  getLibrary?: () => LocalLibraryReader;
  relay?: PlaybackRelay;
};

const normalizeMetadata = (value: string | null | undefined): string =>
  (value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, ' ')
    .trim();

const durationDelta = (track: LibraryTrack, remote: SteamListenTogetherTrack): number =>
  remote.durationSeconds > 0 && track.duration > 0
    ? Math.abs(track.duration - remote.durationSeconds)
    : 0;

export const scoreSteamListenTogetherLocalTrack = (
  track: LibraryTrack,
  remote: SteamListenTogetherTrack,
): number | null => {
  if (track.unavailable === true || track.mediaType === 'remote' || track.mediaType === 'streaming' || !track.path) return null;
  if (normalizeMetadata(track.title) !== normalizeMetadata(remote.title)) return null;

  const remoteArtist = normalizeMetadata(remote.artist);
  if (remoteArtist && normalizeMetadata(track.artist) !== remoteArtist) return null;

  const delta = durationDelta(track, remote);
  if (remote.durationSeconds > 0 && track.duration > 0 && delta > 4) return null;

  let score = 100 - Math.min(20, delta * 4);
  if (normalizeMetadata(track.album) === normalizeMetadata(remote.album) && normalizeMetadata(remote.album)) score += 8;
  if (remoteArtist) score += 12;
  return score;
};

const toPlaybackRequest = (
  track: LibraryTrack,
  startSeconds: number,
): PlaybackStartRequest => ({
  filePath: track.path,
  trackId: track.id,
  startSeconds: Math.max(0, startSeconds),
  metadata: {
    title: track.title,
    artist: track.artist,
    album: track.album,
    albumArtist: track.albumArtist,
    coverUrl: track.coverThumb,
  },
  probe: {
    durationSeconds: track.duration,
    fileSampleRate: track.sampleRate,
    codec: track.codec,
    bitDepth: track.bitDepth,
    bitrate: track.bitrate,
    bpm: track.bpm,
    bpmConfidence: track.bpmConfidence,
    beatOffsetMs: track.beatOffsetMs,
  },
  replayGain: {
    trackGainDb: track.replayGainTrackGainDb,
    albumGainDb: track.replayGainAlbumGainDb,
    trackPeak: track.replayGainTrackPeak,
    albumPeak: track.replayGainAlbumPeak,
    integratedLufs: track.replayGainIntegratedLufs,
  },
});

export class SteamListenTogetherLocalTrackResolver {
  private readonly getLibrary: (() => LocalLibraryReader) | null;
  private readonly relay: PlaybackRelay | null;

  constructor(options: ResolverOptions = {}) {
    this.getLibrary = options.getLibrary ?? null;
    this.relay = options.relay ?? null;
  }

  async findAndPlay(remote: SteamListenTogetherTrack, startSeconds: number): Promise<boolean> {
    const library = this.getLibrary?.() ?? (await import('../../library/LibraryService')).getLibraryService();
    const page = await library.getTracksPlaybackSafe({
      search: remote.title,
      page: 1,
      pageSize: 50,
    });
    const match = page.items
      .map((track) => ({ track, score: scoreSteamListenTogetherLocalTrack(track, remote) }))
      .filter((candidate): candidate is { track: LibraryTrack; score: number } => candidate.score !== null)
      .sort((left, right) => right.score - left.score)[0]?.track;
    if (!match) return false;

    const relay = this.relay ?? (await import('../../playback/MainWindowPlaybackCommandRelay')).getMainWindowPlaybackCommandRelay();
    await relay.execute({ command: 'playLocalFile', args: [toPlaybackRequest(match, startSeconds)] });
    return true;
  }
}
