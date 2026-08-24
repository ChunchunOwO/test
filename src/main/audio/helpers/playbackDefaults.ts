import { getAppSettings } from '../../app/appSettings';
import { isWallpaperEngineBridgeVisualTelemetryActive } from '../../integrations/wallpaperEngine/WallpaperEngineBridgeRuntime';
import { isStageBridgeVisualTelemetryActive } from '../../integrations/stage/StageBridgeRuntime';
import { resolveEffectivePerformancePolicy } from '../../../shared/utils/performancePolicy';

export const fallbackSampleRate = 44100;
export const fallbackSharedMixSampleRate = 48000;
export const maxReliableSharedOutputSampleRate = 96000;
export const maxEchoSrcPcmTargetSampleRate = 384000;
export const recommendedWindowsSharedDefaultSampleRate = 48000;
export const preparedLocalPlaybackTtlMs = 2 * 60 * 1000;
export const preparedLocalPlaybackMaxItems = 50;
export const defaultWatchdogIntervalMs = 2000;
export const defaultWatchdogStallChecks = 3;
export const defaultWatchdogMaxRecoveriesPerTrack = 3;
export const defaultWatchdogRecoveryWindowMs = 5 * 60 * 1000;
export const watchdogPositionEpsilonSeconds = 0.05;
export const unexpectedPositionJumpEarlyMinimumSeconds = 2.5;
export const unexpectedPositionJumpEarlyToleranceSeconds = 1;
export const unexpectedPositionJumpGuardMs = 2500;
export const nativeStartupPositionGuardWindowMs = 4_500;
export const nativeStartupPositionDriftToleranceSeconds = 0.75;
export const nativeStartupPositionDriftMaxRebaseSeconds = 6;
export const playbackDiagnosticEventLimit = 180;
export const nativeUnderrunWindowMs = 15_000;
export const pausedOutputPrewarmResumeWaitMs = 75;
export const heldHttpDecoderTimelineLeadCapSeconds = 1.5;
export const nativeUnderrunCallbackThreshold = 3;
export const nativeUnderrunFramesThresholdMs = 100;
export const exclusiveNativeUnderrunStartupGraceMs = 8_000;
export const nativeTelemetryStatusIntervalMs = 1000;
export const nativeStartupTelemetryLogWindowMs = 3_500;
export const nativeStartupTelemetryLogIntervalMs = 500;
export const exclusiveInstabilityFallbackDisabledLogCooldownMs = 30_000;
export const echoSrcCudaWorkerMaxInputSamples = 262_144;
export const levelMeterVisualIntervalMs = 33;
export const levelMeterStatusIntervalMs = 33;
export const levelMeterNonVisualStatusIntervalMs = 250;
export const mainEventLoopLagSampleIntervalMs = 2_000;

export type PlaybackLoadSettings = {
  homeWaveformVisualizerEnabled: boolean;
  audioVisualSpectrumEnabled: boolean;
  lowLoadPlaybackModeEnabled: boolean;
  lowSpecModeEnabled: boolean;
};

const eqAnalyzerVisualSpectrumClients = new Set<number>();
const workshopLyricsSpectrumClients = new Set<number>();

export const setEqAnalyzerVisualSpectrumDemand = (clientId: number, enabled: boolean): void => {
  if (!Number.isInteger(clientId) || clientId < 0) return;
  if (enabled) eqAnalyzerVisualSpectrumClients.add(clientId);
  else eqAnalyzerVisualSpectrumClients.delete(clientId);
};

export const isEqAnalyzerVisualSpectrumDemandActive = (): boolean => eqAnalyzerVisualSpectrumClients.size > 0;

export const setWorkshopLyricsSpectrumDemand = (clientId: number, enabled: boolean): void => {
  if (!Number.isInteger(clientId) || clientId < 0) return;
  if (enabled) workshopLyricsSpectrumClients.add(clientId);
  else workshopLyricsSpectrumClients.delete(clientId);
};

export const isWorkshopLyricsSpectrumDemandActive = (): boolean => workshopLyricsSpectrumClients.size > 0;

export const getPlaybackLoadSettings = (): PlaybackLoadSettings => {
  try {
    const settings = getAppSettings();
    const performancePolicy = resolveEffectivePerformancePolicy(settings);
    return {
      homeWaveformVisualizerEnabled: performancePolicy.homeWaveformVisualizerEnabled,
      audioVisualSpectrumEnabled: performancePolicy.audioVisualSpectrumEnabled,
      lowLoadPlaybackModeEnabled: settings.lowLoadPlaybackModeEnabled === true,
      lowSpecModeEnabled: performancePolicy.lowSpecModeEnabled,
    };
  } catch {
    return {
      homeWaveformVisualizerEnabled: false,
      audioVisualSpectrumEnabled: false,
      lowLoadPlaybackModeEnabled: false,
      lowSpecModeEnabled: false,
    };
  }
};

export const isAudioVisualSpectrumEnabled = (): boolean => {
  const settings = getPlaybackLoadSettings();
  return (
    (settings.homeWaveformVisualizerEnabled && settings.audioVisualSpectrumEnabled) ||
    isEqAnalyzerVisualSpectrumDemandActive() ||
    isWorkshopLyricsSpectrumDemandActive() ||
    isWallpaperEngineBridgeVisualTelemetryActive() ||
    isStageBridgeVisualTelemetryActive()
  ) && !settings.lowLoadPlaybackModeEnabled && !settings.lowSpecModeEnabled;
};

export const isPlaybackIntegrationVisualTelemetryActive = (): boolean => {
  const settings = getPlaybackLoadSettings();
  return (
    isWallpaperEngineBridgeVisualTelemetryActive() ||
    isStageBridgeVisualTelemetryActive()
  ) && !settings.lowLoadPlaybackModeEnabled && !settings.lowSpecModeEnabled;
};

export const sharedStabilityMemoryTtlMs = 30 * 60 * 1000;
