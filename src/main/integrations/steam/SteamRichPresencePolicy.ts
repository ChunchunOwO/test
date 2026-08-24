import type { AppLocale, AppSettings, SteamRichPresenceMode, SteamRichPresencePreset } from '../../../shared/types/appSettings';
import type { AudioStatus } from '../../../shared/types/audio';
import type { SteamRichPresenceSnapshot } from './SteamCapabilityServices';
import { formatSteamTrackHeadline, getSteamPresenceCopy, joinSteamPresenceDetails, resolveSteamAmbientPresence } from './SteamRichPresenceCopy';
import type { SteamRichPresenceExtras } from './SteamRichPresenceFlavor';

export type SteamRichPresencePolicy = {
  mode: SteamRichPresenceMode;
  preset: SteamRichPresencePreset;
  locale: AppLocale;
  showAlbum: boolean;
  showProgress: boolean;
  showGenre: boolean;
  showPlaybackOrder: boolean;
  showBpm: boolean;
  showQuality: boolean;
  showFormat: boolean;
  showBitPerfect: boolean;
};

export const resolveSteamRichPresencePolicy = (
  settings: Pick<AppSettings, 'locale' | 'steamRichPresenceEnabled' | 'steamRichPresenceMode' | 'steamRichPresencePreset' | 'steamRichPresenceShowAlbum' | 'steamRichPresenceShowProgress' | 'steamRichPresenceShowGenre' | 'steamRichPresenceShowPlaybackOrder' | 'steamRichPresenceShowBpm' | 'steamRichPresenceShowQuality' | 'steamRichPresenceShowFormat' | 'steamRichPresenceShowBitPerfect'>,
): SteamRichPresencePolicy => {
  const mode = settings.steamRichPresenceMode === 'off' || settings.steamRichPresenceMode === 'basic' || settings.steamRichPresenceMode === 'detailed'
    ? settings.steamRichPresenceMode
    : settings.steamRichPresenceEnabled === false
      ? 'off'
      : 'detailed';
  const savedPreset = settings.steamRichPresencePreset;
  const preset = mode === 'basic'
    ? 'privacy'
    : savedPreset === 'music' || savedPreset === 'minimal' || savedPreset === 'privacy'
      ? savedPreset
      : 'music';
  const locale = settings.locale === 'zh-CN' || settings.locale === 'zh-TW' || settings.locale === 'ja-JP' || settings.locale === 'ko-KR' || settings.locale === 'en-US'
    ? settings.locale
    : 'en-US';
  return {
    mode,
    preset,
    locale,
    showAlbum: settings.steamRichPresenceShowAlbum !== false,
    showProgress: settings.steamRichPresenceShowProgress !== false,
    showGenre: settings.steamRichPresenceShowGenre === true,
    showPlaybackOrder: settings.steamRichPresenceShowPlaybackOrder === true,
    showBpm: settings.steamRichPresenceShowBpm === true,
    showQuality: settings.steamRichPresenceShowQuality === true,
    showFormat: settings.steamRichPresenceShowFormat === true,
    showBitPerfect: settings.steamRichPresenceShowBitPerfect === true,
  };
};

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

const normalizeMetadata = (value: string | null | undefined, fallback: string): string => {
  const normalized = value?.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return truncateUtf8(normalized || fallback, 120);
};

const formatTime = (seconds: number): string => {
  const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(safeSeconds % 60).padStart(2, '0')}`;
};

const createBasicSnapshot = (status: AudioStatus, now: Date, locale: SteamRichPresencePolicy['locale']): SteamRichPresenceSnapshot => ({
  ...resolveSteamAmbientPresence(status.state, now, locale),
  title: null,
  artist: null,
  details: null,
});

export const createSteamRichPresenceSnapshot = (
  status: AudioStatus,
  policy: SteamRichPresencePolicy,
  now: Date = new Date(),
  extras: Partial<SteamRichPresenceExtras> = {},
): SteamRichPresenceSnapshot => {
  if (policy.mode !== 'detailed' || policy.preset === 'privacy') {
    return createBasicSnapshot(status, now, policy.locale);
  }
  if (!['loading', 'playing', 'paused'].includes(status.state)) {
    return createBasicSnapshot(status, now, policy.locale);
  }

  const copy = getSteamPresenceCopy(policy.locale);
  const title = normalizeMetadata(status.currentTrackTitle, copy.unknownTrack);
  const artist = normalizeMetadata(status.currentTrackArtist || status.currentTrackAlbumArtist, copy.unknownArtist);
  const includeMusicDetails = policy.preset !== 'minimal';
  const album = includeMusicDetails && policy.showAlbum ? normalizeMetadata(status.currentTrackAlbum, copy.unknownAlbum) : null;
  const progressBucketSeconds = Math.floor(Math.max(0, status.positionSeconds || 0) / 15) * 15;
  const progress = includeMusicDetails && policy.showProgress ? `${formatTime(progressBucketSeconds)} / ${formatTime(status.durationSeconds)}` : null;
  const context = [
    policy.showGenre ? extras.genre : null,
    policy.showPlaybackOrder ? extras.playbackOrder : null,
    policy.showBpm ? extras.bpm : null,
    policy.showQuality ? extras.quality : null,
    policy.showFormat ? extras.format : null,
    policy.showBitPerfect ? extras.bitPerfect : null,
  ].filter((value): value is string => Boolean(value));
  const details = truncateUtf8(joinSteamPresenceDetails([album, progress, ...context]) ?? '', 220) || null;
  const headline = formatSteamTrackHeadline(
    copy,
    status.state === 'paused' ? 'paused' : status.state === 'loading' ? 'loading' : 'playing',
    title,
    artist,
  );
  const displayBase = status.state === 'playing'
    ? '#Status_PlayingTrack'
    : status.state === 'paused'
      ? '#Status_PausedTrack'
      : '#Status_LoadingTrack';
  const display = details ? `${displayBase}Details` as SteamRichPresenceSnapshot['display'] : displayBase;

  return {
    display,
    status: truncateUtf8(joinSteamPresenceDetails([headline, details]) ?? headline, 220),
    title,
    artist,
    details,
  };
};
