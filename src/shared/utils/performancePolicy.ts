import type {
  AppSettings,
  RemoteBackgroundConcurrencySettings,
  RemoteCoverLoadPerformanceMode,
  ScanPerformanceMode,
} from '../types/appSettings';

export const LOW_SPEC_MODE_DOM_ATTRIBUTE = 'data-low-spec-mode';

export const defaultWallImageMaxConcurrent = 6;
export const lowSpecWallImageMaxConcurrent = 2;
export const defaultWallImageRootMargin = '720px 0px';
export const lowSpecWallImageRootMargin = '160px 0px';
export const defaultGenreMosaicMaxTiles = 4;
export const lowSpecGenreMosaicMaxTiles = 1;
export const defaultMediaWallOverscanRows = 5;
export const lowSpecMediaWallOverscanRows = 1;

export type EffectivePerformancePolicy = {
  lowSpecModeEnabled: boolean;
  reduceMotion: boolean;
  allowVideoWallpaper: boolean;
  allowLayoutMotion: boolean;
  appWindowAcrylicEnabled: boolean;
  appWallpaperBlurPx: number;
  albumWallVirtualizationEnabled: boolean;
  mediaWallVirtualizationEnabled: boolean;
  genreMosaicMaxTiles: number;
  wallImageMaxConcurrent: number;
  wallImageRootMargin: string;
  mediaWallOverscanRows: number;
  homeWaveformVisualizerEnabled: boolean;
  audioVisualSpectrumEnabled: boolean;
  playerWaveformProgressEnabled: boolean;
  lyricsMvGraphicsPressureGuardEnabled: boolean;
  lyricsMusicReactiveVisualsEnabled: boolean;
  lyricsThemeFilterEnabled: boolean;
  lyricsImmersiveCoverStyleEnabled: boolean;
  lyricsImmersiveCoverGlassEnabled: boolean;
  lyricsCoverBlurPx: number;
  lyricsWordHighlightEnabled: boolean;
  lyricsSmartReadableColorsEnabled: boolean;
  nowPlayingCoverColorEnabled: boolean;
  artistImageBackgroundFetchEnabled: boolean;
  liveLibraryUpdatesEnabled: boolean;
  scanPerformanceMode: ScanPerformanceMode;
  remoteCoverLoadPerformanceMode: RemoteCoverLoadPerformanceMode;
  remoteBackgroundConcurrency: RemoteBackgroundConcurrencySettings;
};

const defaultRemoteBackgroundConcurrency: RemoteBackgroundConcurrencySettings = {
  metadata: 3,
  cover: 6,
  lyrics: 2,
  durationBackfill: 2,
};

const lowSpecRemoteBackgroundConcurrency: RemoteBackgroundConcurrencySettings = {
  metadata: 1,
  cover: 1,
  lyrics: 1,
  durationBackfill: 1,
};

const normalizeScanPerformanceMode = (value: AppSettings['scanPerformanceMode'] | undefined): ScanPerformanceMode =>
  value === 'low' || value === 'performance' || value === 'ultra' ? value : 'balanced';

const normalizeRemoteCoverLoadPerformanceMode = (
  value: AppSettings['remoteCoverLoadPerformanceMode'] | undefined,
): RemoteCoverLoadPerformanceMode =>
  value === 'low' || value === 'aggressive' || value === 'lan' ? value : 'balanced';

const normalizeBlurPx = (value: AppSettings['appWallpaperBlurPx'] | undefined): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(40, Math.round(Number(value)))) : 0;

const normalizeCoverBlurPx = (value: AppSettings['lyricsCoverBlurPx'] | undefined): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(80, Math.round(Number(value)))) : 10;

export const isLowSpecModeEnabled = (settings: Partial<AppSettings> | null | undefined): boolean =>
  settings?.lowSpecModeEnabled === true;

export const isLowSpecModeDomActive = (): boolean => {
  if (typeof document === 'undefined') {
    return false;
  }

  return document.querySelector('.app-shell')?.getAttribute(LOW_SPEC_MODE_DOM_ATTRIBUTE) === 'true';
};

/**
 * Resolves runtime-only performance overrides without mutating persisted user preferences.
 * Audio backend, output, DSP, and hardware-acceleration settings are intentionally out of scope.
 */
export const resolveEffectivePerformancePolicy = (
  settings: Partial<AppSettings> | null | undefined,
): EffectivePerformancePolicy => {
  const lowSpecModeEnabled = isLowSpecModeEnabled(settings);
  const remoteBackgroundConcurrency = settings?.remoteBackgroundConcurrency ?? defaultRemoteBackgroundConcurrency;

  return {
    lowSpecModeEnabled,
    reduceMotion: lowSpecModeEnabled,
    allowVideoWallpaper: !lowSpecModeEnabled,
    allowLayoutMotion: !lowSpecModeEnabled,
    appWindowAcrylicEnabled: lowSpecModeEnabled ? false : settings?.appWindowAcrylicEnabled === true,
    appWallpaperBlurPx: lowSpecModeEnabled ? 0 : normalizeBlurPx(settings?.appWallpaperBlurPx),
    albumWallVirtualizationEnabled: lowSpecModeEnabled || settings?.albumWallVirtualizationEnabled !== false,
    mediaWallVirtualizationEnabled: lowSpecModeEnabled || settings?.albumWallVirtualizationEnabled !== false,
    genreMosaicMaxTiles: lowSpecModeEnabled ? lowSpecGenreMosaicMaxTiles : defaultGenreMosaicMaxTiles,
    wallImageMaxConcurrent: lowSpecModeEnabled ? lowSpecWallImageMaxConcurrent : defaultWallImageMaxConcurrent,
    wallImageRootMargin: lowSpecModeEnabled ? lowSpecWallImageRootMargin : defaultWallImageRootMargin,
    mediaWallOverscanRows: lowSpecModeEnabled ? lowSpecMediaWallOverscanRows : defaultMediaWallOverscanRows,
    homeWaveformVisualizerEnabled: !lowSpecModeEnabled && settings?.homeWaveformVisualizerEnabled === true,
    audioVisualSpectrumEnabled: !lowSpecModeEnabled && settings?.audioVisualSpectrumEnabled === true,
    playerWaveformProgressEnabled: !lowSpecModeEnabled && settings?.playerWaveformProgressEnabled === true,
    lyricsMvGraphicsPressureGuardEnabled: lowSpecModeEnabled || settings?.lyricsMvGraphicsPressureGuardEnabled !== false,
    lyricsMusicReactiveVisualsEnabled: !lowSpecModeEnabled && settings?.lyricsMusicReactiveVisualsEnabled === true,
    lyricsThemeFilterEnabled: !lowSpecModeEnabled && settings?.lyricsThemeFilterEnabled !== false,
    lyricsImmersiveCoverStyleEnabled: !lowSpecModeEnabled && settings?.lyricsImmersiveCoverStyleEnabled === true,
    lyricsImmersiveCoverGlassEnabled: !lowSpecModeEnabled && settings?.lyricsImmersiveCoverGlassEnabled === true,
    lyricsCoverBlurPx: lowSpecModeEnabled ? 0 : normalizeCoverBlurPx(settings?.lyricsCoverBlurPx),
    lyricsWordHighlightEnabled: !lowSpecModeEnabled && settings?.lyricsWordHighlightEnabled === true,
    lyricsSmartReadableColorsEnabled: !lowSpecModeEnabled && settings?.lyricsSmartReadableColorsEnabled === true,
    nowPlayingCoverColorEnabled: !lowSpecModeEnabled && settings?.nowPlayingCoverColorEnabled === true,
    artistImageBackgroundFetchEnabled: !lowSpecModeEnabled && settings?.autoFetchArtistImages === true && settings?.artistImageFetchPaused !== true,
    liveLibraryUpdatesEnabled: !lowSpecModeEnabled && settings?.liveLibraryUpdatesEnabled === true,
    scanPerformanceMode: lowSpecModeEnabled ? 'low' : normalizeScanPerformanceMode(settings?.scanPerformanceMode),
    remoteCoverLoadPerformanceMode: lowSpecModeEnabled
      ? 'low'
      : normalizeRemoteCoverLoadPerformanceMode(settings?.remoteCoverLoadPerformanceMode),
    remoteBackgroundConcurrency: lowSpecModeEnabled
      ? { ...lowSpecRemoteBackgroundConcurrency }
      : { ...remoteBackgroundConcurrency },
  };
};
