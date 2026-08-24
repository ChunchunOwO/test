import { describe, expect, it } from 'vitest';
import { resolveEffectivePerformancePolicy } from './performancePolicy';

describe('resolveEffectivePerformancePolicy', () => {
  it('virtualizes media walls by default while preserving an explicit opt-out', () => {
    expect(resolveEffectivePerformancePolicy({})).toMatchObject({
      albumWallVirtualizationEnabled: true,
      mediaWallVirtualizationEnabled: true,
      homeWaveformVisualizerEnabled: false,
    });
    expect(resolveEffectivePerformancePolicy({ albumWallVirtualizationEnabled: false })).toMatchObject({
      albumWallVirtualizationEnabled: false,
      mediaWallVirtualizationEnabled: false,
    });
  });

  it('enables the Steam graphics pressure guard unless the user opts out', () => {
    expect(resolveEffectivePerformancePolicy({}).lyricsMvGraphicsPressureGuardEnabled).toBe(true);
    expect(resolveEffectivePerformancePolicy({ lyricsMvGraphicsPressureGuardEnabled: false }).lyricsMvGraphicsPressureGuardEnabled).toBe(false);
  });

  it('preserves individual preferences when low spec mode is disabled', () => {
    const policy = resolveEffectivePerformancePolicy({
      lowSpecModeEnabled: false,
      appWindowAcrylicEnabled: true,
      appWallpaperBlurPx: 18,
      albumWallVirtualizationEnabled: false,
      homeWaveformVisualizerEnabled: true,
      audioVisualSpectrumEnabled: true,
      playerWaveformProgressEnabled: true,
      lyricsMvGraphicsPressureGuardEnabled: false,
      lyricsMusicReactiveVisualsEnabled: true,
      lyricsWordHighlightEnabled: true,
      lyricsSmartReadableColorsEnabled: true,
      nowPlayingCoverColorEnabled: true,
      autoFetchArtistImages: true,
      artistImageFetchPaused: false,
      liveLibraryUpdatesEnabled: true,
      scanPerformanceMode: 'performance',
      remoteCoverLoadPerformanceMode: 'aggressive',
      remoteBackgroundConcurrency: { metadata: 5, cover: 12, lyrics: 3, durationBackfill: 4 },
    });

    expect(policy).toMatchObject({
      lowSpecModeEnabled: false,
      reduceMotion: false,
      allowVideoWallpaper: true,
      allowLayoutMotion: true,
      appWindowAcrylicEnabled: true,
      appWallpaperBlurPx: 18,
      albumWallVirtualizationEnabled: false,
      mediaWallVirtualizationEnabled: false,
      genreMosaicMaxTiles: 4,
      wallImageMaxConcurrent: 6,
      homeWaveformVisualizerEnabled: true,
      audioVisualSpectrumEnabled: true,
      playerWaveformProgressEnabled: true,
      lyricsMvGraphicsPressureGuardEnabled: false,
      lyricsMusicReactiveVisualsEnabled: true,
      lyricsThemeFilterEnabled: true,
      lyricsImmersiveCoverStyleEnabled: false,
      lyricsImmersiveCoverGlassEnabled: false,
      lyricsWordHighlightEnabled: true,
      lyricsSmartReadableColorsEnabled: true,
      nowPlayingCoverColorEnabled: true,
      artistImageBackgroundFetchEnabled: true,
      liveLibraryUpdatesEnabled: true,
      scanPerformanceMode: 'performance',
      remoteCoverLoadPerformanceMode: 'aggressive',
    });
    expect(policy.remoteBackgroundConcurrency).toEqual({ metadata: 5, cover: 12, lyrics: 3, durationBackfill: 4 });
  });

  it('applies conservative runtime overrides without changing audio or hardware settings', () => {
    const source = {
      lowSpecModeEnabled: true,
      appWindowAcrylicEnabled: true,
      appWallpaperBlurPx: 24,
      albumWallVirtualizationEnabled: false,
      homeWaveformVisualizerEnabled: true,
      audioVisualSpectrumEnabled: true,
      playerWaveformProgressEnabled: true,
      lyricsMvGraphicsPressureGuardEnabled: false,
      lyricsMusicReactiveVisualsEnabled: true,
      lyricsWordHighlightEnabled: true,
      lyricsSmartReadableColorsEnabled: true,
      nowPlayingCoverColorEnabled: true,
      autoFetchArtistImages: true,
      artistImageFetchPaused: false,
      liveLibraryUpdatesEnabled: true,
      scanPerformanceMode: 'performance' as const,
      remoteCoverLoadPerformanceMode: 'lan' as const,
      remoteBackgroundConcurrency: { metadata: 5, cover: 12, lyrics: 3, durationBackfill: 4 },
      hardwareAccelerationDisabled: false,
      lowLoadPlaybackModeEnabled: false,
    };

    expect(resolveEffectivePerformancePolicy(source)).toEqual({
      lowSpecModeEnabled: true,
      reduceMotion: true,
      allowVideoWallpaper: false,
      allowLayoutMotion: false,
      appWindowAcrylicEnabled: false,
      appWallpaperBlurPx: 0,
      albumWallVirtualizationEnabled: true,
      mediaWallVirtualizationEnabled: true,
      genreMosaicMaxTiles: 1,
      wallImageMaxConcurrent: 2,
      wallImageRootMargin: '160px 0px',
      mediaWallOverscanRows: 1,
      homeWaveformVisualizerEnabled: false,
      audioVisualSpectrumEnabled: false,
      playerWaveformProgressEnabled: false,
      lyricsMvGraphicsPressureGuardEnabled: true,
      lyricsMusicReactiveVisualsEnabled: false,
      lyricsThemeFilterEnabled: false,
      lyricsImmersiveCoverStyleEnabled: false,
      lyricsImmersiveCoverGlassEnabled: false,
      lyricsCoverBlurPx: 0,
      lyricsWordHighlightEnabled: false,
      lyricsSmartReadableColorsEnabled: false,
      nowPlayingCoverColorEnabled: false,
      artistImageBackgroundFetchEnabled: false,
      liveLibraryUpdatesEnabled: false,
      scanPerformanceMode: 'low',
      remoteCoverLoadPerformanceMode: 'low',
      remoteBackgroundConcurrency: { metadata: 1, cover: 1, lyrics: 1, durationBackfill: 1 },
    });
    expect(source.hardwareAccelerationDisabled).toBe(false);
    expect(source.lowLoadPlaybackModeEnabled).toBe(false);
  });
});
