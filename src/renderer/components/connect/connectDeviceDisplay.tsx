import type { ConnectDevice } from '../../../shared/types/connect';
import type { TranslationKey } from '../../i18n/locales';

type Translate = (key: TranslationKey, options?: Record<string, string | number>) => string;

export const formatProtocol = (device: Pick<ConnectDevice, 'protocol'>): string =>
  device.protocol === 'dlna' ? 'DLNA / UPnP' : device.protocol === 'hqplayer' ? 'HQPlayer' : 'AirPlay';

const uniqueText = (values: Array<string | null | undefined>): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed.toLowerCase())) {
      continue;
    }
    seen.add(trimmed.toLowerCase());
    result.push(trimmed);
  }
  return result;
};

export const formatDeviceProduct = (device: ConnectDevice, t: Translate): string => {
  const parts = uniqueText([
    device.manufacturer,
    device.discovery?.modelName ?? device.model,
    device.discovery?.modelNumber,
  ]);
  return parts.length > 0 ? parts.join(' · ') : t('connectPage.device.modelUnknown');
};

export const formatDeviceAddress = (device: ConnectDevice, t: Translate): string =>
  device.address ? t('connectPage.device.lanAddress', { address: device.address }) : t('connectPage.device.waitingAddress');

const formatMimeLabel = (mimeType: string): string => {
  switch (mimeType.toLowerCase()) {
    case 'audio/flac':
      return 'FLAC';
    case 'audio/wav':
    case 'audio/x-wav':
      return 'WAV';
    case 'audio/mpeg':
      return 'MP3';
    case 'audio/mp4':
      return 'MP4 / ALAC';
    case 'audio/aac':
      return 'AAC';
    case 'audio/ogg':
      return 'OGG';
    case 'audio/aiff':
      return 'AIFF';
    default:
      return mimeType.replace(/^audio\//iu, '').toUpperCase();
  }
};

export const formatDeviceFormatSupport = (device: ConnectDevice, t: Translate): string => {
  const supported = device.capabilities.supportedMimeTypes;
  if (supported.some((item) => item === '*/*' || item.endsWith('/*'))) {
    return t('connectPage.device.format.all');
  }

  const formats = supported
    .filter((item) => item !== 'application/octet-stream')
    .map(formatMimeLabel)
    .slice(0, 3);

  if (formats.length === 0) {
    return t('connectPage.device.format.pending');
  }

  const extraCount = Math.max(0, supported.length - formats.length);
  return extraCount > 0 ? `${formats.join(' / ')} +${extraCount}` : formats.join(' / ');
};

export const formatDeviceSupport = (device: ConnectDevice, t: Translate): string => {
  if (device.protocol === 'hqplayer') {
    return t('connectPage.device.support.hqplayer');
  }

  if (device.protocol === 'airplay') {
    return t('connectPage.device.support.airplay');
  }

  const controls = [
    device.capabilities.canSeek ? t('connectPage.device.support.seek') : null,
    device.capabilities.canSetVolume ? t('connectPage.device.support.volume') : null,
    device.capabilities.supportsMetadata ? t('connectPage.device.support.metadata') : null,
  ].filter(Boolean);
  const route = device.capabilities.requiresTranscode ? t('connectPage.device.support.transcode') : t('connectPage.device.support.direct');
  return [...controls, route, formatDeviceFormatSupport(device, t)].join(' · ') || t('connectPage.device.support.basicDlna');
};

export const StreamerGlyph = (): JSX.Element => (
  <svg className="connect-device-glyph" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
    <path d="M8.5 16.5 20 11l11.5 5.5v10.2L20 32 8.5 26.7z" />
    <path d="m8.5 16.5 11.5 5.3 11.5-5.3" />
    <path d="M20 21.8V32" />
    <path d="M13.5 25.1h6" />
    <circle cx="27.5" cy="24.7" r="1.4" />
  </svg>
);

const TvGlyph = (): JSX.Element => (
  <svg className="connect-device-glyph" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
    <rect x="7.5" y="10.5" width="25" height="17" rx="3" />
    <path d="M16 31h8" />
    <path d="M20 27.5V31" />
    <path d="M12 15.5h16" />
  </svg>
);

const AirPlayGlyph = (): JSX.Element => (
  <svg className="connect-device-glyph" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
    <rect x="8.5" y="10.5" width="23" height="15" rx="3" />
    <path d="m15 31 5-6 5 6z" />
  </svg>
);

const HqPlayerGlyph = (): JSX.Element => (
  <span className="connect-hqplayer-wordmark" aria-hidden="true">
    HQ
  </span>
);

const looksLikeTvDevice = (device: ConnectDevice): boolean => {
  const text = uniqueText([
    device.name,
    device.model,
    device.manufacturer,
    device.discovery?.modelName,
    device.discovery?.modelDescription,
  ]).join(' ').toLowerCase();
  return /\b(tv|bravia|webos|roku|chromecast|android tv|google tv|samsung|lg tv|tcl|hisense|xiaomi tv|mi tv)\b/iu.test(text);
};

export const deviceVisual = (device: ConnectDevice): { icon: JSX.Element; label: string; labelKey?: TranslationKey; tone: string } => {
  if (device.protocol === 'hqplayer') {
    return { icon: <HqPlayerGlyph />, label: 'HQPlayer', tone: 'hqplayer' };
  }

  if (device.protocol === 'airplay') {
    return { icon: <AirPlayGlyph />, label: 'AirPlay', tone: 'airplay' };
  }

  if (looksLikeTvDevice(device)) {
    return { icon: <TvGlyph />, label: 'TV', tone: 'tv' };
  }

  return { icon: <StreamerGlyph />, label: 'Streamer', labelKey: 'connectPage.devices.streamerLabel', tone: 'streamer' };
};
