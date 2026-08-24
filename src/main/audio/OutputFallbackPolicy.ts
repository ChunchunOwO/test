import type {
  AudioOutputMode,
  AudioOutputSettings,
  AudioSharedBackend,
} from '../../shared/types/audio';
import type { AudioSessionPlayRequest } from './audioTypes';

type NormalizeSharedBackend = (value: unknown) => AudioSharedBackend;

export const hasExplicitDeviceSelection = (settings: AudioOutputSettings): boolean =>
  Number.isInteger(Number(settings.deviceIndex)) || Boolean(settings.deviceName);

export const isOutputStartRetryMode = (mode: AudioOutputMode): boolean =>
  mode === 'shared' || mode === 'exclusive';

export const isSharedFallbackAllowedForExclusive = (settings: AudioOutputSettings): boolean =>
  settings.exclusiveInstabilityFallbackEnabled === true;

export const isDefaultDeviceFallbackAllowed = (settings: AudioOutputSettings): boolean =>
  settings.defaultDeviceFallbackEnabled === true;

export const isMissingOutputDeviceError = (error: Error): boolean => {
  const message = error.message;
  if (/\b(?:cuda|gpu|compute)\b[^\r\n]{0,24}\bdevice\b/iu.test(message)) {
    return false;
  }

  return /AUDCLNT_E_(?:DEVICE_INVALIDATED|ENDPOINT_CREATE_FAILED)|(?:\b(?:ASIO|WASAPI|WDM-KS|miniaudio|output|audio|render)\b[^\r\n]{0,48}\b(?:device|endpoint)\b|\b(?:device|endpoint)\b)[^\r\n]{0,24}\b(?:not found|unavailable|invalidated|removed|disappeared|missing)\b|\bno (?:default )?(?:audio )?(?:output |render )?(?:device|endpoint)(?: (?:was )?found)?\b|\bdefault (?:audio |render )?endpoint\b[^\r\n]{0,16}\b(?:not found|unavailable|missing)\b/iu.test(
    message,
  );
};

export const createMissingOutputDeviceFallbackRequest = (
  request: AudioSessionPlayRequest,
  currentOutputSettings: AudioOutputSettings | null,
  error: unknown,
  createFallbackSettings: (settings: AudioOutputSettings) => AudioOutputSettings,
): AudioSessionPlayRequest | null => {
  const normalizedError = error instanceof Error ? error : new Error(String(error));
  if (
    request.outputDeviceFallbackAttempt === true ||
    !currentOutputSettings ||
    !isMissingOutputDeviceError(normalizedError)
  ) {
    return null;
  }

  return {
    ...request,
    output: createFallbackSettings(currentOutputSettings),
    outputDeviceFallbackAttempt: true,
  };
};

export const isAutomaticDirectSoundFallbackError = (error: Error): boolean =>
  /device_initialize_timeout|timeout_waiting_for_ready|AUDCLNT_E_DEVICE_INVALIDATED|AUDCLNT_E_ENDPOINT_CREATE_FAILED|AUDCLNT_E_UNSUPPORTED_FORMAT|device (?:is )?(?:unavailable|invalidated|removed|not found|disappeared)|no output device|default audio endpoint/iu.test(
    error.message,
  );

export const createOutputFallbackSettingsPolicy = (
  normalizeSharedBackend: NormalizeSharedBackend,
) => {
  const createSharedFallbackSettings = (settings: AudioOutputSettings): AudioOutputSettings => ({
    ...settings,
    outputMode: 'shared',
    sharedBackend: normalizeSharedBackend('windows'),
    requestedOutputSampleRate: undefined,
    useMiniaudioOutput: false,
    dsdOutputMode: 'pcm',
  });

  const createSafeSharedFallbackSettings = (settings: AudioOutputSettings): AudioOutputSettings => ({
    ...settings,
    outputMode: 'shared',
    sharedBackend: normalizeSharedBackend('windows'),
    deviceIndex: undefined,
    deviceName: undefined,
    requestedOutputSampleRate: undefined,
    latencyProfile: 'stable',
    bufferSizeFrames: undefined,
    useMiniaudioOutput: false,
    dsdOutputMode: 'pcm',
  });

  const createAutomaticDirectSoundFallbackSettings = (settings: AudioOutputSettings): AudioOutputSettings => ({
    ...createSafeSharedFallbackSettings(settings),
    sharedBackend: 'directsound',
    automaticOutputEnabled: true,
  });

  return {
    createSharedFallbackSettings,
    createSafeSharedFallbackSettings,
    createAutomaticDirectSoundFallbackSettings,
  };
};
