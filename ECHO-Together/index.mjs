import { ipcRenderer, contextBridge, webUtils } from "electron";
import { I as IpcChannels } from "./ipcChannels-D6ce8Thl.mjs";
const audioBackendContractVersion = 2;
const DEFAULT_REPLAY_GAIN_TARGET_LUFS = -14;
const roundDb = (value) => Math.round(value * 1e3) / 1e3;
const dbToLinearGain = (db) => Math.pow(10, db / 20);
const finiteNumberOrNull = (value) => {
  if (value === null || value === void 0 || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};
const calculateReplayGain = (input) => {
  if (!input.enabled || input.mode === "off") {
    return {
      appliedDb: 0,
      selectedGainDb: null,
      selectedPeak: null,
      preventedClipping: false,
      active: false
    };
  }
  const trackGainDb = finiteNumberOrNull(input.trackGainDb);
  const albumGainDb = finiteNumberOrNull(input.albumGainDb);
  const integratedLufs = finiteNumberOrNull(input.integratedLufs);
  const targetLufs = finiteNumberOrNull(input.targetLufs) ?? DEFAULT_REPLAY_GAIN_TARGET_LUFS;
  const targetDerivedTrackGainDb = integratedLufs === null ? null : targetLufs - integratedLufs;
  const selectedGainDb = input.mode === "album" ? albumGainDb ?? targetDerivedTrackGainDb ?? trackGainDb : targetDerivedTrackGainDb ?? trackGainDb;
  const trackPeak = finiteNumberOrNull(input.trackPeak);
  const albumPeak = finiteNumberOrNull(input.albumPeak);
  const selectedPeak = input.mode === "album" ? albumPeak ?? trackPeak : trackPeak;
  if (selectedGainDb === null) {
    return {
      appliedDb: 0,
      selectedGainDb: null,
      selectedPeak,
      preventedClipping: false,
      active: false
    };
  }
  let appliedDb = selectedGainDb + input.preampDb;
  let preventedClipping = false;
  if (input.preventClipping && selectedPeak !== null && selectedPeak > 0) {
    const maxGainDb = -20 * Math.log10(selectedPeak);
    if (appliedDb > maxGainDb) {
      appliedDb = maxGainDb;
      preventedClipping = true;
    }
  }
  return {
    appliedDb: roundDb(appliedDb),
    selectedGainDb: roundDb(selectedGainDb),
    selectedPeak,
    preventedClipping,
    active: true
  };
};
function createSystemAudioEngine(ipcRenderer2, IpcChannels2) {
  const systemAudioWarning = "system_audio_compatibility_mode";
  const systemAudioDeviceName = "System default output";
  const systemAudioOutputBackend = "system-audio";
  const systemAudioBackendImpl = "electron-html-audio";
  const maxSystemMediaRecoveryAttempts = 1;
  const systemSeekConfirmTimeoutMs = 2500;
  const systemSeekToleranceSeconds = 0.75;
  const systemPrematureEndToleranceSeconds = 5;
  const systemCorruptEndRatioThreshold = 0.75;
  const systemSeekConfirmEvents = [
    "seeked",
    "timeupdate",
    "canplay",
    "playing",
    "loadedmetadata"
  ];
  const systemPlaybackSupersededMessage = "audio_session_run_cancelled";
  const systemPlayInterruptedByTransportPattern = /\bplay\(\) request was interrupted by a call to (?:pause|load)\(\)/iu;
  const audioStatusHandlers = /* @__PURE__ */ new Set();
  const trackChangeHandlers = /* @__PURE__ */ new Set();
  const localAudioFileOpenHandlers = /* @__PURE__ */ new Set();
  const pendingLocalAudioFileOpenEvents = [];
  const automixAdvanceHandlers = /* @__PURE__ */ new Set();
  const rendererSearchParams = new URLSearchParams(typeof window.location?.search === "string" ? window.location.search : "");
  const isMainPlaybackRenderer2 = rendererSearchParams.get("miniPlayer") !== "1" && rendererSearchParams.get("desktopLyrics") !== "1";
  const readPersistedSystemAudioMode = () => {
    try {
      const raw = window.localStorage.getItem("echo-next.audio-output-memory");
      if (!raw) {
        return false;
      }
      const parsed = JSON.parse(raw);
      return parsed.enabled === true && parsed.outputMode === "system";
    } catch {
      return false;
    }
  };
  let systemAudioElement = null;
  let systemAudioContext = null;
  let systemAudioSourceNode = null;
  let systemAudioGainNode = null;
  let systemAudioSplitterNode = null;
  let systemAudioMonoLeftGainNode = null;
  let systemAudioMonoRightGainNode = null;
  let systemAudioMonoMergerNode = null;
  const persistedSystemAudioMode = readPersistedSystemAudioMode();
  let systemAudioModeActive = isMainPlaybackRenderer2 && persistedSystemAudioMode;
  let systemAudioState = "idle";
  let systemAudioSource = null;
  let systemAudioError = null;
  let systemAudioStatusTimer = null;
  let systemAudioTransportGain = 1;
  let systemAudioFadeGeneration = 0;
  let systemAudioTransportFadeEnabled = false;
  let systemAudioTransportFadeInMs = 80;
  let systemAudioTransportFadeOutMs = 80;
  let systemAudioTransportFadeCurve = "smooth";
  let lastNativeAudioStatus = null;
  let systemPlaybackGeneration = 0;
  let systemMediaPlaybackContext = null;
  let systemAudioStartupPositionGuard = null;
  let systemReplayGainEnabled = false;
  let systemReplayGainMode = "track";
  let systemReplayGainTargetLufs = DEFAULT_REPLAY_GAIN_TARGET_LUFS;
  let systemReplayGainCalculation = {
    appliedDb: 0,
    preventedClipping: false,
    active: false
  };
  let systemChannelBalanceMonoMode = "off";
  let systemOutputSettings = {
    volume: 1,
    playbackRate: 1,
    playbackSpeedMode: "nightcore"
  };
  const isHttpUrl = (value) => /^https?:\/\//iu.test(value.trim());
  const systemAudioTransportFadeStepMs = 10;
  const systemAudioStartupPositionGuardMs = 3e3;
  const systemAudioStartupPositionToleranceSeconds = 1.5;
  const audioTransportFadeCurves = /* @__PURE__ */ new Set(["linear", "smooth", "equalPower"]);
  const isRendererReadyUrl = (value) => /^(?:blob|data):/iu.test(value.trim());
  const nativePreferredSystemLocalAudioExtensions = /* @__PURE__ */ new Set([".ape"]);
  const getPlaybackPathExtension = (filePath) => {
    const pathPart = filePath.trim().replace(/[?#].*$/u, "");
    const fileName = pathPart.split(/[\\/]/u).pop() ?? pathPart;
    const dotIndex = fileName.lastIndexOf(".");
    if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
      return "";
    }
    return fileName.slice(dotIndex).toLowerCase();
  };
  const isNativePreferredSystemLocalPath = (filePath) => {
    const rawPath = filePath?.trim() ?? "";
    return rawPath.length > 0 && !isHttpUrl(rawPath) && !isRendererReadyUrl(rawPath) && nativePreferredSystemLocalAudioExtensions.has(getPlaybackPathExtension(rawPath));
  };
  const hashPathForDiagnostics = (value) => {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  };
  const safePathForDiagnostics = (value) => {
    const raw = value?.trim();
    if (!raw) {
      return null;
    }
    const normalized = raw.replace(/\\/gu, "/");
    const basename = normalized.split("/").filter(Boolean).at(-1) ?? raw;
    return { basename, pathHash: hashPathForDiagnostics(raw) };
  };
  const inferContainerForDiagnostics = (value, mimeType) => {
    const mimeSubtype = mimeType?.split(";", 1)[0]?.split("/").at(-1)?.trim();
    if (mimeSubtype) {
      return mimeSubtype.toUpperCase();
    }
    const pathPart = value?.split(/[?#]/u, 1)[0] ?? "";
    const extension = /\.([a-z0-9]+)$/iu.exec(pathPart)?.[1];
    return extension ? extension.toUpperCase() : null;
  };
  const sourceTechnicalDiagnostics = (source) => {
    const probe = source?.probe;
    const container = inferContainerForDiagnostics(source?.filePath, source?.mimeType);
    const duration = finiteSeconds(probe?.durationSeconds) ?? finiteSeconds(source?.durationSeconds) ?? null;
    const codec = typeof probe?.codec === "string" && probe.codec.trim() ? probe.codec : null;
    const fileSampleRate = typeof probe?.fileSampleRate === "number" && Number.isFinite(probe.fileSampleRate) ? probe.fileSampleRate : null;
    const bitDepth = typeof probe?.bitDepth === "number" && Number.isFinite(probe.bitDepth) ? probe.bitDepth : null;
    const bitrate = typeof probe?.bitrate === "number" && Number.isFinite(probe.bitrate) ? probe.bitrate : null;
    const channels = typeof probe?.channels === "number" && Number.isFinite(probe.channels) ? probe.channels : null;
    return {
      codec,
      container,
      duration,
      fileSampleRate,
      bitDepth,
      firstFfprobeResult: probe ? {
        codec,
        container,
        duration,
        fileSampleRate,
        bitDepth,
        bitrate,
        channels
      } : null
    };
  };
  const errorMessage = (error) => error instanceof Error ? error.message : String(error);
  const errorName = (error) => {
    if (error instanceof Error) {
      return error.name;
    }
    if (error && typeof error === "object" && typeof error.name === "string") {
      return error.name;
    }
    return null;
  };
  const isExpectedSystemPlaybackInterruption = (error) => {
    const message = errorMessage(error);
    if (message.includes(systemPlaybackSupersededMessage)) {
      return true;
    }
    if (systemPlayInterruptedByTransportPattern.test(message)) {
      return true;
    }
    return errorName(error) === "AbortError" && /\bplay\(\)|HTMLMediaElement/iu.test(message);
  };
  const htmlAudioSrcType = (value) => {
    const raw = value?.trim() ?? "";
    if (!raw) {
      return "empty";
    }
    if (/^blob:/iu.test(raw)) {
      return "blob";
    }
    if (/^data:/iu.test(raw)) {
      return "data";
    }
    if (/^https?:/iu.test(raw)) {
      return "http";
    }
    if (/^echo-audio:/iu.test(raw)) {
      return "echo-audio";
    }
    if (/^file:/iu.test(raw)) {
      return "file";
    }
    return "other";
  };
  const isLocalSystemSource = (source) => {
    const rawUrl = source?.filePath?.trim() ?? "";
    return rawUrl.length > 0 && !isHttpUrl(rawUrl) && !isRendererReadyUrl(rawUrl);
  };
  const isSystemNetworkMediaPlayback = () => {
    const mediaType = systemMediaPlaybackContext?.request.item.mediaType;
    if (mediaType === "remote" || mediaType === "streaming") {
      return true;
    }
    const rawUrl = systemAudioSource?.filePath?.trim() ?? "";
    return rawUrl.length > 0 && isHttpUrl(rawUrl);
  };
  const createSystemAudioMediaErrorMessage = (element, fallback = "system_audio_playback_failed") => {
    const code = typeof element.error?.code === "number" ? element.error.code : null;
    const nativeMessage = element.error?.message?.trim() ?? "";
    if (code === 3) {
      return nativeMessage ? `system_audio_decode_error: ${nativeMessage}` : "system_audio_decode_error";
    }
    if (code === 4) {
      return nativeMessage ? `system_audio_source_not_supported: ${nativeMessage}` : "system_audio_source_not_supported";
    }
    return nativeMessage || fallback;
  };
  const createSystemAudioPrematureEndMessage = (positionSeconds, durationSeconds) => `system_audio_decode_error; positionSeconds=${positionSeconds.toFixed(3)}; durationSeconds=${durationSeconds.toFixed(3)}`;
  const createSystemAudioLooseDurationMessage = (positionSeconds, durationSeconds) => `system_audio_ended_before_reported_duration; positionSeconds=${positionSeconds.toFixed(3)}; durationSeconds=${durationSeconds.toFixed(3)}`;
  const isClearlyCorruptSystemEnd = (positionSeconds, durationSeconds) => durationSeconds > 0 && positionSeconds < durationSeconds - systemPrematureEndToleranceSeconds && positionSeconds / durationSeconds < systemCorruptEndRatioThreshold;
  const nextSystemPlaybackGeneration = () => {
    systemPlaybackGeneration += 1;
    return systemPlaybackGeneration;
  };
  const sourceDiagnostics = (source) => {
    const rawUrl = source?.filePath?.trim() ?? "";
    if (!rawUrl) {
      return { sourceKind: void 0, sourceHost: null, mimeType: source?.mimeType ?? null };
    }
    if (isRendererReadyUrl(rawUrl)) {
      return { sourceKind: "renderer", sourceHost: null, mimeType: source?.mimeType ?? null };
    }
    if (isHttpUrl(rawUrl)) {
      try {
        return { sourceKind: "remote", sourceHost: new URL(rawUrl).host, mimeType: source?.mimeType ?? null };
      } catch {
        return { sourceKind: "remote", sourceHost: null, mimeType: source?.mimeType ?? null };
      }
    }
    return { sourceKind: "local", sourceHost: null, mimeType: source?.mimeType ?? null };
  };
  const htmlAudioDiagnostics = () => {
    const element = systemAudioElement;
    const src = element?.currentSrc || element?.src;
    return {
      networkState: typeof element?.networkState === "number" ? element.networkState : null,
      readyState: typeof element?.readyState === "number" ? element.readyState : null,
      errorCode: typeof element?.error?.code === "number" ? element.error.code : null,
      errorMessage: element?.error?.message ?? null,
      srcType: htmlAudioSrcType(src)
    };
  };
  const mediaRequestDiagnostics = (request) => {
    const item = request?.item;
    if (!item) {
      return {};
    }
    return {
      mediaType: item.mediaType,
      provider: item.mediaType === "streaming" ? item.provider : null,
      trackId: item.trackId
    };
  };
  const reportSystemPlaybackError = (report) => {
    void ipcRenderer2.invoke(IpcChannels2.AudioReportSystemPlaybackError, report).catch(() => void 0);
  };
  const createSystemPlaybackErrorReportBase = (source) => ({
    currentFilePath: safePathForDiagnostics(source?.filePath),
    ...sourceDiagnostics(source),
    ...sourceTechnicalDiagnostics(source)
  });
  const createFallbackAudioStatus = () => ({
    host: "ready",
    state: "idle",
    outputDeviceId: null,
    outputDeviceName: systemAudioDeviceName,
    outputDeviceType: "system",
    outputBackend: systemAudioOutputBackend,
    activeOutputBackendImpl: systemAudioBackendImpl,
    activeOutputBackendLabel: systemAudioBackendImpl,
    outputMode: "system",
    sharedBackend: "auto",
    backendContractVersion: audioBackendContractVersion,
    useNativeOutputRequested: false,
    useMiniaudioOutputRequested: false,
    useLibavDecodeRequested: false,
    activeDecodeBackendLabel: "chromium-media",
    activeDecodeBackendImpl: "chromium-media",
    dsdOutputModeRequested: "pcm",
    activeDsdOutputMode: null,
    dsdNativeSampleRate: null,
    dsdTransportSampleRate: null,
    volume: systemOutputSettings.volume,
    playbackRate: systemOutputSettings.playbackRate,
    playbackSpeedMode: systemOutputSettings.playbackSpeedMode,
    replayGainEnabled: false,
    replayGainMode: "track",
    replayGainAppliedDb: 0,
    replayGainPreventedClipping: false,
    currentFilePath: null,
    currentTrackId: null,
    currentTrackTitle: null,
    currentTrackArtist: null,
    currentTrackAlbum: null,
    currentTrackAlbumArtist: null,
    currentTrackCoverUrl: null,
    durationSeconds: 0,
    positionSeconds: 0,
    channels: null,
    codec: null,
    bitDepth: null,
    bitrate: null,
    fileSampleRate: null,
    decoderOutputSampleRate: null,
    requestedOutputSampleRate: null,
    actualDeviceSampleRate: null,
    sharedDeviceSampleRate: null,
    resampling: false,
    ffmpegPath: null,
    ffmpegSource: null,
    ffmpegVersion: null,
    ffmpegHealthy: false,
    soxrAvailable: false,
    resamplerEngine: "default",
    resamplerFallbackActive: false,
    echoSrcMode: "off",
    echoSrcQualityProfile: "transparent",
    echoSrcTargetSampleRate: null,
    echoSrcActive: false,
    bitPerfectCandidate: false,
    sampleRateMismatch: false,
    latencyProfile: "balanced",
    eqEnabled: false,
    roomCorrectionEnabled: false,
    channelBalanceEnabled: systemChannelBalanceActive(),
    dspActive: systemChannelBalanceActive(),
    preampDb: 0,
    eqPresetName: null,
    clippingRisk: false,
    bitPerfectDisabledReason: systemAudioWarning,
    sharedStabilityTier: null,
    nativeDeviceBufferFrames: null,
    nativeRequestedBufferFrames: null,
    nativeActualBufferFrames: null,
    nativeOutputLatencyMs: null,
    nativePositionStalenessMs: null,
    nativeFifoCapacityFrames: null,
    nativeStartupPrebufferFrames: null,
    nativeBufferedFrames: null,
    nativeBufferedMs: null,
    nativeUnderrunCallbacks: 0,
    nativeUnderrunFrames: 0,
    lastSharedStabilityRecoveryAt: null,
    warnings: [systemAudioWarning],
    error: null
  });
  const finiteSeconds = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
  const getSystemDurationSeconds = () => {
    const elementDuration = finiteSeconds(systemAudioElement?.duration);
    const sourceDuration = finiteSeconds(systemAudioSource?.durationSeconds ?? void 0);
    const probeDuration = finiteSeconds(systemAudioSource?.probe?.durationSeconds);
    return elementDuration ?? sourceDuration ?? probeDuration ?? 0;
  };
  const getSystemPositionSeconds = () => finiteSeconds(systemAudioElement?.currentTime) ?? 0;
  const getSystemStatusPositionSeconds = () => {
    if (!systemAudioSource && (systemAudioState === "idle" || systemAudioState === "stopped")) {
      systemAudioStartupPositionGuard = null;
      return 0;
    }
    const actual = getSystemPositionSeconds();
    const guard = systemAudioStartupPositionGuard;
    if (!guard) {
      return actual;
    }
    const sameGeneration = guard.generation === systemPlaybackGeneration;
    const sameSource = systemAudioSource?.trackId === guard.trackId && systemAudioSource?.filePath === guard.filePath;
    if (!sameGeneration || !sameSource || systemAudioState === "idle" || systemAudioState === "stopped" || systemAudioState === "ended" || systemAudioState === "error") {
      systemAudioStartupPositionGuard = null;
      return actual;
    }
    const elapsedSeconds = Math.max(0, (performance.now() - guard.startedAtMs) / 1e3);
    const guardExpired = elapsedSeconds * 1e3 > systemAudioStartupPositionGuardMs;
    const expected = systemAudioState === "playing" ? guard.expectedStartSeconds + elapsedSeconds * systemOutputSettings.playbackRate : guard.expectedStartSeconds;
    const actualLooksLikeOldPosition = Math.abs(actual - expected) > systemAudioStartupPositionToleranceSeconds;
    if (!guardExpired && actualLooksLikeOldPosition) {
      const duration = getSystemDurationSeconds();
      return duration > 0 ? Math.min(expected, duration) : Math.max(0, expected);
    }
    if (!actualLooksLikeOldPosition || guardExpired) {
      systemAudioStartupPositionGuard = null;
    }
    return actual;
  };
  const systemPositionMatches = (element, targetSeconds) => {
    const currentSeconds = finiteSeconds(element.currentTime);
    return currentSeconds !== null && Math.abs(currentSeconds - targetSeconds) <= systemSeekToleranceSeconds;
  };
  const waitForSystemSeekConfirmed = (element, targetSeconds, generation) => {
    if (systemPositionMatches(element, targetSeconds)) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      let timeoutId = null;
      let maybeResolve = () => void 0;
      let rejectForElementError = () => void 0;
      const cleanup = () => {
        if (timeoutId !== null) {
          globalThis.clearTimeout(timeoutId);
          timeoutId = null;
        }
        for (const event of systemSeekConfirmEvents) {
          element.removeEventListener(event, maybeResolve);
        }
        element.removeEventListener("error", rejectForElementError);
      };
      const finish = (error) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };
      maybeResolve = () => {
        if (generation !== systemPlaybackGeneration) {
          finish(new Error(systemPlaybackSupersededMessage));
          return;
        }
        if (systemPositionMatches(element, targetSeconds)) {
          finish();
        }
      };
      rejectForElementError = () => {
        finish(new Error(createSystemAudioMediaErrorMessage(element, systemAudioError || "system_audio_playback_failed")));
      };
      for (const event of systemSeekConfirmEvents) {
        element.addEventListener(event, maybeResolve);
      }
      element.addEventListener("error", rejectForElementError);
      timeoutId = globalThis.setTimeout(() => finish(new Error("system_audio_seek_timeout")), systemSeekConfirmTimeoutMs);
      maybeResolve();
    });
  };
  const createSystemAudioStatus = () => {
    const base = lastNativeAudioStatus ?? createFallbackAudioStatus();
    const probe = systemAudioSource?.probe;
    const warnings = /* @__PURE__ */ new Set([...Array.isArray(base.warnings) ? base.warnings : [], systemAudioWarning]);
    return {
      ...base,
      host: "ready",
      state: systemAudioState,
      outputDeviceId: null,
      outputDeviceName: systemAudioDeviceName,
      outputDeviceType: "system",
      outputBackend: systemAudioOutputBackend,
      activeOutputBackendImpl: systemAudioBackendImpl,
      activeOutputBackendLabel: systemAudioBackendImpl,
      outputMode: "system",
      sharedBackend: "auto",
      backendContractVersion: audioBackendContractVersion,
      useNativeOutputRequested: false,
      useMiniaudioOutputRequested: false,
      useLibavDecodeRequested: false,
      activeDecodeBackendLabel: "chromium-media",
      activeDecodeBackendImpl: "chromium-media",
      dsdOutputModeRequested: "pcm",
      activeDsdOutputMode: null,
      dsdNativeSampleRate: null,
      dsdTransportSampleRate: null,
      volume: systemOutputSettings.volume,
      playbackRate: systemOutputSettings.playbackRate,
      playbackSpeedMode: systemOutputSettings.playbackSpeedMode,
      replayGainEnabled: systemReplayGainEnabled,
      replayGainMode: systemReplayGainMode,
      replayGainAppliedDb: systemReplayGainCalculation.appliedDb,
      replayGainPreventedClipping: systemReplayGainCalculation.preventedClipping,
      currentFilePath: systemAudioSource?.filePath ?? null,
      currentTrackId: systemAudioSource?.trackId ?? null,
      currentQueueItemId: null,
      queueRevision: null,
      currentTrackTitle: systemAudioSource?.metadata?.title ?? null,
      currentTrackArtist: systemAudioSource?.metadata?.artist ?? null,
      currentTrackAlbum: systemAudioSource?.metadata?.album ?? null,
      currentTrackAlbumArtist: systemAudioSource?.metadata?.albumArtist ?? null,
      currentTrackCoverUrl: systemAudioSource?.metadata?.coverUrl ?? null,
      durationSeconds: getSystemDurationSeconds(),
      positionSeconds: getSystemStatusPositionSeconds(),
      channels: probe?.channels ?? null,
      codec: probe?.codec ?? null,
      bitDepth: probe?.bitDepth ?? null,
      bitrate: probe?.bitrate ?? null,
      fileSampleRate: probe?.fileSampleRate ?? null,
      decoderOutputSampleRate: probe?.fileSampleRate ?? null,
      requestedOutputSampleRate: null,
      actualDeviceSampleRate: null,
      sharedDeviceSampleRate: null,
      resampling: false,
      echoSrcMode: "off",
      echoSrcQualityProfile: "transparent",
      echoSrcTargetSampleRate: null,
      echoSrcActive: false,
      bitPerfectCandidate: false,
      sampleRateMismatch: false,
      latencyProfile: "balanced",
      eqEnabled: false,
      roomCorrectionEnabled: false,
      channelBalanceEnabled: systemChannelBalanceActive(),
      dspActive: systemChannelBalanceActive() || systemReplayGainCalculation.active && Math.abs(systemReplayGainCalculation.appliedDb) >= 1e-3,
      preampDb: 0,
      eqPresetName: null,
      clippingRisk: false,
      audioLevels: void 0,
      bitPerfectDisabledReason: systemAudioWarning,
      sharedStabilityTier: null,
      nativeDeviceBufferFrames: null,
      nativeRequestedBufferFrames: null,
      nativeActualBufferFrames: null,
      nativeOutputLatencyMs: null,
      nativePositionStalenessMs: null,
      nativeFifoCapacityFrames: null,
      nativeStartupPrebufferFrames: null,
      nativeBufferedFrames: null,
      nativeBufferedMs: null,
      nativeUnderrunCallbacks: 0,
      nativeUnderrunFrames: 0,
      lastSharedStabilityRecoveryAt: null,
      warnings: Array.from(warnings),
      error: systemAudioError
    };
  };
  let lastEmittedTrackId = null;
  let lastEmittedFilePath = null;
  const emitTrackChangeIfNeeded = () => {
    const trackId = systemAudioSource?.trackId ?? null;
    const filePath = systemAudioSource?.filePath ?? null;
    if (trackId !== lastEmittedTrackId || filePath !== lastEmittedFilePath) {
      lastEmittedTrackId = trackId;
      lastEmittedFilePath = filePath;
      for (const handler of trackChangeHandlers) {
        handler(trackId, filePath);
      }
    }
  };
  const emitSystemAudioStatus = () => {
    const status = createSystemAudioStatus();
    emitTrackChangeIfNeeded();
    for (const handler of audioStatusHandlers) {
      handler(status);
    }
    if (typeof ipcRenderer2.send === "function") {
      ipcRenderer2.send(IpcChannels2.DesktopLyricsRendererAudioStatus, status);
    }
    return status;
  };
  const startSystemStatusTimer = () => {
    if (systemAudioStatusTimer !== null) {
      return;
    }
    systemAudioStatusTimer = window.setInterval(() => {
      if (systemAudioModeActive && (systemAudioState === "playing" || systemAudioState === "loading")) {
        emitSystemAudioStatus();
      }
    }, 500);
  };
  const stopSystemStatusTimer = () => {
    if (systemAudioStatusTimer === null) {
      return;
    }
    window.clearInterval(systemAudioStatusTimer);
    systemAudioStatusTimer = null;
  };
  const replayGainLinearGain = () => systemReplayGainCalculation.active && Math.abs(systemReplayGainCalculation.appliedDb) >= 1e-3 ? Math.max(0, Math.min(16, dbToLinearGain(systemReplayGainCalculation.appliedDb))) : 1;
  const systemChannelBalanceActive = () => systemChannelBalanceMonoMode !== "off";
  const disconnectAudioNode = (node) => {
    try {
      node?.disconnect();
    } catch {
    }
  };
  const connectSystemAudioGraph = () => {
    if (!systemAudioContext || !systemAudioSourceNode || !systemAudioGainNode) {
      return;
    }
    disconnectAudioNode(systemAudioSourceNode);
    disconnectAudioNode(systemAudioSplitterNode);
    disconnectAudioNode(systemAudioMonoLeftGainNode);
    disconnectAudioNode(systemAudioMonoRightGainNode);
    disconnectAudioNode(systemAudioMonoMergerNode);
    disconnectAudioNode(systemAudioGainNode);
    if (!systemChannelBalanceActive()) {
      systemAudioSourceNode.connect(systemAudioGainNode);
      systemAudioGainNode.connect(systemAudioContext.destination);
      return;
    }
    systemAudioSplitterNode = systemAudioSplitterNode ?? systemAudioContext.createChannelSplitter(2);
    systemAudioMonoLeftGainNode = systemAudioMonoLeftGainNode ?? systemAudioContext.createGain();
    systemAudioMonoRightGainNode = systemAudioMonoRightGainNode ?? systemAudioContext.createGain();
    systemAudioMonoMergerNode = systemAudioMonoMergerNode ?? systemAudioContext.createChannelMerger(2);
    const leftGain = systemChannelBalanceMonoMode === "right" ? 0 : systemChannelBalanceMonoMode === "sum" ? 0.5 : 1;
    const rightGain = systemChannelBalanceMonoMode === "left" ? 0 : systemChannelBalanceMonoMode === "sum" ? 0.5 : 1;
    systemAudioMonoLeftGainNode.gain.value = leftGain;
    systemAudioMonoRightGainNode.gain.value = rightGain;
    systemAudioSourceNode.connect(systemAudioSplitterNode);
    systemAudioSplitterNode.connect(systemAudioMonoLeftGainNode, 0);
    systemAudioSplitterNode.connect(systemAudioMonoRightGainNode, 1);
    systemAudioMonoLeftGainNode.connect(systemAudioMonoMergerNode, 0, 0);
    systemAudioMonoRightGainNode.connect(systemAudioMonoMergerNode, 0, 1);
    if (systemChannelBalanceMonoMode === "sum") {
      systemAudioMonoLeftGainNode.connect(systemAudioMonoMergerNode, 0, 1);
      systemAudioMonoRightGainNode.connect(systemAudioMonoMergerNode, 0, 0);
    }
    systemAudioMonoMergerNode.connect(systemAudioGainNode);
    systemAudioGainNode.connect(systemAudioContext.destination);
  };
  const applySystemChannelBalanceState = (state) => {
    const monoMode = state?.enabled === true && (state.monoMode === "sum" || state.monoMode === "left" || state.monoMode === "right") ? state.monoMode : "off";
    if (monoMode === systemChannelBalanceMonoMode) {
      return;
    }
    systemChannelBalanceMonoMode = monoMode;
    connectSystemAudioGraph();
    if (systemAudioModeActive) {
      emitSystemAudioStatus();
    }
  };
  const ensureSystemAudioGraph = (element) => {
    if (systemAudioGainNode) {
      return;
    }
    const AudioContextConstructor = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextConstructor) {
      return;
    }
    try {
      systemAudioContext = systemAudioContext ?? new AudioContextConstructor();
      systemAudioSourceNode = systemAudioSourceNode ?? systemAudioContext.createMediaElementSource(element);
      systemAudioGainNode = systemAudioContext.createGain();
      connectSystemAudioGraph();
    } catch {
      systemAudioGainNode = null;
    }
  };
  const applySystemElementOutput = () => {
    if (!systemAudioElement) {
      return;
    }
    systemAudioElement.playbackRate = systemOutputSettings.playbackRate;
    const preservesPitch = systemOutputSettings.playbackSpeedMode === "speed";
    const pitchElement = systemAudioElement;
    pitchElement.preservesPitch = preservesPitch;
    pitchElement.mozPreservesPitch = preservesPitch;
    pitchElement.webkitPreservesPitch = preservesPitch;
    if (systemAudioGainNode) {
      systemAudioElement.volume = systemOutputSettings.volume;
      systemAudioGainNode.gain.value = replayGainLinearGain() * systemAudioTransportGain;
      return;
    }
    systemAudioElement.volume = Math.max(0, Math.min(1, systemOutputSettings.volume * replayGainLinearGain() * systemAudioTransportGain));
  };
  const setSystemAudioTransportGain = (gain) => {
    systemAudioTransportGain = Math.max(0, Math.min(1, Number.isFinite(gain) ? gain : 1));
    applySystemElementOutput();
  };
  const cancelSystemAudioTransportFade = (restoreGain = true) => {
    systemAudioFadeGeneration += 1;
    if (restoreGain) {
      setSystemAudioTransportGain(1);
    }
  };
  const waitForSystemAudioFadeStep = (durationMs) => new Promise((resolve) => {
    globalThis.setTimeout(resolve, Math.max(0, durationMs));
  });
  const normalizeSystemAudioTransportFadeDurationMs = (value, fallback = 80) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.round(Math.max(0, Math.min(2e3, numeric))) : fallback;
  };
  const normalizeSystemAudioTransportFadeCurve = (value) => audioTransportFadeCurves.has(value) ? value : "smooth";
  const applySystemAudioTransportFadeCurve = (progress, curve) => {
    const clamped = Math.max(0, Math.min(1, progress));
    if (curve === "equalPower") {
      return Math.sin(clamped * Math.PI / 2);
    }
    if (curve === "smooth") {
      return clamped * clamped * (3 - 2 * clamped);
    }
    return clamped;
  };
  const applySystemAudioTransportFadeSettings = (settings) => {
    systemAudioTransportFadeEnabled = settings?.audioTransportFadeEnabled === true;
    systemAudioTransportFadeInMs = normalizeSystemAudioTransportFadeDurationMs(settings?.audioTransportFadeInMs);
    systemAudioTransportFadeOutMs = normalizeSystemAudioTransportFadeDurationMs(settings?.audioTransportFadeOutMs);
    systemAudioTransportFadeCurve = normalizeSystemAudioTransportFadeCurve(settings?.audioTransportFadeCurve);
  };
  const getSystemAudioTransportFadeSettings = (direction) => {
    const durationMs = direction === "in" ? systemAudioTransportFadeInMs : systemAudioTransportFadeOutMs;
    return {
      enabled: systemAudioTransportFadeEnabled && durationMs > 0,
      durationMs,
      curve: systemAudioTransportFadeCurve
    };
  };
  const refreshSystemTransportFadeSettings = async () => {
    try {
      applySystemAudioTransportFadeSettings(await ipcRenderer2.invoke(IpcChannels2.AppGetSettings));
    } catch {
      applySystemAudioTransportFadeSettings(null);
    }
  };
  const fadeSystemAudioTransportGain = async (fromGain, toGain, playbackGeneration, settings) => {
    if (!settings.enabled || settings.durationMs <= 0) {
      setSystemAudioTransportGain(toGain);
      return true;
    }
    const generation = systemAudioFadeGeneration + 1;
    systemAudioFadeGeneration = generation;
    const startGain = Math.max(0, Math.min(1, Number.isFinite(fromGain) ? fromGain : 1));
    const endGain = Math.max(0, Math.min(1, Number.isFinite(toGain) ? toGain : 1));
    const steps = Math.max(1, Math.ceil(settings.durationMs / systemAudioTransportFadeStepMs));
    for (let step = 0; step <= steps; step += 1) {
      if (generation !== systemAudioFadeGeneration || playbackGeneration !== systemPlaybackGeneration) {
        return false;
      }
      const progress = applySystemAudioTransportFadeCurve(step / steps, settings.curve);
      setSystemAudioTransportGain(startGain + (endGain - startGain) * progress);
      if (step < steps) {
        await waitForSystemAudioFadeStep(systemAudioTransportFadeStepMs);
      }
    }
    return true;
  };
  const refreshSystemReplayGain = async (source) => {
    let settings = null;
    try {
      settings = await ipcRenderer2.invoke(IpcChannels2.AppGetSettings);
    } catch {
      settings = null;
    }
    applySystemAudioTransportFadeSettings(settings);
    systemReplayGainEnabled = settings?.replayGainEnabled === true;
    systemReplayGainMode = settings?.replayGainMode ?? "track";
    systemReplayGainTargetLufs = settings?.replayGainTargetLufs ?? DEFAULT_REPLAY_GAIN_TARGET_LUFS;
    systemReplayGainCalculation = calculateReplayGain({
      ...source.replayGain ?? {},
      enabled: systemReplayGainEnabled,
      mode: systemReplayGainMode,
      targetLufs: systemReplayGainTargetLufs,
      preampDb: settings?.replayGainPreampDb ?? 0,
      preventClipping: settings?.replayGainPreventClipping !== false
    });
    applySystemChannelBalanceState(settings?.channelBalance);
  };
  const applySystemOutputSettings = (settings, base) => {
    const nextVolume = typeof settings?.volume === "number" && Number.isFinite(settings.volume) ? Math.max(0, Math.min(1, settings.volume)) : base?.volume;
    const nextPlaybackRate = typeof settings?.playbackRate === "number" && Number.isFinite(settings.playbackRate) ? Math.max(0.5, Math.min(2, settings.playbackRate)) : base?.playbackRate;
    const nextPlaybackSpeedMode = settings?.playbackSpeedMode === "daycore" || settings?.playbackSpeedMode === "speed" ? settings.playbackSpeedMode : base?.playbackSpeedMode ?? systemOutputSettings.playbackSpeedMode;
    systemOutputSettings = {
      volume: nextVolume ?? systemOutputSettings.volume,
      playbackRate: nextPlaybackRate ?? systemOutputSettings.playbackRate,
      playbackSpeedMode: nextPlaybackSpeedMode
    };
    applySystemElementOutput();
  };
  const toSystemPlaybackStatus = () => ({
    state: systemAudioState,
    currentTrackId: systemAudioSource?.trackId ?? null,
    positionMs: Math.round(getSystemStatusPositionSeconds() * 1e3),
    durationMs: Math.round(getSystemDurationSeconds() * 1e3),
    filePath: systemAudioSource?.filePath ?? null
  });
  const finishInterruptedSystemPlayback = (generation, element) => {
    if (generation === systemPlaybackGeneration) {
      cancelSystemAudioTransportFade();
      systemAudioError = null;
      if (element.paused && systemAudioState !== "stopped" && systemAudioState !== "idle" && systemAudioState !== "ended") {
        systemAudioState = "paused";
      }
      if (systemAudioState !== "playing" && systemAudioState !== "loading") {
        stopSystemStatusTimer();
      }
      emitSystemAudioStatus();
    }
    return toSystemPlaybackStatus();
  };
  const ensureSystemAudioElement = () => {
    if (systemAudioElement) {
      return systemAudioElement;
    }
    const element = new Audio();
    element.preload = "auto";
    element.addEventListener("loadstart", () => {
      systemAudioState = "loading";
      systemAudioError = null;
      emitSystemAudioStatus();
    });
    element.addEventListener("loadedmetadata", () => emitSystemAudioStatus());
    element.addEventListener("playing", () => {
      systemAudioState = "playing";
      systemAudioError = null;
      startSystemStatusTimer();
      emitSystemAudioStatus();
    });
    element.addEventListener("canplay", () => {
      if (systemAudioState === "loading" && !element.paused && !element.ended) {
        systemAudioState = "playing";
        systemAudioError = null;
        startSystemStatusTimer();
        emitSystemAudioStatus();
      }
    });
    const markSystemAudioWaiting = () => {
      if (!isSystemNetworkMediaPlayback() || element.paused || element.ended || systemAudioState === "error" || systemAudioState === "stopped") {
        return;
      }
      systemAudioState = "loading";
      startSystemStatusTimer();
      emitSystemAudioStatus();
    };
    element.addEventListener("waiting", markSystemAudioWaiting);
    element.addEventListener("stalled", markSystemAudioWaiting);
    element.addEventListener("pause", () => {
      if (!element.paused) {
        return;
      }
      if (systemAudioState !== "stopped" && systemAudioState !== "ended" && systemAudioState !== "error") {
        systemAudioState = "paused";
      }
      stopSystemStatusTimer();
      emitSystemAudioStatus();
    });
    element.addEventListener("ended", () => {
      const endedAfterBrowserPause = systemAudioState === "paused" && element.ended === true;
      if (systemAudioState !== "playing" && systemAudioState !== "loading" && !endedAfterBrowserPause) {
        return;
      }
      const endedPositionSeconds = getSystemPositionSeconds();
      const durationSeconds = getSystemDurationSeconds();
      const premature = isLocalSystemSource(systemAudioSource) && durationSeconds > 0 && endedPositionSeconds < durationSeconds - systemPrematureEndToleranceSeconds;
      const clearlyCorrupt = premature && isClearlyCorruptSystemEnd(endedPositionSeconds, durationSeconds);
      if (clearlyCorrupt) {
        systemAudioState = "error";
        systemAudioError = createSystemAudioPrematureEndMessage(endedPositionSeconds, durationSeconds);
        stopSystemStatusTimer();
        emitSystemAudioStatus();
        reportSystemPlaybackError({
          phase: "system-audio-ended-before-duration",
          message: systemAudioError,
          recovered: false,
          ...mediaRequestDiagnostics(systemMediaPlaybackContext?.request ?? null),
          ...createSystemPlaybackErrorReportBase(systemAudioSource),
          trackId: systemAudioSource?.trackId ?? null,
          recoveryAttempt: systemMediaPlaybackContext?.recoveryAttempts ?? 0,
          maxRecoveryAttempts: maxSystemMediaRecoveryAttempts,
          htmlAudio: htmlAudioDiagnostics()
        });
        return;
      }
      if (premature) {
        reportSystemPlaybackError({
          phase: "system-audio-ended-before-reported-duration",
          message: createSystemAudioLooseDurationMessage(endedPositionSeconds, durationSeconds),
          recovered: true,
          ...mediaRequestDiagnostics(systemMediaPlaybackContext?.request ?? null),
          ...createSystemPlaybackErrorReportBase(systemAudioSource),
          trackId: systemAudioSource?.trackId ?? null,
          recoveryAttempt: systemMediaPlaybackContext?.recoveryAttempts ?? 0,
          maxRecoveryAttempts: maxSystemMediaRecoveryAttempts,
          htmlAudio: htmlAudioDiagnostics()
        });
      }
      systemAudioState = "ended";
      stopSystemStatusTimer();
      emitSystemAudioStatus();
    });
    element.addEventListener("error", () => {
      if (!systemAudioSource && (systemAudioState === "stopped" || systemAudioState === "idle")) {
        return;
      }
      systemAudioState = "error";
      systemAudioError = createSystemAudioMediaErrorMessage(element);
      stopSystemStatusTimer();
      emitSystemAudioStatus();
      void handleSystemPlaybackFailure("system-audio-htmlaudio-error", new Error(systemAudioError), systemPlaybackGeneration);
    });
    element.addEventListener("timeupdate", () => emitSystemAudioStatus());
    systemAudioElement = element;
    applySystemOutputSettings(null);
    return element;
  };
  const resolveSystemSourceUrl = async (source) => {
    const trimmed = source.filePath.trim();
    if (isRendererReadyUrl(trimmed)) {
      return trimmed;
    }
    return ipcRenderer2.invoke(IpcChannels2.AudioCreateSystemStreamUrl, {
      url: trimmed,
      headers: isHttpUrl(trimmed) ? source.inputHeaders : void 0,
      mimeType: source.mimeType ?? null
    });
  };
  const playSystemSource = async (source, startSeconds, options) => {
    const { generation, request = null, allowRecovery = true } = options;
    const safeStartSeconds = finiteSeconds(startSeconds) ?? 0;
    systemAudioStartupPositionGuard = {
      generation,
      trackId: source.trackId ?? null,
      filePath: source.filePath,
      expectedStartSeconds: safeStartSeconds,
      startedAtMs: performance.now()
    };
    systemAudioModeActive = true;
    systemAudioSource = source;
    systemAudioState = "loading";
    systemAudioError = null;
    if (request) {
      if (!systemMediaPlaybackContext || systemMediaPlaybackContext.generation !== generation) {
        systemMediaPlaybackContext = {
          request,
          generation,
          recoveryAttempts: 0,
          recovering: false,
          source
        };
      } else {
        systemMediaPlaybackContext.request = request;
        systemMediaPlaybackContext.source = source;
      }
    } else if (systemMediaPlaybackContext?.generation !== generation) {
      systemMediaPlaybackContext = null;
    }
    const element = ensureSystemAudioElement();
    cancelSystemAudioTransportFade();
    await refreshSystemReplayGain(source);
    ensureSystemAudioGraph(element);
    await systemAudioContext?.resume?.().catch(() => void 0);
    const sourceUrl = await resolveSystemSourceUrl(source);
    if (generation !== systemPlaybackGeneration) {
      throw new Error(systemPlaybackSupersededMessage);
    }
    element.pause();
    element.src = sourceUrl;
    applySystemElementOutput();
    element.load();
    try {
      element.currentTime = safeStartSeconds;
    } catch {
    }
    emitSystemAudioStatus();
    try {
      await element.play();
      if (generation !== systemPlaybackGeneration) {
        throw new Error(systemPlaybackSupersededMessage);
      }
      systemAudioState = "playing";
      systemAudioError = null;
      startSystemStatusTimer();
      emitSystemAudioStatus();
    } catch (error) {
      if (generation !== systemPlaybackGeneration || isExpectedSystemPlaybackInterruption(error)) {
        return finishInterruptedSystemPlayback(generation, element);
      }
      if (allowRecovery) {
        const recovered = await handleSystemPlaybackFailure("system-audio-htmlaudio-error", error, generation);
        if (recovered) {
          return recovered;
        }
      }
      systemAudioState = "error";
      systemAudioError = error instanceof Error ? error.message : String(error);
      emitSystemAudioStatus();
      throw error;
    }
    return toSystemPlaybackStatus();
  };
  const createSystemPlaybackSourceFromNativeStatus = (status) => {
    if (!status) {
      return null;
    }
    const filePath = status.currentFilePath?.trim();
    if (!filePath) {
      return null;
    }
    return {
      filePath,
      probe: {
        durationSeconds: finiteSeconds(status.durationSeconds) ?? void 0,
        fileSampleRate: status.fileSampleRate,
        channels: status.channels ?? void 0,
        codec: status.codec,
        bitDepth: status.bitDepth,
        bitrate: status.bitrate
      },
      durationSeconds: finiteSeconds(status.durationSeconds),
      trackId: status.currentTrackId ?? null,
      metadata: {
        title: status.currentTrackTitle ?? null,
        artist: status.currentTrackArtist ?? null,
        album: status.currentTrackAlbum ?? null,
        albumArtist: status.currentTrackAlbumArtist ?? null,
        coverUrl: status.currentTrackCoverUrl ?? null
      },
      mimeType: null,
      replayGain: null
    };
  };
  const canHandoffNativeStatusToSystemAudio = (status) => Boolean(
    createSystemPlaybackSourceFromNativeStatus(status) && (status?.state === "playing" || status?.state === "loading")
  );
  const handoffNativePlaybackToSystemAudio = async (status) => {
    if (!isMainPlaybackRenderer2 || !canHandoffNativeStatusToSystemAudio(status)) {
      return null;
    }
    const source = createSystemPlaybackSourceFromNativeStatus(status);
    if (!source) {
      return null;
    }
    const generation = nextSystemPlaybackGeneration();
    await ipcRenderer2.invoke(IpcChannels2.PlaybackStop).catch(() => void 0);
    await playSystemSource(source, status?.positionSeconds, {
      generation,
      request: null,
      allowRecovery: true
    });
    return createSystemAudioStatus();
  };
  const handleSystemPlaybackFailure = async (phase, error, generation) => {
    const message = errorMessage(error);
    if (generation !== systemPlaybackGeneration || isExpectedSystemPlaybackInterruption(error)) {
      return null;
    }
    const context = systemMediaPlaybackContext;
    const canRefreshMedia = context && context.generation === generation && !context.recovering && context.recoveryAttempts < maxSystemMediaRecoveryAttempts && (context.request.item.mediaType === "streaming" || context.request.item.mediaType === "remote");
    if (!canRefreshMedia) {
      reportSystemPlaybackError({
        phase,
        message,
        recovered: false,
        ...mediaRequestDiagnostics(context?.request ?? null),
        ...createSystemPlaybackErrorReportBase(context?.source ?? systemAudioSource),
        recoveryAttempt: context?.recoveryAttempts ?? 0,
        maxRecoveryAttempts: maxSystemMediaRecoveryAttempts,
        htmlAudio: htmlAudioDiagnostics()
      });
      return null;
    }
    context.recovering = true;
    context.recoveryAttempts += 1;
    const recoveryAttempt = context.recoveryAttempts;
    const startSeconds = getSystemPositionSeconds();
    try {
      const retryRequest = {
        ...context.request,
        startSeconds,
        forceRefresh: true
      };
      const resolved = await ipcRenderer2.invoke(IpcChannels2.PlaybackResolveMediaItem, retryRequest);
      if (systemMediaPlaybackContext !== context || generation !== systemPlaybackGeneration) {
        return null;
      }
      const recoveredStatus = await playSystemSource(
        {
          ...resolved,
          trackId: context.request.item.trackId,
          metadata: {
            title: context.request.item.title,
            artist: context.request.item.artist,
            album: context.request.item.album,
            albumArtist: context.request.item.albumArtist,
            coverUrl: context.request.item.coverThumb
          },
          replayGain: context.request.item.replayGain ?? null
        },
        startSeconds,
        { generation, request: context.request, allowRecovery: false }
      );
      if (systemMediaPlaybackContext !== context || generation !== systemPlaybackGeneration) {
        return null;
      }
      reportSystemPlaybackError({
        phase,
        message,
        recovered: true,
        ...mediaRequestDiagnostics(context.request),
        ...createSystemPlaybackErrorReportBase(context.source),
        recoveryAttempt,
        maxRecoveryAttempts: maxSystemMediaRecoveryAttempts,
        htmlAudio: htmlAudioDiagnostics()
      });
      return recoveredStatus;
    } catch (recoveryError) {
      if (systemMediaPlaybackContext === context && generation === systemPlaybackGeneration) {
        const recoveryMessage = recoveryError instanceof Error ? recoveryError.message : String(recoveryError);
        reportSystemPlaybackError({
          phase: "system-audio-recovery-failed",
          message: `${message}; retry="${recoveryMessage}"`,
          recovered: false,
          ...mediaRequestDiagnostics(context.request),
          ...createSystemPlaybackErrorReportBase(context.source),
          recoveryAttempt,
          maxRecoveryAttempts: maxSystemMediaRecoveryAttempts,
          htmlAudio: htmlAudioDiagnostics()
        });
      }
      return null;
    } finally {
      if (systemMediaPlaybackContext === context) {
        context.recovering = false;
      }
    }
  };
  const stopSystemPlayback = (state = "stopped", emitStatus = true) => {
    nextSystemPlaybackGeneration();
    systemAudioStartupPositionGuard = null;
    cancelSystemAudioTransportFade();
    systemMediaPlaybackContext = null;
    stopSystemStatusTimer();
    if (systemAudioElement) {
      systemAudioElement.pause();
      systemAudioElement.removeAttribute("src");
      systemAudioElement.load();
    }
    systemAudioSource = null;
    systemReplayGainCalculation = {
      appliedDb: 0,
      selectedGainDb: null,
      selectedPeak: null,
      preventedClipping: false,
      active: false
    };
    systemAudioState = state;
    systemAudioError = null;
    if (emitStatus) {
      emitSystemAudioStatus();
    }
    return toSystemPlaybackStatus();
  };
  const isSystemOutputRequest = (settings) => Boolean(settings && typeof settings === "object" && settings.outputMode === "system");
  const refreshSystemAudioModeActive = async () => {
    if (!isMainPlaybackRenderer2) {
      return false;
    }
    if (systemAudioModeActive) {
      return true;
    }
    try {
      const status = await ipcRenderer2.invoke(IpcChannels2.AudioGetStatus);
      lastNativeAudioStatus = status;
      applySystemOutputSettings(null, status);
      if (status.outputMode === "system") {
        systemAudioModeActive = true;
        return true;
      }
    } catch {
    }
    return false;
  };
  const isExplicitNativeOutputRequest = (settings) => Boolean(
    settings && typeof settings === "object" && Object.prototype.hasOwnProperty.call(settings, "outputMode") && settings.outputMode !== void 0 && settings.outputMode !== "system"
  );
  const requiresNativeChainedPlayback = (request) => request.automix?.enabled === true && Boolean(request.automix.nextItem) || request.gapless?.enabled === true && Boolean(request.gapless.nextItem);
  const requiresNativeSystemLocalPlayback = (request) => isNativePreferredSystemLocalPath(request.filePath);
  const requiresNativeSystemMediaPlayback = (request) => request.item.mediaType === "local" && isNativePreferredSystemLocalPath(request.item.path);
  const shouldUseSystemAudioMode = () => systemAudioModeActive || lastNativeAudioStatus?.outputMode === "system" || !isMainPlaybackRenderer2 && persistedSystemAudioMode;
  const shouldUseSystemAudioForPlayback = async (output) => {
    if (isSystemOutputRequest(output) || shouldUseSystemAudioMode()) {
      return true;
    }
    return refreshSystemAudioModeActive();
  };
  const playLocalFileWithSystemAudio = (request) => {
    const generation = nextSystemPlaybackGeneration();
    return playSystemSource(
      {
        filePath: request.filePath,
        probe: request.probe,
        durationSeconds: request.probe?.durationSeconds ?? null,
        trackId: request.trackId ?? null,
        metadata: request.metadata,
        mimeType: null,
        replayGain: request.replayGain ?? null
      },
      request.startSeconds,
      { generation, request: null, allowRecovery: true }
    );
  };
  const playMediaItemWithSystemAudio = async (request) => {
    const generation = nextSystemPlaybackGeneration();
    const resolved = await ipcRenderer2.invoke(IpcChannels2.PlaybackResolveMediaItem, request);
    if (generation !== systemPlaybackGeneration) {
      throw new Error(systemPlaybackSupersededMessage);
    }
    return playSystemSource({
      ...resolved,
      trackId: request.item.trackId,
      metadata: {
        title: request.item.title,
        artist: request.item.artist,
        album: request.item.album,
        albumArtist: request.item.albumArtist,
        coverUrl: request.item.coverThumb
      },
      replayGain: request.item.replayGain ?? null
    }, request.startSeconds, {
      generation,
      request,
      allowRecovery: true
    });
  };
  const play = async () => {
    const element = ensureSystemAudioElement();
    if (!element.src) {
      return toSystemPlaybackStatus();
    }
    await refreshSystemTransportFadeSettings();
    const fadeInSettings = getSystemAudioTransportFadeSettings("in");
    if (element.paused) {
      const generation = systemPlaybackGeneration;
      setSystemAudioTransportGain(fadeInSettings.enabled ? 0 : 1);
      try {
        await element.play();
      } catch (error) {
        cancelSystemAudioTransportFade();
        throw error;
      }
      if (generation !== systemPlaybackGeneration) {
        return toSystemPlaybackStatus();
      }
      systemAudioState = "playing";
      startSystemStatusTimer();
      emitSystemAudioStatus();
      await fadeSystemAudioTransportGain(systemAudioTransportGain, 1, generation, fadeInSettings);
      return toSystemPlaybackStatus();
    }
    setSystemAudioTransportGain(1);
    systemAudioState = "playing";
    startSystemStatusTimer();
    emitSystemAudioStatus();
    return toSystemPlaybackStatus();
  };
  const pause = async () => {
    const element = ensureSystemAudioElement();
    await refreshSystemTransportFadeSettings();
    const fadeOutSettings = getSystemAudioTransportFadeSettings("out");
    if (!element.paused && systemAudioState === "playing") {
      const generation = systemPlaybackGeneration;
      if (fadeOutSettings.enabled) {
        await fadeSystemAudioTransportGain(systemAudioTransportGain, 0, generation, fadeOutSettings);
      }
      if (generation !== systemPlaybackGeneration) {
        return toSystemPlaybackStatus();
      }
    }
    element.pause();
    systemAudioState = "paused";
    stopSystemStatusTimer();
    emitSystemAudioStatus();
    return toSystemPlaybackStatus();
  };
  const stop = async () => stopSystemPlayback("stopped");
  const seek = async (positionSeconds) => {
    const element = ensureSystemAudioElement();
    const durationSeconds = getSystemDurationSeconds();
    const requestedPositionSeconds = Number.isFinite(Number(positionSeconds)) ? Number(positionSeconds) : 0;
    const safePositionSeconds = durationSeconds > 0 ? Math.min(durationSeconds, Math.max(0, requestedPositionSeconds)) : Math.max(0, requestedPositionSeconds);
    try {
      element.currentTime = safePositionSeconds;
      await waitForSystemSeekConfirmed(element, safePositionSeconds, systemPlaybackGeneration);
      systemAudioError = null;
    } catch (error) {
      systemAudioError = error instanceof Error ? error.message : String(error);
      emitSystemAudioStatus();
      throw error;
    }
    emitSystemAudioStatus();
    return toSystemPlaybackStatus();
  };
  const onAudioStatus = (handler) => {
    audioStatusHandlers.add(handler);
    return () => {
      audioStatusHandlers.delete(handler);
    };
  };
  const onTrackChange = (handler) => {
    trackChangeHandlers.add(handler);
    return () => {
      trackChangeHandlers.delete(handler);
    };
  };
  const onLocalAudioFilesOpened = (handler) => {
    localAudioFileOpenHandlers.add(handler);
    for (const paths of pendingLocalAudioFileOpenEvents.splice(0)) {
      handler(paths);
    }
    return () => {
      localAudioFileOpenHandlers.delete(handler);
    };
  };
  const onAutomixAdvance = (handler) => {
    automixAdvanceHandlers.add(handler);
    return () => {
      automixAdvanceHandlers.delete(handler);
    };
  };
  return {
    onAudioStatus,
    onTrackChange,
    onLocalAudioFilesOpened,
    onAutomixAdvance,
    getSystemAudioStatus: createSystemAudioStatus,
    getSystemPlaybackStatus: toSystemPlaybackStatus,
    get lastNativeAudioStatus() {
      return lastNativeAudioStatus;
    },
    set lastNativeAudioStatus(value) {
      lastNativeAudioStatus = value;
    },
    get systemAudioModeActive() {
      return systemAudioModeActive;
    },
    set systemAudioModeActive(active) {
      systemAudioModeActive = isMainPlaybackRenderer2 && active;
    },
    get ownsSystemAudioPlayback() {
      return isMainPlaybackRenderer2;
    },
    handoffNativePlaybackToSystemAudio,
    stopSystemPlayback,
    refreshSystemAudioModeActive,
    play,
    pause,
    stop,
    seek,
    playLocalFileWithSystemAudio,
    playMediaItemWithSystemAudio,
    shouldUseSystemAudioForPlayback,
    requiresNativeChainedPlayback,
    requiresNativeSystemLocalPlayback,
    requiresNativeSystemMediaPlayback,
    isExplicitNativeOutputRequest,
    applySystemOutputSettings,
    applySystemChannelBalanceState,
    readPersistedSystemAudioMode
  };
}
function createAppApi(ipcRenderer2, IpcChannels2) {
  return {
    getVersion: () => ipcRenderer2.invoke(IpcChannels2.AppGetVersion),
    getRuntimeAudioComponentStatus: () => ipcRenderer2.invoke(IpcChannels2.AppGetRuntimeAudioComponentStatus),
    importRuntimeAudioComponent: () => ipcRenderer2.invoke(IpcChannels2.AppImportRuntimeAudioComponent),
    openRuntimeAudioComponentDownloadPage: () => ipcRenderer2.invoke(IpcChannels2.AppOpenRuntimeAudioComponentDownloadPage),
    minimize: () => ipcRenderer2.invoke(IpcChannels2.AppWindowMinimize),
    toggleMaximize: () => ipcRenderer2.invoke(IpcChannels2.AppWindowToggleMaximize),
    isMaximized: () => ipcRenderer2.invoke(IpcChannels2.AppWindowIsMaximized),
    onMaximizedChange: (handler) => {
      const listener = (_event, isMaximized) => {
        handler(isMaximized === true);
      };
      ipcRenderer2.on(IpcChannels2.AppWindowMaximizedChanged, listener);
      return () => ipcRenderer2.off(IpcChannels2.AppWindowMaximizedChanged, listener);
    },
    toggleFullscreen: () => ipcRenderer2.invoke(IpcChannels2.AppWindowToggleFullscreen),
    triggerFullscreenShortcut: () => ipcRenderer2.invoke(IpcChannels2.AppWindowTriggerFullscreenShortcut),
    isFullscreen: () => ipcRenderer2.invoke(IpcChannels2.AppWindowIsFullscreen),
    onFullscreenChange: (handler) => {
      const listener = (_event, isFullscreen) => {
        handler(isFullscreen === true);
      };
      ipcRenderer2.on(IpcChannels2.AppWindowFullscreenChanged, listener);
      return () => ipcRenderer2.off(IpcChannels2.AppWindowFullscreenChanged, listener);
    },
    close: () => ipcRenderer2.invoke(IpcChannels2.AppWindowClose),
    quit: () => ipcRenderer2.invoke(IpcChannels2.AppQuit),
    getSystemUserName: () => ipcRenderer2.invoke(IpcChannels2.AppGetSystemUserName),
    getSettings: () => ipcRenderer2.invoke(IpcChannels2.AppGetSettings),
    setSettings: (patch) => ipcRenderer2.invoke(IpcChannels2.AppSetSettings, patch),
    getTaskbarPlaybackStatus: () => ipcRenderer2.invoke(IpcChannels2.AppGetTaskbarPlaybackStatus),
    setTaskbarThumbnailArtwork: (artworkUrl) => ipcRenderer2.send(IpcChannels2.AppSetTaskbarThumbnailArtwork, artworkUrl),
    resetSettings: () => ipcRenderer2.invoke(IpcChannels2.AppResetSettings),
    exportSettings: () => ipcRenderer2.invoke(IpcChannels2.AppExportSettings),
    importSettings: () => ipcRenderer2.invoke(IpcChannels2.AppImportSettings),
    exportDataPackage: () => ipcRenderer2.invoke(IpcChannels2.AppExportDataPackage),
    chooseDataBackupDirectory: () => ipcRenderer2.invoke(IpcChannels2.AppChooseDataBackupDirectory),
    getDataBackupStatus: () => ipcRenderer2.invoke(IpcChannels2.AppGetDataBackupStatus),
    onDataBackupProgress: (handler) => {
      const listener = (_event, progress) => {
        if (progress) {
          handler(progress);
        }
      };
      ipcRenderer2.on(IpcChannels2.AppDataBackupProgress, listener);
      return () => ipcRenderer2.off(IpcChannels2.AppDataBackupProgress, listener);
    },
    runDataBackupNow: () => ipcRenderer2.invoke(IpcChannels2.AppRunDataBackupNow),
    importDataBackup: () => ipcRenderer2.invoke(IpcChannels2.AppImportDataBackup),
    openDataBackupDirectory: () => ipcRenderer2.invoke(IpcChannels2.AppOpenDataBackupDirectory),
    chooseFontFile: () => ipcRenderer2.invoke(IpcChannels2.AppChooseFontFile),
    chooseLyricsWallpaper: () => ipcRenderer2.invoke(IpcChannels2.AppChooseLyricsWallpaper),
    chooseAppWallpaper: () => ipcRenderer2.invoke(IpcChannels2.AppChooseAppWallpaper),
    loadFontFile: (path) => ipcRenderer2.invoke(IpcChannels2.AppLoadFontFile, path),
    chooseCacheDirectory: () => ipcRenderer2.invoke(IpcChannels2.AppChooseCacheDirectory),
    getDefaultCacheDirectory: () => ipcRenderer2.invoke(IpcChannels2.AppGetDefaultCacheDirectory),
    getCacheInventory: () => ipcRenderer2.invoke(IpcChannels2.AppGetCacheInventory),
    setCoverCacheDirectory: (request) => ipcRenderer2.invoke(IpcChannels2.AppSetCoverCacheDirectory, request),
    getUpdateStatus: () => ipcRenderer2.invoke(IpcChannels2.AppGetUpdateStatus),
    checkForUpdates: () => ipcRenderer2.invoke(IpcChannels2.AppCheckForUpdates),
    downloadUpdate: () => ipcRenderer2.invoke(IpcChannels2.AppDownloadUpdate),
    installUpdate: () => ipcRenderer2.invoke(IpcChannels2.AppInstallUpdate),
    onUpdateStatus: (handler) => {
      const listener = (_event, status) => {
        handler(status);
      };
      ipcRenderer2.on(IpcChannels2.AppUpdateStatusChanged, listener);
      return () => ipcRenderer2.off(IpcChannels2.AppUpdateStatusChanged, listener);
    },
    openRepository: () => ipcRenderer2.invoke(IpcChannels2.AppOpenRepository),
    openExternalUrl: (url) => ipcRenderer2.invoke(IpcChannels2.AppOpenExternalUrl, url),
    showTouchKeyboard: () => ipcRenderer2.invoke(IpcChannels2.AppShowTouchKeyboard),
    testNetworkProxy: (patch) => patch === void 0 ? ipcRenderer2.invoke(IpcChannels2.AppTestNetworkProxy) : ipcRenderer2.invoke(IpcChannels2.AppTestNetworkProxy, patch),
    getEchoProAccountStatus: (options) => options === void 0 ? ipcRenderer2.invoke(IpcChannels2.AppEchoProAccountGetStatus) : ipcRenderer2.invoke(IpcChannels2.AppEchoProAccountGetStatus, options),
    loginEchoProAccount: (credentials) => ipcRenderer2.invoke(IpcChannels2.AppEchoProAccountLogin, credentials),
    registerEchoProAccount: (credentials) => ipcRenderer2.invoke(IpcChannels2.AppEchoProAccountRegister, credentials),
    logoutEchoProAccount: () => ipcRenderer2.invoke(IpcChannels2.AppEchoProAccountLogout),
    redeemEchoProKey: (key) => ipcRenderer2.invoke(IpcChannels2.AppEchoProAccountRedeemKey, key),
    getEchoProLocalEntitlementStatus: () => ipcRenderer2.invoke(IpcChannels2.AppEchoProLocalEntitlementGetStatus),
    activateEchoProPlugin: (request) => ipcRenderer2.invoke(IpcChannels2.AppEchoProPluginActivate, request),
    releaseEchoProCurrentDevice: (orderId) => orderId === void 0 ? ipcRenderer2.invoke(IpcChannels2.AppEchoProPluginReleaseCurrentDevice) : ipcRenderer2.invoke(IpcChannels2.AppEchoProPluginReleaseCurrentDevice, orderId),
    releaseEchoProDevices: (password) => ipcRenderer2.invoke(IpcChannels2.AppEchoProAccountReleaseDevices, password),
    getEchoProMachineCode: () => ipcRenderer2.invoke(IpcChannels2.AppEchoProMachineCodeGet),
    getEchoProSettingsCloudStatus: () => ipcRenderer2.invoke(IpcChannels2.AppEchoProSettingsCloudGetStatus),
    saveEchoProSettingsCloud: () => ipcRenderer2.invoke(IpcChannels2.AppEchoProSettingsCloudSave),
    pullEchoProSettingsCloud: () => ipcRenderer2.invoke(IpcChannels2.AppEchoProSettingsCloudPull),
    applyEchoProSettingsCloud: () => ipcRenderer2.invoke(IpcChannels2.AppEchoProSettingsCloudApply),
    validateGlobalShortcut: (accelerator) => ipcRenderer2.invoke(IpcChannels2.AppValidateGlobalShortcut, accelerator),
    onGlobalShortcutCommand: (handler) => {
      const listener = (_event, action) => {
        handler(action);
      };
      ipcRenderer2.on(IpcChannels2.AppGlobalShortcutCommand, listener);
      return () => ipcRenderer2.off(IpcChannels2.AppGlobalShortcutCommand, listener);
    }
  };
}
function createDesktopLyricsApi(ipcRenderer2, IpcChannels2) {
  let lastHandledRevealRequestId = 0;
  let pendingRevealMenuToggle = false;
  const revealMenuHandlers = /* @__PURE__ */ new Set();
  ipcRenderer2.on(IpcChannels2.DesktopLyricsRevealMenu, (_event, requestId) => {
    const normalizedRequestId = typeof requestId === "number" && Number.isSafeInteger(requestId) && requestId > 0 ? requestId : null;
    if (normalizedRequestId !== null) {
      if (normalizedRequestId <= lastHandledRevealRequestId) {
        return;
      }
      lastHandledRevealRequestId = normalizedRequestId;
    }
    if (revealMenuHandlers.size === 0) {
      pendingRevealMenuToggle = !pendingRevealMenuToggle;
      return;
    }
    for (const handler of revealMenuHandlers) {
      handler();
    }
  });
  return {
    show: () => ipcRenderer2.invoke(IpcChannels2.DesktopLyricsShow),
    hide: () => ipcRenderer2.invoke(IpcChannels2.DesktopLyricsHide),
    getState: () => ipcRenderer2.invoke(IpcChannels2.DesktopLyricsGetState),
    setLocked: (locked) => ipcRenderer2.invoke(IpcChannels2.DesktopLyricsSetLocked, locked),
    setStyle: (patch) => ipcRenderer2.invoke(IpcChannels2.DesktopLyricsSetStyle, patch),
    resetBounds: () => ipcRenderer2.invoke(IpcChannels2.DesktopLyricsResetBounds),
    revealMenu: () => ipcRenderer2.invoke(IpcChannels2.DesktopLyricsRevealMenu),
    setMousePassthrough: (passthrough) => {
      ipcRenderer2.send(IpcChannels2.DesktopLyricsSetMousePassthrough, passthrough);
    },
    publishAudioStatus: (status) => {
      ipcRenderer2.send(IpcChannels2.DesktopLyricsRendererAudioStatus, status);
    },
    publishPlaybackStatus: (status) => {
      ipcRenderer2.send(IpcChannels2.DesktopLyricsRendererPlaybackStatus, status);
    },
    getLastAudioStatus: () => ipcRenderer2.invoke(IpcChannels2.DesktopLyricsGetLastAudioStatus),
    getLastPlaybackStatus: () => ipcRenderer2.invoke(IpcChannels2.DesktopLyricsGetLastPlaybackStatus),
    onStateChanged: (handler) => {
      const listener = (_event, state) => {
        handler(state);
      };
      ipcRenderer2.on(IpcChannels2.DesktopLyricsStateChanged, listener);
      return () => ipcRenderer2.off(IpcChannels2.DesktopLyricsStateChanged, listener);
    },
    onRevealMenu: (handler) => {
      revealMenuHandlers.add(handler);
      if (pendingRevealMenuToggle) {
        pendingRevealMenuToggle = false;
        handler();
      }
      return () => {
        revealMenuHandlers.delete(handler);
      };
    },
    onAudioStatus: (handler) => {
      const listener = (_event, status) => {
        handler(status);
      };
      ipcRenderer2.on(IpcChannels2.DesktopLyricsAudioStatus, listener);
      return () => ipcRenderer2.off(IpcChannels2.DesktopLyricsAudioStatus, listener);
    },
    onPlaybackStatus: (handler) => {
      const listener = (_event, status) => {
        handler(status);
      };
      ipcRenderer2.on(IpcChannels2.DesktopLyricsPlaybackStatus, listener);
      return () => ipcRenderer2.off(IpcChannels2.DesktopLyricsPlaybackStatus, listener);
    }
  };
}
function createMiniPlayerApi(ipcRenderer2, IpcChannels2) {
  return {
    show: () => ipcRenderer2.invoke(IpcChannels2.MiniPlayerShow),
    hide: (options) => options === void 0 ? ipcRenderer2.invoke(IpcChannels2.MiniPlayerHide) : ipcRenderer2.invoke(IpcChannels2.MiniPlayerHide, options),
    getState: () => ipcRenderer2.invoke(IpcChannels2.MiniPlayerGetState),
    setLocked: (locked) => ipcRenderer2.invoke(IpcChannels2.MiniPlayerSetLocked, locked),
    setQueueOpen: (open) => ipcRenderer2.invoke(IpcChannels2.MiniPlayerSetQueueOpen, open),
    resetBounds: () => ipcRenderer2.invoke(IpcChannels2.MiniPlayerResetBounds),
    onStateChanged: (handler) => {
      const listener = (_event, state) => {
        handler(state);
      };
      ipcRenderer2.on(IpcChannels2.MiniPlayerStateChanged, listener);
      return () => ipcRenderer2.off(IpcChannels2.MiniPlayerStateChanged, listener);
    }
  };
}
function createLibraryApi(ipcRenderer2, IpcChannels2, webUtils2) {
  return {
    chooseFolder: () => ipcRenderer2.invoke(IpcChannels2.LibraryChooseFolder),
    chooseImportFiles: () => ipcRenderer2.invoke(IpcChannels2.LibraryChooseImportFiles),
    addFolder: (path) => ipcRenderer2.invoke(IpcChannels2.LibraryAddFolder, path),
    classifyImportPaths: (paths) => ipcRenderer2.invoke(IpcChannels2.LibraryClassifyImportPaths, paths),
    importDroppedFiles: async (files) => {
      const payload = await Promise.all(
        Array.from(files ?? []).map(async (file) => {
          const path = webUtils2?.getPathForFile(file) || null;
          return {
            name: file.name,
            type: file.type,
            path,
            bytes: path ? null : new Uint8Array(await file.arrayBuffer())
          };
        })
      );
      return ipcRenderer2.invoke(IpcChannels2.LibraryImportDroppedFiles, payload);
    },
    getFolders: () => ipcRenderer2.invoke(IpcChannels2.LibraryGetFolders),
    importAudioFiles: (paths) => ipcRenderer2.invoke(IpcChannels2.LibraryImportAudioFiles, paths),
    getFolderOverviews: () => ipcRenderer2.invoke(IpcChannels2.LibraryGetFolderOverviews),
    getFolderChildren: (query) => ipcRenderer2.invoke(IpcChannels2.LibraryGetFolderChildren, query),
    getFolderTracks: (query) => ipcRenderer2.invoke(IpcChannels2.LibraryGetFolderTracks, query),
    openLibraryFolderPath: (request) => ipcRenderer2.invoke(IpcChannels2.LibraryOpenLibraryFolderPath, request),
    removeFolder: (folderId) => ipcRenderer2.invoke(IpcChannels2.LibraryRemoveFolder, folderId),
    scanFolder: (folderId, options) => ipcRenderer2.invoke(IpcChannels2.LibraryScanFolder, folderId, options),
    scanFolderChanges: (folderId) => ipcRenderer2.invoke(IpcChannels2.LibraryScanFolderChanges, folderId),
    rescanEmbeddedTags: (mode, options) => ipcRenderer2.invoke(IpcChannels2.LibraryRescanEmbeddedTags, mode, options),
    getScanStatus: (jobId) => ipcRenderer2.invoke(IpcChannels2.LibraryGetScanStatus, jobId),
    cancelScan: (jobId) => ipcRenderer2.invoke(IpcChannels2.LibraryCancelScan, jobId),
    getTrack: (trackId) => ipcRenderer2.invoke(IpcChannels2.LibraryGetTrack, trackId),
    getTracks: (query) => ipcRenderer2.invoke(IpcChannels2.LibraryGetTracks, query),
    getLibraryQualityOverview: () => ipcRenderer2.invoke(IpcChannels2.LibraryGetQualityOverview),
    getLibraryQualityIssues: (query) => ipcRenderer2.invoke(IpcChannels2.LibraryGetQualityIssues, query),
    getLibraryInboxBatches: () => ipcRenderer2.invoke(IpcChannels2.LibraryGetInboxBatches),
    getLibraryInboxTracks: (query) => ipcRenderer2.invoke(IpcChannels2.LibraryGetInboxTracks, query),
    createPlaylistFromLibraryInbox: (request) => ipcRenderer2.invoke(IpcChannels2.LibraryCreateInboxPlaylist, request),
    addLibraryInboxToQueue: (query) => ipcRenderer2.invoke(IpcChannels2.LibraryAddInboxToQueue, query),
    updateLibraryInboxItemState: (request) => ipcRenderer2.invoke(IpcChannels2.LibraryUpdateInboxItemState, request),
    getHealthReport: () => ipcRenderer2.invoke(IpcChannels2.LibraryGetHealthReport),
    exportHealthReport: () => ipcRenderer2.invoke(IpcChannels2.LibraryExportHealthReport),
    refreshDuplicateTracks: (mode) => ipcRenderer2.invoke(IpcChannels2.LibraryRefreshDuplicateTracks, mode),
    getDuplicateTrackVersions: (trackId) => ipcRenderer2.invoke(IpcChannels2.LibraryGetDuplicateTrackVersions, trackId),
    getDuplicateHiddenCounts: (trackIds, mode) => ipcRenderer2.invoke(IpcChannels2.LibraryGetDuplicateHiddenCounts, trackIds, mode),
    getDuplicateIndexSummary: (mode) => ipcRenderer2.invoke(IpcChannels2.LibraryGetDuplicateIndexSummary, mode),
    previewDuplicateTrackCleanup: (mode) => ipcRenderer2.invoke(IpcChannels2.LibraryPreviewDuplicateTrackCleanup, mode),
    applyDuplicateTrackCleanup: (request) => ipcRenderer2.invoke(IpcChannels2.LibraryApplyDuplicateTrackCleanup, request),
    getPlaylists: () => ipcRenderer2.invoke(IpcChannels2.LibraryGetPlaylists),
    createPlaylist: (request) => ipcRenderer2.invoke(IpcChannels2.LibraryCreatePlaylist, request),
    createSmartPlaylist: (request) => ipcRenderer2.invoke(IpcChannels2.LibraryCreateSmartPlaylist, request),
    updatePlaylist: (request) => ipcRenderer2.invoke(IpcChannels2.LibraryUpdatePlaylist, request),
    deletePlaylist: (playlistId) => ipcRenderer2.invoke(IpcChannels2.LibraryDeletePlaylist, playlistId),
    getPlaylist: (playlistId) => ipcRenderer2.invoke(IpcChannels2.LibraryGetPlaylist, playlistId),
    getPlaylistItems: (playlistId, query) => ipcRenderer2.invoke(IpcChannels2.LibraryGetPlaylistItems, playlistId, query),
    importPlaylistFile: () => ipcRenderer2.invoke(IpcChannels2.LibraryImportPlaylistFile),
    exportPlaylist: (request) => ipcRenderer2.invoke(IpcChannels2.LibraryExportPlaylist, request),
    addTrackToPlaylist: (playlistId, trackId) => ipcRenderer2.invoke(IpcChannels2.LibraryAddTrackToPlaylist, playlistId, trackId),
    addStreamingTrackToPlaylist: (playlistId, track) => ipcRenderer2.invoke(IpcChannels2.LibraryAddStreamingTrackToPlaylist, playlistId, track),
    addTracksToPlaylist: (playlistId, trackIds) => ipcRenderer2.invoke(IpcChannels2.LibraryAddTracksToPlaylist, playlistId, trackIds),
    addLocalAudioFilesToPlaylist: (playlistId, paths) => ipcRenderer2.invoke(IpcChannels2.LibraryAddLocalAudioFilesToPlaylist, playlistId, paths),
    removePlaylistItem: (itemId) => ipcRenderer2.invoke(IpcChannels2.LibraryRemovePlaylistItem, itemId),
    movePlaylistItem: (playlistId, itemId, targetPosition) => ipcRenderer2.invoke(IpcChannels2.LibraryMovePlaylistItem, playlistId, itemId, targetPosition),
    clearPlaylist: (playlistId) => ipcRenderer2.invoke(IpcChannels2.LibraryClearPlaylist, playlistId),
    getLikedSongsPlaylist: () => ipcRenderer2.invoke(IpcChannels2.LibraryGetLikedSongsPlaylist),
    getLikedAlbumsPlaylist: () => ipcRenderer2.invoke(IpcChannels2.LibraryGetLikedAlbumsPlaylist),
    getLikedTracks: (query) => ipcRenderer2.invoke(IpcChannels2.LibraryGetLikedTracks, query),
    getLikedAlbums: (query) => ipcRenderer2.invoke(IpcChannels2.LibraryGetLikedAlbums, query),
    isTrackLiked: (trackId) => ipcRenderer2.invoke(IpcChannels2.LibraryIsTrackLiked, trackId),
    isAlbumLiked: (albumId) => ipcRenderer2.invoke(IpcChannels2.LibraryIsAlbumLiked, albumId),
    getLikedTrackIds: (trackIds) => ipcRenderer2.invoke(IpcChannels2.LibraryGetLikedTrackIds, trackIds),
    getLikedAlbumIds: (albumIds) => ipcRenderer2.invoke(IpcChannels2.LibraryGetLikedAlbumIds, albumIds),
    likeTrack: (trackId) => ipcRenderer2.invoke(IpcChannels2.LibraryLikeTrack, trackId),
    unlikeTrack: (trackId) => ipcRenderer2.invoke(IpcChannels2.LibraryUnlikeTrack, trackId),
    toggleTrackLiked: (trackId) => ipcRenderer2.invoke(IpcChannels2.LibraryToggleTrackLiked, trackId),
    likeAlbum: (albumId) => ipcRenderer2.invoke(IpcChannels2.LibraryLikeAlbum, albumId),
    unlikeAlbum: (albumId) => ipcRenderer2.invoke(IpcChannels2.LibraryUnlikeAlbum, albumId),
    toggleAlbumLiked: (albumId) => ipcRenderer2.invoke(IpcChannels2.LibraryToggleAlbumLiked, albumId),
    clearLikedTracks: (query) => ipcRenderer2.invoke(IpcChannels2.LibraryClearLikedTracks, query),
    clearLikedAlbums: (query) => ipcRenderer2.invoke(IpcChannels2.LibraryClearLikedAlbums, query),
    getAlbums: (query) => ipcRenderer2.invoke(IpcChannels2.LibraryGetAlbums, query),
    getAlbum: (albumId) => ipcRenderer2.invoke(IpcChannels2.LibraryGetAlbum, albumId),
    getAlbumOnlineInfo: (albumId, options) => ipcRenderer2.invoke(IpcChannels2.LibraryGetAlbumOnlineInfo, albumId, options),
    getAlbumForTrack: (trackId) => ipcRenderer2.invoke(IpcChannels2.LibraryGetAlbumForTrack, trackId),
    getArtists: (query) => ipcRenderer2.invoke(IpcChannels2.LibraryGetArtists, query),
    getArtist: (artistId) => ipcRenderer2.invoke(IpcChannels2.LibraryGetArtist, artistId),
    getArtistInsights: (artistId, options) => ipcRenderer2.invoke(IpcChannels2.LibraryGetArtistInsights, artistId, options),
    getArtistTracks: (artistId, query) => ipcRenderer2.invoke(IpcChannels2.LibraryGetArtistTracks, artistId, query),
    getArtistAlbums: (artistId, query) => ipcRenderer2.invoke(IpcChannels2.LibraryGetArtistAlbums, artistId, query),
    clearArtistOnlineInfoCache: () => ipcRenderer2.invoke(IpcChannels2.LibraryArtistOnlineInfoClearCache),
    enqueueMissingArtistImages: (request) => ipcRenderer2.invoke(IpcChannels2.LibraryArtistImagesEnqueueMissing, request),
    refreshArtistImage: (artistId, force) => ipcRenderer2.invoke(IpcChannels2.LibraryArtistImagesRefreshOne, { artistId, force }),
    refreshVisibleArtistImages: (artists) => ipcRenderer2.invoke(IpcChannels2.LibraryArtistImagesRefreshVisible, artists),
    getArtistImageStatus: (artistId) => ipcRenderer2.invoke(IpcChannels2.LibraryArtistImagesGetStatus, artistId),
    getArtistImageCacheSummary: () => ipcRenderer2.invoke(IpcChannels2.LibraryArtistImagesGetSummary),
    getArtistImageJobStatus: () => ipcRenderer2.invoke(IpcChannels2.LibraryArtistImagesGetJobStatus),
    setArtistImageJobsPaused: (paused) => ipcRenderer2.invoke(IpcChannels2.LibraryArtistImagesSetPaused, paused),
    kickoffArtistImageBackfill: (options) => ipcRenderer2.invoke(IpcChannels2.LibraryArtistImagesKickoff, options),
    clearArtistImageCache: () => ipcRenderer2.invoke(IpcChannels2.LibraryArtistImagesClearCache),
    chooseArtistAvatar: (artistId) => ipcRenderer2.invoke(IpcChannels2.LibraryArtistImagesChooseCustom, artistId),
    setArtistAvatarFromUrl: (artistId, url) => ipcRenderer2.invoke(IpcChannels2.LibraryArtistImagesSetCustomUrl, { artistId, url }),
    clearCustomArtistAvatar: (artistId) => ipcRenderer2.invoke(IpcChannels2.LibraryArtistImagesClearCustom, artistId),
    onArtistImagesUpdated: (handler) => {
      const listener = (_event, payload) => {
        handler(payload);
      };
      ipcRenderer2.on(IpcChannels2.LibraryArtistImagesUpdated, listener);
      return () => ipcRenderer2.off(IpcChannels2.LibraryArtistImagesUpdated, listener);
    },
    onLibraryChanged: (handler) => {
      const listener = () => {
        handler();
      };
      ipcRenderer2.on(IpcChannels2.LibraryChanged, listener);
      return () => ipcRenderer2.off(IpcChannels2.LibraryChanged, listener);
    },
    onLikedTracksChanged: (handler) => {
      const listener = () => {
        handler();
      };
      ipcRenderer2.on(IpcChannels2.LibraryLikedTracksChanged, listener);
      return () => ipcRenderer2.off(IpcChannels2.LibraryLikedTracksChanged, listener);
    },
    getAlbumTracks: (albumId, query) => ipcRenderer2.invoke(IpcChannels2.LibraryGetAlbumTracks, albumId, query),
    getSummary: () => ipcRenderer2.invoke(IpcChannels2.LibraryGetSummary),
    refreshAlbumGrouping: () => ipcRenderer2.invoke(IpcChannels2.LibraryRefreshAlbumGrouping),
    getDiagnostics: () => ipcRenderer2.invoke(IpcChannels2.LibraryGetDiagnostics),
    getMoveCandidates: (options) => ipcRenderer2.invoke(IpcChannels2.LibraryGetMoveCandidates, options),
    chooseTrackCover: () => ipcRenderer2.invoke(IpcChannels2.LibraryChooseTrackCover),
    loadEmbeddedTrackTags: (trackId) => ipcRenderer2.invoke(IpcChannels2.LibraryLoadEmbeddedTrackTags, trackId),
    updateTrackTags: (request) => ipcRenderer2.invoke(IpcChannels2.LibraryUpdateTrackTags, request),
    updateAlbumTags: (request) => ipcRenderer2.invoke(IpcChannels2.LibraryUpdateAlbumTags, request),
    recordTrackPlayback: (trackId) => ipcRenderer2.invoke(IpcChannels2.LibraryRecordTrackPlayback, trackId),
    getPlaybackHistory: (query) => ipcRenderer2.invoke(IpcChannels2.LibraryGetPlaybackHistory, query),
    getPlaybackHistorySummary: (query) => ipcRenderer2.invoke(IpcChannels2.LibraryGetPlaybackHistorySummary, query),
    getPlaybackStatsDashboard: (query) => ipcRenderer2.invoke(IpcChannels2.LibraryGetPlaybackStatsDashboard, query),
    getPlaybackMemoryGraph: (query) => ipcRenderer2.invoke(IpcChannels2.LibraryGetPlaybackMemoryGraph, query),
    getContinuousPlayRecommendations: (request) => ipcRenderer2.invoke(IpcChannels2.LibraryGetContinuousPlayRecommendations, request),
    refreshInvalidPlaybackHistory: () => ipcRenderer2.invoke(IpcChannels2.LibraryRefreshInvalidPlaybackHistory),
    deletePlaybackHistoryEntry: (id) => ipcRenderer2.invoke(IpcChannels2.LibraryDeletePlaybackHistoryEntry, id),
    clearPlaybackHistory: () => ipcRenderer2.invoke(IpcChannels2.LibraryClearPlaybackHistory),
    startPlaybackHistory: (request) => ipcRenderer2.invoke(IpcChannels2.LibraryStartPlaybackHistory, request),
    finishPlaybackHistory: (request) => ipcRenderer2.invoke(IpcChannels2.LibraryFinishPlaybackHistory, request),
    openTrackInFolder: (trackId) => ipcRenderer2.invoke(IpcChannels2.LibraryOpenTrackInFolder, trackId),
    openPathInFolder: (path) => ipcRenderer2.invoke(IpcChannels2.LibraryOpenPathInFolder, path),
    openTrackWithSystem: (trackId) => ipcRenderer2.invoke(IpcChannels2.LibraryOpenTrackWithSystem, trackId),
    copyTrackPath: (trackId) => ipcRenderer2.invoke(IpcChannels2.LibraryCopyTrackPath, trackId),
    copyTrackNameArtist: (trackId) => ipcRenderer2.invoke(IpcChannels2.LibraryCopyTrackNameArtist, trackId),
    copyTrackCover: (trackId) => ipcRenderer2.invoke(IpcChannels2.LibraryCopyTrackCover, trackId),
    copyTrackOriginalCover: (trackId) => ipcRenderer2.invoke(IpcChannels2.LibraryCopyTrackOriginalCover, trackId),
    saveTrackCover: (trackId) => ipcRenderer2.invoke(IpcChannels2.LibrarySaveTrackCover, trackId),
    deleteTrackFile: (trackId) => ipcRenderer2.invoke(IpcChannels2.LibraryDeleteTrackFile, trackId),
    copyAlbumInfo: (albumId) => ipcRenderer2.invoke(IpcChannels2.LibraryCopyAlbumInfo, albumId),
    copyAlbumCover: (albumId) => ipcRenderer2.invoke(IpcChannels2.LibraryCopyAlbumCover, albumId),
    saveAlbumCover: (albumId) => ipcRenderer2.invoke(IpcChannels2.LibrarySaveAlbumCover, albumId),
    deleteAlbumFiles: (albumId) => ipcRenderer2.invoke(IpcChannels2.LibraryDeleteAlbumFiles, albumId),
    pruneMissingTracks: () => ipcRenderer2.invoke(IpcChannels2.LibraryPruneMissingTracks),
    pruneInvalidTracks: () => ipcRenderer2.invoke(IpcChannels2.LibraryPruneInvalidTracks),
    clearTracks: () => ipcRenderer2.invoke(IpcChannels2.LibraryClearTracks),
    clearCache: () => ipcRenderer2.invoke(IpcChannels2.LibraryClearCache),
    repairDatabase: () => ipcRenderer2.invoke(IpcChannels2.LibraryRepairDatabase),
    deleteDatabase: () => ipcRenderer2.invoke(IpcChannels2.LibraryDeleteDatabase),
    deleteAllUserData: () => ipcRenderer2.invoke(IpcChannels2.LibraryDeleteAllUserData),
    getDatabaseProtectionStatus: (options) => ipcRenderer2.invoke(IpcChannels2.LibraryGetDatabaseProtectionStatus, options),
    createDatabaseSnapshot: () => ipcRenderer2.invoke(IpcChannels2.LibraryCreateDatabaseSnapshot),
    restoreDatabaseSnapshot: (snapshotId) => ipcRenderer2.invoke(IpcChannels2.LibraryRestoreDatabaseSnapshot, snapshotId),
    scrubQuarantinedDatabase: () => ipcRenderer2.invoke(IpcChannels2.LibraryScrubQuarantinedDatabase),
    discardQuarantinedProblemTracks: () => ipcRenderer2.invoke(IpcChannels2.LibraryDiscardQuarantinedProblemTracks),
    relaunchRecoveryMode: () => ipcRenderer2.invoke(IpcChannels2.LibraryRelaunchRecoveryMode),
    openDataProtectionFolder: () => ipcRenderer2.invoke(IpcChannels2.LibraryOpenDataProtectionFolder),
    repairMissingMetadata: (trackId) => ipcRenderer2.invoke(IpcChannels2.LibraryNetworkRepairMissingMetadata, trackId),
    scanMissingMetadata: (options) => ipcRenderer2.invoke(IpcChannels2.LibraryNetworkScanMissingMetadata, options),
    startMissingMetadataScan: (options) => ipcRenderer2.invoke(IpcChannels2.LibraryNetworkStartMissingMetadataScan, options),
    getMissingMetadataScanStatus: (jobId) => ipcRenderer2.invoke(IpcChannels2.LibraryNetworkGetMissingMetadataScanStatus, jobId),
    startMissingCoverBackfill: (options) => ipcRenderer2.invoke(IpcChannels2.LibraryNetworkStartMissingCoverBackfill, options),
    getMissingCoverBackfillStatus: (jobId) => ipcRenderer2.invoke(IpcChannels2.LibraryNetworkGetMissingCoverBackfillStatus, jobId),
    getActiveMissingCoverBackfillStatus: () => ipcRenderer2.invoke(IpcChannels2.LibraryNetworkGetActiveMissingCoverBackfillStatus),
    showNetworkCandidates: (trackId) => ipcRenderer2.invoke(IpcChannels2.LibraryNetworkShowCandidates, trackId),
    searchNetworkTagCandidates: (trackId, options) => ipcRenderer2.invoke(IpcChannels2.LibrarySearchNetworkTagCandidates, { trackId, ...options }),
    resolveLyricsBackgroundCover: (trackId) => ipcRenderer2.invoke(IpcChannels2.LibraryResolveLyricsBackgroundCover, trackId),
    applyNetworkMissingOnly: (candidateId, options) => ipcRenderer2.invoke(IpcChannels2.LibraryNetworkApplyMissingOnly, { candidateId, ...options }),
    applyNetworkSelected: (candidateId, options) => ipcRenderer2.invoke(IpcChannels2.LibraryNetworkApplySelected, { candidateId, ...options }),
    rejectNetworkCandidate: (candidateId) => ipcRenderer2.invoke(IpcChannels2.LibraryNetworkRejectCandidate, candidateId),
    startBpmAnalysis: (options) => ipcRenderer2.invoke(IpcChannels2.LibraryStartBpmAnalysis, options),
    getBpmAnalysisStatus: (jobId) => ipcRenderer2.invoke(IpcChannels2.LibraryGetBpmAnalysisStatus, jobId),
    startReplayGainAnalysis: (options) => ipcRenderer2.invoke(IpcChannels2.LibraryStartReplayGainAnalysis, options),
    getReplayGainAnalysisStatus: (jobId) => ipcRenderer2.invoke(IpcChannels2.LibraryGetReplayGainAnalysisStatus, jobId),
    startLyricsBackfill: (options) => ipcRenderer2.invoke(IpcChannels2.LibraryStartLyricsBackfill, options),
    getLyricsBackfillStatus: (jobId) => ipcRenderer2.invoke(IpcChannels2.LibraryGetLyricsBackfillStatus, jobId),
    getCurrentLyricsBackfillStatus: () => ipcRenderer2.invoke(IpcChannels2.LibraryGetCurrentLyricsBackfillStatus),
    cancelLyricsBackfill: (jobId) => ipcRenderer2.invoke(IpcChannels2.LibraryCancelLyricsBackfill, jobId)
  };
}
function createLibraryLabApi(ipcRenderer2, IpcChannels2) {
  return {
    setWatcherEnabled: (enabled) => ipcRenderer2.invoke(IpcChannels2.LibraryLabSetWatcherEnabled, enabled),
    setAutoRescanEnabled: (enabled) => ipcRenderer2.invoke(IpcChannels2.LibraryLabSetAutoRescanEnabled, enabled),
    setMoveCandidateEnabled: (enabled) => ipcRenderer2.invoke(IpcChannels2.LibraryLabSetMoveCandidateEnabled, enabled),
    setMoveRepairLabEnabled: (enabled) => ipcRenderer2.invoke(IpcChannels2.LibraryLabSetMoveRepairLabEnabled, enabled),
    getState: () => ipcRenderer2.invoke(IpcChannels2.LibraryLabGetState),
    startWatcher: () => ipcRenderer2.invoke(IpcChannels2.LibraryLabStartWatcher),
    stopWatcher: () => ipcRenderer2.invoke(IpcChannels2.LibraryLabStopWatcher),
    refreshDiagnostics: () => ipcRenderer2.invoke(IpcChannels2.LibraryLabRefreshDiagnostics),
    backfillPlaceholderMetadata: () => ipcRenderer2.invoke(IpcChannels2.LibraryLabBackfillPlaceholderMetadata),
    getMoveCandidates: (options) => ipcRenderer2.invoke(IpcChannels2.LibraryLabGetMoveCandidates, options),
    dryRunMoveRepair: (candidateId) => ipcRenderer2.invoke(IpcChannels2.LibraryLabDryRunMoveRepair, candidateId),
    applyMoveRepair: (candidateId) => ipcRenderer2.invoke(IpcChannels2.LibraryLabApplyMoveRepair, candidateId)
  };
}
function createPlaybackApi(ipcRenderer2, IpcChannels2, sa2, deps2) {
  return {
    getStatus: () => sa2.systemAudioModeActive ? Promise.resolve(sa2.getSystemPlaybackStatus()) : ipcRenderer2.invoke(IpcChannels2.PlaybackGetStatus),
    playLocalFile: async (request) => {
      if (sa2.requiresNativeChainedPlayback(request)) {
        const shouldLeaveSystemAudio = await sa2.shouldUseSystemAudioForPlayback(request.output);
        sa2.stopSystemPlayback("stopped", false);
        sa2.systemAudioModeActive = false;
        return ipcRenderer2.invoke(
          IpcChannels2.PlaybackPlayLocalFile,
          request.output?.outputMode && request.output.outputMode !== "system" ? request : shouldLeaveSystemAudio ? { ...request, output: { ...request.output ?? {}, outputMode: "shared" } } : request
        );
      }
      if (sa2.requiresNativeSystemLocalPlayback(request)) {
        const shouldLeaveSystemAudio = await sa2.shouldUseSystemAudioForPlayback(request.output);
        sa2.stopSystemPlayback("stopped", false);
        sa2.systemAudioModeActive = false;
        if (request.output?.outputMode && request.output.outputMode !== "system") {
          return ipcRenderer2.invoke(IpcChannels2.PlaybackPlayLocalFile, request);
        }
        return ipcRenderer2.invoke(
          IpcChannels2.PlaybackPlayLocalFile,
          shouldLeaveSystemAudio ? { ...request, output: { ...request.output ?? {}, outputMode: "shared" } } : request
        );
      }
      if (await sa2.shouldUseSystemAudioForPlayback(request.output)) {
        return deps2.isMainPlaybackRenderer ? sa2.playLocalFileWithSystemAudio(request) : deps2.invokeMainPlaybackRenderer("playLocalFile", [request]);
      }
      return ipcRenderer2.invoke(IpcChannels2.PlaybackPlayLocalFile, request);
    },
    playMediaItem: async (request) => {
      if (sa2.requiresNativeChainedPlayback(request)) {
        const shouldLeaveSystemAudio = await sa2.shouldUseSystemAudioForPlayback(request.output);
        sa2.stopSystemPlayback("stopped", false);
        sa2.systemAudioModeActive = false;
        return ipcRenderer2.invoke(
          IpcChannels2.PlaybackPlayMediaItem,
          request.output?.outputMode && request.output.outputMode !== "system" ? request : shouldLeaveSystemAudio ? { ...request, output: { ...request.output ?? {}, outputMode: "shared" } } : request
        );
      }
      if (sa2.requiresNativeSystemMediaPlayback(request)) {
        const shouldLeaveSystemAudio = await sa2.shouldUseSystemAudioForPlayback(request.output);
        sa2.stopSystemPlayback("stopped", false);
        sa2.systemAudioModeActive = false;
        if (request.output?.outputMode && request.output.outputMode !== "system") {
          return ipcRenderer2.invoke(IpcChannels2.PlaybackPlayMediaItem, request);
        }
        return ipcRenderer2.invoke(
          IpcChannels2.PlaybackPlayMediaItem,
          shouldLeaveSystemAudio ? { ...request, output: { ...request.output ?? {}, outputMode: "shared" } } : request
        );
      }
      if (await sa2.shouldUseSystemAudioForPlayback(request.output)) {
        return deps2.isMainPlaybackRenderer ? sa2.playMediaItemWithSystemAudio(request) : deps2.invokeMainPlaybackRenderer("playMediaItem", [request]);
      }
      return ipcRenderer2.invoke(IpcChannels2.PlaybackPlayMediaItem, request);
    },
    prepareMediaItem: (request) => ipcRenderer2.invoke(IpcChannels2.PlaybackPrepareMediaItem, request),
    prepareLocalFile: (request) => ipcRenderer2.invoke(IpcChannels2.PlaybackPrepareLocalFile, request),
    play: async () => {
      if (!await sa2.refreshSystemAudioModeActive()) {
        return ipcRenderer2.invoke(IpcChannels2.PlaybackPlay);
      }
      if (!deps2.isMainPlaybackRenderer) {
        return deps2.invokeMainPlaybackRenderer("play");
      }
      return sa2.play();
    },
    pause: async () => {
      if (!await sa2.refreshSystemAudioModeActive()) {
        return ipcRenderer2.invoke(IpcChannels2.PlaybackPause);
      }
      if (!deps2.isMainPlaybackRenderer) {
        return deps2.invokeMainPlaybackRenderer("pause");
      }
      return sa2.pause();
    },
    stop: async () => {
      if (!await sa2.refreshSystemAudioModeActive()) {
        return ipcRenderer2.invoke(IpcChannels2.PlaybackStop);
      }
      if (!deps2.isMainPlaybackRenderer) {
        return deps2.invokeMainPlaybackRenderer("stop");
      }
      return sa2.stop();
    },
    seek: async (positionSeconds) => {
      if (!await sa2.refreshSystemAudioModeActive()) {
        return ipcRenderer2.invoke(IpcChannels2.PlaybackSeek, positionSeconds);
      }
      if (!deps2.isMainPlaybackRenderer) {
        return deps2.invokeMainPlaybackRenderer("seek", [positionSeconds]);
      }
      return sa2.seek(positionSeconds);
    },
    openLocalAudioFile: () => ipcRenderer2.invoke(IpcChannels2.PlaybackOpenLocalAudioFile),
    openLocalAudioFiles: () => ipcRenderer2.invoke(IpcChannels2.PlaybackOpenLocalAudioFiles),
    resolveLocalAudioFiles: (paths) => ipcRenderer2.invoke(IpcChannels2.PlaybackResolveLocalAudioFiles, paths),
    getQueueSession: () => ipcRenderer2.invoke(IpcChannels2.PlaybackGetQueueSession),
    saveQueueSession: (snapshot, options) => ipcRenderer2.invoke(IpcChannels2.PlaybackSaveQueueSession, snapshot, options),
    clearQueueSession: () => ipcRenderer2.invoke(IpcChannels2.PlaybackClearQueueSession),
    onQueueSessionChanged: (handler) => {
      const listener = (_event, snapshot) => {
        handler(snapshot);
      };
      ipcRenderer2.on(IpcChannels2.PlaybackQueueSessionChanged, listener);
      return () => ipcRenderer2.off(IpcChannels2.PlaybackQueueSessionChanged, listener);
    },
    controlMainWindow: (request) => deps2.invokeMainPlaybackRenderer("control", [request]),
    onMainWindowControl: (handler) => {
      deps2.mainWindowControlHandlers?.add(handler);
      return () => {
        deps2.mainWindowControlHandlers?.delete(handler);
      };
    },
    onLocalAudioFilesOpened: (handler) => {
      deps2.localAudioFileOpenHandlers.add(handler);
      for (const paths of deps2.pendingLocalAudioFileOpenEvents.splice(0)) {
        handler(paths);
      }
      return () => {
        deps2.localAudioFileOpenHandlers.delete(handler);
      };
    },
    onAutomixAdvance: (handler) => {
      deps2.automixAdvanceHandlers.add(handler);
      return () => {
        deps2.automixAdvanceHandlers.delete(handler);
      };
    },
    setRepeatMode: (mode) => ipcRenderer2.invoke(IpcChannels2.PlaybackSetRepeatMode, mode),
    syncQueueToBackend: (items, repeatMode, currentItemId) => ipcRenderer2.invoke(IpcChannels2.PlaybackSyncQueueToBackend, items, repeatMode, currentItemId)
  };
}
function createRemoteSourcesApi(ipcRenderer2, IpcChannels2) {
  return {
    list: () => ipcRenderer2.invoke(IpcChannels2.RemoteSourcesList),
    getOverview: (sourceId) => ipcRenderer2.invoke(IpcChannels2.RemoteSourcesGetOverview, sourceId),
    previewAlbumGrouping: (strategy, sourceId) => ipcRenderer2.invoke(IpcChannels2.RemoteSourcesPreviewAlbumGrouping, strategy, sourceId),
    listIssues: (sourceId, kind, limit) => ipcRenderer2.invoke(IpcChannels2.RemoteSourcesListIssues, sourceId, kind, limit),
    create: (input) => ipcRenderer2.invoke(IpcChannels2.RemoteSourcesCreate, input),
    update: (input) => ipcRenderer2.invoke(IpcChannels2.RemoteSourcesUpdate, input),
    disconnect: (sourceId) => ipcRenderer2.invoke(IpcChannels2.RemoteSourcesDisconnect, sourceId),
    delete: (sourceId) => ipcRenderer2.invoke(IpcChannels2.RemoteSourcesDelete, sourceId),
    test: (sourceIdOrInput) => ipcRenderer2.invoke(IpcChannels2.RemoteSourcesTest, sourceIdOrInput),
    browse: (sourceId, path) => ipcRenderer2.invoke(IpcChannels2.RemoteSourcesBrowse, sourceId, path),
    sync: (sourceId, options) => ipcRenderer2.invoke(IpcChannels2.RemoteSourcesSync, sourceId, options),
    previewSync: (sourceId, options) => ipcRenderer2.invoke(IpcChannels2.RemoteSourcesPreviewSync, sourceId, options),
    cancelSync: (sourceId) => ipcRenderer2.invoke(IpcChannels2.RemoteSourcesCancelSync, sourceId),
    getSyncStatus: (sourceId) => ipcRenderer2.invoke(IpcChannels2.RemoteSourcesGetSyncStatus, sourceId),
    createStreamUrl: (input) => ipcRenderer2.invoke(IpcChannels2.RemoteSourcesCreateStreamUrl, input),
    hydrateVisibleTracks: (trackIds, options) => ipcRenderer2.invoke(IpcChannels2.RemoteSourcesHydrateVisibleTracks, trackIds, options),
    lookupTracks: (sourceId, remotePaths) => ipcRenderer2.invoke(IpcChannels2.RemoteSourcesLookupTracks, sourceId, remotePaths),
    listIndexedTracks: (sourceId, rootPath) => ipcRenderer2.invoke(IpcChannels2.RemoteSourcesListIndexedTracks, sourceId, rootPath),
    listIndexedTracksPage: (sourceId, query) => ipcRenderer2.invoke(IpcChannels2.RemoteSourcesListIndexedTracksPage, sourceId, query),
    getIndexedFolderStats: (sourceId, rootPath) => ipcRenderer2.invoke(IpcChannels2.RemoteSourcesGetIndexedFolderStats, sourceId, rootPath),
    previewDirectoryItems: (sourceId, items, options) => ipcRenderer2.invoke(IpcChannels2.RemoteSourcesPreviewDirectoryItems, sourceId, items, options),
    startBackgroundJobs: (sourceId, kinds) => ipcRenderer2.invoke(IpcChannels2.RemoteSourcesStartBackgroundJobs, sourceId, kinds),
    pauseBackgroundJobs: (sourceId) => ipcRenderer2.invoke(IpcChannels2.RemoteSourcesPauseBackgroundJobs, sourceId),
    resumeBackgroundJobs: (sourceId) => ipcRenderer2.invoke(IpcChannels2.RemoteSourcesResumeBackgroundJobs, sourceId),
    getJobStatus: (sourceId) => ipcRenderer2.invoke(IpcChannels2.RemoteSourcesGetJobStatus, sourceId),
    retryFailedJobs: (sourceId, kinds) => ipcRenderer2.invoke(IpcChannels2.RemoteSourcesRetryFailedJobs, sourceId, kinds),
    setBackgroundPaused: (paused) => ipcRenderer2.invoke(IpcChannels2.RemoteSourcesSetBackgroundPaused, paused),
    getBackgroundGlobalStatus: () => ipcRenderer2.invoke(IpcChannels2.RemoteSourcesGetBackgroundGlobalStatus),
    updateRuntimeLimits: (sourceId, limits) => ipcRenderer2.invoke(IpcChannels2.RemoteSourcesUpdateRuntimeLimits, sourceId, limits),
    createBaiduAuthUrl: (input) => ipcRenderer2.invoke(IpcChannels2.RemoteSourcesCreateBaiduAuthUrl, input),
    exchangeBaiduAuthCode: (input) => ipcRenderer2.invoke(IpcChannels2.RemoteSourcesExchangeBaiduAuthCode, input),
    startBaiduOAuthLogin: (input) => ipcRenderer2.invoke(IpcChannels2.RemoteSourcesStartBaiduOAuthLogin, input)
  };
}
function createConnectApi(ipcRenderer2, IpcChannels2) {
  return {
    getDonatorUnlockStatus: (options) => options === void 0 ? ipcRenderer2.invoke(IpcChannels2.ConnectGetDonatorUnlockStatus) : ipcRenderer2.invoke(IpcChannels2.ConnectGetDonatorUnlockStatus, options),
    listDevices: () => ipcRenderer2.invoke(IpcChannels2.ConnectListDevices),
    refresh: () => ipcRenderer2.invoke(IpcChannels2.ConnectRefresh),
    getStatus: () => ipcRenderer2.invoke(IpcChannels2.ConnectGetStatus),
    connect: (request) => ipcRenderer2.invoke(IpcChannels2.ConnectConnect, request),
    disconnect: () => ipcRenderer2.invoke(IpcChannels2.ConnectDisconnect),
    play: () => ipcRenderer2.invoke(IpcChannels2.ConnectPlay),
    pause: () => ipcRenderer2.invoke(IpcChannels2.ConnectPause),
    stop: () => ipcRenderer2.invoke(IpcChannels2.ConnectStop),
    seek: (positionSeconds) => ipcRenderer2.invoke(IpcChannels2.ConnectSeek, positionSeconds),
    setVolume: (volumePercent) => ipcRenderer2.invoke(IpcChannels2.ConnectSetVolume, volumePercent),
    getEchoLinkStatus: () => ipcRenderer2.invoke(IpcChannels2.EchoLinkGetStatus),
    setEchoLinkEnabled: (enabled) => ipcRenderer2.invoke(IpcChannels2.EchoLinkSetEnabled, enabled),
    rotateEchoLinkToken: () => ipcRenderer2.invoke(IpcChannels2.EchoLinkRotateToken),
    setEchoLinkWebBackground: (background) => ipcRenderer2.invoke(IpcChannels2.EchoLinkSetWebBackground, background),
    chooseEchoLinkWebBackgroundImage: () => ipcRenderer2.invoke(IpcChannels2.EchoLinkChooseWebBackgroundImage),
    onStatus: (handler) => {
      const listener = (_event, status) => {
        handler(status);
      };
      ipcRenderer2.on(IpcChannels2.ConnectStatus, listener);
      return () => ipcRenderer2.off(IpcChannels2.ConnectStatus, listener);
    },
    getReceiverStatus: () => ipcRenderer2.invoke(IpcChannels2.ConnectReceiverGetStatus),
    setReceiverEnabled: (enabled) => ipcRenderer2.invoke(IpcChannels2.ConnectReceiverSetEnabled, enabled),
    stopReceiverPlayback: () => ipcRenderer2.invoke(IpcChannels2.ConnectReceiverStopPlayback),
    onReceiverStatus: (handler) => {
      const listener = (_event, status) => {
        handler(status);
      };
      ipcRenderer2.on(IpcChannels2.ConnectReceiverStatus, listener);
      return () => ipcRenderer2.off(IpcChannels2.ConnectReceiverStatus, listener);
    },
    getAirPlayReceiverStatus: () => ipcRenderer2.invoke(IpcChannels2.ConnectAirPlayReceiverGetStatus),
    setAirPlayReceiverEnabled: (enabled) => ipcRenderer2.invoke(IpcChannels2.ConnectAirPlayReceiverSetEnabled, enabled),
    stopAirPlayReceiverPlayback: () => ipcRenderer2.invoke(IpcChannels2.ConnectAirPlayReceiverStopPlayback),
    onAirPlayReceiverStatus: (handler) => {
      const listener = (_event, status) => {
        handler(status);
      };
      ipcRenderer2.on(IpcChannels2.ConnectAirPlayReceiverStatus, listener);
      return () => ipcRenderer2.off(IpcChannels2.ConnectAirPlayReceiverStatus, listener);
    },
    getWallpaperEngineBridgeStatus: () => ipcRenderer2.invoke(IpcChannels2.ConnectWallpaperEngineBridgeGetStatus)
  };
}
function createStreamingApi(ipcRenderer2, IpcChannels2) {
  return {
    search: (request) => ipcRenderer2.invoke(IpcChannels2.StreamingSearch, request),
    getTrack: (request) => ipcRenderer2.invoke(IpcChannels2.StreamingGetTrack, request),
    getTrackSourceInfo: (request) => ipcRenderer2.invoke(IpcChannels2.StreamingGetTrackSourceInfo, request),
    getAlbum: (request) => ipcRenderer2.invoke(IpcChannels2.StreamingGetAlbum, request),
    getArtist: (request) => ipcRenderer2.invoke(IpcChannels2.StreamingGetArtist, request),
    resolvePlayback: (request) => ipcRenderer2.invoke(IpcChannels2.StreamingResolvePlayback, request),
    analyzeBpm: (request) => ipcRenderer2.invoke(IpcChannels2.StreamingAnalyzeBpm, request),
    getLyrics: (request) => ipcRenderer2.invoke(IpcChannels2.StreamingGetLyrics, request),
    getMv: (request) => ipcRenderer2.invoke(IpcChannels2.StreamingGetMv, request),
    getProviders: () => ipcRenderer2.invoke(IpcChannels2.StreamingGetProviders),
    listAccountPlaylists: (provider) => ipcRenderer2.invoke(IpcChannels2.StreamingListAccountPlaylists, provider),
    importPlaylistFromUrl: (url) => ipcRenderer2.invoke(IpcChannels2.StreamingImportPlaylistFromUrl, url),
    importFavoritesFromUrl: (url) => ipcRenderer2.invoke(IpcChannels2.StreamingImportFavoritesFromUrl, url),
    exportFavorites: () => ipcRenderer2.invoke(IpcChannels2.StreamingExportFavorites),
    syncLikedSongs: (provider) => ipcRenderer2.invoke(IpcChannels2.StreamingSyncLikedSongs, provider),
    setTrackLiked: (request) => ipcRenderer2.invoke(IpcChannels2.StreamingSetTrackLiked, request),
    getFavorites: () => ipcRenderer2.invoke(IpcChannels2.StreamingGetFavorites),
    setFavorite: (request) => ipcRenderer2.invoke(IpcChannels2.StreamingSetFavorite, request),
    renameFavoriteCollection: (request) => ipcRenderer2.invoke(IpcChannels2.StreamingRenameFavoriteCollection, request),
    syncFavoriteCollection: (request) => ipcRenderer2.invoke(IpcChannels2.StreamingSyncFavoriteCollection, request),
    deleteFavoriteCollection: (request) => ipcRenderer2.invoke(IpcChannels2.StreamingDeleteFavoriteCollection, request),
    refreshNeteaseDailyRecommend: () => ipcRenderer2.invoke(IpcChannels2.StreamingRefreshNeteaseDailyRecommend)
  };
}
function createLyricsApi(ipcRenderer2, IpcChannels2) {
  return {
    getForTrack: (trackId) => ipcRenderer2.invoke(IpcChannels2.LyricsGetForTrack, trackId),
    getForSnapshot: (request) => ipcRenderer2.invoke(IpcChannels2.LyricsGetForSnapshot, request),
    getStoredCandidates: (trackId, durationSeconds) => ipcRenderer2.invoke(IpcChannels2.LyricsGetStoredCandidates, trackId, durationSeconds),
    searchCandidates: (trackId, searchText, providerId, trigger) => trigger === void 0 ? ipcRenderer2.invoke(IpcChannels2.LyricsSearchCandidates, trackId, searchText, providerId) : ipcRenderer2.invoke(IpcChannels2.LyricsSearchCandidates, trackId, searchText, providerId, trigger),
    searchCandidatesForSnapshot: (request, searchText, providerId, trigger) => ipcRenderer2.invoke(IpcChannels2.LyricsSearchCandidatesForSnapshot, request, searchText, providerId, trigger),
    previewCandidate: (trackId, candidateId) => ipcRenderer2.invoke(IpcChannels2.LyricsPreviewCandidate, trackId, candidateId),
    applyCandidate: (trackId, candidateId, origin) => origin === void 0 ? ipcRenderer2.invoke(IpcChannels2.LyricsApplyCandidate, trackId, candidateId) : ipcRenderer2.invoke(IpcChannels2.LyricsApplyCandidate, trackId, candidateId, origin),
    applyCandidateForSnapshot: (request, candidateId, origin) => origin === void 0 ? ipcRenderer2.invoke(IpcChannels2.LyricsApplyCandidateForSnapshot, request, candidateId) : ipcRenderer2.invoke(IpcChannels2.LyricsApplyCandidateForSnapshot, request, candidateId, origin),
    embedToTrack: (trackId, request) => ipcRenderer2.invoke(IpcChannels2.LyricsEmbedToTrack, trackId, request),
    applyCustomLrc: (trackId, lrcText, fileName) => ipcRenderer2.invoke(IpcChannels2.LyricsApplyCustomLrc, trackId, lrcText, fileName),
    markInstrumental: (trackId) => ipcRenderer2.invoke(IpcChannels2.LyricsMarkInstrumental, trackId),
    rejectCandidate: (candidateId) => ipcRenderer2.invoke(IpcChannels2.LyricsRejectCandidate, candidateId),
    setOffset: (trackId, offsetMs) => ipcRenderer2.invoke(IpcChannels2.LyricsSetOffset, trackId, offsetMs),
    clearCache: (trackId) => ipcRenderer2.invoke(IpcChannels2.LyricsClearCache, trackId),
    onChanged: (handler) => {
      const listener = (_event, payload) => {
        if (payload && typeof payload === "object" && typeof payload.trackId === "string") {
          const { trackId, reason } = payload;
          handler(
            trackId,
            reason === "manual" || reason === "auto-apply" ? reason : void 0
          );
        }
      };
      ipcRenderer2.on(IpcChannels2.LyricsChanged, listener);
      return () => ipcRenderer2.off(IpcChannels2.LyricsChanged, listener);
    }
  };
}
function createMvApi(ipcRenderer2, IpcChannels2) {
  return {
    getSelected: (trackId) => ipcRenderer2.invoke(IpcChannels2.MvGetSelected, trackId),
    getSettings: () => ipcRenderer2.invoke(IpcChannels2.MvGetSettings),
    setSettings: (patch) => ipcRenderer2.invoke(IpcChannels2.MvSetSettings, patch),
    findLocalCandidates: (trackId) => ipcRenderer2.invoke(IpcChannels2.MvFindLocalCandidates, trackId),
    searchNetworkCandidates: (trackId, query) => ipcRenderer2.invoke(IpcChannels2.MvSearchNetworkCandidates, trackId, query),
    searchNetworkCandidatesForSnapshot: (request) => ipcRenderer2.invoke(IpcChannels2.MvSearchNetworkCandidatesForSnapshot, request),
    getTemporaryPlayableForSnapshot: (request) => ipcRenderer2.invoke(IpcChannels2.MvGetTemporaryPlayableForSnapshot, request),
    getCandidates: (trackId) => ipcRenderer2.invoke(IpcChannels2.MvGetCandidates, trackId),
    resolveStreams: (videoId) => ipcRenderer2.invoke(IpcChannels2.MvResolveStreams, videoId),
    setQuality: (videoId, qualityId) => ipcRenderer2.invoke(IpcChannels2.MvSetQuality, videoId, qualityId),
    setOffset: (trackId, offsetMs) => ipcRenderer2.invoke(IpcChannels2.MvSetOffset, trackId, offsetMs),
    chooseLocalVideo: (trackId) => ipcRenderer2.invoke(IpcChannels2.MvChooseLocalVideo, trackId),
    bindLocalVideo: (trackId, filePath) => ipcRenderer2.invoke(IpcChannels2.MvBindLocalVideo, trackId, filePath),
    bindUrl: (trackId, url) => ipcRenderer2.invoke(IpcChannels2.MvBindUrl, trackId, url),
    selectVideo: (trackId, videoId) => ipcRenderer2.invoke(IpcChannels2.MvSelectVideo, trackId, videoId),
    clearSelected: (trackId) => ipcRenderer2.invoke(IpcChannels2.MvClearSelected, trackId),
    openExternal: (videoId) => ipcRenderer2.invoke(IpcChannels2.MvOpenExternal, videoId)
  };
}
function createHqPlayerApi(ipcRenderer2, IpcChannels2) {
  return {
    getSettings: () => ipcRenderer2.invoke(IpcChannels2.HqPlayerGetSettings),
    setSettings: (patch) => ipcRenderer2.invoke(IpcChannels2.HqPlayerSetSettings, patch),
    getStatus: () => ipcRenderer2.invoke(IpcChannels2.HqPlayerGetStatus),
    testConnection: (patch) => ipcRenderer2.invoke(IpcChannels2.HqPlayerTestConnection, patch),
    createPlaybackHandoff: (request) => ipcRenderer2.invoke(IpcChannels2.HqPlayerCreatePlaybackHandoff, request),
    sendLastPlaybackControl: () => ipcRenderer2.invoke(IpcChannels2.HqPlayerSendLastPlaybackControl),
    getLastPlaybackHandoff: () => ipcRenderer2.invoke(IpcChannels2.HqPlayerGetLastPlaybackHandoff),
    getLastPlaybackControl: () => ipcRenderer2.invoke(IpcChannels2.HqPlayerGetLastPlaybackControl)
  };
}
function createAudioApi(ipcRenderer2, IpcChannels2, sa2) {
  return {
    getStatus: async () => {
      if (sa2.systemAudioModeActive) {
        return sa2.getSystemAudioStatus();
      }
      const status = await ipcRenderer2.invoke(IpcChannels2.AudioGetStatus);
      sa2.lastNativeAudioStatus = status;
      sa2.applySystemOutputSettings(null, status);
      if (status.outputMode === "system" && sa2.ownsSystemAudioPlayback) {
        sa2.systemAudioModeActive = true;
        return sa2.getSystemAudioStatus();
      }
      return status;
    },
    getDiagnostics: () => ipcRenderer2.invoke(IpcChannels2.AudioGetDiagnostics),
    onStatus: (handler) => {
      const unsubscribeInternal = sa2.onAudioStatus(handler);
      const listener = (_event, status) => {
        const nextStatus = status;
        sa2.lastNativeAudioStatus = nextStatus;
        sa2.applySystemOutputSettings(null, nextStatus);
        if (sa2.ownsSystemAudioPlayback && (sa2.systemAudioModeActive || nextStatus.outputMode === "system")) {
          if (nextStatus.outputMode === "system") {
            sa2.systemAudioModeActive = true;
          }
          handler(sa2.getSystemAudioStatus());
          return;
        }
        handler(nextStatus);
      };
      ipcRenderer2.on(IpcChannels2.AudioStatus, listener);
      return () => {
        unsubscribeInternal();
        ipcRenderer2.off(IpcChannels2.AudioStatus, listener);
      };
    },
    onSessionReset: (handler) => {
      const listener = (_event, event) => {
        handler(event);
      };
      ipcRenderer2.on(IpcChannels2.AudioSessionReset, listener);
      return () => ipcRenderer2.off(IpcChannels2.AudioSessionReset, listener);
    },
    listDevices: () => ipcRenderer2.invoke(IpcChannels2.AudioListDevices),
    setOutput: async (settings) => {
      const wasSystemAudioModeActive = sa2.systemAudioModeActive;
      const previousNativeAudioStatus = sa2.lastNativeAudioStatus;
      const nextStatus = await ipcRenderer2.invoke(IpcChannels2.AudioSetOutput, settings);
      sa2.lastNativeAudioStatus = nextStatus;
      sa2.applySystemOutputSettings(settings, nextStatus);
      if (!sa2.isExplicitNativeOutputRequest(settings) && sa2.ownsSystemAudioPlayback && (wasSystemAudioModeActive || settings && typeof settings === "object" && settings.outputMode === "system" || nextStatus.outputMode === "system")) {
        sa2.systemAudioModeActive = true;
        const handoffStatus = await sa2.handoffNativePlaybackToSystemAudio(
          previousNativeAudioStatus && previousNativeAudioStatus.currentFilePath && (previousNativeAudioStatus.state === "playing" || previousNativeAudioStatus.state === "loading") ? previousNativeAudioStatus : nextStatus
        );
        if (handoffStatus) {
          return handoffStatus;
        }
        return sa2.getSystemAudioStatus();
      }
      if (sa2.systemAudioModeActive) {
        sa2.stopSystemPlayback("idle", false);
        sa2.systemAudioModeActive = false;
      }
      return nextStatus;
    },
    exportFile: (request) => ipcRenderer2.invoke(IpcChannels2.AudioExportFile, request),
    resetEngine: () => ipcRenderer2.invoke(IpcChannels2.AudioResetEngine),
    forceRestart: (reason) => ipcRenderer2.invoke(IpcChannels2.AudioForceRestart, reason),
    restartWindowsAudioService: () => ipcRenderer2.invoke(IpcChannels2.AudioRestartWindowsAudioService)
  };
}
function createEqApi(ipcRenderer2, IpcChannels2, sa2) {
  return {
    getState: () => ipcRenderer2.invoke(IpcChannels2.EqGetState),
    setEnabled: (enabled) => ipcRenderer2.invoke(IpcChannels2.EqSetEnabled, enabled),
    setBandGain: (request) => ipcRenderer2.invoke(IpcChannels2.EqSetBandGain, request),
    setBandFrequency: (request) => ipcRenderer2.invoke(IpcChannels2.EqSetBandFrequency, request),
    setBandQ: (request) => ipcRenderer2.invoke(IpcChannels2.EqSetBandQ, request),
    setBandFilterType: (request) => ipcRenderer2.invoke(IpcChannels2.EqSetBandFilterType, request),
    setBandEnabled: (request) => ipcRenderer2.invoke(IpcChannels2.EqSetBandEnabled, request),
    setPreamp: (preampDb) => ipcRenderer2.invoke(IpcChannels2.EqSetPreamp, preampDb),
    setDspHeadroom: (headroomDb) => ipcRenderer2.invoke(IpcChannels2.EqSetDspHeadroom, headroomDb),
    setDspSafetyLimiterEnabled: (enabled) => ipcRenderer2.invoke(IpcChannels2.EqSetDspSafetyLimiterEnabled, enabled),
    setPreset: (presetId) => ipcRenderer2.invoke(IpcChannels2.EqSetPreset, presetId),
    reset: () => ipcRenderer2.invoke(IpcChannels2.EqReset),
    listPresets: () => ipcRenderer2.invoke(IpcChannels2.EqListPresets),
    savePreset: (request) => ipcRenderer2.invoke(IpcChannels2.EqSavePreset, request),
    exportPreset: (request) => ipcRenderer2.invoke(IpcChannels2.EqExportPreset, request),
    exportApoPreset: (request) => ipcRenderer2.invoke(IpcChannels2.EqExportApoPreset, request),
    exportApoGraphicEqPreset: (request) => ipcRenderer2.invoke(IpcChannels2.EqExportApoGraphicEqPreset, request),
    previewImportPreset: () => ipcRenderer2.invoke(IpcChannels2.EqPreviewImportPreset),
    importPreset: () => ipcRenderer2.invoke(IpcChannels2.EqImportPreset),
    deletePreset: (presetId) => ipcRenderer2.invoke(IpcChannels2.EqDeletePreset, presetId),
    browseHeadphoneCorrections: (request) => ipcRenderer2.invoke(IpcChannels2.EqBrowseHeadphoneCorrections, request),
    searchHeadphoneCorrections: (request) => ipcRenderer2.invoke(IpcChannels2.EqSearchHeadphoneCorrections, request),
    applyHeadphoneCorrection: (request) => ipcRenderer2.invoke(IpcChannels2.EqApplyHeadphoneCorrection, request),
    listProfiles: () => ipcRenderer2.invoke(IpcChannels2.EqListProfiles),
    saveProfile: (request) => ipcRenderer2.invoke(IpcChannels2.EqSaveProfile, request),
    applyProfile: (profileId) => ipcRenderer2.invoke(IpcChannels2.EqApplyProfile, profileId),
    deleteProfile: (profileId) => ipcRenderer2.invoke(IpcChannels2.EqDeleteProfile, profileId),
    bindProfileToOutput: (request) => ipcRenderer2.invoke(IpcChannels2.EqBindProfileToOutput, request),
    getProfileBinding: (target) => ipcRenderer2.invoke(IpcChannels2.EqGetProfileBinding, target),
    getChannelBalanceState: async () => {
      const state = await ipcRenderer2.invoke(IpcChannels2.ChannelBalanceGetState);
      sa2.applySystemChannelBalanceState(state);
      return state;
    },
    setChannelBalanceState: async (patch) => {
      const state = await ipcRenderer2.invoke(IpcChannels2.ChannelBalanceSetState, patch);
      sa2.applySystemChannelBalanceState(state);
      return state;
    },
    resetChannelBalance: async () => {
      const state = await ipcRenderer2.invoke(IpcChannels2.ChannelBalanceReset);
      sa2.applySystemChannelBalanceState(state);
      return state;
    },
    getRoomCorrectionState: () => ipcRenderer2.invoke(IpcChannels2.RoomCorrectionGetState),
    importRoomCorrectionIr: () => ipcRenderer2.invoke(IpcChannels2.RoomCorrectionImportIr),
    setRoomCorrectionEnabled: (enabled) => ipcRenderer2.invoke(IpcChannels2.RoomCorrectionSetEnabled, enabled),
    setRoomCorrectionTrim: (trimDb) => ipcRenderer2.invoke(IpcChannels2.RoomCorrectionSetTrim, trimDb),
    clearRoomCorrection: () => ipcRenderer2.invoke(IpcChannels2.RoomCorrectionClear)
  };
}
function createSleepTimerApi(ipcRenderer2, IpcChannels2) {
  return {
    start: (request) => ipcRenderer2.invoke(IpcChannels2.SleepTimerStart, request),
    cancel: () => ipcRenderer2.invoke(IpcChannels2.SleepTimerCancel),
    getStatus: () => ipcRenderer2.invoke(IpcChannels2.SleepTimerGetStatus),
    onTick: (handler) => {
      const listener = (_event, remainingMs) => {
        handler(typeof remainingMs === "number" ? remainingMs : 0);
      };
      ipcRenderer2.on(IpcChannels2.SleepTimerOnTick, listener);
      return () => ipcRenderer2.off(IpcChannels2.SleepTimerOnTick, listener);
    }
  };
}
function createDiagnosticsApi(ipcRenderer2, IpcChannels2) {
  return {
    getLastCrashSummary: () => ipcRenderer2.invoke(IpcChannels2.DiagnosticsGetLastCrashSummary),
    clearLastCrashSummary: () => ipcRenderer2.invoke(IpcChannels2.DiagnosticsClearLastCrashSummary),
    exportDiagnostics: () => ipcRenderer2.invoke(IpcChannels2.DiagnosticsExport),
    exportDiagnosticsZip: () => ipcRenderer2.invoke(IpcChannels2.DiagnosticsExportZip),
    openDiagnosticsFolder: () => ipcRenderer2.invoke(IpcChannels2.DiagnosticsOpenFolder),
    openCrashReport: () => ipcRenderer2.invoke(IpcChannels2.DiagnosticsOpenCrashReport),
    openCrashTextReport: () => ipcRenderer2.invoke(IpcChannels2.DiagnosticsOpenCrashTextReport),
    openAudioCrashReport: () => ipcRenderer2.invoke(IpcChannels2.DiagnosticsOpenAudioCrashReport),
    openAudioCrashTextReport: () => ipcRenderer2.invoke(IpcChannels2.DiagnosticsOpenAudioCrashTextReport),
    openMemoryPressureReport: () => ipcRenderer2.invoke(IpcChannels2.DiagnosticsOpenMemoryPressureReport),
    relaunchApp: () => ipcRenderer2.invoke(IpcChannels2.DiagnosticsRelaunchApp),
    openDevConsole: () => ipcRenderer2.invoke(IpcChannels2.DiagnosticsOpenDevConsole),
    getDevConsoleSnapshot: () => ipcRenderer2.invoke(IpcChannels2.DiagnosticsDevConsoleSnapshot),
    onDevConsoleEntry: (handler) => {
      const listener = (_event, entry) => {
        handler(entry);
      };
      ipcRenderer2.on(IpcChannels2.DiagnosticsDevConsoleEntry, listener);
      return () => ipcRenderer2.off(IpcChannels2.DiagnosticsDevConsoleEntry, listener);
    },
    onMemoryPressure: (handler) => {
      const listener = (_event, event) => {
        handler(event);
      };
      ipcRenderer2.on(IpcChannels2.DiagnosticsMemoryPressure, listener);
      return () => ipcRenderer2.off(IpcChannels2.DiagnosticsMemoryPressure, listener);
    },
    reportRendererError: (payload) => ipcRenderer2.invoke(IpcChannels2.DiagnosticsReportRendererError, payload),
    reportPerformanceStall: (payload) => ipcRenderer2.invoke(IpcChannels2.DiagnosticsReportPerformanceStall, payload)
  };
}
function createDownloadsApi(ipcRenderer2, IpcChannels2) {
  return {
    getJobs: () => ipcRenderer2.invoke(IpcChannels2.DownloadsGetJobs),
    createUrlJob: (url, options) => ipcRenderer2.invoke(IpcChannels2.DownloadsCreateUrlJob, url, options),
    cancelJob: (jobId) => ipcRenderer2.invoke(IpcChannels2.DownloadsCancelJob, jobId),
    clearJobs: (provider) => ipcRenderer2.invoke(IpcChannels2.DownloadsClearJobs, provider),
    clearCompleted: (provider) => ipcRenderer2.invoke(IpcChannels2.DownloadsClearCompleted, provider),
    getSettings: () => ipcRenderer2.invoke(IpcChannels2.DownloadsGetSettings),
    setSettings: (patch) => ipcRenderer2.invoke(IpcChannels2.DownloadsSetSettings, patch),
    chooseOutputDirectory: (target) => ipcRenderer2.invoke(IpcChannels2.DownloadsChooseOutputDirectory, target),
    search: (request) => ipcRenderer2.invoke(IpcChannels2.DownloadsSearch, request),
    getOsuAccountProfile: () => ipcRenderer2.invoke(IpcChannels2.DownloadsGetOsuAccountProfile),
    getOsuAccountCollection: (request) => ipcRenderer2.invoke(IpcChannels2.DownloadsGetOsuAccountCollection, request),
    checkTools: () => ipcRenderer2.invoke(IpcChannels2.DownloadsCheckTools),
    onJobsUpdated: (handler) => {
      const listener = (_event, jobs) => {
        handler(jobs);
      };
      ipcRenderer2.on(IpcChannels2.DownloadsJobsUpdated, listener);
      return () => ipcRenderer2.off(IpcChannels2.DownloadsJobsUpdated, listener);
    }
  };
}
function createPluginsApi(ipcRenderer2, IpcChannels2, webUtils2) {
  return {
    list: () => ipcRenderer2.invoke(IpcChannels2.PluginsList),
    listMarket: () => ipcRenderer2.invoke(IpcChannels2.PluginsListMarket),
    installMarket: (pluginId) => ipcRenderer2.invoke(IpcChannels2.PluginsInstallMarket, pluginId),
    createExample: (kind) => ipcRenderer2.invoke(IpcChannels2.PluginsCreateExample, kind),
    enable: (request) => ipcRenderer2.invoke(IpcChannels2.PluginsEnable, request),
    disable: (pluginId) => ipcRenderer2.invoke(IpcChannels2.PluginsDisable, pluginId),
    delete: (pluginId) => ipcRenderer2.invoke(IpcChannels2.PluginsDelete, pluginId),
    reload: (pluginId) => ipcRenderer2.invoke(IpcChannels2.PluginsReload, pluginId),
    openDirectory: (pluginId) => ipcRenderer2.invoke(IpcChannels2.PluginsOpenDirectory, pluginId),
    exportPackage: (pluginId) => ipcRenderer2.invoke(IpcChannels2.PluginsExportPackage, pluginId),
    importPackage: (source) => {
      if (source === void 0) {
        return ipcRenderer2.invoke(IpcChannels2.PluginsImportPackage);
      }
      if (typeof source === "string") {
        return ipcRenderer2.invoke(IpcChannels2.PluginsImportPackage, source);
      }
      const sourcePath = webUtils2?.getPathForFile(source) || "";
      if (!sourcePath) {
        throw new Error("plugin_package_path_unavailable");
      }
      return ipcRenderer2.invoke(IpcChannels2.PluginsImportPackage, sourcePath);
    },
    runCommand: (request) => ipcRenderer2.invoke(IpcChannels2.PluginsRunCommand, request),
    queryMetadata: (request) => ipcRenderer2.invoke(IpcChannels2.PluginsQueryMetadata, request),
    querySources: (request) => ipcRenderer2.invoke(IpcChannels2.PluginsQuerySources, request),
    resolveSourcePlayback: (request) => ipcRenderer2.invoke(IpcChannels2.PluginsResolveSourcePlayback, request),
    queryLyrics: (request) => ipcRenderer2.invoke(IpcChannels2.PluginsQueryLyrics, request),
    queryCovers: (request) => ipcRenderer2.invoke(IpcChannels2.PluginsQueryCovers, request),
    getSettings: (pluginId) => ipcRenderer2.invoke(IpcChannels2.PluginsGetSettings, pluginId),
    setSettings: (pluginId, patch) => ipcRenderer2.invoke(IpcChannels2.PluginsSetSettings, pluginId, patch),
    getLogs: (pluginId) => ipcRenderer2.invoke(IpcChannels2.PluginsGetLogs, pluginId)
  };
}
function createAccountsApi(ipcRenderer2, IpcChannels2) {
  return {
    getStatuses: () => ipcRenderer2.invoke(IpcChannels2.AccountGetStatuses),
    getStatus: (provider) => ipcRenderer2.invoke(IpcChannels2.AccountGetStatus, provider),
    saveCookie: (provider, cookie) => ipcRenderer2.invoke(IpcChannels2.AccountSaveCookie, provider, cookie),
    startLogin: (provider) => ipcRenderer2.invoke(IpcChannels2.AccountStartLogin, provider),
    startNeteaseQrLogin: () => ipcRenderer2.invoke(IpcChannels2.AccountStartNeteaseQrLogin),
    pollNeteaseQrLogin: (key) => ipcRenderer2.invoke(IpcChannels2.AccountPollNeteaseQrLogin, key),
    clear: (provider) => ipcRenderer2.invoke(IpcChannels2.AccountClear, provider),
    check: (provider) => ipcRenderer2.invoke(IpcChannels2.AccountCheck, provider),
    checkAll: () => ipcRenderer2.invoke(IpcChannels2.AccountCheckAll),
    setBrowser: (provider, browser) => ipcRenderer2.invoke(IpcChannels2.AccountSetBrowser, provider, browser),
    setYouTubeBrowser: (browser) => ipcRenderer2.invoke(IpcChannels2.AccountSetYouTubeBrowser, browser),
    onStatusesChanged: (handler) => {
      const listener = (_event, statuses) => {
        handler(Array.isArray(statuses) ? statuses : []);
      };
      ipcRenderer2.on(IpcChannels2.AccountStatusesChanged, listener);
      return () => ipcRenderer2.off(IpcChannels2.AccountStatusesChanged, listener);
    }
  };
}
function createSpotifyApi(ipcRenderer2, IpcChannels2) {
  return {
    getAccessToken: () => ipcRenderer2.invoke(IpcChannels2.SpotifyGetAccessToken),
    getDevices: () => ipcRenderer2.invoke(IpcChannels2.SpotifyGetDevices),
    getPlaybackState: () => ipcRenderer2.invoke(IpcChannels2.SpotifyGetPlaybackState),
    ensureConnectDevice: (request) => ipcRenderer2.invoke(IpcChannels2.SpotifyEnsureConnectDevice, request),
    startPlayback: (request) => ipcRenderer2.invoke(IpcChannels2.SpotifyStartPlayback, request),
    transferPlayback: (request) => ipcRenderer2.invoke(IpcChannels2.SpotifyTransferPlayback, request),
    pause: (deviceId) => ipcRenderer2.invoke(IpcChannels2.SpotifyPause, deviceId),
    resume: (deviceId) => ipcRenderer2.invoke(IpcChannels2.SpotifyResume, deviceId),
    seek: (positionMs, deviceId) => ipcRenderer2.invoke(IpcChannels2.SpotifySeek, positionMs, deviceId),
    setVolume: (volume, deviceId) => ipcRenderer2.invoke(IpcChannels2.SpotifySetVolume, volume, deviceId)
  };
}
function createSmtcApi(ipcRenderer2, IpcChannels2) {
  return {
    getDiagnostics: () => ipcRenderer2.invoke(IpcChannels2.SmtcGetDiagnostics),
    setLyricsProgress: (progress) => ipcRenderer2.invoke(IpcChannels2.SmtcSetLyricsProgress, progress),
    setEnabledActions: (actions) => ipcRenderer2.invoke(IpcChannels2.SmtcSetEnabledActions, actions),
    restart: () => ipcRenderer2.invoke(IpcChannels2.SmtcRestart),
    onCommand: (handler) => {
      const listener = (_event, command) => {
        handler(command);
      };
      ipcRenderer2.on(IpcChannels2.SmtcCommand, listener);
      return () => ipcRenderer2.off(IpcChannels2.SmtcCommand, listener);
    }
  };
}
function createAudioCdApi(ipcRenderer2, IpcChannels2) {
  return {
    getStatus: (driveId) => ipcRenderer2.invoke(IpcChannels2.AudioCdGetStatus, driveId),
    playTrack: (request) => ipcRenderer2.invoke(IpcChannels2.AudioCdPlayTrack, request)
  };
}
const playbackProxyCommands = /* @__PURE__ */ new Set(["playLocalFile", "playMediaItem", "play", "pause", "stop", "seek", "control"]);
function isMainPlaybackRenderer() {
  const rendererSearchParams = new URLSearchParams(typeof window.location?.search === "string" ? window.location.search : "");
  return rendererSearchParams.get("miniPlayer") !== "1" && rendererSearchParams.get("desktopLyrics") !== "1";
}
const isPlainRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
function setupPlaybackProxy(ipcRenderer2, IpcChannels2, echoApi2, deps2) {
  if (!isMainPlaybackRenderer()) {
    return;
  }
  const handleMainWindowPlaybackCommand = async (_event, rawRequest) => {
    if (!isPlainRecord(rawRequest) || typeof rawRequest.id !== "string") {
      return;
    }
    const command = typeof rawRequest.command === "string" ? rawRequest.command : "";
    const args = Array.isArray(rawRequest.args) ? rawRequest.args : [];
    if (!playbackProxyCommands.has(command)) {
      ipcRenderer2.send(IpcChannels2.PlaybackMainWindowCommandResult, {
        id: rawRequest.id,
        ok: false,
        error: "unsupported_main_window_playback_command"
      });
      return;
    }
    try {
      let value = null;
      switch (command) {
        case "playLocalFile":
          value = await echoApi2.playback.playLocalFile(args[0]);
          break;
        case "playMediaItem":
          value = await echoApi2.playback.playMediaItem(args[0]);
          break;
        case "play":
          value = await echoApi2.playback.play();
          break;
        case "pause":
          value = await echoApi2.playback.pause();
          break;
        case "stop":
          value = await echoApi2.playback.stop();
          break;
        case "seek":
          value = await echoApi2.playback.seek(Number(args[0]));
          break;
        case "control": {
          const handler = Array.from(deps2.mainWindowControlHandlers ?? []).at(-1);
          if (!handler) {
            throw new Error("main_window_playback_controller_unavailable");
          }
          await handler(args[0]);
          break;
        }
      }
      ipcRenderer2.send(IpcChannels2.PlaybackMainWindowCommandResult, {
        id: rawRequest.id,
        ok: true,
        value
      });
    } catch (error) {
      ipcRenderer2.send(IpcChannels2.PlaybackMainWindowCommandResult, {
        id: rawRequest.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };
  ipcRenderer2.on(IpcChannels2.PlaybackMainWindowCommandRequest, handleMainWindowPlaybackCommand);
}
function createLastFmApi(ipcRenderer2, IpcChannels2) {
  return {
    getStatus: () => ipcRenderer2.invoke(IpcChannels2.LastFmGetStatus),
    setEnabled: (enabled) => ipcRenderer2.invoke(IpcChannels2.LastFmSetEnabled, enabled),
    setNowPlayingEnabled: (enabled) => ipcRenderer2.invoke(IpcChannels2.LastFmSetNowPlayingEnabled, enabled),
    setScrobbleEnabled: (enabled) => ipcRenderer2.invoke(IpcChannels2.LastFmSetScrobbleEnabled, enabled),
    createAuthToken: () => ipcRenderer2.invoke(IpcChannels2.LastFmCreateAuthToken),
    openAuthUrl: (token) => ipcRenderer2.invoke(IpcChannels2.LastFmOpenAuthUrl, token),
    completeAuth: (token) => ipcRenderer2.invoke(IpcChannels2.LastFmCompleteAuth, token),
    authenticatePassword: (username, password) => ipcRenderer2.invoke(IpcChannels2.LastFmAuthenticatePassword, username, password),
    disconnect: () => ipcRenderer2.invoke(IpcChannels2.LastFmDisconnect)
  };
}
function createDiscordPresenceApi(ipcRenderer2, IpcChannels2) {
  return {
    getStatus: () => ipcRenderer2.invoke(IpcChannels2.DiscordPresenceGetStatus),
    setEnabled: (enabled) => ipcRenderer2.invoke(IpcChannels2.DiscordPresenceSetEnabled, enabled)
  };
}
function createStageBridgeApi(ipcRenderer2, IpcChannels2) {
  return {
    getStatus: () => ipcRenderer2.invoke(IpcChannels2.StageBridgeGetStatus),
    setEnabled: (patch) => ipcRenderer2.invoke(IpcChannels2.StageBridgeSetEnabled, patch)
  };
}
function createEchoLinkApi(ipcRenderer2, IpcChannels2) {
  return {
    getStatus: () => ipcRenderer2.invoke(IpcChannels2.EchoLinkBasicGetStatus),
    setEnabled: (enabled) => ipcRenderer2.invoke(IpcChannels2.EchoLinkBasicSetEnabled, enabled),
    startPairing: () => ipcRenderer2.invoke(IpcChannels2.EchoLinkBasicStartPairing),
    cancelPairing: () => ipcRenderer2.invoke(IpcChannels2.EchoLinkBasicCancelPairing),
    revokeClient: (clientId) => ipcRenderer2.invoke(IpcChannels2.EchoLinkBasicRevokeClient, clientId)
  };
}
function createMqttIntegrationApi(ipcRenderer2, IpcChannels2) {
  return {
    getStatus: () => ipcRenderer2.invoke(IpcChannels2.MqttIntegrationGetStatus),
    updateSettings: (patch) => ipcRenderer2.invoke(IpcChannels2.MqttIntegrationUpdateSettings, patch)
  };
}
const sa = createSystemAudioEngine(ipcRenderer, IpcChannels), sanitize = (p) => Array.isArray(p) ? p.filter((x) => typeof x === "string") : [], localFileHandlers = /* @__PURE__ */ new Set(), pendingLocalFiles = [], automixHandlers = /* @__PURE__ */ new Set(), mainWindowControlHandlers = /* @__PURE__ */ new Set(), rsp = new URLSearchParams(typeof window.location?.search === "string" ? window.location.search : ""), isMain = rsp.get("miniPlayer") !== "1" && rsp.get("desktopLyrics") !== "1", invokeMain = (cmd, args = []) => ipcRenderer.invoke(IpcChannels.PlaybackMainWindowCommand, { command: cmd, args });
ipcRenderer.on(IpcChannels.PlaybackLocalAudioFilesOpened, (_e, p) => {
  const s = sanitize(p);
  if (!s.length) return;
  if (!localFileHandlers.size) {
    pendingLocalFiles.push(s);
    return;
  }
  for (const h of localFileHandlers) h(s);
});
ipcRenderer.on(IpcChannels.PlaybackAutomixAdvance, (_e, p) => {
  if (!p || typeof p !== "object") return;
  const e = p;
  if (typeof e.toTrackId !== "string") return;
  const ev = {
    fromTrackId: typeof e.fromTrackId === "string" ? e.fromTrackId : null,
    toTrackId: e.toTrackId,
    transitionSeconds: typeof e.transitionSeconds === "number" && Number.isFinite(e.transitionSeconds) ? e.transitionSeconds : 0,
    mode: e.mode === "smartCrossfade" || e.mode === "beatAligned" || e.mode === "energyFade" || e.mode === "gaplessFallback" ? e.mode : void 0,
    fallbackReason: typeof e.fallbackReason === "string" ? e.fallbackReason : null,
    beatAligned: e.beatAligned === true,
    skipIntroSilence: e.skipIntroSilence === true,
    nextStartSeconds: typeof e.nextStartSeconds === "number" && Number.isFinite(e.nextStartSeconds) ? e.nextStartSeconds : void 0
  };
  for (const h of automixHandlers) h(ev);
});
const deps = { localAudioFileOpenHandlers: localFileHandlers, pendingLocalAudioFileOpenEvents: pendingLocalFiles, automixAdvanceHandlers: automixHandlers, mainWindowControlHandlers, isMainPlaybackRenderer: isMain, invokeMainPlaybackRenderer: invokeMain };
const echoApi = {
  app: createAppApi(ipcRenderer, IpcChannels),
  desktopLyrics: createDesktopLyricsApi(ipcRenderer, IpcChannels),
  miniPlayer: createMiniPlayerApi(ipcRenderer, IpcChannels),
  library: createLibraryApi(ipcRenderer, IpcChannels, webUtils),
  taskbarMiniPlayer: {
    show: () => ipcRenderer.invoke(IpcChannels.TaskbarMiniPlayerShow),
    hide: () => ipcRenderer.invoke(IpcChannels.TaskbarMiniPlayerHide),
    getState: () => ipcRenderer.invoke(IpcChannels.TaskbarMiniPlayerGetState),
    setEnabled: (enabled) => ipcRenderer.invoke(IpcChannels.TaskbarMiniPlayerSetEnabled, enabled),
    onStateChanged: (handler) => {
      const listener = (_event, state) => {
        handler(state);
      };
      ipcRenderer.on(IpcChannels.TaskbarMiniPlayerStateChanged, listener);
      return () => ipcRenderer.off(IpcChannels.TaskbarMiniPlayerStateChanged, listener);
    }
  },
  libraryLab: createLibraryLabApi(ipcRenderer, IpcChannels),
  playback: createPlaybackApi(ipcRenderer, IpcChannels, sa, deps),
  remoteSources: createRemoteSourcesApi(ipcRenderer, IpcChannels),
  connect: createConnectApi(ipcRenderer, IpcChannels),
  streaming: createStreamingApi(ipcRenderer, IpcChannels),
  lyrics: createLyricsApi(ipcRenderer, IpcChannels),
  mv: createMvApi(ipcRenderer, IpcChannels),
  hqPlayer: createHqPlayerApi(ipcRenderer, IpcChannels),
  audio: createAudioApi(ipcRenderer, IpcChannels, sa),
  eq: createEqApi(ipcRenderer, IpcChannels, sa),
  diagnostics: createDiagnosticsApi(ipcRenderer, IpcChannels),
  downloads: createDownloadsApi(ipcRenderer, IpcChannels),
  plugins: createPluginsApi(ipcRenderer, IpcChannels, webUtils),
  accounts: createAccountsApi(ipcRenderer, IpcChannels),
  spotify: createSpotifyApi(ipcRenderer, IpcChannels),
  smtc: createSmtcApi(ipcRenderer, IpcChannels),
  audioCd: createAudioCdApi(ipcRenderer, IpcChannels),
  sleepTimer: createSleepTimerApi(ipcRenderer, IpcChannels),
  lastfm: createLastFmApi(ipcRenderer, IpcChannels),
  discordPresence: createDiscordPresenceApi(ipcRenderer, IpcChannels),
  stageBridge: createStageBridgeApi(ipcRenderer, IpcChannels),
  echoLink: createEchoLinkApi(ipcRenderer, IpcChannels),
  mqttIntegration: createMqttIntegrationApi(ipcRenderer, IpcChannels)
};
contextBridge.exposeInMainWorld("echo", echoApi);
setupPlaybackProxy(ipcRenderer, IpcChannels, echoApi, deps);
