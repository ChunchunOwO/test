import { defaultStreamingAudioQuality } from '../../shared/mediaProviderIdentity';
import type { StreamingAudioQuality } from '../../shared/types/streaming';

export type StreamingQualityPreference = StreamingAudioQuality;

export const streamingQualityStorageKey = 'echo.streaming.quality';

export const normalizeStreamingQualityPreference = (value: unknown): StreamingQualityPreference | null => {
  if (value === 'max') {
    return defaultStreamingAudioQuality;
  }

  return value === 'standard' || value === 'high' || value === 'lossless' || value === 'hires' ? value : null;
};

export const readStreamingQualityPreference = (): StreamingQualityPreference => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return defaultStreamingAudioQuality;
    }

    return normalizeStreamingQualityPreference(window.localStorage.getItem(streamingQualityStorageKey)) ?? defaultStreamingAudioQuality;
  } catch {
    return defaultStreamingAudioQuality;
  }
};

export const writeStreamingQualityPreference = (quality: StreamingQualityPreference): void => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }

    window.localStorage.setItem(streamingQualityStorageKey, normalizeStreamingQualityPreference(quality) ?? defaultStreamingAudioQuality);
  } catch {
    // Quality memory should never block streaming UI changes.
  }
};
