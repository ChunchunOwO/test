import type { StreamingAudioQuality, StreamingProviderName } from './types/streaming';

export const defaultStreamingAudioQuality: StreamingAudioQuality = 'lossless';

export const streamingProviderNames: StreamingProviderName[] = [
  'mock',
  'netease',
  'qqmusic',
  'kugou',
  'bilibili',
  'youtube',
  'soundcloud',
  'spotify',
  'tidal',
  'qobuz',
  'm3u8',
  'plugin',
];

export const streamingStableKey = (provider: StreamingProviderName, providerTrackId: string): string =>
  `streaming:${provider}:${providerTrackId}`;

export const neteaseDjRadioPlaylistPrefix = 'djradio:';
