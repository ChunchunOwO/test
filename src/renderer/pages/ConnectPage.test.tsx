// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings } from '../../shared/types/appSettings';
import { hqPlayerConnectDeviceId, type ConnectDevice, type ConnectPreflightResult, type ConnectSessionStatus } from '../../shared/types/connect';
import type { EchoLinkServerStatus } from '../../shared/types/echoLink';
import type {
  HqPlayerPlaybackControlPlan,
  HqPlayerPlaybackControlSendState,
  HqPlayerPlaybackHandoffPlan,
  HqPlayerSettings,
  HqPlayerStatus,
} from '../../shared/types/hqplayer';
import { I18nProvider } from '../i18n/I18nProvider';
import { ConnectPage, resetConnectDonatorUnlockStatusCacheForTests } from './ConnectPage';

const queueMock = {
  currentTrack: {
    mediaType: 'local',
    id: 'track-1',
    path: 'D:\\Music\\song.flac',
    title: 'Song',
    artist: 'Artist',
    album: 'Album',
    duration: 180,
  },
  lastPlayedTrack: null,
  playTrack: vi.fn().mockResolvedValue({
    state: 'playing',
    currentTrackId: 'radio-stream:test',
    positionMs: 0,
    durationMs: 0,
    filePath: 'streaming:m3u8:test',
  }),
};

const playbackStatusMock = {
  audioStatus: {
    currentFilePath: 'D:\\Music\\song.flac',
    positionSeconds: 12,
  },
  playbackStatus: null,
};

vi.mock('../stores/PlaybackQueueProvider', () => ({
  usePlaybackQueue: () => queueMock,
}));

vi.mock('../stores/playbackStatusStore', () => ({
  useSharedPlaybackStatus: () => playbackStatusMock,
  useSharedPlaybackStatusForUi: () => playbackStatusMock,
}));

const hqSettings: HqPlayerSettings = {
  enabled: true,
  connectionMode: 'localDesktop',
  host: '127.0.0.1',
  port: 4321,
  executablePath: null,
  allowLaunch: false,
  mediaServerEnabled: true,
  mediaServerPort: null,
  defaultPlaybackBackend: 'hqplayer',
  profileName: null,
};

const hqStatus = (state: HqPlayerStatus['state']): HqPlayerStatus => ({
  enabled: true,
  state,
  endpoint: {
    connectionMode: 'localDesktop',
    host: '127.0.0.1',
    port: 4321,
  },
  mediaServerEnabled: true,
  defaultPlaybackBackend: 'hqplayer',
  profileName: null,
  lastCheckedAt: '2026-05-21T01:00:00.000Z',
  lastError: null,
});

const hqControl = (sendState: HqPlayerPlaybackControlSendState = 'prepared'): HqPlayerPlaybackControlPlan => ({
  state: 'prepared',
  reason: null,
  action: 'play-source',
  transport: 'dry-run',
  endpoint: {
    connectionMode: 'localDesktop',
    host: '127.0.0.1',
    port: 4321,
  },
  profileName: null,
  source: {
    trackId: 'track-1',
    mediaType: 'local',
    url: 'D:\\Music\\song.flac',
    exposure: 'local-file',
    mimeType: 'audio/flac',
    expiresAt: null,
    hasHeaders: false,
  },
  metadata: {
    title: 'Song',
    artist: 'Artist',
    album: 'Album',
    durationSeconds: 180,
  },
  startSeconds: 12,
  createdAt: '2026-05-21T01:00:00.000Z',
  send: {
    state: sendState,
    reason: null,
    transport: 'official-control-tcp',
    command: 'PlayNextURI+Play+Seek',
    endpoint: {
      connectionMode: 'localDesktop',
      host: '127.0.0.1',
      port: 4321,
    },
    startedAt: '2026-05-21T01:00:00.000Z',
    finishedAt: sendState === 'sent' ? '2026-05-21T01:00:00.012Z' : '2026-05-21T01:00:00.000Z',
    elapsedMs: sendState === 'sent' ? 12 : 0,
    message: null,
    response: sendState === 'sent' ? '<PlayNextURI result="OK"/>\n<Play result="OK"/>\n<Seek result="OK"/>' : null,
  },
});

const hqHandoff = (control = hqControl()): HqPlayerPlaybackHandoffPlan => ({
  state: 'ready',
  reason: null,
  endpoint: control.endpoint,
  defaultPlaybackBackend: 'hqplayer',
  profileName: null,
  source: {
    trackId: 'track-1',
    mediaType: 'local',
    title: 'Song',
    artist: 'Artist',
    album: 'Album',
    url: 'D:\\Music\\song.flac',
    exposure: 'local-file',
    headers: {},
    mimeType: 'audio/flac',
    expiresAt: null,
    durationSeconds: 180,
    startSeconds: 12,
    mediaServer: null,
    streaming: null,
  },
  fallback: null,
  control,
  createdAt: '2026-05-21T01:00:00.000Z',
});

const connectStatus: ConnectSessionStatus = {
  deviceId: null,
  protocol: null,
  state: 'idle',
  currentTrackId: null,
  metadata: null,
  positionSeconds: 0,
  durationSeconds: 0,
  latencyMs: null,
  error: null,
  updatedAt: '2026-05-21T01:00:00.000Z',
};

const hqPlayerDevice: ConnectDevice = {
  id: hqPlayerConnectDeviceId,
  name: 'HQPlayer Desktop',
  protocol: 'hqplayer',
  model: 'Local Desktop Control',
  manufacturer: 'Signalyst',
  address: '127.0.0.1:4321',
  capabilities: {
    canPlay: false,
    canPause: false,
    canStop: false,
    canSeek: false,
    canSetVolume: false,
    supportsMetadata: true,
    supportsSetNext: false,
    supportedMimeTypes: [],
    requiresTranscode: false,
  },
  state: 'available',
  lastSeenAt: null,
  unsupportedReason: null,
};

const hqPlayerConnectStatus: ConnectSessionStatus = {
  deviceId: hqPlayerConnectDeviceId,
  protocol: 'hqplayer',
  state: 'playing',
  currentTrackId: 'track-1',
  metadata: {
    title: 'Song',
    artist: 'Artist',
    album: 'Album',
    albumArtist: null,
    durationSeconds: 180,
    coverHttpUrl: '',
  },
  positionSeconds: 12,
  durationSeconds: 180,
  latencyMs: 12,
  error: null,
  updatedAt: '2026-05-21T01:00:00.000Z',
};

const renderConnectPage = () =>
  render(
    <I18nProvider>
      <ConnectPage />
    </I18nProvider>,
  );

const findDeviceRow = async (name: string): Promise<HTMLElement> => {
  const heading = await screen.findByRole('heading', { name, level: 3 });
  return heading.closest('article') as HTMLElement;
};

const openHqPlayerWorkspace = async (): Promise<void> => {
  fireEvent.click(await screen.findByRole('button', { name: /^HQPlayer$/u }));
};

const dlnaDevice: ConnectDevice = {
  id: 'dlna:uuid-streamer-1',
  name: 'Living Room Streamer',
  protocol: 'dlna',
  model: 'N130',
  manufacturer: 'Silent Angel',
  address: '192.168.1.42',
  capabilities: {
    canPlay: true,
    canPause: true,
    canStop: true,
    canSeek: true,
    canSetVolume: true,
    supportsMetadata: true,
    supportsSetNext: false,
    supportedMimeTypes: ['audio/flac', 'audio/wav', 'audio/mpeg'],
    requiresTranscode: false,
  },
  state: 'available',
  lastSeenAt: '2026-05-21T01:00:00.000Z',
  unsupportedReason: null,
  discovery: {
    deviceType: 'urn:schemas-upnp-org:device:MediaRenderer:1',
    descriptionUrl: 'http://192.168.1.42:49152/description.xml',
    presentationUrl: null,
    modelName: 'N130',
    modelNumber: 'v2',
    modelDescription: 'Network Transport',
    serialNumber: 'SA-001',
    udn: 'uuid-streamer-1',
  },
};

const dlnaConnectStatus: ConnectSessionStatus = {
  deviceId: dlnaDevice.id,
  protocol: 'dlna',
  state: 'playing',
  currentTrackId: 'track-1',
  metadata: {
    title: 'Song',
    artist: 'Artist',
    album: 'Album',
    albumArtist: null,
    durationSeconds: 180,
    coverHttpUrl: 'http://192.168.1.20:45000/connect/cover/token',
  },
  positionSeconds: 12,
  durationSeconds: 180,
  latencyMs: 86,
  error: null,
  updatedAt: '2026-05-21T01:00:00.000Z',
  httpEvents: [
    {
      id: 'event-cover',
      at: '2026-05-21T01:00:01.000Z',
      remoteAddress: '192.168.1.42',
      method: 'GET',
      path: '/connect/cover/token',
      kind: 'cover',
      statusCode: 200,
      bytes: 1234,
      range: null,
      userAgent: 'Matrix',
      message: 'image/jpeg',
    },
  ],
};

const echoLinkServerStatus: EchoLinkServerStatus = {
  enabled: true,
  running: true,
  port: 26789,
  host: '192.168.1.20',
  addresses: ['192.168.1.20'],
  pairingUri: null,
  webControlUrl: null,
  token: 'pair-token-1234567890',
  deviceName: 'PC ECHO',
  deviceId: 'pc-echo',
  webBackground: { type: 'none', url: '' },
  activeMediaTokens: 1,
  activeArtworkTokens: 0,
  mdns: {
    state: 'advertising',
    serviceName: '_echo-link._tcp.local',
    error: null,
    advertisedAddresses: ['192.168.1.20'],
  },
  diagnostics: {
    selectedLanAddress: '192.168.1.20',
    lastPhoneConnectionAt: '2026-05-21T01:02:00.000Z',
    lastAuthFailureAt: null,
    authFailureCount: 0,
    lastMediaTokenServed: null,
    recentHttpErrors: [],
  },
  error: null,
  updatedAt: '2026-05-21T01:02:00.000Z',
};

const installEchoBridge = (
  status: HqPlayerStatus,
  settings: HqPlayerSettings = hqSettings,
  initialConnectStatus: ConnectSessionStatus = connectStatus,
  devices: ConnectDevice[] = [hqPlayerDevice],
) => {
  const sentControl = hqControl('sent');
  let appSettings: Partial<AppSettings> = {
    connectAutoStartReceiversEnabled: false,
    airPlayReceiverProtocol: 'airplay1',
  };
  const bridge = {
    app: {
      getSettings: vi.fn(async () => appSettings),
      setSettings: vi.fn(async (patch: Partial<AppSettings>) => {
        appSettings = { ...appSettings, ...patch };
        return appSettings;
      }),
    },
    connect: {
      getDonatorUnlockStatus: vi.fn().mockResolvedValue({
        featureId: 'connect',
        pluginId: 'echo.connect-donator-unlock',
        requiredVersion: 'plugin:echo.connect-donator-unlock:v1',
        unlocked: true,
        pluginInstalled: true,
        pluginEnabled: true,
        hwidHash: 'a'.repeat(64),
        reason: 'unlocked',
        checkedAt: '2026-05-21T01:00:00.000Z',
      }),
      listDevices: vi.fn().mockResolvedValue(devices),
      refresh: vi.fn().mockResolvedValue(devices),
      getStatus: vi.fn().mockResolvedValue(initialConnectStatus),
      preflight: vi.fn(async (request: { deviceId: string }): Promise<ConnectPreflightResult> => {
        const device = devices.find((entry) => entry.id === request.deviceId) ?? hqPlayerDevice;
        return {
          deviceId: device.id,
          deviceName: device.name,
          protocol: device.protocol,
          ready: true,
          checkedAt: '2026-05-21T01:00:00.000Z',
          source: { title: 'Song', mimeType: device.protocol === 'dlna' ? 'audio/flac' : null, remote: false },
          delivery: device.protocol === 'hqplayer' ? 'hqplayer' : 'direct',
          capabilities: device.capabilities,
          issues: [],
          warnings: [],
        };
      }),
      connect: vi.fn().mockResolvedValue(hqPlayerConnectStatus),
      disconnect: vi.fn().mockResolvedValue(connectStatus),
      play: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
      setVolume: vi.fn(),
      onStatus: vi.fn(() => () => undefined),
      getReceiverStatus: vi.fn().mockResolvedValue({
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
        updatedAt: '2026-05-21T01:00:00.000Z',
      }),
      setReceiverEnabled: vi.fn(),
      stopReceiverPlayback: vi.fn(),
      onReceiverStatus: vi.fn(() => () => undefined),
      getAirPlayReceiverStatus: vi.fn().mockResolvedValue({
        enabled: false,
        state: 'disabled',
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
        updatedAt: '2026-05-21T01:00:00.000Z',
      }),
      setAirPlayReceiverEnabled: vi.fn(),
      stopAirPlayReceiverPlayback: vi.fn(),
      onAirPlayReceiverStatus: vi.fn(() => () => undefined),
      getWallpaperEngineBridgeStatus: vi.fn().mockResolvedValue({
        running: true,
        host: '127.0.0.1',
        port: 47668,
        url: 'http://127.0.0.1:47668',
        eventClients: 2,
      }),
      getEchoLinkStatus: vi.fn().mockResolvedValue(echoLinkServerStatus),
      setEchoLinkEnabled: vi.fn().mockResolvedValue(echoLinkServerStatus),
      setEchoLinkWebBackground: vi.fn().mockResolvedValue({
        ...echoLinkServerStatus,
        webBackground: { type: 'video', url: 'https://example.test/background.webm' },
      }),
      chooseEchoLinkWebBackgroundImage: vi.fn().mockResolvedValue({
        ...echoLinkServerStatus,
        webBackground: { type: 'image', url: '/echo-link/v1/background/local-bg-token' },
      }),
      rotateEchoLinkToken: vi.fn().mockResolvedValue({
        ...echoLinkServerStatus,
        token: 'rotated-token-1234567890',
      }),
    },
    hqPlayer: {
      getSettings: vi.fn().mockResolvedValue(settings),
      setSettings: vi.fn().mockImplementation(async (patch: HqPlayerSettings) => ({ ...settings, ...patch })),
      getStatus: vi.fn().mockResolvedValue(status),
      testConnection: vi.fn().mockResolvedValue({
        ok: true,
        state: 'available',
        endpoint: {
          connectionMode: 'localDesktop',
          host: '127.0.0.1',
          port: 4321,
        },
        elapsedMs: 12,
        checkedAt: '2026-05-21T01:00:00.000Z',
        error: null,
      }),
      createPlaybackHandoff: vi.fn().mockResolvedValue(hqHandoff()),
      sendLastPlaybackControl: vi.fn().mockResolvedValue(sentControl.send),
      getLastPlaybackHandoff: vi.fn()
        .mockResolvedValueOnce(hqHandoff())
        .mockResolvedValue(hqHandoff(sentControl)),
      getLastPlaybackControl: vi.fn()
        .mockResolvedValueOnce(hqControl())
        .mockResolvedValue(sentControl),
    },
    playback: {
      playLocalFile: vi.fn().mockResolvedValue({
        state: 'playing',
        currentTrackId: 'radio-stream:test',
        positionMs: 0,
        durationMs: 0,
        filePath: 'https://radio.example.test/live.mp3',
      }),
      stop: vi.fn().mockResolvedValue({
        state: 'stopped',
        currentTrackId: null,
        positionMs: 0,
        durationMs: 0,
        filePath: null,
      }),
    },
    streaming: {
      resolveLive: vi.fn().mockResolvedValue({
        provider: 'bilibili',
        sourceUrl: 'https://live.bilibili.com/21465419?live_from=71002',
        pageUrl: 'https://live.bilibili.com/21465419',
        playbackUrl: 'https://bilibili.example.test/live.m3u8',
        videoUrl: 'https://bilibili.example.test/live.m3u8',
        title: '直播帕鲁',
        artist: 'Bilibili Live',
        coverUrl: 'echo-image://remote/cover',
        roomId: '21465419',
        liveStatus: 'live',
        mimeType: 'application/vnd.apple.mpegurl',
        headers: {
          Referer: 'https://live.bilibili.com/',
          'User-Agent': 'Mozilla/5.0',
        },
      }),
    },
  };
  Object.defineProperty(window, 'echo', {
    configurable: true,
    value: bridge,
  });
  return bridge;
};

describe('ConnectPage HQPlayer controls', () => {
  beforeEach(() => {
    resetConnectDonatorUnlockStatusCacheForTests();
    vi.clearAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem('echo.locale', 'zh-CN');
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, 'echo');
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('opens Connect directly without requesting a Pro unlock status', async () => {
    const bridge = installEchoBridge(hqStatus('available'));
    bridge.connect.getDonatorUnlockStatus.mockResolvedValue({
      featureId: 'connect', pluginId: 'legacy', requiredVersion: 'legacy', unlocked: false,
      pluginInstalled: false, pluginEnabled: false, hwidHash: '', reason: 'license-invalid',
      checkedAt: '2026-05-21T01:00:00.000Z',
    });

    renderConnectPage();

    await waitFor(() => expect(bridge.connect.getStatus).toHaveBeenCalled());
    expect(bridge.connect.getDonatorUnlockStatus).not.toHaveBeenCalled();
    expect(screen.queryByText('Connect 已升级为 ECHO Pro Only')).toBeNull();
    expect(screen.queryByText('需要 ECHO Pro')).toBeNull();
  });
  it('surfaces ECHO Link, paired-device, MQTT, and web remote controls in the phone workspace', async () => {
    const bridge = installEchoBridge(hqStatus('available'), hqSettings, dlnaConnectStatus, [dlnaDevice, hqPlayerDevice]);
    renderConnectPage();

    fireEvent.click(await screen.findByRole('button', { name: '手机控制' }));
    await waitFor(() => expect(bridge.connect.getEchoLinkStatus).toHaveBeenCalled());
    const basicPanel = screen.getByText('ECHO Link Basic').closest('section') as HTMLElement;
    const advancedPanel = screen.getByText('ECHO Link 高级设置').closest('section') as HTMLElement;
    const mqttPanel = screen.getByText('MQTT 智能家居联动').closest('section') as HTMLElement;
    expect(basicPanel.compareDocumentPosition(advancedPanel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(advancedPanel.compareDocumentPosition(mqttPanel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(mqttPanel.querySelector('details')).toBeNull();
    expect(screen.queryByRole('button', { name: '展开 ECHO Link' })).toBeNull();
    expect(screen.queryByRole('button', { name: '折叠 ECHO Link' })).toBeNull();
    expect(screen.getByText('网页控制端')).toBeTruthy();
    expect(screen.getByText(/echo:\/\/pair\?/u)).toBeTruthy();
    expect(screen.getAllByText('192.168.1.20:26789').length).toBeGreaterThan(0);
  });

  it('saves the Echo Link web Album Sea background', async () => {
    const bridge = installEchoBridge(hqStatus('available'), hqSettings, dlnaConnectStatus, [dlnaDevice, hqPlayerDevice]);
    renderConnectPage();

    fireEvent.click(await screen.findByRole('button', { name: '手机控制' }));
    expect(await screen.findByText('网页背景')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('类型'), { target: { value: 'video' } });
    fireEvent.change(screen.getByLabelText('媒体 URL'), { target: { value: 'https://example.test/background.webm' } });
    fireEvent.click(screen.getByRole('button', { name: '保存背景' }));

    await waitFor(() => {
      expect(bridge.connect.setEchoLinkWebBackground).toHaveBeenCalledWith({
        type: 'video',
        url: 'https://example.test/background.webm',
      });
    });
  });

  it('chooses a local image for the Echo Link web Album Sea background', async () => {
    const bridge = installEchoBridge(hqStatus('available'), hqSettings, dlnaConnectStatus, [dlnaDevice, hqPlayerDevice]);
    renderConnectPage();

    fireEvent.click(await screen.findByRole('button', { name: '手机控制' }));
    expect(await screen.findByText('网页背景')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '选择图片' }));

    await waitFor(() => {
      expect(bridge.connect.chooseEchoLinkWebBackgroundImage).toHaveBeenCalled();
    });
    expect((screen.getByLabelText('媒体 URL') as HTMLInputElement).value).toBe('/echo-link/v1/background/local-bg-token');
  });

  it('switches among the connect workspaces', async () => {
    installEchoBridge(hqStatus('available'), hqSettings, dlnaConnectStatus, [dlnaDevice, hqPlayerDevice]);
    const { container } = renderConnectPage();

    const page = container.querySelector('.connect-page--session');
    expect(await screen.findByRole('toolbar', { name: '连接任务' })).toBeTruthy();
    expect(page?.getAttribute('data-mode')).toBe('output');

    fireEvent.click(screen.getByRole('button', { name: /^HQPlayer$/u }));
    expect(page?.getAttribute('data-mode')).toBe('hqplayer');
    fireEvent.click(screen.getByRole('button', { name: '从设备接收' }));
    expect(page?.getAttribute('data-mode')).toBe('receive');
    expect(screen.getByRole('region', { name: '接收来自手机' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'AirPlay 实验接收' })).toBeTruthy();
    expect(screen.getByText('从手机投送')).toBeTruthy();
    expect(screen.getByText('从 iPhone 投送')).toBeTruthy();
    expect(screen.getByRole('button', { name: '开启接收' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '开启 AirPlay' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '手机控制' }));
    expect(page?.getAttribute('data-mode')).toBe('mobile');
    fireEvent.click(screen.getByRole('button', { name: '网络电台' }));
    expect(page?.getAttribute('data-mode')).toBe('radio');
  });

  it('supports keyboard workspace navigation and remembers the last workspace', async () => {
    installEchoBridge(hqStatus('available'), hqSettings, dlnaConnectStatus, [dlnaDevice, hqPlayerDevice]);
    const { container, unmount } = renderConnectPage();
    const outputButton = await screen.findByRole('button', { name: '播放到设备' });
    const hqPlayerButton = screen.getByRole('button', { name: /^HQPlayer$/u });

    expect(outputButton.getAttribute('aria-pressed')).toBe('true');
    expect(outputButton.tabIndex).toBe(0);
    expect(hqPlayerButton.tabIndex).toBe(-1);

    outputButton.focus();
    fireEvent.keyDown(outputButton, { key: 'ArrowRight' });
    expect(container.querySelector('.connect-page--session')?.getAttribute('data-mode')).toBe('hqplayer');
    expect(document.activeElement).toBe(hqPlayerButton);
    expect(hqPlayerButton.getAttribute('aria-pressed')).toBe('true');
    expect(hqPlayerButton.tabIndex).toBe(0);
    expect(outputButton.tabIndex).toBe(-1);
    expect(window.localStorage.getItem('echo.connect.workspaceMode.v1')).toBe('hqplayer');

    fireEvent.keyDown(hqPlayerButton, { key: 'End' });
    const radioButton = screen.getByRole('button', { name: '网络电台' });
    expect(document.activeElement).toBe(radioButton);
    expect(radioButton.getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(radioButton, { key: 'Home' });
    expect(document.activeElement).toBe(outputButton);
    expect(fireEvent.keyDown(outputButton, { key: 'ArrowLeft', altKey: true })).toBe(true);
    expect(document.activeElement).toBe(outputButton);

    unmount();
    const restored = renderConnectPage();
    expect(restored.container.querySelector('.connect-page--session')?.getAttribute('data-mode')).toBe('output');
  });

  it('filters devices by metadata and supports slash focus and Escape clear', async () => {
    installEchoBridge(hqStatus('available'), hqSettings, connectStatus, [dlnaDevice, hqPlayerDevice]);
    renderConnectPage();

    const search = await screen.findByRole('searchbox', { name: '搜索局域网设备' });
    fireEvent.keyDown(window, { key: '/' });
    expect(document.activeElement).toBe(search);

    fireEvent.change(search, { target: { value: '192.168.1.42' } });
    expect(screen.getByText('Living Room Streamer')).toBeTruthy();
    expect(screen.queryByText('HQPlayer Desktop')).toBeNull();
    expect(screen.getByText('显示 1 / 2')).toBeTruthy();

    fireEvent.change(search, { target: { value: 'missing-device' } });
    expect(screen.getByText('没有匹配的设备')).toBeTruthy();
    expect(screen.getByText('显示 0 / 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '清空设备搜索' }));
    expect((search as HTMLInputElement).value).toBe('');
    expect(document.activeElement).toBe(search);
    expect(await screen.findByText('HQPlayer Desktop')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '可连接' }));
    expect(screen.getByText('显示 2 / 2')).toBeTruthy();
    expect(screen.getByRole('button', { name: '可连接' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: '置顶 Living Room Streamer' }));
    expect(JSON.parse(window.localStorage.getItem('echo.connect.pinnedDevices.v1') ?? '[]')).toContain(dlnaDevice.id);
    expect(screen.getByRole('button', { name: '取消置顶 Living Room Streamer' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps the device search shortcut behind the connection preflight modal', async () => {
    installEchoBridge(hqStatus('available'), hqSettings, connectStatus, [dlnaDevice, hqPlayerDevice]);
    renderConnectPage();

    const search = await screen.findByRole('searchbox', { name: '搜索局域网设备' });
    const row = screen.getByText('Living Room Streamer').closest('article') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: '连接' }));

    const dialog = await screen.findByRole('dialog', { name: '准备连接设备' });
    const cancelButton = within(dialog).getAllByRole('button', { name: '取消' })[0];
    cancelButton.focus();
    fireEvent.keyDown(window, { key: '/' });
    expect(document.activeElement).toBe(cancelButton);
    expect(document.activeElement).not.toBe(search);
  });

  it('offers a direct route to songs when no local source is ready', async () => {
    const previousTrack = queueMock.currentTrack;
    const previousAudioPath = playbackStatusMock.audioStatus.currentFilePath;
    Reflect.set(queueMock, 'currentTrack', null);
    Reflect.set(playbackStatusMock.audioStatus, 'currentFilePath', null);
    const navigateSongs = vi.fn();
    window.addEventListener('app:navigate:songs', navigateSongs);

    try {
      installEchoBridge(hqStatus('available'), hqSettings, connectStatus, [dlnaDevice]);
      renderConnectPage();

      expect(await screen.findByText('先在 ECHO 中播放一首歌')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: '去选择歌曲' }));
      expect(navigateSongs).toHaveBeenCalledTimes(1);
      expect((within(screen.getByText('Living Room Streamer').closest('article') as HTMLElement).getByRole('button', { name: '连接' }) as HTMLButtonElement).disabled).toBe(true);
    } finally {
      window.removeEventListener('app:navigate:songs', navigateSongs);
      Reflect.set(queueMock, 'currentTrack', previousTrack);
      Reflect.set(playbackStatusMock.audioStatus, 'currentFilePath', previousAudioPath);
    }
  });

  it('dismisses a refresh error and returns focus to the active workspace', async () => {
    const bridge = installEchoBridge(hqStatus('available'));
    bridge.connect.refresh.mockRejectedValueOnce(new Error('scan failed'));
    renderConnectPage();

    expect((await screen.findByRole('alert')).textContent).toContain('scan failed');
    fireEvent.click(screen.getByRole('button', { name: '关闭错误提示' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: '播放到设备' })));
  });

  it('keeps the phone-control workspace expanded even when legacy collapsed state exists', async () => {
    window.localStorage.setItem('echo.connect.echoLinkPanelCollapsed.v1', 'true');
    installEchoBridge(hqStatus('available'), hqSettings, dlnaConnectStatus, [dlnaDevice, hqPlayerDevice]);
    const { container } = renderConnectPage();

    fireEvent.click(await screen.findByRole('button', { name: '手机控制' }));
    const echoLinkPanel = container.querySelector('.connect-echo-link-panel');
    expect(echoLinkPanel?.getAttribute('data-collapsed')).toBeNull();
    expect(within(echoLinkPanel as HTMLElement).getByRole('combobox', { name: '类型' })).toBeTruthy();
    expect(within(echoLinkPanel as HTMLElement).queryByRole('button', { name: /ECHO Link/u })).toBeNull();
  });
  it('shows HQPlayer as a Connect output device and routes connection through Connect', async () => {
    const bridge = installEchoBridge(hqStatus('available'));
    renderConnectPage();

    await screen.findByText('HQPlayer Desktop');
    const row = screen.getByText('HQPlayer Desktop').closest('article');
    expect(row).toBeTruthy();
    const connectButton = within(row as HTMLElement).getByRole('button', { name: '连接' });
    expect(connectButton).toBeTruthy();

    fireEvent.click(connectButton as HTMLButtonElement);

    expect(await screen.findByRole('dialog', { name: '准备连接设备' })).toBeTruthy();
    await waitFor(() => expect(bridge.connect.preflight).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: hqPlayerConnectDeviceId }),
    ));
    fireEvent.click(screen.getByRole('button', { name: '确认并开始投送' }));

    await waitFor(() => expect(bridge.connect.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: hqPlayerConnectDeviceId,
        track: expect.objectContaining({ id: 'track-1' }),
        filePath: 'D:\\Music\\song.flac',
        positionSeconds: 12,
      }),
    ));
    expect(bridge.hqPlayer.sendLastPlaybackControl).not.toHaveBeenCalled();
  });

  it('blocks connection when preflight cannot reach the device', async () => {
    const bridge = installEchoBridge(hqStatus('available'), hqSettings, connectStatus, [dlnaDevice]);
    bridge.connect.preflight.mockResolvedValueOnce({
      deviceId: dlnaDevice.id,
      deviceName: dlnaDevice.name,
      protocol: 'dlna',
      ready: false,
      checkedAt: '2026-05-21T01:00:00.000Z',
      source: { title: 'Song', mimeType: 'audio/flac', remote: false },
      delivery: 'direct',
      capabilities: dlnaDevice.capabilities,
      issues: ['device_unavailable'],
      warnings: [],
    });
    renderConnectPage();

    const row = await findDeviceRow('Living Room Streamer');
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: '连接' }));

    expect(await screen.findByText('设备当前不可达，请检查同一局域网和设备电源。')).toBeTruthy();
    expect((screen.getByRole('button', { name: '暂时无法连接' }) as HTMLButtonElement).disabled).toBe(true);
    expect(bridge.connect.connect).not.toHaveBeenCalled();
  });

  it('shows authoritative output ownership and returns a failed session to local playback', async () => {
    const failedStatus: ConnectSessionStatus = {
      ...dlnaConnectStatus,
      state: 'error',
      error: '设备拒绝当前音频格式',
    };
    const bridge = installEchoBridge(hqStatus('available'), hqSettings, failedStatus, [dlnaDevice]);
    renderConnectPage();

    expect(await screen.findByText('外部连接失败')).toBeTruthy();
    expect(screen.getByText('设备拒绝当前音频格式')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '返回本机播放' }));

    await waitFor(() => expect(bridge.connect.disconnect).toHaveBeenCalled());
    await waitFor(() => expect(queueMock.playTrack).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'track-1' }),
      expect.objectContaining({ routeToConnectOutput: false, startSeconds: 12 }),
    ));
  });

  it('disconnects the active device directly instead of offering a redundant reconnect action', async () => {
    const bridge = installEchoBridge(hqStatus('available'), hqSettings, dlnaConnectStatus, [dlnaDevice]);
    renderConnectPage();

    const row = await findDeviceRow('Living Room Streamer');
    expect(within(row as HTMLElement).queryByRole('button', { name: '重新投送' })).toBeNull();
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: '断开' }));

    await waitFor(() => expect(bridge.connect.disconnect).toHaveBeenCalled());
  });

  it('shows DLNA now-playing details while a phone is casting', async () => {
    const bridge = installEchoBridge(hqStatus('available'));
    bridge.connect.getReceiverStatus.mockResolvedValue({
      enabled: true,
      state: 'playing',
      advertisedName: 'ECHO',
      addresses: ['http://192.168.1.8:8090/'],
      currentClient: { address: '192.168.1.20', userAgent: 'phone', lastSeenAt: '2026-05-21T01:00:00.000Z' },
      currentUri: 'http://192.168.1.20/track.flac',
      metadata: {
        title: 'Night Drive',
        artist: 'Kite',
        album: 'After Hours',
        albumArtist: 'Kite',
        durationSeconds: 240,
        coverHttpUrl: '',
      },
      positionSeconds: 32,
      durationSeconds: 240,
      volume: 80,
      error: null,
      debugEvents: [],
      updatedAt: '2026-05-21T01:00:00.000Z',
    });

    renderConnectPage();
    fireEvent.click(await screen.findByRole('button', { name: '从设备接收' }));

    expect(await screen.findByRole('heading', { name: 'Night Drive', level: 3 })).toBeTruthy();
    expect(screen.getByText('Kite / After Hours')).toBeTruthy();
    expect((screen.getByRole('button', { name: '停止接收播放' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText('从手机投送')).toBeNull();
  });

  it('copies AirPlay debug events from the receiver panel', async () => {
    const bridge = installEchoBridge(hqStatus('available'));
    bridge.connect.getAirPlayReceiverStatus.mockResolvedValue({
      enabled: true,
      state: 'ready',
      advertisedName: 'ECHO (AirPlay)',
      nativeAvailable: true,
      currentSourceId: null,
      currentClient: null,
      metadata: null,
      currentLyricLine: null,
      artworkUrl: null,
      positionSeconds: 0,
      durationSeconds: 0,
      volume: 100,
      error: null,
      debugEvents: [{
        id: 'airplay-debug-1',
        at: '2026-05-21T01:00:01.000Z',
        remoteAddress: '192.168.1.10:53124',
        method: 'ENC',
        path: '/airplay2',
        action: 'probe-error',
        statusCode: 400,
        message: 'control frame decrypt failed cipher=chacha20-poly1305',
      }],
      updatedAt: '2026-05-21T01:00:01.000Z',
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    renderConnectPage();

    fireEvent.click(await screen.findByRole('button', { name: '从设备接收' }));
    const copyButton = await screen.findByRole('button', { name: '复制 AirPlay 诊断' });
    await waitFor(() => expect((copyButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(copyButton);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('control frame decrypt failed')));
    expect(writeText.mock.calls[0]?.[0]).toContain('192.168.1.10:53124 ENC /airplay2 #probe-error 400');
  });

  it('saves the AirPlay protocol setting and restarts the active receiver', async () => {
    const bridge = installEchoBridge(hqStatus('available'));
    const enabledAirPlayStatus = {
      enabled: true,
      state: 'idle',
      protocol: 'airplay1',
      advertisedName: 'ECHO (AirPlay)',
      nativeAvailable: true,
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
      updatedAt: '2026-05-21T01:00:00.000Z',
    } as const;
    bridge.connect.getAirPlayReceiverStatus.mockResolvedValue(enabledAirPlayStatus);
    bridge.connect.setAirPlayReceiverEnabled
      .mockResolvedValueOnce({ ...enabledAirPlayStatus, enabled: false, state: 'disabled' })
      .mockResolvedValueOnce({ ...enabledAirPlayStatus, protocol: 'airplay2' });

    renderConnectPage();

    fireEvent.click(await screen.findByRole('button', { name: '从设备接收' }));
    fireEvent.click(await screen.findByRole('button', { name: 'AirPlay 2 实验' }));

    await waitFor(() => expect(bridge.app.setSettings).toHaveBeenCalledWith({ airPlayReceiverProtocol: 'airplay2' }));
    expect(bridge.connect.setAirPlayReceiverEnabled).toHaveBeenNthCalledWith(1, false);
    expect(bridge.connect.setAirPlayReceiverEnabled).toHaveBeenNthCalledWith(2, true);
  });

  it('saves and plays a manual internet radio stream from Connect', async () => {
    const bridge = installEchoBridge(hqStatus('available'));
    renderConnectPage();

    fireEvent.click(await screen.findByRole('button', { name: '网络电台' }));
    const form = await screen.findByLabelText('网络电台表单');
    fireEvent.change(within(form).getByPlaceholderText('例如 Groove Salad'), {
      target: { value: 'Test FM' },
    });
    fireEvent.change(within(form).getByPlaceholderText('https://example.com/live.mp3'), {
      target: { value: 'https://radio.example.test/live.mp3' },
    });

    fireEvent.click(within(form).getByRole('button', { name: '收藏' }));

    const storedStations = JSON.parse(window.localStorage.getItem('echo.connect.radioStations.v2') ?? '[]');
    expect(storedStations[0]).toEqual(expect.objectContaining({
      name: 'Test FM',
      url: 'https://radio.example.test/live.mp3',
    }));

    fireEvent.submit(form);

    await waitFor(() => expect(bridge.connect.disconnect).toHaveBeenCalled());
    await waitFor(() => expect(queueMock.playTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(/^radio-stream:/u),
        mediaType: 'streaming',
        isLiveStream: true,
        provider: 'm3u8',
        title: 'Test FM',
        coverThumb: null,
        liveVideoUrl: null,
      }),
      expect.objectContaining({
        routeToConnectOutput: false,
        forceRefresh: true,
      }),
    ));
  });

  it('does not expose retired third-party live parsing in the Steam radio workspace', async () => {
    const bridge = installEchoBridge(hqStatus('available'));
    renderConnectPage();

    fireEvent.click(await screen.findByRole('button', { name: '网络电台' }));
    expect(await screen.findByLabelText('网络电台表单')).toBeTruthy();
    expect(screen.queryByLabelText('直播表单')).toBeNull();
    expect(bridge.streaming.resolveLive).not.toHaveBeenCalled();
  });

  it('seeds default internet radio stations and keeps deletions local', async () => {
    installEchoBridge(hqStatus('available'));
    const { unmount } = renderConnectPage();

    fireEvent.click(await screen.findByRole('button', { name: '网络电台' }));
    await screen.findByText('Gensokyo Radio 东方');
    expect(screen.getByText('东方 Project 同人音乐电台，适合长时间后台播放。')).toBeTruthy();
    expect(screen.getByText('ANISONG')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '删除 Zeno' }));
    expect(screen.queryByText('Zeno')).toBeNull();
    expect(JSON.parse(window.localStorage.getItem('echo.connect.radioStations.v2') ?? '[]')).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Zeno' })]),
    );

    unmount();
    renderConnectPage();

    fireEvent.click(await screen.findByRole('button', { name: '网络电台' }));
    expect(screen.queryByText('Zeno')).toBeNull();
    await screen.findByText('Gensokyo Radio 东方');
  });

  it('keeps essential DLNA details visible and reveals technical capabilities on demand', async () => {
    installEchoBridge(hqStatus('available'), hqSettings, connectStatus, [dlnaDevice, hqPlayerDevice]);
    renderConnectPage();

    await screen.findByText('Living Room Streamer');
    const row = screen.getByText('Living Room Streamer').closest('article') as HTMLElement;
    expect(screen.getByRole('heading', { name: '局域网数播', level: 2 })).toBeTruthy();
    expect(screen.getByText('投送到数播')).toBeTruthy();
    expect(screen.getAllByText('当前由本机播放').length).toBeGreaterThan(0);
    expect(screen.getByText('DLNA / UPnP · Silent Angel · N130 · v2')).toBeTruthy();
    expect(screen.getByText('局域网 192.168.1.42')).toBeTruthy();
    const detailsSummary = within(row).getByText('能力与发现信息');
    const details = detailsSummary.closest('details');
    expect(details?.hasAttribute('open')).toBe(false);
    fireEvent.click(detailsSummary);
    expect(details?.hasAttribute('open')).toBe(true);
    expect(screen.getByText('可定位 · 可调音量 · 封面/元数据 · 可直连 · FLAC / WAV / MP3')).toBeTruthy();
    expect(screen.getByText('1 台数播 · 2 个入口 · 已隐藏 0')).toBeTruthy();
  });

  it('hides a noisy LAN device from the list and restores it locally', async () => {
    installEchoBridge(hqStatus('available'), hqSettings, connectStatus, [dlnaDevice, hqPlayerDevice]);
    renderConnectPage();

    await screen.findByText('Living Room Streamer');
    const row = screen.getByText('Living Room Streamer').closest('article');
    expect(row).toBeTruthy();

    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: '隐藏 Living Room Streamer' }));

    await waitFor(() => expect(screen.queryByText('DLNA / UPnP · Silent Angel · N130 · v2')).toBeNull());
    expect(screen.getByText('已隐藏设备')).toBeTruthy();
    expect(screen.getAllByText((_, node) => node?.textContent?.trim() === '0 台数播 · 1 个入口 · 已隐藏 1').length).toBeGreaterThan(0);
    expect(JSON.parse(window.localStorage.getItem('echo.connect.hiddenDevices.v1') ?? '[]')).toContain(dlnaDevice.id);

    fireEvent.click(screen.getByRole('button', { name: 'Living Room Streamer' }));

    await screen.findByText('Living Room Streamer');
    expect(screen.queryByText('已隐藏设备')).toBeNull();
  });

  it('remembers the LAN streamer section collapsed state', async () => {
    installEchoBridge(hqStatus('available'));
    const { unmount } = renderConnectPage();

    await screen.findByText('HQPlayer Desktop');
    fireEvent.click(screen.getByRole('button', { name: '折叠局域网数播' }));

    await waitFor(() => expect(screen.queryByText('HQPlayer Desktop')).toBeNull());
    expect(window.localStorage.getItem('echo.connect.deviceSectionCollapsed.v1')).toBe('true');

    unmount();
    renderConnectPage();

    await waitFor(() => expect(screen.queryByText('Donator Only')).toBeNull());
    expect(screen.queryByText('HQPlayer Desktop')).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: '展开局域网数播' }));
    await screen.findByText('HQPlayer Desktop');
  });

  it('shows wildcard DLNA format support without hiding the device capability', async () => {
    installEchoBridge(hqStatus('available'), hqSettings, connectStatus, [{
      ...dlnaDevice,
      id: 'dlna:uuid-streamer-2',
      name: 'Universal Streamer',
      capabilities: {
        ...dlnaDevice.capabilities,
        supportedMimeTypes: ['*/*'],
      },
    }]);
    renderConnectPage();

    await screen.findByText('Universal Streamer');
    expect(screen.getByText('可定位 · 可调音量 · 封面/元数据 · 可直连 · 全格式接收')).toBeTruthy();
  });

  it('shows the active DLNA streamer and cover handoff in the now-playing panel', async () => {
    installEchoBridge(hqStatus('available'), hqSettings, dlnaConnectStatus, [dlnaDevice, hqPlayerDevice]);
    renderConnectPage();

    await screen.findByRole('heading', { name: 'Living Room Streamer', level: 3 });
    expect(screen.getByText('DLNA / UPnP · Living Room Streamer')).toBeTruthy();
    expect(screen.getByText('Silent Angel · N130 · v2 · 局域网 192.168.1.42')).toBeTruthy();
    expect(screen.getByText('封面 URL 已发送 · 投送握手 86ms · 状态轮询约 3s')).toBeTruthy();
    expect(screen.getByText(/GET cover 200 1234B/u)).toBeTruthy();
  });

  it('connects local HQPlayer with the default desktop endpoint instead of requiring a typed port', async () => {
    const bridge = installEchoBridge(hqStatus('unavailable'), {
      ...hqSettings,
      enabled: false,
      port: null,
      defaultPlaybackBackend: 'echoNative',
    });
    renderConnectPage();
    await openHqPlayerWorkspace();

    fireEvent.click(await screen.findByRole('button', { name: /检测 HQPlayer/u }));

    await waitFor(() => expect(bridge.hqPlayer.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        connectionMode: 'localDesktop',
        host: '127.0.0.1',
        port: 4321,
        defaultPlaybackBackend: 'echoNative',
      }),
    ));
    expect(bridge.hqPlayer.testConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        host: '127.0.0.1',
        port: 4321,
      }),
    );
  });

  it('keeps the HQPlayer setup visible while disabled and switches the power label after enabling', async () => {
    const bridge = installEchoBridge(hqStatus('disabled'), {
      ...hqSettings,
      enabled: false,
    });
    const { container } = renderConnectPage();
    await openHqPlayerWorkspace();

    await waitFor(() => expect(container.querySelector('.connect-hqp-workspace')).toBeTruthy());
    expect(screen.getByText('先启用 HQPlayer，再检测本机或远程 Desktop。')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '启用 HQPlayer' }));

    await waitFor(() => expect(bridge.hqPlayer.setSettings).toHaveBeenCalledWith(expect.objectContaining({ enabled: true })));
    await waitFor(() => expect(screen.getByRole('button', { name: '停用 HQPlayer' })).toBeTruthy());
  });

  it('shows read-only HQPlayer probe details in the diagnostics area', async () => {
    installEchoBridge({
      ...hqStatus('available'),
      controlInfo: {
        name: 'Living Room',
        product: 'HQPlayer Desktop',
        version: '5.17.2',
        platform: 'Windows',
        engine: '5.29.2',
        receivedAt: '2026-05-21T01:00:00.000Z',
      },
      playbackStatus: {
        state: 'playing',
        stateCode: 2,
        track: 1,
        trackId: 'track-1',
        tracksTotal: 1,
        queued: false,
        positionSeconds: 12,
        durationSeconds: 180,
        volume: -3,
        activeMode: 'poly-sinc',
        activeFilter: 'sinc-M',
        activeShaper: 'ASDM7',
        activeRate: 2822400,
        activeBits: 1,
        activeChannels: 2,
        inputFill: 0.5,
        outputFill: 0.7,
        outputDelayUs: 12000,
        apodizing: 1,
        metadata: null,
        receivedAt: '2026-05-21T01:00:00.000Z',
      },
    });
    renderConnectPage();
    await openHqPlayerWorkspace();

    await screen.findByText('HQPlayer Desktop 5.17.2');
    expect(screen.getByText('5.29.2')).toBeTruthy();
    expect(screen.getByText('投送中 · 0:12 / 3:00')).toBeTruthy();
    expect(screen.getAllByText(/2822400Hz/u).length).toBeGreaterThan(0);
  });

  it('keeps enabled local HQPlayer passive until the user manually tests it', async () => {
    const bridge = installEchoBridge(hqStatus('unavailable'), hqSettings);
    renderConnectPage();

    await screen.findByText('HQPlayer Desktop');
    await waitFor(() => expect(bridge.hqPlayer.getStatus).toHaveBeenCalled());
    expect(bridge.hqPlayer.testConnection).not.toHaveBeenCalled();
  });

  it('stops the active HQPlayer session when HQPlayer is disabled', async () => {
    const bridge = installEchoBridge(hqStatus('available'), hqSettings, hqPlayerConnectStatus);
    renderConnectPage();
    await openHqPlayerWorkspace();

    fireEvent.click(screen.getByRole('button', { name: '停用 HQPlayer' }));

    await waitFor(() => expect(bridge.connect.disconnect).toHaveBeenCalled());
    await waitFor(() => expect(bridge.hqPlayer.setSettings).toHaveBeenCalledWith(expect.objectContaining({ enabled: false })));
  });

  it('disables unsupported transport controls while HQPlayer is the active output', async () => {
    installEchoBridge(hqStatus('available'), hqSettings, hqPlayerConnectStatus);
    renderConnectPage();

    await screen.findByRole('heading', { name: 'HQPlayer Desktop', level: 3 });

    const controls = screen.getByLabelText('Connect 控制');
    expect((within(controls).getByRole('button', { name: '播放' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(controls).getByRole('button', { name: '暂停' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(controls).getByRole('button', { name: '停止' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(controls).getByRole('button', { name: '断开' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
