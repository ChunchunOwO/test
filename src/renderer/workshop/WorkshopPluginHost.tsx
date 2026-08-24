import { Bot, Blocks, ChevronRight, LayoutGrid, Play, Radio, Search, SlidersHorizontal, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  WorkshopPluginCapability,
  WorkshopAutomationRule,
  WorkshopPluginAgentSummary,
  WorkshopPluginPanelSummary,
  WorkshopPluginResolvedSource,
  WorkshopPluginSourceProviderSummary,
  WorkshopPluginSourceSearchResult,
  WorkshopPluginSourceTrack,
  WorkshopPluginSummary,
} from '../../shared/types/workshop';
import type { PluginCoverCandidate, PluginMetadataCandidate } from '../../shared/types/plugins';
import { useOptionalPlaybackQueue } from '../stores/PlaybackQueueProvider';
import { useThrottledSharedPlaybackStatus } from '../stores/playbackStatusStore';
import {
  getWorkshopPluginDirectSourceOrigin,
  runWorkshopPluginMediaAction,
  sanitizeWorkshopPluginTrack,
  snapshotWorkshopPluginQueue,
} from './WorkshopPluginMediaBridge';
import { WorkshopPluginSettingsDialog } from './WorkshopPluginSettingsDialog';
import { WorkshopSourceProviderDialog } from './WorkshopSourceProviderDialog';
import { WorkshopContributionManager } from './WorkshopContributionManager';
import {
  isWorkshopContributionVisible,
  readWorkshopContributionPreferences,
  sortWorkshopContributions,
  workshopContributionKey,
  workshopContributionPreferencesChangedEvent,
} from './WorkshopContributionPreferences';
import {
  sanitizeWorkshopResolvedSource,
  sanitizeWorkshopSourceSearchRequest,
  sanitizeWorkshopSourceSearchResult,
} from './WorkshopSourceProviderRuntime';
import {
  publishWorkshopLyricsProviders,
  workshopLyricsProviderKey,
  type WorkshopLyricsProviderCandidate,
  type WorkshopLyricsProviderDescriptor,
  type WorkshopLyricsProviderRequest,
} from './WorkshopLyricsProviderRegistry';
import {
  readWorkshopPluginSettings,
  runWorkshopPluginStorageAction,
  writeWorkshopPluginSetting,
} from './WorkshopPluginStorage';
import { publishWorkshopTrackContextActions } from './WorkshopTrackContextActions';
import { publishWorkshopTrackProviders } from './WorkshopTrackProviderRegistry';
import { publishWorkshopPlayerBarActions } from './WorkshopPlayerBarActions';
import { isShortcutTextTarget } from '../utils/shortcutAccelerator';
import { readWorkshopAutomationRules, workshopAutomationsChangedEvent } from './WorkshopAutomationStore';
import { recordWorkshopDiagnostic } from './WorkshopDiagnosticsStore';
import '../styles/workshop-plugin-host.css';

const bridgeChannel = 'echo:workshop-plugin';
const bridgeVersion = 1;
const maximumRequestsPerSecond = 20;
const maximumAgentInputLength = 4_000;
const maximumAgentInputBytes = 16 * 1024;
const maximumAgentResultBytes = 32 * 1024;
const maximumLyricsResultBytes = 256 * 1024;
const maximumLyricsCandidates = 24;
const maximumTrackProviderResultBytes = 64 * 1024;
const maximumTrackProviderCandidates = 24;

type FrameRegistration = {
  plugin: WorkshopPluginSummary;
  frame: HTMLIFrameElement;
  kind: 'runtime' | 'panel';
};

type RegisteredCommand = {
  plugin: WorkshopPluginSummary;
  commandId: string;
  ready: boolean;
};

type RegisteredAgent = {
  plugin: WorkshopPluginSummary;
  agent: WorkshopPluginAgentSummary;
  ready: boolean;
};

type RegisteredSourceProvider = {
  plugin: WorkshopPluginSummary;
  provider: WorkshopPluginSourceProviderSummary;
  ready: boolean;
};

const capabilityByAction: Record<string, WorkshopPluginCapability | null> = {
  'navigation:open': 'navigation',
  'playback:getStatus': 'playback:read',
  'playback:play': 'playback:control',
  'playback:pause': 'playback:control',
  'playback:seek': 'playback:control',
  'playback:getShareInfo': 'playback:share',
  'playback:shareCurrentTrack': 'playback:share',
  'playback:getShareTask': 'playback:share',
  'playback:playUrl': 'playback:share',
  'audio:getSpectrum': 'audio:spectrum',
  'library:getSummary': 'library:read',
  'library:getTracks': 'library:read',
  'library:getAlbums': 'library:read',
  'library:getAlbumTracks': 'library:read',
  'library:getArtists': 'library:read',
  'library:getArtistTracks': 'library:read',
  'library:getArtistAlbums': 'library:read',
  'library:getGenres': 'library:read',
  'library:getGenreTracks': 'library:read',
  'library:getGenreAlbums': 'library:read',
  'library:getPlaylists': 'library:read',
  'library:getPlaylistItems': 'library:read',
  'library:getLikedTracks': 'library:read',
  'library:getLikedTrackIds': 'library:read',
  'library:toggleTrackLiked': 'library:control',
  'library:toggleAlbumLiked': 'library:control',
  'library:createPlaylist': 'library:control',
  'library:addTracksToPlaylist': 'library:control',
  'queue:get': 'queue:read',
  'queue:playTrack': 'queue:control',
  'queue:enqueueTrack': 'queue:control',
  'queue:playItem': 'queue:control',
  'queue:removeItem': 'queue:control',
  'queue:clear': 'queue:control',
  'source-provider:search': 'sources:provide',
  'source-provider:resolve': 'sources:provide',
  'sources:playDirect': 'sources:direct',
  'network:request': 'network:request',
  'agent:run': 'agent:runtime',
  'settings:get': 'fs:plugin',
  'settings:set': 'fs:plugin',
  'storage:get': 'fs:plugin',
  'storage:set': 'fs:plugin',
  'storage:remove': 'fs:plugin',
  'ui:notify': null,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const readNumber = (value: unknown, minimum: number, maximum: number): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : null;

const sanitizePlaybackStatus = (status: Awaited<ReturnType<NonNullable<Window['echo']>['playback']['getStatus']>>) => ({
  state: status.state,
  currentTrackId: status.currentTrackId,
  positionSeconds: Math.max(0, status.positionMs / 1000),
  durationSeconds: Math.max(0, status.durationMs / 1000),
  volume: typeof status.volume === 'number' ? status.volume : null,
});

const pluginRuntimeKey = (plugin: WorkshopPluginSummary): string =>
  `${plugin.sourceId}:${plugin.itemId}:${plugin.pluginId}:${plugin.version}`;

const postToFrame = (frame: HTMLIFrameElement, message: unknown): void =>
  frame.contentWindow?.postMessage(message, '*');

const sanitizeAgentResult = (value: unknown): unknown => {
  const serialized = JSON.stringify(value);
  if (serialized === undefined || new TextEncoder().encode(serialized).byteLength > maximumAgentResultBytes) {
    throw new Error('agent-result-too-large');
  }
  return JSON.parse(serialized) as unknown;
};

const sanitizeAgentInput = (value: unknown): unknown => {
  if (typeof value === 'string') return value.slice(0, maximumAgentInputLength);
  const serialized = JSON.stringify(value);
  if (serialized === undefined || new TextEncoder().encode(serialized).byteLength > maximumAgentInputBytes) {
    throw new Error('agent-input-too-large');
  }
  return JSON.parse(serialized) as unknown;
};

const sanitizeOptionalText = (value: unknown, maximumLength: number): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, maximumLength) : undefined;

const sanitizeLyricsProviderResult = (value: unknown): WorkshopLyricsProviderCandidate[] => {
  const serialized = JSON.stringify(value);
  if (serialized === undefined || new TextEncoder().encode(serialized).byteLength > maximumLyricsResultBytes) {
    throw new Error('lyrics-provider-result-too-large');
  }
  const normalized = JSON.parse(serialized) as unknown;
  const rawCandidates = isRecord(normalized) && Array.isArray(normalized.candidates)
    ? normalized.candidates
    : [];
  return rawCandidates.slice(0, maximumLyricsCandidates).flatMap((candidate, index) => {
    if (!isRecord(candidate)) return [];
    const lrc = sanitizeOptionalText(candidate.lrc, 180_000);
    const text = sanitizeOptionalText(candidate.text, 180_000);
    if (!lrc && !text) return [];
    const confidence = typeof candidate.confidence === 'number' && Number.isFinite(candidate.confidence)
      ? Math.max(0, Math.min(1, candidate.confidence))
      : undefined;
    return [{
      id: `workshop-lyrics-${index}`,
      ...(sanitizeOptionalText(candidate.title, 180) ? { title: sanitizeOptionalText(candidate.title, 180) } : {}),
      ...(sanitizeOptionalText(candidate.language, 48) ? { language: sanitizeOptionalText(candidate.language, 48) } : {}),
      ...(lrc ? { lrc } : {}),
      ...(text ? { text } : {}),
      ...(sanitizeOptionalText(candidate.source, 120) ? { source: sanitizeOptionalText(candidate.source, 120) } : {}),
      ...(sanitizeOptionalText(candidate.sourceUrl, 2_048) ? { sourceUrl: sanitizeOptionalText(candidate.sourceUrl, 2_048) } : {}),
      ...(confidence === undefined ? {} : { confidence }),
    }];
  });
};

const assertTrackProviderResult = (value: unknown): unknown => {
  const serialized = JSON.stringify(value);
  if (serialized === undefined || new TextEncoder().encode(serialized).byteLength > maximumTrackProviderResultBytes) {
    throw new Error('track-provider-result-too-large');
  }
  return JSON.parse(serialized) as unknown;
};

const sanitizeMetadataProviderResult = (value: unknown): PluginMetadataCandidate[] => {
  const input = assertTrackProviderResult(value);
  const candidates = isRecord(input) && Array.isArray(input.candidates) ? input.candidates : [];
  return candidates.slice(0, maximumTrackProviderCandidates).flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const output: PluginMetadataCandidate = {};
    for (const key of ['title', 'artist', 'album', 'albumArtist', 'genre', 'source', 'sourceUrl'] as const) {
      const text = sanitizeOptionalText(candidate[key], key === 'sourceUrl' ? 2_048 : 180);
      if (text) output[key] = text;
    }
    for (const [key, maximum] of [['year', 9999], ['trackNo', 9999], ['discNo', 999], ['bpm', 1_000]] as const) {
      const number = readNumber(candidate[key], 0, maximum);
      if (number !== null) output[key] = number;
    }
    if (typeof candidate.confidence === 'number' && Number.isFinite(candidate.confidence)) {
      output.confidence = Math.max(0, Math.min(1, candidate.confidence));
    }
    return Object.keys(output).length > 0 ? [output] : [];
  });
};

const sanitizeCoverProviderResult = (value: unknown): PluginCoverCandidate[] => {
  const input = assertTrackProviderResult(value);
  const candidates = isRecord(input) && Array.isArray(input.candidates) ? input.candidates : [];
  return candidates.slice(0, maximumTrackProviderCandidates).flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const imageUrl = sanitizeOptionalText(candidate.imageUrl, 2_048);
    if (!imageUrl) return [];
    try {
      const url = new URL(imageUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return [];
    } catch {
      return [];
    }
    const output: PluginCoverCandidate = { imageUrl };
    for (const key of ['title', 'source', 'sourceUrl'] as const) {
      const text = sanitizeOptionalText(candidate[key], key === 'sourceUrl' ? 2_048 : 180);
      if (text) output[key] = text;
    }
    const width = readNumber(candidate.width, 1, 12_000);
    const height = readNumber(candidate.height, 1, 12_000);
    if (width !== null) output.width = Math.round(width);
    if (height !== null) output.height = Math.round(height);
    if (typeof candidate.confidence === 'number' && Number.isFinite(candidate.confidence)) {
      output.confidence = Math.max(0, Math.min(1, candidate.confidence));
    }
    return [output];
  });
};

export const WorkshopPluginHost = (): JSX.Element | null => {
  const playbackQueue = useOptionalPlaybackQueue();
  const playbackSnapshot = useThrottledSharedPlaybackStatus(80);
  const [plugins, setPlugins] = useState<WorkshopPluginSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [dockQuery, setDockQuery] = useState('');
  const [activePanel, setActivePanel] = useState<{ plugin: WorkshopPluginSummary; panel: WorkshopPluginPanelSummary } | null>(null);
  const [managingContributions, setManagingContributions] = useState(false);
  const [contributionRevision, setContributionRevision] = useState(0);
  const [activeRouteId, setActiveRouteId] = useState('home');
  const [activeAgent, setActiveAgent] = useState<RegisteredAgent | null>(null);
  const [activeSourceProvider, setActiveSourceProvider] = useState<RegisteredSourceProvider | null>(null);
  const [activeSettings, setActiveSettings] = useState<WorkshopPluginSummary | null>(null);
  const [agentInput, setAgentInput] = useState('');
  const [agentResult, setAgentResult] = useState<string | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [registered, setRegistered] = useState<Record<string, boolean>>({});
  const [automationRevision, setAutomationRevision] = useState(0);
  const runtimeFrames = useRef(new Map<string, HTMLIFrameElement>());
  const panelFrame = useRef<HTMLIFrameElement>(null);
  const rateLimits = useRef(new WeakMap<Window, { startedAt: number; count: number }>());
  const invocations = useRef(new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: number }>());
  const automationLastRun = useRef(new Map<string, number>());
  const automationAudioState = useRef<{ state: string; trackId: string | null; device: string } | null>(null);
  const automationQueueSignature = useRef<string | null>(null);
  const directSourceApprovals = useRef(new Set<string>());

  const enabledPlugins = useMemo(() => plugins.filter((plugin) => plugin.enabled && !plugin.error), [plugins]);
  const visibleContribution = useCallback((plugin: WorkshopPluginSummary, kind: Parameters<typeof isWorkshopContributionVisible>[1], id: string) =>
    isWorkshopContributionVisible(plugin, kind, id), [contributionRevision]);
  const commandItems = useMemo(() => enabledPlugins.flatMap((plugin) => plugin.commands.map((command): RegisteredCommand => ({
    plugin,
    commandId: command.id,
    ready: registered[`${pluginRuntimeKey(plugin)}:${command.id}`] === true,
  })).filter((item) => visibleContribution(item.plugin, 'command', item.commandId))), [enabledPlugins, registered, visibleContribution]);
  const panelItems = useMemo(() => enabledPlugins.flatMap((plugin) => {
    const preferences = readWorkshopContributionPreferences(plugin);
    return sortWorkshopContributions(plugin.panels
      .filter((panel) => visibleContribution(plugin, 'panel', panel.id))
      .map((panel) => ({ plugin, panel, key: workshopContributionKey('panel', panel.id) })), preferences);
  }), [enabledPlugins, visibleContribution]);
  const agentItems = useMemo(() => enabledPlugins.flatMap((plugin) => plugin.agents.map((agent): RegisteredAgent => ({
    plugin,
    agent,
    ready: registered[`${pluginRuntimeKey(plugin)}:agent:${agent.id}`] === true,
  })).filter((item) => visibleContribution(item.plugin, 'agent', item.agent.id))), [enabledPlugins, registered, visibleContribution]);
  const sourceProviderItems = useMemo(() => enabledPlugins.flatMap((plugin) => (plugin.sourceProviders ?? []).map(
    (provider): RegisteredSourceProvider => ({
      plugin,
      provider,
      ready: registered[`${pluginRuntimeKey(plugin)}:source:${provider.id}`] === true,
    }),
  ).filter((item) => visibleContribution(item.plugin, 'source-provider', item.provider.id))), [enabledPlugins, registered, visibleContribution]);
  const slottedPanels = useMemo(() => panelItems.filter(({ panel }) => {
    if (panel.placement === 'sidebar' || panel.placement === 'player') return true;
    if (panel.placement === 'track-detail') return ['songs', 'albums', 'artists', 'playlists'].includes(activeRouteId);
    return panel.placement === activeRouteId;
  }), [activeRouteId, panelItems]);
  const normalizedDockQuery = dockQuery.trim().toLocaleLowerCase();
  const dockItemMatches = useCallback((pluginName: string, title: string, kind: string): boolean =>
    !normalizedDockQuery || `${pluginName} ${title} ${kind}`.toLocaleLowerCase().includes(normalizedDockQuery),
  [normalizedDockQuery]);

  useEffect(() => {
    const syncRoute = (): void => {
      setActiveRouteId(document.querySelector<HTMLElement>('.app-shell')?.dataset.activeRoute ?? 'home');
    };
    syncRoute();
    const appShell = document.querySelector<HTMLElement>('.app-shell');
    const observer = appShell ? new MutationObserver(syncRoute) : null;
    if (appShell && observer) observer.observe(appShell, { attributes: true, attributeFilter: ['data-active-route'] });
    return () => observer?.disconnect();
  }, []);

  useEffect(() => {
    const refreshPreferences = (): void => setContributionRevision((value) => value + 1);
    window.addEventListener(workshopContributionPreferencesChangedEvent, refreshPreferences);
    return () => window.removeEventListener(workshopContributionPreferencesChangedEvent, refreshPreferences);
  }, []);

  useEffect(() => {
    const refreshAutomations = (): void => setAutomationRevision((value) => value + 1);
    window.addEventListener(workshopAutomationsChangedEvent, refreshAutomations);
    return () => window.removeEventListener(workshopAutomationsChangedEvent, refreshAutomations);
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const snapshot = await window.echo?.workshop?.getPlugins?.();
      const next = snapshot?.plugins ?? [];
      setPlugins(next);
      next.forEach((plugin) => {
        if (plugin.error) recordWorkshopDiagnostic({ level: 'error', plugin, category: 'lifecycle', message: plugin.error });
      });
    } catch {
      setPlugins([]);
      recordWorkshopDiagnostic({ level: 'error', category: 'lifecycle', message: 'plugin-snapshot-unavailable' });
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && open) {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.ctrlKey && event.shiftKey && event.code === 'KeyP' && !isShortcutTextTarget(event)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const findFrame = useCallback((source: MessageEventSource | null): FrameRegistration | null => {
    for (const plugin of enabledPlugins) {
      const frame = runtimeFrames.current.get(pluginRuntimeKey(plugin));
      if (frame?.contentWindow === source) return { plugin, frame, kind: 'runtime' };
    }
    if (activePanel && panelFrame.current?.contentWindow === source) {
      return { plugin: activePanel.plugin, frame: panelFrame.current, kind: 'panel' };
    }
    return null;
  }, [activePanel, enabledPlugins]);

  const postPluginEvent = useCallback((
    plugin: WorkshopPluginSummary,
    eventName: string,
    payload: unknown,
  ): void => {
    const message = {
      channel: bridgeChannel,
      version: bridgeVersion,
      type: 'event',
      eventName,
      payload,
    };
    const runtimeFrame = runtimeFrames.current.get(pluginRuntimeKey(plugin));
    if (runtimeFrame) postToFrame(runtimeFrame, message);
    if (activePanel && pluginRuntimeKey(activePanel.plugin) === pluginRuntimeKey(plugin) && panelFrame.current) {
      postToFrame(panelFrame.current, message);
    }
  }, [activePanel]);

  const invokeAgent = useCallback(async (
    plugin: WorkshopPluginSummary,
    agentId: string,
    input: unknown,
  ): Promise<unknown> => {
    const frame = runtimeFrames.current.get(pluginRuntimeKey(plugin));
    if (!frame || registered[`${pluginRuntimeKey(plugin)}:agent:${agentId}`] !== true) {
      throw new Error('agent-not-ready');
    }
    const normalizedInput = sanitizeAgentInput(input);
    const invocationId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const startedAt = performance.now();
    const value = await new Promise<unknown>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        invocations.current.delete(invocationId);
        reject(new Error('agent-timeout'));
      }, 15_000);
      invocations.current.set(invocationId, { resolve, reject, timer });
      postToFrame(frame, {
        channel: bridgeChannel,
        version: bridgeVersion,
        type: 'invoke-agent',
        invocationId,
        agentId,
        input: normalizedInput,
      });
    });
    recordWorkshopDiagnostic({ plugin, category: 'agent', message: agentId, durationMs: performance.now() - startedAt });
    return sanitizeAgentResult(value);
  }, [registered]);

  const invokeLyricsProvider = useCallback(async (
    plugin: WorkshopPluginSummary,
    providerId: string,
    request: WorkshopLyricsProviderRequest,
  ): Promise<WorkshopLyricsProviderCandidate[]> => {
    const frame = runtimeFrames.current.get(pluginRuntimeKey(plugin));
    if (!frame || registered[`${pluginRuntimeKey(plugin)}:lyrics:${providerId}`] !== true) {
      throw new Error('lyrics-provider-not-ready');
    }
    const invocationId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const value = await new Promise<unknown>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        invocations.current.delete(invocationId);
        reject(new Error('lyrics-provider-timeout'));
      }, 12_000);
      invocations.current.set(invocationId, { resolve, reject, timer });
      postToFrame(frame, {
        channel: bridgeChannel,
        version: bridgeVersion,
        type: 'invoke-lyrics-provider',
        invocationId,
        providerId,
        request,
      });
    });
    return sanitizeLyricsProviderResult(value);
  }, [registered]);

  const invokeTrackProvider = useCallback(async (
    plugin: WorkshopPluginSummary,
    providerId: string,
    kind: 'metadata' | 'cover',
    request: unknown,
  ): Promise<PluginMetadataCandidate[] | PluginCoverCandidate[]> => {
    const frame = runtimeFrames.current.get(pluginRuntimeKey(plugin));
    if (!frame || registered[`${pluginRuntimeKey(plugin)}:${kind}:${providerId}`] !== true) {
      throw new Error(`${kind}-provider-not-ready`);
    }
    const invocationId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const value = await new Promise<unknown>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        invocations.current.delete(invocationId);
        reject(new Error(`${kind}-provider-timeout`));
      }, 12_000);
      invocations.current.set(invocationId, { resolve, reject, timer });
      postToFrame(frame, {
        channel: bridgeChannel,
        version: bridgeVersion,
        type: `invoke-${kind}-provider`,
        invocationId,
        providerId,
        request,
      });
    });
    return kind === 'metadata'
      ? sanitizeMetadataProviderResult(value)
      : sanitizeCoverProviderResult(value);
  }, [registered]);

  useEffect(() => {
    publishWorkshopTrackProviders({
      metadataProviders: enabledPlugins.flatMap((plugin) => (plugin.metadataProviders ?? [])
        .filter((provider) => visibleContribution(plugin, 'metadata-provider', provider.id)).map((provider) => ({
        key: `${pluginRuntimeKey(plugin)}:metadata:${provider.id}`,
        pluginName: plugin.name,
        providerId: provider.id,
        title: provider.title,
        description: provider.description,
        ready: registered[`${pluginRuntimeKey(plugin)}:metadata:${provider.id}`] === true,
        lookup: (request) => invokeTrackProvider(plugin, provider.id, 'metadata', request) as Promise<PluginMetadataCandidate[]>,
      }))),
      coverProviders: enabledPlugins.flatMap((plugin) => (plugin.coverProviders ?? [])
        .filter((provider) => visibleContribution(plugin, 'cover-provider', provider.id)).map((provider) => ({
        key: `${pluginRuntimeKey(plugin)}:cover:${provider.id}`,
        pluginName: plugin.name,
        providerId: provider.id,
        title: provider.title,
        description: provider.description,
        ready: registered[`${pluginRuntimeKey(plugin)}:cover:${provider.id}`] === true,
        lookup: (request) => invokeTrackProvider(plugin, provider.id, 'cover', request) as Promise<PluginCoverCandidate[]>,
      }))),
    });
  }, [enabledPlugins, invokeTrackProvider, registered, visibleContribution]);

  useEffect(() => () => publishWorkshopTrackProviders({ metadataProviders: [], coverProviders: [] }), []);

  const invokeSourceProvider = useCallback(async (
    plugin: WorkshopPluginSummary,
    providerId: string,
    operation: 'search' | 'resolve',
    request: unknown,
  ): Promise<WorkshopPluginSourceSearchResult | WorkshopPluginResolvedSource> => {
    const frame = runtimeFrames.current.get(pluginRuntimeKey(plugin));
    if (!frame || registered[`${pluginRuntimeKey(plugin)}:source:${providerId}`] !== true) {
      throw new Error('source-provider-not-ready');
    }
    let normalizedRequest: unknown;
    if (operation === 'search') {
      normalizedRequest = sanitizeWorkshopSourceSearchRequest(request);
    } else {
      const providerTrackId = typeof request === 'string' ? request.trim().slice(0, 512) : '';
      if (!providerTrackId) throw new Error('source-provider-invalid-track');
      normalizedRequest = { providerTrackId };
    }
    const invocationId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const value = await new Promise<unknown>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        invocations.current.delete(invocationId);
        reject(new Error('source-provider-timeout'));
      }, 12_000);
      invocations.current.set(invocationId, { resolve, reject, timer });
      postToFrame(frame, {
        channel: bridgeChannel,
        version: bridgeVersion,
        type: 'invoke-source-provider',
        invocationId,
        providerId,
        operation,
        request: normalizedRequest,
      });
    });
    return operation === 'search'
      ? sanitizeWorkshopSourceSearchResult(value)
      : sanitizeWorkshopResolvedSource(value);
  }, [registered]);

  const playApprovedDirectSource = useCallback(async (
    plugin: WorkshopPluginSummary,
    payload: Record<string, unknown>,
  ): Promise<unknown> => {
    const origin = getWorkshopPluginDirectSourceOrigin(payload);
    const approvalKey = `${pluginRuntimeKey(plugin)}:${origin}`;
    if (!directSourceApprovals.current.has(approvalKey)) {
      const approved = window.confirm(
        `“${plugin.name}”请求播放来自 ${origin} 的直链音源。ECHO 不会发送 Cookie 或自定义请求头。允许本次会话使用这个来源？`,
      );
      if (!approved) throw new Error('direct-source-denied');
      directSourceApprovals.current.add(approvalKey);
    }
    return runWorkshopPluginMediaAction('sources:playDirect', payload, playbackQueue);
  }, [playbackQueue]);

  useEffect(() => {
    const descriptors = enabledPlugins.flatMap((plugin) => (plugin.lyricsProviders ?? [])
      .filter((provider) => visibleContribution(plugin, 'lyrics-provider', provider.id)).map(
      (provider): WorkshopLyricsProviderDescriptor => ({
        ...provider,
        key: workshopLyricsProviderKey(plugin, provider.id),
        pluginId: plugin.pluginId,
        pluginName: plugin.name,
        sourceId: plugin.sourceId,
        itemId: plugin.itemId,
        ready: registered[`${pluginRuntimeKey(plugin)}:lyrics:${provider.id}`] === true,
      }),
    ));
    return publishWorkshopLyricsProviders(descriptors, (provider, request) => {
      const plugin = enabledPlugins.find((entry) =>
        entry.sourceId === provider.sourceId && entry.itemId === provider.itemId && entry.pluginId === provider.pluginId);
      if (!plugin) throw new Error('lyrics-provider-unavailable');
      return invokeLyricsProvider(plugin, provider.id, request);
    });
  }, [enabledPlugins, invokeLyricsProvider, registered, visibleContribution]);

  const runHostAction = useCallback(async (
    registration: FrameRegistration,
    action: string,
    payload: Record<string, unknown>,
  ): Promise<unknown> => {
    if (!(action in capabilityByAction)) throw new Error('action-unavailable');
    const capability = capabilityByAction[action];
    if (capability && !registration.plugin.permissions.includes(capability)) throw new Error('capability-denied');
    if (action.startsWith('storage:')) return runWorkshopPluginStorageAction(registration.plugin, action, payload);
    if (action === 'settings:get') {
      const values = readWorkshopPluginSettings(registration.plugin);
      if (payload.settingId === undefined) return values;
      const settingId = typeof payload.settingId === 'string' ? payload.settingId : '';
      if (!registration.plugin.settings.some((setting) => setting.id === settingId)) throw new Error('setting-undeclared');
      return values[settingId];
    }
    if (action === 'settings:set') {
      const values = writeWorkshopPluginSetting(registration.plugin, payload.settingId, payload.value);
      postPluginEvent(registration.plugin, 'settings:changed', values);
      return values;
    }
    if (action === 'ui:notify') {
      const message = typeof payload.message === 'string' ? payload.message.trim().slice(0, 240) : '';
      if (!message) throw new Error('invalid-payload');
      setNotice(`${registration.plugin.name}：${message}`);
      return null;
    }
    if (action === 'audio:getSpectrum') {
      const levels = playbackSnapshot.audioStatus?.audioLevels;
      return {
        bands: Array.from(levels?.visualSpectrum ?? []).slice(0, 128),
        energy: typeof levels?.visualEnergy === 'number' ? levels.visualEnergy : 0,
        transient: typeof levels?.visualTransient === 'number' ? levels.visualTransient : 0,
        state: levels?.visualTelemetryState ?? 'none',
      };
    }
    if (action === 'agent:run') {
      const agentId = typeof payload.agentId === 'string' ? payload.agentId : '';
      if (!registration.plugin.agents.some((agent) => agent.id === agentId)) throw new Error('agent-undeclared');
      return invokeAgent(registration.plugin, agentId, payload.input);
    }
    if (action === 'source-provider:search' || action === 'source-provider:resolve') {
      const providerId = typeof payload.providerId === 'string' ? payload.providerId : '';
      if (!(registration.plugin.sourceProviders ?? []).some((provider) => provider.id === providerId)) {
        throw new Error('source-provider-undeclared');
      }
      return invokeSourceProvider(
        registration.plugin,
        providerId,
        action === 'source-provider:search' ? 'search' : 'resolve',
        action === 'source-provider:search' ? payload : payload.providerTrackId,
      );
    }
    if (action === 'playback:getShareInfo') {
      const bridge = window.echo?.workshop;
      if (!bridge) throw new Error('share-unavailable');
      return bridge.getPluginShareInfo({
        sourceId: registration.plugin.sourceId,
        itemId: registration.plugin.itemId,
      });
    }
    if (action === 'playback:shareCurrentTrack') {
      const bridge = window.echo?.workshop;
      const uploadUrl = typeof payload.uploadUrl === 'string' ? payload.uploadUrl.trim().slice(0, 2_048) : '';
      if (!bridge || !uploadUrl) throw new Error('invalid-payload');
      let destination: URL;
      try {
        destination = new URL(uploadUrl);
      } catch {
        throw new Error('invalid-payload');
      }
      const info = await bridge.getPluginShareInfo({
        sourceId: registration.plugin.sourceId,
        itemId: registration.plugin.itemId,
      });
      if (!info.available || !info.track) throw new Error(info.reason ?? 'share-unavailable');
      if (!window.confirm(
        `“${registration.plugin.name}”请求把当前歌曲“${info.track.title}”上传到 ${destination.origin}，用于一起听。允许这一次上传？`,
      )) {
        throw new Error('share-denied');
      }
      const headers = isRecord(payload.headers)
        ? Object.fromEntries(Object.entries(payload.headers).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
        : undefined;
      return bridge.sharePluginCurrentTrack({
        sourceId: registration.plugin.sourceId,
        itemId: registration.plugin.itemId,
        uploadUrl,
        ...(typeof payload.roomId === 'string' ? { roomId: payload.roomId } : {}),
        ...(headers ? { headers } : {}),
      });
    }
    if (action === 'playback:getShareTask') {
      const bridge = window.echo?.workshop;
      const taskId = typeof payload.taskId === 'string' ? payload.taskId.trim().slice(0, 120) : '';
      if (!bridge || !taskId) throw new Error('invalid-payload');
      return bridge.getPluginShareTask({
        sourceId: registration.plugin.sourceId,
        itemId: registration.plugin.itemId,
        taskId,
      });
    }
    if (action === 'sources:playDirect' || action === 'playback:playUrl') {
      return playApprovedDirectSource(registration.plugin, payload);
    }
    if (action === 'network:request') {
      const bridge = window.echo?.workshop;
      if (!bridge) throw new Error('network-unavailable');
      return bridge.requestPluginNetwork({
        sourceId: registration.plugin.sourceId,
        itemId: registration.plugin.itemId,
        url: typeof payload.url === 'string' ? payload.url : '',
        ...(payload.method === 'GET' || payload.method === 'POST' ? { method: payload.method } : {}),
        ...(isRecord(payload.headers)
          ? { headers: Object.fromEntries(Object.entries(payload.headers).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) }
          : {}),
        ...(typeof payload.body === 'string' ? { body: payload.body } : {}),
      });
    }
    if (action === 'navigation:open' || action.startsWith('library:') || action.startsWith('queue:')) {
      return runWorkshopPluginMediaAction(action, payload, playbackQueue);
    }
    const playback = window.echo?.playback;
    if (action === 'playback:getStatus') {
      if (!playback) throw new Error('playback-unavailable');
      return sanitizePlaybackStatus(await playback.getStatus());
    }
    if (action === 'playback:play' || action === 'playback:pause') {
      if (!playback) throw new Error('playback-unavailable');
      await playback[action === 'playback:play' ? 'play' : 'pause']();
      return null;
    }
    if (action === 'playback:seek') {
      const positionSeconds = readNumber(payload.positionSeconds, 0, 7 * 24 * 60 * 60);
      if (!playback || positionSeconds === null) throw new Error('invalid-payload');
      await playback.seek(positionSeconds);
      return null;
    }
    throw new Error('action-unavailable');
  }, [invokeAgent, invokeSourceProvider, playbackQueue, playbackSnapshot.audioStatus?.audioLevels, playApprovedDirectSource, postPluginEvent]);

  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      if (!isRecord(event.data) || event.data.channel !== bridgeChannel || event.data.version !== bridgeVersion) return;
      const registration = findFrame(event.source);
      if (!registration) return;
      const message = event.data;
      if (message.type === 'register-command') {
        const commandId = typeof message.commandId === 'string' ? message.commandId : '';
        if (registration.kind === 'runtime' && registration.plugin.commands.some((command) => command.id === commandId)) {
          setRegistered((current) => ({ ...current, [`${pluginRuntimeKey(registration.plugin)}:${commandId}`]: true }));
          recordWorkshopDiagnostic({ plugin: registration.plugin, category: 'registration', message: `command:${commandId}` });
        }
        return;
      }
      if (message.type === 'register-agent') {
        const agentId = typeof message.agentId === 'string' ? message.agentId : '';
        if (registration.kind === 'runtime' && registration.plugin.agents.some((agent) => agent.id === agentId)) {
          setRegistered((current) => ({ ...current, [`${pluginRuntimeKey(registration.plugin)}:agent:${agentId}`]: true }));
          recordWorkshopDiagnostic({ plugin: registration.plugin, category: 'registration', message: `agent:${agentId}` });
        }
        return;
      }
      if (message.type === 'register-lyrics-provider') {
        const providerId = typeof message.providerId === 'string' ? message.providerId : '';
        if (registration.kind === 'runtime'
          && registration.plugin.permissions.includes('lyrics:provide')
          && (registration.plugin.lyricsProviders ?? []).some((provider) => provider.id === providerId)) {
          setRegistered((current) => ({
            ...current,
            [`${pluginRuntimeKey(registration.plugin)}:lyrics:${providerId}`]: true,
          }));
        }
        return;
      }
      if (message.type === 'register-metadata-provider' || message.type === 'register-cover-provider') {
        const kind = message.type === 'register-metadata-provider' ? 'metadata' : 'cover';
        const providerId = typeof message.providerId === 'string' ? message.providerId : '';
        const declared = kind === 'metadata'
          ? registration.plugin.metadataProviders ?? []
          : registration.plugin.coverProviders ?? [];
        if (registration.kind === 'runtime' && declared.some((provider) => provider.id === providerId)) {
          setRegistered((current) => ({
            ...current,
            [`${pluginRuntimeKey(registration.plugin)}:${kind}:${providerId}`]: true,
          }));
        }
        return;
      }
      if (message.type === 'register-source-provider') {
        const providerId = typeof message.providerId === 'string' ? message.providerId : '';
        if (registration.kind === 'runtime'
          && registration.plugin.permissions.includes('sources:provide')
          && (registration.plugin.sourceProviders ?? []).some((provider) => provider.id === providerId)) {
          setRegistered((current) => ({
            ...current,
            [`${pluginRuntimeKey(registration.plugin)}:source:${providerId}`]: true,
          }));
        }
        return;
      }
      if (message.type === 'command-result'
        || message.type === 'agent-result'
        || message.type === 'lyrics-provider-result'
        || message.type === 'source-provider-result'
        || message.type === 'metadata-provider-result'
        || message.type === 'cover-provider-result') {
        const invocationId = typeof message.invocationId === 'string' ? message.invocationId : '';
        const pending = invocations.current.get(invocationId);
        if (!pending) return;
        window.clearTimeout(pending.timer);
        invocations.current.delete(invocationId);
        if (message.ok === true) pending.resolve(message.value);
        else pending.reject(new Error(typeof message.error === 'string' ? message.error : 'command-failed'));
        return;
      }
      if (message.type !== 'request') return;
      const requestId = typeof message.requestId === 'string' && message.requestId.length <= 80 ? message.requestId : '';
      const action = typeof message.action === 'string' ? message.action : '';
      if (!requestId || !action) return;
      const sourceWindow = event.source as Window;
      const now = performance.now();
      const rate = rateLimits.current.get(sourceWindow) ?? { startedAt: now, count: 0 };
      if (now - rate.startedAt >= 1000) {
        rate.startedAt = now;
        rate.count = 0;
      }
      rate.count += 1;
      rateLimits.current.set(sourceWindow, rate);
      const reply = (ok: boolean, value?: unknown, error?: string): void => postToFrame(registration.frame, {
        channel: bridgeChannel,
        version: bridgeVersion,
        type: 'response',
        requestId,
        ok,
        ...(value !== undefined ? { value } : {}),
        ...(error ? { error } : {}),
      });
      if (rate.count > maximumRequestsPerSecond) {
        reply(false, undefined, 'rate-limited');
        recordWorkshopDiagnostic({ level: 'warn', plugin: registration.plugin, category: 'host-action', message: `${action}:rate-limited` });
        return;
      }
      const startedAt = performance.now();
      void runHostAction(registration, action, isRecord(message.payload) ? message.payload : {})
        .then((value) => {
          reply(true, value);
          recordWorkshopDiagnostic({ plugin: registration.plugin, category: 'host-action', message: action, durationMs: performance.now() - startedAt });
        })
        .catch((error) => {
          const messageText = error instanceof Error ? error.message : 'action-failed';
          reply(false, undefined, messageText);
          recordWorkshopDiagnostic({ level: 'error', plugin: registration.plugin, category: 'host-action', message: `${action}:${messageText}`, durationMs: performance.now() - startedAt });
        });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [findFrame, runHostAction]);

  useEffect(() => {
    const timers = enabledPlugins.flatMap((plugin) => {
      if (!plugin.permissions.includes('playback:read')) return [];
      const send = async (): Promise<void> => {
        const frame = runtimeFrames.current.get(pluginRuntimeKey(plugin));
        const playback = window.echo?.playback;
        if (!frame || !playback) return;
        try {
          postPluginEvent(plugin, 'playback:status', sanitizePlaybackStatus(await playback.getStatus()));
        } catch {
          // Missing host state never grants the plugin fallback authority.
        }
      };
      void send();
      return [window.setInterval(() => void send(), 1_000)];
    });
    return () => timers.forEach((timer) => window.clearInterval(timer));
  }, [enabledPlugins, postPluginEvent]);

  useEffect(() => {
    if (!enabledPlugins.some((plugin) => plugin.permissions.includes('audio:spectrum'))) return undefined;
    void window.echo?.workshop?.setPluginSpectrumActive?.(true).catch(() => undefined);
    return () => {
      void window.echo?.workshop?.setPluginSpectrumActive?.(false).catch(() => undefined);
    };
  }, [enabledPlugins]);

  useEffect(() => {
    const levels = playbackSnapshot.audioStatus?.audioLevels;
    if (!levels) return;
    const payload = {
      bands: Array.from(levels.visualSpectrum ?? []).slice(0, 128),
      energy: typeof levels.visualEnergy === 'number' ? levels.visualEnergy : 0,
      transient: typeof levels.visualTransient === 'number' ? levels.visualTransient : 0,
      state: levels.visualTelemetryState ?? 'none',
    };
    enabledPlugins
      .filter((plugin) => plugin.permissions.includes('audio:spectrum'))
      .forEach((plugin) => postPluginEvent(plugin, 'audio:spectrum', payload));
  }, [enabledPlugins, playbackSnapshot.audioStatus?.audioLevels, postPluginEvent]);

  useEffect(() => {
    if (!playbackQueue) return;
    const payload = snapshotWorkshopPluginQueue(playbackQueue);
    enabledPlugins
      .filter((plugin) => plugin.permissions.includes('queue:read'))
      .forEach((plugin) => postPluginEvent(plugin, 'queue:changed', payload));
  }, [
    enabledPlugins,
    playbackQueue,
    playbackQueue?.items,
    playbackQueue?.currentQueueId,
    playbackQueue?.currentTrack,
    playbackQueue?.canGoNext,
    playbackQueue?.canGoPrevious,
    postPluginEvent,
  ]);

  useEffect(() => {
    const library = window.echo?.library;
    if (!library) return undefined;
    const notify = (eventName: string): void => enabledPlugins
      .filter((plugin) => plugin.permissions.includes('library:read'))
      .forEach((plugin) => postPluginEvent(plugin, eventName, null));
    const unsubscribeLibrary = library.onLibraryChanged?.(() => notify('library:changed'));
    const unsubscribeLiked = library.onLikedTracksChanged?.(() => notify('library:liked-changed'));
    return () => {
      unsubscribeLibrary?.();
      unsubscribeLiked?.();
    };
  }, [enabledPlugins, postPluginEvent]);

  const invokeCommand = useCallback(async (
    plugin: WorkshopPluginSummary,
    commandId: string,
    args: unknown[] = [],
  ): Promise<unknown> => {
    const frame = runtimeFrames.current.get(pluginRuntimeKey(plugin));
    if (!frame || registered[`${pluginRuntimeKey(plugin)}:${commandId}`] !== true) {
      throw new Error('command-not-ready');
    }
    const invocationId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const startedAt = performance.now();
    const result = await new Promise<unknown>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        invocations.current.delete(invocationId);
        reject(new Error('command-timeout'));
      }, 5_000);
      invocations.current.set(invocationId, { resolve, reject, timer });
      postToFrame(frame, {
        channel: bridgeChannel,
        version: bridgeVersion,
        type: 'invoke-command',
        invocationId,
        commandId,
        args,
      });
    });
    recordWorkshopDiagnostic({ plugin, category: 'command', message: commandId, durationMs: performance.now() - startedAt });
    return result;
  }, [registered]);

  const executeAutomationRule = useCallback(async (
    rule: WorkshopAutomationRule,
    event: unknown,
  ): Promise<void> => {
    const plugin = enabledPlugins.find((entry) => entry.sourceId === rule.sourceId
      && entry.itemId === rule.itemId && entry.pluginId === rule.pluginId);
    if (!plugin) return;
    const now = Date.now();
    const previousRun = automationLastRun.current.get(rule.id) ?? 0;
    if (now - previousRun < rule.cooldownSeconds * 1_000) return;
    automationLastRun.current.set(rule.id, now);
    const startedAt = performance.now();
    try {
      if (rule.targetKind === 'command') {
        await invokeCommand(plugin, rule.targetId, [{ trigger: rule.trigger, event }]);
      } else {
        await invokeAgent(plugin, rule.targetId, {
          prompt: rule.agentPrompt ?? '',
          trigger: rule.trigger,
          event,
        });
      }
      recordWorkshopDiagnostic({
        plugin,
        category: 'automation',
        message: `${rule.title}:${rule.trigger}`,
        durationMs: performance.now() - startedAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'automation-failed';
      recordWorkshopDiagnostic({
        level: 'error',
        plugin,
        category: 'automation',
        message: `${rule.title}:${message}`,
        durationMs: performance.now() - startedAt,
      });
    }
  }, [enabledPlugins, invokeAgent, invokeCommand]);

  const runAutomationTrigger = useCallback((trigger: WorkshopAutomationRule['trigger'], event: unknown): void => {
    readWorkshopAutomationRules()
      .filter((rule) => rule.enabled && rule.trigger === trigger)
      .forEach((rule) => { void executeAutomationRule(rule, event); });
  }, [executeAutomationRule]);

  useEffect(() => {
    const audio = window.echo?.audio;
    if (!audio?.onStatus) return undefined;
    return audio.onStatus((status) => {
      const previous = automationAudioState.current;
      const device = `${status.outputDeviceId ?? ''}:${status.outputDeviceName ?? ''}`;
      const safeEvent = {
        state: status.state,
        trackId: status.currentTrackId,
        positionSeconds: status.positionSeconds,
        durationSeconds: status.durationSeconds,
        outputDeviceId: status.outputDeviceId,
        outputDeviceName: status.outputDeviceName,
      };
      if (status.state === 'ended' && previous?.state !== 'ended') {
        runAutomationTrigger('track-ended', safeEvent);
      }
      if (status.state === 'playing'
        && (previous?.state !== 'playing' || previous.trackId !== status.currentTrackId)) {
        runAutomationTrigger('track-started', safeEvent);
      }
      if (previous && previous.device !== device) {
        runAutomationTrigger('device-changed', safeEvent);
      }
      automationAudioState.current = { state: status.state, trackId: status.currentTrackId, device };
    });
  }, [runAutomationTrigger]);

  useEffect(() => {
    if (!playbackQueue) return;
    const queue = snapshotWorkshopPluginQueue(playbackQueue);
    const signature = JSON.stringify({
      currentQueueId: queue.currentQueueId,
      currentTrack: queue.currentTrack?.id ?? null,
      items: queue.items.map((item) => `${item.queueId}:${item.track.id}`),
    });
    const previous = automationQueueSignature.current;
    automationQueueSignature.current = signature;
    if (previous === null || previous === signature) return;
    runAutomationTrigger('queue-changed', queue);
    if (queue.items.length === 0) runAutomationTrigger('queue-empty', queue);
  }, [playbackQueue, playbackQueue?.items, playbackQueue?.currentQueueId, playbackQueue?.currentTrack, runAutomationTrigger]);

  useEffect(() => {
    const timers = readWorkshopAutomationRules()
      .filter((rule) => rule.enabled && rule.trigger === 'timer' && rule.intervalMinutes)
      .map((rule) => window.setInterval(() => {
        void executeAutomationRule(rule, { firedAt: new Date().toISOString() });
      }, rule.intervalMinutes! * 60_000));
    return () => timers.forEach((timer) => window.clearInterval(timer));
  }, [automationRevision, executeAutomationRule]);

  useEffect(() => {
    publishWorkshopTrackContextActions(enabledPlugins.flatMap((plugin) =>
      (plugin.trackContextMenus ?? []).filter((item) => visibleContribution(plugin, 'track-action', item.id)).map((item) => ({
        key: `${pluginRuntimeKey(plugin)}:${item.id}`,
        title: item.title,
        description: item.description,
        pluginName: plugin.name,
        localOnly: item.localOnly,
        ready: registered[`${pluginRuntimeKey(plugin)}:${item.commandId}`] === true,
        run: async (track) => {
          try {
            await invokeCommand(plugin, item.commandId, [sanitizeWorkshopPluginTrack(track)]);
          } catch (error) {
            setNotice(`${plugin.name}：${error instanceof Error ? error.message : '歌曲操作执行失败'}`);
          }
        },
      })),
    ));
  }, [enabledPlugins, invokeCommand, registered, visibleContribution]);

  useEffect(() => () => publishWorkshopTrackContextActions([]), []);

  useEffect(() => {
    publishWorkshopPlayerBarActions(enabledPlugins.flatMap((plugin) =>
      (plugin.playerBarActions ?? []).filter((item) => visibleContribution(plugin, 'player-action', item.id)).map((item) => ({
        key: `${pluginRuntimeKey(plugin)}:${item.id}`,
        title: item.title,
        description: item.description,
        pluginName: plugin.name,
        icon: item.icon,
        ready: registered[`${pluginRuntimeKey(plugin)}:${item.commandId}`] === true,
        run: async () => {
          try {
            await invokeCommand(plugin, item.commandId);
          } catch (error) {
            setNotice(`${plugin.name}：${error instanceof Error ? error.message : '播放器按钮执行失败'}`);
          }
        },
      })),
    ));
  }, [enabledPlugins, invokeCommand, registered, visibleContribution]);

  useEffect(() => () => publishWorkshopPlayerBarActions([]), []);

  const runCommand = useCallback(async (item: RegisteredCommand): Promise<void> => {
    if (!item.ready) return;
    try {
      await invokeCommand(item.plugin, item.commandId);
    } catch (error) {
      setNotice(`${item.plugin.name}：${error instanceof Error ? error.message : '命令执行失败'}`);
    }
  }, [invokeCommand]);

  const runActiveAgent = useCallback(async (): Promise<void> => {
    if (!activeAgent || !activeAgent.ready || agentBusy) return;
    setAgentBusy(true);
    setAgentResult(null);
    try {
      const value = await invokeAgent(activeAgent.plugin, activeAgent.agent.id, agentInput);
      setAgentResult(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
    } catch (error) {
      setAgentResult(error instanceof Error ? error.message : 'Agent 执行失败');
    } finally {
      setAgentBusy(false);
    }
  }, [activeAgent, agentBusy, agentInput, invokeAgent]);

  const searchActiveSourceProvider = useCallback(async (query: string, page: number): Promise<WorkshopPluginSourceSearchResult> => {
    if (!activeSourceProvider) throw new Error('source-provider-unavailable');
    return invokeSourceProvider(
      activeSourceProvider.plugin,
      activeSourceProvider.provider.id,
      'search',
      { query, page, pageSize: 24 },
    ) as Promise<WorkshopPluginSourceSearchResult>;
  }, [activeSourceProvider, invokeSourceProvider]);

  const playActiveSourceTrack = useCallback(async (track: WorkshopPluginSourceTrack): Promise<void> => {
    if (!activeSourceProvider) throw new Error('source-provider-unavailable');
    const resolved = await invokeSourceProvider(
      activeSourceProvider.plugin,
      activeSourceProvider.provider.id,
      'resolve',
      track.providerTrackId,
    ) as WorkshopPluginResolvedSource;
    await playApprovedDirectSource(activeSourceProvider.plugin, {
      url: resolved.url,
      title: resolved.title ?? track.title,
      artist: resolved.artist ?? track.artist ?? undefined,
      album: resolved.album ?? track.album ?? undefined,
      live: resolved.live,
    });
  }, [activeSourceProvider, invokeSourceProvider, playApprovedDirectSource]);

  if (enabledPlugins.length === 0) return null;

  return (
    <>
      <div className="workshop-plugin-runtimes" aria-hidden="true">
        {enabledPlugins.map((plugin) => (
          <iframe
            key={`${pluginRuntimeKey(plugin)}:${plugin.version}`}
            ref={(frame) => {
              const key = pluginRuntimeKey(plugin);
              if (frame) runtimeFrames.current.set(key, frame);
              else runtimeFrames.current.delete(key);
            }}
            src={plugin.runtimeEntryUrl}
            title={`创意工坊插件运行时：${plugin.name}`}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
          />
        ))}
      </div>
      {slottedPanels.length > 0 ? (
        <nav className="workshop-plugin-slots" data-route={activeRouteId} aria-label="当前页面的插件功能">
          {slottedPanels.map(({ plugin, panel }) => (
            <button
              key={`${pluginRuntimeKey(plugin)}:slot:${panel.id}`}
              type="button"
              data-slot={panel.placement}
              title={`${plugin.name}：${panel.title}`}
              onClick={() => setActivePanel({ plugin, panel })}
            >
              <LayoutGrid size={15} aria-hidden="true" />
              <span>{panel.title}</span>
            </button>
          ))}
        </nav>
      ) : null}
      <aside className="workshop-plugin-dock" data-open={open ? 'true' : 'false'}>
        <button className="workshop-plugin-dock__toggle" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          <Blocks size={17} aria-hidden="true" />
          <span>插件</span>
          <em>{enabledPlugins.length}</em>
        </button>
        {open ? (
          <div className="workshop-plugin-dock__menu" role="menu" aria-label="创意工坊插件">
            <label className="workshop-plugin-dock__search">
              <Search size={14} aria-hidden="true" />
              <input
                type="search"
                value={dockQuery}
                placeholder="搜索插件功能"
                aria-label="搜索创意工坊插件功能"
                onChange={(event) => setDockQuery(event.target.value)}
              />
              <kbd>Ctrl Shift P</kbd>
            </label>
            <button className="workshop-plugin-dock__manage" type="button" role="menuitem" onClick={() => setManagingContributions(true)}>
              <span><strong>管理插件功能</strong><small>显示、固定、排序与页面位置</small></span><SlidersHorizontal size={15} />
            </button>
            {panelItems.filter(({ plugin, panel }) => dockItemMatches(plugin.name, panel.title, '面板')).map(({ plugin, panel }) => (
              <button key={`${pluginRuntimeKey(plugin)}:panel:${panel.id}`} type="button" role="menuitem" onClick={() => setActivePanel({ plugin, panel })}>
                <span><strong>{panel.title}</strong><small>{plugin.name} · 面板</small></span><ChevronRight size={15} />
              </button>
            ))}
            {agentItems.filter((item) => dockItemMatches(item.plugin.name, item.agent.title, 'Agent')).map((item) => (
              <button
                key={`${pluginRuntimeKey(item.plugin)}:agent:${item.agent.id}`}
                type="button"
                role="menuitem"
                disabled={!item.ready}
                onClick={() => { setActiveAgent(item); setAgentInput(''); setAgentResult(null); }}
              >
                <span><strong>{item.agent.title}</strong><small>{item.plugin.name} · {item.ready ? 'Agent' : '正在加载'}</small></span><Bot size={15} />
              </button>
            ))}
            {sourceProviderItems.filter((item) => dockItemMatches(item.plugin.name, item.provider.title, '音源')).map((item) => (
              <button
                key={`${pluginRuntimeKey(item.plugin)}:source:${item.provider.id}`}
                type="button"
                role="menuitem"
                disabled={!item.ready}
                onClick={() => setActiveSourceProvider(item)}
              >
                <span><strong>{item.provider.title}</strong><small>{item.plugin.name} · {item.ready ? '音源' : '正在加载'}</small></span><Radio size={15} />
              </button>
            ))}
            {enabledPlugins.filter((plugin) => plugin.settings.length > 0
              && visibleContribution(plugin, 'settings', 'host-form')
              && dockItemMatches(plugin.name, '插件设置', '设置')).map((plugin) => (
              <button
                key={`${pluginRuntimeKey(plugin)}:settings`}
                type="button"
                role="menuitem"
                onClick={() => setActiveSettings(plugin)}
              >
                <span><strong>插件设置</strong><small>{plugin.name} · {plugin.settings.length} 项</small></span><ChevronRight size={15} />
              </button>
            ))}
            {commandItems.filter((item) => {
              const command = item.plugin.commands.find((entry) => entry.id === item.commandId)!;
              return dockItemMatches(item.plugin.name, command.title, '命令');
            }).map((item) => {
              const command = item.plugin.commands.find((entry) => entry.id === item.commandId)!;
              return (
                <button key={`${pluginRuntimeKey(item.plugin)}:command:${item.commandId}`} type="button" role="menuitem" disabled={!item.ready} onClick={() => void runCommand(item)}>
                  <span><strong>{command.title}</strong><small>{item.plugin.name} · {item.ready ? '命令' : '正在加载'}</small></span><ChevronRight size={15} />
                </button>
              );
            })}
          </div>
        ) : null}
      </aside>
      {activePanel ? (
        <section className="workshop-plugin-panel" data-placement={activePanel.panel.placement} role="dialog" aria-modal="true" aria-label={`${activePanel.plugin.name}：${activePanel.panel.title}`}>
          <header>
            <div><strong>{activePanel.panel.title}</strong><span>{activePanel.plugin.name}</span></div>
            <button type="button" aria-label="关闭插件面板" onClick={() => setActivePanel(null)}><X size={17} /></button>
          </header>
          <iframe
            ref={panelFrame}
            src={activePanel.panel.entryUrl}
            title={`${activePanel.plugin.name}：${activePanel.panel.title}`}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
          />
        </section>
      ) : null}
      {activeAgent ? (
        <section className="workshop-plugin-agent" role="dialog" aria-modal="true" aria-label={`${activeAgent.plugin.name}：${activeAgent.agent.title}`}>
          <header>
            <div><Bot size={17} /><strong>{activeAgent.agent.title}</strong><span>{activeAgent.plugin.name}</span></div>
            <button type="button" aria-label="关闭 Agent" onClick={() => setActiveAgent(null)}><X size={17} /></button>
          </header>
          {activeAgent.agent.description ? <p>{activeAgent.agent.description}</p> : null}
          <textarea
            value={agentInput}
            maxLength={maximumAgentInputLength}
            placeholder={activeAgent.agent.inputPlaceholder ?? '输入要交给这个 Agent 的内容'}
            onChange={(event) => setAgentInput(event.target.value)}
          />
          <button className="workshop-plugin-agent__run" type="button" disabled={agentBusy || !activeAgent.ready} onClick={() => void runActiveAgent()}>
            <Play size={15} />{agentBusy ? '运行中…' : '运行 Agent'}
          </button>
          {agentResult !== null ? <pre aria-label="Agent 结果">{agentResult}</pre> : null}
        </section>
      ) : null}
      {activeSettings ? (
        <WorkshopPluginSettingsDialog
          plugin={activeSettings}
          onClose={() => setActiveSettings(null)}
          onChanged={(values) => postPluginEvent(activeSettings, 'settings:changed', values)}
        />
      ) : null}
      {managingContributions ? (
        <WorkshopContributionManager plugins={enabledPlugins} onClose={() => setManagingContributions(false)} />
      ) : null}
      {activeSourceProvider ? (
        <WorkshopSourceProviderDialog
          plugin={activeSourceProvider.plugin}
          provider={activeSourceProvider.provider}
          ready={activeSourceProvider.ready}
          onClose={() => setActiveSourceProvider(null)}
          onSearch={searchActiveSourceProvider}
          onPlay={playActiveSourceTrack}
        />
      ) : null}
      {notice ? <div className="workshop-plugin-notice" role="status">{notice}</div> : null}
    </>
  );
};
