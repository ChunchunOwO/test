// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { useEffect, useRef, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { AudioStatus } from "../../shared/types/audio";
import type { AppSettings } from "../../shared/types/appSettings";
import type { DiagnosticMemoryPressureEvent } from "../../shared/types/diagnostics";
import type { LibraryAlbum, LibraryTrack } from "../../shared/types/library";
import type {
  LyricsSearchCandidate,
  TrackLyrics,
} from "../../shared/types/lyrics";
import type { MvSettings, TrackVideo } from "../../shared/types/mv";
import type { PlaybackStatus } from "../../shared/types/playback";
import {
  PlaybackQueueProvider,
  usePlaybackQueue,
} from "../stores/PlaybackQueueProvider";
import {
  beginPlaybackSeekSnapshot,
  setPlaybackStatusSnapshot,
} from "../stores/playbackStatusStore";
import {
  __lyricsPageSessionMemoryForTests,
  __lyricsWindowLayoutForTests,
  LyricsPage,
} from "./LyricsPage";
import type { LyricLine } from "../components/lyrics/lyricsTypes";
import { clearReadableColorSampleCache } from "../components/lyrics/lyricsReadableColor";
import { albumDetailNavigationEvent } from "../utils/albumNavigation";

const originalClipboard = window.navigator.clipboard;

const makeTrack = (overrides: Partial<LibraryTrack> = {}): LibraryTrack => ({
  id: "track-1",
  path: "D:\\Music\\song.flac",
  title: "Test Song",
  artist: "Test Artist",
  album: "Test Album",
  albumArtist: "Test Album Artist",
  trackNo: 1,
  discNo: 1,
  year: 2026,
  genre: null,
  duration: 180,
  codec: "flac",
  sampleRate: 96000,
  bitDepth: 24,
  bitrate: 2400000,
  coverId: null,
  coverThumb: "echo-cover://thumb/test",
  embeddedMetadataStatus: "present",
  embeddedCoverStatus: "present",
  networkMetadataStatus: "none",
  fieldSources: {},
  ...overrides,
});

const makeAlbum = (overrides: Partial<LibraryAlbum> = {}): LibraryAlbum => ({
  id: "album-1",
  albumKey: "test-artist/test-album",
  title: "Test Album",
  albumArtist: "Test Album Artist",
  year: 2026,
  trackCount: 1,
  duration: 180,
  coverId: null,
  coverThumb: "echo-cover://album/test",
  ...overrides,
});

const makeAudioStatus = (
  track: LibraryTrack | null,
  positionSeconds = 0,
): AudioStatus => ({
  host: "ready",
  state: track ? "playing" : "idle",
  outputDeviceId: null,
  outputDeviceName: null,
  outputDeviceType: null,
  outputBackend: "wasapi-shared",
  activeOutputBackendImpl: null,
  outputMode: "shared",
  activeDecodeBackendImpl: null,
  volume: 1,
  playbackRate: 1,
  playbackSpeedMode: "nightcore",
  currentFilePath: track?.path ?? null,
  currentTrackId: track?.id ?? null,
  durationSeconds: track?.duration ?? 0,
  positionSeconds,
  channels: 2,
  codec: track?.codec ?? null,
  bitDepth: track?.bitDepth ?? null,
  bitrate: track?.bitrate ?? null,
  fileSampleRate: track?.sampleRate ?? null,
  decoderOutputSampleRate: track?.sampleRate ?? null,
  requestedOutputSampleRate: track?.sampleRate ?? null,
  actualDeviceSampleRate: track?.sampleRate ?? null,
  sharedDeviceSampleRate: track?.sampleRate ?? null,
  resampling: false,
  bitPerfectCandidate: false,
  sampleRateMismatch: false,
  eqEnabled: false,
  channelBalanceEnabled: false,
  dspActive: false,
  preampDb: 0,
  eqPresetName: "Flat",
  clippingRisk: false,
  bitPerfectDisabledReason: null,
  warnings: [],
  error: null,
});

const makeAppSettings = (
  overrides: Partial<AppSettings> = {},
): AppSettings => ({
  appearanceTheme: "light",
  albumMergeStrategy: "standard",
  artistWallAlbumArtwork: false,
  coverCacheDir: null,
  hideToTrayOnClose: false,
  appCustomWallpaperPath: null,
  appWallpaperScalePercent: 100,
  appWallpaperBlurPx: 0,
  appWallpaperBrightnessPercent: 100,
  appWallpaperUiOpacityPercent: 100,
  appWallpaperUnifiedOpacityEnabled: false,
  networkMetadataEnabled: true,
  networkMetadataProviders: ["netease-cloud-music", "qq-music"],
  lyricsNetworkEnabled: true,
  lyricsPreferredProvider: "lrclib",
  lyricsEnabledProviders: ["local", "lrclib", "netease", "qqmusic"],
  lyricsProviderOrder: ["local", "lrclib", "netease", "qqmusic"],
  lyricsDeepSearchEnabled: true,
  lyricsAutoSearch: true,
  lyricsAutoApplyEnabled: true,
  lyricsAutoAcceptScore: 0.5,
  lyricsBackfillAutoAcceptScore: 0.45,
  lyricsDefaultOffsetMs: 0,
  lyricsGlobalSyncOffsetMs: 0,
  lyricsTimelineCorrectionEnabled: true,
  lyricsOffsetControlsEnabled: true,
  lyricsSmartAlignmentEnabled: false,
  lyricsEnabled: true,
  lyricsHeaderHidden: false,
  lyricsCandidatePanelAutoOpenEnabled: false,
  lyricsEmptyStateHidden: true,
  lyricsRomanizationEnabled: true,
  lyricsUtatenKanaEnabled: false,
  lyricsTranslationEnabled: true,
  lyricsWordHighlightEnabled: true,
  lyricsTextDirection: "horizontal",
  lyricsFontSizePx: 40,
  lyricsSecondaryFontSizePx: 22,
  lyricsLineSpacingPercent: 110,
  lyricsLineMaxChars: 0,
  lyricsContextOpacityPercent: 49,
  lyricsColor: "#314054",
  lyricsSmartReadableColorsEnabled: false,
  lyricsImmersiveCoverStyleEnabled: false,
  lyricsImmersiveCoverGlassEnabled: false,
  lyricsImmersiveCoverGlassBlurPx: 16,
  lyricsMusicReactiveVisualsEnabled: false,
  lyricsBackgroundMode: "theme",
  lyricsCustomWallpaperPath: null,
  lyricsCoverOpacityPercent: 100,
  lyricsCoverBlurPx: 10,
  lyricsCoverBrightnessPercent: 100,
  lyricsBackgroundScalePercent: 100,
  mvEnabledProviders: ["bilibili", "youtube"],
  mvProviderOrder: ["bilibili", "youtube"],
  mvAutoSearch: true,
  mvMaxQuality: "1080p",
  mvAllow60fps: true,
  channelBalance: {
    enabled: false,
    balance: 0,
    leftGainDb: 0,
    rightGainDb: 0,
    swapLeftRight: false,
    monoMode: "off",
    invertLeft: false,
    invertRight: false,
    constantPower: true,
  },
  playerVolume: 1,
  playbackSpeed: 1,
  playbackSpeedMode: "nightcore",
  scanPerformanceMode: "balanced",
  duplicateTracksEnabled: false,
  duplicateTracksMode: "strict",
  duplicateTracksAutoRebuildAfterScan: false,
  discordRichPresenceEnabled: false,
  lastFmEnabled: false,
  lastFmUsername: null,
  lastFmSessionKey: null,
  lastFmScrobbleEnabled: true,
  lastFmNowPlayingEnabled: true,
  lastFmMinScrobbleSeconds: 30,
  lastFmAuthToken: null,
  smtcEnabled: true,
  ...overrides,
  smtcLyricsEnabled: overrides.smtcLyricsEnabled ?? false,
  taskbarPlaybackControlsEnabled: overrides.taskbarPlaybackControlsEnabled ?? false,
});

const lyrics: LyricLine[] = [
  { timeMs: 0, text: "First line" },
  { timeMs: 10000, text: "Second line" },
  { timeMs: 20000, text: "Third line" },
];

const makeTrackLyrics = (
  overrides: Partial<TrackLyrics> = {},
): TrackLyrics => ({
  id: "lyrics-1",
  trackId: "track-1",
  provider: "lrclib",
  providerLyricsId: "lrclib-1",
  kind: "synced",
  title: "Test Song",
  artist: "Test Artist",
  album: "Test Album",
  durationSeconds: 180,
  lines: lyrics,
  plainText: "First line\nSecond line\nThird line",
  syncedText:
    "[00:00.00]First line\n[00:10.00]Second line\n[00:20.00]Third line",
  offsetMs: 0,
  score: 0.99,
  cachedAt: "2026-05-13T00:00:00.000Z",
  updatedAt: "2026-05-13T00:00:00.000Z",
  ...overrides,
});

const deferred = <T,>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: unknown) => void } => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
};

const makeTrackVideo = (
  overrides: Partial<TrackVideo> = {},
): TrackVideo => ({
  id: "video-1",
  trackId: "track-1",
  provider: "local",
  sourceType: "manual",
  sourceId: "local:1",
  title: "Test Song MV",
  artist: "Test Artist",
  url: null,
  providerUrl: null,
  thumbnailUrl: null,
  filePath: null,
  mediaUrl: "echo-video://mv/video-1",
  mimeType: "video/mp4",
  durationSeconds: null,
  width: null,
  height: null,
  selectedQualityId: null,
  qualityLabel: null,
  fps: null,
  offsetMs: 0,
  score: 1,
  selected: true,
  playableInApp: true,
  rawProviderJson: null,
  createdAt: "2026-05-13T00:00:00.000Z",
  updatedAt: "2026-05-13T00:00:00.000Z",
  ...overrides,
});

const defaultMvSettings: MvSettings = {
  enabled: true,
  autoSearch: true,
  autoPreload: true,
  restartAudioOnLoad: true,
  enabledProviders: ["bilibili", "youtube"],
  providerOrder: ["bilibili", "youtube"],
  maxQuality: "1080p",
  allow60fps: true,
};

const attachMvBridge = (
  selected: TrackVideo | null,
  settings: MvSettings = defaultMvSettings,
): void => {
  window.echo = {
    ...window.echo,
    mv: {
      getSelected: vi.fn().mockResolvedValue(selected),
      getSettings: vi.fn().mockResolvedValue(settings),
      setSettings: vi.fn(),
      findLocalCandidates: vi.fn().mockResolvedValue([]),
      searchNetworkCandidates: vi.fn().mockResolvedValue([]),
      getCandidates: vi.fn().mockResolvedValue([]),
      resolveStreams: vi.fn().mockResolvedValue({ video: selected, variants: [] }),
      setQuality: vi.fn(),
      setOffset: vi.fn(),
      chooseLocalVideo: vi.fn().mockResolvedValue(null),
      bindLocalVideo: vi.fn(),
      selectVideo: vi.fn(),
      clearSelected: vi.fn(),
      openExternal: vi.fn(),
    },
  } as unknown as Window["echo"];
};

const makeLyricsCandidate = (
  overrides: Partial<LyricsSearchCandidate> = {},
): LyricsSearchCandidate => ({
  id: "candidate-1",
  provider: "lrclib",
  providerLyricsId: "provider-lyrics-1",
  title: "Test Song",
  artist: "Test Artist",
  album: "Test Album",
  durationSeconds: 180,
  instrumental: false,
  hasSynced: true,
  hasPlain: true,
  score: 0.96,
  sourceLabel: "LRCLIB",
  risk: "low",
  confidence: "high",
  autoAcceptEligible: true,
  durationDeltaSeconds: 0,
  previewLines: ["Preview line"],
  matchedSources: [{ provider: "lrclib", sourceLabel: "LRCLIB" }],
  reasons: ["duration_close", "synced_duration_safe"],
  ...overrides,
});

const QueueSeed = ({
  children,
  track,
}: {
  children: JSX.Element;
  track: LibraryTrack;
}): JSX.Element => {
  const { replaceQueue, setCurrentTrackId } = usePlaybackQueue();

  useEffect(() => {
    replaceQueue([track]);
    setCurrentTrackId(track.id);
  }, [replaceQueue, setCurrentTrackId, track]);

  return children;
};

const QueueSeedWithTracks = ({
  children,
  currentTrackId,
  tracks,
}: {
  children: JSX.Element;
  currentTrackId: string;
  tracks: LibraryTrack[];
}): JSX.Element => {
  const { replaceQueue, setCurrentTrackId } = usePlaybackQueue();

  useEffect(() => {
    replaceQueue(tracks);
    setCurrentTrackId(currentTrackId);
  }, [currentTrackId, replaceQueue, setCurrentTrackId, tracks]);

  return children;
};

const mockEcho = (
  track: LibraryTrack | null,
  positionSeconds = 0,
  settingsOverrides: Partial<AppSettings> = {},
): {
  emitAudioStatus: (status: AudioStatus) => void;
  emitMemoryPressure: (event: DiagnosticMemoryPressureEvent) => void;
  seek: ReturnType<typeof vi.fn>;
} => {
  const audioStatusHandlers = new Set<(status: AudioStatus) => void>();
  const memoryPressureHandlers = new Set<(event: DiagnosticMemoryPressureEvent) => void>();
  const seek = vi.fn().mockResolvedValue({
    state: "playing",
    currentTrackId: track?.id ?? null,
    positionMs: positionSeconds * 1000,
    durationMs: (track?.duration ?? 0) * 1000,
    filePath: track?.path ?? null,
  });

  window.echo = {
    app: {
      getSettings: vi
        .fn()
        .mockResolvedValue(makeAppSettings(settingsOverrides)),
      setSettings: vi.fn(),
      chooseLyricsWallpaper: vi.fn(),
    },
    playback: {
      getStatus: vi.fn().mockResolvedValue({
        state: track ? "playing" : "idle",
        currentTrackId: track?.id ?? null,
        positionMs: positionSeconds * 1000,
        durationMs: (track?.duration ?? 0) * 1000,
        filePath: track?.path ?? null,
      }),
      playLocalFile: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
      seek,
      openLocalAudioFile: vi.fn(),
    },
    audio: {
      getStatus: vi
        .fn()
        .mockResolvedValue(makeAudioStatus(track, positionSeconds)),
      listDevices: vi.fn(),
      setOutput: vi
        .fn()
        .mockResolvedValue(makeAudioStatus(track, positionSeconds)),
      onStatus: vi.fn((handler: (status: AudioStatus) => void) => {
        audioStatusHandlers.add(handler);
        return () => {
          audioStatusHandlers.delete(handler);
        };
      }),
    },
    library: {
      copyTrackOriginalCover: vi.fn().mockResolvedValue(true),
    },
    diagnostics: {
      onMemoryPressure: vi.fn((handler: (event: DiagnosticMemoryPressureEvent) => void) => {
        memoryPressureHandlers.add(handler);
        return () => {
          memoryPressureHandlers.delete(handler);
        };
      }),
    },
  } as unknown as Window["echo"];

  return {
    emitAudioStatus: (status: AudioStatus): void => {
      audioStatusHandlers.forEach((handler) => handler(status));
    },
    emitMemoryPressure: (event: DiagnosticMemoryPressureEvent): void => {
      memoryPressureHandlers.forEach((handler) => handler(event));
    },
    seek,
  };
};

const installClipboardTextMock = (): ReturnType<typeof vi.fn> => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(window.navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  return writeText;
};

afterEach(() => {
  cleanup();
  clearReadableColorSampleCache();
  Object.defineProperty(window.navigator, "clipboard", {
    configurable: true,
    value: originalClipboard,
  });
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("LyricsPage", () => {
  it("keeps the expanded lyrics layout in F11 fullscreen", () => {
    const { isExpandedWindowBounds } = __lyricsWindowLayoutForTests;

    expect(isExpandedWindowBounds(2048, 1094, 2048, 1152, 2048, 1094)).toBe(true);
    expect(isExpandedWindowBounds(2048, 1152, 2048, 1152, 2048, 1094)).toBe(true);
    expect(isExpandedWindowBounds(1600, 900, 2048, 1152, 2048, 1094)).toBe(false);
  });

  it("bounds remembered lyrics session state", () => {
    const { maxChars, maxEntries, prefix, readRememberedLyricsState, rememberLyricsState } =
      __lyricsPageSessionMemoryForTests;

    for (let index = 0; index < maxEntries + 2; index += 1) {
      rememberLyricsState(`track-${index}`, {
        kind: "synced",
        source: "local",
        offsetMs: 0,
        lines: [{ timeMs: index * 1000, text: `Line ${index}` }],
      });
    }

    expect(readRememberedLyricsState("track-0")).toBeNull();
    expect(readRememberedLyricsState(`track-${maxEntries + 1}`)?.lines[0]?.text).toBe(`Line ${maxEntries + 1}`);

    const retainedLyricsKeys = Array.from({ length: window.sessionStorage.length }, (_, index) =>
      window.sessionStorage.key(index),
    ).filter((key): key is string => Boolean(key?.startsWith(prefix)));
    expect(retainedLyricsKeys).toHaveLength(maxEntries);

    rememberLyricsState("oversized", {
      kind: "plain",
      source: "local",
      offsetMs: 0,
      lines: [{ timeMs: -1, text: "x".repeat(maxChars + 1) }],
    });

    expect(readRememberedLyricsState("oversized")).toBeNull();
    expect(window.sessionStorage.getItem(`${prefix}oversized`)).toBeNull();
  });

  it("keeps MV immersive lyrics readable over bright videos in dark mode", () => {
    const css = readFileSync("src/renderer/styles/lyrics.css", "utf8");

    expect(css).toContain("--lyrics-word-accent-color: var(--lyrics-color);");
    expect(css).toMatch(/\.lyrics-page:has\(\.lyrics-mv-background\) \.lyrics-line \{\s*color: var\(--lyrics-readable-color\);/);
    expect(css).toMatch(/\.lyrics-page:has\(\.lyrics-mv-background\) \.lyrics-line\[data-active="true"\] \{\s*color: var\(--lyrics-readable-color\);/);
    expect(css).toContain('html[data-theme="dark"] .lyrics-page:has(.lyrics-mv-background)');
    expect(css).toContain("--lyrics-readable-color: color-mix(in srgb, var(--theme-heading-text) 86%, var(--lyrics-color) 14%);");
    expect(css).toContain("--lyrics-word-accent-color: color-mix(in srgb, var(--color-accent-strong) 72%, var(--theme-heading-text) 28%);");
    expect(css).toMatch(/html\[data-theme="dark"\] \.lyrics-mv-background::after \{\s*opacity: max\(var\(--mv-immersive-overlay-opacity\), 0\.42\);/);
    expect(css).toContain("--lyrics-word-fill-color: var(--lyrics-word-accent-color);");
    expect(css).toMatch(/\.lyrics-word \{[\s\S]*?white-space: pre-wrap;/);
    expect(css).toContain("var(--lyrics-word-fill-color) 0 calc((var(--lyrics-word-progress) * 100%) - var(--lyrics-word-edge))");
    expect(css).toContain("color-mix(in srgb, var(--lyrics-word-fill-color) 72%, var(--lyrics-word-upcoming-color) 28%) calc(var(--lyrics-word-progress) * 100%)");
    expect(css).toContain('.lyrics-line[data-active="true"][data-word-highlight="true"] .lyrics-word[data-word-state="current"]');
    expect(css).toContain("--lyrics-word-upcoming-color: color-mix(in srgb, var(--lyrics-readable-color) var(--lyrics-current-word-clarity, 70%), transparent);");
    expect(css).toMatch(/\.lyrics-line\[data-active="true"\] \.lyrics-line-primary \{[\s\S]*?line-height: 1\.18;/);
    expect(css).not.toContain('scale(1.045)');
    expect(css).not.toContain('.lyrics-word[data-word-state="current"]::after');
    expect(css).toContain('.lyrics-page:has(.lyrics-mv-panel[data-lyrics-readability="true"]) .lyrics-line .lyrics-line-primary');
    expect(css).toContain('.lyrics-page:has(.lyrics-mv-panel[data-lyrics-readability="true"]) .lyrics-line[data-word-highlight="true"] .lyrics-word');
    expect(css).not.toMatch(/\.lyrics-page:has\(\.lyrics-mv-background\) \.lyrics-line(?:\[data-active="true"\])? \{\s*color: var\(--lyrics-color\);/);
  });

  it("applies the configured context opacity to every lyric distance", () => {
    const css = readFileSync("src/renderer/styles/lyrics.css", "utf8");

    for (const distance of [1, 2, 3, 4]) {
      expect(css).toMatch(new RegExp(
        `\\.lyrics-line\\[data-focus-distance="${distance}"\\] \\{[^}]*opacity: var\\(--lyrics-context-opacity\\);`,
      ));
    }

    expect(css).not.toMatch(/--lyrics-context-opacity:\s*max\(/);
    expect(css).not.toMatch(/\.lyrics-line\[data-focus-distance="[1-4]"\][^{]*\{[^}]*opacity:\s*(?:0\.\d+|max\()/);
  });

  it("keeps resting lyric lines on a two-dimensional transform", () => {
    const css = readFileSync("src/renderer/styles/lyrics.css", "utf8");

    expect(css).toMatch(
      /\.lyrics-line \{[\s\S]*?transform: translateY\(var\(--lyrics-line-y\)\) scale\(var\(--lyrics-line-scale\)\);/,
    );
    expect(css).not.toMatch(
      /\.lyrics-line \{[\s\S]*?transform: translate3d\(0, var\(--lyrics-line-y\), 0\) scale\(var\(--lyrics-line-scale\)\);/,
    );
  });

  it("keeps the lyrics surface visible if MV fails while AirPlay is active", () => {
    const css = readFileSync("src/renderer/styles/lyrics.css", "utf8");

    expect(css).toContain('.lyrics-page[data-airplay-receiver="true"] .lyrics-left-panel');
    expect(css).toContain(".lyrics-mv-panel--fallback");
    expect(css).toContain(".lyrics-mv-fallback");
  });

  it("keeps dark immersive track info and player tags readable", () => {
    const css = readFileSync("src/renderer/styles/lyrics.css", "utf8");
    const polishCss = readFileSync("src/renderer/styles/ui-polish.css", "utf8");

    expect(css).toContain(".lyrics-page:has(.lyrics-mv-background) {");
    expect(css).toContain("--lyrics-mv-heading-color:");
    expect(css).toContain("--lyrics-mv-muted-color:");
    expect(css).toContain(".lyrics-page:has(.lyrics-mv-background) .lyrics-track-copy h1");
    expect(css).toContain("color: var(--lyrics-mv-heading-color);");
    expect(css).toContain(".lyrics-page:has(.lyrics-mv-background) .lyrics-track-copy p,");
    expect(css).toContain(".lyrics-page:has(.lyrics-mv-background) .lyrics-track-album,");
    expect(css).toContain("color: var(--lyrics-mv-muted-color);");
    expect(css).toContain(".lyrics-page:has(.lyrics-mv-background) .lyrics-back-button:hover");
    expect(polishCss).toContain('html[data-theme="dark"] .app-shell.app-shell--lyrics:has(.lyrics-page) .player-tags .hifi-tag');
    expect(polishCss).toContain("color: var(--theme-page-text);");
    expect(polishCss).toContain('html[data-theme="dark"] .app-shell.app-shell--lyrics:has(.lyrics-page) .player-tags .tag-hires');
    expect(polishCss).not.toMatch(/html\[data-theme="dark"\] \.app-shell\.app-shell--lyrics:has\(\.lyrics-page\) \.player-tags \.hifi-tag \{[^}]*color: var\(--theme-button-text\);/);
  });

  it("keeps MV immersive lyrics on the normal lyrics size scale", () => {
    const css = readFileSync("src/renderer/styles/lyrics.css", "utf8");

    expect(css).toMatch(/\.lyrics-page:has\(\.lyrics-mv-background\) \.lyrics-line \.lyrics-line-primary \{\s*max-width: min\(100%, 1120px, var\(--lyrics-line-max-width\)\);\s*font-size: calc\(var\(--lyrics-font-size\) \* 0\.9\);/);
    expect(css).toMatch(/\.lyrics-line-primary \{\s*display: inline-block;\s*max-width: min\(100%, var\(--lyrics-line-max-width\)\);/);
    expect(css).toMatch(/\.lyrics-page:has\(\.lyrics-mv-background\) \.lyrics-line\[data-active="true"\] \.lyrics-line-primary \{\s*font-size: calc\(var\(--lyrics-font-size\) \* 1\.25\);/);
    expect(css).not.toMatch(/\.lyrics-page:has\(\.lyrics-mv-background\)[\s\S]*font-size: calc\(var\(--lyrics-font-size\) \* 1\.5\);/);
  });

  it("adapts the Rose Vinyl stage to scaled non-maximized windows", () => {
    const css = readFileSync("src/renderer/styles/lyrics.css", "utf8");

    expect(css).toMatch(/\.lyrics-page\[data-lyrics-page-style="roseVinyl"\]\[data-window-maximized="false"\][\s\S]*?--lyrics-rose-vinyl-cover-offset-x: clamp\(0px, calc\(\(100vw - 1240px\) \* 0\.9\), 160px\);[\s\S]*?justify-content: start;/);
    expect(css).toMatch(/\.lyrics-page\[data-lyrics-page-style="roseVinyl"\]\[data-window-maximized="true"\][\s\S]*?\.lyrics-mv-panel\[data-mv-enabled="false"\],[\s\S]*?transform: translateY\(clamp\(-56px, -4\.5vh, -36px\)\);/);
    expect(css).toMatch(/\.lyrics-page\[data-lyrics-page-style="roseVinyl"\]\[data-window-maximized="true"\][\s\S]*?\.lyrics-track-header,[\s\S]*?transform: translateY\(clamp\(-56px, -4\.5vh, -36px\)\) !important;/);
    expect(css).toMatch(/@media \(min-width: 901px\) and \(max-height: 1000px\) \{[\s\S]*?grid-template-columns: minmax\(0, 600px\) minmax\(280px, 400px\);[\s\S]*?column-gap: clamp\(64px, 5vw, 88px\);[\s\S]*?padding-top: clamp\(46px, 5\.5vh, 62px\);[\s\S]*?grid-template-rows: clamp\(174px, 21vh, 210px\) minmax\(250px, 1fr\);[\s\S]*?place-items: start center;[\s\S]*?padding-top: clamp\(82px, 11vh, 104px\);[\s\S]*?width: min\(100%, 400px, 48vh\);/);
  });

  it("scopes smart readable colors to lyric text only", () => {
    const css = readFileSync("src/renderer/styles/lyrics.css", "utf8");
    const polishCss = readFileSync("src/renderer/styles/ui-polish.css", "utf8");

    expect(css).toContain('.lyrics-page[data-smart-readable="true"] .lyrics-line,');
    expect(css).toContain('.lyrics-page[data-smart-readable="true"] .lyrics-line[data-active="true"] {');
    expect(css).not.toContain('.lyrics-page[data-smart-readable="true"]::after');
    expect(css).not.toContain('.lyrics-page[data-smart-readable="true"] .lyrics-track-copy h1');
    expect(css).not.toContain('.lyrics-page[data-smart-readable="true"] .lyrics-track-copy p');
    expect(css).not.toContain('.lyrics-page[data-smart-readable="true"] .lyrics-track-album');
    expect(css).not.toContain('.lyrics-page[data-smart-readable="true"] .lyrics-track-status');
    expect(css).not.toContain('.lyrics-page[data-smart-readable="true"] .lyrics-back-button');
    expect(polishCss).not.toContain('data-lyrics-smart-readable');
  });

  it("keeps the optional lyrics mini player compact, setting gated, and clear of cover-only shelves", () => {
    const css = readFileSync("src/renderer/styles/lyrics.css", "utf8");
    const layoutCss = readFileSync("src/renderer/styles/layout.css", "utf8");
    const polishCss = readFileSync("src/renderer/styles/ui-polish.css", "utf8");
    const themePresetsCss = readFileSync("src/renderer/styles/theme-presets.css", "utf8");

    expect(layoutCss).toMatch(/\.app-shell--lyrics-player-drawer \{[\s\S]*?grid-template-rows: var\(--titlebar-height\) minmax\(0, 1fr\) 0;/);
    expect(layoutCss).toMatch(/\.lyrics-player-drawer-host \{[\s\S]*?position: fixed;[\s\S]*?width: min\(820px, calc\(100vw - 96px\)\);/);
    expect(layoutCss).toMatch(/\.lyrics-player-drawer-host \{[\s\S]*?left: 0;[\s\S]*?right: 0;[\s\S]*?margin-inline: auto;/);
    expect(layoutCss).not.toContain('transform: translate3d(-50%,');
    expect(layoutCss).toMatch(/\.lyrics-player-drawer-host \{[\s\S]*?opacity: var\(--lyrics-mini-player-visual-opacity, 1\);/);
    expect(layoutCss).toMatch(/\.app-shell--lyrics-player-drawer \.lyrics-player-drawer-host \.player-bar \{[\s\S]*?grid-template-columns: auto auto;[\s\S]*?justify-content: center;[\s\S]*?min-height: 54px;[\s\S]*?border-radius: 999px;[\s\S]*?background: var\(--lyrics-mini-player-background, rgba\(35, 33, 32, 0\.78\)\);/);
    expect(css).toMatch(/\.app-shell--lyrics-player-drawer \.lyrics-player-drawer-host \.player-center \{[\s\S]*?grid-template-columns: auto auto;[\s\S]*?justify-content: center;/);
    expect(css).toMatch(/\.lyrics-network-load-notice \{[\s\S]*?position: absolute;[\s\S]*?top: clamp\(18px, 2\.8vh, 30px\);[\s\S]*?left: clamp\(18px, 2\.4vw, 30px\);/);
    expect(css).toMatch(/\.lyrics-network-load-notice \{[\s\S]*?width: min\(330px, calc\(100vw - 36px\)\);[\s\S]*?border-radius: 8px;/);
    expect(css).toMatch(/\.lyrics-network-load-notice__close \{/);
    expect(css).toMatch(/\.app-shell--lyrics-player-drawer \.lyrics-player-drawer-host \.progress-row \{[\s\S]*?width: clamp\(230px, 21vw, 286px\);/);
    expect(css).toMatch(/\.app-shell--lyrics-player-drawer \.lyrics-page:has\(\.lyrics-mv-panel\[data-mv-enabled="false"\]\) \.lyrics-left-panel \{\s*grid-template-rows: clamp\(54px, 8vh, 86px\) minmax\(0, 1fr\);/);
    expect(css).toMatch(/\.app-shell--lyrics-player-drawer \.lyrics-page:has\(\.lyrics-mv-panel\[data-mv-enabled="false"\]\) \.lyrics-scroll \{[\s\S]*?padding-bottom: clamp\(76px, 10vh, 112px\);/);
    expect(css).toMatch(/\.app-shell--lyrics-player-drawer \.lyrics-page:has\(\.lyrics-mv-panel\[data-mv-enabled="false"\]\) \.lyrics-track-header \{[\s\S]*?position: absolute;[\s\S]*?top: clamp\(72px, 8\.2vh, 104px\);[\s\S]*?left: clamp\(28px, 4vw, 72px\);[\s\S]*?width: min\(660px, calc\(100% - 56px\)\);[\s\S]*?grid-template-columns: clamp\(82px, 6\.2vw, 112px\) minmax\(0, 1fr\);/);
    expect(css).toMatch(/html\[data-theme="dark"\] \.app-shell--lyrics-player-drawer \.lyrics-page:has\(\.lyrics-mv-panel\[data-mv-enabled="false"\]\) \.lyrics-track-header \{[\s\S]*?background: transparent;[\s\S]*?box-shadow: none;/);
    expect(css).toMatch(/html\[data-theme="dark"\] \.app-shell--lyrics-player-drawer \.lyrics-page:has\(\.lyrics-mv-panel\[data-mv-enabled="false"\]\) \.lyrics-backdrop::before \{\s*background: none;/);
    expect(css).toMatch(/\.app-shell--lyrics-player-drawer \.lyrics-page:has\(\.lyrics-mv-panel\[data-mv-enabled="false"\]\) \.lyrics-track-cover \{[\s\S]*?width: clamp\(82px, 6\.2vw, 112px\);[\s\S]*?margin-top: 0;/);
    expect(css).toMatch(/\.app-shell--lyrics-player-drawer \.lyrics-page:has\(\.lyrics-mv-panel\[data-mv-enabled="false"\]\) \.lyrics-track-copy h1 \{[\s\S]*?font-size: clamp\(26px, 2\.15vw, 36px\);/);
    expect(css).toMatch(/\.app-shell--lyrics-player-drawer \.lyrics-page\[data-immersive-cover-style="true"\]\[data-background="cover"\]\[data-view-mode="lyrics"\] \.lyrics-left-panel \{[\s\S]*?background: transparent;[\s\S]*?box-shadow: none;[\s\S]*?backdrop-filter: none;/);
    expect(css).toMatch(/\.app-shell--lyrics-player-drawer \.lyrics-page\[data-immersive-cover-style="true"\]\[data-background="cover"\]\[data-view-mode="lyrics"\] > \.lyrics-track-header-floating \{[\s\S]*?background: transparent !important;[\s\S]*?box-shadow: none !important;[\s\S]*?backdrop-filter: none !important;/);
    expect(css).toMatch(/\.lyrics-page\[data-immersive-cover-style="true"\]\[data-background="cover"\]\[data-view-mode="lyrics"\] \.lyrics-track-copy h1 \{[\s\S]*?color: rgba\(238, 243, 248, 0\.9\);/);
    expect(css).toContain('.lyrics-candidate-copy,');
    expect(css).toMatch(/\.lyrics-match-panel \.lyrics-candidate \{[\s\S]*?--lyrics-candidate-title-color: #23324a;[\s\S]*?--lyrics-candidate-meta-color: rgba\(66, 84, 107, 0\.76\);/);
    expect(css).toMatch(/\.lyrics-match-panel \.lyrics-candidate \{[\s\S]*?grid-template-areas:[\s\S]*?"copy footer"[\s\S]*?min-height: 0;[\s\S]*?padding: 8px 9px;/);
    expect(css).toMatch(/\.lyrics-match-panel__results \{[\s\S]*?display: flex;[\s\S]*?min-height: 0;[\s\S]*?overflow: hidden;/);
    expect(css).toMatch(/\.lyrics-match-panel__results > :not\(\.lyrics-candidate-list\) \{[\s\S]*?flex: 0 0 auto;/);
    expect(css).toMatch(/\.lyrics-match-panel__results \.lyrics-candidate-list \{[\s\S]*?grid-auto-rows: max-content;[\s\S]*?align-content: start;/);
    expect(css).toMatch(/\.lyrics-match-panel \.lyrics-candidate-next-step \{[\s\S]*?display: none;/);
    expect(css).toMatch(/\.lyrics-match-panel \.lyrics-candidate-footer \{[\s\S]*?grid-area: footer;/);
    expect(css).not.toContain('.lyrics-candidate:has(.lyrics-candidate-next-step)');
    expect(css).toMatch(/\.lyrics-settings-drawer \.lyrics-drawer-candidates \.lyrics-source-filters button \{[\s\S]*?min-height: 36px;[\s\S]*?color: rgba\(238, 244, 255, 0\.9\);/);
    expect(css).toMatch(/\.lyrics-settings-drawer \.lyrics-drawer-candidates \.lyrics-source-filters button\[data-active="true"\] \{[\s\S]*?color: #2f3650;[\s\S]*?background: rgba\(248, 250, 255, 0\.94\);/);
    expect(css).toMatch(/\.lyrics-page \.lyrics-match-panel \.lyrics-candidate strong \{[\s\S]*?--lyrics-candidate-title-color: #23324a;[\s\S]*?color: var\(--lyrics-candidate-title-color\);/);
    expect(css).toMatch(/\.lyrics-page \.lyrics-match-panel \.lyrics-source-filters button,[\s\S]*?html\[data-theme="dark"\] \.lyrics-match-panel \.lyrics-source-filters button \{[\s\S]*?--lyrics-source-filter-color: rgba\(57, 77, 101, 0\.78\);/);
    expect(css).toMatch(/\.lyrics-page \.lyrics-match-panel \.lyrics-candidate-badges small,[\s\S]*?html\[data-theme="dark"\] \.lyrics-match-panel \.lyrics-candidate-badges small \{[\s\S]*?--lyrics-candidate-badge-color: #456076;/);
    expect(css).toMatch(/\.lyrics-page:has\(\.lyrics-mv-background\) \.lyrics-match-panel \.lyrics-candidate,[\s\S]*?html\[data-theme="dark"\] \.lyrics-match-panel \.lyrics-candidate \{[\s\S]*?--lyrics-candidate-title-color: #23324a;[\s\S]*?--lyrics-candidate-bg: rgba\(255, 255, 255, 0\.86\);/);
    expect(css).not.toMatch(/\.lyrics-page\[data-immersive-cover-style="true"\]\[data-background="cover"\]\[data-view-mode="lyrics"\] \.lyrics-track-copy h1 \{[^}]*?color: #ffffff;/);
    expect(css).not.toMatch(/\.app-shell--lyrics-player-drawer \.lyrics-page\[data-immersive-cover-style="true"\]\[data-background="cover"\]\[data-view-mode="lyrics"\] > \.lyrics-track-header-floating \.lyrics-track-copy h1 \{[^}]*?color: #ffffff;/);
    expect(css).toContain('--lyrics-immersive-cover-bleed: max(42px, 4.5vw);');
    expect(css).toContain('inset: calc(-1 * var(--lyrics-immersive-cover-bleed));');
    expect(css).toMatch(/\.lyrics-page\[data-immersive-cover-style="true"\]:not\(\[data-lyrics-page-style="roseVinyl"\]\)\[data-background="cover"\]\[data-immersive-cover-glass="true"\]\[data-view-mode="lyrics"\]::after \{[\s\S]*?inset: 0;[\s\S]*?backdrop-filter: blur\(var\(--lyrics-immersive-glass-blur, 16px\)\) saturate\(1\.16\);/);
    expect(css).not.toContain('.lyrics-page[data-lyrics-page-style="roseVinyl"][data-background="cover"][data-immersive-cover-glass="true"][data-view-mode="lyrics"]::after');
    expect(css).not.toContain('[data-lyrics-page-style="roseVinyl"][data-background="cover"][data-immersive-cover-glass="true"][data-view-mode="lyrics"] .lyrics-left-panel::before');
    expect(css).toMatch(/\.lyrics-page\[data-lyrics-page-style="roseVinyl"\]\[data-view-mode="lyrics"\]\[data-background="cover"\] \.lyrics-backdrop::after \{[\s\S]*?filter: blur\(var\(--lyrics-rose-vinyl-effective-background-blur\)\) brightness\(0\.46\) saturate\(1\.05\);/);
    expect(css).toMatch(/\.lyrics-page\[data-track-transition="true"\]\[data-lyrics-page-style="roseVinyl"\]\[data-view-mode="lyrics"\]\[data-background="cover"\] \.lyrics-backdrop::after \{[\s\S]*?animation: none !important;/);
    expect(css).toMatch(/\.lyrics-page\[data-track-transition="true"\]\[data-lyrics-page-style="roseVinyl"\]\[data-view-mode="lyrics"\]\[data-background="cover"\]::after \{[\s\S]*?z-index: 3;[\s\S]*?background: #100b10;[\s\S]*?animation: lyrics-track-rose-vinyl-dark-settle 420ms cubic-bezier\(0\.2, 0, 0\.2, 1\) both;/);
    expect(css).toMatch(/\.lyrics-page\[data-lyrics-page-style="roseVinyl"\]\[data-view-mode="lyrics"\]\[data-background="cover"\] \.lyrics-backdrop-previous-cover \{[\s\S]*?display: none;/);
    expect(css).toContain(`.lyrics-page[data-background="cover"] .lyrics-backdrop::after {
  inset: 0;
  filter: none !important;
  transform: none !important;
  animation: none !important;`);
    expect(css).toContain(`.lyrics-page[data-background="cover"] .lyrics-backdrop-previous-cover {
  display: none !important;`);
    expect(css).toMatch(/\.lyrics-page\[data-lyrics-page-style="roseVinyl"\]\[data-background="cover"\]\[data-immersive-cover-glass="true"\]\[data-view-mode="lyrics"\] \.lyrics-backdrop \{[\s\S]*?--lyrics-rose-vinyl-effective-background-blur: calc\(var\(--lyrics-rose-vinyl-background-blur, 18px\) \+ var\(--lyrics-immersive-glass-blur, 16px\)\);/);
    expect(css).not.toContain('@keyframes lyrics-track-rose-vinyl-cover-in');
    expect(css).not.toContain('@keyframes lyrics-track-previous-rose-vinyl-cover-out');
    expect(css).toContain('@keyframes lyrics-track-rose-vinyl-card-image-in');
    expect(css).toContain('@keyframes lyrics-track-rose-vinyl-dark-settle');
    expect(css).not.toContain('.app-shell--lyrics-player-drawer:has(.lyrics-page[data-track-transition="true"][data-lyrics-page-style="roseVinyl"]) .lyrics-player-drawer-host .player-bar[data-compact-away="true"]');
    expect(css).toMatch(/\.lyrics-page\[data-lyrics-page-style="roseVinyl"\]\[data-view-mode="lyrics"\]\[data-background="cover"\] \.lyrics-style-cover-card-image \{[\s\S]*?animation: lyrics-track-rose-vinyl-card-image-in var\(--echo-motion-drawer-ms\) var\(--echo-motion-ease-drawer\) both;/);
    expect(css).toMatch(/\.lyrics-visual-settings-drawer \.lyrics-page-style-panel \{[\s\S]*?background:[\s\S]*?rgba\(255, 255, 255, 0\.025\);/);
    expect(css).toMatch(/\.lyrics-visual-settings-drawer \.lyrics-page-style-panel__rose-controls \{[\s\S]*?border-top: 1px solid rgba\(255, 255, 255, 0\.07\);/);
    expect(css).toMatch(/\.lyrics-visual-settings-drawer \.lyrics-page-style-select \.sort-button \{[\s\S]*?width: 100%;[\s\S]*?max-width: none;[\s\S]*?color: rgba\(248, 250, 255, 0\.96\);/);
    expect(css).toMatch(/\.lyrics-visual-settings-drawer \.lyrics-page-style-select \.sort-menu \{[\s\S]*?position: static;[\s\S]*?max-height: none;[\s\S]*?overflow: visible;[\s\S]*?background: #262b3b;/);
    expect(css).not.toContain('.lyrics-style-cover-card::after');
    expect(css).not.toMatch(/data-lyrics-page-style="roseVinyl"[\s\S]*?\.lyrics-track-copy h1 \{[\s\S]*?text-shadow: 0 3px 22px/);
    expect(css).toMatch(/data-lyrics-page-style="roseVinyl"[\s\S]*?\.lyrics-track-copy h1 \{[\s\S]*?display: -webkit-box;[\s\S]*?width: min\(100%, 760px\);[\s\S]*?white-space: normal;[\s\S]*?-webkit-line-clamp: 2;[\s\S]*?animation: none !important;/);
    expect(css).toMatch(/data-lyrics-page-style="roseVinyl"[\s\S]*?\.lyrics-track-copy h1 > span \{[\s\S]*?display: inline;[\s\S]*?white-space: normal;[\s\S]*?overflow-wrap: anywhere;[\s\S]*?animation: none !important;/);
    expect(css).not.toContain('width: min(1220px, 72vw);');
    expect(css).not.toContain('text-shadow: 0 3px 16px rgba(0, 0, 0, 0.54);');
    expect(css).toMatch(/\.lyrics-page\[data-lyrics-page-style="roseVinyl"\]\[data-view-mode="lyrics"\]\[data-background="cover"\] \.lyrics-back-button,[\s\S]*?top: 46px;/);
    expect(css).toMatch(/\.lyrics-page\[data-lyrics-page-style="roseVinyl"\]\[data-window-maximized="false"\]\[data-view-mode="lyrics"\]\[data-background="cover"\]:has\(\.lyrics-mv-panel\[data-mv-enabled="false"\]\),[\s\S]*?padding: clamp\(72px, 7vh, 92px\) clamp\(56px, 5vw, 104px\) clamp\(78px, 8vh, 104px\) clamp\(92px, 6\.8vw, 150px\);/);
    expect(css).toMatch(/\.lyrics-page\[data-lyrics-page-style="roseVinyl"\]\[data-window-maximized="false"\]\[data-view-mode="lyrics"\]\[data-background="cover"\]:has\(\.lyrics-mv-panel\[data-mv-enabled="false"\]\),[\s\S]*?--lyrics-rose-vinyl-cover-offset-x: clamp\(0px, calc\(\(100vw - 1240px\) \* 0\.9\), 160px\);[\s\S]*?justify-content: start;/);
    expect(css).toMatch(/\.lyrics-page\[data-lyrics-page-style="roseVinyl"\]\[data-view-mode="lyrics"\]\[data-background="cover"\] \.lyrics-style-cover-card,[\s\S]*?transform: translate3d\(var\(--lyrics-rose-vinyl-cover-offset-x, 0px\), 0, 0\);/);
    expect(css).toMatch(/\.lyrics-page\[data-lyrics-page-style="roseVinyl"\]\[data-window-maximized="false"\]\[data-view-mode="lyrics"\]\[data-background="cover"\] \.lyrics-left-panel,[\s\S]*?grid-template-rows: clamp\(198px, 24vh, 260px\) minmax\(250px, 1fr\);/);
    expect(css).toMatch(/\.lyrics-page\[data-lyrics-page-style="roseVinyl"\]\[data-window-maximized="false"\]\[data-view-mode="lyrics"\]\[data-background="cover"\] \.lyrics-line,[\s\S]*?min-height: calc\(78px \* var\(--lyrics-line-spacing, 0\.82\)\);/);
    expect(css).toMatch(/\.lyrics-page\[data-lyrics-page-style="roseVinyl"\]\[data-window-maximized="false"\]\[data-view-mode="lyrics"\]\[data-background="cover"\] \.lyrics-line\[data-active="true"\],[\s\S]*?min-height: calc\(112px \* var\(--lyrics-line-spacing, 0\.82\)\);/);
    expect(css).toMatch(/\.lyrics-page\[data-lyrics-page-style="roseVinyl"\]\[data-view-mode="lyrics"\]\[data-background="cover"\] \.lyrics-line\[data-active="true"\]\[data-secondary-lines="2"\],[\s\S]*?min-height: calc\(190px \* var\(--lyrics-line-spacing, 0\.82\)\);/);
    expect(css).toMatch(/\.lyrics-page\[data-lyrics-page-style="roseVinyl"\]\[data-window-maximized="false"\]\[data-view-mode="lyrics"\]\[data-background="cover"\] \.lyrics-line\[data-active="true"\]\[data-secondary-lines="2"\],[\s\S]*?min-height: calc\(172px \* var\(--lyrics-line-spacing, 0\.82\)\);/);
    expect(css).not.toMatch(/\.app-shell--lyrics-player-drawer \.lyrics-page:has\(\.lyrics-mv-panel\[data-mv-enabled="false"\]\) \.lyrics-track-header \{\s*display: none;/);
    expect(css).toMatch(/@media \(max-width: 720px\) \{[\s\S]*?\.app-shell--lyrics-player-drawer \.lyrics-page:has\(\.lyrics-mv-panel\[data-mv-enabled="false"\]\) \.lyrics-left-panel \{\s*grid-template-rows: 58px minmax\(0, 1fr\);/);
    expect(css).toMatch(/@media \(max-width: 720px\) \{[\s\S]*?\.app-shell--lyrics-player-drawer \.lyrics-page:has\(\.lyrics-mv-panel\[data-mv-enabled="false"\]\) \.lyrics-track-header \{[\s\S]*?top: 66px;[\s\S]*?grid-template-columns: 64px minmax\(0, 1fr\);/);
    expect(polishCss).toMatch(/\.app-shell--lyrics-player-drawer \.lyrics-player-drawer-host \.player-bar \{[\s\S]*?background: var\(--lyrics-mini-player-background, rgba\(35, 33, 32, 0\.78\)\);[\s\S]*?backdrop-filter: blur\(22px\) saturate\(1\.18\);/);
    expect(polishCss).toContain('color: var(--lyrics-mini-player-readable-muted);');
    expect(themePresetsCss).toContain('.app-shell--lyrics-player-drawer .lyrics-player-drawer-host .player-bar');
    expect(themePresetsCss).toContain('--lyrics-mini-readable-text: var(--lyrics-mini-player-readable-text, rgb(255 255 255));');
    expect(themePresetsCss).toContain('--lyrics-mini-readable-muted: var(--lyrics-mini-player-readable-muted, rgb(248 250 252));');
    expect(themePresetsCss).toContain('var(--lyrics-mini-player-background, rgb(var(--preset-panel-rgb) / 0.9))');
    expect(themePresetsCss).toContain('.app-shell--lyrics-player-drawer .lyrics-player-drawer-host .player-bar .icon-button');
    expect(themePresetsCss).toContain('.app-shell--lyrics-player-drawer .lyrics-player-drawer-host .progress-fill');
    expect(themePresetsCss).toContain('html[data-theme-preset="darkSideMoon"] .lyrics-page:has(.lyrics-mv-panel[data-mv-enabled="false"]) .lyrics-track-header');
    expect(themePresetsCss).toContain('html[data-theme-preset="darkSideMoon"] .track-subtitle');
    expect(css).not.toMatch(/\.app-shell:has\(\.lyrics-mv-panel\[data-mv-enabled="false"\]\) \.player-bar \{/);
    expect(polishCss).not.toMatch(/\.app-shell:has\(\.lyrics-mv-panel\[data-mv-enabled="false"\]\) \.player-bar \{/);
  });

  it("keeps custom wallpaper visuals intact until render pressure is active", () => {
    const css = readFileSync("src/renderer/styles/lyrics.css", "utf8");

    expect(css).toMatch(/\.lyrics-page\[data-background="customWallpaper"\] \.lyrics-backdrop::after \{\s*background-image: var\(--lyrics-wallpaper\);\s*filter: blur\(var\(--lyrics-cover-blur\)\)/);
    expect(css).toMatch(/\.lyrics-page\[data-render-pressure-reduced="true"\]\[data-background="customWallpaper"\] \.lyrics-backdrop::after \{\s*inset: 0;\s*filter: none !important;\s*transform: none !important;\s*animation: none !important;\s*transition: none;\s*backface-visibility: visible;\s*will-change: auto !important;/);
  });

  it("keeps the Rose Vinyl gradient opt-in and removes the column grid", () => {
    const css = readFileSync("src/renderer/styles/lyrics.css", "utf8");
    const drawer = readFileSync("src/renderer/components/lyrics/LyricsVisualSettingsDrawer.tsx", "utf8");

    expect(css).not.toContain("transparent 1px clamp(150px, 16vw, 310px)");
    expect(css).toMatch(/\.lyrics-page\[data-lyrics-page-style="roseVinyl"\]\[data-rose-vinyl-gradient="false"\][\s\S]*?background: rgba\(8, 9, 12, 0\.24\) !important;/);
    expect(css).toMatch(/\.lyrics-page\[data-lyrics-page-style="roseVinyl"\]\[data-rose-vinyl-gradient="true"\][\s\S]*?color-mix\(in srgb, var\(--theme-accent-solid-bg\) 48%, transparent\)/);
    expect(css).toContain('color-mix(in srgb, var(--theme-panel-bg-strong) 42%, rgba(13, 12, 17, 0.72))');
    expect(css).not.toContain('rgba(255, 144, 176, 0.46)');
    expect(css).not.toMatch(/\.lyrics-page\[data-lyrics-page-style="roseVinyl"\]\[data-view-mode="lyrics"\]\[data-background="cover"\] \.lyrics-backdrop::before \{[\s\S]*?radial-gradient/);
    expect(drawer.indexOf("lyricsRoseVinylGradientEnabled")).toBeGreaterThan(
      drawer.indexOf("lyricsRoseVinylBackgroundBlurPx"),
    );
    expect(css).not.toContain('data-empty-background');
  });

  it("does not wash out the lyrics wallpaper when regular MV is visible", () => {
    const css = readFileSync("src/renderer/styles/lyrics.css", "utf8");
    const regularMvSelector = '.lyrics-page:has(.lyrics-mv-panel[data-mv-enabled="true"][data-immersive-active="false"]) .lyrics-backdrop::before';

    expect(css).toMatch(new RegExp(`${regularMvSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{\\s*background: none;`));
    expect(css).toContain('.lyrics-page[data-background="cover"]:has(.lyrics-mv-panel[data-mv-enabled="true"][data-immersive-active="false"]) .lyrics-backdrop::after');
    expect(css).toContain('brightness(var(--lyrics-cover-brightness)) saturate(1.04);');
    expect(css).toMatch(/\.lyrics-page\[data-background="customWallpaper"\]:has\(\.lyrics-mv-panel\[data-mv-enabled="true"\]\[data-immersive-active="false"\]\) \.lyrics-backdrop \{\s*background: transparent;/);
  });

  it("shows current song information when a track is playing", async () => {
    const track = makeTrack();
    mockEcho(track);

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "Test Song" }),
    ).toBeTruthy();
    expect(screen.getAllByText("Test Artist").length).toBeGreaterThan(0);
    expect(screen.queryByText(/FLAC \/ 2400 kbps \/ 96 kHz/)).toBeNull();
    expect(
      document.querySelector('.lyrics-mv-panel[data-mv-enabled="false"][data-view-mode="lyrics"]'),
    ).toBeTruthy();
  });

  it("prefers matched whole-song lyrics over the live AirPlay lyric line", async () => {
    const track = makeTrack({
      id: "airplay-receiver:source-1:air-song",
      path: "airplay-receiver:source-1",
      mediaType: "remote",
      isTemporary: true,
      title: "Air Song",
      artist: "Air Artist",
      duration: 180,
      fieldSources: { title: "airplay", artist: "airplay" },
    });
    mockEcho(track, 12);
    window.echo = {
      ...window.echo,
      connect: {
        getAirPlayReceiverStatus: vi.fn().mockResolvedValue({
          enabled: true,
          state: "playing",
          advertisedName: "ECHO",
          nativeAvailable: true,
          currentSourceId: "airplay-receiver:source-1",
          currentClient: null,
          metadata: {
            title: "Air Song",
            artist: "Air Artist",
            album: null,
            albumArtist: "Air Artist",
            durationSeconds: 180,
            coverHttpUrl: "",
          },
          currentLyricLine: "AirPlay live lyric line",
          artworkUrl: null,
          positionSeconds: 12,
          durationSeconds: 180,
          volume: 100,
          error: null,
          debugEvents: [],
          updatedAt: "2026-05-19T00:00:00.000Z",
        }),
        onAirPlayReceiverStatus: vi.fn(() => () => undefined),
      },
    } as unknown as Window["echo"];

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("Second line")).toBeTruthy();
    expect(screen.queryByText("AirPlay live lyric line")).toBeNull();
  });

  it("uses the live AirPlay lyric line as a fallback before whole-song lyrics are matched", async () => {
    const track = makeTrack({
      id: "airplay-receiver:source-1:air-song",
      path: "airplay-receiver:source-1",
      mediaType: "remote",
      isTemporary: true,
      title: "Air Song",
      artist: "Air Artist",
      duration: 180,
      fieldSources: { title: "airplay", artist: "airplay" },
    });
    mockEcho(track, 12);
    window.echo = {
      ...window.echo,
      lyrics: {
        getForTrack: vi.fn(),
        getForSnapshot: vi.fn().mockResolvedValue(null),
        searchCandidates: vi.fn(),
        searchCandidatesForSnapshot: vi.fn().mockResolvedValue([]),
        applyCandidate: vi.fn(),
        applyCandidateForSnapshot: vi.fn(),
        markInstrumental: vi.fn(),
        rejectCandidate: vi.fn(),
        setOffset: vi.fn(),
        clearCache: vi.fn(),
      },
      connect: {
        getAirPlayReceiverStatus: vi.fn().mockResolvedValue({
          enabled: true,
          state: "playing",
          advertisedName: "ECHO",
          nativeAvailable: true,
          currentSourceId: "airplay-receiver:source-1",
          currentClient: null,
          metadata: {
            title: "Air Song",
            artist: "Air Artist",
            album: null,
            albumArtist: "Air Artist",
            durationSeconds: 180,
            coverHttpUrl: "",
          },
          currentLyricLine: "AirPlay live lyric line",
          artworkUrl: null,
          positionSeconds: 12,
          durationSeconds: 180,
          volume: 100,
          error: null,
          debugEvents: [],
          updatedAt: "2026-05-19T00:00:00.000Z",
        }),
        onAirPlayReceiverStatus: vi.fn(() => () => undefined),
      },
    } as unknown as Window["echo"];

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={[]} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("AirPlay live lyric line")).toBeTruthy();
  });

  it("reveals lyrics candidates for AirPlay snapshots when Apple Music sends no live lyric line", async () => {
    const track = makeTrack({
      id: "airplay-receiver:source-1:otona-survivor",
      path: "airplay-receiver:source-1",
      mediaType: "remote",
      isTemporary: true,
      title: "Otona Survivor",
      artist: "Last Idol",
      album: "Otona Survivor - EP",
      duration: 265,
      fieldSources: { title: "airplay", artist: "airplay", album: "airplay" },
    });
    mockEcho(track, 12, { lyricsCandidatePanelAutoOpenEnabled: false });
    const storedCandidates = [
      makeLyricsCandidate({
        id: "netease-otona-survivor",
        provider: "netease",
        sourceLabel: "NetEase",
        title: "大人サバイバー",
        artist: "ラストアイドル",
        album: "大人サバイバー",
        durationSeconds: 265,
        score: 0.42,
        risk: "high",
      }),
    ];
    const searchCandidatesForSnapshot = vi.fn().mockResolvedValue(storedCandidates);
    window.echo = {
      ...window.echo,
      lyrics: {
        getForTrack: vi.fn(),
        getForSnapshot: vi.fn().mockResolvedValue(null),
        getStoredCandidates: vi.fn().mockResolvedValue(storedCandidates),
        searchCandidates: vi.fn(),
        searchCandidatesForSnapshot,
        applyCandidate: vi.fn(),
        applyCandidateForSnapshot: vi.fn(),
        markInstrumental: vi.fn(),
        rejectCandidate: vi.fn(),
        setOffset: vi.fn(),
        clearCache: vi.fn(),
      },
      connect: {
        getAirPlayReceiverStatus: vi.fn().mockResolvedValue({
          enabled: true,
          state: "playing",
          advertisedName: "ECHO",
          nativeAvailable: true,
          currentSourceId: "airplay-receiver:source-1",
          currentClient: null,
          metadata: {
            title: "Otona Survivor",
            artist: "Last Idol",
            album: "Otona Survivor - EP",
            albumArtist: "Last Idol",
            durationSeconds: 265,
            coverHttpUrl: "",
          },
          currentLyricLine: null,
          artworkUrl: null,
          positionSeconds: 12,
          durationSeconds: 265,
          volume: 100,
          error: null,
          debugEvents: [],
          updatedAt: "2026-05-19T00:00:00.000Z",
        }),
        onAirPlayReceiverStatus: vi.fn(() => () => undefined),
      },
    } as unknown as Window["echo"];

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={[]} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(window.echo.lyrics.getStoredCandidates).toHaveBeenCalledWith(track.id, 265));
    expect(searchCandidatesForSnapshot).not.toHaveBeenCalled();
    expect(container.querySelector(".lyrics-match-panel")).toBeTruthy();
    expect(container.querySelector(".lyrics-candidate-list")?.textContent).toContain("大人サバイバー");
    expect(window.echo.lyrics.applyCandidateForSnapshot).not.toHaveBeenCalled();
  });

  it("keeps AirPlay lyrics visible when the lyrics page opens in MV mode", async () => {
    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    window.sessionStorage.setItem("echo:lyrics:view-mode", "mv");
    const track = makeTrack({
      id: "airplay-receiver:source-1:air-song",
      path: "airplay-receiver:source-1",
      mediaType: "remote",
      isTemporary: true,
      title: "Air Song",
      artist: "Air Artist",
      duration: 180,
      fieldSources: { title: "airplay", artist: "airplay" },
    });
    mockEcho(track, 12, { lyricsHeaderHidden: true, lyricsEmptyStateHidden: true });
    window.echo = {
      ...window.echo,
      connect: {
        getAirPlayReceiverStatus: vi.fn().mockResolvedValue({
          enabled: true,
          state: "playing",
          advertisedName: "ECHO",
          nativeAvailable: true,
          currentSourceId: "airplay-receiver:source-1",
          currentClient: null,
          metadata: {
            title: "Air Song",
            artist: "Air Artist",
            album: null,
            albumArtist: "Air Artist",
            durationSeconds: 180,
            coverHttpUrl: "",
          },
          currentLyricLine: "AirPlay live lyric line",
          artworkUrl: null,
          positionSeconds: 12,
          durationSeconds: 180,
          volume: 100,
          error: null,
          debugEvents: [],
          updatedAt: "2026-05-19T00:00:00.000Z",
        }),
        onAirPlayReceiverStatus: vi.fn(() => () => undefined),
      },
    } as unknown as Window["echo"];
    attachMvBridge(makeTrackVideo({ trackId: track.id, title: "Air Song MV" }));

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("Second line")).toBeTruthy();
    expect(screen.queryByText("AirPlay live lyric line")).toBeNull();
    expect(container.querySelector('.lyrics-page[data-view-mode="mv"][data-airplay-receiver="true"]')).toBeTruthy();
    expect(container.querySelector(".lyrics-left-panel")).toBeTruthy();
    expect(container.querySelector(".lyrics-mv-panel")).toBeTruthy();
  });

  it("renders AirPlay receiver metadata even before the playback queue snapshot arrives", async () => {
    window.sessionStorage.setItem("echo:lyrics:view-mode", "mv");
    mockEcho(null, 0, { lyricsHeaderHidden: false, lyricsEmptyStateHidden: true });
    window.echo = {
      ...window.echo,
      connect: {
        getAirPlayReceiverStatus: vi.fn().mockResolvedValue({
          enabled: true,
          state: "playing",
          advertisedName: "ECHO",
          nativeAvailable: true,
          currentSourceId: "airplay-receiver:source-1",
          currentClient: null,
          metadata: {
            title: "Air Song",
            artist: "Air Artist",
            album: null,
            albumArtist: "Air Artist",
            durationSeconds: 180,
            coverHttpUrl: "",
          },
          currentLyricLine: "AirPlay live lyric line",
          artworkUrl: null,
          positionSeconds: 12,
          durationSeconds: 180,
          volume: 100,
          error: null,
          debugEvents: [],
          updatedAt: "2026-05-19T00:00:00.000Z",
        }),
        onAirPlayReceiverStatus: vi.fn(() => () => undefined),
      },
    } as unknown as Window["echo"];
    attachMvBridge(null);

    const { container } = render(
      <PlaybackQueueProvider>
        <LyricsPage initialLyrics={lyrics} />
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Air Song" })).toBeTruthy();
    expect(await screen.findByText("Second line")).toBeTruthy();
    expect(screen.queryByText("AirPlay live lyric line")).toBeNull();
    expect(container.querySelector(".lyrics-page--empty")).toBeNull();
    expect(container.querySelector('.lyrics-page[data-view-mode="mv"][data-airplay-receiver="true"]')).toBeTruthy();
  });

  it("opens the current track album detail from the lyrics header", async () => {
    const track = makeTrack();
    const album = makeAlbum();
    mockEcho(track);
    const getAlbumForTrack = vi.fn().mockResolvedValue(album);
    window.echo = {
      ...window.echo,
      library: {
        getAlbumForTrack,
      },
    } as unknown as Window["echo"];
    const navigationEvents: unknown[] = [];
    const handleAlbumNavigation = (event: Event): void => {
      navigationEvents.push((event as CustomEvent).detail);
    };
    window.addEventListener(albumDetailNavigationEvent, handleAlbumNavigation);

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Test Album" }));

    await waitFor(() => expect(getAlbumForTrack).toHaveBeenCalledWith("track-1"));
    expect(navigationEvents).toEqual([{ album }]);
    window.removeEventListener(albumDetailNavigationEvent, handleAlbumNavigation);
  });

  it("hides the lyrics page song header when configured", async () => {
    const track = makeTrack();
    mockEcho(track, 0, { lyricsHeaderHidden: true });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByText("First line");

    expect(container.querySelector(".lyrics-track-header")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Test Song" })).toBeNull();
  });

  it("shows an empty state when no song is playing", async () => {
    mockEcho(null);

    render(
      <PlaybackQueueProvider>
        <LyricsPage />
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("Nothing is playing")).toBeTruthy();
  });

  it("highlights the current lyric line from playback position", async () => {
    const track = makeTrack();
    mockEcho(track, 12);
    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByText("Second line");
    expect(
      container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
    ).toContain("Second line");
  });

  it("updates active lyrics from audio status pushes", async () => {
    const track = makeTrack();
    const { emitAudioStatus } = mockEcho(track, 0);
    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByText("First line");
    await waitFor(() => expect(window.echo.audio.onStatus).toHaveBeenCalled());
    act(() => {
      emitAudioStatus(makeAudioStatus(track, 12));
    });

    await waitFor(() =>
      expect(
        container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
      ).toContain("Second line"),
    );
  });

  it("keeps active lyrics from jumping backward on a brief same-track stale audio status", async () => {
    const performanceNow = vi.spyOn(performance, "now").mockReturnValue(0);
    const track = makeTrack();
    const { emitAudioStatus } = mockEcho(track, 10.4);
    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() =>
      expect(
        container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
      ).toContain("Second line"),
    );

    performanceNow.mockReturnValue(250);
    act(() => {
      emitAudioStatus(makeAudioStatus(track, 8.9));
    });

    expect(
      container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
    ).toContain("Second line");
  });

  it("keeps lyrics advancing when native playback telemetry is stale", async () => {
    const performanceNow = vi.spyOn(performance, "now").mockReturnValue(0);
    const track = makeTrack();
    const { emitAudioStatus } = mockEcho(track, 8.9);
    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() =>
      expect(
        container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
      ).toContain("First line"),
    );

    performanceNow.mockReturnValue(1400);
    act(() => {
      emitAudioStatus({
        ...makeAudioStatus(track, 8.95),
        nativePositionStalenessMs: 1200,
      });
    });

    await waitFor(() =>
      expect(
        container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
      ).toContain("Second line"),
    );
  });

  it("opens on the current lyric line from the shared playback clock before a fresh status refresh", () => {
    const track = makeTrack();
    mockEcho(track, 0);
    window.echo.playback.getStatus = vi.fn(() => new Promise<PlaybackStatus>(() => undefined));
    window.echo.audio.getStatus = vi.fn(() => new Promise<AudioStatus>(() => undefined));
    setPlaybackStatusSnapshot({
      audioStatus: makeAudioStatus(track, 21),
      playbackStatus: {
        state: "playing",
        currentTrackId: track.id,
        positionMs: 21000,
        durationMs: track.duration * 1000,
        filePath: track.path,
      },
      error: null,
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(
      container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
    ).toContain("Third line");
  });

  it("does not retain same-track audio status after a shared seek snapshot clears audio telemetry", async () => {
    const track = makeTrack({ duration: 240 });
    const seekSensitiveLyrics: LyricLine[] = [
      { timeMs: 0, text: "line at start" },
      { timeMs: 60000, text: "line at 60" },
      { timeMs: 181000, text: "line at 181" },
    ];
    mockEcho(track, 181);

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={seekSensitiveLyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() =>
      expect(
        container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
      ).toContain("line at 181"),
    );

    act(() => {
      beginPlaybackSeekSnapshot({
        state: "playing",
        currentTrackId: track.id,
        positionMs: 60000,
        durationMs: track.duration * 1000,
        filePath: track.path,
      });
    });

    await waitFor(() =>
      expect(
        container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
      ).toContain("line at 60"),
    );
  });

  it("keeps lyrics advancing when the reported playback position stalls without native telemetry", async () => {
    const performanceNow = vi.spyOn(performance, "now").mockReturnValue(0);
    const track = makeTrack();
    const { emitAudioStatus } = mockEcho(track, 8.9);
    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() =>
      expect(
        container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
      ).toContain("First line"),
    );

    performanceNow.mockReturnValue(1400);
    act(() => {
      emitAudioStatus(makeAudioStatus(track, 8.95));
    });

    await waitFor(() =>
      expect(
        container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
      ).toContain("Second line"),
    );
  });

  it("keeps lyrics advancing across a longer stale playback position gap", async () => {
    const performanceNow = vi.spyOn(performance, "now").mockReturnValue(0);
    const track = makeTrack();
    const { emitAudioStatus } = mockEcho(track, 8.9);
    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() =>
      expect(
        container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
      ).toContain("First line"),
    );

    performanceNow.mockReturnValue(4000);
    act(() => {
      emitAudioStatus({
        ...makeAudioStatus(track, 8.95),
        nativePositionStalenessMs: 3600,
      });
    });

    await waitFor(() =>
      expect(
        container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
      ).toContain("Second line"),
    );
  });

  it("keeps high-speed active lyrics from jumping backward on a brief same-track stale audio status", async () => {
    const performanceNow = vi.spyOn(performance, "now").mockReturnValue(0);
    const track = makeTrack();
    const { emitAudioStatus } = mockEcho(track, 10.4);
    window.echo.audio.getStatus = vi
      .fn()
      .mockResolvedValue({ ...makeAudioStatus(track, 10.4), playbackRate: 2 });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() =>
      expect(
        container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
      ).toContain("Second line"),
    );

    performanceNow.mockReturnValue(900);
    act(() => {
      emitAudioStatus({ ...makeAudioStatus(track, 8.9), playbackRate: 2 });
    });

    expect(
      container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
    ).toContain("Second line");
  });

  it("keeps high-speed active lyrics from jumping far forward on a brief same-track stale audio status", async () => {
    const performanceNow = vi.spyOn(performance, "now").mockReturnValue(0);
    const track = makeTrack();
    const { emitAudioStatus } = mockEcho(track, 10.4);
    window.echo.audio.getStatus = vi
      .fn()
      .mockResolvedValue({ ...makeAudioStatus(track, 10.4), playbackRate: 1.5 });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() =>
      expect(
        container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
      ).toContain("Second line"),
    );

    performanceNow.mockReturnValue(500);
    act(() => {
      emitAudioStatus({ ...makeAudioStatus(track, 25), playbackRate: 1.5 });
    });

    expect(
      container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
    ).toContain("Second line");
  });

  it("keeps slow-speed active lyrics from jumping far forward on a brief same-track stale audio status", async () => {
    const performanceNow = vi.spyOn(performance, "now").mockReturnValue(0);
    const track = makeTrack();
    const { emitAudioStatus } = mockEcho(track, 10.4);
    window.echo.audio.getStatus = vi
      .fn()
      .mockResolvedValue({ ...makeAudioStatus(track, 10.4), playbackRate: 0.5 });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() =>
      expect(
        container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
      ).toContain("Second line"),
    );

    performanceNow.mockReturnValue(500);
    act(() => {
      emitAudioStatus({ ...makeAudioStatus(track, 25), playbackRate: 0.5 });
    });

    expect(
      container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
    ).toContain("Second line");
  });

  it("rebases active lyrics smoothly when playback speed changes with a stale source position", async () => {
    const performanceNow = vi.spyOn(performance, "now").mockReturnValue(0);
    const track = makeTrack();
    const { emitAudioStatus } = mockEcho(track, 10.4);

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() =>
      expect(
        container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
      ).toContain("Second line"),
    );

    performanceNow.mockReturnValue(2000);
    act(() => {
      emitAudioStatus({ ...makeAudioStatus(track, 8.9), playbackRate: 2 });
    });

    expect(
      container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
    ).toContain("Second line");
  });

  it("updates active lyrics immediately when playback seek commits from the progress bar", async () => {
    const track = makeTrack();
    const { emitAudioStatus } = mockEcho(track, 0);
    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByText("First line");

    act(() => {
      window.dispatchEvent(
        new CustomEvent("playback:seeked", {
          detail: { trackId: "track-1", positionSeconds: 21 },
        }),
      );
    });

    await waitFor(() =>
      expect(
        container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
      ).toContain("Third line"),
    );

    act(() => {
      emitAudioStatus(makeAudioStatus(track, 0));
    });

    expect(
      container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
    ).toContain("Third line");
  });

  it("keeps a committed seek anchored when delayed audio status is still stale", async () => {
    const performanceNow = vi.spyOn(performance, "now").mockReturnValue(0);
    const track = makeTrack();
    const { emitAudioStatus } = mockEcho(track, 0);
    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByText("First line");

    act(() => {
      window.dispatchEvent(
        new CustomEvent("playback:seeked", {
          detail: { trackId: "track-1", positionSeconds: 21 },
        }),
      );
    });

    await waitFor(() =>
      expect(
        container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
      ).toContain("Third line"),
    );

    performanceNow.mockReturnValue(2000);
    act(() => {
      emitAudioStatus(makeAudioStatus(track, 0));
    });

    expect(
      container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
    ).toContain("Third line");
  });

  it("trusts real playback time after a missed pause instead of carrying old interpolation", async () => {
    const performanceNow = vi.spyOn(performance, "now").mockReturnValue(0);
    const track = makeTrack();
    const pauseSensitiveLyrics: LyricLine[] = [
      { timeMs: 0, text: "Before pause line" },
      { timeMs: 8000, text: "Should not be active yet" },
    ];
    const { emitAudioStatus } = mockEcho(track, 7);
    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={pauseSensitiveLyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByText("Before pause line");
    expect(
      container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
    ).toContain("Before pause line");

    performanceNow.mockReturnValue(5000);
    act(() => {
      emitAudioStatus(makeAudioStatus(track, 7.2));
    });

    expect(
      container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
    ).toContain("Before pause line");
  });

  it("advances active lyrics with RAF interpolation between status updates", async () => {
    const performanceNow = vi.spyOn(performance, "now").mockReturnValue(0);
    let rafCallback: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      rafCallback = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    const track = makeTrack();
    mockEcho(track, 9.2);
    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByText("First line");
    expect(
      container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
    ).toContain("First line");

    performanceNow.mockReturnValue(900);
    act(() => {
      rafCallback?.(900);
    });

    await waitFor(() =>
      expect(
        container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
      ).toContain("Second line"),
    );
  });

  it("applies global lyrics sync offset without changing lyric files", async () => {
    const track = makeTrack();
    mockEcho(track, 9.2, { lyricsGlobalSyncOffsetMs: 1000 });
    const { container, unmount } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() =>
      expect(
        container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
      ).toContain("Second line"),
    );

    unmount();
    mockEcho(track, 10.2, { lyricsGlobalSyncOffsetMs: -1000 });
    const secondRender = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() =>
      expect(
        secondRender.container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
      ).toContain("First line"),
    );
  });

  it("keeps saved lyrics correction values but does not apply them when disabled", async () => {
    const track = makeTrack();
    mockEcho(track, 9.2, {
      lyricsGlobalSyncOffsetMs: 1000,
      lyricsTimelineCorrectionEnabled: false,
    });
    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() =>
      expect(
        container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
      ).toContain("First line"),
    );
  });

  it("switches between pure lyrics and MV mode from bottom navigation events", async () => {
    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    window.sessionStorage.setItem("echo:lyrics:view-mode", "lyrics");
    const track = makeTrack();
    mockEcho(track, 9.2);
    attachMvBridge(makeTrackVideo());

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByRole("heading", { name: "Test Song" });
    expect(container.querySelector('.lyrics-page[data-view-mode="lyrics"]')).toBeTruthy();
    expect(container.querySelector('.lyrics-mv-panel[data-mv-enabled="false"][data-view-mode="lyrics"]')).toBeTruthy();
    expect(container.querySelector("video")).toBeNull();
    expect(window.echo.mv?.getSelected).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new CustomEvent("app:navigate:lyrics", { detail: { mode: "mv" } }));
    });

    const video = await waitFor(() => {
      const element = container.querySelector("video") as HTMLVideoElement | null;
      expect(element).toBeTruthy();
      return element!;
    });
    expect(video.getAttribute("src")).toBe("echo-video://mv/video-1");
    expect(container.querySelector('.lyrics-page[data-view-mode="mv"]')).toBeTruthy();

    expect(screen.queryByRole("button", { name: "回到纯净歌词" })).toBeNull();

    act(() => {
      window.dispatchEvent(new CustomEvent("app:navigate:lyrics", { detail: { mode: "lyrics" } }));
    });

    await waitFor(() =>
      expect(container.querySelector('.lyrics-page[data-view-mode="lyrics"]')).toBeTruthy(),
    );
    expect(container.querySelector('.lyrics-mv-panel[data-mv-enabled="false"][data-view-mode="lyrics"]')).toBeTruthy();
    expect(container.querySelector("video")).toBeNull();
    expect(window.sessionStorage.getItem("echo:lyrics:view-mode")).toBe("lyrics");
  });

  it("hides lyrics text in MV mode when the MV setting is enabled", async () => {
    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    window.sessionStorage.setItem("echo:lyrics:view-mode", "mv");
    const track = makeTrack();
    mockEcho(track, 9.2);
    attachMvBridge(makeTrackVideo(), { ...defaultMvSettings, hideLyrics: true });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() =>
      expect(container.querySelector('.lyrics-page[data-mv-lyrics-hidden="true"]')).toBeTruthy(),
    );
    expect(screen.queryByText("First line")).toBeNull();

    act(() => {
      window.dispatchEvent(new CustomEvent("settings:changed", { detail: { hideLyrics: false } }));
    });

    await screen.findByText("First line");
    expect(container.querySelector('.lyrics-page[data-mv-lyrics-hidden="true"]')).toBeNull();
  });

  it("keeps MV progress following on raw audio time when global lyrics offset shifts lyrics", async () => {
    vi.spyOn(performance, "now").mockReturnValue(0);
    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    window.sessionStorage.setItem("echo:lyrics:view-mode", "mv");
    const track = makeTrack();
    mockEcho(track, 9.2, { lyricsGlobalSyncOffsetMs: 1000 });
    attachMvBridge(makeTrackVideo());
    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() =>
      expect(
        container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
      ).toContain("Second line"),
    );

    const video = await waitFor(() => {
      const element = container.querySelector("video") as HTMLVideoElement | null;
      expect(element).toBeTruthy();
      return element!;
    });
    Object.defineProperty(video, "duration", { configurable: true, value: 120 });
    video.dispatchEvent(new Event("loadedmetadata"));

    await waitFor(() => expect(video.currentTime).toBeCloseTo(9.2, 3));
  });

  it("uses current-track audio status for MV when playback status is stale", async () => {
    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    window.sessionStorage.setItem("echo:lyrics:view-mode", "mv");
    const staleTrack = makeTrack({ id: "track-stale", path: "D:\\Music\\stale.flac", title: "Stale Song" });
    const currentTrack = makeTrack({ id: "track-current", path: "D:\\Music\\current.flac", title: "Current Song" });
    mockEcho(staleTrack, 0);
    window.echo = {
      ...window.echo,
      audio: {
        ...window.echo.audio,
        getStatus: vi.fn().mockResolvedValue(makeAudioStatus(currentTrack, 5)),
      },
    } as unknown as Window["echo"];
    attachMvBridge(makeTrackVideo({ trackId: currentTrack.id, mediaUrl: "echo-video://mv/current-video" }));

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={currentTrack}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(window.echo.mv?.getSelected).toHaveBeenCalledWith(currentTrack.id));
    const video = await waitFor(() => {
      const element = container.querySelector("video") as HTMLVideoElement | null;
      expect(element).toBeTruthy();
      return element!;
    });
    expect(video.getAttribute("src")).toBe("echo-video://mv/current-video");
    expect(screen.getByRole("heading", { name: "Current Song" })).toBeTruthy();
  });

  it("does not let a stale queue current track override the MV audio status track", async () => {
    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    window.sessionStorage.setItem("echo:lyrics:view-mode", "mv");
    const staleTrack = makeTrack({ id: "track-stale", path: "D:\\Music\\stale.flac", title: "Stale Song" });
    const currentTrack = makeTrack({ id: "track-current", path: "D:\\Music\\current.flac", title: "Current Song" });
    mockEcho(staleTrack, 0);
    window.echo = {
      ...window.echo,
      audio: {
        ...window.echo.audio,
        getStatus: vi.fn().mockResolvedValue(makeAudioStatus(currentTrack, 5)),
      },
    } as unknown as Window["echo"];
    attachMvBridge(makeTrackVideo({ trackId: currentTrack.id, mediaUrl: "echo-video://mv/current-video" }));

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeedWithTracks currentTrackId={staleTrack.id} tracks={[staleTrack, currentTrack]}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeedWithTracks>
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(window.echo.mv?.getSelected).toHaveBeenCalledWith(currentTrack.id));
    expect(vi.mocked(window.echo.mv?.getSelected).mock.calls.at(-1)?.[0]).toBe(currentTrack.id);
    const video = await waitFor(() => {
      const element = container.querySelector("video") as HTMLVideoElement | null;
      expect(element).toBeTruthy();
      return element!;
    });
    expect(video.getAttribute("src")).toBe("echo-video://mv/current-video");
    expect(screen.getByRole("heading", { name: "Current Song" })).toBeTruthy();
  });

  it("updates the MV audio clock anchor from audio status pushes", async () => {
    vi.spyOn(performance, "now").mockReturnValue(0);
    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    window.sessionStorage.setItem("echo:lyrics:view-mode", "mv");
    const track = makeTrack();
    const { emitAudioStatus } = mockEcho(track, 8);
    attachMvBridge(makeTrackVideo());
    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    const video = await waitFor(() => {
      const element = container.querySelector("video") as HTMLVideoElement | null;
      expect(element).toBeTruthy();
      return element!;
    });
    Object.defineProperty(video, "duration", { configurable: true, value: 120 });
    video.dispatchEvent(new Event("loadedmetadata"));
    await waitFor(() => expect(video.currentTime).toBeCloseTo(8, 3));

    act(() => {
      emitAudioStatus(makeAudioStatus(track, 30));
    });

    await waitFor(() => expect(video.currentTime).toBeCloseTo(30, 3));
  });

  it("does not feed lyrics RAF interpolation into the MV sync clock", async () => {
    const performanceNow = vi.spyOn(performance, "now").mockReturnValue(0);
    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    window.sessionStorage.setItem("echo:lyrics:view-mode", "mv");
    let rafCallback: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      rafCallback = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    const track = makeTrack();
    mockEcho(track, 9.2);
    attachMvBridge(makeTrackVideo());
    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() =>
      expect(
        container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
      ).toContain("First line"),
    );

    const video = await waitFor(() => {
      const element = container.querySelector("video") as HTMLVideoElement | null;
      expect(element).toBeTruthy();
      return element!;
    });
    Object.defineProperty(video, "duration", { configurable: true, value: 120 });
    video.dispatchEvent(new Event("loadedmetadata"));
    await waitFor(() => expect(video.currentTime).toBeCloseTo(9.2, 3));

    performanceNow.mockReturnValue(900);
    act(() => {
      rafCallback?.(900);
    });

    await waitFor(() =>
      expect(
        container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
      ).toContain("Second line"),
    );
    expect(video.currentTime).toBeCloseTo(9.2, 3);
  });

  it("seeks once when a valid synced lyric line is clicked", async () => {
    const track = makeTrack();
    const { seek } = mockEcho(track, 0);
    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(container.querySelector(".lyrics-line-primary")?.textContent).toBe("First line"));
    const secondLineButton = Array.from(container.querySelectorAll<HTMLButtonElement>(".lyrics-line"))
      .find((line) => line.querySelector(".lyrics-line-primary")?.textContent === "Second line");
    expect(secondLineButton).toBeTruthy();
    await waitFor(() => expect(secondLineButton?.getAttribute("data-seekable")).toBe("true"));
    fireEvent.click(secondLineButton!);
    fireEvent.click(secondLineButton!);

    await waitFor(() => expect(seek).toHaveBeenCalledTimes(1));
    expect(seek).toHaveBeenCalledWith(10);
    expect(document.querySelector('.lyrics-line[data-seekable="true"]')).toBeTruthy();
    expect(container.querySelector(".lyrics-page")?.getAttribute("data-lyrics-text-direction")).toBe("horizontal");
    expect(container.querySelector(".lyrics-scroll")?.getAttribute("data-text-direction")).toBe("horizontal");
  });

  it("applies the configured timeline correction when seeking from lyrics", async () => {
    const track = makeTrack();
    const { seek } = mockEcho(track, 0, {
      lyricsGlobalSyncOffsetMs: 500,
      lyricsTextDirection: "vertical",
    });
    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(container.querySelector(".lyrics-line-primary")?.textContent).toBe("First line"));
    const secondLineButton = Array.from(container.querySelectorAll<HTMLButtonElement>(".lyrics-line"))
      .find((line) => line.querySelector(".lyrics-line-primary")?.textContent === "Second line");
    expect(secondLineButton).toBeTruthy();
    await waitFor(() => expect(secondLineButton?.getAttribute("data-seekable")).toBe("true"));
    fireEvent.click(secondLineButton!);

    await waitFor(() => expect(seek).toHaveBeenCalledWith(9.5));
    expect(document.querySelector('.lyrics-line[data-seekable="true"]')).toBeTruthy();
    expect(container.querySelector(".lyrics-page")?.getAttribute("data-lyrics-text-direction")).toBe("horizontal");
    expect(container.querySelector(".lyrics-scroll")?.getAttribute("data-text-direction")).toBe("horizontal");
  });

  it("keeps primary, romanization, and translation readable when legacy vertical lyrics setting exists", async () => {
    const track = makeTrack();
    mockEcho(track, 0, { lyricsTextDirection: "vertical" });
    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage
            initialLyrics={[
              {
                timeMs: 0,
                text: "らくになる日はまず来ない",
                romanization: "ra ku ni na ru hi wa ma zu ko na i",
                translation: "轻松的生活不会到来",
              },
            ]}
          />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(container.querySelector(".lyrics-line-primary")?.textContent).toBe("らくになる日はまず来ない"));
    const lineText = container.querySelector(".lyrics-line-text");

    expect(container.querySelector(".lyrics-scroll")?.getAttribute("data-text-direction")).toBe("horizontal");
    expect(lineText?.querySelector(".lyrics-line-primary")?.textContent).toBe("らくになる日はまず来ない");
    expect(lineText?.querySelector("small")?.getAttribute("aria-label")).toBeNull();
    expect(lineText?.querySelector("small")?.textContent).toBe("ra ku ni na ru hi wa ma zu ko na i");
    expect(lineText?.querySelector("em")?.textContent).toBe("轻松的生活不会到来");
  });

  it("keeps vertical active lyrics on the normal primary size scale", () => {
    const css = readFileSync("src/renderer/styles/lyrics.css", "utf8");

    expect(css).toMatch(/\.lyrics-scroll\[data-text-direction="vertical"\] \.lyrics-line\[data-active="true"\] \.lyrics-line-primary,[\s\S]*?font-size: calc\(var\(--lyrics-font-size\) \* 1\.25\);[\s\S]*?font-weight: 850;/);
    expect(css).toMatch(/\.lyrics-scroll\[data-text-direction="vertical"\] \.lyrics-line-text \{[\s\S]*?column-gap: clamp\(8px, 1\.4vw, 22px\);/);
    expect(css).toMatch(/\.lyrics-scroll\[data-text-direction="vertical"\] \.lyrics-line-primary \{[\s\S]*?justify-content: center;/);
    expect(css).toMatch(/\.lyrics-scroll\[data-text-direction="vertical"\] \.lyrics-line small,[\s\S]*?\.lyrics-scroll\[data-text-direction="vertical"\] \.lyrics-line em \{[\s\S]*?justify-content: center;/);
  });

  it("uses album artwork as the MV fallback and shows a default visual without cover art", async () => {
    window.sessionStorage.setItem("echo:lyrics:view-mode", "mv");
    const track = makeTrack();
    mockEcho(track);
    const { container, rerender } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByRole("heading", { name: "Test Song" });
    expect(
      container.querySelector(".lyrics-track-cover img")?.getAttribute("src"),
    ).toBe("echo-cover://large/test");
    expect(
      container
        .querySelector('.lyrics-mv-card[data-cover="true"] img')
        ?.getAttribute("src"),
    ).toBe("echo-cover://thumb/test");

    const noCoverTrack = makeTrack({ coverThumb: null });
    mockEcho(noCoverTrack);
    rerender(
      <PlaybackQueueProvider>
        <QueueSeed track={noCoverTrack}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByRole("heading", { name: "Test Song" });
    expect(container.querySelector(".lyrics-mv-placeholder")).toBeTruthy();
  });

  it("shows inline artwork for AirPlay snapshot tracks on the lyrics page", async () => {
    window.sessionStorage.setItem("echo:lyrics:view-mode", "mv");
    const inlineCover = "data:image/png;base64,QUlS";
    const track = makeTrack({
      id: "airplay-receiver:session-1",
      path: "airplay-receiver:session-1",
      mediaType: "remote",
      isTemporary: true,
      title: "Shelter",
      artist: "Porter Robinson / Madeon",
      album: "Shelter",
      coverId: null,
      coverThumb: inlineCover,
      codec: null,
      fieldSources: { title: "airplay", artist: "airplay", cover: "airplay" },
    });
    mockEcho(track);

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByRole("heading", { name: "Shelter" });
    expect(
      container.querySelector(".lyrics-track-cover img")?.getAttribute("src"),
    ).toBe(inlineCover);
    expect(
      container
        .querySelector('.lyrics-mv-card[data-cover="true"] img')
        ?.getAttribute("src"),
    ).toBe(inlineCover);
  });

  it("uses the high-resolution visible cover for the full-page background", async () => {
    const track = makeTrack({ coverId: "cover 1" });
    mockEcho(track);
    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByRole("heading", { name: "Test Song" });
    expect(
      container.querySelector(".lyrics-track-cover img")?.getAttribute("src"),
    ).toBe("echo-cover://large/cover%201");
    window.dispatchEvent(
      new CustomEvent("settings:changed", {
        detail: {
          lyricsBackgroundMode: "cover",
        },
      }),
    );

    const page = container.querySelector(".lyrics-page") as HTMLElement;
    await waitFor(() => expect(page.dataset.background).toBe("cover"));
    expect(page.style.getPropertyValue("--lyrics-cover")).toBe(
      'url("echo-cover://original/cover%201")',
    );
  });

  it("keeps the immersive album cover lyrics style disabled by default", async () => {
    const track = makeTrack({ coverId: "cover 1" });
    mockEcho(track);

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findAllByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;

    expect(page.dataset.immersiveCoverStyle).toBeUndefined();
    expect(page.dataset.background).toBe("theme");
    expect(page.dataset.themeFilter).toBe("true");
    expect(page.style.getPropertyValue("--lyrics-cover")).toBe("none");
  });

  it("applies background scale and track transitions to the visible lyrics cover bitmap", () => {
    const css = readFileSync("src/renderer/styles/lyrics.css", "utf8");

    expect(css).toMatch(/\.lyrics-backdrop-cover \{[\s\S]*?transform: translateZ\(0\) scale\(var\(--lyrics-background-scale\)\);[\s\S]*?transition: transform 180ms/);
    expect(css).toMatch(/\.lyrics-page\[data-track-transition="true"\] \.lyrics-backdrop-cover \{[\s\S]*?animation: lyrics-track-bitmap-cover-in var\(--echo-motion-drawer-ms\)/);
    expect(css).toMatch(/@keyframes lyrics-track-bitmap-cover-in \{[\s\S]*?opacity: calc\(var\(--lyrics-cover-opacity\) \* 0\.62\);/);
    expect(css).not.toMatch(/@keyframes lyrics-track-cover-in \{[\s\S]*?filter: blur\(/);
    expect(css).not.toMatch(/@keyframes lyrics-track-header-in \{[\s\S]*?filter: blur\(/);
  });

  it("marks the lyrics background as theme-filter-free after opting out", async () => {
    const track = makeTrack({ coverId: "cover 1" });
    mockEcho(track, 0, { lyricsThemeFilterEnabled: false });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findAllByRole("heading", { name: "Test Song" });
    expect((container.querySelector(".lyrics-page") as HTMLElement).dataset.themeFilter).toBe("false");
    expect(container.querySelector(".lyrics-backdrop-theme-filter")).toBeTruthy();
  });

  it("covers every lyrics page style with the shared theme filter layer", () => {
    const css = readFileSync("src/renderer/styles/lyrics-theme-filter.css", "utf8");
    const pageStyles = ["editorial", "folded", "roseVinyl", "cinemaStage", "kineticPoster", "coverStage", "cutBoard"];

    expect(css).toMatch(/\.lyrics-page\[data-theme-filter="false"\] \.lyrics-backdrop-theme-filter \{\s*display: none;/);
    for (const pageStyle of pageStyles) {
      expect(css).toContain(`.lyrics-page[data-lyrics-page-style="${pageStyle}"]`);
    }
    expect(css).toContain('[data-theme-filter="true"][data-lyrics-page-style="coverStage"] .lyrics-cover-stage-artwork::before');
  });

  it("uses the rose vinyl lyrics page style as a cover-backed layout option", async () => {
    const track = makeTrack({ coverId: "cover 1", album: "Test Album" });
    mockEcho(track, 0, {
      lyricsBackgroundMode: "theme",
      lyricsPageStyle: "roseVinyl",
      lyricsImmersiveCoverStyleEnabled: true,
      lyricsImmersiveCoverGlassEnabled: true,
      lyricsImmersiveCoverGlassBlurPx: 19,
      lyricsRoseVinylGradientEnabled: true,
      lyricsSmartReadableColorsEnabled: false,
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} usePlayerDrawerHeader />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findAllByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;

    expect(page.dataset.lyricsPageStyle).toBe("roseVinyl");
    expect(page.dataset.immersiveCoverStyle).toBeUndefined();
    expect(page.dataset.immersiveCoverGlass).toBe("true");
    expect(page.dataset.roseVinylGradient).toBe("true");
    expect(page.dataset.background).toBe("cover");
    expect(page.style.getPropertyValue("--lyrics-cover")).toBe(
      'url("echo-cover://large/cover%201")',
    );
    expect(page.style.getPropertyValue("--lyrics-immersive-glass-blur")).toBe("19px");
    expect(page.style.getPropertyValue("--lyrics-rose-vinyl-background-blur")).toBe("18px");
    expect(container.querySelector(".lyrics-style-cover-card img")?.getAttribute("src")).toBe(
      "echo-cover://large/cover%201",
    );
    expect(container.querySelector(".lyrics-style-cover-card span")).toBeNull();
    expect(container.querySelector(".lyrics-style-status-pill")).toBeNull();
    expect(container.querySelector(".lyrics-page > .lyrics-track-header-floating")).toBeNull();
    expect(container.querySelector(".lyrics-mv-panel")?.getAttribute("data-lyrics-readability")).toBe("true");
  });

  it("applies an explicit background source without replacing the lyrics style layout", async () => {
    const track = makeTrack({ coverId: "cover 1", album: "Test Album" });
    mockEcho(track, 0, {
      lyricsBackgroundMode: "coverColor",
      lyricsBackgroundModeOverrideEnabled: true,
      lyricsPageStyle: "roseVinyl",
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} usePlayerDrawerHeader />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findAllByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;

    expect(page.dataset.lyricsPageStyle).toBe("roseVinyl");
    expect(page.dataset.background).toBe("cover");
    expect(page.dataset.backgroundSource).toBe("coverColor");
    expect(page.dataset.backgroundOverridden).toBe("true");
    expect(container.querySelector(".lyrics-backdrop-source")?.getAttribute("data-source")).toBe("coverColor");
    expect(container.querySelector(".lyrics-backdrop-source-media")).toBeTruthy();
    expect(container.querySelector(".lyrics-backdrop-cover")).toBeNull();
  });

  it("returns to the lyrics style background when the explicit override is cleared", async () => {
    const track = makeTrack({ coverId: "cover 1" });
    mockEcho(track, 0, {
      lyricsBackgroundMode: "customWallpaper",
      lyricsBackgroundModeOverrideEnabled: true,
      lyricsCustomWallpaperPath: "D:\\Echo\\lyrics-wallpapers\\custom.png",
      lyricsPageStyle: "cinemaStage",
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findAllByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;
    expect(page.dataset.backgroundSource).toBe("customWallpaper");

    window.dispatchEvent(new CustomEvent("settings:changed", {
      detail: { lyricsBackgroundModeOverrideEnabled: false },
    }));

    await waitFor(() => expect(page.dataset.backgroundSource).toBe("cover"));
    expect(page.dataset.background).toBe("cover");
    expect(page.dataset.backgroundOverridden).toBeUndefined();
  });

  it("uses estimated word timing for folded line-timed lyrics", async () => {
    const track = makeTrack({ album: "Test Album" });
    mockEcho(track, 0, {
      lyricsBackgroundMode: "cover",
      lyricsPageStyle: "folded",
      lyricsWordHighlightEnabled: true,
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} usePlayerDrawerHeader />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findAllByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;

    expect(page.dataset.lyricsPageStyle).toBe("folded");
    expect(page.dataset.background).toBe("cover");
    expect(page.dataset.immersiveCoverStyle).toBeUndefined();
    expect(container.querySelector(".lyrics-page > .lyrics-track-header-floating")).toBeNull();
    const activeLine = container.querySelector('.lyrics-line[data-active="true"]');
    const words = Array.from(activeLine?.querySelectorAll<HTMLElement>(".lyrics-word") ?? []);

    expect(activeLine?.getAttribute("data-word-timing")).toBe("estimated");
    expect(words.map((word) => word.textContent)).toEqual(["First ", "line"]);
  });

  it("respects the disabled word highlight setting for folded lyrics", async () => {
    const track = makeTrack({ album: "Test Album" });
    mockEcho(track, 0, {
      lyricsBackgroundMode: "cover",
      lyricsPageStyle: "folded",
      lyricsWordHighlightEnabled: false,
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} usePlayerDrawerHeader />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findAllByRole("heading", { name: "Test Song" });
    const activeLine = container.querySelector('.lyrics-line[data-active="true"]');

    expect(activeLine?.getAttribute("data-word-highlight")).toBe("false");
    expect(activeLine?.querySelector(".lyrics-word")).toBeNull();
  });

  it("uses source word timing for the folded lyrics highlight", async () => {
    const track = makeTrack({ album: "Test Album" });
    mockEcho(track, 0.25, {
      lyricsBackgroundMode: "cover",
      lyricsPageStyle: "folded",
      lyricsWordHighlightEnabled: true,
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage
            initialLyrics={[
              {
                timeMs: 0,
                text: "Hello world",
                words: [
                  { text: "Hello ", startMs: 0, endMs: 500 },
                  { text: "world", startMs: 500, endMs: 1000 },
                ],
              },
              { timeMs: 1200, text: "Next line" },
            ]}
            usePlayerDrawerHeader
          />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findAllByRole("heading", { name: "Test Song" });
    const activeLine = container.querySelector('.lyrics-line[data-active="true"]');
    const words = Array.from(activeLine?.querySelectorAll<HTMLElement>(".lyrics-word") ?? []);

    expect(activeLine?.getAttribute("data-word-timing")).toBe("source");
    expect(words.map((word) => word.textContent)).toEqual(["Hello ", "world"]);
    expect(words[0]?.dataset.wordState).toBe("current");
    expect(words[0]?.style.getPropertyValue("--lyrics-word-progress")).toBe("1");
  });

  it("gives the folded source-word highlight distinct future, current, and passed states", () => {
    const css = readFileSync("src/renderer/styles/lyrics-folded.css", "utf8");

    expect(css).toMatch(/data-word-highlight="true"\] \.lyrics-word \{[\s\S]*?--lyrics-word-upcoming-color: rgba\(202, 218, 229, 0\.36\);/);
    expect(css).toMatch(/data-word-highlight="true"\] \.lyrics-word \{[\s\S]*?margin-block: -0\.16em;[\s\S]*?padding-block: 0\.16em;/);
    expect(css).toMatch(/data-word-highlight="true"\] \.lyrics-word \{[\s\S]*?transform: none;[\s\S]*?color 180ms ease,[\s\S]*?opacity 260ms ease;/);
    expect(css).toMatch(/data-word-state="current"\] \{[\s\S]*?--lyrics-word-fill-color: var\(--lyrics-folded-accent\);[\s\S]*?translateY\(-0\.025em\) scale\(1\.035\);/);
    expect(css).toMatch(/data-word-state="passed"\] \{[\s\S]*?--lyrics-word-fill-color: var\(--lyrics-folded-ink\);[\s\S]*?opacity: 0\.86;[\s\S]*?transform: none;/);
    expect(css).toContain("animation: lyrics-folded-current-word 460ms cubic-bezier(0.16, 1, 0.3, 1) both;");
    expect(css).not.toMatch(/data-word-highlight="true"\] \.lyrics-word \{[^}]*translate3d/);
  });

  it("keeps folded translations and romanization readable", () => {
    const css = readFileSync("src/renderer/styles/lyrics-folded.css", "utf8");

    expect(css).toContain("--lyrics-folded-muted: rgba(220, 232, 239, 0.82);");
    expect(css).toContain("font-size: clamp(15px, 1.45vw, 24px);");
    expect(css).toMatch(/\.lyrics-line small \{[\s\S]*?opacity: 0\.86;/);
    expect(css).toMatch(/data-active="true"\] small \{[\s\S]*?opacity: 0\.96;/);
    expect(css).toMatch(/data-active="true"\] em \{[\s\S]*?opacity: 0\.92;/);
  });

  it("keeps every folded mini-player control inside one responsive pill", () => {
    const css = readFileSync("src/renderer/styles/lyrics-folded.css", "utf8");

    expect(css).toContain("width: min(820px, calc(100vw - 96px));");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr) max-content;");
    expect(css).toContain("grid-template-columns: max-content minmax(230px, 286px);");
    expect(css).toContain("width: clamp(230px, 21vw, 286px);");
    expect(css).toContain("grid-template-columns: 40px minmax(118px, 1fr) 40px;");
    expect(css).toMatch(/\.output-status \{[\s\S]*?min-width: max-content;[\s\S]*?flex-wrap: nowrap;/);
    expect(css).toContain("@media (max-width: 560px)");
  });

  it("uses the original cover and lightweight word-stage layout for the kinetic poster theme", async () => {
    const track = makeTrack({ coverId: "poster cover", album: "Test Album" });
    mockEcho(track, 0.65, {
      lyricsBackgroundMode: "theme",
      lyricsPageStyle: "kineticPoster",
      lyricsHeaderHidden: true,
      lyricsWordHighlightEnabled: false,
      lyricsRomanizationEnabled: true,
      lyricsTranslationEnabled: true,
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage
            initialLyrics={[
              {
                timeMs: 0,
                text: "Hello world",
                romanization: "hello world",
                translation: "你好世界",
                words: [
                  { text: "Hello ", startMs: 0, endMs: 500 },
                  { text: "world", startMs: 500, endMs: 1000 },
                ],
              },
              { timeMs: 1200, text: "Next line" },
            ]}
            usePlayerDrawerHeader
          />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findAllByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;

    expect(page.dataset.lyricsPageStyle).toBe("kineticPoster");
    expect(page.dataset.background).toBe("cover");
    expect(page.style.getPropertyValue("--lyrics-cover")).toBe(
      'url("echo-cover://large/poster%20cover")',
    );
    expect(container.querySelector(".lyrics-kinetic-poster-chrome")).not.toBeNull();
    expect(container.querySelector(".lyrics-left-panel > .lyrics-track-header")).not.toBeNull();
    expect(container.querySelector(".lyrics-track-artist")?.textContent).toContain("Test Artist");
    expect(container.querySelector('.lyrics-scroll[data-presentation-mode="kineticPoster"]')).not.toBeNull();
    expect(container.querySelector('.lyrics-line[data-active="true"][data-word-highlight="true"]')).not.toBeNull();
    expect(container.querySelector(".lyrics-page > .lyrics-track-header-floating")).toBeNull();

    const css = readFileSync("src/renderer/styles/lyrics-kinetic-poster.css", "utf8");
    expect(css).toMatch(/\.lyrics-backdrop::after,[\s\S]*?\.lyrics-backdrop-previous-cover \{[\s\S]*?display: none !important;[\s\S]*?background-image: none !important;/);
    expect(css).toMatch(/\.lyrics-backdrop-atmosphere \{[\s\S]*?animation: none !important;/);
    expect(css).toContain("grid-template-columns: minmax(0, 1fr) clamp(180px, 15vw, 268px) minmax(0, 1fr);");
    expect(css).toContain("--lyrics-poster-ghost: rgba(229, 237, 244, 0.76);");
    expect(css).toMatch(/\.lyrics-line\[data-focus-distance="1"\] \{[\s\S]*?opacity: 0\.72;/);
    expect(css).toMatch(/\.lyrics-line\[data-focus-distance="2"\] \{[\s\S]*?opacity: 0\.4;/);
    expect(css).toContain("width: min(54vw, 920px);");
    expect(css).toContain('.lyrics-kinetic-poster-word-focus[data-focus-word-state="current"] .lyrics-word');
    expect(css).toContain('.lyrics-kinetic-poster-word-focus[data-focus-word-state="passed"] .lyrics-word');
    expect(css).toContain("width: min(820px, calc(100vw - 96px));");
    expect(css).not.toContain('.player-bar[data-compact-away="true"]::before');
    expect(css).not.toMatch(/\.player-compact-progress \{[\s\S]*?display: none;/);
    expect(css).toContain("grid-template-columns: max-content minmax(230px, 286px);");
    expect(css).toContain("width: clamp(230px, 21vw, 286px);");
    expect(css).toContain("grid-template-columns: 42px minmax(118px, 1fr) 42px;");
    expect(css).toContain("-webkit-backdrop-filter: none;");
  });

  it("keeps kinetic poster track metadata neutral and shadow-free", () => {
    const css = readFileSync("src/renderer/styles/lyrics-kinetic-poster.css", "utf8");

    expect(css).toMatch(/\.lyrics-track-copy h1,[\s\S]*?text-shadow: none;/);
    expect(css).toMatch(/\.lyrics-track-artist,[\s\S]*?color: rgba\(255, 255, 255, 0\.74\);[\s\S]*?text-shadow: none;/);
  });

  it("renders the cover stage as one artwork panel beside the existing lyric renderer", async () => {
    const track = makeTrack({ coverId: "cover stage art", album: "Test Album" });
    mockEcho(track, 0.65, {
      lyricsBackgroundMode: "theme",
      lyricsPageStyle: "coverStage",
      lyricsHeaderHidden: true,
      lyricsWordHighlightEnabled: true,
      lyricsRomanizationEnabled: true,
      lyricsTranslationEnabled: true,
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage
            initialLyrics={[
              { timeMs: 0, text: "Dies ist kein Lied der Traurigkeit.", translation: "此曲绝非一曲悲歌" },
              { timeMs: 1600, text: "Masquerade Kill" },
            ]}
            usePlayerDrawerHeader
          />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findAllByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;
    const artwork = container.querySelector(".lyrics-cover-stage-image") as HTMLImageElement;
    const bridge = container.querySelector(".lyrics-cover-stage-bridge") as HTMLImageElement;
    const colorField = container.querySelector(".lyrics-cover-stage-color-field") as HTMLImageElement;

    expect(page.dataset.lyricsPageStyle).toBe("coverStage");
    expect(page.dataset.background).toBe("cover");
    expect(artwork.src).toContain("echo-cover://large/cover%20stage%20art");
    expect(bridge.src).toContain("echo-cover://album/cover%20stage%20art");
    expect(colorField.src).toBe(bridge.src);
    expect(container.querySelector(".lyrics-backdrop")).toBeNull();
    expect(container.querySelectorAll(".lyrics-scroll")).toHaveLength(1);
    expect(container.querySelector(".lyrics-scroll")?.getAttribute("data-presentation-mode")).toBe("coverStage");
    const activeLine = container.querySelector('.lyrics-line[data-active="true"]');
    expect(activeLine?.getAttribute("data-word-highlight")).toBe("true");
    expect(activeLine?.getAttribute("data-word-timing")).toBe("estimated");
    expect(activeLine?.querySelectorAll(".lyrics-word").length).toBeGreaterThan(1);
    expect(container.querySelector(".lyrics-page > .lyrics-track-header-floating")).toBeNull();
    expect(container.querySelector(".lyrics-left-panel > .lyrics-cover-stage-track-info")).toBeTruthy();
    expect(container.querySelector(".lyrics-left-panel > .lyrics-track-header h1")?.textContent).toContain("Test Song");
    expect(container.querySelector(".lyrics-left-panel > .lyrics-track-header h1")?.getAttribute("data-max-lines")).toBe("2");
    expect(container.querySelector(".lyrics-left-panel > .lyrics-track-header .lyrics-track-artist")?.textContent).toContain("Test Artist");
    expect(container.querySelector(".lyrics-left-panel > .lyrics-track-header .lyrics-track-album")?.textContent).toContain("Test Album");

    const css = readFileSync("src/renderer/styles/lyrics-cover-stage.css", "utf8");
    expect(css).toContain("grid-template-columns: minmax(0, 58%) minmax(0, 42%);");
    expect(css).toMatch(/\.lyrics-cover-stage-artwork \{[\s\S]*?position: absolute;[\s\S]*?inset: 0;/);
    expect(css).toContain("transparent 32%");
    expect(css).toContain(".lyrics-cover-stage-bridge");
    expect(css).toContain("width: 72%;");
    expect(css).toContain("filter: blur(clamp(10px, 1vw, 20px)) brightness(0.84) saturate(1.12);");
    expect(css).toMatch(/\.lyrics-cover-stage-color-field \{[\s\S]*?rgb\(0 0 0 \/ 0\.05\) 100%\s*\);/);
    expect(css).toMatch(/\.lyrics-cover-stage-bridge \{[\s\S]*?transparent 34%,[\s\S]*?opacity: 0\.78;/);
    expect(css).toMatch(/\.lyrics-cover-stage-image \{[\s\S]*?rgb\(0 0 0 \/ 0\.06\) 92%,/);
    expect(css).toMatch(/> \.lyrics-back-button \{[\s\S]*?position: fixed;[\s\S]*?left: clamp\(22px, 2vw, 34px\);/);
    expect(css).not.toContain("@keyframes lyrics-cover-stage-bridge-in");
    expect(css).not.toContain("@keyframes lyrics-cover-stage-artwork-in");
    expect(css).not.toContain("@keyframes lyrics-cover-stage-field-in");
    expect(css).toMatch(/\.lyrics-cover-stage-image \{[\s\S]*?transform: none;/);
    expect(css).toContain("filter: blur(clamp(30px, 3vw, 56px)) brightness(0.8) saturate(1.18) contrast(1.03);");
    expect(css).toMatch(/data-render-pressure-reduced="true"\] \.lyrics-cover-stage-bridge \{[\s\S]*?display: none;/);
    expect(css).toMatch(/data-render-pressure-reduced="true"\] \.lyrics-cover-stage-color-field \{[\s\S]*?filter: blur\(28px\)/);
    expect(css).toContain("rgb(var(--lyrics-cover-text-rgb, 248 248 248) / 1)");
    expect(css).toContain("--lyrics-word-upcoming-color: rgb(var(--lyrics-cover-text-rgb, 248 248 248) / 0.56) !important;");
    expect(css).toMatch(/data-word-state="current"\] \{[\s\S]*?--lyrics-word-edge: 0\.2em;[\s\S]*?drop-shadow\(0 0 0\.16em/);
    expect(css).toMatch(/data-word-state="passed"\] \{[\s\S]*?--lyrics-word-progress: 1;[\s\S]*?opacity: 1;/);
    expect(css).toMatch(/\.lyrics-line \{[\s\S]*?opacity: 0;[\s\S]*?visibility: hidden;[\s\S]*?transition: none !important;/);
    expect(css).toMatch(/data-focus-distance="1"\] \{[\s\S]*?opacity: 1;[\s\S]*?visibility: visible;/);
    expect(css).toMatch(/data-focus-distance="2"\] \{[\s\S]*?opacity: 1;[\s\S]*?visibility: visible;/);
    expect(css).toMatch(/data-word-state="current"\] \{[\s\S]*?transform: none !important;/);
    expect(css).toMatch(/\.lyrics-cover-stage-track-info \{[\s\S]*?display: block !important;[\s\S]*?visibility: visible !important;/);
    expect(css).toMatch(/\.app-shell--lyrics-player-drawer[\s\S]*?> \.lyrics-left-panel[\s\S]*?> \.lyrics-track-header \{[\s\S]*?position: relative !important;[\s\S]*?grid-row: 1 !important;/);
    expect(css).toMatch(/\.app-shell--lyrics-player-drawer[\s\S]*?data-lyrics-page-style="coverStage"[\s\S]*?> \.lyrics-left-panel \{[\s\S]*?grid-template-rows: auto minmax\(0, 1fr\);[\s\S]*?overflow: hidden;/);
    expect(css).toMatch(/\.app-shell--lyrics-player-drawer[\s\S]*?data-lyrics-page-style="coverStage"[\s\S]*?> \.lyrics-left-panel[\s\S]*?> \.lyrics-scroll \{[\s\S]*?grid-row: 2;[\s\S]*?justify-self: start;/);
    expect(css).not.toContain("--cover-stage-content-shift");
    expect(css).toContain("clamp(130px, 9vw, 180px);");
    expect(css).toContain("width: min(100%, 720px);");
    expect(css).toMatch(/h1\.lyrics-track-marquee\[data-max-lines="2"\] \{[\s\S]*?max-height: 2\.24em;[\s\S]*?white-space: normal;/);
    expect(css).toContain("@keyframes lyrics-cover-stage-title-scroll-y");
    expect(css).toMatch(/data-lyrics-page-style="coverStage"[\s\S]*?\.lyrics-line \{[\s\S]*?min-height: clamp\(88px, 10\.8vh, 132px\);/);
    expect(css).toMatch(/\.lyrics-line\[data-secondary-lines="2"\] \{[\s\S]*?min-height: clamp\(124px, 14\.8vh, 172px\);/);
    expect(css).toMatch(/data-lyrics-page-style="coverStage"[\s\S]*?\.lyrics-line\[data-active="true"\][\s\S]*?\.lyrics-line-primary \{[\s\S]*?font-size: clamp\(34px, 2\.35vw, 46px\);/);
    expect(css).toMatch(/\.lyrics-scroll \{[\s\S]*?grid-row: 2;[\s\S]*?padding: clamp\(120px, 16vh, 196px\) 0 clamp\(180px, 24vh, 292px\);/);
    expect(css).toMatch(/\.lyrics-scroll \{[\s\S]*?--cover-stage-line-gap: clamp\(22px, 2\.6vh, 36px\);[\s\S]*?gap: var\(--cover-stage-line-gap\);/);
    expect(css).toMatch(/\.lyrics-scroll:has\(\.lyrics-line\[data-secondary-lines="1"\]\) \{[\s\S]*?--cover-stage-line-gap: clamp\(30px, 3\.6vh, 48px\);/);
    expect(css).toMatch(/\.lyrics-scroll:has\(\.lyrics-line\[data-secondary-lines="2"\]\) \{[\s\S]*?--cover-stage-line-gap: clamp\(40px, 4\.8vh, 64px\);/);
    expect(css).toMatch(/\.lyrics-line \{[\s\S]*?padding: clamp\(12px, 1\.3vh, 18px\) 0;/);
    expect(css).toMatch(/\.lyrics-line \{[\s\S]*?justify-items: start;[\s\S]*?text-align: left;/);
    expect(css).toMatch(/\.lyrics-line \.lyrics-line-text \{[\s\S]*?justify-items: start;[\s\S]*?gap: clamp\(10px, 1vh, 15px\);[\s\S]*?text-align: left;/);
    expect(css).toMatch(/\.lyrics-line\[data-secondary-lines="2"\][\s\S]*?\.lyrics-line-text \{[\s\S]*?gap: clamp\(14px, 1\.5vh, 21px\);/);
    expect(css).toMatch(/data-active="true"\][\s\S]*?\.lyrics-line-primary \{[\s\S]*?font-size: clamp\(33px, 2\.35vw, 46px\);/);
    expect(css).toMatch(/data-density="long"[\s\S]*?data-density="dense"[\s\S]*?font-size: clamp\(28px, 1\.9vw, 37px\);/);
    expect(css).toMatch(/\.lyrics-left-panel \{[\s\S]*?background: transparent;/);
    expect(css).toContain("@media (max-width: 720px)");
    expect(css).toContain("@media (prefers-reduced-transparency: reduce)");
  });

  it("downgrades cover stage effects when lyric render pressure is reduced", async () => {
    const track = makeTrack({ coverId: "cover stage low load" });
    mockEcho(track, 0.65, {
      lowLoadPlaybackModeEnabled: true,
      lyricsPageStyle: "coverStage",
      lyricsWordHighlightEnabled: true,
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage
            initialLyrics={[
              { timeMs: 0, text: "Performance stays calm" },
              { timeMs: 1800, text: "while the cover remains visible" },
            ]}
            usePlayerDrawerHeader
          />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findAllByRole("heading", { name: "Test Song" });
    expect(container.querySelector(".lyrics-page")?.getAttribute("data-render-pressure-reduced")).toBe("true");
    expect(container.querySelector(".lyrics-page")?.getAttribute("data-lyrics-page-style")).toBe("coverStage");
    expect(container.querySelector('.lyrics-line[data-active="true"] .lyrics-word')).toBeNull();
  });

  it("downgrades heavy lyrics visuals in lightweight mode", async () => {
    const track = makeTrack({ coverId: "cover stage lightweight" });
    mockEcho(track, 0.65, {
      lowSpecModeEnabled: true,
      lyricsPageStyle: "coverStage",
      lyricsWordHighlightEnabled: true,
      lyricsImmersiveCoverStyleEnabled: true,
      lyricsMusicReactiveVisualsEnabled: true,
      lyricsBackgroundMode: "cover",
      lyricsSmartReadableColorsEnabled: true,
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage
            initialLyrics={[
              { timeMs: 0, text: "Lightweight lyrics stay simple" },
              { timeMs: 1800, text: "without cover-stage extras" },
            ]}
            usePlayerDrawerHeader
          />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findAllByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;
    expect(page?.getAttribute("data-render-pressure-reduced")).toBe("true");
    expect(page?.getAttribute("data-lyrics-page-style")).toBe("coverStage");
    expect(page?.getAttribute("data-immersive-cover-style")).toBeNull();
    expect(page?.getAttribute("data-music-reactive")).toBeNull();
    expect(page?.getAttribute("data-smart-readable")).toBeNull();
    expect(page?.getAttribute("data-theme-filter")).toBe("false");
    expect(page.style.getPropertyValue("--lyrics-cover")).toBe(
      'url("echo-cover://large/cover%20stage%20lightweight")',
    );
  });

  it("uses the lightweight cinema stage without adding a second lyric renderer", async () => {
    const track = makeTrack({ coverId: "cinema cover", album: "Test Album" });
    const { emitAudioStatus } = mockEcho(track, 0.65, {
      lyricsBackgroundMode: "theme",
      lyricsPageStyle: "cinemaStage",
      lyricsHeaderHidden: true,
      lyricsWordHighlightEnabled: false,
      lyricsRomanizationEnabled: true,
      lyricsTranslationEnabled: true,
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage
            initialLyrics={[
              {
                timeMs: 0,
                text: "Light falls across the stage",
                romanization: "light falls across the stage",
                translation: "灯光落在舞台上",
                words: [
                  { text: "Light ", startMs: 0, endMs: 300 },
                  { text: "falls ", startMs: 300, endMs: 520 },
                  { text: "across ", startMs: 520, endMs: 760 },
                  { text: "the ", startMs: 760, endMs: 900 },
                  { text: "stage", startMs: 900, endMs: 1200 },
                ],
              },
              { timeMs: 1400, text: "Next line" },
            ]}
            usePlayerDrawerHeader
          />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findAllByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;

    expect(page.dataset.lyricsPageStyle).toBe("cinemaStage");
    expect(page.dataset.background).toBe("cover");
    expect(page.style.getPropertyValue("--lyrics-cover")).toBe(
      'url("echo-cover://large/cinema%20cover")',
    );
    expect(container.querySelector(".lyrics-cinema-stage-chrome")).not.toBeNull();
    expect(container.querySelectorAll(".lyrics-cinema-stage-particles span")).toHaveLength(24);
    expect(page.dataset.cinemaParticles).toBe("idle");
    expect(page.dataset.cinemaParticlesTelemetry).toBe("fallback");
    expect(container.querySelector('.lyrics-scroll[data-presentation-mode="default"]')).not.toBeNull();
    expect(container.querySelector('.lyrics-line[data-active="true"][data-word-highlight="true"]')).not.toBeNull();
    expect(container.querySelector(".lyrics-page > .lyrics-track-header-floating")).toBeNull();

    act(() => {
      emitAudioStatus({
        ...makeAudioStatus(track, 0.65),
        audioLevels: {
          inputPeakDb: -3.8,
          inputRmsDb: -16,
          estimatedOutputPeakDb: -3.8,
          estimatedOutputRmsDb: -16,
          visualSpectrum: Array.from({ length: 32 }, (_, index) => (index % 8) / 7),
          visualSpectrumVersion: 2,
          visualEnergy: 0.68,
          visualTransient: 0.56,
          visualTelemetryState: "pcm",
          headroomDb: 3.2,
          clipCount: 0,
          lastClipAt: null,
          meterSource: "pre_native_estimated_post_dsp",
        },
      });
    });

    await waitFor(() => expect(page.dataset.cinemaParticles).toBe("beat"));
    expect(page.dataset.cinemaParticlesTelemetry).toBe("pcm");
    expect(page.style.getPropertyValue("--lyrics-reactive-energy")).toBe("0.680");
    expect(page.style.getPropertyValue("--lyrics-reactive-transient")).toBe("0.560");

    const css = readFileSync("src/renderer/styles/lyrics-cinema-stage.css", "utf8");
    expect(css).toContain("content-visibility: auto;");
    expect(css).toContain(".lyrics-cinema-stage-particles span");
    expect(css).toContain('data-render-pressure-reduced="true"] .lyrics-cinema-stage-particles');
    expect(css).toContain("animation: none !important;");
    expect(css).not.toContain("@keyframes");
    expect(css).not.toContain("backdrop-filter");
  });

  it("removes cinema stage particles in low-load playback mode", async () => {
    const track = makeTrack({ coverId: "cinema low load cover" });
    mockEcho(track, 0.65, {
      lyricsPageStyle: "cinemaStage",
      lowLoadPlaybackModeEnabled: true,
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findAllByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;

    expect(page.dataset.lyricsPageStyle).toBe("cinemaStage");
    expect(page.dataset.cinemaParticles).toBeUndefined();
    expect(container.querySelector(".lyrics-cinema-stage-particles")).toBeNull();
  });

  it("keeps the cut board implementation dormant while the theme is hidden", async () => {
    const track = makeTrack({ coverId: "cut board cover", album: "Test Album" });
    mockEcho(track, 0.65, {
      lyricsBackgroundMode: "theme",
      lyricsPageStyle: "cutBoard",
      lyricsHeaderHidden: true,
      lyricsWordHighlightEnabled: false,
      lyricsRomanizationEnabled: true,
      lyricsTranslationEnabled: true,
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage
            initialLyrics={[
              {
                timeMs: 0,
                text: "Memory stays in the wind",
                romanization: "kioku dake ga kaze ni nokoru",
                translation: "只有记忆留在风里",
                words: [
                  { text: "Memory ", startMs: 0, endMs: 300 },
                  { text: "stays ", startMs: 300, endMs: 600 },
                  { text: "in ", startMs: 600, endMs: 750 },
                  { text: "the ", startMs: 750, endMs: 900 },
                  { text: "wind", startMs: 900, endMs: 1200 },
                ],
              },
              { timeMs: 1400, text: "Next line" },
            ]}
            usePlayerDrawerHeader
          />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findAllByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;
    expect(page.dataset.lyricsPageStyle).toBe("default");
    expect(page.dataset.background).toBe("theme");
    expect(container.querySelectorAll(".lyrics-cut-board-slice")).toHaveLength(0);
    expect(container.querySelector('.lyrics-scroll[data-presentation-mode="cutBoard"]')).toBeNull();
    expect(container.querySelector('.lyrics-line-primary--cut-board')).toBeNull();

    const css = readFileSync("src/renderer/styles/lyrics-cut-board.css", "utf8");
    expect(css).toContain(".lyrics-line-primary--cut-board");
    expect(css).toContain('[data-panel-state="current"]');
    expect(css).toContain("animation: none !important;");
  });

  it("keeps the folded motion stage dimensional without animating the full cover bitmap", () => {
    const css = readFileSync("src/renderer/styles/lyrics-folded.css", "utf8");
    const baseCss = readFileSync("src/renderer/styles/lyrics.css", "utf8");

    expect(css).toContain("rotateX(var(--lyrics-line-rotate-x))");
    expect(css).toContain("rotateY(var(--lyrics-line-rotate-y))");
    expect(css).toContain("@keyframes lyrics-folded-line-arrive");
    expect(css).toContain("@keyframes lyrics-folded-player-arrive");
    expect(css).not.toContain("@keyframes lyrics-folded-veil-breathe");
    expect(css).toContain("content-visibility: auto;");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toMatch(/\.lyrics-backdrop::after,[\s\S]*?\.lyrics-backdrop-previous-cover \{[\s\S]*?display: none !important;[\s\S]*?background-image: none !important;/);
    expect(css).toMatch(/data-lyrics-page-style="folded"[^\n]* \.lyrics-backdrop-atmosphere \{[\s\S]*?animation: none !important;/);
    expect(css).toMatch(/\.lyrics-line \{[\s\S]*?transform: none;[\s\S]*?transform-style: flat;/);
    expect(css).not.toMatch(/transition:[^}]*text-shadow/);
    expect(css).toMatch(/\.player-bar \{[\s\S]*?backdrop-filter: none;/);
    expect(baseCss).toMatch(/\.lyrics-page\[data-background="cover"\] \.lyrics-backdrop::after \{[\s\S]*?background-image: none !important;/);
    expect(baseCss).toMatch(/\.lyrics-page\[data-background="cover"\]\[data-visual-motion="running"\] \.lyrics-backdrop-atmosphere \{[\s\S]*?animation: lyrics-backdrop-atmosphere-drift/);
    expect(baseCss).toMatch(/\.lyrics-page\[data-background="cover"\] \.lyrics-backdrop::after \{[\s\S]*?animation: none !important;/);
  });

  it("keeps folded lyrics inside a responsive safe area", () => {
    const css = readFileSync("src/renderer/styles/lyrics-folded.css", "utf8");

    expect(css).toContain("--lyrics-folded-safe-inline: clamp(64px, 8vw, 168px);");
    expect(css).toContain("padding: max(250px, calc(52vh - 118px)) var(--lyrics-folded-safe-inline)");
    expect(css).toContain("width: min(100%, 1360px);");
    expect(css).toContain("max-width: min(100%, 1180px);");
    expect(css).toContain("--lyrics-line-x: 21vw;");
    expect(css).not.toContain("--lyrics-line-x: 30vw;");
  });

  it("tints the folded cover filter from the active theme unless the theme filter is disabled", () => {
    const css = readFileSync("src/renderer/styles/lyrics-folded.css", "utf8");

    expect(css).toContain("var(--theme-accent-solid-bg, #45d8ee)");
    expect(css).toContain("var(--color-teal, #a174e5)");
    expect(css).toMatch(
      /data-lyrics-page-style="folded"\]\[data-theme-filter="false"\][^{]+\{[\s\S]*?--lyrics-folded-accent: color-mix\(in srgb, #45d8ee 76%, #dffaff\);[\s\S]*?--lyrics-folded-violet: color-mix\(in srgb, #a174e5 74%, #f1e9ff\);[\s\S]*?--lyrics-folded-deep: color-mix\(in srgb, #020912 34%, #01060c\);/,
    );
    expect(css).toMatch(
      /\.app-shell--lyrics-player-drawer:has\(\.lyrics-page\[data-lyrics-page-style="folded"\]\[data-theme-filter="false"\]\)[^{]+\{[\s\S]*?--lyrics-folded-accent: color-mix\(in srgb, #45d8ee 76%, #dffaff\);[\s\S]*?--lyrics-folded-violet: color-mix\(in srgb, #a174e5 74%, #f1e9ff\);/,
    );
    expect(css).toContain("color-mix(in srgb, var(--lyrics-folded-accent) 29%, transparent)");
    expect(css).toContain("color-mix(in srgb, var(--lyrics-folded-violet) 24%, transparent)");
    expect(css).toContain("background-blend-mode: screen, screen, multiply, normal;");
  });

  it("supports an immersive cover in the editorial layout without adding a lyrics progress control", async () => {
    const track = makeTrack({ coverId: "cover 1", album: "Test Album" });
    mockEcho(track, 0, {
      lyricsBackgroundMode: "cover",
      lyricsPageStyle: "editorial",
      lyricsImmersiveCoverStyleEnabled: true,
      lyricsImmersiveCoverGlassEnabled: true,
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} usePlayerDrawerHeader />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findAllByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;

    expect(page.dataset.lyricsPageStyle).toBe("editorial");
    expect(page.dataset.immersiveCoverStyle).toBe("true");
    expect(page.dataset.immersiveCoverGlass).toBe("true");
    expect(page.dataset.background).toBe("cover");
    expect(page.style.getPropertyValue("--lyrics-cover")).toBe(
      'url("echo-cover://large/cover%201")',
    );
    expect(container.querySelector(".lyrics-page > .lyrics-track-header-floating")).toBeNull();
    expect(
      Array.from(container.querySelectorAll(".lyrics-line-time")).map((node) => node.textContent),
    ).toEqual(["0:00", "0:10", "0:20"]);
    expect(page.querySelector(".progress-track")).toBeNull();
    expect(page.querySelector('[role="progressbar"]')).toBeNull();
    expect(page.querySelector('input[type="range"]')).toBeNull();

    const css = readFileSync("src/renderer/styles/lyrics.css", "utf8");
    expect(css).toMatch(
      /\.lyrics-page\[data-lyrics-page-style="editorial"\]\[data-view-mode="lyrics"\] \.lyrics-scroll,[\s\S]*?padding: max\(190px, calc\(50vh - 96px\)\) 0;/,
    );
    expect(css).toMatch(
      /\.app-shell--lyrics-player-drawer:has\(\.lyrics-page\[data-lyrics-page-style="editorial"\]\)[\s\S]*?\.lyrics-player-drawer-host--auto-hide:not\(\.lyrics-player-drawer-host--shortcut-toggle\) \{[\s\S]*?opacity: var\(--lyrics-mini-player-visual-opacity, 1\);[\s\S]*?transform: translate3d\(0, 0, 0\) scale\(1\);/,
    );
    expect(css).toMatch(
      /\.app-shell--lyrics-player-drawer\s+\.lyrics-page\[data-lyrics-page-style="editorial"\]\[data-view-mode="lyrics"\]\s+> \.lyrics-left-panel \{[\s\S]*?grid-template-columns: clamp\(250px, 21vw, 312px\) minmax\(0, 1fr\);[\s\S]*?grid-template-rows: minmax\(0, 1fr\);/,
    );
    expect(css).toMatch(
      /\.lyrics-page\[data-lyrics-page-style="editorial"\]\[data-immersive-cover-style="true"\]\[data-background="cover"\]\[data-view-mode="lyrics"\]:has\(\.lyrics-mv-panel\[data-mv-enabled="false"\]\) \{[\s\S]*?--lyrics-editorial-ink: #f7f9ff;[\s\S]*?background: #080b12;/,
    );
    expect(css).toContain('.lyrics-visual-settings-drawer .lyrics-page-style-select .sort-button {');
    expect(css).not.toContain('.lyrics-page-style-choice');
  });

  it("keeps the rose vinyl surface active while a track cover is unavailable", async () => {
    const track = makeTrack({
      coverId: null,
      coverThumb: null,
      embeddedCoverStatus: "missing",
    });
    mockEcho(track, 0, {
      lyricsBackgroundMode: "theme",
      lyricsPageStyle: "roseVinyl",
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findAllByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;

    expect(page.dataset.lyricsPageStyle).toBe("roseVinyl");
    expect(page.dataset.roseVinylGradient).toBe("false");
    expect(page.dataset.background).toBe("cover");
    expect(page.style.getPropertyValue("--lyrics-cover")).toBe("none");
  });

  it("keeps the music reactive lyrics visual layer disabled even if old settings enabled it", async () => {
    const track = makeTrack({ coverId: "cover 1" });
    const { emitAudioStatus } = mockEcho(track, 0, {
      lyricsBackgroundMode: "cover",
      lyricsMusicReactiveVisualsEnabled: true,
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findAllByRole("heading", { name: "Test Song" });
    act(() => {
      emitAudioStatus({
        ...makeAudioStatus(track, 12),
        audioLevels: {
          inputPeakDb: -3.8,
          inputRmsDb: -16,
          estimatedOutputPeakDb: -3.8,
          estimatedOutputRmsDb: -16,
          visualSpectrum: Array.from({ length: 32 }, (_, index) => (index % 8) / 7),
          visualSpectrumVersion: 2,
          visualEnergy: 0.68,
          visualTransient: 0.56,
          visualTelemetryState: "pcm",
          headroomDb: 3.2,
          clipCount: 0,
          lastClipAt: null,
          meterSource: "pre_native_estimated_post_dsp",
        },
      });
    });

    const page = container.querySelector(".lyrics-page") as HTMLElement;
    await waitFor(() => expect(page.dataset.background).toBe("cover"));
    expect(page.dataset.musicReactive).toBeUndefined();
    expect(page.dataset.musicReactiveTelemetry).toBeUndefined();
    expect(container.querySelector(".lyrics-music-reactive-layer")).toBeNull();
    expect(container.querySelectorAll(".lyrics-music-reactive-spectrum span")).toHaveLength(0);
    expect(page.style.getPropertyValue("--lyrics-reactive-energy")).toBe("");
    expect(page.style.getPropertyValue("--lyrics-reactive-transient")).toBe("");
  });

  it("uses the current album cover as a full-page lyrics background when immersive cover style is enabled", async () => {
    const track = makeTrack({ coverId: "cover 1" });
    mockEcho(track, 0, {
      lyricsBackgroundMode: "theme",
      lyricsImmersiveCoverStyleEnabled: true,
      lyricsSmartReadableColorsEnabled: false,
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findAllByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;

    expect(page.dataset.immersiveCoverStyle).toBe("true");
    expect(page.dataset.immersiveCoverGlass).toBeUndefined();
    expect(page.dataset.smartReadable).toBeUndefined();
    expect(page.dataset.background).toBe("cover");
    expect(page.style.getPropertyValue("--lyrics-cover")).toBe(
      'url("echo-cover://large/cover%201")',
    );
    expect(container.querySelector('.lyrics-line[data-active="true"]')?.getAttribute("data-word-highlight")).toBe("false");
    expect(container.querySelector('.lyrics-line[data-active="true"] .lyrics-word')).toBeNull();
    expect(container.querySelector(".lyrics-mv-panel")?.getAttribute("data-lyrics-readability")).toBe("true");
  });

  it("keeps immersive cover style active when the lyrics player drawer header is enabled", async () => {
    const track = makeTrack({ coverId: "cover 1" });
    mockEcho(track, 0, {
      lyricsBackgroundMode: "theme",
      lyricsImmersiveCoverStyleEnabled: true,
      lyricsSmartReadableColorsEnabled: false,
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} usePlayerDrawerHeader />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findAllByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;

    expect(page.dataset.immersiveCoverStyle).toBe("true");
    expect(page.dataset.background).toBe("cover");
    expect(page.style.getPropertyValue("--lyrics-cover")).toBe(
      'url("echo-cover://large/cover%201")',
    );
    expect(container.querySelector(".lyrics-mv-panel")?.getAttribute("data-lyrics-readability")).toBe("true");
  });

  it("adds the optional immersive cover glass layer with the configured blur", async () => {
    const track = makeTrack({ coverId: "cover 1" });
    mockEcho(track, 0, {
      lyricsBackgroundMode: "theme",
      lyricsImmersiveCoverStyleEnabled: true,
      lyricsImmersiveCoverGlassEnabled: true,
      lyricsImmersiveCoverGlassBlurPx: 24,
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findAllByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;

    expect(page.dataset.immersiveCoverStyle).toBe("true");
    expect(page.dataset.immersiveCoverGlass).toBe("true");
    expect(page.style.getPropertyValue("--lyrics-immersive-glass-blur")).toBe("24px");
  });

  it("falls back to the theme background when immersive cover style has no album artwork", async () => {
    const track = makeTrack({ coverId: null, coverThumb: null });
    mockEcho(track, 0, {
      lyricsBackgroundMode: "theme",
      lyricsImmersiveCoverStyleEnabled: true,
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;

    expect(page.dataset.immersiveCoverStyle).toBe("true");
    expect(page.dataset.background).toBe("theme");
    expect(page.style.getPropertyValue("--lyrics-cover")).toBe("none");
  });

  it("keeps the available artwork when no high-resolution source exists", async () => {
    const track = makeTrack({
      coverId: null,
      coverThumb: "https://img.example/cover-160.jpg",
    });
    mockEcho(track, 0, {
      lyricsBackgroundMode: "cover",
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;

    expect(page.dataset.background).toBe("cover");
    expect(page.style.getPropertyValue("--lyrics-cover")).toBe(
      'url("https://img.example/cover-160.jpg")',
    );
  });

  it("uses streaming remote artwork for the lyrics header and cover-following background", async () => {
    const track = makeTrack({
      mediaType: "streaming",
      provider: "netease",
      providerTrackId: "netease-track-1",
      coverId: null,
      coverThumb: "echo-image://remote/https%3A%2F%2Fp.music.126.net%2Fcover.jpg?referer=https%3A%2F%2Fmusic.163.com%2F",
    });
    mockEcho(track, 0, {
      lyricsBackgroundMode: "cover",
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;
    const coverUrl = "echo-image://remote/https%3A%2F%2Fp.music.126.net%2Fcover.jpg?referer=https%3A%2F%2Fmusic.163.com%2F";

    expect(container.querySelector(".lyrics-track-cover img")?.getAttribute("src")).toBe(coverUrl);
    expect(page.dataset.background).toBe("cover");
    expect(page.style.getPropertyValue("--lyrics-cover")).toBe(`url("${coverUrl}")`);
  });

  it("uses the upgraded streaming cover for both the visible cover and background", async () => {
    const track = makeTrack({
      mediaType: "streaming",
      provider: "netease",
      providerTrackId: "netease-track-1",
      coverId: null,
      coverThumb: "echo-image://remote/https%3A%2F%2Fp.music.126.net%2Fcover.jpg%3Fparam%3D160y160?referer=https%3A%2F%2Fmusic.163.com%2F",
    });
    mockEcho(track, 0, {
      lyricsBackgroundMode: "cover",
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;
    const upgradedCoverUrl = "echo-image://remote/https%3A%2F%2Fp.music.126.net%2Fcover.jpg?referer=https%3A%2F%2Fmusic.163.com%2F";

    expect(container.querySelector(".lyrics-track-cover img")?.getAttribute("src")).toBe(upgradedCoverUrl);
    expect(page.dataset.background).toBe("cover");
    expect(page.style.getPropertyValue("--lyrics-cover")).toBe(`url("${upgradedCoverUrl}")`);
  });

  it("uses the upgraded QQ Music cover for both the visible cover and background", async () => {
    const track = makeTrack({
      mediaType: "streaming",
      provider: "qqmusic",
      providerTrackId: "004Drt082CV5gf",
      coverId: null,
      coverThumb: "echo-image://remote/https%3A%2F%2Fy.gtimg.cn%2Fmusic%2Fphoto_new%2FT002R150x150M000004Tm0RJ36QLOF.jpg?referer=https%3A%2F%2Fy.qq.com%2F",
    });
    mockEcho(track, 0, {
      lyricsBackgroundMode: "cover",
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;
    const upgradedCoverUrl = "echo-image://remote/https%3A%2F%2Fy.gtimg.cn%2Fmusic%2Fphoto_new%2FT002R500x500M000004Tm0RJ36QLOF.jpg?referer=https%3A%2F%2Fy.qq.com%2F";

    expect(container.querySelector(".lyrics-track-cover img")?.getAttribute("src")).toBe(upgradedCoverUrl);
    expect(page.dataset.background).toBe("cover");
    expect(page.style.getPropertyValue("--lyrics-cover")).toBe(`url("${upgradedCoverUrl}")`);
  });

  it("loads lyrics through the lyrics bridge when trackId changes", async () => {
    const track = makeTrack();
    mockEcho(track);
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(
        makeTrackLyrics({
          lines: [{ timeMs: 5000, text: "Loaded from service" }],
        }),
      ),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("Loaded from service")).toBeTruthy();
    expect(window.echo.lyrics.getForTrack).toHaveBeenCalledWith("track-1");
  });

  it("does not show the network lyrics notice while local lyrics are available", async () => {
    const track = makeTrack();
    const pendingLyrics = deferred<TrackLyrics | null>();
    mockEcho(track);
    window.echo.lyrics = {
      getForTrack: vi.fn().mockReturnValue(pendingLyrics.promise),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(window.echo.lyrics.getForTrack).toHaveBeenCalledWith("track-1"));
    expect(screen.queryByText("\u6b63\u5728\u52a0\u8f7d\u6b4c\u8bcd")).toBeNull();

    await act(async () => {
      pendingLyrics.resolve(makeTrackLyrics({ provider: "local", title: "Local Lyric Title" }));
      await Promise.resolve();
    });

    await waitFor(() => expect(document.querySelector('.lyrics-line[data-lyric-index="0"]')?.textContent).toContain("First line"));
    expect(screen.queryByText("\u6b63\u5728\u52a0\u8f7d\u6b4c\u8bcd")).toBeNull();
    expect(screen.queryByText("\u5df2\u52a0\u8f7d\u6b4c\u8bcd")).toBeNull();
  });

  it("shows network matching while a remote track is waiting for lyrics", async () => {
    const track = makeTrack({
      mediaType: "remote",
      path: "subsonic:song:remote-track-1",
      sourceId: "source-1",
      stableKey: "remote-track-1",
    });
    const pendingLyrics = deferred<TrackLyrics | null>();
    mockEcho(track);
    window.echo.lyrics = {
      getForTrack: vi.fn().mockReturnValue(pendingLyrics.promise),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("正在加载歌词")).toBeTruthy();
    expect(screen.getByText("网络歌词匹配中")).toBeTruthy();

    await act(async () => {
      pendingLyrics.resolve(null);
      await Promise.resolve();
    });
  });

  it("does not replay the loaded network lyrics notice when cached network lyrics are already available", async () => {
    const track = makeTrack();
    mockEcho(track);
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(
        makeTrackLyrics({
          provider: "netease",
          title: "Cached NetEase Lyrics",
          lines: [{ timeMs: 0, text: "Cached network lyric line" }],
          syncedText: "[00:00.00]Cached network lyric line",
        }),
      ),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("Cached network lyric line")).toBeTruthy();
    expect(screen.queryByText("\u5df2\u52a0\u8f7d\u6b4c\u8bcd")).toBeNull();
    expect(screen.queryByText("\u6b63\u5728\u52a0\u8f7d\u6b4c\u8bcd")).toBeNull();
  });

  it("copies visible track info from the lyrics header context menu", async () => {
    const writeText = installClipboardTextMock();
    const track = makeTrack();
    mockEcho(track);

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("Test Song")).toBeTruthy();
    fireEvent.contextMenu(container.querySelector(".lyrics-track-copy") as HTMLElement);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Test Song\nTest Album\nTest Artist"));
    expect(await screen.findByText("已复制歌曲信息")).toBeTruthy();
  });

  it("copies the original track cover from the cover context menu", async () => {
    const track = makeTrack({ coverId: "cover-1" });
    mockEcho(track);

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("Test Song")).toBeTruthy();
    fireEvent.contextMenu(container.querySelector(".lyrics-track-cover") as HTMLElement);

    await waitFor(() => expect(window.echo.library.copyTrackOriginalCover).toHaveBeenCalledWith("track-1"));
    expect(await screen.findByText("已复制封面原图")).toBeTruthy();
  });

  it("copies the current lyric line from the lyrics context menu", async () => {
    const writeText = installClipboardTextMock();
    const track = makeTrack();
    mockEcho(track);
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(
        makeTrackLyrics({
          lines: [
            { timeMs: 0, text: "First line", romanization: "first roman", kana: "ふぁーすと" },
            lyrics[1],
            lyrics[2],
          ],
        }),
      ),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("First line")).toBeTruthy();
    fireEvent.contextMenu(container.querySelector('.lyrics-line[data-lyric-index="0"]') as HTMLElement);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("First line"));
    expect(await screen.findByText("已复制当句歌词")).toBeTruthy();
  });

  it("copies the current lyric text when kana pronunciation is enabled", async () => {
    const writeText = installClipboardTextMock();
    const track = makeTrack();
    mockEcho(track, 0, { lyricsUtatenKanaEnabled: true });
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(
        makeTrackLyrics({
          lines: [
            { timeMs: 0, text: "First line", romanization: "first roman", kana: "ふぁーすと" },
            lyrics[1],
            lyrics[2],
          ],
        }),
      ),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("First line")).toBeTruthy();
    fireEvent.contextMenu(container.querySelector('.lyrics-line[data-lyric-index="0"]') as HTMLElement);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("First line"));
  });

  it("registers per-track lyrics offset controls for the drawer instead of the main lyrics surface", async () => {
    const track = makeTrack();
    mockEcho(track);
    const drawerTools: { current: ReactNode | null } = { current: null };
    const handleDrawerTools = (event: Event): void => {
      drawerTools.current = (event as CustomEvent<{ currentTrackTools: ReactNode | null }>).detail.currentTrackTools;
    };
    window.addEventListener("app:lyrics-drawer-tools-changed", handleDrawerTools);
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(
        makeTrackLyrics({
          lines: lyrics,
          offsetMs: 0,
        }),
      ),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    try {
      const { container } = render(
        <PlaybackQueueProvider>
          <QueueSeed track={track}>
            <LyricsPage />
          </QueueSeed>
        </PlaybackQueueProvider>,
      );

      expect(await screen.findByText("First line")).toBeTruthy();
      expect(container.querySelector(".lyrics-offset-controls")).toBeNull();
      await waitFor(() => expect(drawerTools.current).toBeTruthy());

      const drawerRender = render(<>{drawerTools.current}</>);
      expect(drawerRender.container.querySelector(".lyrics-offset-controls")).toBeTruthy();
      expect(drawerRender.getByText("本歌曲延迟")).toBeTruthy();
      expect(drawerRender.getByText("只保存到当前歌曲；切到下一首会使用下一首自己的延迟。")).toBeTruthy();
    } finally {
      window.removeEventListener("app:lyrics-drawer-tools-changed", handleDrawerTools);
    }
  });

  it("hides smart lyrics alignment when disabled", async () => {
    const track = makeTrack();
    mockEcho(track, 0, { lyricsSmartAlignmentEnabled: false });
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(makeTrackLyrics()),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("First line")).toBeTruthy();
    expect(container.querySelector(".lyrics-smart-alignment")).toBeNull();
  });

  it("keeps smart lyrics alignment controls hidden unless per-track offset controls are enabled", async () => {
    const track = makeTrack();
    mockEcho(track, 0, { lyricsSmartAlignmentEnabled: true, lyricsOffsetControlsEnabled: false });
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(makeTrackLyrics()),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("First line")).toBeTruthy();
    expect(container.querySelector(".lyrics-smart-alignment")).toBeNull();
  });

  it("saves per-track lyrics offset from the drawer controls when enabled", async () => {
    const track = makeTrack();
    mockEcho(track, 0, { lyricsOffsetControlsEnabled: true });
    const drawerTools: { current: ReactNode | null } = { current: null };
    const handleDrawerTools = (event: Event): void => {
      drawerTools.current = (event as CustomEvent<{ currentTrackTools: ReactNode | null }>).detail.currentTrackTools;
    };
    window.addEventListener("app:lyrics-drawer-tools-changed", handleDrawerTools);
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(
        makeTrackLyrics({
          lines: lyrics,
          offsetMs: 0,
        }),
      ),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn().mockResolvedValue(
        makeTrackLyrics({
          lines: lyrics,
          offsetMs: 100,
        }),
      ),
      clearCache: vi.fn(),
    };

    try {
      render(
        <PlaybackQueueProvider>
          <QueueSeed track={track}>
            <LyricsPage />
          </QueueSeed>
        </PlaybackQueueProvider>,
      );

      expect(await screen.findByText("First line")).toBeTruthy();
      await waitFor(() => expect(drawerTools.current).toBeTruthy());
      const drawerRender = render(<>{drawerTools.current}</>);
      fireEvent.click(drawerRender.getByRole("button", { name: /\+100ms/ }));

      await waitFor(() =>
        expect(window.echo.lyrics.setOffset).toHaveBeenCalledWith("track-1", 100),
      );
    } finally {
      window.removeEventListener("app:lyrics-drawer-tools-changed", handleDrawerTools);
    }
  });

  it.each([
    ["exclusive"],
  ] as const)("auto-saves smart lyrics alignment from stable anchors on %s clocks", async (outputMode) => {
    const track = makeTrack();
    const { emitAudioStatus } = mockEcho(track, 10.2, { lyricsSmartAlignmentEnabled: true });
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(makeTrackLyrics()),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn().mockResolvedValue(makeTrackLyrics({ offsetMs: -200 })),
      clearCache: vi.fn(),
    };

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("Second line")).toBeTruthy();
    act(() => {
      emitAudioStatus({
        ...makeAudioStatus(track, 10.2),
        outputMode,
        outputBackend: "wasapi-exclusive",
      });
    });

    const startButton = await screen.findByRole("button", { name: /重新检测/ });
    await waitFor(() => expect((startButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(startButton);
    fireEvent.click(screen.getByRole("button", { name: /标记当前句/ }));
    act(() => {
      emitAudioStatus({
        ...makeAudioStatus(track, 20.2),
        outputMode,
        outputBackend: "wasapi-exclusive",
      });
    });
    fireEvent.click(screen.getByRole("button", { name: /标记当前句/ }));

    await waitFor(() =>
      expect(window.echo.lyrics.setOffset).toHaveBeenCalledWith("track-1", -200),
    );
    expect(await screen.findByText("已自动校准 -200ms")).toBeTruthy();
  });

  it("auto-saves high-confidence candidate timeline alignment", async () => {
    const track = makeTrack();
    mockEcho(track, 10.2, { lyricsSmartAlignmentEnabled: true });
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(makeTrackLyrics()),
      getStoredCandidates: vi.fn().mockResolvedValue([makeLyricsCandidate({ id: "candidate-shifted", providerLyricsId: "shifted" })]),
      searchCandidates: vi.fn().mockResolvedValue([]),
      previewCandidate: vi.fn().mockResolvedValue(
        makeTrackLyrics({
          id: "preview-1",
          providerLyricsId: "shifted",
          lines: [
            { timeMs: 200, text: "First line" },
            { timeMs: 10200, text: "Second line" },
            { timeMs: 20200, text: "Third line" },
          ],
        }),
      ),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi
        .fn()
        .mockResolvedValueOnce(makeTrackLyrics({ offsetMs: -200 }))
        .mockResolvedValueOnce(makeTrackLyrics({ offsetMs: 0 })),
      clearCache: vi.fn(),
    };

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );
    expect(await screen.findByText("Second line")).toBeTruthy();

    await waitFor(() =>
      expect(window.echo.lyrics.previewCandidate).toHaveBeenCalledWith("track-1", "candidate-shifted"),
    );
    await waitFor(() =>
      expect(window.echo.lyrics.setOffset).toHaveBeenCalledWith("track-1", -200),
    );
  });

  it("auto-saves high-confidence candidate timeline alignment in the background", async () => {
    const track = makeTrack();
    mockEcho(track, 10.2, { lyricsSmartAlignmentEnabled: true });
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(makeTrackLyrics()),
      getStoredCandidates: vi.fn().mockResolvedValue([makeLyricsCandidate({ id: "candidate-shifted", providerLyricsId: "shifted" })]),
      searchCandidates: vi.fn().mockResolvedValue([]),
      previewCandidate: vi.fn().mockResolvedValue(
        makeTrackLyrics({
          id: "preview-1",
          providerLyricsId: "shifted",
          lines: [
            { timeMs: 200, text: "First line" },
            { timeMs: 10200, text: "Second line" },
            { timeMs: 20200, text: "Third line" },
          ],
        }),
      ),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn().mockResolvedValue(makeTrackLyrics({ offsetMs: -200 })),
      clearCache: vi.fn(),
    };

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("Second line")).toBeTruthy();
    await waitFor(() =>
      expect(window.echo.lyrics.getStoredCandidates).toHaveBeenCalledWith("track-1", 180),
    );
    await waitFor(() =>
      expect(window.echo.lyrics.previewCandidate).toHaveBeenCalledWith("track-1", "candidate-shifted"),
    );
    await waitFor(() =>
      expect(window.echo.lyrics.setOffset).toHaveBeenCalledWith("track-1", -200),
    );
  });

  it("does not auto-open the smart alignment candidate panel when auto-open is disabled", async () => {
    const track = makeTrack();
    const driftedLines = [
      { timeMs: 0, text: "First line" },
      { timeMs: 30000, text: "Second line" },
      { timeMs: 60000, text: "Third line" },
    ];
    mockEcho(track, 10.2, {
      lyricsSmartAlignmentEnabled: true,
      lyricsCandidatePanelAutoOpenEnabled: false,
    });
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(makeTrackLyrics({ lines: driftedLines })),
      getStoredCandidates: vi.fn().mockResolvedValue([
        makeLyricsCandidate({
          id: "candidate-drifted",
          title: "Drifted candidate",
          risk: "high",
          confidence: "blocked",
          autoAcceptEligible: false,
          score: 0.95,
        }),
      ]),
      searchCandidates: vi.fn().mockResolvedValue([]),
      previewCandidate: vi.fn().mockResolvedValue(
        makeTrackLyrics({
          id: "preview-drifted",
          providerLyricsId: "candidate-drifted",
          lines: [
            { timeMs: 100, text: "First line" },
            { timeMs: 30300, text: "Second line" },
            { timeMs: 60850, text: "Third line" },
          ],
        }),
      ),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("Second line")).toBeTruthy();
    await waitFor(() =>
      expect(window.echo.lyrics.previewCandidate).toHaveBeenCalledWith("track-1", "candidate-drifted"),
    );
    await waitFor(() => expect(container.querySelector(".lyrics-match-panel")).toBeNull());
    expect(window.echo.lyrics.applyCandidate).not.toHaveBeenCalled();
  });

  it("smoke-tests smart lyrics alignment auto-save, undo, and source reset", async () => {
    const track = makeTrack();
    const { emitAudioStatus } = mockEcho(track, 10.2, { lyricsSmartAlignmentEnabled: true });
    const rematchedLines = [
      { timeMs: 0, text: "Replacement first" },
      { timeMs: 10000, text: "Replacement second" },
      { timeMs: 20000, text: "Replacement third" },
    ];
    const rematchedLyrics = makeTrackLyrics({
      id: "lyrics-rematched",
      providerLyricsId: "source-2",
      lines: rematchedLines,
      plainText: "Replacement first\nReplacement second\nReplacement third",
      syncedText:
        "[00:00.00]Replacement first\n[00:10.00]Replacement second\n[00:20.00]Replacement third",
      offsetMs: 0,
    });
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(makeTrackLyrics()),
      searchCandidates: vi.fn().mockResolvedValue([makeLyricsCandidate({ id: "candidate-shifted", providerLyricsId: "shifted" })]),
      previewCandidate: vi.fn().mockResolvedValue(
        makeTrackLyrics({
          id: "preview-1",
          providerLyricsId: "shifted",
          lines: [
            { timeMs: 200, text: "First line" },
            { timeMs: 10200, text: "Second line" },
            { timeMs: 20200, text: "Third line" },
          ],
        }),
      ),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi
        .fn()
        .mockResolvedValueOnce(makeTrackLyrics({ offsetMs: -200 }))
        .mockResolvedValueOnce(makeTrackLyrics({ offsetMs: 0 }))
        .mockResolvedValueOnce(makeTrackLyrics({
          providerLyricsId: "source-2",
          lines: rematchedLines,
          plainText: rematchedLyrics.plainText,
          syncedText: rematchedLyrics.syncedText,
          offsetMs: -150,
        })),
      clearCache: vi.fn(),
    };

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("Second line")).toBeTruthy();
    window.dispatchEvent(new Event("lyrics:search-requested"));

    await waitFor(() =>
      expect(window.echo.lyrics.setOffset).toHaveBeenCalledWith("track-1", -200),
    );
    expect(await screen.findByText("已自动校准 -200ms")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /撤销/ }));
    await waitFor(() =>
      expect(window.echo.lyrics.setOffset).toHaveBeenLastCalledWith("track-1", 0),
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent("lyrics:candidate-applied", {
          detail: {
            trackId: "track-1",
            lyrics: rematchedLyrics,
          },
        }),
      );
    });

    expect(await screen.findByText("Replacement second")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("已自动校准 -200ms")).toBeNull());

    act(() => {
      emitAudioStatus(makeAudioStatus(track, 10.15));
    });
    fireEvent.click(screen.getByRole("button", { name: /重新检测/ }));
    fireEvent.click(screen.getByRole("button", { name: /标记当前句/ }));
    act(() => {
      emitAudioStatus(makeAudioStatus(track, 20.15));
    });
    fireEvent.click(screen.getByRole("button", { name: /标记当前句/ }));

    await waitFor(() =>
      expect(window.echo.lyrics.setOffset).toHaveBeenLastCalledWith("track-1", -150),
    );
    expect(await screen.findByText("已自动校准 -150ms")).toBeTruthy();
  });

  it("supports smart lyrics alignment on the system output clock", async () => {
    const track = makeTrack();
    const { emitAudioStatus } = mockEcho(track, 10.2, { lyricsSmartAlignmentEnabled: true });
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(makeTrackLyrics()),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn().mockResolvedValue(makeTrackLyrics({ offsetMs: -200 })),
      clearCache: vi.fn(),
    };

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("Second line")).toBeTruthy();
    act(() => {
      emitAudioStatus({ ...makeAudioStatus(track, 10.2), outputMode: "system" });
    });

    const startButton = await screen.findByRole("button", { name: /重新检测/ });
    await waitFor(() => expect((startButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(startButton);
    fireEvent.click(screen.getByRole("button", { name: /标记当前句/ }));
    act(() => {
      emitAudioStatus({ ...makeAudioStatus(track, 20.2), outputMode: "system" });
    });
    fireEvent.click(screen.getByRole("button", { name: /标记当前句/ }));

    await waitFor(() =>
      expect(window.echo.lyrics.setOffset).toHaveBeenCalledWith("track-1", -200),
    );
  });

  it("does not auto-save low-confidence smart lyrics alignment", async () => {
    const track = makeTrack();
    const { emitAudioStatus } = mockEcho(track, 10.2, { lyricsSmartAlignmentEnabled: true });
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(makeTrackLyrics()),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("Second line")).toBeTruthy();
    const startButton = await screen.findByRole("button", { name: /重新检测/ });
    fireEvent.click(startButton);
    fireEvent.click(screen.getByRole("button", { name: /标记当前句/ }));

    act(() => {
      emitAudioStatus(makeAudioStatus(track, 11.4));
    });
    fireEvent.click(screen.getByRole("button", { name: /标记当前句/ }));

    expect(await screen.findByText(/校准证据分散 600ms/)).toBeTruthy();
    expect(window.echo.lyrics.setOffset).not.toHaveBeenCalled();
  });

  it("auto-applies a safe candidate when the current lyrics timeline drifts", async () => {
    const track = makeTrack();
    mockEcho(track, 10.2, { lyricsSmartAlignmentEnabled: true });
    const driftedLines = [
      { timeMs: 0, text: "First line" },
      { timeMs: 30000, text: "Second line" },
      { timeMs: 60000, text: "Third line" },
    ];
    const replacementLyrics = makeTrackLyrics({
      id: "lyrics-drift-fixed",
      providerLyricsId: "candidate-drifted",
      lines: [
        { timeMs: 100, text: "First line" },
        { timeMs: 30300, text: "Second line" },
        { timeMs: 60850, text: "Third line" },
      ],
      syncedText:
        "[00:00.10]First line\n[00:30.30]Second line\n[01:00.85]Third line",
      plainText: "First line\nSecond line\nThird line",
    });
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(makeTrackLyrics({ lines: driftedLines })),
      searchCandidates: vi.fn().mockResolvedValue([makeLyricsCandidate({ id: "candidate-drifted" })]),
      previewCandidate: vi.fn().mockResolvedValue(replacementLyrics),
      applyCandidate: vi.fn().mockResolvedValue(replacementLyrics),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );
    expect(await screen.findByText("Second line")).toBeTruthy();
    window.dispatchEvent(new Event("lyrics:search-requested"));

    await waitFor(() =>
      expect(window.echo.lyrics.previewCandidate).toHaveBeenCalledWith("track-1", "candidate-drifted"),
    );
    await waitFor(() =>
      expect(window.echo.lyrics.applyCandidate).toHaveBeenCalledWith("track-1", "candidate-drifted", "auto"),
    );
    expect(window.echo.lyrics.setOffset).not.toHaveBeenCalled();
  });

  it("aligns the current synced lyric line to the playback clock", async () => {
    const track = makeTrack();
    mockEcho(track, 9.2, {
      lyricsGlobalSyncOffsetMs: 1000,
      lyricsOffsetControlsEnabled: true,
    });
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(
        makeTrackLyrics({
          lines: lyrics,
          offsetMs: 0,
        }),
      ),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn().mockResolvedValue(
        makeTrackLyrics({
          lines: lyrics,
          offsetMs: -200,
        }),
      ),
      clearCache: vi.fn(),
    };

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("Second line")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /对齐当前句/ }));

    await waitFor(() =>
      expect(window.echo.lyrics.setOffset).toHaveBeenCalledWith("track-1", -200),
    );
  });

  it("updates when the current track is marked as instrumental from lyrics settings", async () => {
    const track = makeTrack();
    mockEcho(track, 0, {
      lyricsCandidatePanelAutoOpenEnabled: true,
      lyricsEmptyStateHidden: false,
    });
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(null),
      searchCandidates: vi.fn().mockResolvedValue([
        makeLyricsCandidate({
          id: "candidate-1",
          score: 0.12,
          risk: "high",
          reasons: ["title_exact", "artist_exact", "candidate_only_duration"],
        }),
      ]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn().mockResolvedValue(
        makeTrackLyrics({
          kind: "instrumental",
          lines: [],
          plainText: null,
          syncedText: null,
        }),
      ),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(container.querySelector(".lyrics-candidate-list")).toBeTruthy());
    expect(container.querySelector(".lyrics-source-quality")?.textContent).toContain("LRCLIB");
    expect(container.querySelector(".lyrics-source-quality")?.textContent).toContain("近期");
    expect(container.querySelectorAll(".lyrics-reason-badge").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/应用前先看首句和进度是否对齐/u)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "标记为纯音乐" })).toBeNull();

    act(() => {
      window.dispatchEvent(
        new CustomEvent("lyrics:candidate-applied", {
          detail: {
            trackId: "track-1",
            lyrics: makeTrackLyrics({
              kind: "instrumental",
              lines: [],
              plainText: null,
              syncedText: null,
            }),
          },
        }),
      );
    });

    expect(window.echo.lyrics.markInstrumental).not.toHaveBeenCalled();
    await waitFor(() => expect(container.querySelector(".lyrics-candidate-list")).toBeNull());
  });

  it("does not re-apply stored candidates after the main lyrics lookup finishes", async () => {
    const track = makeTrack();
    mockEcho(track, 0, { lyricsCandidatePanelAutoOpenEnabled: true });
    const storedCandidate = makeLyricsCandidate({ id: "candidate-97", score: 0.97 });
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(null),
      getStoredCandidates: vi.fn().mockResolvedValue([storedCandidate]),
      searchCandidates: vi.fn().mockResolvedValue([storedCandidate]),
      applyCandidate: vi.fn().mockResolvedValue(
        makeTrackLyrics({
          lines: [{ timeMs: 0, text: "Auto applied line" }],
          syncedText: "[00:00.00]Auto applied line",
          plainText: "Auto applied line",
        }),
      ),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("使用此歌词")).toBeTruthy();
    expect(window.echo.lyrics.getStoredCandidates).toHaveBeenCalledWith("track-1", 180);
    expect(window.echo.lyrics.searchCandidates).not.toHaveBeenCalled();
    expect(window.echo.lyrics.applyCandidate).not.toHaveBeenCalled();
  });

  it("keeps the initial automatic lyrics lookup panel hidden while it is loading", async () => {
    const track = makeTrack();
    const pendingLyrics = deferred<TrackLyrics | null>();
    mockEcho(track);
    window.echo.lyrics = {
      getForTrack: vi.fn().mockReturnValue(pendingLyrics.promise),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(window.echo.lyrics.getForTrack).toHaveBeenCalledWith("track-1"));
    expect(container.querySelector(".lyrics-match-panel")).toBeNull();

    pendingLyrics.resolve(makeTrackLyrics());
  });

  it("keeps the automatic lyrics candidate panel hidden unless auto-open is enabled", async () => {
    const track = makeTrack();
    mockEcho(track);
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(null),
      getStoredCandidates: vi.fn().mockResolvedValue([
        makeLyricsCandidate({ id: "candidate-low-score", score: 0.42, confidence: "blocked", autoAcceptEligible: false }),
      ]),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(window.echo.lyrics.getStoredCandidates).toHaveBeenCalledWith("track-1", 180));
    expect(container.querySelector(".lyrics-match-panel")).toBeNull();
    expect(window.echo.lyrics.searchCandidates).not.toHaveBeenCalled();
    expect(window.echo.lyrics.applyCandidate).not.toHaveBeenCalled();
  });

  it("limits automatic missing-lyrics search fan-out while keeping manual search complete", async () => {
    const track = makeTrack();
    mockEcho(track, 0, { lyricsCandidatePanelAutoOpenEnabled: true });
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(null),
      getStoredCandidates: vi.fn().mockResolvedValue([]),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(window.echo.lyrics.getStoredCandidates).toHaveBeenCalledWith("track-1", 180));
    expect(window.echo.lyrics.searchCandidates).not.toHaveBeenCalled();

    vi.mocked(window.echo.lyrics.searchCandidates).mockClear();
    window.dispatchEvent(new Event("lyrics:search-requested"));

    await waitFor(() =>
      expect(window.echo.lyrics.searchCandidates).toHaveBeenCalledWith(
        "track-1",
        undefined,
        "lrclib",
        "manual",
      ),
    );
    expect(window.echo.lyrics.searchCandidates).toHaveBeenCalledWith(
      "track-1",
      undefined,
      "netease",
      "manual",
    );
    expect(window.echo.lyrics.searchCandidates).toHaveBeenCalledWith(
      "track-1",
      undefined,
      "qqmusic",
      "manual",
    );
  });

  it("pauses automatic missing-lyrics candidate search under exclusive underrun pressure but keeps manual search available", async () => {
    const track = makeTrack();
    const pendingLyrics = deferred<TrackLyrics | null>();
    const { emitAudioStatus } = mockEcho(track, 0, { lyricsEmptyStateHidden: false });
    window.echo.lyrics = {
      getForTrack: vi.fn().mockReturnValue(pendingLyrics.promise),
      searchCandidates: vi.fn().mockResolvedValue([
        makeLyricsCandidate({ id: "manual-candidate", score: 0.42 }),
      ]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(window.echo.lyrics.getForTrack).toHaveBeenCalledWith("track-1"));
    act(() => {
      emitAudioStatus({
        ...makeAudioStatus(track, 10),
        outputMode: "exclusive",
        nativeBufferedMs: 0,
        nativeUnderrunCallbacks: 8,
      });
    });
    pendingLyrics.resolve(null);

    await waitFor(() => expect(screen.getByText("暂无歌词")).toBeTruthy());
    expect(window.echo.lyrics.searchCandidates).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("lyrics:search-requested"));

    await waitFor(() =>
      expect(window.echo.lyrics.searchCandidates).toHaveBeenCalledWith("track-1", undefined, "lrclib", "manual"),
    );
  });

  it("closes an open automatic lyrics candidate panel when auto-open is disabled", async () => {
    const track = makeTrack();
    mockEcho(track, 0, { lyricsCandidatePanelAutoOpenEnabled: true });
    const setSettings = vi.fn().mockResolvedValue(
      makeAppSettings({ lyricsCandidatePanelAutoOpenEnabled: false }),
    );
    window.echo.app.setSettings = setSettings;
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(null),
      getStoredCandidates: vi.fn().mockResolvedValue([
        makeLyricsCandidate({ id: "candidate-low-score", score: 0.42, confidence: "blocked", autoAcceptEligible: false }),
      ]),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(container.querySelector(".lyrics-match-panel")).toBeTruthy());
    const autoOpenToggle = container.querySelector<HTMLInputElement>(".lyrics-match-auto-open input");
    expect(autoOpenToggle?.checked).toBe(true);

    fireEvent.click(autoOpenToggle!);

    await waitFor(() => expect(container.querySelector(".lyrics-match-panel")).toBeNull());
    expect(setSettings).toHaveBeenCalledWith({ lyricsCandidatePanelAutoOpenEnabled: false });
  });

  it("keeps an automatic lyrics candidate panel closed after the close button is clicked", async () => {
    const track = makeTrack();
    mockEcho(track, 0, { lyricsCandidatePanelAutoOpenEnabled: true });
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(null),
      getStoredCandidates: vi.fn().mockResolvedValue([
        makeLyricsCandidate({ id: "candidate-low-score", score: 0.42, confidence: "blocked", autoAcceptEligible: false }),
      ]),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(container.querySelector(".lyrics-match-panel")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Close lyrics candidates" }));

    await waitFor(() => expect(container.querySelector(".lyrics-match-panel")).toBeNull());
    act(() => {
      window.dispatchEvent(new CustomEvent("lyrics:display-settings-changed", {
        detail: { lyricsCandidatePanelAutoOpenEnabled: true },
      }));
    });
    expect(container.querySelector(".lyrics-match-panel")).toBeNull();
  });

  it("uses current track metadata when a lyrics candidate has no visible title or artist", async () => {
    const track = makeTrack({
      title: "Nobody Sleeps",
      artist: "Figure Classic",
      album: "Sleepless Cover",
      duration: 234,
    });
    const echo = mockEcho(track, 0, { lyricsCandidatePanelAutoOpenEnabled: true });
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(null),
      getStoredCandidates: vi.fn().mockResolvedValue([
        makeLyricsCandidate({
          id: "candidate-empty-instrumental",
          provider: "netease",
          sourceLabel: "NetEase",
          title: "",
          artist: "",
          album: null,
          durationSeconds: null,
          instrumental: true,
          hasSynced: false,
          hasPlain: false,
          score: 0.15,
          risk: "medium",
          confidence: "blocked",
          autoAcceptEligible: false,
        }),
      ]),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    const { container, rerender } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(container.querySelector(".lyrics-match-panel")).toBeTruthy());
    expect(container.querySelector(".lyrics-candidate-list")?.textContent).toContain("Nobody Sleeps");
    expect(container.querySelector(".lyrics-candidate-list")?.textContent).toContain("Figure Classic");
    const candidateCard = container.querySelector(".lyrics-candidate");
    const candidateFooter = candidateCard?.querySelector(":scope > .lyrics-candidate-footer");
    const candidateNextStep = candidateFooter?.querySelector(":scope > .lyrics-candidate-next-step");
    const candidateActions = candidateFooter?.querySelector(":scope > .lyrics-candidate-actions");
    expect(candidateCard?.querySelector(".lyrics-candidate-badges .lyrics-candidate-next-step")).toBeNull();
    expect(candidateFooter).toBeTruthy();
    expect(candidateNextStep).toBeTruthy();
    expect(candidateActions).toBeTruthy();
    expect(candidateNextStep!.compareDocumentPosition(candidateActions!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const nextTrack = makeTrack({
      id: "track-next",
      path: "C:\\Music\\track-next.flac",
      title: "Next Song",
      artist: "Next Artist",
      album: "Next Album",
      duration: 321,
    });
    rerender(
      <PlaybackQueueProvider>
        <QueueSeed track={nextTrack}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );
    act(() => echo.emitAudioStatus(makeAudioStatus(nextTrack, 0)));

    await waitFor(() => {
      const candidateText = container.querySelector(".lyrics-candidate-list")?.textContent ?? "";
      const currentTrackText = container.querySelector(".lyrics-match-current")?.textContent ?? "";
      expect(candidateText).toContain("Next Song");
      expect(candidateText).toContain("Next Artist");
      expect(candidateText).toContain("候选时长 未知");
      expect(currentTrackText).toContain("5:21");
      expect(candidateText).not.toContain("Nobody Sleeps");
    });
  });

  it("does not auto-apply medium risk candidates", async () => {
    const track = makeTrack();
    mockEcho(track, 0, { lyricsCandidatePanelAutoOpenEnabled: true });
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(null),
      getStoredCandidates: vi.fn().mockResolvedValue([
        makeLyricsCandidate({ id: "candidate-medium", score: 0.97, risk: "medium", confidence: "blocked", autoAcceptEligible: false }),
      ]),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(window.echo.lyrics.getStoredCandidates).toHaveBeenCalledWith("track-1", 180));
    expect(window.echo.lyrics.applyCandidate).not.toHaveBeenCalled();
    expect(container.querySelector(".lyrics-risk-badge--medium")).toBeTruthy();
  });

  it("requires two clicks before applying a high-risk duration mismatch", async () => {
    const track = makeTrack();
    mockEcho(track, 0, { lyricsAutoAcceptScore: 0.56 });
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(null),
      getStoredCandidates: vi.fn().mockResolvedValue([
        makeLyricsCandidate({
          id: "candidate-duration-mismatch",
          score: 0.7,
          risk: "high",
          confidence: "blocked",
          autoAcceptEligible: false,
          durationDeltaSeconds: 45,
          reasons: ["title_exact", "artist_exact", "duration_mismatch"],
          titleScore: 1,
          artistScore: 1,
          durationScore: 0.04,
        }),
      ]),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn().mockResolvedValue(
        makeTrackLyrics({
          lines: [{ timeMs: 0, text: "Duration mismatch auto applied" }],
          syncedText: "[00:00.00]Duration mismatch auto applied",
          plainText: "Duration mismatch auto applied",
        }),
      ),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "使用此歌词" }));
    expect(window.echo.lyrics.applyCandidate).not.toHaveBeenCalled();
    expect(await screen.findByText(/时长差异/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "确认使用高风险歌词" }));
    expect(await screen.findByText("Duration mismatch auto applied")).toBeTruthy();
    expect(window.echo.lyrics.applyCandidate).toHaveBeenCalledWith(
      "track-1",
      "candidate-duration-mismatch",
    );
  });

  it("shows high-confidence candidates without applying when lyrics auto-apply is disabled", async () => {
    const track = makeTrack();
    mockEcho(track, 0, {
      lyricsAutoAcceptScore: 0.56,
      lyricsAutoApplyEnabled: false,
      lyricsCandidatePanelAutoOpenEnabled: true,
    });
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(null),
      getStoredCandidates: vi.fn().mockResolvedValue([
        makeLyricsCandidate({
          id: "candidate-duration-mismatch",
          title: "Candidate Song",
          score: 0.9,
          risk: "low",
          reasons: ["title_exact", "artist_exact", "duration_close"],
          titleScore: 1,
          artistScore: 1,
        }),
      ]),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("Candidate Song")).toBeTruthy();
    expect(window.echo.lyrics.applyCandidate).not.toHaveBeenCalled();
  });

  it("allows manually applying candidates below the auto-apply threshold", async () => {
    const track = makeTrack();
    mockEcho(track, 0, { lyricsCandidatePanelAutoOpenEnabled: true });
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(null),
      getStoredCandidates: vi.fn().mockResolvedValue([
        makeLyricsCandidate({ id: "candidate-low-score", score: 0.42, confidence: "blocked", autoAcceptEligible: false }),
      ]),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn().mockResolvedValue(
        makeTrackLyrics({
          lines: [{ timeMs: 0, text: "Manually selected line" }],
          syncedText: "[00:00.00]Manually selected line",
          plainText: "Manually selected line",
        }),
      ),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(container.querySelector(".lyrics-candidate")).toBeTruthy());
    expect(window.echo.lyrics.applyCandidate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "使用此歌词" }));
    fireEvent.click(screen.getByRole("button", { name: "确认使用高风险歌词" }));

    await waitFor(() =>
      expect(window.echo.lyrics.applyCandidate).toHaveBeenCalledWith(
        "track-1",
        "candidate-low-score",
      ),
    );
    expect(await screen.findByText("Manually selected line")).toBeTruthy();
  });

  it("keeps newer page search results when a previous candidate apply finishes late", async () => {
    const track = makeTrack();
    const pendingApply = deferred<TrackLyrics>();
    mockEcho(track, 0, { lyricsCandidatePanelAutoOpenEnabled: true });
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(null),
      getStoredCandidates: vi.fn().mockResolvedValue([
        makeLyricsCandidate({ id: "old-local", title: "Old Page Result", score: 0.42 }),
      ]),
      searchCandidates: vi.fn().mockImplementation(
        (_trackId: string, searchText: string | undefined, provider: string) => Promise.resolve([
          makeLyricsCandidate({
            id: searchText === "fresh query" ? `fresh-${provider}` : `old-${provider}`,
            title: searchText === "fresh query" ? "Fresh Page Result" : "Old Page Result",
            score: 0.42,
          }),
        ]),
      ),
      applyCandidate: vi.fn().mockReturnValue(pendingApply.promise),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByText("Old Page Result");
    fireEvent.click(screen.getByRole("button", { name: "使用此歌词" }));

    window.dispatchEvent(new CustomEvent("lyrics:search-requested", { detail: { query: "fresh query" } }));
    expect(await screen.findByText("Fresh Page Result")).toBeTruthy();

    await act(async () => {
      pendingApply.resolve(makeTrackLyrics({ title: "Applied Late Page Result" }));
      await pendingApply.promise;
    });

    expect(container.querySelector(".lyrics-candidate-list")?.textContent).toContain("Fresh Page Result");
    expect(container.querySelector(".lyrics-candidate-list")?.textContent).not.toContain("Old Page Result");
  });

  it("keeps the lyrics candidate panel open until the user closes it", async () => {
    const track = makeTrack();
    mockEcho(track, 0, { lyricsCandidatePanelAutoOpenEnabled: true });
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(null),
      getStoredCandidates: vi.fn().mockResolvedValue([
        makeLyricsCandidate({ id: "candidate-low-score", score: 0.42, confidence: "blocked", autoAcceptEligible: false }),
      ]),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(container.querySelector(".lyrics-match-panel")).toBeTruthy());
    vi.useFakeTimers();
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(container.querySelector(".lyrics-match-panel")).toBeTruthy();
  });

  it("auto-applies a high scoring candidate after rematching lyrics", async () => {
    const track = makeTrack();
    mockEcho(track);
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(
        makeTrackLyrics({
          lines: [{ timeMs: 0, text: "Current line" }],
          syncedText: "[00:00.00]Current line",
          plainText: "Current line",
        }),
      ),
      searchCandidates: vi.fn().mockResolvedValue([
        makeLyricsCandidate({ id: "candidate-94", score: 0.94 }),
      ]),
      applyCandidate: vi.fn().mockResolvedValue(
        makeTrackLyrics({
          lines: [{ timeMs: 0, text: "Rematched applied line" }],
          syncedText: "[00:00.00]Rematched applied line",
          plainText: "Rematched applied line",
        }),
      ),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn().mockResolvedValue(undefined),
    };

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("Current line")).toBeTruthy();
    window.dispatchEvent(new Event("lyrics:rematch-requested"));

    expect(await screen.findByText("Rematched applied line")).toBeTruthy();
    expect(window.echo.lyrics.clearCache).toHaveBeenCalledWith("track-1");
    expect(window.echo.lyrics.applyCandidate).toHaveBeenCalledWith(
      "track-1",
      "candidate-94",
      "auto",
    );
  });

  it("shows a safe late provider result as soon as the main process auto-applies it", async () => {
    const track = makeTrack();
    mockEcho(track);
    let lyricsChangedHandler:
      | ((trackId: string, reason?: "manual" | "auto-apply") => void)
      | null = null;
    const getForTrack = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValue(
        makeTrackLyrics({
          providerLyricsId: "late-safe",
          lines: [{ timeMs: 0, text: "Late provider line" }],
          syncedText: "[00:00.00]Late provider line",
          plainText: "Late provider line",
        }),
      );
    window.echo.lyrics = {
      getForTrack,
      getStoredCandidates: vi.fn().mockResolvedValue([]),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
      onChanged: vi.fn((handler) => {
        lyricsChangedHandler = handler;
        return () => {
          lyricsChangedHandler = null;
        };
      }),
    };

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(window.echo.lyrics.getStoredCandidates).toHaveBeenCalled());
    act(() => {
      lyricsChangedHandler?.("track-1", "auto-apply");
    });

    expect(await screen.findByText("Late provider line")).toBeTruthy();
    expect(getForTrack).toHaveBeenCalledTimes(2);
    expect(window.echo.lyrics.applyCandidate).not.toHaveBeenCalled();
  });

  it("clears the previous lyrics immediately when the track changes", async () => {
    const firstTrack = makeTrack({
      id: "track-1",
      title: "First Song",
      path: "D:\\Music\\first.flac",
    });
    const secondTrack = makeTrack({
      id: "track-2",
      title: "Second Song",
      path: "D:\\Music\\second.flac",
    });
    let activeTrack = firstTrack;
    let resolveSecondLyrics: (value: TrackLyrics | null) => void = () => undefined;

    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue(makeAppSettings()),
        setSettings: vi.fn(),
        chooseLyricsWallpaper: vi.fn(),
      },
      playback: {
        getStatus: vi.fn().mockImplementation(() =>
          Promise.resolve({
            state: "playing",
            currentTrackId: activeTrack.id,
            positionMs: 0,
            durationMs: activeTrack.duration * 1000,
            filePath: activeTrack.path,
          }),
        ),
        playLocalFile: vi.fn(),
        play: vi.fn(),
        pause: vi.fn(),
        stop: vi.fn(),
        seek: vi.fn(),
        openLocalAudioFile: vi.fn(),
      },
      audio: {
        getStatus: vi.fn().mockImplementation(() => Promise.resolve(makeAudioStatus(activeTrack))),
        listDevices: vi.fn(),
        setOutput: vi.fn(),
        onStatus: vi.fn(() => vi.fn()),
      },
      lyrics: {
        getForTrack: vi.fn().mockImplementation((trackId: string) => {
          if (trackId === firstTrack.id) {
            return Promise.resolve(
              makeTrackLyrics({
                trackId,
                lines: [{ timeMs: 0, text: "First track lyric" }],
              }),
            );
          }

          return new Promise<TrackLyrics | null>((resolve) => {
            resolveSecondLyrics = resolve;
          });
        }),
        searchCandidates: vi.fn().mockResolvedValue([]),
        applyCandidate: vi.fn(),
        markInstrumental: vi.fn(),
        rejectCandidate: vi.fn(),
        setOffset: vi.fn(),
        clearCache: vi.fn(),
      },
      mv: {
        getSelected: vi.fn().mockResolvedValue(null),
      },
    } as unknown as Window["echo"];

    const SwitchTrack = (): JSX.Element => {
      const { replaceQueue, setCurrentTrackId } = usePlaybackQueue();

      useEffect(() => {
        replaceQueue([firstTrack, secondTrack]);
        setCurrentTrackId(firstTrack.id);
      }, [replaceQueue, setCurrentTrackId]);

      return (
        <>
          <button
            type="button"
            onClick={() => {
              activeTrack = secondTrack;
              setCurrentTrackId(secondTrack.id);
            }}
          >
            switch
          </button>
          <LyricsPage />
        </>
      );
    };

    const { container } = render(
      <PlaybackQueueProvider>
        <SwitchTrack />
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("First track lyric")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "switch" }));

    await waitFor(() => expect(screen.queryByText("First track lyric")).toBeNull());
    expect(container.querySelector(".lyrics-empty")).toBeNull();

    resolveSecondLyrics(null);
  });

  it("does not reuse remembered lyrics when the track identity changes under the same id", async () => {
    const firstTrack = makeTrack({
      id: "reused-track-id",
      title: "First Song",
      path: "D:\\Music\\first.flac",
    });
    const secondTrack = makeTrack({
      id: "reused-track-id",
      title: "Second Song",
      path: "D:\\Music\\second.flac",
    });
    let activeTrack = firstTrack;

    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue(makeAppSettings()),
        setSettings: vi.fn(),
        chooseLyricsWallpaper: vi.fn(),
      },
      playback: {
        getStatus: vi.fn().mockImplementation(() =>
          Promise.resolve({
            state: "playing",
            currentTrackId: activeTrack.id,
            positionMs: 0,
            durationMs: activeTrack.duration * 1000,
            filePath: activeTrack.path,
          }),
        ),
        playLocalFile: vi.fn(),
        play: vi.fn(),
        pause: vi.fn(),
        stop: vi.fn(),
        seek: vi.fn(),
        openLocalAudioFile: vi.fn(),
      },
      audio: {
        getStatus: vi.fn().mockImplementation(() => Promise.resolve(makeAudioStatus(activeTrack))),
        listDevices: vi.fn(),
        setOutput: vi.fn(),
        onStatus: vi.fn(() => vi.fn()),
      },
      lyrics: {
        getForTrack: vi.fn().mockImplementation(() =>
          activeTrack.path === firstTrack.path
            ? Promise.resolve(
                makeTrackLyrics({
                  trackId: activeTrack.id,
                  title: activeTrack.title,
                  lines: [{ timeMs: 0, text: "First reused-id lyric" }],
                }),
              )
            : Promise.resolve(null),
        ),
        getStoredCandidates: vi.fn().mockResolvedValue([]),
        searchCandidates: vi.fn().mockResolvedValue([]),
        applyCandidate: vi.fn(),
        markInstrumental: vi.fn(),
        rejectCandidate: vi.fn(),
        setOffset: vi.fn(),
        clearCache: vi.fn(),
      },
      mv: {
        getSelected: vi.fn().mockResolvedValue(null),
      },
    } as unknown as Window["echo"];

    const SwitchTrack = (): JSX.Element => {
      const { replaceQueue, setCurrentTrackId } = usePlaybackQueue();

      useEffect(() => {
        replaceQueue([firstTrack]);
        setCurrentTrackId(firstTrack.id);
      }, [replaceQueue, setCurrentTrackId]);

      return (
        <>
          <button
            type="button"
            onClick={() => {
              activeTrack = secondTrack;
              replaceQueue([secondTrack], { startTrackId: secondTrack.id });
            }}
          >
            switch
          </button>
          <LyricsPage />
        </>
      );
    };

    render(
      <PlaybackQueueProvider>
        <SwitchTrack />
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("First reused-id lyric")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "switch" }));

    await waitFor(() => expect(screen.queryByText("First reused-id lyric")).toBeNull());
    await waitFor(() => expect(window.echo.lyrics.getStoredCandidates).toHaveBeenCalledWith("reused-track-id", 180));
    expect(screen.queryByText("First reused-id lyric")).toBeNull();
  });

  it("does not paint remembered lyrics while the current track result is pending", async () => {
    const track = makeTrack();
    mockEcho(track);
    const getForTrack = vi.fn().mockResolvedValue(
      makeTrackLyrics({
        lines: [{ timeMs: 0, text: "Remembered stale lyric" }],
      }),
    );
    window.echo.lyrics = {
      getForTrack,
      getStoredCandidates: vi.fn().mockResolvedValue([]),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    const firstRender = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );
    await waitFor(() => expect(document.body.textContent).toContain("Remembered stale lyric"));
    firstRender.unmount();

    const pendingLyrics = deferred<TrackLyrics | null>();
    getForTrack.mockReturnValueOnce(pendingLyrics.promise);
    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(getForTrack).toHaveBeenCalledTimes(2));
    expect(document.body.textContent).not.toContain("Remembered stale lyric");

    pendingLyrics.resolve(null);
    await waitFor(() => expect(document.body.textContent).not.toContain("Remembered stale lyric"));
  });

  it("uses only the centered empty lyrics state when no lyrics are found", async () => {
    const track = makeTrack();
    mockEcho(track, 0, { lyricsEmptyStateHidden: false });
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(null),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() =>
      expect(window.echo.lyrics.getForTrack).toHaveBeenCalledWith("track-1"),
    );
    await waitFor(() =>
      expect(container.querySelector(".lyrics-empty")).toBeTruthy(),
    );
    const page = container.querySelector(".lyrics-page") as HTMLElement;
    expect(page.dataset.emptyState).toBe("true");
    expect(page.dataset.emptyBackground).toBeUndefined();
    expect(container.querySelector(".lyrics-match-panel")).toBeNull();
  });

  it("keeps the high-resolution Rose Vinyl cover background when lyrics are empty", async () => {
    const track = makeTrack({ coverId: "cover 1" });
    mockEcho(track, 0, {
      lyricsPageStyle: "roseVinyl",
      lyricsEmptyStateBackgroundEnabled: false,
    });
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(null),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(window.echo.lyrics.getForTrack).toHaveBeenCalledWith("track-1"));
    const page = container.querySelector(".lyrics-page") as HTMLElement;
    await waitFor(() => expect(page.dataset.emptyState).toBe("true"));

    expect(page.dataset.lyricsPageStyle).toBe("roseVinyl");
    expect(page.dataset.background).toBe("cover");
    expect(page.dataset.emptyBackground).toBeUndefined();
    expect(page.style.getPropertyValue("--lyrics-cover")).toBe(
      'url("echo-cover://large/cover%201")',
    );
    const backdropCovers = container.querySelectorAll<HTMLImageElement>(".lyrics-backdrop-cover");
    expect(backdropCovers).toHaveLength(1);
    expect(backdropCovers[0]?.getAttribute("src")).toBe("echo-cover://large/cover%201");
    expect(backdropCovers[0]?.getAttribute("decoding")).toBe("async");
  });

  it("hides the instrumental empty-state prompt when configured", async () => {
    const track = makeTrack();
    mockEcho(track);
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(
        makeTrackLyrics({
          kind: "instrumental",
          lines: [],
          syncedText: null,
          plainText: null,
        }),
      ),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() =>
      expect(window.echo.lyrics.getForTrack).toHaveBeenCalledWith("track-1"),
    );
    expect(container.querySelector(".lyrics-empty")).toBeNull();
  });

  it("treats a pure-music lyric line as a hideable empty state and reacts to the setting immediately", async () => {
    const track = makeTrack();
    mockEcho(track, 0, { lyricsEmptyStateHidden: false });
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(
        makeTrackLyrics({
          kind: "plain",
          lines: [{ timeMs: -1, text: "纯音乐，请欣赏" }],
          syncedText: null,
          plainText: "纯音乐，请欣赏",
        }),
      ),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("纯音乐，请欣赏")).toBeTruthy();
    const page = container.querySelector(".lyrics-page") as HTMLElement;
    expect(page.dataset.emptyState).toBe("true");
    expect(page.dataset.emptyStateHidden).toBeUndefined();

    act(() => {
      window.dispatchEvent(new CustomEvent("lyrics:display-settings-changed", {
        detail: { lyricsEmptyStateHidden: true },
      }));
    });

    await waitFor(() => expect(container.querySelector(".lyrics-empty")).toBeNull());
    expect(page.dataset.emptyStateHidden).toBe("true");
  });

  it("hides streaming provider pure-music placeholders when configured", async () => {
    const track = makeTrack({
      mediaType: "streaming",
      provider: "netease",
      providerTrackId: "netease-track-1",
    });
    mockEcho(track);
    window.echo.streaming = {
      getLyrics: vi.fn().mockResolvedValue({
        provider: "netease",
        providerTrackId: "netease-track-1",
        status: "available",
        plainLyrics: null,
        syncedLyrics: null,
        instrumental: true,
        lines: [
          {
            timeMs: 0,
            text: "\u6b64\u6b4c\u66f2\u4e3a\u6ca1\u6709\u586b\u8bcd\u7684\u7eaf\u97f3\u4e50\uff0c\u8bf7\u60a8\u6b23\u8d4f",
          },
        ],
        sourceLabel: "NetEase",
      }),
    } as unknown as Window["echo"]["streaming"];

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() =>
      expect(window.echo.streaming?.getLyrics).toHaveBeenCalledWith({
        provider: "netease",
        providerTrackId: "netease-track-1",
      }),
    );
    expect(container.querySelector(".lyrics-empty")).toBeNull();
    expect(container.textContent).not.toContain("\u6b64\u6b4c\u66f2\u4e3a\u6ca1\u6709\u586b\u8bcd\u7684\u7eaf\u97f3\u4e50");
  });

  it("renders lyrics already auto-applied by the main process for QQ Music streaming tracks", async () => {
    const track = makeTrack({
      id: "streaming:qqmusic:123456",
      path: "streaming:qqmusic:123456",
      mediaType: "streaming",
      provider: "qqmusic",
      providerTrackId: "123456",
      stableKey: "streaming:qqmusic:123456",
      title: "QQ Song",
      artist: "QQ Artist",
      album: "QQ Album",
      duration: 200,
    });
    mockEcho(track);
    const searchCandidatesForSnapshot = vi.fn().mockImplementation(
      (_snapshot: unknown, _searchText: string | undefined, provider: string) =>
        Promise.resolve(
          provider === "qqmusic"
            ? [
                makeLyricsCandidate({
                  id: "qq-candidate",
                  provider: "qqmusic",
                  providerLyricsId: "qqmusic:normalized-song-mid",
                  title: "QQ Song",
                  artist: "QQ Artist",
                  album: "QQ Album",
                  durationSeconds: 200,
                  score: 0.96,
                  sourceLabel: "QQ Music",
                }),
              ]
            : [],
        ),
    );
    const applyCandidateForSnapshot = vi.fn().mockResolvedValue(
      makeTrackLyrics({
        provider: "qqmusic",
        providerLyricsId: "qqmusic:normalized-song-mid",
        title: "QQ Song",
        artist: "QQ Artist",
        album: "QQ Album",
        lines: [{ timeMs: 0, text: "Auto applied QQ lyric" }],
        syncedText: "[00:00.00]Auto applied QQ lyric",
      }),
    );
    window.echo.streaming = {
      getLyrics: vi.fn().mockResolvedValue({
        provider: "qqmusic",
        providerTrackId: "123456",
        status: "missing",
        plainLyrics: null,
        syncedLyrics: null,
        instrumental: false,
        lines: [],
        sourceLabel: "QQ Music",
      }),
    } as unknown as Window["echo"]["streaming"];
    window.echo.lyrics = {
      getForTrack: vi.fn(),
      getForSnapshot: vi.fn().mockResolvedValue(
        makeTrackLyrics({
          provider: "qqmusic",
          providerLyricsId: "qqmusic:normalized-song-mid",
          title: "QQ Song",
          artist: "QQ Artist",
          album: "QQ Album",
          lines: [{ timeMs: 0, text: "Auto applied QQ lyric" }],
          syncedText: "[00:00.00]Auto applied QQ lyric",
        }),
      ),
      getStoredCandidates: vi.fn().mockResolvedValue([]),
      searchCandidates: vi.fn().mockResolvedValue([]),
      searchCandidatesForSnapshot,
      applyCandidate: vi.fn(),
      applyCandidateForSnapshot,
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() =>
      expect(window.echo.streaming?.getLyrics).toHaveBeenCalledWith({
        provider: "qqmusic",
        providerTrackId: "123456",
      }),
    );
    expect(await screen.findByText("Auto applied QQ lyric")).toBeTruthy();
    expect(searchCandidatesForSnapshot).not.toHaveBeenCalled();
    expect(applyCandidateForSnapshot).not.toHaveBeenCalled();
  });

  it("does not show no-lyrics while QQ Music streaming lyrics are still loading", async () => {
    const track = makeTrack({
      id: "streaming:qqmusic:004Drt082CV5gf",
      path: "streaming:qqmusic:004Drt082CV5gf",
      mediaType: "streaming",
      provider: "qqmusic",
      providerTrackId: "004Drt082CV5gf",
      stableKey: "streaming:qqmusic:004Drt082CV5gf",
      title: "Cry For Me (feat. Ami)",
      artist: "Michita",
      album: "Pureness",
      duration: 302,
    });
    mockEcho(track, 0, { lyricsEmptyStateHidden: false });
    window.echo.streaming = {
      getLyrics: vi.fn().mockImplementation(() => new Promise(() => undefined)),
    } as unknown as Window["echo"]["streaming"];

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByText("正在加载歌词...");
    expect(screen.queryByText("暂无歌词")).toBeNull();
  });

  it("uses already applied local lyrics for streaming tracks before loading network lyrics", async () => {
    const track = makeTrack({
      id: "streaming:qqmusic:local-lyrics",
      path: "streaming:qqmusic:local-lyrics",
      mediaType: "streaming",
      provider: "qqmusic",
      providerTrackId: "local-lyrics",
      stableKey: "streaming:qqmusic:local-lyrics",
      title: "Streaming Local Song",
      artist: "QQ Artist",
      album: "QQ Album",
      duration: 200,
    });
    mockEcho(track);
    const localLyrics = makeTrackLyrics({
      trackId: "streaming:qqmusic:local-lyrics",
      provider: "local",
      title: "Streaming Local Lyrics",
      artist: "QQ Artist",
      album: "QQ Album",
      lines: [{ timeMs: 0, text: "Streaming local lyric line" }],
      syncedText: "[00:00.00]Streaming local lyric line",
    });
    window.echo.streaming = {
      getLyrics: vi.fn().mockResolvedValue({
        provider: "qqmusic",
        providerTrackId: "local-lyrics",
        status: "available",
        plainLyrics: "Network lyric line",
        syncedLyrics: null,
        instrumental: false,
        lines: [{ timeMs: 0, text: "Network lyric line" }],
        sourceLabel: "QQ Music",
      }),
    } as unknown as Window["echo"]["streaming"];
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(localLyrics),
      getForSnapshot: vi.fn().mockResolvedValue(localLyrics),
      searchCandidates: vi.fn().mockResolvedValue([]),
      searchCandidatesForSnapshot: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      applyCandidateForSnapshot: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("Streaming local lyric line")).toBeTruthy();
    expect(window.echo.streaming?.getLyrics).not.toHaveBeenCalled();
    expect(screen.queryByText("\u6b63\u5728\u52a0\u8f7d\u6b4c\u8bcd")).toBeNull();
  });

  it("keeps the last visible lyrics when returning to the lyrics page for the same track", async () => {
    const track = makeTrack();
    mockEcho(track, 0, { lyricsEmptyStateHidden: false });
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(
        makeTrackLyrics({
          lines: [{ timeMs: 0, text: "Remembered lyric" }],
          syncedText: "[00:00.00]Remembered lyric",
        }),
      ),
      getForSnapshot: vi.fn(),
      searchCandidates: vi.fn().mockResolvedValue([]),
      searchCandidatesForSnapshot: vi.fn(),
      applyCandidate: vi.fn(),
      applyCandidateForSnapshot: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    const firstRender = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );
    await screen.findByText("Remembered lyric");
    firstRender.unmount();

    mockEcho(track, 0, { lyricsEmptyStateHidden: false });
    window.echo.lyrics = {
      getForTrack: vi.fn().mockImplementation(() => new Promise(() => undefined)),
      getForSnapshot: vi.fn(),
      searchCandidates: vi.fn().mockResolvedValue([]),
      searchCandidatesForSnapshot: vi.fn(),
      applyCandidate: vi.fn(),
      applyCandidateForSnapshot: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("Remembered lyric")).toBeTruthy();
    expect(screen.queryByText("正在加载歌词...")).toBeNull();
    expect(screen.queryByText("暂无歌词")).toBeNull();
  });

  it("falls back to candidate search for QQ Music streaming lyrics when exact lookup is missing", async () => {
    const track = makeTrack({
      id: "streaming:qqmusic:123456",
      path: "streaming:qqmusic:123456",
      mediaType: "streaming",
      provider: "qqmusic",
      providerTrackId: "123456",
      stableKey: "streaming:qqmusic:123456",
      title: "QQ Song",
      artist: "QQ Artist",
      album: "QQ Album",
      duration: 200,
    });
    mockEcho(track);
    const searchCandidatesForSnapshot = vi.fn().mockResolvedValue([
      makeLyricsCandidate({
        id: "qq-candidate",
        provider: "qqmusic",
        providerLyricsId: "qqmusic:normalized-song-mid",
        title: "QQ Song",
        artist: "QQ Artist",
        album: "QQ Album",
        durationSeconds: 200,
        score: 0.42,
        sourceLabel: "QQ Music",
      }),
    ]);
    window.echo.streaming = {
      getLyrics: vi.fn().mockResolvedValue({
        provider: "qqmusic",
        providerTrackId: "123456",
        status: "missing",
        plainLyrics: null,
        syncedLyrics: null,
        instrumental: false,
        lines: [],
        sourceLabel: "QQ Music",
      }),
    } as unknown as Window["echo"]["streaming"];
    window.echo.lyrics = {
      getForTrack: vi.fn(),
      getForSnapshot: vi.fn().mockResolvedValue(null),
      getStoredCandidates: vi.fn().mockResolvedValue([]),
      searchCandidates: vi.fn().mockResolvedValue([]),
      searchCandidatesForSnapshot,
      applyCandidate: vi.fn(),
      applyCandidateForSnapshot: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() =>
      expect(window.echo.streaming?.getLyrics).toHaveBeenCalledWith({
        provider: "qqmusic",
        providerTrackId: "123456",
      }),
    );
    window.dispatchEvent(new CustomEvent("lyrics:search-requested"));
    await waitFor(() => expect(searchCandidatesForSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        trackId: "streaming:qqmusic:123456",
        title: "QQ Song",
        artist: "QQ Artist",
        album: "QQ Album",
        durationSeconds: 200,
        mediaType: "streaming",
        sourceId: "123456",
        stableKey: "streaming:qqmusic:123456",
      }),
      undefined,
      "qqmusic",
      "manual",
    ));
    await waitFor(() => expect(screen.getAllByText("QQ Song").length).toBeGreaterThan(1));
  });

  it("searches regular lyrics for NetEase djradio tracks without exact streaming lookup", async () => {
    const track = makeTrack({
      id: "streaming:netease:3370584713",
      path: "streaming:netease:3370584713",
      mediaType: "streaming",
      provider: "netease",
      providerTrackId: "3370584713",
      stableKey: "streaming:netease:3370584713",
      title: "IRIS OUT",
      artist: "Podcast Host",
      album: "NetEase Podcast",
      duration: 147.048,
      fieldSources: {},
    });
    mockEcho(track);
    const searchCandidatesForSnapshot = vi.fn().mockResolvedValue([
      makeLyricsCandidate({
        id: "netease-djradio-candidate",
        provider: "netease",
        providerLyricsId: "netease:lyric:3370584713",
        title: "IRIS OUT",
        artist: "Podcast Host",
        album: "NetEase Podcast",
        durationSeconds: 147.048,
        score: 0.74,
        sourceLabel: "NetEase",
      }),
    ]);
    window.echo.streaming = {
      getTrackSourceInfo: vi.fn().mockResolvedValue({
        provider: "netease",
        providerTrackId: "3370584713",
        albumId: null,
        sourcePlaylistIds: ["djradio:990232286"],
        isNeteaseDjRadio: true,
      }),
      getLyrics: vi.fn().mockResolvedValue({
        provider: "netease",
        providerTrackId: "3370584713",
        status: "missing",
        plainLyrics: null,
        syncedLyrics: null,
        instrumental: false,
        lines: [],
        sourceLabel: "NetEase",
      }),
    } as unknown as Window["echo"]["streaming"];
    window.echo.lyrics = {
      getForTrack: vi.fn(),
      getForSnapshot: vi.fn().mockResolvedValue(null),
      searchCandidates: vi.fn().mockResolvedValue([]),
      searchCandidatesForSnapshot,
      applyCandidate: vi.fn(),
      applyCandidateForSnapshot: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(window.echo.streaming?.getTrackSourceInfo).toHaveBeenCalledWith({
      provider: "netease",
      providerTrackId: "3370584713",
    }));
    await waitFor(() => expect(searchCandidatesForSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        trackId: "streaming:netease:3370584713",
        title: "IRIS OUT",
        artist: "Podcast Host",
        album: "NetEase Podcast",
        mediaType: "streaming",
        sourceId: "3370584713",
        stableKey: "streaming:netease:3370584713",
      }),
      undefined,
      "netease",
    ));
    expect(window.echo.streaming?.getLyrics).not.toHaveBeenCalled();
  });

  it("lets users switch lyrics source without clearing the current lyrics first", async () => {
    const track = makeTrack();
    mockEcho(track);
    const qqLyrics = makeTrackLyrics({
      provider: "qqmusic",
      providerLyricsId: "qq-1",
      lines: [{ timeMs: 0, text: "QQ applied line" }],
      syncedText: "[00:00.00]QQ applied line",
    });
    window.echo.lyrics = {
      getForTrack: vi
        .fn()
        .mockResolvedValue(
          makeTrackLyrics({ lines: [{ timeMs: 0, text: "Current lyrics" }] }),
        ),
      searchCandidates: vi.fn().mockResolvedValue([
        makeLyricsCandidate({
          id: "lrclib-candidate",
          title: "LRCLIB Song",
          sourceLabel: "LRCLIB",
        }),
        makeLyricsCandidate({
          id: "qq-candidate",
          provider: "qqmusic",
          providerLyricsId: "qq-1",
          title: "QQ Song",
          sourceLabel: "QQ Music",
          reasons: ["qqmusic_provider", "duration_close"],
        }),
      ]),
      applyCandidate: vi.fn().mockResolvedValue(qqLyrics),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("Current lyrics")).toBeTruthy();

    window.dispatchEvent(new Event("lyrics:search-requested"));

    expect(await screen.findByText("LRCLIB Song")).toBeTruthy();
    expect(screen.getByText("QQ Song")).toBeTruthy();
    expect(window.echo.lyrics.clearCache).not.toHaveBeenCalled();
    expect(window.echo.lyrics.searchCandidates).toHaveBeenCalledWith("track-1", undefined, "lrclib");
    expect(window.echo.lyrics.searchCandidates).toHaveBeenCalledWith("track-1", undefined, "qqmusic", "manual");

    const qqSourceButton = Array.from(container.querySelectorAll<HTMLButtonElement>(".lyrics-source-filters button"))
      .find((button) => button.textContent?.includes("QQ"));
    expect(qqSourceButton).toBeTruthy();
    fireEvent.click(qqSourceButton!);

    expect(screen.queryByText("LRCLIB Song")).toBeNull();
    fireEvent.click(screen.getByText("QQ Song"));

    await waitFor(() =>
      expect(window.echo.lyrics.applyCandidate).toHaveBeenCalledWith(
        "track-1",
        "qq-candidate",
      ),
    );
    expect(await screen.findByText("QQ applied line")).toBeTruthy();
  });

  it("keeps enabled lyrics sources visible even when one source returns no candidates", async () => {
    const track = makeTrack();
    mockEcho(track);
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(makeTrackLyrics({ lines: [{ timeMs: 0, text: "Current lyrics" }] })),
      searchCandidates: vi.fn().mockImplementation(
        (_trackId: string, _searchText?: string, provider?: string) =>
          Promise.resolve(
            provider === "lrclib"
              ? [
                  makeLyricsCandidate({
                    id: "lrclib-only",
                    provider: "lrclib",
                    sourceLabel: "LRCLIB",
                  }),
                ]
              : [],
          ),
      ),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("Current lyrics")).toBeTruthy();
    window.dispatchEvent(new Event("lyrics:search-requested"));

    await waitFor(() => expect(container.querySelector(".lyrics-source-filters")).toBeTruthy());
    const qqSource = Array.from(container.querySelectorAll<HTMLButtonElement>(".lyrics-source-filters button"))
      .find((button) => button.textContent?.includes("QQ"));

    expect(qqSource?.textContent).toContain("0");
    expect(window.echo.lyrics.searchCandidates).toHaveBeenCalledWith("track-1", undefined, "qqmusic", "manual");
  });

  it("does not load lyrics while lyrics display is disabled", async () => {
    const track = makeTrack();
    mockEcho(track, 0, { lyricsEnabled: false });
    const getForTrack = vi.fn().mockResolvedValue(makeTrackLyrics());
    window.echo.lyrics = {
      getForTrack,
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(getForTrack).not.toHaveBeenCalled());
    expect(container.querySelector(".lyrics-match-panel")).toBeNull();
    expect(container.querySelector(".lyrics-view")).toBeNull();
  });

  it("applies lyrics font, color, and custom wallpaper settings to the page surface", async () => {
    const track = makeTrack();
    mockEcho(track, 0, {
      lyricsFontSizePx: 44,
      lyricsColor: "#FF3366",
      lyricsBackgroundMode: "customWallpaper",
      lyricsCustomWallpaperPath: "D:\\Echo\\lyrics-wallpapers\\custom.png",
      lyricsCoverOpacityPercent: 66,
      lyricsCoverBlurPx: 18,
      lyricsCoverBrightnessPercent: 120,
      lyricsBackgroundScalePercent: 132,
      lyricsSecondaryFontSizePx: 24,
      lyricsLineSpacingPercent: 118,
      lyricsLineMaxChars: 32,
      lyricsContextOpacityPercent: 64,
      lyricsWordHighlightClarityPercent: 88,
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;
    await waitFor(() =>
      expect(page.dataset.background).toBe("customWallpaper"),
    );
    expect(page.style.getPropertyValue("--lyrics-font-size")).toBe("44px");
    expect(page.style.getPropertyValue("--lyrics-color")).toBe("#FF3366");
    expect(page.style.getPropertyValue("--lyrics-wallpaper")).toContain(
      "echo-wallpaper://lyrics/custom",
    );
    expect(page.style.getPropertyValue("--lyrics-cover-opacity")).toBe("0.66");
    expect(page.style.getPropertyValue("--lyrics-background-surface-alpha")).toBe("0.66");
    expect(page.style.getPropertyValue("--lyrics-cover-blur")).toBe("18px");
    expect(page.style.getPropertyValue("--lyrics-cover-brightness")).toBe(
      "120%",
    );
    expect(page.style.getPropertyValue("--lyrics-background-scale")).toBe(
      "1.32",
    );
    expect(page.style.getPropertyValue("--lyrics-secondary-font-size")).toBe(
      "24px",
    );
    expect(page.style.getPropertyValue("--lyrics-line-spacing")).toBe("1.18");
    expect(page.style.getPropertyValue("--lyrics-line-max-width")).toBe("32em");
    expect(page.style.getPropertyValue("--lyrics-context-opacity")).toBe(
      "0.64",
    );
    expect(page.style.getPropertyValue("--lyrics-current-word-clarity")).toBe("88%");
    expect(page.dataset.lyricsColorMode).toBe("manual");
  });

  it("uses Ctrl+wheel to adjust and persist lyrics background scale", async () => {
    const track = makeTrack();
    mockEcho(track, 0, {
      lyricsBackgroundMode: "cover",
      lyricsBackgroundScalePercent: 100,
    });
    const setSettings = vi.fn(async (patch: Partial<AppSettings>) =>
      makeAppSettings({
        lyricsBackgroundMode: "cover",
        lyricsBackgroundScalePercent: Number(patch.lyricsBackgroundScalePercent ?? 100),
      }),
    );
    window.echo.app.setSettings = setSettings;

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;
    vi.useFakeTimers();

    const regularWheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -100 });
    expect(page.dispatchEvent(regularWheel)).toBe(true);
    expect(regularWheel.defaultPrevented).toBe(false);
    expect(setSettings).not.toHaveBeenCalled();

    const ctrlWheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -100 });
    expect(page.dispatchEvent(ctrlWheel)).toBe(false);
    expect(ctrlWheel.defaultPrevented).toBe(true);
    fireEvent.wheel(page, { ctrlKey: true, deltaY: -100 });
    fireEvent.wheel(page, { ctrlKey: true, deltaY: -100 });

    expect(page.style.getPropertyValue("--lyrics-background-scale")).toBe("1.15");
    expect(setSettings).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(359);
    });
    expect(setSettings).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(setSettings).toHaveBeenCalledTimes(1);
    expect(setSettings).toHaveBeenCalledWith({ lyricsBackgroundScalePercent: 115 });

    for (let index = 0; index < 4; index += 1) {
      fireEvent.wheel(page, { ctrlKey: true, deltaY: 100 });
    }

    expect(page.style.getPropertyValue("--lyrics-background-scale")).toBe("0.95");
    expect(setSettings).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(360);
      await Promise.resolve();
    });
    expect(setSettings).toHaveBeenCalledTimes(2);
    expect(setSettings).toHaveBeenLastCalledWith({ lyricsBackgroundScalePercent: 95 });
  });

  it("restores the lyrics track transition when switching songs with a cover background", async () => {
    const firstTrack = makeTrack({
      id: "track-first",
      path: "D:\\Music\\first.flac",
      title: "First Song",
      coverThumb: "echo-cover://thumb/first",
    });
    const secondTrack = makeTrack({
      id: "track-second",
      path: "D:\\Music\\second.flac",
      title: "Second Song",
      coverThumb: "echo-cover://thumb/second",
    });
    const tracks = [firstTrack, secondTrack];
    mockEcho(firstTrack, 0, { lyricsBackgroundMode: "cover" });

    const view = render(
      <PlaybackQueueProvider>
        <QueueSeedWithTracks currentTrackId={firstTrack.id} tracks={tracks}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeedWithTracks>
      </PlaybackQueueProvider>,
    );

    await screen.findByRole("heading", { name: "First Song" });
    vi.useFakeTimers();

    view.rerender(
      <PlaybackQueueProvider>
        <QueueSeedWithTracks currentTrackId={secondTrack.id} tracks={tracks}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeedWithTracks>
      </PlaybackQueueProvider>,
    );
    await act(async () => Promise.resolve());

    const page = view.container.querySelector(".lyrics-page") as HTMLElement;
    expect(page.dataset.background).toBe("cover");
    expect(page.dataset.trackTransition).toBe("true");
    expect(page.querySelector(".lyrics-backdrop-previous-cover")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(760);
    });
    expect(page.dataset.trackTransition).toBeUndefined();
  });

  it("keeps manual lyrics color when smart readable colors are disabled", async () => {
    const track = makeTrack();
    mockEcho(track, 0, {
      lyricsColor: "#FF3366",
      lyricsSmartReadableColorsEnabled: false,
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;

    expect(page.dataset.smartReadable).toBeUndefined();
    expect(page.dataset.lyricsColorMode).toBe("manual");
    expect(page.style.getPropertyValue("--lyrics-color")).toBe("#FF3366");
    expect(page.style.getPropertyValue("--lyrics-smart-primary-color")).toBe("");
  });

  it("lets the default lyrics color fall back to theme typography", async () => {
    const track = makeTrack();
    mockEcho(track, 0, {
      lyricsColor: "#314054",
      lyricsBackgroundMode: "theme",
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;

    expect(page.dataset.lyricsColorMode).toBe("theme");
  });

  it("applies smart readable colors immediately for theme backgrounds", async () => {
    const track = makeTrack();
    mockEcho(track, 0, {
      lyricsColor: "#FFFFFF",
      lyricsSmartReadableColorsEnabled: true,
      lyricsBackgroundMode: "theme",
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;

    await waitFor(() => expect(page.dataset.smartReadable).toBe("true"));
    expect(page.style.getPropertyValue("--lyrics-smart-primary-color")).toMatch(/^rgb\(/);
    expect(page.style.getPropertyValue("--lyrics-smart-secondary-color")).toMatch(/^rgb\(/);
    expect(document.documentElement.dataset.lyricsSmartReadable).toBeUndefined();
  });

  it("waits for sampled artwork before applying smart readable colors to cover backgrounds", async () => {
    const track = makeTrack();
    mockEcho(track, 0, {
      lyricsColor: "#FFFFFF",
      lyricsSmartReadableColorsEnabled: true,
      lyricsBackgroundMode: "cover",
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;

    expect(page.dataset.smartReadable).toBeUndefined();
    expect(page.style.getPropertyValue("--lyrics-smart-primary-color")).toBe("");
  });

  it("keeps cover color backgrounds active in low-load mode without using the cover image as backdrop", async () => {
    const track = makeTrack();
    mockEcho(track, 0, {
      lowLoadPlaybackModeEnabled: true,
      lyricsBackgroundMode: "coverColor",
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;

    expect(page.dataset.background).toBe("coverColor");
    expect(page.dataset.renderPressureReduced).toBe("true");
    expect(page.style.getPropertyValue("--lyrics-cover")).toBe("none");
  });

  it("turns off high-cost lyrics visuals in low-load mode", async () => {
    const track = makeTrack({ coverId: "cover 1" });
    mockEcho(track, 0, {
      lowLoadPlaybackModeEnabled: true,
      lyricsBackgroundMode: "cover",
      lyricsImmersiveCoverStyleEnabled: true,
      lyricsImmersiveCoverGlassEnabled: true,
      lyricsMusicReactiveVisualsEnabled: true,
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;

    expect(page.dataset.renderPressureReduced).toBe("true");
    expect(page.dataset.immersiveCoverStyle).toBeUndefined();
    expect(page.dataset.immersiveCoverGlass).toBeUndefined();
    expect(page.dataset.musicReactive).toBeUndefined();
    expect(page.style.getPropertyValue("--lyrics-cover")).toBe(
      'url("echo-cover://large/cover-1")',
    );
  });

  it("enters session graphics pressure mode at the hard threshold even when the general guard is disabled", async () => {
    const track = makeTrack({ coverId: "cover 1" });
    const { emitMemoryPressure } = mockEcho(track, 0, {
      lyricsMvGraphicsPressureGuardEnabled: false,
      lyricsBackgroundMode: "cover",
      lyricsImmersiveCoverStyleEnabled: true,
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;
    expect(page.dataset.renderPressureReduced).toBeUndefined();
    expect(page.dataset.immersiveCoverStyle).toBe("true");

    act(() => {
      emitMemoryPressure({
        timestamp: "2026-06-23T00:00:00.000Z",
        thresholdBytes: 3 * 1024 * 1024 * 1024,
        totalWorkingSetBytes: 3_600_000_000,
        totalPrivateBytes: 3_200_000_000,
        processCount: 1,
        topProcessType: "Tab",
        topProcessWorkingSetBytes: 3_200_000_000,
        reportPath: "memory-pressure-report.md",
        graphicsPressure: {
          kind: "lyrics-mv-render-pressure",
          reason: "renderer-native-memory-high-with-duplicate-mv-video-decode",
          lyricsPageVisible: true,
          mvPanelVisible: true,
          duplicateMvVideoDecode: true,
        },
      });
    });

    await waitFor(() => expect(page.dataset.renderPressureReduced).toBe("true"));
    expect(page.dataset.immersiveCoverStyle).toBeUndefined();
  });

  it("keeps visible lyrics effects unchanged during silent memory maintenance", async () => {
    const track = makeTrack({ coverId: "cover 1" });
    const { emitMemoryPressure } = mockEcho(track, 0, {
      lyricsMvGraphicsPressureGuardEnabled: false,
      lyricsBackgroundMode: "cover",
      lyricsImmersiveCoverStyleEnabled: true,
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;

    act(() => {
      emitMemoryPressure({
        timestamp: "2026-08-09T02:00:00.000Z",
        thresholdBytes: 768 * 1024 * 1024,
        totalWorkingSetBytes: 1_200_000_000,
        processCount: 1,
        topProcessType: "Tab",
        topProcessWorkingSetBytes: 800 * 1024 * 1024,
        reportPath: "renderer-memory-pressure-report.md",
        userNoticeRecommended: false,
        rendererMitigationRecommended: false,
        graphicsPressure: {
          kind: "lyrics-mv-render-pressure",
          reason: "renderer-native-memory-high-on-lyrics-or-mv-page",
          lyricsPageVisible: true,
        },
      });
    });

    expect(page.dataset.renderPressureReduced).toBeUndefined();
    expect(page.dataset.immersiveCoverStyle).toBe("true");
  });

  it("uses the default-on guard to reduce lyrics visuals at the soft graphics threshold", async () => {
    const track = makeTrack({ coverId: "cover 1" });
    const { emitMemoryPressure } = mockEcho(track, 0, {
      lyricsBackgroundMode: "cover",
      lyricsImmersiveCoverStyleEnabled: true,
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;

    act(() => {
      emitMemoryPressure({
        timestamp: "2026-08-09T02:00:00.000Z",
        thresholdBytes: 768 * 1024 * 1024,
        totalWorkingSetBytes: 1_200_000_000,
        processCount: 1,
        topProcessType: "Tab",
        topProcessWorkingSetBytes: 800 * 1024 * 1024,
        reportPath: "renderer-memory-pressure-report.md",
        userNoticeRecommended: false,
        rendererMitigationRecommended: false,
        graphicsPressure: {
          kind: "lyrics-mv-render-pressure",
          reason: "renderer-native-memory-high-on-lyrics-or-mv-page",
          lyricsPageVisible: true,
        },
      });
    });

    await waitFor(() => expect(page.dataset.renderPressureReduced).toBe("true"));
    expect(page.dataset.renderBudget).toBe("pressure");
    expect(page.dataset.immersiveCoverStyle).toBeUndefined();
  });

  it("falls back to smaller cached cover variants without sampling original artwork", async () => {
    const requestedSources: string[] = [];
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      complete = false;
      naturalWidth = 0;
      naturalHeight = 0;
      crossOrigin: string | null = null;

      set src(value: string) {
        requestedSources.push(value);
        if (value === "echo-cover://thumb/cover%201") {
          queueMicrotask(() => this.onerror?.());
        }
      }

      get src(): string {
        return requestedSources[requestedSources.length - 1] ?? "";
      }
    }
    const originalImage = window.Image;
    Object.defineProperty(window, "Image", {
      configurable: true,
      writable: true,
      value: FakeImage,
    });
    const track = makeTrack({ coverId: "cover 1" });
    mockEcho(track, 0, {
      lyricsBackgroundMode: "coverColor",
    });

    try {
      const { container } = render(
        <PlaybackQueueProvider>
          <QueueSeed track={track}>
            <LyricsPage initialLyrics={lyrics} />
          </QueueSeed>
        </PlaybackQueueProvider>,
      );

      await screen.findByRole("heading", { name: "Test Song" });
      const page = container.querySelector(".lyrics-page") as HTMLElement;

      expect(page.dataset.background).toBe("coverColor");
      await waitFor(() => {
        expect(requestedSources).toContain("echo-cover://thumb/cover%201");
        expect(requestedSources).toContain("echo-cover://album/cover%201");
        expect(requestedSources).not.toContain("echo-cover://original/cover%201");
      });
    } finally {
      Object.defineProperty(window, "Image", {
        configurable: true,
        writable: true,
        value: originalImage,
      });
    }
  });

  it("applies lyrics readability enhancement in pure lyrics mode", async () => {
    const track = makeTrack();
    mockEcho(track);
    attachMvBridge(null, {
      ...defaultMvSettings,
      lyricsReadabilityEnhanced: true,
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByRole("heading", { name: "Test Song" });

    await waitFor(() =>
      expect(container.querySelector(".lyrics-mv-panel")?.getAttribute("data-lyrics-readability")).toBe("true"),
    );
  });

  it("applies lyrics display settings from settings change events immediately", async () => {
    const track = makeTrack();
    mockEcho(track);

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;

    window.dispatchEvent(
      new CustomEvent("settings:changed", {
        detail: {
          lyricsFontSizePx: 52,
          lyricsColor: "#FFFFFF",
          lyricsSmartReadableColorsEnabled: true,
          lyricsBackgroundMode: "cover",
          lyricsCoverOpacityPercent: 24,
          lyricsCoverBlurPx: 4,
          lyricsCoverBrightnessPercent: 72,
          lyricsBackgroundScalePercent: 86,
          lyricsSecondaryFontSizePx: 22,
          lyricsLineSpacingPercent: 74,
          lyricsLineMaxChars: 28,
          lyricsContextOpacityPercent: 24,
          lyricsTextDirection: "vertical",
        },
      }),
    );

    await waitFor(() =>
      expect(page.style.getPropertyValue("--lyrics-font-size")).toBe("52px"),
    );
    expect(page.dataset.background).toBe("cover");
    expect(page.dataset.smartReadable).toBeUndefined();
    expect(page.dataset.lyricsColorMode).toBe("manual");
    expect(container.querySelector(".lyrics-mv-panel")?.getAttribute("data-lyrics-readability")).toBe("true");
    expect(page.style.getPropertyValue("--lyrics-color")).toBe("#FFFFFF");
    expect(page.style.getPropertyValue("--lyrics-smart-primary-color")).toBe("");
    expect(page.style.getPropertyValue("--lyrics-cover-opacity")).toBe("0.24");
    expect(page.style.getPropertyValue("--lyrics-background-surface-alpha")).toBe("0.24");
    expect(page.style.getPropertyValue("--lyrics-cover-blur")).toBe("4px");
    expect(page.style.getPropertyValue("--lyrics-cover-brightness")).toBe(
      "72%",
    );
    expect(page.style.getPropertyValue("--lyrics-background-scale")).toBe(
      "0.86",
    );
    expect(page.style.getPropertyValue("--lyrics-secondary-font-size")).toBe(
      "22px",
    );
    expect(page.style.getPropertyValue("--lyrics-line-spacing")).toBe("0.74");
    expect(page.style.getPropertyValue("--lyrics-line-max-width")).toBe("28em");
    expect(page.style.getPropertyValue("--lyrics-context-opacity")).toBe(
      "0.24",
    );
    expect(page.dataset.lyricsTextDirection).toBe("horizontal");
    expect(container.querySelector(".lyrics-scroll")?.getAttribute("data-text-direction")).toBe("horizontal");
  });

  it("keeps a chosen lyrics page style when a full settings snapshot tries to reset it to default", async () => {
    const track = makeTrack();
    mockEcho(track);

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;

    act(() => {
      window.dispatchEvent(
        new CustomEvent("settings:changed", {
          detail: { lyricsPageStyle: "roseVinyl" },
        }),
      );
    });
    await waitFor(() => expect(page.dataset.lyricsPageStyle).toBe("roseVinyl"));

    act(() => {
      window.dispatchEvent(
        new CustomEvent("settings:changed", {
          detail: {
            lowSpecModeEnabled: false,
            lyricsFontSizePx: 40,
          },
        }),
      );
    });

    await waitFor(() => expect(page.dataset.lyricsPageStyle).toBe("roseVinyl"));
    expect(page.style.getPropertyValue("--lyrics-font-size")).toBe("40px");

    act(() => {
      window.dispatchEvent(
        new CustomEvent("settings:changed", {
          detail: makeAppSettings({
            lowSpecModeEnabled: false,
            lyricsPageStyle: "default",
            lyricsFontSizePx: 36,
          }),
        }),
      );
    });

    await waitFor(() => expect(page.style.getPropertyValue("--lyrics-font-size")).toBe("36px"));
    expect(page.dataset.lyricsPageStyle).toBe("roseVinyl");

    act(() => {
      window.dispatchEvent(
        new CustomEvent("settings:changed", {
          detail: { lyricsPageStyle: "default" },
        }),
      );
    });
    await waitFor(() => expect(page.dataset.lyricsPageStyle).toBe("default"));
  });

  it("keeps a chosen lyrics page style when a stale snapshot uses a different style", async () => {
    const track = makeTrack();
    mockEcho(track);

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;

    act(() => {
      window.dispatchEvent(
        new CustomEvent("settings:changed", {
          detail: { lyricsPageStyle: "cinemaStage" },
        }),
      );
    });
    await waitFor(() => expect(page.dataset.lyricsPageStyle).toBe("cinemaStage"));

    act(() => {
      window.dispatchEvent(
        new CustomEvent("settings:changed", {
          detail: makeAppSettings({
            lowSpecModeEnabled: false,
            lyricsPageStyle: "editorial",
            lyricsFontSizePx: 44,
          }),
        }),
      );
    });

    await waitFor(() => expect(page.style.getPropertyValue("--lyrics-font-size")).toBe("44px"));
    expect(page.dataset.lyricsPageStyle).toBe("cinemaStage");
  });

  it("keeps a chosen lyrics page style when a bare settings reload still returns the old value", async () => {
    const track = makeTrack();
    mockEcho(track);

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;

    act(() => {
      window.dispatchEvent(
        new CustomEvent("settings:changed", {
          detail: { lyricsPageStyle: "coverStage" },
        }),
      );
    });
    await waitFor(() => expect(page.dataset.lyricsPageStyle).toBe("coverStage"));

    const getSettings = vi.mocked(window.echo.app.getSettings);
    const callsBeforeReload = getSettings.mock.calls.length;

    await act(async () => {
      window.dispatchEvent(new Event("settings:changed"));
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(getSettings.mock.calls.length).toBeGreaterThan(callsBeforeReload));
    expect(page.dataset.lyricsPageStyle).toBe("coverStage");
  });

  it("keeps the last focused lyrics page style through rapid switches and snapshots", async () => {
    const track = makeTrack();
    mockEcho(track);

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;
    const styles = ["editorial", "folded", "roseVinyl", "cinemaStage", "kineticPoster", "coverStage"] as const;

    for (const style of styles) {
      act(() => {
        window.dispatchEvent(
          new CustomEvent("settings:changed", {
            detail: { lyricsPageStyle: style },
          }),
        );
        window.dispatchEvent(
          new CustomEvent("settings:changed", {
            detail: makeAppSettings({
              lowSpecModeEnabled: false,
              lyricsPageStyle: "default",
            }),
          }),
        );
      });
      await waitFor(() => expect(page.dataset.lyricsPageStyle).toBe(style));
    }
  });

  it("keeps a chosen lyrics page style while low-load mode reduces visual effects", async () => {
    const track = makeTrack({ coverId: "low load style cover" });
    mockEcho(track, 0, {
      lowLoadPlaybackModeEnabled: true,
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;

    act(() => {
      window.dispatchEvent(
        new CustomEvent("settings:changed", {
          detail: { lyricsPageStyle: "cinemaStage" },
        }),
      );
    });

    await waitFor(() => expect(page.dataset.lyricsPageStyle).toBe("cinemaStage"));
    expect(page.dataset.renderPressureReduced).toBe("true");
    expect(container.querySelector(".lyrics-cinema-stage-particles")).toBeNull();
  });

  it("keeps a chosen lyrics page style in lightweight mode", async () => {
    const track = makeTrack({ coverId: "lightweight style cover" });
    mockEcho(track, 0, {
      lowSpecModeEnabled: true,
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;

    act(() => {
      window.dispatchEvent(
        new CustomEvent("settings:changed", {
          detail: { lyricsPageStyle: "coverStage" },
        }),
      );
    });

    await waitFor(() => expect(page.dataset.lyricsPageStyle).toBe("coverStage"));
    expect(page.dataset.renderPressureReduced).toBe("true");
    expect(page.getAttribute("data-immersive-cover-style")).toBeNull();
  });

  it("ignores explicit non-lyrics settings change events", async () => {
    const track = makeTrack();
    mockEcho(track);

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;
    const getSettings = vi.mocked(window.echo.app.getSettings);
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    getSettings.mockClear();

    act(() => {
      window.dispatchEvent(
        new window.CustomEvent("settings:changed", {
          detail: {
            immersiveBackgroundScalePercent: 140,
            immersiveBackgroundBlurPx: 10,
            immersiveBackgroundBrightnessPercent: 118,
            immersiveBackgroundOverlayOpacityPercent: 35,
          },
        }),
      );
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(page.style.getPropertyValue("--lyrics-font-size")).toBe("40px");
    expect(page.style.getPropertyValue("--lyrics-background-scale")).toBe("1.00");
  });

  it("does not reload or rematch lyrics when visual display settings change", async () => {
    const track = makeTrack();
    mockEcho(track);
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(
        makeTrackLyrics({
          lines: [{ timeMs: 0, text: "Stable current lyrics" }],
          syncedText: "[00:00.00]Stable current lyrics",
          plainText: "Stable current lyrics",
        }),
      ),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    const renderResult = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );
    const container = renderResult.container;

    expect(await screen.findByText("Stable current lyrics")).toBeTruthy();
    expect(window.echo.lyrics.getForTrack).toHaveBeenCalledTimes(1);

    window.dispatchEvent(
      new CustomEvent("lyrics:display-settings-changed", {
        detail: {
          lyricsAutoAcceptScore: 0.3,
          lyricsFontSizePx: 48,
          lyricsLineSpacingPercent: 116,
          lyricsContextOpacityPercent: 70,
          lyricsTextDirection: "vertical",
        },
      }),
    );

    await waitFor(() => {
      expect(container.querySelector(".lyrics-line-primary")?.textContent).toBe("Stable current lyrics");
    });
    expect(window.echo.lyrics.getForTrack).toHaveBeenCalledTimes(1);
    expect(window.echo.lyrics.searchCandidates).not.toHaveBeenCalled();
  });

  it("hides romanization and translations immediately from settings change events", async () => {
    const track = makeTrack();
    mockEcho(track);

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage
            initialLyrics={[
              {
                timeMs: 0,
                text: "君が好き",
                romanization: "kimi ga suki",
                translation: "Translated line",
              },
            ]}
          />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("kimi ga suki")).toBeTruthy();
    expect(screen.getByText("Translated line")).toBeTruthy();

    window.dispatchEvent(
      new CustomEvent("settings:changed", {
        detail: {
          lyricsRomanizationEnabled: false,
          lyricsTranslationEnabled: false,
        },
      }),
    );

    await waitFor(() => expect(screen.queryByText("kimi ga suki")).toBeNull());
    expect(screen.queryByText("Translated line")).toBeNull();
  });

  it("keeps initial secondary lyrics hidden until display settings load", async () => {
    const track = makeTrack();
    const pendingSettings = deferred<AppSettings>();
    mockEcho(track);
    window.echo.app.getSettings = vi.fn().mockReturnValue(pendingSettings.promise);

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage
            initialLyrics={[
              {
                timeMs: 0,
                text: "Original line",
                romanization: "Romanized line",
                translation: "Translated line",
              },
            ]}
          />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("Original line")).toBeTruthy();
    expect(screen.queryByText("Romanized line")).toBeNull();
    expect(screen.queryByText("Translated line")).toBeNull();

    await act(async () => {
      pendingSettings.resolve(
        makeAppSettings({
          lyricsRomanizationEnabled: false,
          lyricsTranslationEnabled: false,
        }),
      );
      await pendingSettings.promise;
    });

    await screen.findByText("Original line");
    expect(screen.queryByText("Romanized line")).toBeNull();
    expect(screen.queryByText("Translated line")).toBeNull();
  });

  it("hides secondary lyric lines when configured", async () => {
    const track = makeTrack();
    mockEcho(track, 0, { lyricsRomanizationEnabled: false, lyricsTranslationEnabled: false });

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage
            initialLyrics={[
              {
                timeMs: 0,
                text: "Original line",
                romanization: "Romanized line",
                translation: "Translated line",
              },
            ]}
          />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByText("Original line");
    expect(screen.queryByText("Romanized line")).toBeNull();
    expect(screen.queryByText("Translated line")).toBeNull();
  });

  it("shows plain lyrics in the centered karaoke layout", async () => {
    const track = makeTrack();
    mockEcho(track, 120);
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(
        makeTrackLyrics({
          kind: "plain",
          lines: [
            { timeMs: -1, text: "Plain first" },
            { timeMs: -1, text: "Plain second" },
          ],
          syncedText: null,
          plainText: "Plain first\nPlain second",
        }),
      ),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };
    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByText("Plain second");
    expect(
      container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
    ).toContain("Plain second");
  });

  it("applies a custom LRC file dropped on the lyrics page", async () => {
    const track = makeTrack();
    mockEcho(track);
    const customLyrics = makeTrackLyrics({
      provider: "manual",
      providerLyricsId: "custom-lrc",
      lines: [{ timeMs: 1000, text: "Dropped custom line" }],
      syncedText: "[00:01.00]Dropped custom line",
      plainText: "Dropped custom line",
    });
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(makeTrackLyrics({ lines: [{ timeMs: 0, text: "Current lyrics" }] })),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      applyCustomLrc: vi.fn().mockResolvedValue(customLyrics),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("Current lyrics")).toBeTruthy();
    const page = container.querySelector(".lyrics-page") as HTMLElement;
    const file = new File(
      [
        new Uint8Array([
          0x5b, 0x30, 0x30, 0x3a, 0x30, 0x31, 0x2e, 0x30, 0x30, 0x5d,
          0xd0, 0xd2, 0xb4, 0xe6, 0xd5, 0xdf,
        ]),
      ],
      "custom.lrc",
      { type: "text/plain" },
    );

    fireEvent.drop(page, {
      dataTransfer: {
        files: [file],
        types: ["Files"],
      },
    });

    await waitFor(() =>
      expect(window.echo.lyrics.applyCustomLrc).toHaveBeenCalledWith(
        "track-1",
        "[00:01.00]幸存者",
        "custom.lrc",
      ),
    );
    expect(await screen.findByText("Dropped custom line")).toBeTruthy();
  });

  it("applies a custom TTML file dropped on the lyrics page", async () => {
    const track = makeTrack();
    mockEcho(track);
    const customLyrics = makeTrackLyrics({
      provider: "manual",
      providerLyricsId: "custom-ttml",
      lines: [{ timeMs: 0, text: "I promise that you'll never find another like me" }],
      syncedText: '<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="0.000" end="2.865">I promise that you&apos;ll never find another like me</p></div></body></tt>',
      plainText: "I promise that you'll never find another like me",
    });
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(makeTrackLyrics({ lines: [{ timeMs: 0, text: "Current lyrics" }] })),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      applyCustomLrc: vi.fn().mockResolvedValue(customLyrics),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("Current lyrics")).toBeTruthy();
    const page = container.querySelector(".lyrics-page") as HTMLElement;
    const ttmlText = '<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="0.000" end="2.865">I promise that you&apos;ll never find another like me</p></div></body></tt>';
    const file = new File([ttmlText], "custom.ttml", { type: "application/ttml+xml" });

    fireEvent.drop(page, {
      dataTransfer: {
        files: [file],
        types: ["Files"],
      },
    });

    await waitFor(() =>
      expect(window.echo.lyrics.applyCustomLrc).toHaveBeenCalledWith(
        "track-1",
        ttmlText,
        "custom.ttml",
      ),
    );
    await waitFor(() => expect(container.textContent).toContain("I promise that you'll never find another like me"));
  });

  it("keeps a completed custom lyrics import from overwriting the next track", async () => {
    const firstTrack = makeTrack({
      id: "track-1",
      title: "First Song",
      path: "D:\\Music\\first.flac",
    });
    const secondTrack = makeTrack({
      id: "track-2",
      title: "Second Song",
      path: "D:\\Music\\second.flac",
    });
    let activeTrack = firstTrack;
    const pendingApply = deferred<TrackLyrics>();
    const audioStatusHandlers = new Set<(status: AudioStatus) => void>();
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue(makeAppSettings()),
        setSettings: vi.fn(),
        chooseLyricsWallpaper: vi.fn(),
      },
      playback: {
        getStatus: vi.fn().mockImplementation(() => Promise.resolve({
          state: "playing",
          currentTrackId: activeTrack.id,
          positionMs: 0,
          durationMs: activeTrack.duration * 1000,
          filePath: activeTrack.path,
        })),
        playLocalFile: vi.fn(),
        play: vi.fn(),
        pause: vi.fn(),
        stop: vi.fn(),
        seek: vi.fn(),
        openLocalAudioFile: vi.fn(),
      },
      audio: {
        getStatus: vi.fn().mockImplementation(() => Promise.resolve(makeAudioStatus(activeTrack))),
        listDevices: vi.fn(),
        setOutput: vi.fn(),
        onStatus: vi.fn((handler: (status: AudioStatus) => void) => {
          audioStatusHandlers.add(handler);
          return () => audioStatusHandlers.delete(handler);
        }),
      },
      lyrics: {
        getForTrack: vi.fn().mockImplementation((trackId: string) => Promise.resolve(
          makeTrackLyrics({
            trackId,
            title: trackId === firstTrack.id ? firstTrack.title : secondTrack.title,
            lines: [{
              timeMs: 0,
              text: trackId === firstTrack.id ? "First track lyric" : "Second track lyric",
            }],
          }),
        )),
        searchCandidates: vi.fn().mockResolvedValue([]),
        applyCandidate: vi.fn(),
        applyCustomLrc: vi.fn().mockReturnValue(pendingApply.promise),
        markInstrumental: vi.fn(),
        rejectCandidate: vi.fn(),
        setOffset: vi.fn(),
        clearCache: vi.fn(),
      },
      mv: {
        getSelected: vi.fn().mockResolvedValue(null),
      },
    } as unknown as Window["echo"];

    const SwitchTrack = (): JSX.Element => {
      const { replaceQueue } = usePlaybackQueue();

      useEffect(() => {
        replaceQueue([firstTrack], { startTrackId: firstTrack.id });
      }, [replaceQueue]);

      return (
        <>
          <button
            type="button"
            onClick={() => {
              activeTrack = secondTrack;
              replaceQueue([secondTrack], { startTrackId: secondTrack.id });
            }}
          >
            switch
          </button>
          <LyricsPage />
        </>
      );
    };

    const { container } = render(
      <PlaybackQueueProvider>
        <SwitchTrack />
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("First track lyric")).toBeTruthy();
    fireEvent.drop(container.querySelector(".lyrics-page") as HTMLElement, {
      dataTransfer: {
        files: [new File(["[00:01.00]Imported first lyric"], "custom.lrc", { type: "text/plain" })],
        types: ["Files"],
      },
    });
    await waitFor(() => expect(window.echo.lyrics.applyCustomLrc).toHaveBeenCalledWith(
      firstTrack.id,
      "[00:01.00]Imported first lyric",
      "custom.lrc",
    ));

    fireEvent.click(screen.getByRole("button", { name: "switch" }));
    act(() => {
      audioStatusHandlers.forEach((handler) => handler(makeAudioStatus(secondTrack)));
    });
    await waitFor(() => expect(container.textContent).toContain("Second track lyric"));

    await act(async () => {
      pendingApply.resolve(makeTrackLyrics({
        trackId: firstTrack.id,
        title: firstTrack.title,
        lines: [{ timeMs: 1000, text: "Imported first lyric" }],
      }));
      await pendingApply.promise;
    });

    expect(screen.queryByText("Imported first lyric")).toBeNull();
    expect(container.textContent).toContain("Second track lyric");
  });

  it("applies a custom lyrics file through the snapshot bridge", async () => {
    const track = makeTrack({
      id: "streaming:qqmusic:snapshot-import",
      path: "streaming:qqmusic:snapshot-import",
      mediaType: "streaming",
      provider: "qqmusic",
      providerTrackId: "snapshot-import",
      stableKey: "streaming:qqmusic:snapshot-import",
      title: "Snapshot Song",
      artist: "Snapshot Artist",
      album: "Snapshot Album",
      duration: 180,
    });
    mockEcho(track);
    window.echo.streaming = {
      getLyrics: vi.fn().mockResolvedValue(null),
    } as unknown as Window["echo"]["streaming"];
    const applyCustomLrc = vi.fn();
    const applyCustomLrcForSnapshot = vi.fn().mockResolvedValue(makeTrackLyrics({
      trackId: track.id,
      provider: "manual",
      title: track.title,
      artist: track.artist,
      album: track.album,
      lines: [{ timeMs: 1000, text: "Imported snapshot lyric" }],
    }));
    window.echo.lyrics = {
      getForTrack: vi.fn(),
      getForSnapshot: vi.fn().mockResolvedValue(makeTrackLyrics({
        trackId: track.id,
        lines: [{ timeMs: 0, text: "Current snapshot lyric" }],
      })),
      searchCandidates: vi.fn().mockResolvedValue([]),
      searchCandidatesForSnapshot: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      applyCandidateForSnapshot: vi.fn(),
      applyCustomLrc,
      applyCustomLrcForSnapshot,
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("Current snapshot lyric")).toBeTruthy();
    fireEvent.drop(container.querySelector(".lyrics-page") as HTMLElement, {
      dataTransfer: {
        files: [new File(["[00:01.00]Imported snapshot lyric"], "snapshot.lrc", { type: "text/plain" })],
        types: ["Files"],
      },
    });

    await waitFor(() => expect(applyCustomLrcForSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        trackId: track.id,
        mediaType: "streaming",
        sourceId: "snapshot-import",
        stableKey: track.stableKey,
      }),
      "[00:01.00]Imported snapshot lyric",
      "snapshot.lrc",
    ));
    expect(applyCustomLrc).not.toHaveBeenCalled();
    expect(await screen.findByText("Imported snapshot lyric")).toBeTruthy();
  });
});
