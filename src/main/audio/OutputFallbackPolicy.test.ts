import { describe, expect, it, vi } from 'vitest';
import type { AudioOutputSettings, AudioSharedBackend } from '../../shared/types/audio';
import {
  createMissingOutputDeviceFallbackRequest,
  createOutputFallbackSettingsPolicy,
  hasExplicitDeviceSelection,
  isAutomaticDirectSoundFallbackError,
  isDefaultDeviceFallbackAllowed,
  isMissingOutputDeviceError,
  isOutputStartRetryMode,
  isSharedFallbackAllowedForExclusive,
} from './OutputFallbackPolicy';

describe('OutputFallbackPolicy', () => {
  it('detects explicit device selection without owning device state', () => {
    expect(hasExplicitDeviceSelection({})).toBe(false);
    expect(hasExplicitDeviceSelection({ deviceIndex: 0 })).toBe(true);
    expect(hasExplicitDeviceSelection({ deviceName: 'Studio DAC' })).toBe(true);
  });

  it('keeps retry and fallback permissions fail-closed', () => {
    expect(isOutputStartRetryMode('shared')).toBe(true);
    expect(isOutputStartRetryMode('exclusive')).toBe(true);
    expect(isOutputStartRetryMode('asio')).toBe(false);
    expect(isOutputStartRetryMode('system')).toBe(false);
    expect(isSharedFallbackAllowedForExclusive({})).toBe(false);
    expect(isDefaultDeviceFallbackAllowed({})).toBe(false);
    expect(isSharedFallbackAllowedForExclusive({ exclusiveInstabilityFallbackEnabled: true })).toBe(true);
    expect(isDefaultDeviceFallbackAllowed({ defaultDeviceFallbackEnabled: true })).toBe(true);
  });

  it('creates the same shared, safe-shared, and DirectSound fallback settings', () => {
    const normalizeSharedBackend = vi.fn((_value: unknown): AudioSharedBackend => 'windows');
    const policy = createOutputFallbackSettingsPolicy(normalizeSharedBackend);
    const settings: AudioOutputSettings = {
      outputMode: 'exclusive',
      sharedBackend: 'auto',
      deviceIndex: 7,
      deviceName: 'Studio DAC',
      requestedOutputSampleRate: 192_000,
      latencyProfile: 'lowLatency',
      bufferSizeFrames: 256,
      useMiniaudioOutput: true,
      dsdOutputMode: 'dop',
      volume: 0.75,
    };

    expect(policy.createSharedFallbackSettings(settings)).toEqual({
      ...settings,
      outputMode: 'shared',
      sharedBackend: 'windows',
      requestedOutputSampleRate: undefined,
      useMiniaudioOutput: false,
      dsdOutputMode: 'pcm',
    });
    expect(policy.createSafeSharedFallbackSettings(settings)).toEqual({
      ...settings,
      outputMode: 'shared',
      sharedBackend: 'windows',
      deviceIndex: undefined,
      deviceName: undefined,
      requestedOutputSampleRate: undefined,
      latencyProfile: 'stable',
      bufferSizeFrames: undefined,
      useMiniaudioOutput: false,
      dsdOutputMode: 'pcm',
    });
    expect(policy.createAutomaticDirectSoundFallbackSettings(settings)).toEqual({
      ...settings,
      outputMode: 'shared',
      sharedBackend: 'directsound',
      deviceIndex: undefined,
      deviceName: undefined,
      requestedOutputSampleRate: undefined,
      latencyProfile: 'stable',
      bufferSizeFrames: undefined,
      useMiniaudioOutput: false,
      dsdOutputMode: 'pcm',
      automaticOutputEnabled: true,
    });
    expect(normalizeSharedBackend).toHaveBeenCalledWith('windows');
  });

  it('only classifies known device-start failures for automatic DirectSound fallback', () => {
    expect(isAutomaticDirectSoundFallbackError(new Error('device_initialize_timeout'))).toBe(true);
    expect(isAutomaticDirectSoundFallbackError(new Error('AUDCLNT_E_DEVICE_INVALIDATED'))).toBe(true);
    expect(isAutomaticDirectSoundFallbackError(new Error('no output device'))).toBe(true);
    expect(isAutomaticDirectSoundFallbackError(new Error('access violation 0xc0000005'))).toBe(false);
    expect(isAutomaticDirectSoundFallbackError(new Error('decoder failed'))).toBe(false);
  });

  it.each([
    'ASIO device not found',
    'miniaudio shared device index not found: 6',
    'output open failed: device disappeared',
    'WASAPI exclusive open failed: failed to open output device "Test Device": No device found.',
    'AUDCLNT_E_DEVICE_INVALIDATED',
    'no output device',
  ])('classifies a missing output route: %s', (message) => {
    expect(isMissingOutputDeviceError(new Error(message))).toBe(true);
  });

  it('does not treat decoder, format, or compute-device failures as a missing audio output', () => {
    expect(isMissingOutputDeviceError(new Error('decoder failed'))).toBe(false);
    expect(isMissingOutputDeviceError(new Error('AUDCLNT_E_UNSUPPORTED_FORMAT'))).toBe(false);
    expect(isMissingOutputDeviceError(new Error('CUDA device not found'))).toBe(false);
  });

  it('builds one guarded retry request with the system-default Shared settings', () => {
    const request = { filePath: 'song.flac' };
    const createFallbackSettings = vi.fn(() => ({ outputMode: 'shared' as const, sharedBackend: 'windows' as const }));

    expect(createMissingOutputDeviceFallbackRequest(
      request,
      { outputMode: 'asio', deviceName: 'Missing DAC' },
      new Error('ASIO device not found'),
      createFallbackSettings,
    )).toEqual({
      filePath: 'song.flac',
      output: { outputMode: 'shared', sharedBackend: 'windows' },
      outputDeviceFallbackAttempt: true,
    });
    expect(createMissingOutputDeviceFallbackRequest(
      { ...request, outputDeviceFallbackAttempt: true },
      { outputMode: 'shared' },
      new Error('no output device'),
      createFallbackSettings,
    )).toBeNull();
  });
});
