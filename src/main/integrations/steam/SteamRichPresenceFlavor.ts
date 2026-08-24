import type { AudioStatus } from '../../../shared/types/audio';
import type { LibraryTrack } from '../../../shared/types/library';
import type { PersistedPlaybackRepeatMode } from '../../../shared/types/playback';
import { isUnclassifiedGenreKey } from '../../../shared/library/genreKey';
import { getPlaybackSessionStore } from '../../audio/PlaybackSessionStore';
import { getLibraryService } from '../../library/LibraryService';
import { getSteamPresenceCopy, joinSteamPresenceDetails, type SteamPresenceCopy } from './SteamRichPresenceCopy';
import type { SteamRichPresencePolicy } from './SteamRichPresencePolicy';

export type SteamRichPresenceExtras = {
  genre: string | null;
  playbackOrder: string | null;
  bpm: string | null;
  quality: string | null;
  format: string | null;
  bitPerfect: string | null;
};

export type SteamPresenceFlavorSources = {
  getTrackMetadata?: (trackId: string) => Pick<LibraryTrack, 'genre' | 'bpm' | 'codec' | 'sampleRate' | 'bitDepth' | 'bitrate'> | null;
  getPlaybackMode?: () => { isShuffleEnabled?: boolean; repeatMode?: PersistedPlaybackRepeatMode } | null;
};

const maxMetadataBytes = 40;

const truncateUtf8 = (value: string, maxBytes: number): string => {
  let result = '';
  let bytes = 0;
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, 'utf8');
    if (bytes + characterBytes > maxBytes) {
      break;
    }
    result += character;
    bytes += characterBytes;
  }
  return result;
};

export const sanitizeSteamPresenceGenre = (value: string | null | undefined): string | null => {
  const first = value?.split(/[;,/|]/u)[0]?.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim() ?? '';
  if (!first || isUnclassifiedGenreKey(first) || /[\\/]/.test(first)) {
    return null;
  }
  return truncateUtf8(first, maxMetadataBytes) || null;
};

export const formatSteamPresenceBpm = (value: number | null | undefined): string | null =>
  Number.isFinite(value) && Number(value) > 0 && Number(value) < 1000
    ? `${Math.round(Number(value))} BPM`
    : null;

const formatSampleRate = (value: number | null | undefined): string | null => {
  if (!Number.isFinite(value) || Number(value) <= 0) return null;
  if (Number(value) < 1000) return `${Math.round(Number(value))}Hz`;
  const kilohertz = Math.round((Number(value) / 1000) * 10) / 10;
  return `${kilohertz}kHz`;
};

export const formatSteamPresenceQuality = ({
  bitDepth,
  bitrate,
  sampleRate,
}: {
  bitDepth?: number | null;
  bitrate?: number | null;
  sampleRate?: number | null;
}): string | null => {
  const depth = Number.isFinite(bitDepth) && Number(bitDepth) > 0 ? `${Math.round(Number(bitDepth))}bit` : null;
  const rate = formatSampleRate(sampleRate);
  const lossyRate = !depth && Number.isFinite(bitrate) && Number(bitrate) > 0
    ? `${Math.round(Number(bitrate) / 1000)}kbps`
    : null;
  const parts = [depth ?? lossyRate, rate].filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(' / ') : null;
};

export const formatSteamPresenceFileFormat = (value: string | null | undefined): string | null => {
  const normalized = value?.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim() ?? '';
  return normalized ? truncateUtf8(normalized.toUpperCase(), maxMetadataBytes) : null;
};

export const formatSteamPresencePlaybackOrder = (
  copy: SteamPresenceCopy,
  isShuffleEnabled: boolean,
  repeatMode: PersistedPlaybackRepeatMode | null | undefined,
): string | null => {
  const parts = [
    isShuffleEnabled ? copy.shuffle : null,
    !isShuffleEnabled && repeatMode === 'all' ? copy.repeatAll : null,
    repeatMode === 'one' ? copy.repeatOne : null,
  ];
  return joinSteamPresenceDetails(parts);
};

const defaultSources = (): SteamPresenceFlavorSources => ({
  getTrackMetadata: (trackId) => {
    try {
      return getLibraryService().getTrack(trackId) ?? null;
    } catch {
      return null;
    }
  },
  getPlaybackMode: () => {
    try {
      return getPlaybackSessionStore().load()?.mode ?? null;
    } catch {
      return null;
    }
  },
});

export const collectSteamPresenceExtras = (
  status: AudioStatus,
  policy: SteamRichPresencePolicy,
  sources: SteamPresenceFlavorSources = defaultSources(),
): SteamRichPresenceExtras => {
  const copy = getSteamPresenceCopy(policy.locale);
  const trackId = status.currentTrackId;
  const needsTrackMetadata = policy.showGenre || policy.showBpm || policy.showQuality || policy.showFormat;
  const track = needsTrackMetadata && trackId ? sources.getTrackMetadata?.(trackId) ?? null : null;
  const mode = policy.showPlaybackOrder ? sources.getPlaybackMode?.() ?? null : null;
  return {
    genre: policy.showGenre ? sanitizeSteamPresenceGenre(track?.genre) : null,
    playbackOrder: policy.showPlaybackOrder
      ? formatSteamPresencePlaybackOrder(copy, mode?.isShuffleEnabled === true, mode?.repeatMode)
      : null,
    bpm: policy.showBpm ? formatSteamPresenceBpm(track?.bpm) : null,
    quality: policy.showQuality
      ? formatSteamPresenceQuality({
        bitDepth: status.bitDepth ?? track?.bitDepth,
        bitrate: status.bitrate ?? track?.bitrate,
        sampleRate: status.fileSampleRate ?? track?.sampleRate,
      })
      : null,
    format: policy.showFormat ? formatSteamPresenceFileFormat(status.codec ?? track?.codec) : null,
    bitPerfect: policy.showBitPerfect && status.bitPerfectCandidate ? 'Bit-Perfect' : null,
  };
};
