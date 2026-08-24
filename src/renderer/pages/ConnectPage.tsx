import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Cast,
  Check,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  FolderOpen,
  Image,
  Loader2,
  Play,
  Power,
  RefreshCw,
  Save,
  Smartphone,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import QRCode from 'qrcode';
import type { AirPlayReceiverProtocol, AppSettings } from '../../shared/types/appSettings';
import { hqPlayerConnectDeviceId } from '../../shared/types/connect';
import type { AirPlayReceiverStatus, ConnectDevice, ConnectPreflightResult, ConnectReceiverStatus, ConnectSessionStatus } from '../../shared/types/connect';
import type { EchoLinkServerStatus, EchoLinkWebBackground } from '../../shared/types/echoLink';
import type {
  HqPlayerConnectionTestResult,
  HqPlayerPlaybackControlPlan,
  HqPlayerPlaybackHandoffPlan,
  HqPlayerSettings,
  HqPlayerStatus,
} from '../../shared/types/hqplayer';
import type { LibraryTrack } from '../../shared/types/library';
import type { PlayableTrack } from '../../shared/types/remoteSources';
import { streamingProviderNames, streamingStableKey } from '../../shared/mediaProviderIdentity';
import type { StreamingProviderName } from '../../shared/types/streaming';
import { useI18n } from '../i18n/I18nProvider';
import type { TranslationKey } from '../i18n/locales';
import { ConnectWorkspaceTabs, connectWorkspaceModes, type ConnectWorkspaceMode } from '../components/connect/ConnectWorkspaceTabs';
import { type ConnectDeviceFilter } from '../components/connect/ConnectDeviceSearch';
import { ConnectOutputWorkspace } from '../components/connect/ConnectOutputWorkspace';
import { ConnectPreflightDialog } from '../components/connect/ConnectOutputTrustPanel';
import { ConnectHqPlayerWorkspace } from '../components/connect/ConnectHqPlayerWorkspace';
import { ConnectReceiveWorkspace } from '../components/connect/ConnectReceiveWorkspace';
import { ConnectRadioWorkspace, type RadioStation } from '../components/connect/ConnectRadioWorkspace';
import {
  connectBrowserPreviewDevices,
  connectBrowserPreviewEchoLinkBridge,
  connectBrowserPreviewMqttBridge,
  connectBrowserPreviewStatus,
  isConnectBrowserPreview,
} from '../components/connect/connectBrowserPreview';
import { EchoLinkBasicPanel } from '../components/settings/EchoLinkBasicPanel';
import { MqttIntegrationPanel } from '../components/settings/MqttIntegrationPanel';
import { usePlaybackQueue } from '../stores/PlaybackQueueProvider';
import { useSharedPlaybackStatusForUi } from '../stores/playbackStatusStore';
import { matchesSearchFields } from '../utils/smartTextSearch';
import '../styles/connect-workspace.css';
import '../styles/connect-radio.css';
import '../styles/connect-receive.css';
import '../styles/connect-hqplayer.css';
import '../styles/connect-output.css';

type Translate = ReturnType<typeof useI18n>['t'];

const defaultStatus: ConnectSessionStatus = {
  deviceId: null,
  protocol: null,
  state: 'idle',
  currentTrackId: null,
  metadata: null,
  positionSeconds: 0,
  durationSeconds: 0,
  latencyMs: null,
  error: null,
  updatedAt: new Date(0).toISOString(),
};

const defaultReceiverStatus: ConnectReceiverStatus = {
  enabled: false,
  state: 'disabled',
  advertisedName: 'ECHO',
  addresses: [],
  currentClient: null,
  currentUri: null,
  metadata: null,
  positionSeconds: 0,
  durationSeconds: 0,
  volume: 100,
  error: null,
  debugEvents: [],
  updatedAt: new Date(0).toISOString(),
};

const defaultAirPlayReceiverStatus: AirPlayReceiverStatus = {
  enabled: false,
  state: 'disabled',
  protocol: 'airplay1',
  advertisedName: 'ECHO (AirPlay)',
  nativeAvailable: false,
  currentSourceId: null,
  currentClient: null,
  metadata: null,
  currentLyricLine: null,
  artworkUrl: null,
  positionSeconds: 0,
  durationSeconds: 0,
  volume: 100,
  error: null,
  debugEvents: [],
  updatedAt: new Date(0).toISOString(),
};

const defaultEchoLinkWebBackground: EchoLinkWebBackground = { type: 'none', url: '' };

const defaultEchoLinkStatus: EchoLinkServerStatus = {
  enabled: false,
  running: false,
  port: 26789,
  host: '127.0.0.1',
  addresses: [],
  pairingUri: null,
  webControlUrl: null,
  token: '',
  deviceName: 'PC ECHO',
  deviceId: '',
  webBackground: defaultEchoLinkWebBackground,
  activeMediaTokens: 0,
  activeArtworkTokens: 0,
  mdns: {
    state: 'disabled',
    serviceName: '_echo-link._tcp.local',
    error: null,
    advertisedAddresses: [],
  },
  diagnostics: {
    selectedLanAddress: '127.0.0.1',
    lastPhoneConnectionAt: null,
    lastAuthFailureAt: null,
    authFailureCount: 0,
    lastMediaTokenServed: null,
    recentHttpErrors: [],
  },
  error: null,
  updatedAt: new Date(0).toISOString(),
};

type WallpaperEngineBridgeStatus = {
  running: boolean;
  host: string;
  port: number | null;
  url: string | null;
  eventClients: number;
};

const defaultWallpaperEngineBridgeStatus: WallpaperEngineBridgeStatus = {
  running: false,
  host: '127.0.0.1',
  port: null,
  url: null,
  eventClients: 0,
};

const workspaceDescription: Record<ConnectWorkspaceMode, TranslationKey> = {
  output: 'connectPage.header.description',
  hqplayer: 'connectPage.header.descriptionHqPlayer',
  receive: 'connectPage.header.descriptionReceive',
  mobile: 'connectPage.header.descriptionMobile',
  radio: 'connectPage.header.descriptionRadio',
};

const defaultHqPlayerSettings: HqPlayerSettings = {
  enabled: false,
  connectionMode: 'localDesktop',
  host: '127.0.0.1',
  port: 4321,
  executablePath: null,
  allowLaunch: false,
  mediaServerEnabled: false,
  mediaServerPort: null,
  defaultPlaybackBackend: 'ask',
  profileName: null,
};

const hqPlayerLocalHost = '127.0.0.1';
const hqPlayerDefaultPort = 4321;
const hiddenConnectDevicesStorageKey = 'echo.connect.hiddenDevices.v1';
const pinnedConnectDevicesStorageKey = 'echo.connect.pinnedDevices.v1';
const connectWorkspaceModeStorageKey = 'echo.connect.workspaceMode.v1';
const connectDeviceSectionCollapsedStorageKey = 'echo.connect.deviceSectionCollapsed.v1';
const legacyRadioStationsStorageKey = 'echo.connect.radioStations.v1';
const radioStationsStorageKey = 'echo.connect.radioStations.v2';
const maxStoredRadioStations = 40;

type ConnectBridge = NonNullable<NonNullable<Window['echo']>['connect']>;

const isRendererTestEnvironment = (): boolean =>
  typeof navigator !== 'undefined' && /jsdom/iu.test(navigator.userAgent);

const connectRefreshCacheTtlMs = isRendererTestEnvironment() ? 0 : 4_000;
let connectRefreshCache: { bridge: ConnectBridge; devices: ConnectDevice[]; loadedAtMs: number } | null = null;
let connectRefreshRequest: { bridge: ConnectBridge; promise: Promise<ConnectDevice[]> } | null = null;

const invalidateConnectRefreshCache = (): void => {
  connectRefreshCache = null;
};

export const resetConnectDonatorUnlockStatusCacheForTests = (): void => {
  invalidateConnectRefreshCache();
  connectRefreshRequest = null;
};

const loadConnectDevices = (connect: ConnectBridge, force = false): Promise<ConnectDevice[]> => {
  if (force) {
    invalidateConnectRefreshCache();
  } else if (connectRefreshCache?.bridge === connect && Date.now() - connectRefreshCache.loadedAtMs <= connectRefreshCacheTtlMs) {
    return Promise.resolve(connectRefreshCache.devices);
  } else if (connectRefreshRequest?.bridge === connect) {
    return connectRefreshRequest.promise;
  }

  const promise = connect.refresh().then((devices) => {
    connectRefreshCache = {
      bridge: connect,
      devices,
      loadedAtMs: Date.now(),
    };
    return devices;
  });

  connectRefreshRequest = { bridge: connect, promise };
  void promise.then(() => {
    if (connectRefreshRequest?.promise === promise) {
      connectRefreshRequest = null;
    }
  }, () => {
    if (connectRefreshRequest?.promise === promise) {
      connectRefreshRequest = null;
    }
  });
  return promise;
};

const createEchoLinkPairingUri = (status: EchoLinkServerStatus, host: string): string | null => {
  if (!status.enabled || !status.running || !status.token) {
    return null;
  }
  const entries: Array<[string, string]> = [
    ['host', host],
    ['port', String(status.port)],
    ['token', status.token],
    ['name', status.deviceName],
    ['scheme', 'http'],
  ];
  return `echo://pair?${entries.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&')}`;
};

const createEchoLinkWebControlUrl = (status: EchoLinkServerStatus, host: string): string | null => {
  if (!status.enabled || !status.running || !status.token) {
    return null;
  }
  const url = new URL(`http://${host}:${status.port}/echo-link/web`);
  url.searchParams.set('token', status.token);
  return url.toString();
};

const hqPlayerStateLabel: Record<HqPlayerStatus['state'], TranslationKey> = {
  disabled: 'connectPage.hqplayer.state.disabled',
  'not-configured': 'connectPage.hqplayer.state.notConfigured',
  checking: 'connectPage.hqplayer.state.checking',
  available: 'connectPage.hqplayer.state.available',
  unavailable: 'connectPage.hqplayer.state.unavailable',
};

const formatTime = (seconds: number): string => {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = String(safe % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
};

const readStoredStringSet = (key: string): Set<string> => {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return new Set();
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((item): item is string => typeof item === 'string')) : new Set();
  } catch {
    return new Set();
  }
};

const writeStoredStringSet = (key: string, values: Set<string>): void => {
  try {
    window.localStorage.setItem(key, JSON.stringify([...values]));
  } catch {
    // Local UI preference only; ignore blocked storage.
  }
};

const readStoredBoolean = (key: string, fallback: boolean): boolean => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw == null ? fallback : raw === 'true';
  } catch {
    return fallback;
  }
};

const writeStoredBoolean = (key: string, value: boolean): void => {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Local UI preference only; ignore blocked storage.
  }
};

const readStoredWorkspaceMode = (): ConnectWorkspaceMode => {
  try {
    const mode = window.localStorage.getItem(connectWorkspaceModeStorageKey);
    return mode === 'hqplayer' || mode === 'receive' || mode === 'mobile' || mode === 'radio' ? mode : 'output';
  } catch {
    return 'output';
  }
};

const writeStoredWorkspaceMode = (mode: ConnectWorkspaceMode): void => {
  try {
    window.localStorage.setItem(connectWorkspaceModeStorageKey, mode);
  } catch {
    // Local UI preference only; ignore blocked storage.
  }
};

const hashText = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
};

const normalizeRadioUrl = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    if (url.username || url.password) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
};

const normalizeOptionalRadioUrl = (value: string | null | undefined): string | undefined | null => {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    return undefined;
  }
  return normalizeRadioUrl(trimmed) ?? null;
};

const radioStationIdForUrl = (url: string): string => `radio:${hashText(url.toLowerCase())}`;

const radioTrackIdForUrl = (url: string): string => `radio-stream:${hashText(url.toLowerCase())}`;

const radioStationKeyForUrl = (url: string): string => (normalizeRadioUrl(url) ?? url).toLowerCase();

const encodeRadioProviderTrackId = (url: string): string => {
  const bytes = new TextEncoder().encode(url);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return globalThis.btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
};

const stationNameFromUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./iu, '') || '网络电台';
  } catch {
    return '网络电台';
  }
};

const defaultRadioStationCreatedAt = '2026-05-31T00:00:00.000Z';

const createDefaultRadioStation = (name: string, url: string, description: string): RadioStation => {
  const normalizedUrl = normalizeRadioUrl(url) ?? url;
  return {
    id: radioStationIdForUrl(normalizedUrl),
    name,
    url: normalizedUrl,
    description,
    createdAt: defaultRadioStationCreatedAt,
    updatedAt: defaultRadioStationCreatedAt,
    lastPlayedAt: null,
  };
};

const createRadioStation = ({
  coverUrl,
  lastPlayedAt,
  name,
  url,
  videoUrl,
}: {
  coverUrl?: string;
  lastPlayedAt: string | null;
  name?: string;
  url: string;
  videoUrl?: string;
}): RadioStation => {
  const now = new Date().toISOString();
  return {
    id: radioStationIdForUrl(url),
    name: name?.trim() || stationNameFromUrl(url),
    url,
    ...(coverUrl ? { coverUrl } : {}),
    ...(videoUrl ? { videoUrl } : {}),
    createdAt: now,
    updatedAt: now,
    lastPlayedAt,
  };
};

const radioStationToTrack = (station: RadioStation): LibraryTrack => {
  const providerTrackId = encodeRadioProviderTrackId(station.url);
  const stableKey = streamingStableKey('m3u8', providerTrackId);
  const artist = 'Live Stream';
  return {
    id: radioTrackIdForUrl(station.url),
    mediaType: 'streaming',
    isTemporary: true,
    isLiveStream: true,
    liveVideoUrl: station.videoUrl ?? null,
    path: stableKey,
    provider: 'm3u8',
    providerTrackId,
    streamingQuality: 'standard',
    stableKey,
    title: station.name,
    artist,
    album: 'ECHO Live',
    albumArtist: artist,
    trackNo: null,
    discNo: null,
    year: null,
    genre: null,
    duration: 0,
    codec: 'stream',
    sampleRate: null,
    bitDepth: null,
    bitrate: null,
    coverId: null,
    coverThumb: station.coverUrl ?? null,
    fieldSources: {
      title: 'connect-live',
      artist: 'connect-live',
      album: 'connect-live',
    },
    unavailable: false,
  };
};

const defaultRadioStations: RadioStation[] = [
  createDefaultRadioStation('Zeno', 'https://stream.zeno.fm/qpn8mkt8c4duv', 'Zeno 托管的二次元直播流，轻量备用源。'),
  createDefaultRadioStation('Gensokyo Radio 东方', 'https://stream.gensokyoradio.net/1/', '东方 Project 同人音乐电台，适合长时间后台播放。'),
  createDefaultRadioStation('ANISONG', 'https://pool.anison.fm/AniSonFM%28320%29', '动画歌曲向电台，OP、ED、角色歌和 ACG 曲库为主。'),
  createDefaultRadioStation('Yumi Co. Radio', 'https://yumicoradio.net/stream', 'City Pop、Future Funk、Anime Groove 氛围台。'),
  createDefaultRadioStation('AnimeRadio.de', 'https://stream.animeradio.de/animeradio.mp3', 'J-Pop、J-Rock 和 Anime Musik 的老牌网络电台。'),
];

const isStoredRadioStation = (value: unknown): value is RadioStation => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const station = value as Partial<RadioStation>;
  return (
    typeof station.id === 'string' &&
    typeof station.name === 'string' &&
    typeof station.url === 'string' &&
    normalizeRadioUrl(station.url) !== null &&
    (station.coverUrl === undefined || (typeof station.coverUrl === 'string' && normalizeRadioUrl(station.coverUrl) !== null)) &&
    (station.videoUrl === undefined || (typeof station.videoUrl === 'string' && normalizeRadioUrl(station.videoUrl) !== null)) &&
    (station.description === undefined || typeof station.description === 'string') &&
    typeof station.createdAt === 'string' &&
    typeof station.updatedAt === 'string' &&
    (station.lastPlayedAt === null || typeof station.lastPlayedAt === 'string')
  );
};

const sanitizeRadioStation = (station: RadioStation): RadioStation => {
  const url = normalizeRadioUrl(station.url) ?? station.url;
  const coverUrl = normalizeOptionalRadioUrl(station.coverUrl);
  const videoUrl = normalizeOptionalRadioUrl(station.videoUrl);
  const description = station.description?.trim();
  return {
    ...station,
    id: radioStationIdForUrl(url),
    name: station.name.trim() || stationNameFromUrl(url),
    url,
    ...(coverUrl ? { coverUrl } : { coverUrl: undefined }),
    ...(videoUrl ? { videoUrl } : { videoUrl: undefined }),
    description: description || undefined,
  };
};

const readRadioStationsFromStorage = (key: string): RadioStation[] | null => {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed
          .filter(isStoredRadioStation)
          .map(sanitizeRadioStation)
          .slice(0, maxStoredRadioStations)
      : [];
  } catch {
    return [];
  }
};

const mergeDefaultRadioStations = (storedStations: RadioStation[]): RadioStation[] => {
  const storedByUrl = new Map(storedStations.map((station) => [radioStationKeyForUrl(station.url), station]));
  const defaultKeys = new Set(defaultRadioStations.map((station) => radioStationKeyForUrl(station.url)));
  const seededStations = defaultRadioStations.map((station) => {
    const stored = storedByUrl.get(radioStationKeyForUrl(station.url));
    return stored
      ? {
          ...station,
          createdAt: stored.createdAt,
          updatedAt: stored.updatedAt,
          lastPlayedAt: stored.lastPlayedAt,
        }
      : station;
  });
  const customStations = storedStations.filter((station) => !defaultKeys.has(radioStationKeyForUrl(station.url)));
  return [...seededStations, ...customStations].slice(0, maxStoredRadioStations);
};

const readStoredRadioStations = (): RadioStation[] => {
  const current = readRadioStationsFromStorage(radioStationsStorageKey);
  if (current) {
    return current;
  }

  const migrated = mergeDefaultRadioStations(readRadioStationsFromStorage(legacyRadioStationsStorageKey) ?? []);
  writeStoredRadioStations(migrated);
  return migrated;
};

const writeStoredRadioStations = (stations: RadioStation[]): void => {
  try {
    window.localStorage.setItem(radioStationsStorageKey, JSON.stringify(stations.map(sanitizeRadioStation).slice(0, maxStoredRadioStations)));
  } catch {
    // Radio favorites are local convenience data; playback must not depend on storage.
  }
};

const formatTimestamp = (value: string | null, t: Translate): string => {
  if (!value) {
    return t('connectPage.common.notChecked');
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

type ReceiverDebugEvent = ConnectReceiverStatus['debugEvents'][number];

const formatReceiverDebugEvent = (event: ReceiverDebugEvent): string => {
  const statusCode = event.statusCode === null ? '-' : String(event.statusCode);
  return [
    new Date(event.at).toLocaleTimeString(),
    event.remoteAddress ?? '-',
    event.method,
    event.path,
    event.action ? `#${event.action}` : '#-',
    statusCode,
    event.message ?? '',
  ].filter(Boolean).join(' ');
};

const writeTextToClipboard = async (value: string): Promise<void> => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error('clipboard unavailable');
  }
};

const withHqPlayerFriendlyDefaults = (settings: HqPlayerSettings): HqPlayerSettings => {
  const isLocal = settings.connectionMode !== 'remote';
  return {
    ...settings,
    connectionMode: isLocal ? 'localDesktop' : 'remote',
    host: isLocal ? hqPlayerLocalHost : settings.host,
    port: settings.port ?? hqPlayerDefaultPort,
  };
};

const createHqPlayerConnectSettings = (settings: HqPlayerSettings): HqPlayerSettings => ({
  ...withHqPlayerFriendlyDefaults(settings),
  enabled: true,
});

const isStreamingProviderName = (value: string | null | undefined): value is StreamingProviderName =>
  streamingProviderNames.includes(value as StreamingProviderName);

const toHqPlayerPlayableTrack = (track: LibraryTrack | null, fallbackPath: string | null): PlayableTrack | null => {
  if (!track) {
    if (!fallbackPath) {
      return null;
    }

    const title = fallbackPath.split(/[\\/]/u).pop() || 'Local Track';
    return {
      mediaType: 'local',
      trackId: `file:${fallbackPath}`,
      path: fallbackPath,
      title,
      artist: 'Unknown Artist',
      album: 'Unknown Album',
      duration: null,
    };
  }

  if (track.mediaType === 'remote') {
    return {
      mediaType: 'remote',
      trackId: track.id,
      sourceId: track.sourceId ?? null,
      stableKey: track.stableKey ?? null,
      remotePath: track.remotePath ?? null,
      title: track.title,
      artist: track.artist,
      album: track.album,
      albumArtist: track.albumArtist,
      duration: track.duration,
      coverThumb: track.coverThumb,
    };
  }

  if (track.mediaType === 'streaming') {
    const provider = isStreamingProviderName(track.provider) ? track.provider : 'mock';
    const providerTrackId = track.providerTrackId ?? track.id;
    return {
      mediaType: 'streaming',
      trackId: track.id,
      provider,
      providerTrackId,
      quality: track.streamingQuality,
      stableKey: track.stableKey ?? `${provider}:${providerTrackId}`,
      title: track.title,
      artist: track.artist,
      album: track.album,
      albumArtist: track.albumArtist,
      duration: track.duration,
      coverThumb: track.coverThumb,
      playable: track.unavailable !== true,
      unavailableReason: track.unavailable ? 'This streaming track is unavailable.' : null,
    };
  }

  return {
    mediaType: 'local',
    trackId: track.id,
    path: track.path,
    title: track.title,
    artist: track.artist,
    album: track.album,
    albumArtist: track.albumArtist,
    duration: track.duration,
    coverThumb: track.coverThumb,
  };
};

export const ConnectPage = (): JSX.Element => {
  const { t } = useI18n();
  const queue = usePlaybackQueue();
  const playbackStatus = useSharedPlaybackStatusForUi();
  const [devices, setDevices] = useState<ConnectDevice[]>(isConnectBrowserPreview ? connectBrowserPreviewDevices : []);
  const [workspaceMode, setWorkspaceMode] = useState<ConnectWorkspaceMode>(readStoredWorkspaceMode);
  const [deviceQuery, setDeviceQuery] = useState('');
  const [deviceFilter, setDeviceFilter] = useState<ConnectDeviceFilter>('all');
  const [status, setStatus] = useState<ConnectSessionStatus>(isConnectBrowserPreview ? connectBrowserPreviewStatus : defaultStatus);
  const [receiverStatus, setReceiverStatus] = useState<ConnectReceiverStatus>(defaultReceiverStatus);
  const [airPlayReceiverStatus, setAirPlayReceiverStatus] = useState<AirPlayReceiverStatus>(defaultAirPlayReceiverStatus);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isReceiverBusy, setIsReceiverBusy] = useState(false);
  const [isAirPlayReceiverBusy, setIsAirPlayReceiverBusy] = useState(false);
  const [echoLinkStatus, setEchoLinkStatus] = useState<EchoLinkServerStatus>(defaultEchoLinkStatus);
  const [isEchoLinkBusy, setIsEchoLinkBusy] = useState(false);
  const [isEchoLinkBackgroundBusy, setIsEchoLinkBackgroundBusy] = useState(false);
  const [copiedEchoLinkPairing, setCopiedEchoLinkPairing] = useState(false);
  const [copiedEchoLinkWebControl, setCopiedEchoLinkWebControl] = useState(false);
  const [savedEchoLinkBackground, setSavedEchoLinkBackground] = useState(false);
  const [showEchoLinkToken, setShowEchoLinkToken] = useState(false);
  const [selectedEchoLinkHost, setSelectedEchoLinkHost] = useState<string | null>(null);
  const [echoLinkQrDataUrl, setEchoLinkQrDataUrl] = useState<string | null>(null);
  const [echoLinkWebBackgroundDraft, setEchoLinkWebBackgroundDraft] = useState<EchoLinkWebBackground>(defaultEchoLinkWebBackground);
  const [, setWallpaperEngineBridgeStatus] = useState<WallpaperEngineBridgeStatus>(defaultWallpaperEngineBridgeStatus);
  const [copiedAirPlayDebug, setCopiedAirPlayDebug] = useState(false);
  const [isAutoStartBusy, setIsAutoStartBusy] = useState(false);
  const [autoStartReceiversEnabled, setAutoStartReceiversEnabled] = useState(false);
  const [airPlayReceiverProtocol, setAirPlayReceiverProtocol] = useState<AirPlayReceiverProtocol>('airplay1');
  const [busyDeviceId, setBusyDeviceId] = useState<string | null>(null);
  const [isCommandBusy, setIsCommandBusy] = useState(false);
  const [preflightDevice, setPreflightDevice] = useState<ConnectDevice | null>(null);
  const [preflightResult, setPreflightResult] = useState<ConnectPreflightResult | null>(null);
  const [isPreflightChecking, setIsPreflightChecking] = useState(false);
  const [copiedConnectDiagnostics, setCopiedConnectDiagnostics] = useState(false);
  const [volumePercent, setVolumePercent] = useState(80);
  const [radioStations, setRadioStations] = useState<RadioStation[]>(() => readStoredRadioStations());
  const [radioNameDraft, setRadioNameDraft] = useState('');
  const [radioUrlDraft, setRadioUrlDraft] = useState('');
  const [activeRadioId, setActiveRadioId] = useState<string | null>(null);
  const [isRadioBusy, setIsRadioBusy] = useState(false);
  const [hqPlayerDraft, setHqPlayerDraft] = useState<HqPlayerSettings>(defaultHqPlayerSettings);
  const [hqPlayerStatus, setHqPlayerStatus] = useState<HqPlayerStatus | null>(null);
  const [hqPlayerTestResult, setHqPlayerTestResult] = useState<HqPlayerConnectionTestResult | null>(null);
  const [hqPlayerLastHandoff, setHqPlayerLastHandoff] = useState<HqPlayerPlaybackHandoffPlan | null>(null);
  const [hqPlayerLastControl, setHqPlayerLastControl] = useState<HqPlayerPlaybackControlPlan | null>(null);
  const [hqPlayerBusy, setHqPlayerBusy] = useState<'settings' | 'test' | null>(null);
  const [hiddenDeviceIds, setHiddenDeviceIds] = useState<Set<string>>(() => readStoredStringSet(hiddenConnectDevicesStorageKey));
  const [pinnedDeviceIds, setPinnedDeviceIds] = useState<Set<string>>(() => readStoredStringSet(pinnedConnectDevicesStorageKey));
  const [isDeviceSectionCollapsed, setIsDeviceSectionCollapsed] = useState(() =>
    readStoredBoolean(connectDeviceSectionCollapsedStorageKey, false),
  );

  const activeDevice = useMemo(
    () => devices.find((device) => device.id === status.deviceId) ?? null,
    [devices, status.deviceId],
  );
  const availableDevices = useMemo(
    () => devices
      .filter((device) => !hiddenDeviceIds.has(device.id))
      .sort((left, right) => {
        if (left.id === status.deviceId) return -1;
        if (right.id === status.deviceId) return 1;
        if (pinnedDeviceIds.has(left.id) !== pinnedDeviceIds.has(right.id)) {
          return pinnedDeviceIds.has(left.id) ? -1 : 1;
        }
        const stateRank: Record<ConnectDevice['state'], number> = {
          connected: 0,
          connecting: 1,
          available: 2,
          unsupported: 3,
          unavailable: 4,
        };
        return stateRank[left.state] - stateRank[right.state] || left.name.localeCompare(right.name);
      }),
    [devices, hiddenDeviceIds, pinnedDeviceIds, status.deviceId],
  );
  const deviceFilterCounts = useMemo(() => ({
    all: availableDevices.length,
    ready: availableDevices.filter((device) => device.state === 'available').length,
    active: availableDevices.filter((device) => device.id === status.deviceId || device.state === 'connected' || device.state === 'connecting').length,
    attention: availableDevices.filter((device) => device.state === 'unavailable' || device.state === 'unsupported').length,
  }), [availableDevices, status.deviceId]);
  const visibleDevices = useMemo(() => {
    const query = deviceQuery.trim();
    return availableDevices.filter((device) => {
      const matchesFilter = deviceFilter === 'all'
        || (deviceFilter === 'ready' && device.state === 'available')
        || (deviceFilter === 'active' && (device.id === status.deviceId || device.state === 'connected' || device.state === 'connecting'))
        || (deviceFilter === 'attention' && (device.state === 'unavailable' || device.state === 'unsupported'));
      if (!matchesFilter || !query) {
        return matchesFilter;
      }
      return matchesSearchFields(query, [
        device.name,
        device.protocol,
        device.manufacturer,
        device.model,
        device.address,
        device.discovery?.modelName,
        device.discovery?.modelNumber,
      ]);
    });
  }, [availableDevices, deviceFilter, deviceQuery, status.deviceId]);
  const hiddenDeviceEntries = useMemo(
    () => [...hiddenDeviceIds].map((deviceId) => ({
      id: deviceId,
      name: devices.find((device) => device.id === deviceId)?.name ?? deviceId,
    })),
    [devices, hiddenDeviceIds],
  );
  const airPlayDebugText = useMemo(
    () => airPlayReceiverStatus.debugEvents.map(formatReceiverDebugEvent).join('\n'),
    [airPlayReceiverStatus.debugEvents],
  );
  const currentTrack = queue.currentTrack ?? queue.lastPlayedTrack ?? null;
  const currentFilePath =
    currentTrack?.path ??
    playbackStatus.audioStatus?.currentFilePath ??
    playbackStatus.playbackStatus?.filePath ??
    null;
  const isLocalSourceMissing = !currentTrack && !currentFilePath;
  const currentPositionSeconds =
    playbackStatus.audioStatus?.positionSeconds ??
    (playbackStatus.playbackStatus?.positionMs ?? 0) / 1000;
  const previewTitle = status.metadata?.title ?? currentTrack?.title ?? (currentFilePath
    ? currentFilePath.split(/[\\/]/u).pop() ?? t('connectPage.nowPlaying.emptyTitle')
    : t('connectPage.nowPlaying.emptyTitle'));
  const previewArtist = status.metadata?.artist ?? currentTrack?.artist ?? currentTrack?.albumArtist ?? t('miniPlayer.artist.unknown');
  const previewAlbum = status.metadata?.album ?? currentTrack?.album ?? null;
  const previewCover = status.metadata?.coverHttpUrl ?? currentTrack?.coverThumb ?? null;
  const progressPercent =
    status.durationSeconds > 0 ? Math.min(100, Math.max(0, (status.positionSeconds / status.durationSeconds) * 100)) : 0;
  const hqPlayerEffectiveDraft = useMemo(
    () => withHqPlayerFriendlyDefaults(hqPlayerDraft),
    [hqPlayerDraft],
  );
  const hqPlayerState: HqPlayerStatus['state'] =
    hqPlayerStatus?.state ?? (hqPlayerDraft.enabled ? (hqPlayerEffectiveDraft.port ? 'unavailable' : 'not-configured') : 'disabled');
  const hqPlayerCurrentPlayable = useMemo(
    () => toHqPlayerPlayableTrack(currentTrack, currentFilePath),
    [currentFilePath, currentTrack],
  );
  const outgoingHttpEvents = status.httpEvents ?? [];
  const playbackTrackId = playbackStatus.playbackStatus?.currentTrackId ?? playbackStatus.audioStatus?.currentTrackId ?? null;
  const playbackFilePath = playbackStatus.playbackStatus?.filePath ?? playbackStatus.audioStatus?.currentFilePath ?? null;
  const playbackState = playbackStatus.playbackStatus?.state ?? playbackStatus.audioStatus?.state ?? 'idle';
  const activeRadioStation = radioStations.find((station) =>
    station.id === activeRadioId ||
    radioTrackIdForUrl(station.url) === playbackTrackId ||
    station.url === playbackFilePath,
  ) ?? null;
  const isRadioActive = Boolean(
    activeRadioStation &&
      (playbackState === 'loading' || playbackState === 'playing' || playbackState === 'paused'),
  );
  const radioStatusLabel = activeRadioStation
    ? `${playbackState === 'playing' ? t('connectPage.radio.state.playing') : playbackState === 'paused' ? t('connectPage.state.paused') : t('connectPage.radio.state.preparing')} · ${activeRadioStation.name}`
    : t('connectPage.radio.state.inactive');
  const echoLinkHosts = useMemo(() => {
    const candidates = echoLinkStatus.addresses.length > 0 ? echoLinkStatus.addresses : [echoLinkStatus.host];
    return [...new Set(candidates.filter((address) => address.trim().length > 0))];
  }, [echoLinkStatus.addresses, echoLinkStatus.host]);
  const echoLinkSelectedHost = selectedEchoLinkHost && echoLinkHosts.includes(selectedEchoLinkHost)
    ? selectedEchoLinkHost
    : echoLinkStatus.host;
  const echoLinkPairingUri = createEchoLinkPairingUri(echoLinkStatus, echoLinkSelectedHost) ?? echoLinkStatus.pairingUri;
  const echoLinkWebControlUrl = createEchoLinkWebControlUrl(echoLinkStatus, echoLinkSelectedHost) ?? echoLinkStatus.webControlUrl;
  const echoLinkAddressLabel = echoLinkHosts.length > 0
    ? echoLinkHosts.map((address) => `${address}:${echoLinkStatus.port}`).join(' / ')
    : `${echoLinkStatus.host}:${echoLinkStatus.port}`;
  const echoLinkTokenLabel = showEchoLinkToken
    ? echoLinkStatus.token
    : echoLinkStatus.token
      ? `${echoLinkStatus.token.slice(0, 6)}...${echoLinkStatus.token.slice(-6)}`
      : '-';
  const echoLinkWebBackground = echoLinkStatus.webBackground ?? defaultEchoLinkWebBackground;
  const echoLinkWebBackgroundConfigured = echoLinkWebBackground.type !== 'none' && echoLinkWebBackground.url.trim().length > 0;
  const echoLinkWebBackgroundSaveDisabled = isEchoLinkBackgroundBusy || (echoLinkWebBackgroundDraft.type !== 'none' && echoLinkWebBackgroundDraft.url.trim().length === 0);

  const refreshEchoLink = useCallback(async (): Promise<void> => {
    const connect = window.echo?.connect;
    if (!connect?.getEchoLinkStatus) {
      return;
    }

    try {
      setEchoLinkStatus(await connect.getEchoLinkStatus());
    } catch {
      // Keep the rest of Connect usable when running against an older bridge.
    }
  }, []);

  const refreshWallpaperEngineBridge = useCallback(async (): Promise<void> => {
    const getStatus = window.echo?.connect?.getWallpaperEngineBridgeStatus;
    if (!getStatus) {
      return;
    }

    try {
      setWallpaperEngineBridgeStatus(await getStatus());
    } catch {
      // Older preload bridges simply omit the Wallpaper Engine node status.
    }
  }, []);

  const refreshDevices = useCallback(async (options: { force?: boolean } = {}): Promise<void> => {
    const connect = window.echo?.connect;
    if (!connect) {
      if (isConnectBrowserPreview) {
        setDevices(connectBrowserPreviewDevices);
        setStatus(connectBrowserPreviewStatus);
        setError(null);
        return;
      }
      setError(t('connectPage.error.desktopBridgeConnect'));
      return;
    }

    setIsRefreshing(true);
    setError(null);
    try {
      const [nextDevices, nextStatus] = await Promise.all([
        loadConnectDevices(connect, options.force === true),
        connect.getStatus(),
      ]);
      setDevices(nextDevices);
      setStatus(nextStatus);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    } finally {
      setIsRefreshing(false);
    }
  }, [t]);

  const refreshHqPlayer = useCallback(async (): Promise<void> => {
    const hqPlayer = window.echo?.hqPlayer;
    if (!hqPlayer) {
      return;
    }

    try {
      const [settings, nextStatus, lastHandoff, lastControl] = await Promise.all([
        hqPlayer.getSettings(),
        hqPlayer.getStatus(),
        hqPlayer.getLastPlaybackHandoff(),
        hqPlayer.getLastPlaybackControl(),
      ]);
      const effectiveSettings = withHqPlayerFriendlyDefaults(settings);
      setHqPlayerDraft(effectiveSettings);
      setHqPlayerStatus(nextStatus);
      setHqPlayerLastHandoff(lastHandoff);
      setHqPlayerLastControl(lastControl);
    } catch {
      // Keep Connect usable when running against an older preload bridge.
    }
  }, []);

  const refreshCommandCenter = useCallback((): void => {
    void refreshDevices({ force: true });
    void refreshEchoLink();
    void refreshWallpaperEngineBridge();
    void refreshHqPlayer();
  }, [refreshDevices, refreshEchoLink, refreshHqPlayer, refreshWallpaperEngineBridge]);

  const refreshCommandCenterSoft = useCallback((): void => {
    void refreshDevices();
    void refreshEchoLink();
    void refreshWallpaperEngineBridge();
    void refreshHqPlayer();
  }, [refreshDevices, refreshEchoLink, refreshHqPlayer, refreshWallpaperEngineBridge]);

  useEffect(() => {
    if (!selectedEchoLinkHost || echoLinkHosts.includes(selectedEchoLinkHost)) {
      return;
    }
    setSelectedEchoLinkHost(null);
  }, [echoLinkHosts, selectedEchoLinkHost]);

  useEffect(() => {
    setEchoLinkWebBackgroundDraft({
      type: echoLinkWebBackground.type,
      url: echoLinkWebBackground.url,
    });
  }, [echoLinkWebBackground.type, echoLinkWebBackground.url]);

  useEffect(() => {
    if (!echoLinkPairingUri) {
      setEchoLinkQrDataUrl(null);
      return;
    }

    let disposed = false;
    void QRCode.toDataURL(echoLinkPairingUri, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 180,
      color: {
        dark: '#111827ff',
        light: '#ffffffff',
      },
    }).then((dataUrl) => {
      if (!disposed) {
        setEchoLinkQrDataUrl(dataUrl);
      }
    }).catch(() => {
      if (!disposed) {
        setEchoLinkQrDataUrl(null);
      }
    });

    return () => {
      disposed = true;
    };
  }, [echoLinkPairingUri]);

  useEffect(() => {
    const connect = window.echo?.connect;
    if (!connect) {
      return;
    }

    let disposed = false;
    void connect
      .getStatus()
      .then((nextStatus) => {
        if (!disposed) {
          setStatus(nextStatus);
        }
      })
      .catch(() => undefined);
    if (connect.getReceiverStatus) {
      void connect.getReceiverStatus().then((nextStatus) => {
        if (!disposed) {
          setReceiverStatus(nextStatus);
        }
      }).catch(() => undefined);
    }
    if (connect.getAirPlayReceiverStatus) {
      void connect.getAirPlayReceiverStatus().then((nextStatus) => {
        if (!disposed) {
          setAirPlayReceiverStatus(nextStatus);
        }
      }).catch(() => undefined);
    }
    void window.echo?.app?.getSettings?.().then((settings: AppSettings) => {
      if (!disposed) {
        setAutoStartReceiversEnabled(settings.connectAutoStartReceiversEnabled === true);
        setAirPlayReceiverProtocol(settings.airPlayReceiverProtocol === 'airplay2' ? 'airplay2' : 'airplay1');
      }
    }).catch(() => undefined);
    refreshCommandCenterSoft();
    const unsubscribe = connect.onStatus((nextStatus) => {
      setStatus(nextStatus);
      if (nextStatus.error) {
        setError(nextStatus.error);
      }
    });
    const unsubscribeReceiver = connect.onReceiverStatus?.((nextStatus) => {
      setReceiverStatus(nextStatus);
      if (nextStatus.error) {
        setError(nextStatus.error);
      }
    }) ?? (() => undefined);
    const unsubscribeAirPlayReceiver = connect.onAirPlayReceiverStatus?.((nextStatus) => {
      setAirPlayReceiverStatus(nextStatus);
      if (nextStatus.protocol) {
        setAirPlayReceiverProtocol(nextStatus.protocol);
      }
      if (nextStatus.error) {
        setError(nextStatus.error);
      }
    }) ?? (() => undefined);

    return () => {
      disposed = true;
      unsubscribe();
      unsubscribeReceiver();
      unsubscribeAirPlayReceiver();
    };
  }, [refreshCommandCenterSoft]);

  const toggleAutoStartReceivers = useCallback(async (): Promise<void> => {
    const app = window.echo?.app;
    if (!app?.setSettings) {
      setError(t('connectPage.error.desktopBridgeSettings'));
      return;
    }

    const connectAutoStartReceiversEnabled = !autoStartReceiversEnabled;
    setIsAutoStartBusy(true);
    setError(null);
    try {
      const settings = await app.setSettings({ connectAutoStartReceiversEnabled });
      setAutoStartReceiversEnabled(settings.connectAutoStartReceiversEnabled === true);
      window.dispatchEvent(new CustomEvent('settings:changed', { detail: { connectAutoStartReceiversEnabled } }));
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : String(settingsError));
    } finally {
      setIsAutoStartBusy(false);
    }
  }, [autoStartReceiversEnabled, t]);

  const patchHqPlayerDraft = useCallback((patch: Partial<HqPlayerSettings>): void => {
    setHqPlayerDraft((current) => withHqPlayerFriendlyDefaults({ ...current, ...patch }));
    setHqPlayerTestResult(null);
  }, []);

  const saveHqPlayerSettings = useCallback(async (settings: HqPlayerSettings = hqPlayerEffectiveDraft): Promise<HqPlayerSettings | null> => {
    const hqPlayer = window.echo?.hqPlayer;
    if (!hqPlayer) {
      setError(t('connectPage.error.desktopBridgeHqPlayerConfig'));
      return null;
    }

    const saved = await hqPlayer.setSettings(withHqPlayerFriendlyDefaults(settings));
    setHqPlayerDraft(withHqPlayerFriendlyDefaults(saved));
    setHqPlayerStatus(await hqPlayer.getStatus());
    window.dispatchEvent(new CustomEvent('settings:changed', { detail: { hqPlayer: saved } }));
    return saved;
  }, [hqPlayerEffectiveDraft, t]);

  const handleHqPlayerTestConnection = useCallback(async (): Promise<void> => {
    const hqPlayer = window.echo?.hqPlayer;
    if (!hqPlayer) {
      setError(t('connectPage.error.desktopBridgeHqPlayerTest'));
      return;
    }

    setHqPlayerBusy('test');
    setError(null);
    try {
      const saved = await saveHqPlayerSettings(createHqPlayerConnectSettings(hqPlayerEffectiveDraft));
      if (!saved) {
        return;
      }
      const result = await hqPlayer.testConnection(saved);
      setHqPlayerTestResult(result);
      setHqPlayerStatus(await hqPlayer.getStatus());
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : String(testError));
    } finally {
      setHqPlayerBusy(null);
    }
  }, [hqPlayerEffectiveDraft, saveHqPlayerSettings, t]);

  const toggleHqPlayerEnabled = useCallback(async (): Promise<void> => {
    const nextSettings = hqPlayerDraft.enabled
      ? { ...hqPlayerEffectiveDraft, enabled: false }
      : createHqPlayerConnectSettings(hqPlayerEffectiveDraft);

    setHqPlayerBusy('settings');
    setError(null);
    try {
      if (hqPlayerDraft.enabled) {
        const connect = window.echo?.connect;
        const connectStatus = await connect?.getStatus?.().catch(() => null);
        if (connectStatus?.protocol === 'hqplayer' && connectStatus.deviceId === hqPlayerConnectDeviceId && connect?.disconnect) {
          setStatus(await connect.disconnect());
        }
      }

      await saveHqPlayerSettings(nextSettings);
      setDevices(await window.echo?.connect?.refresh?.() ?? devices);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : String(toggleError));
    } finally {
      setHqPlayerBusy(null);
    }
  }, [devices, hqPlayerDraft.enabled, hqPlayerEffectiveDraft, saveHqPlayerSettings]);

  const toggleReceiver = useCallback(async (): Promise<void> => {
    const connect = window.echo?.connect;
    if (!connect?.setReceiverEnabled) {
      setError(t('connectPage.error.desktopBridgeConnect'));
      return;
    }

    setIsReceiverBusy(true);
    setError(null);
    try {
      setReceiverStatus(await connect.setReceiverEnabled(!receiverStatus.enabled));
    } catch (receiverError) {
      setError(receiverError instanceof Error ? receiverError.message : String(receiverError));
    } finally {
      setIsReceiverBusy(false);
    }
  }, [receiverStatus.enabled, t]);

  const toggleEchoLink = useCallback(async (): Promise<void> => {
    const connect = window.echo?.connect;
    if (!connect?.setEchoLinkEnabled) {
      setError(t('connectPage.error.desktopBridgeEchoLink'));
      return;
    }

    setIsEchoLinkBusy(true);
    setError(null);
    try {
      const nextStatus = await connect.setEchoLinkEnabled(!echoLinkStatus.enabled);
      setEchoLinkStatus(nextStatus);
      if (nextStatus.error) {
        setError(nextStatus.error);
      }
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : String(linkError));
    } finally {
      setIsEchoLinkBusy(false);
    }
  }, [echoLinkStatus.enabled, t]);

  const copyEchoLinkPairing = useCallback(async (): Promise<void> => {
    const value = echoLinkPairingUri ?? '';
    if (!value) {
      return;
    }

    await navigator.clipboard.writeText(value);
    setCopiedEchoLinkPairing(true);
    window.setTimeout(() => setCopiedEchoLinkPairing(false), 1400);
  }, [echoLinkPairingUri]);

  const copyEchoLinkWebControl = useCallback(async (): Promise<void> => {
    const value = echoLinkWebControlUrl ?? '';
    if (!value || !navigator.clipboard?.writeText) {
      return;
    }
    await navigator.clipboard.writeText(value);
    setCopiedEchoLinkWebControl(true);
    window.setTimeout(() => setCopiedEchoLinkWebControl(false), 1400);
  }, [echoLinkWebControlUrl]);

  const openEchoLinkWebControl = useCallback(async (): Promise<void> => {
    const value = echoLinkWebControlUrl ?? '';
    if (!value) {
      return;
    }
    await window.echo?.app?.openExternalUrl?.(value);
  }, [echoLinkWebControlUrl]);

  const applyEchoLinkWebBackground = useCallback(async (background: EchoLinkWebBackground): Promise<void> => {
    const connect = window.echo?.connect;
    if (!connect?.setEchoLinkWebBackground) {
      setError(t('connectPage.error.desktopBridgeEchoLink'));
      return;
    }

    setIsEchoLinkBackgroundBusy(true);
    setError(null);
    try {
      const nextStatus = await connect.setEchoLinkWebBackground(background);
      setEchoLinkStatus(nextStatus);
      setSavedEchoLinkBackground(true);
      window.setTimeout(() => setSavedEchoLinkBackground(false), 1400);
    } catch (backgroundError) {
      setError(backgroundError instanceof Error ? backgroundError.message : String(backgroundError));
    } finally {
      setIsEchoLinkBackgroundBusy(false);
    }
  }, [t]);

  const saveEchoLinkWebBackground = useCallback(async (): Promise<void> => {
    await applyEchoLinkWebBackground({
      type: echoLinkWebBackgroundDraft.type,
      url: echoLinkWebBackgroundDraft.url.trim(),
    });
  }, [applyEchoLinkWebBackground, echoLinkWebBackgroundDraft.type, echoLinkWebBackgroundDraft.url]);

  const clearEchoLinkWebBackground = useCallback(async (): Promise<void> => {
    await applyEchoLinkWebBackground(defaultEchoLinkWebBackground);
  }, [applyEchoLinkWebBackground]);

  const chooseEchoLinkWebBackgroundImage = useCallback(async (): Promise<void> => {
    const connect = window.echo?.connect;
    if (!connect?.chooseEchoLinkWebBackgroundImage) {
      setError(t('connectPage.error.desktopBridgeEchoLink'));
      return;
    }

    setIsEchoLinkBackgroundBusy(true);
    setError(null);
    try {
      const nextStatus = await connect.chooseEchoLinkWebBackgroundImage();
      if (nextStatus) {
        setEchoLinkStatus(nextStatus);
        setSavedEchoLinkBackground(true);
        window.setTimeout(() => setSavedEchoLinkBackground(false), 1400);
      }
    } catch (backgroundError) {
      setError(backgroundError instanceof Error ? backgroundError.message : String(backgroundError));
    } finally {
      setIsEchoLinkBackgroundBusy(false);
    }
  }, [t]);

  const rotateEchoLinkToken = useCallback(async (): Promise<void> => {
    const connect = window.echo?.connect;
    if (!connect?.rotateEchoLinkToken) {
      setError(t('connectPage.error.desktopBridgeEchoLinkToken'));
      return;
    }

    setIsEchoLinkBusy(true);
    setError(null);
    try {
      setEchoLinkStatus(await connect.rotateEchoLinkToken());
      setShowEchoLinkToken(true);
    } catch (tokenError) {
      setError(tokenError instanceof Error ? tokenError.message : String(tokenError));
    } finally {
      setIsEchoLinkBusy(false);
    }
  }, [t]);

  const stopReceiverPlayback = useCallback(async (): Promise<void> => {
    const connect = window.echo?.connect;
    setIsReceiverBusy(true);
    setError(null);
    try {
      if (connect?.stopReceiverPlayback) {
        setReceiverStatus(await connect.stopReceiverPlayback());
      } else {
        await window.echo?.playback.stop();
        if (connect?.getReceiverStatus) {
          setReceiverStatus(await connect.getReceiverStatus());
        }
      }
    } catch (receiverError) {
      setError(receiverError instanceof Error ? receiverError.message : String(receiverError));
    } finally {
      setIsReceiverBusy(false);
    }
  }, []);

  const toggleAirPlayReceiver = useCallback(async (): Promise<void> => {
    const connect = window.echo?.connect;
    if (!connect?.setAirPlayReceiverEnabled) {
      setError(t('connectPage.error.airplayBridge'));
      return;
    }

    setIsAirPlayReceiverBusy(true);
    setError(null);
    try {
      setAirPlayReceiverStatus(await connect.setAirPlayReceiverEnabled(!airPlayReceiverStatus.enabled));
    } catch (receiverError) {
      setError(receiverError instanceof Error ? receiverError.message : String(receiverError));
    } finally {
      setIsAirPlayReceiverBusy(false);
    }
  }, [airPlayReceiverStatus.enabled, t]);

  const setAirPlayProtocol = useCallback(async (protocol: AirPlayReceiverProtocol): Promise<void> => {
    if (protocol === airPlayReceiverProtocol && airPlayReceiverStatus.protocol === protocol) {
      return;
    }
    const app = window.echo?.app;
    const connect = window.echo?.connect;
    if (!app?.setSettings) {
      setError(t('connectPage.error.airplayProtocolBridge'));
      return;
    }

    setIsAirPlayReceiverBusy(true);
    setError(null);
    try {
      const settings = await app.setSettings({ airPlayReceiverProtocol: protocol });
      const savedProtocol = settings.airPlayReceiverProtocol === 'airplay2' ? 'airplay2' : 'airplay1';
      setAirPlayReceiverProtocol(savedProtocol);
      window.dispatchEvent(new CustomEvent('settings:changed', { detail: { airPlayReceiverProtocol: savedProtocol } }));
      if (airPlayReceiverStatus.enabled && connect?.setAirPlayReceiverEnabled) {
        await connect.setAirPlayReceiverEnabled(false);
        setAirPlayReceiverStatus(await connect.setAirPlayReceiverEnabled(true));
      } else if (connect?.getAirPlayReceiverStatus) {
        setAirPlayReceiverStatus(await connect.getAirPlayReceiverStatus());
      }
    } catch (protocolError) {
      setError(protocolError instanceof Error ? protocolError.message : String(protocolError));
    } finally {
      setIsAirPlayReceiverBusy(false);
    }
  }, [airPlayReceiverProtocol, airPlayReceiverStatus.enabled, airPlayReceiverStatus.protocol, t]);

  const stopAirPlayReceiverPlayback = useCallback(async (): Promise<void> => {
    const connect = window.echo?.connect;
    if (!connect?.stopAirPlayReceiverPlayback) {
      setError(t('connectPage.error.airplayBridge'));
      return;
    }

    setIsAirPlayReceiverBusy(true);
    setError(null);
    try {
      setAirPlayReceiverStatus(await connect.stopAirPlayReceiverPlayback());
    } catch (receiverError) {
      setError(receiverError instanceof Error ? receiverError.message : String(receiverError));
    } finally {
      setIsAirPlayReceiverBusy(false);
    }
  }, [t]);

  const copyAirPlayDebug = useCallback(async (): Promise<void> => {
    if (!airPlayDebugText) {
      return;
    }

    try {
      await writeTextToClipboard(airPlayDebugText);
      setCopiedAirPlayDebug(true);
      window.setTimeout(() => setCopiedAirPlayDebug(false), 1600);
    } catch (copyError) {
      setError(copyError instanceof Error ? t('connectPage.error.copyAirPlayDebugWithMessage', { message: copyError.message }) : t('connectPage.error.copyAirPlayDebug'));
    }
  }, [airPlayDebugText, t]);

  const performConnectDevice = useCallback(
    async (device: ConnectDevice): Promise<void> => {
      const connect = window.echo?.connect;
      if (!connect) {
        setError(t('connectPage.error.desktopBridgeConnect'));
        return;
      }

      if (!currentTrack && !currentFilePath) {
        setError(t('connectPage.error.emptyMetadata'));
        return;
      }

      setBusyDeviceId(device.id);
      setError(null);
      try {
        const nextStatus = await connect.connect({
          deviceId: device.id,
          track: currentTrack,
          filePath: currentFilePath,
          positionSeconds: currentPositionSeconds,
        });
        setStatus(nextStatus);
      } catch (connectError) {
        setError(connectError instanceof Error ? connectError.message : String(connectError));
      } finally {
        setBusyDeviceId(null);
      }
    },
    [currentFilePath, currentPositionSeconds, currentTrack, t],
  );

  const openConnectPreflight = useCallback(async (device: ConnectDevice): Promise<void> => {
    const connect = window.echo?.connect;
    if (!connect?.preflight) {
      setError(t('connectPage.error.desktopBridgeConnect'));
      return;
    }
    if (!currentTrack && !currentFilePath) {
      setError(t('connectPage.error.emptyMetadata'));
      return;
    }

    setPreflightDevice(device);
    setPreflightResult(null);
    setIsPreflightChecking(true);
    setError(null);
    try {
      const result = await connect.preflight({
        deviceId: device.id,
        track: currentTrack,
        filePath: currentFilePath,
        positionSeconds: currentPositionSeconds,
      });
      setPreflightResult(result);
      setDevices((current) => current.map((entry) => entry.id === device.id
        ? { ...entry, state: result.ready ? 'available' : entry.state, lastSeenAt: result.checkedAt }
        : entry));
    } catch (preflightError) {
      setPreflightResult({
        deviceId: device.id,
        deviceName: device.name,
        protocol: device.protocol,
        ready: false,
        checkedAt: new Date().toISOString(),
        source: currentTrack ? { title: currentTrack.title, mimeType: null, remote: currentTrack.mediaType !== 'local' } : null,
        delivery: device.protocol === 'hqplayer' ? 'hqplayer' : 'unsupported',
        capabilities: device.capabilities,
        issues: ['device_unavailable'],
        warnings: [],
      });
      setError(preflightError instanceof Error ? preflightError.message : String(preflightError));
    } finally {
      setIsPreflightChecking(false);
    }
  }, [currentFilePath, currentPositionSeconds, currentTrack, t]);

  const closeConnectPreflight = useCallback((): void => {
    if (isPreflightChecking) return;
    setPreflightDevice(null);
    setPreflightResult(null);
  }, [isPreflightChecking]);

  const confirmConnectPreflight = useCallback(async (): Promise<void> => {
    if (!preflightDevice || !preflightResult?.ready) return;
    const device = preflightDevice;
    setPreflightDevice(null);
    setPreflightResult(null);
    await performConnectDevice(device);
  }, [performConnectDevice, preflightDevice, preflightResult?.ready]);

  const returnToLocalPlayback = useCallback(async (): Promise<void> => {
    const connect = window.echo?.connect;
    if (!connect) return;
    setIsCommandBusy(true);
    setError(null);
    try {
      const nextStatus = await connect.disconnect();
      setStatus(nextStatus);
      if (currentTrack) {
        await queue.playTrack(currentTrack, {
          routeToConnectOutput: false,
          startSeconds: status.positionSeconds > 0 ? status.positionSeconds : currentPositionSeconds,
        });
      } else {
        await window.echo?.playback.play();
      }
    } catch (returnError) {
      setError(returnError instanceof Error ? returnError.message : String(returnError));
    } finally {
      setIsCommandBusy(false);
    }
  }, [currentPositionSeconds, currentTrack, queue, status.positionSeconds]);

  const copyConnectDiagnostics = useCallback(async (): Promise<void> => {
    const diagnostic = {
      at: new Date().toISOString(),
      session: status,
      device: activeDevice ? {
        id: activeDevice.id,
        name: activeDevice.name,
        protocol: activeDevice.protocol,
        model: activeDevice.model,
        manufacturer: activeDevice.manufacturer,
        address: activeDevice.address,
        capabilities: activeDevice.capabilities,
        state: activeDevice.state,
        lastSeenAt: activeDevice.lastSeenAt,
      } : null,
      httpSummary: outgoingHttpEvents.slice(0, 8).map((event) => ({
        at: event.at,
        method: event.method,
        kind: event.kind,
        statusCode: event.statusCode,
        bytes: event.bytes,
        message: event.message,
      })),
    };
    try {
      await writeTextToClipboard(JSON.stringify(diagnostic, null, 2));
      setCopiedConnectDiagnostics(true);
      window.setTimeout(() => setCopiedConnectDiagnostics(false), 1600);
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : String(copyError));
    }
  }, [activeDevice, outgoingHttpEvents, status]);

  const runCommand = useCallback(async (command: 'play' | 'pause' | 'stop' | 'disconnect'): Promise<void> => {
    const connect = window.echo?.connect;
    if (!connect) {
      setError(t('connectPage.error.desktopBridgeConnect'));
      return;
    }

    setIsCommandBusy(true);
    setError(null);
    try {
      const nextStatus = await connect[command]();
      setStatus(nextStatus);
    } catch (commandError) {
      setError(commandError instanceof Error ? commandError.message : String(commandError));
    } finally {
      setIsCommandBusy(false);
    }
  }, [t]);

  const commitVolume = useCallback(async (nextVolume: number): Promise<void> => {
    const connect = window.echo?.connect;
    if (!connect) {
      return;
    }

    setVolumePercent(nextVolume);
    try {
      setStatus(await connect.setVolume(nextVolume));
    } catch (volumeError) {
      setError(volumeError instanceof Error ? volumeError.message : String(volumeError));
    }
  }, []);

  const persistRadioStations = useCallback((updater: (current: RadioStation[]) => RadioStation[]): void => {
    setRadioStations((current) => {
      const next = updater(current).slice(0, maxStoredRadioStations);
      writeStoredRadioStations(next);
      return next;
    });
  }, []);

  const upsertRadioStation = useCallback((station: RadioStation): void => {
    persistRadioStations((current) => {
      const existing = current.find((item) => item.id === station.id || item.url === station.url);
      const nextStation = {
        ...station,
        createdAt: existing?.createdAt ?? station.createdAt,
        description: station.description?.trim() || existing?.description,
      };
      return [nextStation, ...current.filter((item) => item.id !== station.id && item.url !== station.url)];
    });
  }, [persistRadioStations]);

  const createRadioStationFromDraft = useCallback((lastPlayedAt: string | null = null): RadioStation | null => {
    const url = normalizeRadioUrl(radioUrlDraft);
    if (!url) {
      setError(t('connectPage.error.radioUrlRequired'));
      return null;
    }

    return createRadioStation({
      url,
      name: radioNameDraft,
      lastPlayedAt,
    });
  }, [radioNameDraft, radioUrlDraft, t]);

  const saveRadioDraftStation = useCallback((): void => {
    const station = createRadioStationFromDraft(null);
    if (!station) {
      return;
    }

    setError(null);
    upsertRadioStation(station);
    setRadioNameDraft(station.name);
    setRadioUrlDraft(station.url);
  }, [createRadioStationFromDraft, upsertRadioStation]);

  const playRadioStation = useCallback(async (station: RadioStation): Promise<void> => {
    const url = normalizeRadioUrl(station.url);
    if (!url) {
      setError(t('connectPage.error.radioUrlInvalid'));
      return;
    }

    const videoUrl = normalizeOptionalRadioUrl(station.videoUrl);

    const now = new Date().toISOString();
    const playableStation: RadioStation = {
      ...station,
      id: radioStationIdForUrl(url),
      name: station.name.trim() || stationNameFromUrl(url),
      url,
      ...(videoUrl ? { videoUrl } : { videoUrl: undefined }),
      updatedAt: now,
      lastPlayedAt: now,
    };
    const liveTrack = radioStationToTrack(playableStation);

    setIsRadioBusy(true);
    setError(null);
    try {
      const disconnectedStatus = await window.echo?.connect?.disconnect?.().catch(() => null);
      if (disconnectedStatus) {
        setStatus(disconnectedStatus);
      }

      await queue.playTrack(liveTrack, {
        source: {
          type: 'streaming',
          label: 'Network Radio',
          provider: 'm3u8',
        },
        routeToConnectOutput: false,
        forceRefresh: true,
      });

      upsertRadioStation(playableStation);
      setActiveRadioId(playableStation.id);
      setRadioNameDraft(playableStation.name);
      setRadioUrlDraft(playableStation.url);
    } catch (radioError) {
      setError(radioError instanceof Error ? radioError.message : String(radioError));
    } finally {
      setIsRadioBusy(false);
    }
  }, [queue, t, upsertRadioStation]);

  const playRadioDraft = useCallback(async (event?: { preventDefault: () => void }): Promise<void> => {
    event?.preventDefault();
    const station = createRadioStationFromDraft(null);
    if (!station) {
      return;
    }

    await playRadioStation(station);
  }, [createRadioStationFromDraft, playRadioStation]);

  const playRadioClipboard = useCallback(async (): Promise<void> => {
    if (!navigator.clipboard?.readText) {
      setError('剪贴板不可用，请手动粘贴电台 URL');
      return;
    }

    try {
      const clipboardText = await navigator.clipboard.readText();
      const url = normalizeRadioUrl(clipboardText);
      if (!url) {
        setError(t('connectPage.error.radioUrlInvalid'));
        return;
      }

      const station = createRadioStation({
        url,
        name: radioNameDraft,
        lastPlayedAt: null,
      });
      setRadioNameDraft(station.name);
      setRadioUrlDraft(station.url);
      await playRadioStation(station);
    } catch (clipboardError) {
      setError(clipboardError instanceof Error ? clipboardError.message : String(clipboardError));
    }
  }, [playRadioStation, radioNameDraft, t]);

  const stopRadioPlayback = useCallback(async (): Promise<void> => {
    const playback = window.echo?.playback;
    if (!playback?.stop) {
      setError(t('connectPage.error.desktopBridgeRadioStop'));
      return;
    }

    setIsRadioBusy(true);
    setError(null);
    try {
      await playback.stop();
      setActiveRadioId(null);
    } catch (radioError) {
      setError(radioError instanceof Error ? radioError.message : String(radioError));
    } finally {
      setIsRadioBusy(false);
    }
  }, [t]);

  const removeRadioStation = useCallback((stationId: string): void => {
    persistRadioStations((current) => current.filter((station) => station.id !== stationId));
    if (activeRadioId === stationId) {
      setActiveRadioId(null);
    }
  }, [activeRadioId, persistRadioStations]);

  const hideDevice = useCallback((device: ConnectDevice): void => {
    setHiddenDeviceIds((current) => {
      const next = new Set(current);
      next.add(device.id);
      writeStoredStringSet(hiddenConnectDevicesStorageKey, next);
      return next;
    });
  }, []);

  const restoreDevice = useCallback((deviceId: string): void => {
    setHiddenDeviceIds((current) => {
      const next = new Set(current);
      next.delete(deviceId);
      writeStoredStringSet(hiddenConnectDevicesStorageKey, next);
      return next;
    });
  }, []);

  const restoreAllDevices = useCallback((): void => {
    const next = new Set<string>();
    writeStoredStringSet(hiddenConnectDevicesStorageKey, next);
    setHiddenDeviceIds(next);
  }, []);

  const togglePinnedDevice = useCallback((deviceId: string): void => {
    setPinnedDeviceIds((current) => {
      const next = new Set(current);
      if (next.has(deviceId)) {
        next.delete(deviceId);
      } else {
        next.add(deviceId);
      }
      writeStoredStringSet(pinnedConnectDevicesStorageKey, next);
      return next;
    });
  }, []);

  const toggleDeviceSectionCollapsed = useCallback((): void => {
    setIsDeviceSectionCollapsed((current) => {
      const next = !current;
      writeStoredBoolean(connectDeviceSectionCollapsedStorageKey, next);
      return next;
    });
  }, []);

  const changeWorkspaceMode = useCallback((mode: ConnectWorkspaceMode): void => {
    setWorkspaceMode(mode);
    writeStoredWorkspaceMode(mode);
  }, []);

  const dismissError = useCallback((): void => {
    setError(null);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>('.connect-workspace-tabs button[data-active="true"]')?.focus();
    });
  }, []);

  const workspaceLabels = {
    output: t('connectPage.tabs.output'),
    hqplayer: t('connectPage.tabs.hqplayer'),
    receive: t('connectPage.tabs.receive'),
    mobile: t('connectPage.tabs.mobile'),
    radio: t('connectPage.tabs.radio'),
  };
  const workspaceDescriptions = {
    output: t(workspaceDescription.output),
    hqplayer: t(workspaceDescription.hqplayer),
    receive: t(workspaceDescription.receive),
    mobile: t(workspaceDescription.mobile),
    radio: t(workspaceDescription.radio),
  };
  const workspaceRailHints = {
    output: t('connectPage.rail.output'),
    hqplayer: t('connectPage.rail.hqplayer'),
    receive: t('connectPage.rail.receive'),
    mobile: t('connectPage.rail.mobile'),
    radio: t('connectPage.rail.radio'),
  };
  const selectedWorkspace = connectWorkspaceModes.find((item) => item.id === workspaceMode) ?? connectWorkspaceModes[0];
  const SelectedWorkspaceIcon = selectedWorkspace.icon;

  return (
    <div className="connect-page connect-page--session" data-mode={workspaceMode}>
      <div className="connect-stage">
        <aside className="connect-rail">
          <div className="connect-brand">
            <span>CONNECT</span>
            <strong>{t('route.connect.label')}</strong>
            <em>{t('connectPage.brand.subtitle')}</em>
          </div>
          <div className="connect-rail-status">
            <Cast size={17} aria-hidden="true" />
            <div>
              <span>{t('connectPage.trust.eyebrow')}</span>
              <strong>{activeDevice?.name ?? t('connectPage.trust.localTitle')}</strong>
              <small>{previewTitle}</small>
            </div>
          </div>
          <ConnectWorkspaceTabs
            ariaLabel={t('connectPage.tabs.aria')}
            descriptions={workspaceRailHints}
            groupLabels={{
              cast: t('connectPage.rail.groupCast'),
              incoming: t('connectPage.rail.groupIncoming'),
            }}
            mode={workspaceMode}
            onModeChange={changeWorkspaceMode}
            indicators={{
              output: activeDevice !== null && activeDevice.protocol !== 'hqplayer',
              hqplayer: hqPlayerDraft.enabled || activeDevice?.protocol === 'hqplayer',
              receive: receiverStatus.enabled,
              mobile: echoLinkStatus.running,
              radio: isRadioActive,
            }}
            labels={workspaceLabels}
          />
        </aside>

        <section className="connect-desk" aria-label={t('connectPage.stage.aria')}>
          <header className="connect-topbar">
            <div className="connect-topbar-title">
              <span className="connect-selected-icon">
                <SelectedWorkspaceIcon size={26} aria-hidden="true" />
              </span>
              <div>
                <h1>{workspaceLabels[workspaceMode]}</h1>
                <span className="connect-topbar-subtitle">{workspaceDescriptions[workspaceMode]}</span>
              </div>
            </div>
            <div className="connect-topbar-actions">
              {workspaceMode === 'output' ? (
                <button className="settings-action-button" type="button" onClick={refreshCommandCenter} disabled={isRefreshing}>
                  {isRefreshing ? <Loader2 className="spinning-icon" size={15} /> : <RefreshCw size={15} />}
                  {t(isRefreshing ? 'connectPage.devices.refreshing' : 'connectPage.devices.refresh')}
                </button>
              ) : workspaceMode === 'hqplayer' ? (
                <>
                  <span className="connect-hqplayer-state" data-state={hqPlayerState}>{t(hqPlayerStateLabel[hqPlayerState])}</span>
                  <button
                    className="settings-action-button"
                    type="button"
                    disabled={hqPlayerBusy === 'test'}
                    onClick={() => void handleHqPlayerTestConnection()}
                  >
                    <RefreshCw className={hqPlayerBusy === 'test' ? 'spinning-icon' : undefined} size={15} />
                    {t('connectPage.hqplayer.test')}
                  </button>
                </>
              ) : workspaceMode === 'receive' ? (
                <>
                  <div className="settings-inline-toggle connect-autostart-toggle">
                    <span>{t('connectPage.header.autoStart')}</span>
                    <button
                      aria-label={t('connectPage.header.autoStart')}
                      aria-pressed={autoStartReceiversEnabled}
                      className={`toggle-btn ${autoStartReceiversEnabled ? 'active' : ''}`}
                      disabled={isAutoStartBusy}
                      type="button"
                      onClick={() => void toggleAutoStartReceivers()}
                    >
                      <span />
                    </button>
                  </div>
                  <button className="settings-action-button" type="button" onClick={refreshCommandCenter} disabled={isRefreshing}>
                    {isRefreshing ? <Loader2 className="spinning-icon" size={16} /> : <RefreshCw size={16} />}
                    {t('connectPage.header.refresh')}
                  </button>
                </>
              ) : workspaceMode === 'radio' ? (
                <>
                  <small className="connect-topbar-meta">{radioStatusLabel}</small>
                  <button className="settings-action-button" type="button" onClick={refreshCommandCenter} disabled={isRefreshing}>
                    {isRefreshing ? <Loader2 className="spinning-icon" size={16} /> : <RefreshCw size={16} />}
                    {t('connectPage.header.refresh')}
                  </button>
                </>
              ) : workspaceMode === 'mobile' ? (
                <button className="settings-action-button" type="button" onClick={refreshCommandCenter} disabled={isRefreshing}>
                  {isRefreshing ? <Loader2 className="spinning-icon" size={16} /> : <RefreshCw size={16} />}
                  {t('connectPage.header.refresh')}
                </button>
              ) : null}
            </div>
          </header>

      {error ? (
        <div className="connect-alert" role="alert">
          <AlertTriangle size={17} />
          <span>{error}</span>
          <button className="icon-button connect-alert-dismiss" type="button" aria-label={t('connectPage.error.dismiss')} title={t('connectPage.error.dismiss')} onClick={dismissError}>
            <X aria-hidden="true" size={15} />
          </button>
        </div>
      ) : null}

      <div className="connect-desk__body">
      {workspaceMode === 'output' ? (
        <ConnectOutputWorkspace
          status={status}
          activeDevice={activeDevice}
          previewTitle={previewTitle}
          previewArtist={previewArtist}
          previewAlbum={previewAlbum}
          previewCover={previewCover}
          progressPercent={progressPercent}
          positionLabel={`${formatTime(status.positionSeconds)} / ${formatTime(status.durationSeconds || currentTrack?.duration || 0)}`}
          volumePercent={volumePercent}
          copiedDiagnostics={copiedConnectDiagnostics}
          busy={isCommandBusy || busyDeviceId !== null}
          busyDeviceId={busyDeviceId}
          isLocalSourceMissing={isLocalSourceMissing}
          isCollapsed={isDeviceSectionCollapsed}
          deviceCount={devices.length}
          availableDevices={availableDevices}
          visibleDevices={visibleDevices}
          hiddenDevices={hiddenDeviceEntries}
          pinnedDeviceIds={pinnedDeviceIds}
          deviceQuery={deviceQuery}
          deviceFilter={deviceFilter}
          filterCounts={deviceFilterCounts}
          searchEnabled={!isDeviceSectionCollapsed && !preflightDevice}
          onVolumeChange={setVolumePercent}
          onVolumeCommit={(value) => void commitVolume(value)}
          onCommand={(command) => void runCommand(command)}
          onConnect={(device) => void openConnectPreflight(device)}
          onToggleCollapsed={toggleDeviceSectionCollapsed}
          onQueryChange={setDeviceQuery}
          onFilterChange={setDeviceFilter}
          onHide={hideDevice}
          onRestore={restoreDevice}
          onRestoreAll={restoreAllDevices}
          onTogglePin={togglePinnedDevice}
          onCopyDiagnostics={() => void copyConnectDiagnostics()}
          onRetry={() => {
            if (activeDevice) {
              void openConnectPreflight(activeDevice);
            }
          }}
          onReturnLocal={() => void returnToLocalPlayback()}
          onChooseSource={() => window.dispatchEvent(new Event('app:navigate:songs'))}
        />
      ) : null}

      {workspaceMode === 'hqplayer' ? (
        <ConnectHqPlayerWorkspace
          draft={hqPlayerDraft}
          effectiveDraft={hqPlayerEffectiveDraft}
          status={hqPlayerStatus}
          testResult={hqPlayerTestResult}
          lastHandoff={hqPlayerLastHandoff}
          lastControl={hqPlayerLastControl}
          currentPlayable={hqPlayerCurrentPlayable}
          currentCover={previewCover}
          busy={hqPlayerBusy}
          onToggleEnabled={() => void toggleHqPlayerEnabled()}
          onPatchDraft={patchHqPlayerDraft}
        />
      ) : null}

      {workspaceMode === 'mobile' ? (
      <section className="connect-workspace connect-workspace--mobile" aria-label={t('connectPage.tabs.mobile')}>
          <div className="connect-mobile-integrations" aria-label="移动设备与智能家居联动">
            <EchoLinkBasicPanel bridgeOverride={isConnectBrowserPreview ? connectBrowserPreviewEchoLinkBridge : undefined} />
        <section
          className="connect-echo-link-panel"
          aria-label={t('connectPage.echoLink.aria')}
        >
          <div className="connect-section-title">
            <div>
              <span>ECHO Link</span>
              <h2>{t('connectPage.echoLink.title')}</h2>
            </div>
            <div className="connect-section-actions">
              <span className="connect-hqplayer-state" data-state={echoLinkStatus.running ? 'available' : echoLinkStatus.error ? 'unavailable' : 'disabled'}>
                {echoLinkStatus.running ? t('connectPage.echoLink.state.running') : echoLinkStatus.error ? t('connectPage.echoLink.state.error') : t('connectPage.common.disabled')}
              </span>
              <button className="settings-action-button connect-echo-link-aux" type="button" onClick={() => void refreshEchoLink()} disabled={isEchoLinkBusy}>
                <RefreshCw size={15} />
                {t('connectPage.common.refresh')}
              </button>
              <button className="settings-action-button" type="button" onClick={() => void toggleEchoLink()} disabled={isEchoLinkBusy}>
                {isEchoLinkBusy ? <Loader2 className="spinning-icon" size={15} /> : <Power size={15} />}
                {echoLinkStatus.enabled ? t('connectPage.common.disable') : t('connectPage.common.enable')}
              </button>
              <button className="settings-action-button connect-echo-link-aux" type="button" onClick={() => void rotateEchoLinkToken()} disabled={isEchoLinkBusy}>
                <RefreshCw size={15} />
                {t('connectPage.echoLink.rotateToken')}
              </button>
            </div>
          </div>
          <div
            id="connect-echo-link-content"
            className="connect-collapsible-content"
            data-expanded="true"
          >
            <div className="connect-collapsible-content__inner">
          <div className="connect-echo-link-grid">
            <span>
              <em>{t('connectPage.echoLink.address')}</em>
              <strong>{echoLinkSelectedHost}:{echoLinkStatus.port}</strong>
            </span>
            <span>
              <em>{t('connectPage.echoLink.device')}</em>
              <strong>{echoLinkStatus.deviceName}</strong>
            </span>
            <span>
              <em>Token</em>
              <strong>{echoLinkTokenLabel}</strong>
              <button className="icon-button" type="button" aria-label={showEchoLinkToken ? t('connectPage.echoLink.hideToken') : t('connectPage.echoLink.showToken')} title={showEchoLinkToken ? t('connectPage.echoLink.hideToken') : t('connectPage.echoLink.showToken')} onClick={() => setShowEchoLinkToken((current) => !current)}>
                {showEchoLinkToken ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </span>
            <span>
              <em>{t('connectPage.echoLink.tempStreams')}</em>
              <strong>{echoLinkStatus.activeMediaTokens}</strong>
            </span>
            <span>
              <em>{t('connectPage.echoLink.discovery')}</em>
              <strong>{echoLinkStatus.mdns.state === 'advertising' ? t('connectPage.echoLink.mdnsAdvertising') : echoLinkStatus.mdns.state === 'error' ? t('connectPage.echoLink.mdnsError') : t('connectPage.echoLink.mdnsIdle')}</strong>
            </span>
            <span>
              <em>{t('connectPage.echoLink.phone')}</em>
              <strong>{echoLinkStatus.diagnostics.lastPhoneConnectionAt ? new Date(echoLinkStatus.diagnostics.lastPhoneConnectionAt).toLocaleTimeString() : t('connectPage.echoLink.phoneNeverConnected')}</strong>
            </span>
            <span>
              <em>{t('connectPage.echoLink.authFailures')}</em>
              <strong>{echoLinkStatus.diagnostics.authFailureCount}</strong>
            </span>
            <span>
              <em>{t('connectPage.echoLink.lastRange')}</em>
              <strong>{echoLinkStatus.diagnostics.lastMediaTokenServed?.range ?? t('connectPage.common.none')}</strong>
            </span>
          </div>
          {echoLinkHosts.length > 1 ? (
            <div className="connect-echo-link-hosts" aria-label="ECHO Link LAN address">
              <small>{t('connectPage.echoLink.lanAddress')}</small>
              <div>
                {echoLinkHosts.map((host) => (
                  <button
                    key={host}
                    type="button"
                    aria-pressed={host === echoLinkSelectedHost}
                    onClick={() => setSelectedEchoLinkHost(host)}
                  >
                    {host}:{echoLinkStatus.port}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <small className="connect-echo-link-address-note">{echoLinkAddressLabel}</small>
          )}
          <div className="connect-echo-link-pairing">
            <div className="connect-echo-link-qr" data-empty={echoLinkQrDataUrl ? 'false' : 'true'}>
              {echoLinkQrDataUrl ? <img src={echoLinkQrDataUrl} alt="" /> : <Smartphone size={30} />}
            </div>
            <code>{echoLinkPairingUri ?? t('connectPage.echoLink.pairDisabled')}</code>
            <button className="settings-action-button" type="button" onClick={() => void copyEchoLinkPairing()} disabled={!echoLinkPairingUri}>
              {copiedEchoLinkPairing ? <Check size={15} /> : <Copy size={15} />}
              {copiedEchoLinkPairing ? t('connectPage.common.copied') : t('connectPage.common.copy')}
            </button>
          </div>
          <div className="connect-echo-link-web">
            <div>
              <span>{t('connectPage.echoLink.webTitle')}</span>
              <strong>{echoLinkWebControlUrl ? t('connectPage.echoLink.webAlbumSeaReady') : t('connectPage.echoLink.webAvailableAfterEnable')}</strong>
              <small>{t('connectPage.echoLink.webHint')}</small>
            </div>
            <code>{echoLinkWebControlUrl ?? 'http://LAN-IP:26789/echo-link/web'}</code>
            <div className="connect-echo-link-web__actions">
              <button className="settings-action-button" type="button" onClick={() => void openEchoLinkWebControl()} disabled={!echoLinkWebControlUrl}>
                <Smartphone size={15} />
                {t('connectPage.common.open')}
              </button>
              <button className="settings-action-button" type="button" onClick={() => void copyEchoLinkWebControl()} disabled={!echoLinkWebControlUrl}>
                {copiedEchoLinkWebControl ? <Check size={15} /> : <Copy size={15} />}
                {copiedEchoLinkWebControl ? t('connectPage.common.copied') : t('connectPage.echoLink.copyWeb')}
              </button>
            </div>
          </div>
          <form className="connect-echo-link-background" onSubmit={(event) => {
            event.preventDefault();
            void saveEchoLinkWebBackground();
          }}>
            <div className="connect-echo-link-background__intro">
              <span>
                {echoLinkWebBackgroundDraft.type === 'video' ? <Video size={15} /> : <Image size={15} />}
                {t('connectPage.echoLink.backgroundTitle')}
              </span>
              <small>{t('connectPage.echoLink.backgroundHint')}</small>
            </div>
            <label className="connect-echo-link-background__mode">
              <small>{t('connectPage.echoLink.backgroundType')}</small>
              <select
                value={echoLinkWebBackgroundDraft.type}
                onChange={(event) => {
                  const type = event.currentTarget.value as EchoLinkWebBackground['type'];
                  setEchoLinkWebBackgroundDraft((current) => ({ ...current, type }));
                }}
              >
                <option value="none">{t('connectPage.echoLink.backgroundNone')}</option>
                <option value="image">{t('connectPage.echoLink.backgroundImage')}</option>
                <option value="video">{t('connectPage.echoLink.backgroundVideo')}</option>
              </select>
            </label>
            <label className="connect-echo-link-background__url">
              <small>{t('connectPage.echoLink.backgroundUrl')}</small>
              <input
                type="text"
                value={echoLinkWebBackgroundDraft.url}
                placeholder={t('connectPage.echoLink.backgroundUrlPlaceholder')}
                disabled={echoLinkWebBackgroundDraft.type === 'none'}
                onChange={(event) => {
                  const url = event.currentTarget.value;
                  setEchoLinkWebBackgroundDraft((current) => ({ ...current, url }));
                }}
              />
            </label>
            <div className="connect-echo-link-background__actions">
              <button className="settings-action-button" type="button" onClick={() => void chooseEchoLinkWebBackgroundImage()} disabled={isEchoLinkBackgroundBusy}>
                <FolderOpen size={15} />
                {t('connectPage.echoLink.backgroundChooseImage')}
              </button>
              <button className="settings-action-button" type="submit" disabled={echoLinkWebBackgroundSaveDisabled}>
                {isEchoLinkBackgroundBusy ? <Loader2 className="spinning-icon" size={15} /> : savedEchoLinkBackground ? <Check size={15} /> : <Save size={15} />}
                {savedEchoLinkBackground ? t('connectPage.echoLink.backgroundSaved') : t('connectPage.echoLink.backgroundSave')}
              </button>
              <button className="settings-action-button" type="button" onClick={() => void clearEchoLinkWebBackground()} disabled={isEchoLinkBackgroundBusy || (!echoLinkWebBackgroundConfigured && echoLinkWebBackgroundDraft.type === 'none')}>
                <Trash2 size={15} />
                {t('connectPage.echoLink.backgroundClear')}
              </button>
            </div>
          </form>
          {echoLinkStatus.error ? (
            <div className="connect-alert connect-alert--inline" role="alert">
              <AlertTriangle size={16} />
              <span>{echoLinkStatus.error}</span>
            </div>
          ) : null}
          {echoLinkStatus.mdns.error || echoLinkStatus.diagnostics.recentHttpErrors.length > 0 ? (
            <section className="connect-receiver-debug connect-receiver-debug--expanded">
              <div className="connect-receiver-debug__header">
                <span>{t('connectPage.echoLink.diagnostics')}</span>
                <small>{echoLinkStatus.diagnostics.recentHttpErrors.length} errors</small>
              </div>
              <div className="connect-receiver-debug__items">
                {echoLinkStatus.mdns.error ? <code>mDNS {echoLinkStatus.mdns.error}</code> : null}
                {echoLinkStatus.diagnostics.recentHttpErrors.slice(0, 6).map((event) => (
                  <code key={`${event.at}-${event.path}-${event.statusCode}`}>
                    {new Date(event.at).toLocaleTimeString()} {event.statusCode} {event.path} {event.message}
                  </code>
                ))}
              </div>
            </section>
          ) : null}
            </div>
          </div>
        </section>
            <MqttIntegrationPanel
              bridgeOverride={isConnectBrowserPreview ? connectBrowserPreviewMqttBridge : undefined}
            />
          </div>
      </section>
      ) : null}

      {workspaceMode === 'radio' ? (
        <ConnectRadioWorkspace
          stations={radioStations}
          activeStationId={activeRadioStation?.id ?? activeRadioId}
          isRadioActive={isRadioActive}
          isBusy={isRadioBusy}
          nameDraft={radioNameDraft}
          urlDraft={radioUrlDraft}
          formatLastPlayed={(value) => formatTimestamp(value, t)}
          onNameDraftChange={setRadioNameDraft}
          onUrlDraftChange={setRadioUrlDraft}
          onSaveDraft={saveRadioDraftStation}
          onPlayDraft={playRadioDraft}
          onPlayClipboard={playRadioClipboard}
          onStop={stopRadioPlayback}
          onPlayStation={playRadioStation}
          onRemoveStation={removeRadioStation}
        />
      ) : null}

      {workspaceMode === 'receive' ? (
        <ConnectReceiveWorkspace
          receiverStatus={receiverStatus}
          airPlayReceiverStatus={airPlayReceiverStatus}
          airPlayReceiverProtocol={airPlayReceiverProtocol}
          airPlayDebugText={airPlayDebugText}
          copiedAirPlayDebug={copiedAirPlayDebug}
          isReceiverBusy={isReceiverBusy}
          isAirPlayReceiverBusy={isAirPlayReceiverBusy}
          onToggleReceiver={() => void toggleReceiver()}
          onStopReceiver={() => void stopReceiverPlayback()}
          onToggleAirPlay={() => void toggleAirPlayReceiver()}
          onStopAirPlay={() => void stopAirPlayReceiverPlayback()}
          onSetAirPlayProtocol={(protocol) => void setAirPlayProtocol(protocol)}
          onCopyAirPlayDebug={() => void copyAirPlayDebug()}
        />
      ) : null}
      </div>
        </section>
      </div>

      {preflightDevice ? (
        <ConnectPreflightDialog
          result={preflightResult}
          checking={isPreflightChecking}
          onCancel={closeConnectPreflight}
          onConfirm={() => void confirmConnectPreflight()}
        />
      ) : null}

    </div>
  );
};
