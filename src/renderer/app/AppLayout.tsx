import { Suspense, cloneElement, isValidElement, lazy, startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { X } from 'lucide-react';
import { PlayerBar } from '../components/player/PlayerBar';
import { PlaybackQueueDrawer } from '../components/player/PlaybackQueueDrawer';
import { AudioIssueDiagnosticsWindow } from '../components/player/AudioIssueDiagnosticsWindow';
import { contrastRatio, parseHexColor, sampleImageUrl, type ReadableColorSample, type Rgb } from '../components/lyrics/lyricsReadableColor';
import { isLyricsMiniPlayerRequiredForPageStyle } from '../components/lyrics/lyricsMiniPlayerPolicy';
import { DragDropImportOverlay } from '../components/import/DragDropImportOverlay';
import { loadPersistedRememberedAudioOutput } from '../components/player/audioOutputMemory';
import { Sidebar } from '../components/layout/Sidebar';
import { AppTitleBar } from '../components/layout/AppTitleBar';
import { EditableContextMenu } from '../components/ui/EditableContextMenu';
import { formatAudioHostError, shouldSuppressAudioHostError } from '../components/player/audioErrorFormat';
import { type AudioErrorNoticeEventDetail, showAudioErrorNoticeEvent } from '../utils/audioErrorNotice';
import { formatUserFacingError } from '../utils/userFacingError';
import { getAudioOutputRouteMutationSequence } from '../utils/audioOutputRouteEvents';
import { isProOnlyAppRouteId, pendingAppRouteStorageKey, preloadAppRoute } from './routes';
import type { AppRoute, AppRouteId } from './routes';
import {
  audioEchoSrcFilterProfiles,
  audioPcmDitherModes,
  audioSdmComputeBackends,
  audioSdmModes,
  audioSdmQualityProfiles,
  audioSdmTargetRates,
  type AudioEchoSrcFilterProfile,
  type AudioPcmDitherMode,
  type AudioSdmComputeBackend,
  type AudioSdmMode,
  type AudioSdmQualityProfile,
  type AudioSdmTargetRate,
  type AudioStatus,
} from '../../shared/types/audio';
import { type AppSettings, type AppThemeMode } from '../../shared/types/appSettings';
import { resolveEffectivePerformancePolicy } from '../../shared/utils/performancePolicy';
import type { DiagnosticMemoryPressureEvent } from '../../shared/types/diagnostics';
import type { LibraryTrack } from '../../shared/types/library';
import { isAuthorizationFailure } from '../../shared/ipcAuthorizationFailure';
import { useI18n } from '../i18n/I18nProvider';
import { likedChangedEvent, likedTracksChangedEvent } from '../hooks/useLikedMedia';
import { logLyricsConsole } from '../diagnostics/lyricsConsole';
import { rememberLibraryScanStatus } from '../stores/libraryScanSession';
import { clearSongsFirstPageSnapshot } from '../stores/songsFirstPageSnapshot';
import { usePlaybackQueue, type QueueItem } from '../stores/PlaybackQueueProvider';
import {
  getSharedPlaybackStatusSnapshot,
  setPlaybackStatusSnapshot,
  subscribeSharedPlaybackStatus,
  type PlaybackStatusSnapshot,
} from '../stores/playbackStatusStore';
import { useActiveWorkshopLyricsScene } from '../workshop/useActiveWorkshopLyricsScene';
import { workshopLyricsSceneHidesHostMiniPlayer } from '../../shared/types/workshopLyricsScene';
import { useLibraryStartupArtworkPreloader } from '../hooks/useLibraryStartupArtworkPreloader';
import { useRenderBudget } from '../performance/renderBudget';
import { useBackgroundWindowMemoryTrim } from '../performance/useBackgroundWindowMemoryTrim';
import { albumDetailNavigationEvent } from '../utils/albumNavigation';
import { artistDetailNavigationEvent } from '../utils/artistNavigation';
import { genreDetailNavigationEvent } from '../utils/genreNavigation';
import { localCoverDisplayUrl } from '../utils/coverDisplayUrl';
import { isImeComposingKeyEvent } from '../utils/imeInput';
import {
  acceleratorFromKeyboardEvent,
  acceleratorFromMouseEvent,
  acceleratorUsesMouseButton,
  isShortcutTextTarget,
} from '../utils/shortcutAccelerator';
import { AnimatedOutlet } from '../ui/motion/AnimatedOutlet';
import { applySidebarPreferences } from './sidebarPreferences';
import {
  defaultSidebarHiddenRouteIds,
  defaultSidebarRouteOrder,
  lockedHiddenSidebarRouteIds,
  lockedVisibleSidebarRouteIds,
  normalizeSidebarHiddenRouteIds,
  normalizeSidebarRouteOrder,
  type SidebarRouteId,
} from '../../shared/types/sidebar';
import type { PlaybackStatus } from '../../shared/types/playback';
import { resolveRetainedRouteLru, touchRetainedRoute } from './retainedRouteLru';
import { RouteActivityProvider } from '../components/ui/RouteActivityContext';
import { useEchoProEntitlement } from '../hooks/useEchoProEntitlement';

const AudioSettingsDrawer = lazy(() => import('../components/player/AudioSettingsDrawer').then((module) => ({ default: module.AudioSettingsDrawer })));
const LyricsSettingsDrawer = lazy(() => import('../components/lyrics/LyricsSettingsDrawer').then((module) => ({ default: module.LyricsSettingsDrawer })));
const LyricsVisualSettingsDrawer = lazy(() => import('../components/lyrics/LyricsVisualSettingsDrawer').then((module) => ({ default: module.LyricsVisualSettingsDrawer })));
const FirstRunWizard = lazy(() => import('../components/onboarding/FirstRunWizard').then((module) => ({ default: module.FirstRunWizard })));

type AppLayoutProps = {
  routes: AppRoute[];
};

const useMountedOnce = (active: boolean): boolean => {
  const [mounted, setMounted] = useState(active);

  useEffect(() => {
    if (active) {
      setMounted(true);
    }
  }, [active]);

  return mounted;
};

type LyricsNavigationDetail = {
  mode?: 'lyrics' | 'mv';
};

type LyricsViewMode = 'lyrics' | 'mv';

type RouteSwitchTrace = {
  sequence: number;
  from: AppRouteId;
  to: AppRouteId;
  trigger: string;
  startedAtMs: number;
};

const lyricsViewModeMemoryKey = 'echo:lyrics:view-mode';
const normalizeEchoSrcFilterProfile = (
  value: unknown,
  fallback: AudioEchoSrcFilterProfile = 'poly-sinc-gauss-long',
): AudioEchoSrcFilterProfile =>
  typeof value === 'string' && (audioEchoSrcFilterProfiles as readonly string[]).includes(value)
    ? value as AudioEchoSrcFilterProfile
    : fallback;

const normalizePcmDitherMode = (value: unknown): AudioPcmDitherMode =>
  typeof value === 'string' && (audioPcmDitherModes as readonly string[]).includes(value)
    ? value as AudioPcmDitherMode
    : 'off';

const normalizeSdmMode = (value: unknown): AudioSdmMode =>
  typeof value === 'string' && (audioSdmModes as readonly string[]).includes(value)
    ? value as AudioSdmMode
    : 'off';

const normalizeSdmTargetRate = (value: unknown): AudioSdmTargetRate =>
  typeof value === 'string' && (audioSdmTargetRates as readonly string[]).includes(value)
    ? value as AudioSdmTargetRate
    : 'dsd128';

const normalizeSdmQualityProfile = (value: unknown): AudioSdmQualityProfile =>
  typeof value === 'string' && (audioSdmQualityProfiles as readonly string[]).includes(value)
    ? value as AudioSdmQualityProfile
    : 'safe';

const normalizeSdmComputeBackend = (value: unknown): AudioSdmComputeBackend =>
  typeof value === 'string' && (audioSdmComputeBackends as readonly string[]).includes(value)
    ? value as AudioSdmComputeBackend
    : 'cpu';

const routeSwitchValue = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.round(value));
  }

  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  return null;
};

const logRouteSwitchDiagnostic = (
  phase: 'start' | 'end',
  details: Record<string, unknown>,
): void => {
  const fields = Object.entries(details)
    .map(([key, value]) => {
      const text = routeSwitchValue(value);
      return text === null ? null : `${key}=${text}`;
    })
    .filter((item): item is string => Boolean(item));
  console.info(`[routeSwitch:${phase}]${fields.length ? ` ${fields.join(' ')}` : ''}`);
};

const isLyricsViewMode = (value: unknown): value is LyricsViewMode =>
  value === 'lyrics';

const readRememberedLyricsViewMode = (): LyricsViewMode => {
  try {
    const value = window.sessionStorage.getItem(lyricsViewModeMemoryKey);
    return isLyricsViewMode(value) ? value : 'lyrics';
  } catch {
    return 'lyrics';
  }
};

const rememberLyricsViewMode = (mode: LyricsViewMode): void => {
  try {
    window.sessionStorage.setItem(lyricsViewModeMemoryKey, mode);
  } catch {
    // Best-effort page mode only.
  }
};

const RouteLoadingFallback = (): JSX.Element => (
  <div className="page-stack page-stack--route-loading" role="status" aria-live="polite">
    <div className="route-loading-card">
      <span className="route-loading-spinner" aria-hidden="true" />
      <span>Loading...</span>
    </div>
  </div>
);

const nonTextInputTypes = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

const isTouchKeyboardEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const editable = target.closest('input, textarea, [contenteditable], [role="textbox"]');
  if (!(editable instanceof HTMLElement)) {
    return false;
  }

  if (editable instanceof HTMLInputElement) {
    return !editable.disabled && !editable.readOnly && !nonTextInputTypes.has(editable.type);
  }

  if (editable instanceof HTMLTextAreaElement) {
    return !editable.disabled && !editable.readOnly;
  }

  return editable.getAttribute('contenteditable') !== 'false' && editable.getAttribute('aria-readonly') !== 'true';
};

type AppWallpaperSettings = Pick<
  AppSettings,
  | 'appWindowAcrylicEnabled'
  | 'appWindowAcrylicKeepWhenUnfocusedEnabled'
  | 'appWindowAcrylicTransparencyPercent'
  | 'appCustomWallpaperPath'
  | 'appPortraitWallpaperPath'
  | 'appWallpaperMediaType'
  | 'appPortraitWallpaperMediaType'
  | 'appWallpaperScalePercent'
  | 'appWallpaperBlurPx'
  | 'appWallpaperBrightnessPercent'
  | 'appWallpaperUiOpacityPercent'
  | 'appWallpaperVisualProtectionEnabled'
  | 'appWallpaperUnifiedOpacityEnabled'
  | 'appVideoWallpaperPauseMode'
  | 'lowSpecModeEnabled'
>;

type LyricsMiniPlayerSettings = Pick<
  AppSettings,
  | 'lyricsPlayerBarDrawerEnabled'
  | 'lyricsPlayerBarDrawerAutoHideEnabled'
  | 'lyricsPlayerBarDrawerShortcutEnabled'
  | 'lyricsPlayerBarDrawerShortcutAccelerator'
  | 'lyricsPlayerBarDrawerCompactOnIdleEnabled'
  | 'lyricsPlayerBarDrawerOpacityPercent'
  | 'lyricsPlayerBarDrawerColorMode'
  | 'lyricsPlayerBarDrawerColor'
  | 'lyricsPageStyle'
>;

type SidebarLayoutSettings = Pick<AppSettings, 'settingsHideSidebarEnabled' | 'sidebarAutoHideEnabled' | 'sidebarHiddenRouteIds' | 'sidebarIconOnlyEnabled' | 'sidebarRouteOrder'>;

const defaultAppWallpaperSettings: AppWallpaperSettings = {
  appCustomWallpaperPath: null,
  appPortraitWallpaperPath: null,
  appWallpaperMediaType: 'image',
  appPortraitWallpaperMediaType: 'image',
  appWallpaperScalePercent: 100,
  appWallpaperBlurPx: 0,
  appWallpaperBrightnessPercent: 100,
  appWallpaperUiOpacityPercent: 100,
  appWallpaperVisualProtectionEnabled: true,
  appWallpaperUnifiedOpacityEnabled: false,
  appVideoWallpaperPauseMode: 'smart',
  appWindowAcrylicEnabled: false,
  appWindowAcrylicKeepWhenUnfocusedEnabled: false,
  appWindowAcrylicTransparencyPercent: 70,
  lowSpecModeEnabled: false,
};

const defaultLyricsMiniPlayerSettings: LyricsMiniPlayerSettings = {
  lyricsPlayerBarDrawerEnabled: true,
  lyricsPlayerBarDrawerAutoHideEnabled: true,
  lyricsPlayerBarDrawerShortcutEnabled: false,
  lyricsPlayerBarDrawerShortcutAccelerator: null,
  lyricsPlayerBarDrawerCompactOnIdleEnabled: true,
  lyricsPlayerBarDrawerOpacityPercent: 78,
  lyricsPlayerBarDrawerColorMode: 'default',
  lyricsPlayerBarDrawerColor: '#232120',
  lyricsPageStyle: 'default',
};

const defaultSidebarLayoutSettings: SidebarLayoutSettings = {
  sidebarRouteOrder: [...defaultSidebarRouteOrder],
  sidebarHiddenRouteIds: [...defaultSidebarHiddenRouteIds],
  sidebarAutoHideEnabled: false,
  sidebarIconOnlyEnabled: false,
  settingsHideSidebarEnabled: false,
};

const lockedVisibleSidebarRouteIdSet = new Set<SidebarRouteId>(lockedVisibleSidebarRouteIds);
const lockedHiddenSidebarRouteIdSet = new Set<SidebarRouteId>(lockedHiddenSidebarRouteIds);

const normalizeAppThemeMode = (value: unknown): AppThemeMode =>
  value === 'light' || value === 'dark' || value === 'system' || value === 'ambient' ? value : 'light';

const readDocumentThemeMode = (): AppThemeMode => normalizeAppThemeMode(document.documentElement.dataset.themeMode);

const persistentRouteIds = new Set<AppRouteId>(['songs', 'albums', 'artists', 'genres', 'playlists', 'lyrics']);
const readSongsNavigationRemoteSourceId = (event: Event): string | null => {
  if (!(event instanceof CustomEvent) || typeof event.detail !== 'object' || event.detail === null) {
    return null;
  }

  const remoteSourceId = (event.detail as { remoteSourceId?: unknown }).remoteSourceId;
  return typeof remoteSourceId === 'string' && remoteSourceId.trim().length > 0 ? remoteSourceId : null;
};

const readAudioErrorNoticeMessage = (event: Event): string | null => {
  if (!(event instanceof CustomEvent)) {
    return null;
  }

  const detail = event.detail as AudioErrorNoticeEventDetail | null | undefined;
  if (typeof detail === 'string') {
    const message = detail.trim();
    return message ? message : null;
  }

  if (detail && typeof detail === 'object' && typeof detail.message === 'string') {
    const message = detail.message.trim();
    return message ? message : null;
  }

  return null;
};
const isSpotifyPlaybackSetupError = (message: string): boolean =>
  /spotify/iu.test(message) && /(SDK|DRM\/Widevine|keysystem|playback device|Connect device|official player)/iu.test(message);
const isMissingAudioRuntimeComponentError = (message: string): boolean =>
  /echo-audio-host binary not found|echo-audio-host spawn_error:.*(?:ENOENT|0xC0000135|126)|ffmpeg_missing|(?:spawn|open)\s+ffmpeg(?:\.exe)?\s+ENOENT/iu.test(message);

const inferAppWallpaperMediaType = (filePath: string | null | undefined): NonNullable<AppSettings['appWallpaperMediaType']> =>
  filePath && /\.(?:mp4|m4v|webm)$/iu.test(filePath.trim()) ? 'video' : 'image';

const isPortraitViewport = (): boolean => window.innerHeight > window.innerWidth;

const selectAppWallpaperSettings = (settings: AppSettings): AppWallpaperSettings => ({
  appCustomWallpaperPath: settings.appCustomWallpaperPath,
  appPortraitWallpaperPath: settings.appPortraitWallpaperPath ?? null,
  appWallpaperMediaType: settings.appWallpaperMediaType ?? 'image',
  appPortraitWallpaperMediaType: settings.appPortraitWallpaperMediaType ?? inferAppWallpaperMediaType(settings.appPortraitWallpaperPath),
  appWallpaperScalePercent: settings.appWallpaperScalePercent,
  appWallpaperBlurPx: settings.appWallpaperBlurPx,
  appWallpaperBrightnessPercent: settings.appWallpaperBrightnessPercent,
  appWallpaperUiOpacityPercent: settings.appWallpaperUiOpacityPercent,
  appWallpaperVisualProtectionEnabled: settings.appWallpaperVisualProtectionEnabled !== false,
  appWallpaperUnifiedOpacityEnabled: settings.appWallpaperUnifiedOpacityEnabled,
  appVideoWallpaperPauseMode: settings.appVideoWallpaperPauseMode ?? 'smart',
  appWindowAcrylicEnabled: settings.appWindowAcrylicEnabled === true,
  appWindowAcrylicKeepWhenUnfocusedEnabled: settings.appWindowAcrylicKeepWhenUnfocusedEnabled === true,
  appWindowAcrylicTransparencyPercent: Number.isFinite(settings.appWindowAcrylicTransparencyPercent)
    ? Math.max(0, Math.min(100, Math.round(Number(settings.appWindowAcrylicTransparencyPercent))))
    : defaultAppWallpaperSettings.appWindowAcrylicTransparencyPercent,
  lowSpecModeEnabled: settings.lowSpecModeEnabled === true,
});

const selectLyricsMiniPlayerSettings = (settings: Partial<AppSettings>): LyricsMiniPlayerSettings => ({
  lyricsPlayerBarDrawerEnabled: settings.lyricsPlayerBarDrawerEnabled !== false,
  lyricsPlayerBarDrawerAutoHideEnabled: settings.lyricsPlayerBarDrawerAutoHideEnabled !== false,
  lyricsPlayerBarDrawerShortcutEnabled: settings.lyricsPlayerBarDrawerShortcutEnabled === true,
  lyricsPlayerBarDrawerShortcutAccelerator:
    typeof settings.lyricsPlayerBarDrawerShortcutAccelerator === 'string'
      ? settings.lyricsPlayerBarDrawerShortcutAccelerator
      : null,
  lyricsPlayerBarDrawerCompactOnIdleEnabled: settings.lyricsPlayerBarDrawerCompactOnIdleEnabled !== false,
  lyricsPlayerBarDrawerOpacityPercent: Number.isFinite(settings.lyricsPlayerBarDrawerOpacityPercent)
    ? Math.max(20, Math.min(100, Math.round(Number(settings.lyricsPlayerBarDrawerOpacityPercent))))
    : defaultLyricsMiniPlayerSettings.lyricsPlayerBarDrawerOpacityPercent,
  lyricsPlayerBarDrawerColorMode:
    settings.lyricsPlayerBarDrawerColorMode === 'custom' ||
    settings.lyricsPlayerBarDrawerColorMode === 'cover' ||
    settings.lyricsPlayerBarDrawerColorMode === 'light'
      ? settings.lyricsPlayerBarDrawerColorMode
      : defaultLyricsMiniPlayerSettings.lyricsPlayerBarDrawerColorMode,
  lyricsPlayerBarDrawerColor: /^#[0-9a-fA-F]{6}$/u.test(settings.lyricsPlayerBarDrawerColor ?? '')
    ? (settings.lyricsPlayerBarDrawerColor as string).toUpperCase()
    : defaultLyricsMiniPlayerSettings.lyricsPlayerBarDrawerColor,
  lyricsPageStyle: settings.lyricsPageStyle ?? 'default',
});

const miniPlayerArtworkUrl = (
  track: { coverId: string | null; coverThumb: string | null } | null,
): string | null => localCoverDisplayUrl(track?.coverId, track?.coverThumb);

const mixRgb = (from: Rgb, to: Rgb, amount: number): Rgb => {
  const weight = Math.max(0, Math.min(1, amount));
  return {
    r: from.r + (to.r - from.r) * weight,
    g: from.g + (to.g - from.g) * weight,
    b: from.b + (to.b - from.b) * weight,
  };
};

const formatRgbChannels = (rgb: Rgb): string =>
  [rgb.r, rgb.g, rgb.b].map((channel) => Math.round(Math.max(0, Math.min(255, channel)))).join(', ');

const formatCssRgb = (rgb: Rgb): string => `rgb(${formatRgbChannels(rgb)})`;

const miniPlayerVisualOpacity = (surfaceOpacity: number): number => {
  const clampedSurfaceOpacity = Math.max(0.2, Math.min(1, surfaceOpacity));
  return Math.max(0.72, Math.min(1, 0.72 + clampedSurfaceOpacity * 0.28));
};

const tintedMiniPlayerRgb = (sample: ReadableColorSample): Rgb => {
  const darkAnchor = { r: 21, g: 22, b: 25 };
  const darkenAmount = sample.luminance > 0.42 ? 0.58 : sample.luminance > 0.22 ? 0.46 : 0.28;
  return mixRgb(sample.averageRgb, darkAnchor, darkenAmount);
};

const miniPlayerReadableLight = { r: 255, g: 255, b: 255 };
const miniPlayerReadableLightMuted = { r: 248, g: 250, b: 252 };
const miniPlayerReadableDark = { r: 17, g: 24, b: 39 };
const miniPlayerLightSurface = { r: 244, g: 247, b: 251 };
const miniPlayerLightBackdrop = { r: 238, g: 242, b: 247 };
const miniPlayerDarkBackdrop = { r: 7, g: 10, b: 15 };

const getMiniPlayerReadablePalette = (
  backgroundRgb: Rgb,
  surfaceOpacity = 1,
  backdropRgb: Rgb = backgroundRgb,
): Record<string, string> => {
  const visibleBackgroundRgb = mixRgb(backdropRgb, backgroundRgb, surfaceOpacity);
  const useLightText =
    contrastRatio(miniPlayerReadableLight, visibleBackgroundRgb) >=
    contrastRatio(miniPlayerReadableDark, visibleBackgroundRgb);

  return useLightText
    ? {
        '--lyrics-mini-player-readable-text': formatCssRgb(miniPlayerReadableLight),
        '--lyrics-mini-player-readable-muted': formatCssRgb(miniPlayerReadableLightMuted),
        '--lyrics-mini-player-time-text': formatCssRgb(miniPlayerReadableLight),
        '--lyrics-mini-player-progress-fill': 'rgba(255, 255, 255, 0.94)',
        '--lyrics-mini-player-readable-shadow': '0 1px 2px rgba(0, 0, 0, 0.48)',
        '--lyrics-mini-player-readable-button-bg': 'rgba(255, 255, 255, 0.10)',
        '--lyrics-mini-player-readable-button-bg-hover': 'rgba(255, 255, 255, 0.18)',
        '--lyrics-mini-player-readable-button-border': 'rgba(255, 255, 255, 0.16)',
        '--lyrics-mini-player-readable-play-bg': 'rgba(255, 255, 255, 0.20)',
        '--lyrics-mini-player-readable-play-bg-hover': 'rgba(255, 255, 255, 0.26)',
        '--lyrics-mini-player-readable-play-border': 'rgba(255, 255, 255, 0.20)',
        '--lyrics-mini-player-readable-track-bg': 'rgba(255, 255, 255, 0.24)',
        '--lyrics-mini-player-readable-track-border': 'rgba(255, 255, 255, 0.16)',
      }
    : {
        '--lyrics-mini-player-readable-text': formatCssRgb(miniPlayerReadableDark),
        '--lyrics-mini-player-readable-muted': formatCssRgb(miniPlayerReadableDark),
        '--lyrics-mini-player-time-text': formatCssRgb(miniPlayerReadableDark),
        '--lyrics-mini-player-progress-fill': 'rgba(17, 24, 39, 0.86)',
        '--lyrics-mini-player-readable-shadow': '0 1px 0 rgba(255, 255, 255, 0.54)',
        '--lyrics-mini-player-readable-button-bg': 'rgba(17, 24, 39, 0.08)',
        '--lyrics-mini-player-readable-button-bg-hover': 'rgba(17, 24, 39, 0.14)',
        '--lyrics-mini-player-readable-button-border': 'rgba(17, 24, 39, 0.14)',
        '--lyrics-mini-player-readable-play-bg': 'rgba(17, 24, 39, 0.12)',
        '--lyrics-mini-player-readable-play-bg-hover': 'rgba(17, 24, 39, 0.18)',
        '--lyrics-mini-player-readable-play-border': 'rgba(17, 24, 39, 0.18)',
        '--lyrics-mini-player-readable-track-bg': 'rgba(17, 24, 39, 0.18)',
        '--lyrics-mini-player-readable-track-border': 'rgba(17, 24, 39, 0.14)',
      };
};

const getDesktopLyricsForwardPositionMs = (status: AudioStatus | PlaybackStatus): number =>
  'positionSeconds' in status ? Math.round(status.positionSeconds * 1000) : status.positionMs;

const getDesktopLyricsForwardIdentity = (status: AudioStatus | PlaybackStatus): string | null =>
  status.currentTrackId ?? ('currentFilePath' in status ? status.currentFilePath : status.filePath) ?? null;

const openAudioSettingsEvent = 'app:open-audio-settings';
const openLyricsSettingsEvent = 'app:open-lyrics-settings';
const openLyricsVisualSettingsEvent = 'app:open-lyrics-visual-settings';
const lyricsDrawerToolsChangedEvent = 'app:lyrics-drawer-tools-changed';
const settingsBackNavigationEvent = 'app:navigate:settings-back';
const showChromeNoticeEvent = 'app:show-chrome-notice';
const lyricsMiniPlayerAutoHideDistancePx = 72;
const lyricsMiniPlayerAutoHideDelayMs = 280;
const settingsFocusMotionMs = 560;
const defaultChromeNoticeAutoHideMs = 5000;
const quickAudioNoticeAutoHideMs = 1800;
const upcomingTrackNoticeLeadSeconds = 10;
const upcomingTrackNoticeAutoHideMs = 6400;
const chromeNoticeEnterDelayMs = 16;
const chromeNoticeExitAnimationMs = 260;
const startupBlockedRouteIds = new Set<AppRouteId>();
const readNotificationsDisabled = (settings: Partial<AppSettings> | null | undefined): boolean =>
  settings?.notificationsDisabled === true;
const readUpcomingTrackNoticeEnabled = (settings: Partial<AppSettings> | null | undefined): boolean =>
  settings?.upcomingTrackNoticeEnabled === true;

const formatMemoryNoticeBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return 'n/a';
  }

  const mib = bytes / (1024 * 1024);
  if (mib < 1024) {
    return `${mib.toFixed(mib >= 100 ? 0 : 1)} MiB`;
  }

  return `${(mib / 1024).toFixed(2)} GiB`;
};

type UpcomingTrackNotice = {
  key: string;
  track: LibraryTrack;
};

type ChromeNoticePresenceProps = {
  ariaLive?: 'off' | 'polite' | 'assertive';
  children: ReactNode;
  className?: string;
  onExited?: () => void;
  role: 'alert' | 'status';
  show: boolean;
};

const ChromeNoticePresence = ({
  ariaLive,
  children,
  className,
  onExited,
  role,
  show,
}: ChromeNoticePresenceProps): JSX.Element | null => {
  const [shouldRender, setShouldRender] = useState(show);
  const [isVisible, setIsVisible] = useState(false);
  const latestChildrenRef = useRef(children);
  const onExitedRef = useRef(onExited);

  if (show) {
    latestChildrenRef.current = children;
  }

  useEffect(() => {
    onExitedRef.current = onExited;
  }, [onExited]);

  useEffect(() => {
    if (show) {
      setShouldRender(true);
      const timer = window.setTimeout(() => setIsVisible(true), chromeNoticeEnterDelayMs);
      return () => window.clearTimeout(timer);
    }

    setIsVisible(false);
    if (!shouldRender) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setShouldRender(false);
      onExitedRef.current?.();
    }, chromeNoticeExitAnimationMs);

    return () => window.clearTimeout(timer);
  }, [show, shouldRender]);

  if (!show && !shouldRender) {
    return null;
  }

  return (
    <div
      aria-hidden={isVisible ? undefined : true}
      aria-live={isVisible ? ariaLive : undefined}
      className={['chrome-notice', className, isVisible ? 'is-visible' : 'is-hiding'].filter(Boolean).join(' ')}
      role={isVisible ? role : undefined}
    >
      {show ? children : latestChildrenRef.current}
    </div>
  );
};

const getPlaybackClock = (
  snapshot: PlaybackStatusSnapshot,
): { state: string; trackId: string | null; positionSeconds: number; durationSeconds: number } | null => {
  const audioStatus = snapshot.audioStatus;
  if (audioStatus) {
    return {
      state: audioStatus.state,
      trackId: audioStatus.currentTrackId,
      positionSeconds: audioStatus.positionSeconds,
      durationSeconds: audioStatus.durationSeconds,
    };
  }

  const playbackStatus = snapshot.playbackStatus;
  if (!playbackStatus) {
    return null;
  }

  return {
    state: playbackStatus.state,
    trackId: playbackStatus.currentTrackId,
    positionSeconds: playbackStatus.positionMs / 1000,
    durationSeconds: playbackStatus.durationMs / 1000,
  };
};

const findCurrentQueueIndex = (
  items: QueueItem[],
  currentQueueId: string | null,
  currentTrackId: string | null,
): number => {
  const queueIndex = currentQueueId ? items.findIndex((item) => item.queueId === currentQueueId) : -1;
  if (queueIndex >= 0) {
    return queueIndex;
  }
  return currentTrackId ? items.findIndex((item) => item.track.id === currentTrackId) : -1;
};

const resolveUpcomingQueueItem = (
  items: QueueItem[],
  currentQueueId: string | null,
  currentTrackId: string | null,
  repeatMode: 'off' | 'one' | 'all',
): QueueItem | null => {
  if (items.length === 0 || repeatMode === 'one') {
    return null;
  }

  const currentIndex = findCurrentQueueIndex(items, currentQueueId, currentTrackId);
  if (currentIndex < 0) {
    return null;
  }

  if (currentIndex < items.length - 1) {
    return items[currentIndex + 1] ?? null;
  }

  return repeatMode === 'all' ? items[0] ?? null : null;
};

const trimRateTrailingZero = (value: string): string => value.replace(/\.0$/u, '');

const formatAudioNoticeRate = (value: number): string => {
  if (value >= 1000) {
    return `${trimRateTrailingZero((value / 1000).toFixed(value % 1000 === 0 ? 0 : 1))} kHz`;
  }

  return `${Math.round(value)} Hz`;
};

const getWindowsAudioDefaultFormatWarningRate = (warnings: string[] | null | undefined): number | null => {
  for (const warning of warnings ?? []) {
    const defaultFormatMatch = /^windows_audio_default_format_unusual:(\d+)$/u.exec(warning);
    if (defaultFormatMatch) {
      return Number(defaultFormatMatch[1]);
    }

    const sharedMixRateMatch = /^shared_output_mix_rate_too_high:\d+->(\d+)$/u.exec(warning);
    if (sharedMixRateMatch) {
      return Number(sharedMixRateMatch[1]);
    }
  }

  return null;
};

const hasMissingOutputDeviceFallbackWarning = (warnings: string[] | null | undefined): boolean =>
  warnings?.includes('output_device_not_found_fell_back_to_system_shared') === true;

const isStartupBlockedRouteId = (routeId: AppRouteId): boolean => startupBlockedRouteIds.has(routeId);

const readFallbackRouteId = (routes: AppRoute[]): AppRouteId => {
  const defaultRoute =
    routes.find((route) => route.id === 'home' && !isStartupBlockedRouteId(route.id)) ??
    routes.find((route) => route.id === 'songs' && !isStartupBlockedRouteId(route.id)) ??
    routes.find((route) => !isStartupBlockedRouteId(route.id)) ??
    routes[0];

  return defaultRoute?.id ?? 'songs';
};

const readInitialRouteId = (routes: AppRoute[]): AppRouteId => {
  const fallbackRouteId = readFallbackRouteId(routes);

  try {
    const pendingRoute = window.localStorage.getItem(pendingAppRouteStorageKey);
    if (pendingRoute && routes.some((route) => route.id === pendingRoute)) {
      window.localStorage.removeItem(pendingAppRouteStorageKey);
      return isStartupBlockedRouteId(pendingRoute as AppRouteId) ? fallbackRouteId : pendingRoute as AppRouteId;
    }
  } catch {
    // Fall back to the normal entrypoint when localStorage is unavailable.
  }

  return fallbackRouteId;
};

const diagnosticsCrashNoticeOptInStorageKey = 'echo:diagnostics:crash-notice-enabled';

const shouldAutoShowDiagnosticsCrashNotice = (): boolean => {
  try {
    return window.localStorage.getItem(diagnosticsCrashNoticeOptInStorageKey) === 'true';
  } catch {
    return false;
  }
};

export const AppLayout = ({ routes }: AppLayoutProps): JSX.Element => {
  const { unlocked: echoProUnlocked } = useEchoProEntitlement();
  const { t } = useI18n();
  const playbackQueue = usePlaybackQueue();
  useLibraryStartupArtworkPreloader();
  const preloadSettingsRoute = useCallback((): void => {
    void preloadAppRoute('settings');
  }, []);
  const [activeRouteId, setActiveRouteId] = useState<AppRouteId>(() => readInitialRouteId(routes));
  const [isLyricsSidebarRestoring, setIsLyricsSidebarRestoring] = useState(false);
  const [chromeNotice, setChromeNotice] = useState<string | null>(null);
  const [chromeNoticeAutoHideMs, setChromeNoticeAutoHideMs] = useState(defaultChromeNoticeAutoHideMs);
  const [isChromeNoticeVisible, setIsChromeNoticeVisible] = useState(false);
  const [notificationsDisabled, setNotificationsDisabled] = useState(false);
  const notificationsDisabledRef = useRef(false);
  const [upcomingTrackNoticeEnabled, setUpcomingTrackNoticeEnabled] = useState(false);
  const upcomingTrackNoticeEnabledRef = useRef(false);
  const [upcomingTrackNotice, setUpcomingTrackNotice] = useState<UpcomingTrackNotice | null>(null);
  const [isUpcomingTrackNoticeVisible, setIsUpcomingTrackNoticeVisible] = useState(false);
  const lastUpcomingTrackNoticeKeyRef = useRef<string | null>(null);
  const lastUpcomingTrackPlaybackIdentityRef = useRef<string | null>(null);
  const [audioErrorNotice, setAudioErrorNotice] = useState<{
    message: string;
    rawError: string;
    source: 'playback-status' | 'event';
  } | null>(null);
  const [audioComponentNotice, setAudioComponentNotice] = useState(false);
  const [audioComponentActionBusy, setAudioComponentActionBusy] = useState(false);
  const [diagnosticsNotice, setDiagnosticsNotice] = useState(false);
  const [memoryPressureNotice, setMemoryPressureNotice] = useState<DiagnosticMemoryPressureEvent | null>(null);
  const [firstRunSettings, setFirstRunSettings] = useState<AppSettings | null>(null);
  const [isFirstRunWizardOpen, setIsFirstRunWizardOpen] = useState(false);
  const [isFirstRunWizardClosing, setIsFirstRunWizardClosing] = useState(false);
  const firstRunWizardMountedRef = useRef(false);
  const firstRunWizardCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isAudioDrawerOpen, setIsAudioDrawerOpen] = useState(false);
  const [isLyricsDrawerOpen, setIsLyricsDrawerOpen] = useState(false);
  const [isLyricsVisualDrawerOpen, setIsLyricsVisualDrawerOpen] = useState(false);
  const [lyricsDrawerCurrentTrackTools, setLyricsDrawerCurrentTrackTools] = useState<ReactNode | null>(null);
  const shouldMountAudioDrawer = useMountedOnce(isAudioDrawerOpen);
  const shouldMountLyricsDrawer = useMountedOnce(isLyricsDrawerOpen);
  const shouldMountLyricsVisualDrawer = useMountedOnce(isLyricsVisualDrawerOpen);
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);
  const [isWindowFullscreen, setIsWindowFullscreen] = useState(false);
  const [isWindowFullscreenTransitioning, setIsWindowFullscreenTransitioning] = useState(false);
  const [windowFullscreenTransitionTarget, setWindowFullscreenTransitionTarget] = useState<boolean | null>(null);
  const [isLyricsQueueDrawerOpen, setIsLyricsQueueDrawerOpen] = useState(false);
  const [desktopLyricsVisible, setDesktopLyricsVisible] = useState(false);
  const [, setDesktopLyricsLocked] = useState(false);
  const [audioDrawerStatus, setAudioDrawerStatus] = useState<AudioStatus | null>(null);
  const [audioIssueDiagnosticsWindowEnabled, setAudioIssueDiagnosticsWindowEnabled] = useState(false);
  const [signalPathControlEnabled, setSignalPathControlEnabled] = useState(false);
  const [lyricsMiniPlayerSettings, setLyricsMiniPlayerSettings] = useState<LyricsMiniPlayerSettings>(defaultLyricsMiniPlayerSettings);
  const [lyricsMiniPlayerSettingsReady, setLyricsMiniPlayerSettingsReady] = useState(false);
  const [sidebarLayoutSettings, setSidebarLayoutSettings] = useState<SidebarLayoutSettings>(defaultSidebarLayoutSettings);
  const [lyricsMiniPlayerCoverSample, setLyricsMiniPlayerCoverSample] = useState<ReadableColorSample | null>(null);
  const [isLyricsMiniPlayerAutoHidden, setIsLyricsMiniPlayerAutoHidden] = useState(false);
  const [isLyricsMiniPlayerShortcutHidden, setIsLyricsMiniPlayerShortcutHidden] = useState(false);
  const [activeLyricsViewMode, setActiveLyricsViewMode] = useState<LyricsViewMode>(() => readRememberedLyricsViewMode());
  const lastDesktopLyricsForwardRef = useRef<string | null>(null);

  useEffect(() => {
    const handleLyricsDrawerToolsChanged = (event: Event): void => {
      if (!(event instanceof CustomEvent)) {
        return;
      }

      setLyricsDrawerCurrentTrackTools((event.detail as { currentTrackTools?: ReactNode | null } | null)?.currentTrackTools ?? null);
    };

    window.addEventListener(lyricsDrawerToolsChangedEvent, handleLyricsDrawerToolsChanged);
    return () => window.removeEventListener(lyricsDrawerToolsChangedEvent, handleLyricsDrawerToolsChanged);
  }, []);

  useEffect(() => {
    const publishDesktopLyricsStatus = (): void => {
      const desktopLyrics = window.echo?.desktopLyrics;
      if (!desktopLyrics) {
        return;
      }

      const statusSnapshot = getSharedPlaybackStatusSnapshot();
      if (statusSnapshot.audioStatus) {
        const status = statusSnapshot.audioStatus;
        const positionBucket = Math.floor(getDesktopLyricsForwardPositionMs(status) / 5000);
        const logKey = `audio:${getDesktopLyricsForwardIdentity(status) ?? 'unknown'}:${status.state}:${positionBucket}`;
        if (lastDesktopLyricsForwardRef.current !== logKey) {
          lastDesktopLyricsForwardRef.current = logKey;
          logLyricsConsole('desktop.forward-clock', {
            source: 'audio',
            state: status.state,
            trackId: status.currentTrackId,
            identity: getDesktopLyricsForwardIdentity(status),
            positionMs: getDesktopLyricsForwardPositionMs(status),
            durationMs: Math.round(status.durationSeconds * 1000),
            playbackRate: status.playbackRate ?? 1,
          });
        }
        desktopLyrics.publishAudioStatus?.(status);
        return;
      }
      if (statusSnapshot.playbackStatus) {
        const status = statusSnapshot.playbackStatus;
        const positionBucket = Math.floor(getDesktopLyricsForwardPositionMs(status) / 5000);
        const logKey = `playback:${getDesktopLyricsForwardIdentity(status) ?? 'unknown'}:${status.state}:${positionBucket}`;
        if (lastDesktopLyricsForwardRef.current !== logKey) {
          lastDesktopLyricsForwardRef.current = logKey;
          logLyricsConsole('desktop.forward-clock', {
            source: 'playback',
            state: status.state,
            trackId: status.currentTrackId,
            identity: getDesktopLyricsForwardIdentity(status),
            positionMs: getDesktopLyricsForwardPositionMs(status),
            durationMs: status.durationMs,
            playbackRate: 1,
          });
        }
        desktopLyrics.publishPlaybackStatus?.(status);
      }
    };

    publishDesktopLyricsStatus();
    return subscribeSharedPlaybackStatus(publishDesktopLyricsStatus);
  }, []);
  const [appWallpaperSettings, setAppWallpaperSettings] = useState<AppWallpaperSettings>(defaultAppWallpaperSettings);
  const [appWallpaperSettingsReady, setAppWallpaperSettingsReady] = useState(false);
  const [appAppearanceTheme, setAppAppearanceTheme] = useState<AppThemeMode>(() => readDocumentThemeMode());
  const [loadedAppWallpaperKey, setLoadedAppWallpaperKey] = useState<string | null>(null);
  const [failedAppWallpaperKey, setFailedAppWallpaperKey] = useState<string | null>(null);
  const [isAppWallpaperPortraitViewport, setIsAppWallpaperPortraitViewport] = useState(() => isPortraitViewport());
  const [sessionRenderPressureReduced, setSessionRenderPressureReduced] = useState(false);
  const renderBudget = useRenderBudget({
    pressureReduced: appWallpaperSettings.lowSpecModeEnabled || sessionRenderPressureReduced,
  });
  useBackgroundWindowMemoryTrim({
    isMinimized: renderBudget.isMinimized,
    isWindowHidden: renderBudget.isWindowHidden,
  });
  const isAppWallpaperDocumentHidden = !renderBudget.isVisible;
  const isWindowFocused = renderBudget.isFocused;
  const appWallpaperVideoRef = useRef<HTMLVideoElement | null>(null);
  const fullscreenTransitionTimerRef = useRef<number | null>(null);
  const fullscreenTransitionStartedAtRef = useRef(0);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!renderBudget.isVisible || !appWallpaperSettingsReady || appWallpaperSettings.lowSpecModeEnabled) {
      return undefined;
    }

    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (!idleWindow.requestIdleCallback) {
      return undefined;
    }

    const handle = idleWindow.requestIdleCallback(preloadSettingsRoute, { timeout: 8_000 });
    return () => idleWindow.cancelIdleCallback?.(handle);
  }, [appWallpaperSettings.lowSpecModeEnabled, appWallpaperSettingsReady, preloadSettingsRoute, renderBudget.isVisible]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lyricsMiniPlayerHostRef = useRef<HTMLDivElement | null>(null);
  const lyricsMiniPlayerAutoHideTimerRef = useRef<number | null>(null);
  const touchOnScreenKeyboardEnabledRef = useRef(false);
  const touchKeyboardLastRequestAtRef = useRef(0);
  const lastAudioErrorRef = useRef<string | null>(null);
  const notifiedWindowsAudioDefaultFormatKeysRef = useRef<Set<string>>(new Set());
  const hadMissingOutputDeviceFallbackWarningRef = useRef(false);
  const previousRouteIdRef = useRef<AppRouteId>('songs');
  const settingsReturnRouteIdRef = useRef<AppRouteId>('songs');
  const settingsFocusWasActiveRef = useRef(false);
  const settingsFocusMotionTimerRef = useRef<number | null>(null);
  const [settingsFocusMotion, setSettingsFocusMotion] = useState(false);
  const routeNavigationRequestRef = useRef(0);
  const routeSwitchSequenceRef = useRef(0);
  const routeSwitchTraceRef = useRef<RouteSwitchTrace | null>(null);
  const routeSwitchCommittedRouteIdRef = useRef<AppRouteId>(activeRouteId);
  const activeRouteIdRef = useRef<AppRouteId>(activeRouteId);
  const availableRoutes = useMemo(
    () => routes.filter((route) => echoProUnlocked || !isProOnlyAppRouteId(route.id)),
    [echoProUnlocked, routes],
  );

  const visibleRoutes = useMemo(
    () => applySidebarPreferences(availableRoutes, sidebarLayoutSettings),
    [availableRoutes, sidebarLayoutSettings],
  );
  const sidebarRouteById = useMemo(() => new Map(availableRoutes.map((route) => [route.id, route])), [availableRoutes]);

  const persistSidebarLayoutPatch = useCallback((patch: Pick<SidebarLayoutSettings, 'sidebarHiddenRouteIds' | 'sidebarRouteOrder'>): void => {
    const nextSettings: Pick<SidebarLayoutSettings, 'sidebarHiddenRouteIds' | 'sidebarRouteOrder'> = {
      sidebarRouteOrder: normalizeSidebarRouteOrder(patch.sidebarRouteOrder),
      sidebarHiddenRouteIds: normalizeSidebarHiddenRouteIds(patch.sidebarHiddenRouteIds),
    };

    setSidebarLayoutSettings((current) => ({
      ...current,
      ...nextSettings,
    }));

    void window.echo?.app?.setSettings?.(nextSettings)
      .then((settings) => {
        window.dispatchEvent(new CustomEvent('settings:changed', { detail: settings }));
      })
      .catch(() => undefined);
  }, []);

  const handleSidebarRouteHide = useCallback(
    (routeId: SidebarRouteId): void => {
      if (lockedVisibleSidebarRouteIdSet.has(routeId) || lockedHiddenSidebarRouteIdSet.has(routeId)) {
        return;
      }

      persistSidebarLayoutPatch({
        sidebarRouteOrder: normalizeSidebarRouteOrder(sidebarLayoutSettings.sidebarRouteOrder),
        sidebarHiddenRouteIds: normalizeSidebarHiddenRouteIds([...normalizeSidebarHiddenRouteIds(sidebarLayoutSettings.sidebarHiddenRouteIds), routeId]),
      });
    },
    [persistSidebarLayoutPatch, sidebarLayoutSettings.sidebarHiddenRouteIds, sidebarLayoutSettings.sidebarRouteOrder],
  );

  const handleSidebarRouteReorder = useCallback(
    (routeIds: SidebarRouteId[], placement: AppRoute['placement']): void => {
      const nextVisibleRouteIds = routeIds.filter((routeId) => sidebarRouteById.get(routeId)?.placement === placement);
      const routeIdSet = new Set(nextVisibleRouteIds);
      const remainingRouteIds = [...nextVisibleRouteIds];
      const currentOrder = normalizeSidebarRouteOrder(sidebarLayoutSettings.sidebarRouteOrder);
      const nextOrder = currentOrder.map((routeId) => {
        const route = sidebarRouteById.get(routeId);
        if (route?.placement !== placement || !routeIdSet.has(routeId)) {
          return routeId;
        }

        return remainingRouteIds.shift() ?? routeId;
      });

      persistSidebarLayoutPatch({
        sidebarRouteOrder: nextOrder,
        sidebarHiddenRouteIds: normalizeSidebarHiddenRouteIds(sidebarLayoutSettings.sidebarHiddenRouteIds),
      });
    },
    [persistSidebarLayoutPatch, sidebarLayoutSettings.sidebarHiddenRouteIds, sidebarLayoutSettings.sidebarRouteOrder, sidebarRouteById],
  );

  const startWindowFullscreenTransition = useCallback((nextFullscreen: boolean): void => {
    fullscreenTransitionStartedAtRef.current = Date.now();

    if (fullscreenTransitionTimerRef.current !== null) {
      window.clearTimeout(fullscreenTransitionTimerRef.current);
    }

    setIsWindowFullscreenTransitioning(false);
    setWindowFullscreenTransitionTarget(nextFullscreen);
    window.requestAnimationFrame(() => {
      setIsWindowFullscreenTransitioning(true);
      fullscreenTransitionTimerRef.current = window.setTimeout(() => {
        fullscreenTransitionTimerRef.current = null;
        setWindowFullscreenTransitionTarget(null);
        setIsWindowFullscreenTransitioning(false);
      }, 380);
    });
  }, []);

  useEffect(() => () => {
    if (fullscreenTransitionTimerRef.current !== null) {
      window.clearTimeout(fullscreenTransitionTimerRef.current);
      fullscreenTransitionTimerRef.current = null;
    }
    setWindowFullscreenTransitionTarget(null);
  }, []);
  const navigableRoutes = availableRoutes;
  const activeRoute = useMemo(
    () => navigableRoutes.find((route) => route.id === activeRouteId) ?? navigableRoutes[0] ?? availableRoutes[0],
    [activeRouteId, availableRoutes, navigableRoutes],
  );
  const [mountedPersistentRouteIds, setMountedPersistentRouteIds] = useState<AppRouteId[]>(() =>
    persistentRouteIds.has(activeRouteId) ? [activeRouteId] : [],
  );
  const pruneInactivePersistentRoutes = useCallback((): void => {
    const activeId = activeRouteIdRef.current;
    setMountedPersistentRouteIds((current) => current.filter((routeId) => routeId === activeId && persistentRouteIds.has(routeId)));
  }, []);
  const renderedRoutes = useMemo(() => {
    const activeRouteIds = new Set<AppRouteId>();
    const nextRoutes: AppRoute[] = [];

    for (const route of navigableRoutes) {
      if (!mountedPersistentRouteIds.includes(route.id)) {
        continue;
      }

      nextRoutes.push(route);
      activeRouteIds.add(route.id);
    }

    if (activeRoute && !activeRouteIds.has(activeRoute.id)) {
      nextRoutes.push(activeRoute);
    }

    return nextRoutes;
  }, [activeRoute, mountedPersistentRouteIds, navigableRoutes]);

  const isStandaloneRoute = activeRoute.chrome === 'standalone';
  const isLyricsRoute = activeRouteId === 'lyrics';
  const activeWorkshopLyricsScene = useActiveWorkshopLyricsScene();
  const hideSidebarForSettings = sidebarLayoutSettings.settingsHideSidebarEnabled && activeRouteId === 'settings';
  const sidebarAutoHideActive = sidebarLayoutSettings.sidebarAutoHideEnabled && !hideSidebarForSettings && !isLyricsRoute;
  useEffect(() => {
    if (!isLyricsSidebarRestoring || isLyricsRoute) {
      return undefined;
    }

    const animationFrame = window.requestAnimationFrame(() => setIsLyricsSidebarRestoring(false));
    return () => window.cancelAnimationFrame(animationFrame);
  }, [isLyricsRoute, isLyricsSidebarRestoring]);
  useEffect(() => {
    if (!isLyricsRoute && isLyricsVisualDrawerOpen) {
      setIsLyricsVisualDrawerOpen(false);
    }
  }, [isLyricsRoute, isLyricsVisualDrawerOpen]);
  const shouldRenderDragDropImportOverlay = !isStandaloneRoute;
  const shouldRenderFirstRunWizard = isFirstRunWizardOpen || isFirstRunWizardClosing;
  const isLyricsMiniPlayerRequired = isLyricsMiniPlayerRequiredForPageStyle(
    lyricsMiniPlayerSettings.lyricsPageStyle,
  );
  const shouldUseLyricsPlayerDrawer =
    isLyricsRoute &&
    (isLyricsMiniPlayerRequired ||
      lyricsMiniPlayerSettings.lyricsPlayerBarDrawerEnabled === true);
  const isLyricsMiniPlayerShortcutModeActive =
    shouldUseLyricsPlayerDrawer &&
    !isLyricsMiniPlayerRequired &&
    lyricsMiniPlayerSettings.lyricsPlayerBarDrawerShortcutEnabled === true &&
    Boolean(lyricsMiniPlayerSettings.lyricsPlayerBarDrawerShortcutAccelerator);
  const shouldAutoHideLyricsMiniPlayer =
    shouldUseLyricsPlayerDrawer &&
    !isLyricsMiniPlayerShortcutModeActive &&
    lyricsMiniPlayerSettings.lyricsPlayerBarDrawerAutoHideEnabled === true;
  const isLyricsMiniPlayerVisuallyHidden =
    (shouldAutoHideLyricsMiniPlayer && isLyricsMiniPlayerAutoHidden && !isLyricsQueueDrawerOpen) ||
    (isLyricsMiniPlayerShortcutModeActive && isLyricsMiniPlayerShortcutHidden);
  // A Workshop scene may replace the mini player with its own transport row; the
  // shared guard keeps the host bar whenever the scene has no play control of its own.
  const workshopSceneOwnsTransport =
    isLyricsRoute &&
    activeWorkshopLyricsScene !== null &&
    workshopLyricsSceneHidesHostMiniPlayer(activeWorkshopLyricsScene.scene);
  const shouldRenderPlayerBar = (!isStandaloneRoute || isLyricsRoute) && !workshopSceneOwnsTransport;
  const hasDesktopLyricsBridge = Boolean(window.echo?.desktopLyrics);
  const currentMiniPlayerTrack = playbackQueue.currentTrack ?? playbackQueue.lastPlayedTrack ?? null;
  const lyricsMiniPlayerCoverUrl = useMemo(
    () => miniPlayerArtworkUrl(currentMiniPlayerTrack),
    [currentMiniPlayerTrack],
  );
  const lyricsMiniPlayerStyle = useMemo<CSSProperties>(() => {
    const opacity = Math.max(0.2, Math.min(1, (lyricsMiniPlayerSettings.lyricsPlayerBarDrawerOpacityPercent ?? 78) / 100));
    const colorMode = lyricsMiniPlayerSettings.lyricsPlayerBarDrawerColorMode ?? 'default';
    const fallbackRgb = parseHexColor(defaultLyricsMiniPlayerSettings.lyricsPlayerBarDrawerColor ?? '#232120') ?? { r: 35, g: 33, b: 32 };
    const customRgb = parseHexColor(lyricsMiniPlayerSettings.lyricsPlayerBarDrawerColor) ?? fallbackRgb;
    const rgb =
      colorMode === 'cover' && lyricsMiniPlayerCoverSample
        ? tintedMiniPlayerRgb(lyricsMiniPlayerCoverSample)
        : colorMode === 'custom'
          ? customRgb
          : colorMode === 'light'
            ? miniPlayerLightSurface
            : fallbackRgb;
    const channels = formatRgbChannels(rgb);
    const effectiveTheme =
      appAppearanceTheme === 'system' ? document.documentElement.dataset.theme : appAppearanceTheme;
    const backdropRgb =
      effectiveTheme === 'dark' || effectiveTheme === 'ambient' ? miniPlayerDarkBackdrop : miniPlayerLightBackdrop;
    const borderColor =
      colorMode === 'light'
        ? `rgba(17, 24, 39, ${Math.max(0.1, opacity * 0.14).toFixed(2)})`
        : `rgba(255, 255, 255, ${Math.max(0.08, opacity * 0.2).toFixed(2)})`;

    return {
      '--lyrics-mini-player-opacity': opacity.toFixed(2),
      '--lyrics-mini-player-visual-opacity': miniPlayerVisualOpacity(opacity).toFixed(2),
      '--lyrics-mini-player-background': `rgba(${channels}, ${opacity.toFixed(2)})`,
      '--lyrics-mini-player-border': borderColor,
      ...getMiniPlayerReadablePalette(rgb, opacity, backdropRgb),
    } as CSSProperties;
  }, [
    lyricsMiniPlayerCoverSample,
    lyricsMiniPlayerSettings.lyricsPlayerBarDrawerColor,
    lyricsMiniPlayerSettings.lyricsPlayerBarDrawerColorMode,
    lyricsMiniPlayerSettings.lyricsPlayerBarDrawerOpacityPercent,
    appAppearanceTheme,
  ]);
  const usesPortraitAppWallpaperOverride = Boolean(
    isAppWallpaperPortraitViewport && appWallpaperSettings.appPortraitWallpaperPath,
  );
  const activeAppWallpaperPath = usesPortraitAppWallpaperOverride
    ? appWallpaperSettings.appPortraitWallpaperPath
    : appWallpaperSettings.appCustomWallpaperPath;
  const activeAppWallpaperMediaType = usesPortraitAppWallpaperOverride
    ? appWallpaperSettings.appPortraitWallpaperMediaType ?? inferAppWallpaperMediaType(activeAppWallpaperPath)
    : appWallpaperSettings.appWallpaperMediaType ?? inferAppWallpaperMediaType(activeAppWallpaperPath);
  const performancePolicy = resolveEffectivePerformancePolicy(appWallpaperSettings);
  useLayoutEffect(() => {
    const wasSettingsFocus = settingsFocusWasActiveRef.current;
    settingsFocusWasActiveRef.current = Boolean(hideSidebarForSettings);

    if (hideSidebarForSettings || !wasSettingsFocus) {
      if (settingsFocusMotionTimerRef.current !== null) {
        window.clearTimeout(settingsFocusMotionTimerRef.current);
        settingsFocusMotionTimerRef.current = null;
      }
      setSettingsFocusMotion(false);
      return;
    }

    if (
      performancePolicy.lowSpecModeEnabled
      || (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    ) {
      setSettingsFocusMotion(false);
      return;
    }

    setSettingsFocusMotion(true);
    settingsFocusMotionTimerRef.current = window.setTimeout(() => {
      setSettingsFocusMotion(false);
      settingsFocusMotionTimerRef.current = null;
    }, settingsFocusMotionMs);

    return () => {
      if (settingsFocusMotionTimerRef.current !== null) {
        window.clearTimeout(settingsFocusMotionTimerRef.current);
        settingsFocusMotionTimerRef.current = null;
      }
    };
  }, [hideSidebarForSettings, performancePolicy.lowSpecModeEnabled]);
  const activeAppWallpaperOrientation = isAppWallpaperPortraitViewport ? 'portrait' : 'landscape';
  const isAmbientThemeActive = appAppearanceTheme === 'ambient';
  const appWallpaperUrl = !isAmbientThemeActive && activeAppWallpaperPath
    ? `echo-wallpaper://${usesPortraitAppWallpaperOverride ? 'app-portrait' : 'app'}/custom?path=${encodeURIComponent(activeAppWallpaperPath)}`
    : null;
  const isAppWallpaperVideo = activeAppWallpaperMediaType === 'video';
  const shouldMountAppWallpaperMedia = Boolean(
    appWallpaperUrl && (!isAppWallpaperVideo || performancePolicy.allowVideoWallpaper),
  );
  const shouldShowAppWallpaperVisual = Boolean(
    shouldMountAppWallpaperMedia && !isLyricsRoute,
  );

  const handleSidebarRouteShow = useCallback(
    (routeId: SidebarRouteId): void => {
      persistSidebarLayoutPatch({
        sidebarRouteOrder: normalizeSidebarRouteOrder(sidebarLayoutSettings.sidebarRouteOrder),
        sidebarHiddenRouteIds: normalizeSidebarHiddenRouteIds(
          normalizeSidebarHiddenRouteIds(sidebarLayoutSettings.sidebarHiddenRouteIds).filter((hiddenRouteId) => hiddenRouteId !== routeId),
        ),
      });
    },
    [persistSidebarLayoutPatch, sidebarLayoutSettings.sidebarHiddenRouteIds, sidebarLayoutSettings.sidebarRouteOrder],
  );

  const handleSidebarIconOnlyToggle = useCallback((): void => {
    const nextSettings: Pick<SidebarLayoutSettings, 'sidebarAutoHideEnabled' | 'sidebarIconOnlyEnabled'> = {
      sidebarAutoHideEnabled: false,
      sidebarIconOnlyEnabled: !sidebarLayoutSettings.sidebarIconOnlyEnabled,
    };

    setSidebarLayoutSettings((current) => ({
      ...current,
      ...nextSettings,
    }));

    void window.echo?.app?.setSettings?.(nextSettings)
      .then((settings) => {
        window.dispatchEvent(new CustomEvent('settings:changed', { detail: settings }));
      })
      .catch(() => undefined);
  }, [sidebarLayoutSettings.sidebarIconOnlyEnabled]);
  const appWallpaperKey = appWallpaperUrl && shouldMountAppWallpaperMedia
    ? `${activeAppWallpaperOrientation}:${activeAppWallpaperMediaType}:${appWallpaperUrl}`
    : null;
  const isAppWallpaperReady = Boolean(appWallpaperKey && loadedAppWallpaperKey === appWallpaperKey);
  const hasAppWallpaperLoadError = Boolean(appWallpaperKey && failedAppWallpaperKey === appWallpaperKey);
  const shouldPauseAppWallpaperForRenderBudget =
    renderBudget.mode === 'pressure' ||
    (appWallpaperSettings.appVideoWallpaperPauseMode !== 'never' &&
      (renderBudget.mode === 'hidden' ||
        (appWallpaperSettings.appVideoWallpaperPauseMode === 'smart' && renderBudget.mode === 'unfocused')));
  const shouldPauseAppWallpaperVideo = Boolean(
    isAppWallpaperVideo &&
    appWallpaperUrl &&
    (!shouldShowAppWallpaperVisual || shouldPauseAppWallpaperForRenderBudget),
  );
  const appWallpaperRawUiAlpha = isAppWallpaperReady
    ? Math.max(0, Math.min(1, appWallpaperSettings.appWallpaperUiOpacityPercent / 100))
    : 1;
  const isAppWallpaperUiTransparent =
    isAppWallpaperReady &&
    !appWallpaperSettings.appWallpaperVisualProtectionEnabled &&
    appWallpaperRawUiAlpha <= 0;
  const isAppWallpaperUiZero = isAppWallpaperReady && appWallpaperRawUiAlpha <= 0;
  const appWallpaperStyle = useMemo<CSSProperties>(() => {
    const blurPx = performancePolicy.appWallpaperBlurPx;
    const brightnessPercent = appWallpaperSettings.appWallpaperBrightnessPercent;
    const baseScale = appWallpaperSettings.appWallpaperScalePercent / 100;
    const blurOverscanScale = blurPx > 0 ? Math.min(0.18, blurPx * 0.004) : 0;
    const filterParts = [
      blurPx > 0 ? `blur(${blurPx}px)` : null,
      brightnessPercent !== 100 ? `brightness(${brightnessPercent}%)` : null,
    ].filter(Boolean);

    return {
      filter: filterParts.length ? filterParts.join(' ') : 'none',
      transform: `scale(${(baseScale + blurOverscanScale).toFixed(3)})`,
    };
  }, [
    performancePolicy.appWallpaperBlurPx,
    appWallpaperSettings.appWallpaperBrightnessPercent,
    appWallpaperSettings.appWallpaperScalePercent,
    isAppWallpaperVideo,
  ]);
  const appShellStyle = useMemo(() => {
    const uiAlpha =
      isAppWallpaperReady && appWallpaperSettings.appWallpaperVisualProtectionEnabled
        ? Math.max(appWallpaperRawUiAlpha, 0.36)
        : appWallpaperRawUiAlpha;
    const blurAlpha = appWallpaperRawUiAlpha > 0 ? Math.max(uiAlpha, 0.45) : uiAlpha;
    const isUnified = isAppWallpaperReady && appWallpaperSettings.appWallpaperUnifiedOpacityEnabled;
    const scaledAlpha = (value: number): string => (uiAlpha * value).toFixed(3);
    const unifiedAlpha = uiAlpha.toFixed(3);
    const acrylicTransparencyPercent = Math.max(0, Math.min(100, appWallpaperSettings.appWindowAcrylicTransparencyPercent ?? 70));
    const acrylicOpacityPercent = 100 - acrylicTransparencyPercent;
    const acrylicReadabilityPercent = Math.max(acrylicOpacityPercent, 14);
    const acrylicTextProtectionPercent = Math.max(acrylicOpacityPercent, 22);
    const acrylicMix = (factor: number, max: number): string => `${Math.round(Math.max(0, Math.min(max, acrylicOpacityPercent * factor)))}%`;
    const acrylicReadableMix = (factor: number, max: number): string => `${Math.round(Math.max(0, Math.min(max, acrylicReadabilityPercent * factor)))}%`;
    const acrylicProtectionMix = (factor: number, max: number): string => `${Math.round(Math.max(0, Math.min(max, acrylicTextProtectionPercent * factor)))}%`;

    return {
      '--app-acrylic-readable-page-strong-mix': acrylicReadableMix(0.5, 46),
      '--app-acrylic-readable-page-muted-mix': acrylicReadableMix(0.34, 38),
      '--app-acrylic-readable-surface-mix': acrylicReadableMix(0.58, 48),
      '--app-acrylic-readable-surface-strong-mix': acrylicReadableMix(0.8, 56),
      '--app-acrylic-readable-sidebar-mix': acrylicReadableMix(0.68, 50),
      '--app-acrylic-readable-player-mix': acrylicReadableMix(0.88, 58),
      '--app-acrylic-text-protection-mix': acrylicProtectionMix(0.18, 18),
      '--app-acrylic-page-strong-mix': acrylicMix(0.62, 52),
      '--app-acrylic-page-muted-mix': acrylicMix(0.4, 44),
      '--app-acrylic-titlebar-mix': acrylicMix(0.42, 46),
      '--app-acrylic-sidebar-strong-mix': acrylicMix(0.78, 58),
      '--app-acrylic-sidebar-muted-mix': acrylicMix(0.58, 50),
      '--app-acrylic-player-strong-mix': acrylicMix(1.05, 68),
      '--app-acrylic-player-mix': acrylicMix(0.82, 60),
      '--app-acrylic-surface-mix': acrylicMix(0.62, 52),
      '--app-acrylic-surface-strong-mix': acrylicMix(0.9, 64),
      '--app-acrylic-surface-muted-mix': acrylicMix(0.48, 46),
      '--app-acrylic-field-mix': acrylicMix(1.05, 68),
      '--app-acrylic-button-mix': acrylicMix(0.85, 62),
      '--app-acrylic-button-hover-mix': acrylicMix(1.1, 72),
      '--app-acrylic-row-mix': acrylicMix(0.42, 42),
      '--app-acrylic-row-hover-mix': acrylicMix(0.72, 56),
      '--app-acrylic-active-mix': acrylicMix(0.85, 64),
      '--app-acrylic-home-shell-strong-mix': acrylicMix(0.76, 56),
      '--app-acrylic-home-shell-muted-mix': acrylicMix(0.5, 46),
      '--app-acrylic-home-hero-strong-mix': acrylicMix(0.68, 54),
      '--app-acrylic-home-hero-mix': acrylicMix(0.46, 44),
      '--app-acrylic-home-hero-muted-mix': acrylicMix(0.34, 38),
      '--app-acrylic-home-now-strong-mix': acrylicMix(0.88, 62),
      '--app-acrylic-home-now-mix': acrylicMix(0.66, 52),
      '--app-acrylic-home-week-mix': acrylicMix(0.48, 44),
      '--app-acrylic-home-activity-mix': acrylicMix(0.36, 38),
      '--app-wallpaper-ui-unified-alpha': unifiedAlpha,
      '--app-wallpaper-ui-border-alpha': isUnified ? '0' : scaledAlpha(0.2),
      '--app-wallpaper-ui-titlebar-alpha': isUnified ? unifiedAlpha : scaledAlpha(0.74),
      '--app-wallpaper-ui-sidebar-top-alpha': isUnified ? unifiedAlpha : scaledAlpha(0.58),
      '--app-wallpaper-ui-sidebar-mid-alpha': isUnified ? unifiedAlpha : scaledAlpha(0.62),
      '--app-wallpaper-ui-sidebar-bottom-alpha': isUnified ? unifiedAlpha : scaledAlpha(0.72),
      '--app-wallpaper-ui-sidebar-base-alpha': isUnified ? unifiedAlpha : scaledAlpha(0.68),
      '--app-wallpaper-ui-page-top-alpha': isUnified ? unifiedAlpha : scaledAlpha(0.28),
      '--app-wallpaper-ui-page-bottom-alpha': isUnified ? unifiedAlpha : scaledAlpha(0.74),
      '--app-wallpaper-ui-page-base-alpha': isUnified ? unifiedAlpha : scaledAlpha(0.62),
      '--app-wallpaper-ui-player-alpha': isUnified ? unifiedAlpha : scaledAlpha(0.78),
      '--app-wallpaper-ui-soft-shadow-alpha': isUnified ? '0' : scaledAlpha(0.08),
      '--app-wallpaper-ui-player-shadow-alpha': isUnified ? '0' : scaledAlpha(0.045),
      '--app-wallpaper-ui-inset-alpha': isUnified ? '0' : scaledAlpha(0.82),
      '--app-wallpaper-ui-titlebar-blur': `${(blurAlpha * 18).toFixed(1)}px`,
      '--app-wallpaper-ui-sidebar-blur': `${(blurAlpha * (isUnified ? 18 : 24)).toFixed(1)}px`,
      '--app-wallpaper-ui-surface-blur': `${(blurAlpha * 18).toFixed(1)}px`,
    } as CSSProperties;
  }, [
    appWallpaperRawUiAlpha,
    appWallpaperSettings.appWindowAcrylicTransparencyPercent,
    appWallpaperSettings.appWallpaperVisualProtectionEnabled,
    appWallpaperSettings.appWallpaperUnifiedOpacityEnabled,
    isAppWallpaperReady,
  ]);

  useEffect(() => {
    let cancelled = false;
    const appApi = window.echo?.app;

    void appApi?.isMaximized?.()
      .then((maximized) => {
        if (!cancelled) {
          setIsWindowMaximized(maximized);
        }
      })
      .catch(() => undefined);
    void appApi?.isFullscreen?.()
      .then((fullscreen) => {
        if (!cancelled) {
          setIsWindowFullscreen(fullscreen);
        }
      })
      .catch(() => undefined);

    const unsubscribe = appApi?.onMaximizedChange?.((maximized) => {
      setIsWindowMaximized(maximized);
    });
    const unsubscribeFullscreen = appApi?.onFullscreenChange?.((fullscreen) => {
      if (Date.now() - fullscreenTransitionStartedAtRef.current > 420) {
        startWindowFullscreenTransition(fullscreen);
      }
      setIsWindowFullscreen(fullscreen);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
      unsubscribeFullscreen?.();
    };
  }, [startWindowFullscreenTransition]);

  const clearFirstRunWizardCloseTimer = useCallback((): void => {
    if (firstRunWizardCloseTimerRef.current !== null) {
      clearTimeout(firstRunWizardCloseTimerRef.current);
      firstRunWizardCloseTimerRef.current = null;
    }
  }, []);

  const openFirstRunWizard = useCallback((): void => {
    clearFirstRunWizardCloseTimer();
    firstRunWizardMountedRef.current = true;
    setIsFirstRunWizardClosing(false);
    setIsFirstRunWizardOpen(true);
  }, [clearFirstRunWizardCloseTimer]);

  const closeFirstRunWizard = useCallback((): void => {
    if (!firstRunWizardMountedRef.current) {
      setIsFirstRunWizardClosing(false);
      setIsFirstRunWizardOpen(false);
      return;
    }

    clearFirstRunWizardCloseTimer();
    setIsFirstRunWizardClosing(true);
    firstRunWizardCloseTimerRef.current = setTimeout(() => {
      firstRunWizardMountedRef.current = false;
      firstRunWizardCloseTimerRef.current = null;
      setIsFirstRunWizardOpen(false);
      setIsFirstRunWizardClosing(false);
    }, 220);
  }, [clearFirstRunWizardCloseTimer]);

  useEffect(() => () => clearFirstRunWizardCloseTimer(), [clearFirstRunWizardCloseTimer]);

  useEffect(() => {
    let cancelled = false;

    const applyFirstRunSettings = (settings: Partial<AppSettings> | null | undefined): void => {
      if (!settings || !Object.prototype.hasOwnProperty.call(settings, 'onboardingCompleted')) {
        return;
      }

      setFirstRunSettings((current) => ({ ...(current ?? {}), ...settings }) as AppSettings);
      if (settings.onboardingCompleted === false) {
        openFirstRunWizard();
      } else {
        closeFirstRunWizard();
      }
    };

    const loadFirstRunSettings = (): void => {
      void window.echo?.app?.getSettings?.()
        .then((settings) => {
          if (!cancelled) {
            applyFirstRunSettings(settings);
          }
        })
        .catch(() => undefined);
    };

    const handleSettingsChanged = (event: Event): void => {
      if (event instanceof CustomEvent && event.detail && typeof event.detail === 'object') {
        applyFirstRunSettings(event.detail as Partial<AppSettings>);
        return;
      }

      if (!cancelled) {
        loadFirstRunSettings();
      }
    };

    loadFirstRunSettings();
    window.addEventListener('settings:changed', handleSettingsChanged);

    return () => {
      cancelled = true;
      window.removeEventListener('settings:changed', handleSettingsChanged);
    };
  }, [closeFirstRunWizard, openFirstRunWizard]);

  useEffect(() => {
    let cancelled = false;

    const applySettings = (settings: Partial<AppSettings> | null | undefined): void => {
      if (!settings) {
        return;
      }

      if (Object.prototype.hasOwnProperty.call(settings, 'appearanceTheme')) {
        setAppAppearanceTheme(normalizeAppThemeMode(settings.appearanceTheme));
      }

      const hasSidebarRouteOrder = Object.prototype.hasOwnProperty.call(settings, 'sidebarRouteOrder');
      const hasSidebarHiddenRouteIds = Object.prototype.hasOwnProperty.call(settings, 'sidebarHiddenRouteIds');
      const hasSidebarAutoHideEnabled = Object.prototype.hasOwnProperty.call(settings, 'sidebarAutoHideEnabled');
      const hasSidebarIconOnlyEnabled = Object.prototype.hasOwnProperty.call(settings, 'sidebarIconOnlyEnabled');
      const hasSettingsHideSidebarEnabled = Object.prototype.hasOwnProperty.call(settings, 'settingsHideSidebarEnabled');
      if (hasSidebarRouteOrder || hasSidebarHiddenRouteIds || hasSidebarAutoHideEnabled || hasSidebarIconOnlyEnabled || hasSettingsHideSidebarEnabled) {
        setSidebarLayoutSettings((current) => ({
          sidebarRouteOrder: hasSidebarRouteOrder ? normalizeSidebarRouteOrder(settings.sidebarRouteOrder) : current.sidebarRouteOrder,
          sidebarHiddenRouteIds: hasSidebarHiddenRouteIds ? normalizeSidebarHiddenRouteIds(settings.sidebarHiddenRouteIds) : current.sidebarHiddenRouteIds,
          sidebarAutoHideEnabled: hasSidebarAutoHideEnabled ? settings.sidebarAutoHideEnabled === true : current.sidebarAutoHideEnabled,
          sidebarIconOnlyEnabled: hasSidebarIconOnlyEnabled ? settings.sidebarIconOnlyEnabled === true : current.sidebarIconOnlyEnabled,
          settingsHideSidebarEnabled: hasSettingsHideSidebarEnabled ? settings.settingsHideSidebarEnabled === true : current.settingsHideSidebarEnabled,
        }));
      }
    };

    const refreshSettings = (): void => {
      void window.echo?.app?.getSettings?.()
        .then((settings) => {
          if (!cancelled) {
            applySettings(settings);
          }
        })
        .catch(() => undefined);
    };

    const handleSettingsChanged = (event: Event): void => {
      if (event instanceof CustomEvent) {
        applySettings(event.detail as Partial<AppSettings> | null | undefined);
        return;
      }

      if (!cancelled) {
        refreshSettings();
      }
    };

    refreshSettings();
    window.addEventListener('settings:changed', handleSettingsChanged);

    return () => {
      cancelled = true;
      window.removeEventListener('settings:changed', handleSettingsChanged);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const applySettings = (settings: Partial<AppSettings> | null | undefined): void => {
      if (!settings || !Object.prototype.hasOwnProperty.call(settings, 'audioIssueDiagnosticsWindowEnabled')) {
        return;
      }

      setAudioIssueDiagnosticsWindowEnabled(settings.audioIssueDiagnosticsWindowEnabled === true);
    };

    const refreshSettings = (): void => {
      void window.echo?.app?.getSettings?.()
        .then((settings) => {
          if (!cancelled) {
            applySettings(settings);
          }
        })
        .catch(() => undefined);
    };

    const handleSettingsChanged = (event: Event): void => {
      if (event instanceof CustomEvent) {
        applySettings(event.detail as Partial<AppSettings> | null | undefined);
        return;
      }

      if (!cancelled) {
        refreshSettings();
      }
    };

    refreshSettings();
    window.addEventListener('settings:changed', handleSettingsChanged);

    return () => {
      cancelled = true;
      window.removeEventListener('settings:changed', handleSettingsChanged);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const applySettings = (settings: Partial<AppSettings> | null | undefined): void => {
      if (!settings || !Object.prototype.hasOwnProperty.call(settings, 'signalPathControlEnabled')) {
        return;
      }

      setSignalPathControlEnabled(settings.signalPathControlEnabled === true);
    };

    const refreshSettings = (): void => {
      void window.echo?.app?.getSettings?.()
        .then((settings) => {
          if (!cancelled) {
            applySettings(settings);
          }
        })
        .catch(() => undefined);
    };

    const handleSettingsChanged = (event: Event): void => {
      if (event instanceof CustomEvent) {
        applySettings(event.detail as Partial<AppSettings> | null | undefined);
        return;
      }

      if (!cancelled) {
        refreshSettings();
      }
    };

    refreshSettings();
    window.addEventListener('settings:changed', handleSettingsChanged);

    return () => {
      cancelled = true;
      window.removeEventListener('settings:changed', handleSettingsChanged);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const applySettings = (settings: Partial<AppSettings> | null | undefined): void => {
      if (!settings || !Object.prototype.hasOwnProperty.call(settings, 'touchOnScreenKeyboardEnabled')) {
        return;
      }

      touchOnScreenKeyboardEnabledRef.current = settings.touchOnScreenKeyboardEnabled === true;
    };

    const refreshSettings = (): void => {
      void window.echo?.app?.getSettings?.()
        .then((settings) => {
          if (!cancelled) {
            applySettings(settings);
          }
        })
        .catch(() => undefined);
    };

    const handleSettingsChanged = (event: Event): void => {
      if (event instanceof CustomEvent) {
        applySettings(event.detail as Partial<AppSettings> | null | undefined);
        return;
      }

      if (!cancelled) {
        refreshSettings();
      }
    };

    const handleFocusIn = (event: FocusEvent): void => {
      if (!touchOnScreenKeyboardEnabledRef.current || !isTouchKeyboardEditableTarget(event.target)) {
        return;
      }

      const now = Date.now();
      if (now - touchKeyboardLastRequestAtRef.current < 700) {
        return;
      }

      touchKeyboardLastRequestAtRef.current = now;
      void window.echo?.app?.showTouchKeyboard?.().catch(() => undefined);
    };

    refreshSettings();
    window.addEventListener('settings:changed', handleSettingsChanged);
    window.addEventListener('focusin', handleFocusIn);

    return () => {
      cancelled = true;
      window.removeEventListener('settings:changed', handleSettingsChanged);
      window.removeEventListener('focusin', handleFocusIn);
    };
  }, []);

  useEffect(() => {
    const syncWallpaperOrientation = (): void => {
      setIsAppWallpaperPortraitViewport(isPortraitViewport());
    };

    syncWallpaperOrientation();
    window.addEventListener('resize', syncWallpaperOrientation);
    window.visualViewport?.addEventListener('resize', syncWallpaperOrientation);

    return () => {
      window.removeEventListener('resize', syncWallpaperOrientation);
      window.visualViewport?.removeEventListener('resize', syncWallpaperOrientation);
    };
  }, []);

  useEffect(() => {
    if (!appWallpaperKey) {
      setLoadedAppWallpaperKey(null);
      setFailedAppWallpaperKey(null);
      return;
    }

    setLoadedAppWallpaperKey((current) => (current === appWallpaperKey ? current : null));
    setFailedAppWallpaperKey((current) => (current === appWallpaperKey ? current : null));
  }, [appWallpaperKey]);

  useEffect(() => {
    const video = appWallpaperVideoRef.current;
    if (!video || !isAppWallpaperVideo || !appWallpaperUrl) {
      return;
    }

    const hasReadyFrame = video.readyState >= 2 || (appWallpaperKey !== null && loadedAppWallpaperKey === appWallpaperKey);

    if (shouldPauseAppWallpaperVideo && hasReadyFrame) {
      video.pause();
      return;
    }

    if (shouldPauseAppWallpaperVideo && (!shouldShowAppWallpaperVisual || isAppWallpaperDocumentHidden)) {
      video.pause();
      return;
    }

    if (hasReadyFrame && appWallpaperKey && loadedAppWallpaperKey !== appWallpaperKey) {
      setLoadedAppWallpaperKey(appWallpaperKey);
    }

    try {
      const playResult = video.play();
      if (playResult && typeof playResult.catch === 'function') {
        void playResult.catch(() => {
          // Muted background video autoplay is best-effort; keep the UI usable if Chromium refuses.
        });
      }
    } catch {
      // Some test/runtime environments expose media elements without playback support.
    }
  }, [
    appWallpaperKey,
    appWallpaperUrl,
    isAppWallpaperDocumentHidden,
    isAppWallpaperVideo,
    loadedAppWallpaperKey,
    shouldPauseAppWallpaperVideo,
    shouldShowAppWallpaperVisual,
  ]);

  const getRouteSwitchPlaybackDetails = useCallback((): Record<string, unknown> => {
    const statusSnapshot = getSharedPlaybackStatusSnapshot();
    const audioStatus = statusSnapshot.audioStatus;
    const playbackStatus = statusSnapshot.playbackStatus;

    return {
      playbackState: audioStatus?.state ?? playbackStatus?.state,
      outputMode: audioStatus?.outputMode,
      trackId: audioStatus?.currentTrackId ?? playbackStatus?.currentTrackId,
      audioBackend: audioStatus?.activeOutputBackendImpl ?? audioStatus?.outputBackend,
      error: statusSnapshot.error ?? audioStatus?.error,
    };
  }, []);

  const beginRouteSwitchTrace = useCallback(
    (routeId: AppRouteId, trigger: string): void => {
      const sequence = routeSwitchSequenceRef.current + 1;
      routeSwitchSequenceRef.current = sequence;
      const trace: RouteSwitchTrace = {
        sequence,
        from: activeRouteId,
        to: routeId,
        trigger,
        startedAtMs: performance.now(),
      };
      routeSwitchTraceRef.current = trace;

      if (import.meta.env.DEV) {
        logRouteSwitchDiagnostic('start', {
          sequence,
          from: trace.from,
          to: trace.to,
          trigger,
          ...getRouteSwitchPlaybackDetails(),
        });
      }
    },
    [activeRouteId, getRouteSwitchPlaybackDetails],
  );

  const navigateRoute = useCallback(
    (routeId: AppRouteId, trigger = 'navigateRoute'): void => {
      const nextRouteId = routeId;
      const nextTrigger = trigger;
      if (!navigableRoutes.some((route) => route.id === nextRouteId)) {
        return;
      }
      const navigationRequest = routeNavigationRequestRef.current + 1;
      routeNavigationRequestRef.current = navigationRequest;

      if (nextRouteId === activeRouteId) {
        if (import.meta.env.DEV) {
          logRouteSwitchDiagnostic('start', {
            from: activeRouteId,
            to: nextRouteId,
            trigger: nextTrigger,
            result: 'same-route',
            ...getRouteSwitchPlaybackDetails(),
          });
        }
        return;
      }

      if (nextRouteId === 'lyrics' && activeRouteId !== 'lyrics') {
        previousRouteIdRef.current = activeRouteId;
        setMountedPersistentRouteIds((current) => touchRetainedRoute(current, activeRouteId, 2));
      }

      if (nextRouteId === 'settings' && activeRouteId !== 'settings') {
        settingsReturnRouteIdRef.current = activeRouteId;
        setMountedPersistentRouteIds((current) => touchRetainedRoute(current, activeRouteId, 2));
      }

      if (nextRouteId !== 'lyrics') {
        setIsLyricsQueueDrawerOpen(false);
      }

      beginRouteSwitchTrace(nextRouteId, nextTrigger);
      const commitActiveRoute = (): void => {
        setIsLyricsSidebarRestoring(activeRouteId === 'lyrics' && nextRouteId !== 'lyrics');
        setActiveRouteId(nextRouteId);
      };
      const commitPreparedRoute = (): void => {
        if (routeNavigationRequestRef.current !== navigationRequest) {
          return;
        }

        // Commit in the same turn as the click. startTransition keeps the
        // outgoing page painted until the incoming tree is ready, which reads
        // as a one-frame flash of the previous route.
        commitActiveRoute();
      };
      const routePreparation = navigableRoutes.find((route) => route.id === nextRouteId)?.prepareBeforeNavigation;
      if (!routePreparation) {
        commitPreparedRoute();
        return;
      }

      // Standalone pages can change the entire shell layout. Keep the current
      // page and footer intact until their JS and CSS chunks are both ready.
      void routePreparation()
        .catch(() => undefined)
        .then(commitPreparedRoute);
    },
    [activeRouteId, beginRouteSwitchTrace, getRouteSwitchPlaybackDetails, navigableRoutes],
  );

  useEffect(() => {
    const previousCommittedRouteId = routeSwitchCommittedRouteIdRef.current;
    if (previousCommittedRouteId === activeRouteId) {
      return;
    }

    const trace = routeSwitchTraceRef.current;
    const playbackDetails = getRouteSwitchPlaybackDetails();

    if (trace && trace.to === activeRouteId) {
      if (import.meta.env.DEV) {
        logRouteSwitchDiagnostic('end', {
          sequence: trace.sequence,
          from: trace.from,
          to: trace.to,
          trigger: trace.trigger,
          durationMs: performance.now() - trace.startedAtMs,
          ...playbackDetails,
        });
      }
      routeSwitchTraceRef.current = null;
    } else if (import.meta.env.DEV) {
      logRouteSwitchDiagnostic('end', {
        from: previousCommittedRouteId,
        to: activeRouteId,
        trigger: 'external-setActiveRouteId',
        durationMs: 0,
        ...playbackDetails,
      });
    }

    routeSwitchCommittedRouteIdRef.current = activeRouteId;
  }, [activeRouteId, getRouteSwitchPlaybackDetails]);

  useEffect(() => {
    if (!navigableRoutes.some((route) => route.id === activeRouteId) && activeRoute?.id && activeRoute.id !== activeRouteId) {
      navigateRoute(activeRoute.id, 'route-unavailable');
    }
  }, [activeRoute, activeRouteId, navigateRoute, navigableRoutes]);

  const setLyricsViewMode = useCallback((mode: LyricsViewMode, deferCommit = false): void => {
    rememberLyricsViewMode(mode);
    const commitLyricsViewMode = (): void => setActiveLyricsViewMode(mode);
    if (deferCommit) {
      startTransition(commitLyricsViewMode);
      return;
    }

    commitLyricsViewMode();
  }, []);

  const handleOpenAudioSettingsDrawer = useCallback((): void => {
    setIsLyricsDrawerOpen(false);
    setIsLyricsVisualDrawerOpen(false);
    startTransition(() => setIsAudioDrawerOpen(true));
  }, []);

  const handleOpenLyricsSettingsDrawer = useCallback((): void => {
    setIsAudioDrawerOpen(false);
    setIsLyricsVisualDrawerOpen(false);
    startTransition(() => setIsLyricsDrawerOpen(true));
  }, []);

  const handleOpenLyricsVisualSettingsDrawer = useCallback((): void => {
    if (!isLyricsRoute) {
      return;
    }

    setIsAudioDrawerOpen(false);
    setIsLyricsDrawerOpen(false);
    setIsLyricsVisualDrawerOpen(true);
  }, [isLyricsRoute]);


  const handleOpenLyricsQueueDrawer = useCallback((): void => {
    startTransition(() => setIsLyricsQueueDrawerOpen(true));
  }, []);

  const handleOpenShellQueue = useCallback((): void => {
    navigateRoute('queue');
  }, [navigateRoute]);

  const handleOpenFullQueueFromLyricsDrawer = useCallback((): void => {
    navigateRoute('queue');
  }, [navigateRoute]);

  const dismissChromeNotice = useCallback((): void => {
    setIsChromeNoticeVisible(false);
  }, []);

  const clearNotificationNotices = useCallback((): void => {
    setChromeNotice(null);
    setIsChromeNoticeVisible(false);
    setUpcomingTrackNotice(null);
    setIsUpcomingTrackNoticeVisible(false);
    setAudioErrorNotice(null);
    setAudioComponentNotice(false);
    setDiagnosticsNotice(false);
    setMemoryPressureNotice(null);
  }, []);

  const showChromeNotice = useCallback((message: string, autoHideMs = defaultChromeNoticeAutoHideMs): void => {
    if (notificationsDisabledRef.current) {
      return;
    }

    setChromeNoticeAutoHideMs(autoHideMs);
    setChromeNotice((current) => (current === message ? current : message));
    setIsChromeNoticeVisible(true);
  }, []);

  const showAudioErrorNotice = useCallback(
    (rawError: string, source: 'playback-status' | 'event' = 'playback-status'): void => {
      if (notificationsDisabledRef.current) {
        return;
      }

      if (!rawError || rawError === 'Desktop bridge unavailable') {
        return;
      }

      if (isSpotifyPlaybackSetupError(rawError)) {
        return;
      }

      if (isMissingAudioRuntimeComponentError(rawError)) {
        if (lastAudioErrorRef.current !== rawError) {
          lastAudioErrorRef.current = rawError;
          setAudioErrorNotice(null);
          setAudioComponentNotice(true);
        }
        return;
      }

      if (shouldSuppressAudioHostError(rawError)) {
        return;
      }

      if (lastAudioErrorRef.current === rawError) {
        return;
      }

      lastAudioErrorRef.current = rawError;
      setAudioErrorNotice({
        message:
          formatAudioHostError(rawError) ??
          formatUserFacingError(rawError, { context: 'audio' }),
        rawError,
        source,
      });
    },
    [],
  );

  const handleOpenAudioComponentDownloadPage = useCallback(async (): Promise<void> => {
    setAudioComponentActionBusy(true);
    try {
      await window.echo?.app?.openRuntimeAudioComponentDownloadPage?.();
    } catch (error) {
      showChromeNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setAudioComponentActionBusy(false);
    }
  }, [showChromeNotice]);

  const handleImportAudioComponent = useCallback(async (): Promise<void> => {
    setAudioComponentActionBusy(true);
    try {
      const result = await window.echo?.app?.importRuntimeAudioComponent?.();
      if (result?.outcome === 'installed') {
        setAudioComponentNotice(false);
        lastAudioErrorRef.current = null;
        showChromeNotice(t('notice.audioComponent.installed'));
      }
    } catch (error) {
      showChromeNotice(t('notice.audioComponent.importFailed', {
        error: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      setAudioComponentActionBusy(false);
    }
  }, [showChromeNotice, t]);

  useEffect(() => {
    activeRouteIdRef.current = activeRouteId;

    setMountedPersistentRouteIds((current) => resolveRetainedRouteLru({
      activeRouteId,
      current,
      maxMountedRoutes: appWallpaperSettings.lowSpecModeEnabled
        ? (activeRouteId === 'lyrics' && previousRouteIdRef.current)
          || (activeRouteId === 'settings' && settingsReturnRouteIdRef.current)
          ? 2
          : 1
        : 2,
      persistentRouteIds,
      preservedRouteId: activeRouteId === 'lyrics'
        ? previousRouteIdRef.current
        : activeRouteId === 'settings'
          ? settingsReturnRouteIdRef.current
          : null,
    }));
  }, [activeRouteId, appWallpaperSettings.lowSpecModeEnabled]);

  useEffect(() => {
    const folderInput = folderInputRef.current;

    if (!folderInput) {
      return;
    }

    folderInput.setAttribute('webkitdirectory', '');
    folderInput.setAttribute('directory', '');
  }, []);

  useEffect(() => {
    if (!shouldAutoShowDiagnosticsCrashNotice()) {
      return;
    }

    void window.echo?.diagnostics
      ?.getLastCrashSummary()
      .then((summary) => {
        if (!notificationsDisabledRef.current) {
          setDiagnosticsNotice(Boolean(summary));
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const unsubscribe = window.echo?.diagnostics?.onMemoryPressure?.((event) => {
      const releaseUnusedRendererMemory = (): void => {
        try {
          window.echo?.diagnostics?.releaseUnusedRendererMemory?.();
        } catch {
          // Cache reclamation is best-effort and must never affect navigation.
        }
      };

      if (event.rendererMitigationRecommended !== false) {
        setSessionRenderPressureReduced(true);
        pruneInactivePersistentRoutes();
        window.requestAnimationFrame(releaseUnusedRendererMemory);
      } else {
        releaseUnusedRendererMemory();
      }
      if (event.userNoticeRecommended !== false && !notificationsDisabledRef.current) {
        setMemoryPressureNotice(event);
      }
    });

    return () => unsubscribe?.();
  }, [pruneInactivePersistentRoutes]);

  useEffect(() => {
    if (!chromeNotice || notificationsDisabled || !isChromeNoticeVisible) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setIsChromeNoticeVisible(false);
    }, chromeNoticeAutoHideMs);

    return () => window.clearTimeout(timer);
  }, [chromeNotice, chromeNoticeAutoHideMs, isChromeNoticeVisible, notificationsDisabled]);

  useEffect(() => {
    const handleShowChromeNotice = (event: Event): void => {
      const message = (event as CustomEvent<string>).detail;
      if (typeof message === 'string' && message.trim()) {
        showChromeNotice(message);
      }
    };

    window.addEventListener(showChromeNoticeEvent, handleShowChromeNotice);
    return () => window.removeEventListener(showChromeNoticeEvent, handleShowChromeNotice);
  }, [showChromeNotice]);

  useEffect(() => {
    if (!upcomingTrackNotice || notificationsDisabled || !upcomingTrackNoticeEnabled) {
      return undefined;
    }

    setIsUpcomingTrackNoticeVisible(true);

    const timer = window.setTimeout(() => {
      setIsUpcomingTrackNoticeVisible(false);
    }, upcomingTrackNoticeAutoHideMs);

    return () => window.clearTimeout(timer);
  }, [notificationsDisabled, upcomingTrackNotice, upcomingTrackNoticeEnabled]);

  useEffect(() => {
    const updateUpcomingTrackNotice = (): void => {
      if (notificationsDisabledRef.current || !upcomingTrackNoticeEnabledRef.current) {
        return;
      }

      const clock = getPlaybackClock(getSharedPlaybackStatusSnapshot());
      if (!clock || clock.state !== 'playing') {
        return;
      }

      const durationSeconds = Number.isFinite(clock.durationSeconds) ? clock.durationSeconds : 0;
      const positionSeconds = Number.isFinite(clock.positionSeconds) ? clock.positionSeconds : 0;
      const remainingSeconds = durationSeconds - positionSeconds;
      if (
        durationSeconds <= upcomingTrackNoticeLeadSeconds ||
        positionSeconds < 0 ||
        remainingSeconds <= 0 ||
        remainingSeconds > upcomingTrackNoticeLeadSeconds
      ) {
        return;
      }

      const currentIdentity = clock.trackId ?? playbackQueue.currentQueueId ?? playbackQueue.currentTrackId ?? 'unknown';
      if (lastUpcomingTrackPlaybackIdentityRef.current !== currentIdentity) {
        lastUpcomingTrackPlaybackIdentityRef.current = currentIdentity;
        lastUpcomingTrackNoticeKeyRef.current = null;
      }

      const upcomingItem = resolveUpcomingQueueItem(
        playbackQueue.items,
        playbackQueue.currentQueueId,
        clock.trackId ?? playbackQueue.currentTrackId,
        playbackQueue.repeatMode,
      );
      if (!upcomingItem) {
        return;
      }

      const noticeKey = `${currentIdentity}->${upcomingItem.queueId}:${upcomingItem.track.id}`;
      if (lastUpcomingTrackNoticeKeyRef.current === noticeKey) {
        return;
      }

      lastUpcomingTrackNoticeKeyRef.current = noticeKey;
      setUpcomingTrackNotice({
        key: noticeKey,
        track: upcomingItem.track,
      });
    };

    updateUpcomingTrackNotice();
    return subscribeSharedPlaybackStatus(updateUpcomingTrackNotice);
  }, [
    playbackQueue.currentQueueId,
    playbackQueue.currentTrackId,
    playbackQueue.items,
    playbackQueue.repeatMode,
  ]);

  useEffect(() => {
    let cancelled = false;

    const applySettings = (settings: Partial<AppSettings> | null | undefined): void => {
      if (!settings) {
        return;
      }

      if (Object.prototype.hasOwnProperty.call(settings, 'notificationsDisabled')) {
        const disabled = readNotificationsDisabled(settings);
        notificationsDisabledRef.current = disabled;
        setNotificationsDisabled(disabled);
        if (disabled) {
          clearNotificationNotices();
        }
      }

      if (Object.prototype.hasOwnProperty.call(settings, 'upcomingTrackNoticeEnabled')) {
        const enabled = readUpcomingTrackNoticeEnabled(settings);
        upcomingTrackNoticeEnabledRef.current = enabled;
        setUpcomingTrackNoticeEnabled(enabled);
        if (!enabled) {
          setUpcomingTrackNotice(null);
          setIsUpcomingTrackNoticeVisible(false);
        }
      }
    };

    const refreshSettings = (): void => {
      void window.echo?.app?.getSettings?.().then((settings) => {
        if (!cancelled) {
          applySettings(settings);
        }
      }).catch(() => undefined);
    };

    refreshSettings();

    const handleSettingsChanged = (event: Event): void => {
      if (event instanceof CustomEvent) {
        applySettings(event.detail as Partial<AppSettings> | null | undefined);
        return;
      }

      if (!cancelled) {
        refreshSettings();
      }
    };

    window.addEventListener('settings:changed', handleSettingsChanged);
    return () => {
      cancelled = true;
      window.removeEventListener('settings:changed', handleSettingsChanged);
    };
  }, [clearNotificationNotices]);

  useEffect(() => {
    const handleShowAudioErrorNotice = (event: Event): void => {
      const message = readAudioErrorNoticeMessage(event);
      if (message) {
        showAudioErrorNotice(message, 'event');
      }
    };

    window.addEventListener(showAudioErrorNoticeEvent, handleShowAudioErrorNotice);
    return () => window.removeEventListener(showAudioErrorNoticeEvent, handleShowAudioErrorNotice);
  }, [showAudioErrorNotice]);

  useEffect(() => {
    const syncPlaybackChromeNotices = (): void => {
      const statusSnapshot = getSharedPlaybackStatusSnapshot();
      const rawError = statusSnapshot.audioStatus?.error ?? statusSnapshot.error;
      if (rawError) {
        showAudioErrorNotice(rawError);
      }

      const warnings = statusSnapshot.audioStatus?.warnings;
      const missingOutputDeviceFallback = hasMissingOutputDeviceFallbackWarning(warnings);
      if (!notificationsDisabledRef.current) {
        if (missingOutputDeviceFallback && !hadMissingOutputDeviceFallbackWarningRef.current) {
          showChromeNotice(t('notice.audioDeviceNotFoundFallback'));
        } else {
          const rate = getWindowsAudioDefaultFormatWarningRate(warnings);
          if (rate && Number.isFinite(rate)) {
            const noticeKey = `windows-default-format:${Math.round(rate)}`;
            if (!notifiedWindowsAudioDefaultFormatKeysRef.current.has(noticeKey)) {
              notifiedWindowsAudioDefaultFormatKeysRef.current.add(noticeKey);
              showChromeNotice(
                t('notice.audioDefaultFormatWarning', { rate: formatAudioNoticeRate(rate) }),
                quickAudioNoticeAutoHideMs,
              );
            }
          }
        }
      }
      hadMissingOutputDeviceFallbackWarningRef.current = missingOutputDeviceFallback;

      const latestState = statusSnapshot.audioStatus?.state ?? statusSnapshot.playbackStatus?.state ?? null;
      if (rawError || latestState === 'error') {
        return;
      }

      setAudioErrorNotice((current) => {
        if (!current || current.source !== 'playback-status') {
          return current;
        }

        lastAudioErrorRef.current = null;
        return null;
      });
    };

    syncPlaybackChromeNotices();
    return subscribeSharedPlaybackStatus(syncPlaybackChromeNotices);
  }, [showAudioErrorNotice, showChromeNotice, t]);

  useEffect(() => {
    if (!audioErrorNotice) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      if (lastAudioErrorRef.current === audioErrorNotice.rawError) {
        lastAudioErrorRef.current = null;
      }
      setAudioErrorNotice((current) => (current === audioErrorNotice ? null : current));
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [audioErrorNotice]);

  useEffect(() => {
    const desktopLyrics = window.echo?.desktopLyrics;
    if (!desktopLyrics) {
      setDesktopLyricsVisible(false);
      setDesktopLyricsLocked(false);
      return undefined;
    }

    void desktopLyrics.getState()
      .then((state) => {
        setDesktopLyricsVisible(state.visible === true);
        setDesktopLyricsLocked(state.locked === true);
      })
      .catch(() => {
        setDesktopLyricsVisible(false);
        setDesktopLyricsLocked(false);
      });

    const unsubscribe = desktopLyrics.onStateChanged?.((state) => {
      setDesktopLyricsVisible(state.visible === true);
      setDesktopLyricsLocked(state.locked === true);
    });

    return () => unsubscribe?.();
  }, [hasDesktopLyricsBridge]);

  useEffect(() => {
    let cancelled = false;

    const refreshLyricsMiniPlayerSettings = (event?: Event): void => {
      const patch = (event as CustomEvent<Partial<AppSettings>> | undefined)?.detail;
      if (
        patch &&
        ('lyricsPlayerBarDrawerEnabled' in patch ||
          'lyricsPlayerBarDrawerAutoHideEnabled' in patch ||
          'lyricsPlayerBarDrawerShortcutEnabled' in patch ||
          'lyricsPlayerBarDrawerShortcutAccelerator' in patch ||
          'lyricsPlayerBarDrawerCompactOnIdleEnabled' in patch ||
          'lyricsPlayerBarDrawerOpacityPercent' in patch ||
          'lyricsPlayerBarDrawerColorMode' in patch ||
          'lyricsPlayerBarDrawerColor' in patch ||
          'lyricsPageStyle' in patch)
      ) {
        setLyricsMiniPlayerSettings((current) => selectLyricsMiniPlayerSettings({ ...current, ...patch }));
        return;
      }
      if (patch && typeof patch === 'object') {
        return;
      }

      const getSettings = window.echo?.app?.getSettings;
      if (typeof getSettings !== 'function') {
        setLyricsMiniPlayerSettings(defaultLyricsMiniPlayerSettings);
        setLyricsMiniPlayerSettingsReady(true);
        return;
      }

      void getSettings()
        .then((settings) => {
          if (!cancelled) {
            setLyricsMiniPlayerSettings(selectLyricsMiniPlayerSettings(settings));
            setLyricsMiniPlayerSettingsReady(true);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setLyricsMiniPlayerSettings(defaultLyricsMiniPlayerSettings);
            setLyricsMiniPlayerSettingsReady(true);
          }
        });
    };

    refreshLyricsMiniPlayerSettings();
    window.addEventListener('settings:changed', refreshLyricsMiniPlayerSettings);

    return () => {
      cancelled = true;
      window.removeEventListener('settings:changed', refreshLyricsMiniPlayerSettings);
    };
  }, []);

  useEffect(() => {
    const shortcut = lyricsMiniPlayerSettings.lyricsPlayerBarDrawerShortcutAccelerator?.toLowerCase() ?? null;
    if (!isLyricsMiniPlayerShortcutModeActive || !shortcut) {
      setIsLyricsMiniPlayerShortcutHidden(false);
      return undefined;
    }

    const toggleMiniPlayer = (accelerator: string | null, event: Event): void => {
      if (!accelerator || accelerator.toLowerCase() !== shortcut || document.body.dataset.echoShortcutRecording === 'true') {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setIsLyricsMiniPlayerShortcutHidden((hidden) => !hidden);
    };

    const handleShortcutKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat || isImeComposingKeyEvent(event) || isShortcutTextTarget(event)) {
        return;
      }

      toggleMiniPlayer(acceleratorFromKeyboardEvent(event), event);
    };

    const handleShortcutMouseDown = (event: MouseEvent): void => {
      toggleMiniPlayer(acceleratorFromMouseEvent(event, { includeModifiers: true }), event);
    };

    const suppressBoundMouseNavigation = (event: MouseEvent): void => {
      const accelerator = acceleratorFromMouseEvent(event, { includeModifiers: true });
      if (!accelerator || accelerator.toLowerCase() !== shortcut) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener('keydown', handleShortcutKeyDown, true);
    if (acceleratorUsesMouseButton(shortcut)) {
      window.addEventListener('mousedown', handleShortcutMouseDown, true);
      window.addEventListener('mouseup', suppressBoundMouseNavigation, true);
      window.addEventListener('auxclick', suppressBoundMouseNavigation, true);
    }
    return () => {
      window.removeEventListener('keydown', handleShortcutKeyDown, true);
      window.removeEventListener('mousedown', handleShortcutMouseDown, true);
      window.removeEventListener('mouseup', suppressBoundMouseNavigation, true);
      window.removeEventListener('auxclick', suppressBoundMouseNavigation, true);
    };
  }, [
    isLyricsMiniPlayerShortcutModeActive,
    lyricsMiniPlayerSettings.lyricsPlayerBarDrawerShortcutAccelerator,
  ]);

  useEffect(() => {
    if (!shouldAutoHideLyricsMiniPlayer) {
      if (lyricsMiniPlayerAutoHideTimerRef.current !== null) {
        window.clearTimeout(lyricsMiniPlayerAutoHideTimerRef.current);
        lyricsMiniPlayerAutoHideTimerRef.current = null;
      }
      setIsLyricsMiniPlayerAutoHidden(false);
      return undefined;
    }

    let animationFrame = 0;
    let disposed = false;

    const revealMiniPlayer = (): void => {
      if (lyricsMiniPlayerAutoHideTimerRef.current !== null) {
        window.clearTimeout(lyricsMiniPlayerAutoHideTimerRef.current);
        lyricsMiniPlayerAutoHideTimerRef.current = null;
      }
      setIsLyricsMiniPlayerAutoHidden((hidden) => (hidden ? false : hidden));
    };

    const isNearMiniPlayer = (clientX: number, clientY: number): boolean => {
      const host = lyricsMiniPlayerHostRef.current;
      const hostWidth = host?.offsetWidth ?? Math.min(820, Math.max(0, window.innerWidth - 96));
      const hostHeight = host?.offsetHeight ?? 72;
      const halfWidth = Math.min(window.innerWidth, hostWidth) / 2;
      const left = window.innerWidth / 2 - halfWidth - lyricsMiniPlayerAutoHideDistancePx;
      const right = window.innerWidth / 2 + halfWidth + lyricsMiniPlayerAutoHideDistancePx;
      const top = window.innerHeight - hostHeight - lyricsMiniPlayerAutoHideDistancePx - 48;

      return clientX >= left && clientX <= right && clientY >= top;
    };

    const scheduleHideMiniPlayer = (): void => {
      const host = lyricsMiniPlayerHostRef.current;
      if (isLyricsQueueDrawerOpen || (host && host.contains(document.activeElement))) {
        revealMiniPlayer();
        return;
      }
      if (lyricsMiniPlayerAutoHideTimerRef.current !== null) {
        return;
      }

      lyricsMiniPlayerAutoHideTimerRef.current = window.setTimeout(() => {
        lyricsMiniPlayerAutoHideTimerRef.current = null;
        if (!disposed) {
          setIsLyricsMiniPlayerAutoHidden(true);
        }
      }, lyricsMiniPlayerAutoHideDelayMs);
    };

    const handleMouseMove = (event: MouseEvent): void => {
      const { clientX, clientY } = event;
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        if (isNearMiniPlayer(clientX, clientY)) {
          revealMiniPlayer();
        } else {
          scheduleHideMiniPlayer();
        }
      });
    };

    const handleFocusIn = (event: FocusEvent): void => {
      const host = lyricsMiniPlayerHostRef.current;
      if (host && event.target instanceof Node && host.contains(event.target)) {
        revealMiniPlayer();
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('focusin', handleFocusIn);
    window.addEventListener('resize', revealMiniPlayer);

    return () => {
      disposed = true;
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
      if (lyricsMiniPlayerAutoHideTimerRef.current !== null) {
        window.clearTimeout(lyricsMiniPlayerAutoHideTimerRef.current);
        lyricsMiniPlayerAutoHideTimerRef.current = null;
      }
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('resize', revealMiniPlayer);
    };
  }, [isLyricsQueueDrawerOpen, shouldAutoHideLyricsMiniPlayer]);

  useEffect(() => {
    if (
      !shouldUseLyricsPlayerDrawer ||
      lyricsMiniPlayerSettings.lyricsPlayerBarDrawerColorMode !== 'cover' ||
      !lyricsMiniPlayerCoverUrl
    ) {
      setLyricsMiniPlayerCoverSample(null);
      return undefined;
    }

    let disposed = false;
    setLyricsMiniPlayerCoverSample(null);
    void sampleImageUrl(lyricsMiniPlayerCoverUrl).then((sample) => {
      if (!disposed) {
        setLyricsMiniPlayerCoverSample(sample);
      }
    });

    return () => {
      disposed = true;
    };
  }, [
    lyricsMiniPlayerCoverUrl,
    lyricsMiniPlayerSettings.lyricsPlayerBarDrawerColorMode,
    shouldUseLyricsPlayerDrawer,
  ]);

  useEffect(() => {
    let cancelled = false;

    const refreshAppWallpaperSetting = (event?: Event): void => {
      const patch = (event as CustomEvent<Partial<AppSettings>> | undefined)?.detail;
      if (
        patch &&
        ('appCustomWallpaperPath' in patch ||
          'appPortraitWallpaperPath' in patch ||
          'appWallpaperMediaType' in patch ||
          'appPortraitWallpaperMediaType' in patch ||
          'appWallpaperScalePercent' in patch ||
          'appWallpaperBlurPx' in patch ||
          'appWallpaperBrightnessPercent' in patch ||
          'appWallpaperUiOpacityPercent' in patch ||
          'appWallpaperVisualProtectionEnabled' in patch ||
          'appWallpaperUnifiedOpacityEnabled' in patch ||
          'appWindowAcrylicEnabled' in patch ||
          'appWindowAcrylicKeepWhenUnfocusedEnabled' in patch ||
          'appWindowAcrylicTransparencyPercent' in patch ||
          'appVideoWallpaperPauseMode' in patch ||
          'lowSpecModeEnabled' in patch)
      ) {
        setAppWallpaperSettings((current) => ({
          appCustomWallpaperPath: 'appCustomWallpaperPath' in patch ? (patch.appCustomWallpaperPath ?? null) : current.appCustomWallpaperPath,
          appPortraitWallpaperPath: 'appPortraitWallpaperPath' in patch
            ? (patch.appPortraitWallpaperPath ?? null)
            : current.appPortraitWallpaperPath,
          appWallpaperMediaType: 'appWallpaperMediaType' in patch
            ? (patch.appWallpaperMediaType ?? defaultAppWallpaperSettings.appWallpaperMediaType)
            : current.appWallpaperMediaType,
          appPortraitWallpaperMediaType: 'appPortraitWallpaperMediaType' in patch
            ? (patch.appPortraitWallpaperMediaType ?? defaultAppWallpaperSettings.appPortraitWallpaperMediaType)
            : current.appPortraitWallpaperMediaType,
          appWallpaperScalePercent: 'appWallpaperScalePercent' in patch
            ? (patch.appWallpaperScalePercent ?? defaultAppWallpaperSettings.appWallpaperScalePercent)
            : current.appWallpaperScalePercent,
          appWallpaperBlurPx: 'appWallpaperBlurPx' in patch
            ? (patch.appWallpaperBlurPx ?? defaultAppWallpaperSettings.appWallpaperBlurPx)
            : current.appWallpaperBlurPx,
          appWallpaperBrightnessPercent: 'appWallpaperBrightnessPercent' in patch
            ? (patch.appWallpaperBrightnessPercent ?? defaultAppWallpaperSettings.appWallpaperBrightnessPercent)
            : current.appWallpaperBrightnessPercent,
          appWallpaperUiOpacityPercent: 'appWallpaperUiOpacityPercent' in patch
            ? (patch.appWallpaperUiOpacityPercent ?? defaultAppWallpaperSettings.appWallpaperUiOpacityPercent)
            : current.appWallpaperUiOpacityPercent,
          appWallpaperVisualProtectionEnabled: 'appWallpaperVisualProtectionEnabled' in patch
            ? (patch.appWallpaperVisualProtectionEnabled !== false)
            : current.appWallpaperVisualProtectionEnabled,
          appWallpaperUnifiedOpacityEnabled: 'appWallpaperUnifiedOpacityEnabled' in patch
            ? (patch.appWallpaperUnifiedOpacityEnabled === true)
            : current.appWallpaperUnifiedOpacityEnabled,
          appWindowAcrylicEnabled: 'appWindowAcrylicEnabled' in patch
            ? (patch.appWindowAcrylicEnabled === true)
            : current.appWindowAcrylicEnabled,
          appWindowAcrylicKeepWhenUnfocusedEnabled: 'appWindowAcrylicKeepWhenUnfocusedEnabled' in patch
            ? (patch.appWindowAcrylicKeepWhenUnfocusedEnabled === true)
            : current.appWindowAcrylicKeepWhenUnfocusedEnabled,
          appWindowAcrylicTransparencyPercent: 'appWindowAcrylicTransparencyPercent' in patch && Number.isFinite(patch.appWindowAcrylicTransparencyPercent)
            ? Math.max(0, Math.min(100, Math.round(Number(patch.appWindowAcrylicTransparencyPercent))))
            : current.appWindowAcrylicTransparencyPercent,
          appVideoWallpaperPauseMode: 'appVideoWallpaperPauseMode' in patch
            ? (patch.appVideoWallpaperPauseMode ?? defaultAppWallpaperSettings.appVideoWallpaperPauseMode)
            : current.appVideoWallpaperPauseMode,
          lowSpecModeEnabled: 'lowSpecModeEnabled' in patch
            ? patch.lowSpecModeEnabled === true
            : current.lowSpecModeEnabled,
        }));
        setAppWallpaperSettingsReady(true);
        return;
      }
      if (patch && typeof patch === 'object') {
        return;
      }

      void window.echo?.app
        ?.getSettings?.()
        .then((settings) => {
          if (!cancelled) {
            setAppWallpaperSettings(selectAppWallpaperSettings(settings));
            setAppWallpaperSettingsReady(true);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setAppWallpaperSettings(defaultAppWallpaperSettings);
            setAppWallpaperSettingsReady(true);
          }
        });
    };

    refreshAppWallpaperSetting();
    window.addEventListener('settings:changed', refreshAppWallpaperSetting);

    return () => {
      cancelled = true;
      window.removeEventListener('settings:changed', refreshAppWallpaperSetting);
    };
  }, []);

  useEffect(() => {
    const handleNavigateRoute = (event: Event): void => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      if (typeof detail !== 'string' || !availableRoutes.some((route) => route.id === detail)) {
        return;
      }

      navigateRoute(detail as AppRouteId);
    };
    const handleNavigateImportFolder = (): void => {
      navigateRoute('import-folder');
    };
    const handleNavigateQueue = (): void => {
      if (isLyricsRoute) {
        startTransition(() => setIsLyricsQueueDrawerOpen((current) => !current));
        return;
      }

      navigateRoute('queue');
    };
    const handleNavigateSongs = (event: Event): void => {
      const remoteSourceId = readSongsNavigationRemoteSourceId(event);
      navigateRoute('songs');
      if (remoteSourceId) {
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent('library:show-remote-source', { detail: { sourceId: remoteSourceId } }));
        }, 0);
      }
    };
    const handleNavigateSettings = (): void => {
      navigateRoute('settings');
    };
    const handleNavigateSettingsBack = (): void => {
      if (activeRouteId !== 'settings') {
        return;
      }

      const rememberedRouteId = settingsReturnRouteIdRef.current;
      const targetRouteId =
        (rememberedRouteId !== 'settings' && navigableRoutes.some((route) => route.id === rememberedRouteId)
          ? rememberedRouteId
          : null) ??
        navigableRoutes.find((route) => route.id === 'home')?.id ??
        navigableRoutes.find((route) => route.id === 'songs')?.id ??
        navigableRoutes.find((route) => route.id !== 'settings')?.id ??
        null;

      if (targetRouteId) {
        navigateRoute(targetRouteId, 'settings-back');
      }
    };
    const handleNavigateDsp = (): void => {
      navigateRoute('dsp');
    };
    const handleNavigateNowPlaying = (): void => {
      navigateRoute('queue');
    };
    const handleNavigateLyrics = (event: Event): void => {
      const detail = event instanceof CustomEvent ? (event.detail as LyricsNavigationDetail | null) : null;
      if (isLyricsViewMode(detail?.mode)) {
        if (activeRouteId === 'lyrics') {
          if (activeLyricsViewMode === detail.mode) {
            navigateRoute(previousRouteIdRef.current, 'lyrics-toggle-back');
            return;
          }

          setLyricsViewMode(detail.mode, true);
          return;
        }

        setLyricsViewMode(detail.mode, true);
        navigateRoute('lyrics');
        return;
      }

      if (activeRouteId === 'lyrics') {
        navigateRoute(previousRouteIdRef.current, 'lyrics-toggle-back');
        return;
      }

      navigateRoute('lyrics');
    };
    const handleNavigateLyricsBack = (): void => {
      navigateRoute(previousRouteIdRef.current, 'lyrics-back');
    };
    const handleNavigateAlbumDetail = (): void => {
      navigateRoute('albums');
    };
    const handleNavigateArtistDetail = (): void => {
      navigateRoute('artists');
    };
    const handleNavigateGenreDetail = (): void => {
      navigateRoute('genres');
    };

    window.addEventListener('app:navigate:route', handleNavigateRoute);
    window.addEventListener('app:navigate:import-folder', handleNavigateImportFolder);
    window.addEventListener('app:navigate:songs', handleNavigateSongs);
    window.addEventListener('app:navigate:settings', handleNavigateSettings);
    window.addEventListener(settingsBackNavigationEvent, handleNavigateSettingsBack);
    window.addEventListener('app:navigate:dsp', handleNavigateDsp);
    window.addEventListener('app:navigate:queue', handleNavigateQueue);
    window.addEventListener('app:navigate:now-playing', handleNavigateNowPlaying);
    window.addEventListener('app:navigate:lyrics', handleNavigateLyrics);
    window.addEventListener('app:navigate:lyrics-back', handleNavigateLyricsBack);
    window.addEventListener(albumDetailNavigationEvent, handleNavigateAlbumDetail);
    window.addEventListener(artistDetailNavigationEvent, handleNavigateArtistDetail);
    window.addEventListener(genreDetailNavigationEvent, handleNavigateGenreDetail);
    return () => {
      window.removeEventListener('app:navigate:route', handleNavigateRoute);
      window.removeEventListener('app:navigate:import-folder', handleNavigateImportFolder);
      window.removeEventListener('app:navigate:songs', handleNavigateSongs);
      window.removeEventListener('app:navigate:settings', handleNavigateSettings);
      window.removeEventListener(settingsBackNavigationEvent, handleNavigateSettingsBack);
      window.removeEventListener('app:navigate:dsp', handleNavigateDsp);
      window.removeEventListener('app:navigate:queue', handleNavigateQueue);
      window.removeEventListener('app:navigate:now-playing', handleNavigateNowPlaying);
      window.removeEventListener('app:navigate:lyrics', handleNavigateLyrics);
      window.removeEventListener('app:navigate:lyrics-back', handleNavigateLyricsBack);
      window.removeEventListener(albumDetailNavigationEvent, handleNavigateAlbumDetail);
      window.removeEventListener(artistDetailNavigationEvent, handleNavigateArtistDetail);
      window.removeEventListener(genreDetailNavigationEvent, handleNavigateGenreDetail);
    };
  }, [activeLyricsViewMode, activeRouteId, availableRoutes, isLyricsRoute, navigateRoute, navigableRoutes, routes, setLyricsViewMode]);

  useEffect(() => {
    window.addEventListener(openAudioSettingsEvent, handleOpenAudioSettingsDrawer);
    window.addEventListener(openLyricsSettingsEvent, handleOpenLyricsSettingsDrawer);
    window.addEventListener(openLyricsVisualSettingsEvent, handleOpenLyricsVisualSettingsDrawer);
    return () => {
      window.removeEventListener(openAudioSettingsEvent, handleOpenAudioSettingsDrawer);
      window.removeEventListener(openLyricsSettingsEvent, handleOpenLyricsSettingsDrawer);
      window.removeEventListener(openLyricsVisualSettingsEvent, handleOpenLyricsVisualSettingsDrawer);
    };
  }, [
    handleOpenAudioSettingsDrawer,
    handleOpenLyricsSettingsDrawer,
    handleOpenLyricsVisualSettingsDrawer,
  ]);

  const handleAudioDrawerStatusChange = useCallback((status: AudioStatus | null): void => {
    setAudioDrawerStatus(status);
    setPlaybackStatusSnapshot({ audioStatus: status, error: status?.error ?? null });
  }, []);

  useEffect(() => {
    const audio = window.echo?.audio;

    if (!audio) {
      return;
    }

    let cancelled = false;
    const initialRouteMutationSequence = getAudioOutputRouteMutationSequence();

    void Promise.all([
      loadPersistedRememberedAudioOutput(),
      window.echo?.app?.getSettings?.().catch(() => null) ?? Promise.resolve(null),
      window.echo?.app?.getEchoProLocalEntitlementStatus?.()?.catch(() => null) ?? Promise.resolve(null),
    ])
      .then(([remembered, settings, entitlement]) => {
        if (cancelled || getAudioOutputRouteMutationSequence() !== initialRouteMutationSequence) {
          return undefined;
        }

        const useMiniaudioOutput =
          settings?.audioUseMiniaudioOutput === true || settings?.audioMiniaudioOutputExperimentalEnabled === true;
        const useLibavDecode = settings?.audioUseLibavDecode === true;
        const nativeDirectLocalPlaybackEnabled = settings?.audioNativeDirectLocalPlaybackEnabled === true;
        const proUnlocked = entitlement?.unlocked === true;
        const dsdOutputMode = settings?.audioDsdOutputMode === 'pcm' ? 'pcm' : 'dop';
        const asioNativeDsdExperimentalEnabled = settings?.audioAsioNativeDsdExperimentalEnabled === true;
        const configuredSdmMode = normalizeSdmMode(settings?.audioSdmMode);
        const sdmMode = proUnlocked || configuredSdmMode === 'dsdPassthrough' ? configuredSdmMode : 'off';
        const sdmTargetRate = normalizeSdmTargetRate(settings?.audioSdmTargetRate);
        const sdmQualityProfile = normalizeSdmQualityProfile(settings?.audioSdmQualityProfile);
        const sdmComputeBackend = normalizeSdmComputeBackend(settings?.audioSdmComputeBackend);
        const sdmOversamplingFilterProfile1x = normalizeEchoSrcFilterProfile(settings?.audioSdmOversamplingFilterProfile1x, 'sinc-long');
        const sdmOversamplingFilterProfileNx = normalizeEchoSrcFilterProfile(settings?.audioSdmOversamplingFilterProfileNx, 'poly-sinc-hb');
        const exclusiveInstabilityFallbackEnabled = settings?.audioExclusiveInstabilityFallbackEnabled === true;
        const soxrFallbackEnabled = settings?.audioSoxrFallbackEnabled !== false;
        const echoSrcMode = proUnlocked && (settings?.audioEchoSrcMode === 'compatibility48' || settings?.audioEchoSrcMode === 'family2x' || settings?.audioEchoSrcMode === 'family4x' || settings?.audioEchoSrcMode === 'family8x')
          ? settings.audioEchoSrcMode
          : 'off';
        const echoSrcQualityProfile =
          settings?.audioEchoSrcQualityProfile === 'balanced' || settings?.audioEchoSrcQualityProfile === 'lowLatency'
            ? settings.audioEchoSrcQualityProfile
            : 'transparent';
        const echoSrcAdvancedModeEnabled = settings?.audioEchoSrcAdvancedModeEnabled === true;
        const echoSrcFilterProfile = normalizeEchoSrcFilterProfile(settings?.audioEchoSrcFilterProfile);
        const echoSrcFilterProfile1x = normalizeEchoSrcFilterProfile(settings?.audioEchoSrcFilterProfile1x, echoSrcFilterProfile);
        const echoSrcFilterProfileNx = normalizeEchoSrcFilterProfile(settings?.audioEchoSrcFilterProfileNx, 'poly-sinc-hb');
        const echoSrcComputeBackend = settings?.audioEchoSrcComputeBackend === 'cuda' ? 'cuda' : 'cpu';
        const pcmDitherMode = proUnlocked ? normalizePcmDitherMode(settings?.audioPcmDitherMode) : 'off';
        const releaseExclusiveOnPauseExperimentalEnabled = settings?.audioReleaseExclusiveOnPauseExperimentalEnabled === true;
        const automaticOutputEnabled = settings?.audioAutomaticOutputEnabled === true;
        if (automaticOutputEnabled) {
          return audio
            .setOutput({
              automaticOutputEnabled: true,
              useMiniaudioOutput,
              useLibavDecode,
              nativeDirectLocalPlaybackEnabled,
              dsdOutputMode,
              asioNativeDsdExperimentalEnabled,
              sdmMode,
              sdmTargetRate,
              sdmQualityProfile,
              sdmComputeBackend,
              sdmOversamplingFilterProfile1x,
              sdmOversamplingFilterProfileNx,
              exclusiveInstabilityFallbackEnabled,
              soxrFallbackEnabled,
              echoSrcMode,
              echoSrcQualityProfile,
              echoSrcAdvancedModeEnabled,
              echoSrcFilterProfile,
              echoSrcFilterProfile1x,
              echoSrcFilterProfileNx,
              echoSrcComputeBackend,
              pcmDitherMode,
              releaseExclusiveOnPauseExperimentalEnabled,
            })
            .then(handleAudioDrawerStatusChange);
        }
        if (!remembered.enabled) {
          return audio
            .setOutput({
              automaticOutputEnabled: false,
              useMiniaudioOutput,
              useLibavDecode,
              nativeDirectLocalPlaybackEnabled,
              dsdOutputMode,
              asioNativeDsdExperimentalEnabled,
              sdmMode,
              sdmTargetRate,
              sdmQualityProfile,
              sdmComputeBackend,
              sdmOversamplingFilterProfile1x,
              sdmOversamplingFilterProfileNx,
              exclusiveInstabilityFallbackEnabled,
              soxrFallbackEnabled,
              echoSrcMode,
              echoSrcQualityProfile,
              echoSrcAdvancedModeEnabled,
              echoSrcFilterProfile,
              echoSrcFilterProfile1x,
              echoSrcFilterProfileNx,
              echoSrcComputeBackend,
              pcmDitherMode,
              releaseExclusiveOnPauseExperimentalEnabled,
            })
            .then(handleAudioDrawerStatusChange);
        }

        return audio
          .setOutput({
            automaticOutputEnabled: false,
            outputMode: remembered.outputMode,
            sharedBackend: remembered.sharedBackend,
            latencyProfile: remembered.latencyProfile,
            deviceIndex: remembered.deviceIndex,
            deviceName: remembered.deviceName,
            useMiniaudioOutput,
            useLibavDecode,
            nativeDirectLocalPlaybackEnabled,
            dsdOutputMode,
            asioNativeDsdExperimentalEnabled,
            sdmMode,
            sdmTargetRate,
            sdmQualityProfile,
            sdmComputeBackend,
            sdmOversamplingFilterProfile1x,
            sdmOversamplingFilterProfileNx,
            exclusiveInstabilityFallbackEnabled,
            soxrFallbackEnabled,
            echoSrcMode,
            echoSrcQualityProfile,
            echoSrcAdvancedModeEnabled,
            echoSrcFilterProfile,
            echoSrcFilterProfile1x,
            echoSrcFilterProfileNx,
            echoSrcComputeBackend,
            pcmDitherMode,
            releaseExclusiveOnPauseExperimentalEnabled,
          })
          .then(handleAudioDrawerStatusChange);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        if (isAuthorizationFailure(error)) {
          return;
        }
        console.error('Failed to restore remembered audio output', error);
      });

    return () => {
      cancelled = true;
    };
  }, [handleAudioDrawerStatusChange]);

  const notifyLibraryChanged = useCallback(async (options: { preserveScroll?: boolean } = {}): Promise<void> => {
    try {
      await window.echo?.library.getSummary();
    } catch {
      // Summary warmup is best-effort for direct chrome actions.
    }

    window.dispatchEvent(new CustomEvent('library:changed', { detail: { preserveScroll: options.preserveScroll === true } }));
  }, []);

  useEffect(() => {
    const library = window.echo?.library;

    if (!library?.onLibraryChanged) {
      return undefined;
    }

    return library.onLibraryChanged(() => {
      void notifyLibraryChanged({ preserveScroll: true });
    });
  }, [notifyLibraryChanged]);

  useEffect(() => {
    const library = window.echo?.library;

    if (!library?.onLikedTracksChanged) {
      return undefined;
    }

    return library.onLikedTracksChanged(() => {
      window.dispatchEvent(new Event(likedTracksChangedEvent));
      window.dispatchEvent(new Event(likedChangedEvent));
    });
  }, []);

 const handleImportFolder = useCallback(async (): Promise<void> => {
    const library = window.echo?.library;

    if (!library) {
      folderInputRef.current?.click();
      showChromeNotice(t('notice.browserFolderPicker'));
      return;
    }

    try {
      const chosenPath = await library.chooseFolder();

      if (!chosenPath) {
        return;
      }

      const folder = await library.addFolder(chosenPath);
      rememberLibraryScanStatus(await library.scanFolder(folder.id));
      await notifyLibraryChanged();
    } catch (error) {
      console.error('Failed to import folder from app chrome', error);
    }
  }, [notifyLibraryChanged, showChromeNotice, t]);

  const handleImportFile = useCallback(async (): Promise<void> => {
    const playback = window.echo?.playback;
    const library = window.echo?.library;

    if (!library?.chooseImportFiles && !playback) {
      fileInputRef.current?.click();
      showChromeNotice(t('notice.browserFolderPicker'));
      return;
    }

    try {
      const filePaths = library?.chooseImportFiles
        ? await library.chooseImportFiles()
        : playback?.openLocalAudioFiles
          ? await playback.openLocalAudioFiles()
          : await playback?.openLocalAudioFile().then((path) => (path ? [path] : null));

      if (!filePaths?.length) {
        return;
      }

      if (library?.importAudioFiles) {
        const result = await library.importAudioFiles(filePaths);
        if (result.importedCount > 0) {
          clearSongsFirstPageSnapshot();
          await notifyLibraryChanged();
          navigateRoute('songs');
        }

        const details = [
          result.importedCount > 0 ? t('notice.importFiles.imported', { count: result.importedCount }) : null,
          result.skippedCount > 0 ? t('notice.importFiles.skipped', { count: result.skippedCount }) : null,
          result.failedCount > 0 ? t('notice.importFiles.failed', { count: result.failedCount }) : null,
        ].filter(Boolean).join(t('punctuation.clauseSeparator'));
        showChromeNotice(details || t('notice.importFiles.empty'));
        return;
      }

      const result = await playbackQueue.openTemporaryLocalFiles(filePaths);
      navigateRoute('queue');
      if (result.rejected.length > 0) {
        showChromeNotice(t('notice.openFiles.partial', { opened: result.tracks.length, rejected: result.rejected.length }));
      }
    } catch (error) {
      console.error('Failed to open local audio file from app chrome', error);
    }
  }, [navigateRoute, notifyLibraryChanged, playbackQueue, showChromeNotice, t]);

  useEffect(() => {
    const handleAppImportFile = (): void => {
      void handleImportFile();
    };

    window.addEventListener('app:import-file', handleAppImportFile);
    return () => window.removeEventListener('app:import-file', handleAppImportFile);
  }, [handleImportFile]);

  useEffect(() => {
    const unsubscribe = window.echo?.playback?.onLocalAudioFilesOpened?.((paths) => {
      if (paths.length === 0) {
        return;
      }

      void playbackQueue
        .openTemporaryLocalFiles(paths)
        .then((result) => {
          navigateRoute('queue');
          if (result.rejected.length > 0) {
            showChromeNotice(t('notice.openFiles.partial', { opened: result.tracks.length, rejected: result.rejected.length }));
          }
        })
        .catch((error) => {
          console.error('Failed to open local audio files from system', error);
        });
    });

    return () => unsubscribe?.();
  }, [navigateRoute, playbackQueue, showChromeNotice, t]);

  const handleWindowAction = useCallback(
    async (action: 'minimize' | 'hideToTray' | 'toggleMaximize' | 'toggleFullscreen' | 'close'): Promise<void> => {
      const appApi = window.echo?.app;

      if (!appApi) {
        showChromeNotice(t('notice.windowControlsDesktop'));
        return;
      }

      if (action === 'toggleFullscreen') {
        startWindowFullscreenTransition(!isWindowFullscreen);
        await (appApi.triggerFullscreenShortcut?.() ?? appApi.toggleFullscreen());
      } else {
        await appApi[action]();
      }
      if (action === 'toggleMaximize' || action === 'toggleFullscreen') {
        void appApi.isMaximized?.()
          .then(setIsWindowMaximized)
          .catch(() => undefined);
        void appApi.isFullscreen?.()
          .then(setIsWindowFullscreen)
          .catch(() => undefined);
      }
    },
    [isWindowFullscreen, showChromeNotice, startWindowFullscreenTransition, t],
  );

  const showReportOpenedNotice = useCallback(
    (format: 'markdown' | 'text', reportPath: string | undefined): void => {
      const messageKey = format === 'text' ? 'notice.reportOpenedText' : 'notice.reportOpenedMarkdown';
      const pathMessageKey = format === 'text' ? 'notice.reportOpenedTextPath' : 'notice.reportOpenedMarkdownPath';
      showChromeNotice(reportPath ? t(pathMessageKey, { path: reportPath }) : t(messageKey));
    },
    [showChromeNotice, t],
  );

  const handleOpenCrashReportNotice = useCallback(async (format: 'markdown' | 'text' = 'markdown'): Promise<void> => {
    try {
      const reportPath = format === 'text'
        ? await window.echo?.diagnostics.openCrashTextReport()
        : await window.echo?.diagnostics.openCrashReport();
      setDiagnosticsNotice(false);
      showReportOpenedNotice(format, reportPath);
    } catch (error) {
      showChromeNotice(error instanceof Error ? error.message : String(error));
    }
  }, [showChromeNotice, showReportOpenedNotice]);

  const handleDismissDiagnosticsNotice = useCallback(async (): Promise<void> => {
    setDiagnosticsNotice(false);
    await window.echo?.diagnostics.clearLastCrashSummary().catch(() => undefined);
  }, []);

  const handleOpenAudioCrashReport = useCallback(async (format: 'markdown' | 'text' = 'markdown'): Promise<void> => {
    try {
      const reportPath = format === 'text'
        ? await window.echo?.diagnostics.openAudioCrashTextReport()
        : await window.echo?.diagnostics.openAudioCrashReport();
      showReportOpenedNotice(format, reportPath);
    } catch (error) {
      showChromeNotice(error instanceof Error ? error.message : String(error));
    }
  }, [showChromeNotice, showReportOpenedNotice]);

  const handleOpenMemoryPressureReport = useCallback(async (): Promise<void> => {
    try {
      const reportPath = await window.echo?.diagnostics.openMemoryPressureReport();
      setMemoryPressureNotice(null);
      showChromeNotice(reportPath ? t('notice.reportOpenedPath', { path: reportPath }) : t('notice.reportOpened'));
    } catch (error) {
      showChromeNotice(error instanceof Error ? error.message : String(error));
    }
  }, [showChromeNotice, t]);

  const handleCloseAudioIssueDiagnosticsWindow = useCallback((): void => {
    setAudioIssueDiagnosticsWindowEnabled(false);
    void window.echo?.app?.setSettings?.({ audioIssueDiagnosticsWindowEnabled: false })
      .then((settings) => {
        window.dispatchEvent(new CustomEvent('settings:changed', { detail: settings }));
      })
      .catch(() => undefined);
  }, []);

  const handleBrowserFolderPicked = (files: FileList | null): void => {
    if (!files?.length) {
      return;
    }

    showChromeNotice(t('notice.browserFilePicker', { name: `${files.length} file(s)` }));
  };

  const handleBrowserFilePicked = (files: FileList | null): void => {
    const file = files?.[0];

    if (!file) {
      return;
    }

    showChromeNotice(t('notice.browserFilePicker', { name: `"${file.name}"` }));
  };

  const handleToggleDesktopLyrics = useCallback(async (): Promise<void> => {
    const desktopLyrics = window.echo?.desktopLyrics;
    if (!desktopLyrics) {
      return;
    }

    try {
      const state = desktopLyricsVisible
        ? await desktopLyrics.hide()
        : await desktopLyrics.show();
      setDesktopLyricsVisible(state.visible === true);
    } catch {
      setDesktopLyricsVisible((current) => current);
    }
  }, [desktopLyricsVisible]);

  const handleRevealDesktopLyricsMenu = useCallback(async (): Promise<void> => {
    const desktopLyrics = window.echo?.desktopLyrics;
    if (!desktopLyrics?.revealMenu) {
      return;
    }

    try {
      const state = await desktopLyrics.revealMenu();
      setDesktopLyricsVisible(state.visible === true);
      setDesktopLyricsLocked(state.locked === true);
    } catch {
      setDesktopLyricsVisible((current) => current);
      setDesktopLyricsLocked((current) => current);
    }
  }, []);

  return (
    <div
      className={`app-shell ${isStandaloneRoute ? 'app-shell--standalone' : ''} ${isLyricsRoute ? 'app-shell--lyrics' : ''} ${
        shouldUseLyricsPlayerDrawer ? 'app-shell--lyrics-player-drawer app-shell--lyrics-mini-player' : ''
      } ${
        shouldShowAppWallpaperVisual ? 'app-shell--wallpaper' : ''
      } ${
        shouldShowAppWallpaperVisual && isAppWallpaperReady ? 'app-shell--wallpaper-ready' : ''
      } ${
        performancePolicy.appWindowAcrylicEnabled ? 'app-shell--acrylic' : ''
      } ${
        isLyricsVisualDrawerOpen ? 'app-shell--lyrics-visual-drawer-open' : ''
      } ${
        sidebarAutoHideActive ? 'app-shell--sidebar-auto-hide' : ''
      } ${
        hideSidebarForSettings ? 'app-shell--settings-focus' : ''
      } ${
        settingsFocusMotion ? 'app-shell--settings-focus-motion' : ''
      } ${
        sidebarLayoutSettings.sidebarIconOnlyEnabled && !sidebarAutoHideActive && !hideSidebarForSettings && !isLyricsRoute ? 'app-shell--sidebar-icon-only' : ''
      }`}
      data-wallpaper-unified-opacity={shouldShowAppWallpaperVisual && isAppWallpaperReady && appWallpaperSettings.appWallpaperUnifiedOpacityEnabled ? 'true' : undefined}
      data-wallpaper-visual-protection={
        shouldShowAppWallpaperVisual && isAppWallpaperReady ? (appWallpaperSettings.appWallpaperVisualProtectionEnabled ? 'true' : 'false') : undefined
      }
      data-wallpaper-ui-transparent={shouldShowAppWallpaperVisual && isAppWallpaperUiTransparent ? 'true' : undefined}
      data-wallpaper-ui-zero={shouldShowAppWallpaperVisual && isAppWallpaperUiZero ? 'true' : undefined}
      data-wallpaper-orientation={shouldShowAppWallpaperVisual ? activeAppWallpaperOrientation : undefined}
      data-window-acrylic={performancePolicy.appWindowAcrylicEnabled ? 'true' : undefined}
      data-window-acrylic-keep-unfocused={performancePolicy.appWindowAcrylicEnabled && appWallpaperSettings.appWindowAcrylicKeepWhenUnfocusedEnabled ? 'true' : undefined}
      data-low-spec-mode={performancePolicy.lowSpecModeEnabled ? 'true' : undefined}
      data-render-budget={renderBudget.mode}
      data-window-focused={isWindowFocused ? 'true' : 'false'}
      data-window-fullscreen={isWindowFullscreen ? 'true' : 'false'}
      data-window-fullscreen-target={
        (windowFullscreenTransitionTarget ?? isWindowFullscreen) ? 'true' : 'false'
      }
      data-window-fullscreen-transition={isWindowFullscreenTransitioning ? 'true' : undefined}
      data-lyrics-sidebar-restoring={isLyricsSidebarRestoring ? 'true' : undefined}
      data-active-route={activeRouteId}
      style={appShellStyle}
    >
      <a className="accessibility-skip-link" href={`#main-content-${activeRoute.id}`}>
        {t('common.skipToContent')}
      </a>
      {shouldMountAppWallpaperMedia && appWallpaperUrl ? (
        <div
          className="app-wallpaper-layer"
          aria-hidden="true"
          data-hidden={shouldShowAppWallpaperVisual ? undefined : 'true'}
          data-loaded={isAppWallpaperReady}
          data-error={hasAppWallpaperLoadError ? 'true' : undefined}
        >
          {isAppWallpaperVideo ? (
            <video
              ref={appWallpaperVideoRef}
              src={appWallpaperUrl}
              muted
              loop
              autoPlay
              playsInline
              preload="metadata"
              style={appWallpaperStyle}
              onCanPlay={() => {
                setFailedAppWallpaperKey(null);
                setLoadedAppWallpaperKey(appWallpaperKey);
              }}
              onLoadedData={() => {
                setFailedAppWallpaperKey(null);
                setLoadedAppWallpaperKey(appWallpaperKey);
              }}
              onError={() => {
                setLoadedAppWallpaperKey(null);
                setFailedAppWallpaperKey(appWallpaperKey);
                showChromeNotice(t('settings.appearance.wallpaper.loadError'));
              }}
            />
          ) : (
            <img
              src={appWallpaperUrl}
              alt=""
              style={appWallpaperStyle}
              onLoad={() => {
                setFailedAppWallpaperKey(null);
                setLoadedAppWallpaperKey(appWallpaperKey);
              }}
              onError={() => {
                setLoadedAppWallpaperKey(null);
                setFailedAppWallpaperKey(appWallpaperKey);
                showChromeNotice(t('settings.appearance.wallpaper.loadError'));
              }}
            />
          )}
        </div>
      ) : null}

      <AppTitleBar
        activeRouteId={activeRouteId}
        isAudioSettingsOpen={isAudioDrawerOpen}
        isLyricsSettingsOpen={isLyricsDrawerOpen}
        isLyricsVisualSettingsOpen={isLyricsVisualDrawerOpen}
        onRouteChange={navigateRoute}
        onPreloadSettings={preloadSettingsRoute}
        onOpenAudioSettings={handleOpenAudioSettingsDrawer}
        onOpenLyricsSettings={handleOpenLyricsSettingsDrawer}
        onOpenLyricsVisualSettings={handleOpenLyricsVisualSettingsDrawer}
        onSettingsBack={() => {
          window.dispatchEvent(new Event(settingsBackNavigationEvent));
        }}
        onMinimize={() => void handleWindowAction('minimize')}
        onHideToTray={() => void handleWindowAction('hideToTray')}
        onToggleMaximize={() => void handleWindowAction('toggleMaximize')}
        onToggleFullscreen={() => void handleWindowAction('toggleFullscreen')}
        isWindowMaximized={isWindowMaximized}
        isWindowFullscreen={isWindowFullscreen}
        onClose={() => void handleWindowAction('close')}
      />

      {isStandaloneRoute && !isLyricsRoute ? null : (
        <Sidebar
          routes={visibleRoutes}
          activeRouteId={activeRouteId}
          iconOnly={sidebarLayoutSettings.sidebarIconOnlyEnabled && !sidebarAutoHideActive}
          hiddenRouteIds={normalizeSidebarHiddenRouteIds(sidebarLayoutSettings.sidebarHiddenRouteIds)}
          forceHidden={hideSidebarForSettings || isLyricsRoute}
          onRouteChange={navigateRoute}
          onOpenAudioSettings={handleOpenAudioSettingsDrawer}
          onOpenLyricsSettings={handleOpenLyricsSettingsDrawer}
          onImportFolder={() => void handleImportFolder()}
          onImportFile={() => void handleImportFile()}
          onToggleIconOnly={handleSidebarIconOnlyToggle}
          onHideRoute={handleSidebarRouteHide}
          onShowRoute={handleSidebarRouteShow}
          onReorderRoutes={handleSidebarRouteReorder}
        />
      )}

      {renderedRoutes.map((route) => {
        const isActive = route.id === activeRoute.id;
        const routeIsStandalone = route.chrome === 'standalone';
        let routeElement = route.element;
        if (route.id === 'lyrics' && isValidElement(route.element)) {
          routeElement = cloneElement(route.element as ReactElement<{ isActive?: boolean; usePlayerDrawerHeader?: boolean }>, {
            isActive,
            usePlayerDrawerHeader: shouldUseLyricsPlayerDrawer,
          });
        } else if (route.id === 'songs' && isValidElement(route.element)) {
          routeElement = cloneElement(route.element as ReactElement<{ isActive?: boolean }>, { isActive });
        }

        return (
          <AnimatedOutlet
            className={`page-surface ${routeIsStandalone ? 'page-surface--standalone' : ''}`}
            hidden={!isActive}
            isActive={isActive}
            key={route.id}
            routeId={route.id}
          >
            <Suspense fallback={<RouteLoadingFallback />}>
              <RouteActivityProvider isActive={isActive}>
                {routeElement}
              </RouteActivityProvider>
            </Suspense>
          </AnimatedOutlet>
        );
      })}

      <EditableContextMenu />

      {shouldRenderDragDropImportOverlay ? <DragDropImportOverlay onNotice={showChromeNotice} /> : null}

      {shouldRenderFirstRunWizard ? (
        <Suspense fallback={null}>
          <FirstRunWizard
            initialSettings={firstRunSettings}
            presentationState={isFirstRunWizardClosing ? 'closing' : 'open'}
            onClose={closeFirstRunWizard}
            onCompleted={(settings) => {
              if (settings) {
                setFirstRunSettings(settings);
                setAppWallpaperSettings(selectAppWallpaperSettings(settings));
                setLyricsMiniPlayerSettings(selectLyricsMiniPlayerSettings(settings));
              }
            }}
          />
        </Suspense>
      ) : null}

      <input
        ref={folderInputRef}
        className="browser-preview-picker"
        type="file"
        multiple
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => handleBrowserFolderPicked(event.target.files)}
      />
      <input
        ref={fileInputRef}
        className="browser-preview-picker"
        type="file"
        accept=".flac,.mp3,.wav,.m4a,.m4p,.aac,.ogg,.opus,.wma,.alac,.aiff,.aif,.ape,.wv,.tta,.tak,.caf,.dsf,.dff,.mka,.mkv,.mp4,.mov,.webm,.mp2,.mp1,.mpc,.ofr,.ofs,.spx,.amr,.ac3,.dts,audio/*"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => handleBrowserFilePicked(event.target.files)}
      />

      {audioIssueDiagnosticsWindowEnabled ? (
        <AudioIssueDiagnosticsWindow onClose={handleCloseAudioIssueDiagnosticsWindow} />
      ) : null}

      <div className="chrome-notice-layer">
        <ChromeNoticePresence
          onExited={() => setChromeNotice(null)}
          role="status"
          show={!notificationsDisabled && Boolean(chromeNotice) && isChromeNoticeVisible}
        >
          <span className="chrome-notice-message">{chromeNotice}</span>
          <button className="chrome-notice-close" type="button" aria-label={t('notice.action.closeNotice')} title={t('notice.action.closeNotice')} onClick={dismissChromeNotice}>
            <X size={14} />
          </button>
        </ChromeNoticePresence>

        <ChromeNoticePresence
          ariaLive="polite"
          className="upcoming-track-notice"
          onExited={() => setUpcomingTrackNotice(null)}
          role="status"
          show={!notificationsDisabled && upcomingTrackNoticeEnabled && Boolean(upcomingTrackNotice) && isUpcomingTrackNoticeVisible}
        >
          {upcomingTrackNotice ? (
            <>
              <div className="upcoming-track-notice__cover" data-empty={!upcomingTrackNotice.track.coverThumb}>
                {upcomingTrackNotice.track.coverThumb ? (
                  <img
                    alt={t('notice.upcomingTrack.coverAlt', { title: upcomingTrackNotice.track.title })}
                    src={upcomingTrackNotice.track.coverThumb}
                  />
                ) : (
                  <span aria-hidden="true" />
                )}
              </div>
              <div className="upcoming-track-notice__copy">
                <span>{t('notice.upcomingTrack.kicker')}</span>
                <strong title={upcomingTrackNotice.track.title}>{upcomingTrackNotice.track.title}</strong>
                <em title={upcomingTrackNotice.track.artist || t('queue.unknownArtist')}>
                  {upcomingTrackNotice.track.artist || t('queue.unknownArtist')}
                </em>
                <small title={upcomingTrackNotice.track.album || t('queue.unknownAlbum')}>
                  {upcomingTrackNotice.track.album || t('queue.unknownAlbum')}
                </small>
              </div>
              <button
                className="chrome-notice-close"
                type="button"
                aria-label={t('notice.action.closeNotice')}
                title={t('notice.action.closeNotice')}
                onClick={() => setIsUpcomingTrackNoticeVisible(false)}
              >
                <X size={14} />
              </button>
            </>
          ) : null}
        </ChromeNoticePresence>

        <ChromeNoticePresence
          ariaLive="assertive"
          className="chrome-notice--memory-pressure"
          role="alert"
          show={!notificationsDisabled && Boolean(memoryPressureNotice)}
        >
          {memoryPressureNotice ? (
            <>
              <strong>{t('notice.memoryPressure.title')}</strong>
              <span>
                {t('notice.memoryPressure.description', {
                  process: memoryPressureNotice.topProcessType,
                  processMemory: formatMemoryNoticeBytes(memoryPressureNotice.topProcessWorkingSetBytes),
                  threshold: formatMemoryNoticeBytes(memoryPressureNotice.thresholdBytes),
                  usage: formatMemoryNoticeBytes(memoryPressureNotice.totalWorkingSetBytes),
                })}
              </span>
              <small>{t('notice.memoryPressure.reportReady')}</small>
              <div className="chrome-notice-actions">
                <button type="button" onClick={() => void handleOpenMemoryPressureReport()}>
                  {t('notice.action.openReport')}
                </button>
                <button type="button" onClick={() => setMemoryPressureNotice(null)}>
                  {t('notice.action.close')}
                </button>
              </div>
            </>
          ) : null}
        </ChromeNoticePresence>

        <ChromeNoticePresence
          className="chrome-notice--diagnostics"
          role="status"
          show={!notificationsDisabled && diagnosticsNotice}
        >
          <span>{t('notice.diagnosticsCrash.description')}</span>
          <div className="chrome-notice-actions">
            <button type="button" onClick={() => void handleOpenCrashReportNotice('markdown')}>
              {t('notice.action.openMarkdownReport')}
            </button>
            <button type="button" onClick={() => void handleOpenCrashReportNotice('text')}>
              {t('notice.action.openTextReport')}
            </button>
            <button type="button" onClick={() => void handleDismissDiagnosticsNotice()}>
              {t('notice.action.ignore')}
            </button>
          </div>
        </ChromeNoticePresence>

        <ChromeNoticePresence
          ariaLive="polite"
          className="chrome-notice--audio-error"
          role="status"
          show={!notificationsDisabled && audioComponentNotice}
        >
          <>
            <strong>{t('notice.audioComponent.title')}</strong>
            <span>{t('notice.audioComponent.description')}</span>
            <small>{t('notice.audioComponent.size')}</small>
            <div className="chrome-notice-actions">
              <button type="button" disabled={audioComponentActionBusy} onClick={() => void handleOpenAudioComponentDownloadPage()}>
                {t('notice.audioComponent.action.download')}
              </button>
              <button type="button" disabled={audioComponentActionBusy} onClick={() => void handleImportAudioComponent()}>
                {t('notice.audioComponent.action.import')}
              </button>
              <button type="button" disabled={audioComponentActionBusy} onClick={() => setAudioComponentNotice(false)}>
                {t('notice.audioComponent.action.later')}
              </button>
            </div>
          </>
        </ChromeNoticePresence>

        <ChromeNoticePresence
          className="chrome-notice--audio-error"
          role="alert"
          show={!notificationsDisabled && Boolean(audioErrorNotice)}
        >
          {audioErrorNotice ? (
            <>
              <strong>{t('notice.audioError.title')}</strong>
              <span>{audioErrorNotice.message}</span>
              <small>{t('notice.audioError.description')}</small>
              <div className="chrome-notice-actions">
                <button type="button" onClick={() => void handleOpenAudioCrashReport('markdown')}>
                  {t('notice.action.openMarkdownReport')}
                </button>
                <button type="button" onClick={() => void handleOpenAudioCrashReport('text')}>
                  {t('notice.action.openTextReport')}
                </button>
                <button type="button" onClick={() => setAudioErrorNotice(null)}>
                  {t('notice.action.close')}
                </button>
              </div>
            </>
          ) : null}
        </ChromeNoticePresence>
      </div>

      <Suspense fallback={null}>
        {shouldMountAudioDrawer ? (
          <AudioSettingsDrawer
            isOpen={isAudioDrawerOpen}
            status={audioDrawerStatus}
            hqPlayerTakeoverEnabled={playbackQueue.hqPlayerTakeoverEnabled}
            hqPlayerTrack={playbackQueue.currentTrack ?? playbackQueue.lastPlayedTrack}
            onClose={() => setIsAudioDrawerOpen(false)}
            onActivateHqPlayerTakeover={async () => {
              const status = await playbackQueue.activateHqPlayerTakeover();
              if (status) {
                setPlaybackStatusSnapshot({ playbackStatus: status, error: null });
              }
            }}
            onHqPlayerTakeoverEnabledChange={playbackQueue.setHqPlayerTakeoverEnabled}
            onStatusChange={handleAudioDrawerStatusChange}
          />
        ) : null}
        {shouldMountLyricsDrawer ? (
          <LyricsSettingsDrawer
            currentTrackTools={lyricsDrawerCurrentTrackTools}
            isOpen={isLyricsDrawerOpen}
            onClose={() => setIsLyricsDrawerOpen(false)}
          />
        ) : null}
        {shouldMountLyricsVisualDrawer ? (
          <LyricsVisualSettingsDrawer
            isOpen={isLyricsVisualDrawerOpen}
            onClose={() => setIsLyricsVisualDrawerOpen(false)}
          />
        ) : null}
      </Suspense>
      <PlaybackQueueDrawer
        isOpen={isLyricsRoute && isLyricsQueueDrawerOpen}
        onClose={() => setIsLyricsQueueDrawerOpen(false)}
        onOpenFullQueue={handleOpenFullQueueFromLyricsDrawer}
      />

      {shouldRenderPlayerBar ? (
        <div
          ref={lyricsMiniPlayerHostRef}
          className={[
            'player-bar-host',
            shouldUseLyricsPlayerDrawer ? 'lyrics-player-drawer-host lyrics-mini-player-host' : '',
            shouldAutoHideLyricsMiniPlayer ? 'lyrics-player-drawer-host--auto-hide' : '',
            isLyricsMiniPlayerShortcutModeActive ? 'lyrics-player-drawer-host--shortcut-toggle' : '',
            isLyricsMiniPlayerVisuallyHidden ? 'lyrics-player-drawer-host--auto-hidden' : '',
          ].filter(Boolean).join(' ')}
          data-auto-hide={shouldAutoHideLyricsMiniPlayer ? 'true' : undefined}
          data-auto-hide-state={shouldAutoHideLyricsMiniPlayer ? (isLyricsMiniPlayerVisuallyHidden ? 'hidden' : 'visible') : undefined}
          data-shortcut-toggle={isLyricsMiniPlayerShortcutModeActive ? 'true' : undefined}
          data-shortcut-toggle-state={
            isLyricsMiniPlayerShortcutModeActive ? (isLyricsMiniPlayerVisuallyHidden ? 'hidden' : 'visible') : undefined
          }
          data-mini-player-settings-ready={
            shouldUseLyricsPlayerDrawer ? (lyricsMiniPlayerSettingsReady ? 'true' : 'false') : undefined
          }
          data-mini-player-color-mode={shouldUseLyricsPlayerDrawer ? lyricsMiniPlayerSettings.lyricsPlayerBarDrawerColorMode : undefined}
          style={shouldUseLyricsPlayerDrawer ? lyricsMiniPlayerStyle : undefined}
        >
          <PlayerBar
            desktopLyricsVisible={desktopLyricsVisible}
            hasDesktopLyricsBridge={hasDesktopLyricsBridge}
            lyricsCompactOnIdle={
              lyricsMiniPlayerSettings.lyricsPlayerBarDrawerCompactOnIdleEnabled === true &&
              !isLyricsMiniPlayerShortcutModeActive
            }
            lyricsMiniPlayer={shouldUseLyricsPlayerDrawer}
            onOpenAudioSettings={handleOpenAudioSettingsDrawer}
            onOpenQueue={isLyricsRoute ? handleOpenLyricsQueueDrawer : handleOpenShellQueue}
            showQueueButton={true}
            showSignalPathControl={!isLyricsRoute && signalPathControlEnabled}
            onRevealDesktopLyricsMenu={() => void handleRevealDesktopLyricsMenu()}
            onToggleDesktopLyrics={handleToggleDesktopLyrics}
          />
        </div>
      ) : null}
    </div>
  );
};
