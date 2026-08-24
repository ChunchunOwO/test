import type { AppThemePreset, AppThemeToneOverride } from './appSettings';
import type { PluginPanelPlacement, PluginPlayerBarActionIcon } from './plugins';

export const workshopManifestType = 'echo-workshop-item' as const;
export const workshopManifestSchemaVersion = 1 as const;
export const workshopManifestFileName = 'echo.workshop.json';

export const workshopContentKinds = [
  'theme',
  'lyrics-style',
  'visualizer-preset',
  'dsp-preset',
  'audio-plugin-profile',
  'plugin-package',
] as const;

export type WorkshopContentKind = (typeof workshopContentKinds)[number];
export type WorkshopExecutionMode = 'data-only' | 'sandboxed-ui' | 'sandboxed-plugin';

export const workshopExecutionModeByContentKind: Record<WorkshopContentKind, WorkshopExecutionMode> = {
  theme: 'sandboxed-ui',
  'lyrics-style': 'data-only',
  'visualizer-preset': 'data-only',
  'dsp-preset': 'data-only',
  'audio-plugin-profile': 'data-only',
  'plugin-package': 'sandboxed-plugin',
};

export type WorkshopManifestFile = {
  path: string;
  size: number;
  sha256: string;
};

export type WorkshopLicenseDeclaration = {
  id: string;
  holder: string;
  sourceUrl?: string;
};

export type WorkshopCompatibility = {
  minEchoVersion: string;
  maxEchoVersion?: string;
  pluginApiVersion?: number;
};

export type WorkshopDependencyDeclaration = string | {
  itemId: string;
  versionRange?: string;
  optional?: boolean;
};

export type WorkshopDependencySummary = {
  itemId: string;
  versionRange: string | null;
  optional: boolean;
  installedVersion: string | null;
  state: 'ready' | 'missing' | 'version-mismatch';
};

export type WorkshopItemManifest = {
  type: typeof workshopManifestType;
  schemaVersion: typeof workshopManifestSchemaVersion;
  id: string;
  title: string;
  version: string;
  content: {
    kind: WorkshopContentKind;
    entry: string;
  };
  compatibility: WorkshopCompatibility;
  files: WorkshopManifestFile[];
  license: WorkshopLicenseDeclaration;
  dependencies?: WorkshopDependencyDeclaration[];
  conflicts?: string[];
  networkHosts?: string[];
};

export type WorkshopInstallInfo = {
  sizeOnDiskBytes: string;
  installedAtUnixSeconds: number;
};

export type WorkshopDownloadInfo = {
  downloadedBytes: string;
  totalBytes: string;
};

export type WorkshopSubscriptionItem = {
  itemId: string;
  subscribed: boolean;
  installed: boolean;
  needsUpdate: boolean;
  downloading: boolean;
  downloadPending: boolean;
  locallyDisabled: boolean;
  install: WorkshopInstallInfo | null;
  download: WorkshopDownloadInfo | null;
  error: 'item-query-failed' | null;
};

export type WorkshopSubscriptionCatalog =
  | {
      available: true;
      items: WorkshopSubscriptionItem[];
    }
  | {
      available: false;
      reason: 'source-unavailable' | 'subscription-query-failed';
      items: [];
    };

export type WorkshopDownloadRequestResult =
  | { ok: true; state: 'accepted' | 'already-current' }
  | {
      ok: false;
      reason: 'invalid-item-id' | 'source-unavailable' | 'not-subscribed' | 'request-rejected' | 'source-error';
    };

export const workshopRegistryStates = [
  'detected',
  'downloading',
  'verified',
  'staged',
  'disabled',
  'enabled',
  'quarantined',
  'error',
] as const;

export type WorkshopRegistryState = (typeof workshopRegistryStates)[number];

export type WorkshopManagerItemState = 'not-ingested' | WorkshopRegistryState;

export type WorkshopManagerThemeSummary = {
  themeId: string;
  title: string;
  description: string | null;
  basePreset: AppThemePreset;
  swatches: string[];
  colorModes: Array<'light' | 'dark'>;
  skin: {
    mode: WorkshopThemeSkinMode;
    layout: WorkshopThemeSkinLayout;
    stages: WorkshopThemeSkinStages;
    assetCount: number;
  } | null;
  uiRuntime?: {
    capabilities: WorkshopThemeUiCapability[];
  } | null;
  active: boolean;
};

export type WorkshopManagerAudioPluginProfileSummary = {
  profileId: string;
  title: string;
  description: string | null;
  format: 'vst3';
  role: 'effect' | 'instrument';
  plugin: {
    classId: string;
    name: string;
    vendor: string;
  };
  parameterCount: number;
  presetCount: number;
  routing: {
    placement: 'pre-dsp' | 'post-dsp';
  };
  runtime: {
    state: 'adapter-required';
    adapterApi: 'echo.audio-plugin-adapter';
    minimumVersion: number;
  };
};

export type WorkshopManagerLyricsStyleSummary = {
  styleId: string;
  title: string;
  description: string | null;
  hasScene: boolean;
};

export const workshopPluginCapabilities = [
  'navigation',
  'playback:read',
  'playback:control',
  'playback:share',
  'audio:spectrum',
  'library:read',
  'library:control',
  'queue:read',
  'queue:control',
  'sources:provide',
  'sources:direct',
  'network:request',
  'agent:runtime',
  'lyrics:provide',
  'fs:plugin',
] as const;

export type WorkshopPluginCapability = (typeof workshopPluginCapabilities)[number];

export type WorkshopPluginCommandSummary = {
  id: string;
  title: string;
  description: string | null;
};

export type WorkshopPluginTrackContextMenuSummary = {
  id: string;
  title: string;
  description: string | null;
  commandId: string;
  localOnly: boolean;
};

export type WorkshopPluginPlayerBarActionSummary = {
  id: string;
  title: string;
  description: string | null;
  commandId: string;
  icon: PluginPlayerBarActionIcon;
};

export type WorkshopPluginPanelSummary = {
  id: string;
  title: string;
  placement: PluginPanelPlacement;
  entryUrl: string;
};

export type WorkshopPluginAgentSummary = {
  id: string;
  title: string;
  description: string | null;
  inputPlaceholder: string | null;
};

export type WorkshopPluginLyricsProviderSummary = {
  id: string;
  title: string;
  description: string | null;
};

export type WorkshopPluginMetadataProviderSummary = {
  id: string;
  title: string;
  description: string | null;
};

export type WorkshopPluginCoverProviderSummary = {
  id: string;
  title: string;
  description: string | null;
};

export type WorkshopPluginThemePresetSummary = {
  id: string;
  title: string;
  description: string | null;
  basePreset: AppThemePreset;
  light?: AppThemeToneOverride;
  dark?: AppThemeToneOverride;
  preview?: string;
  swatches?: string[];
};

export type WorkshopPluginSourceProviderSummary = {
  id: string;
  title: string;
  description: string | null;
};

export type WorkshopPluginSourceTrack = {
  providerTrackId: string;
  title: string;
  artist: string | null;
  album: string | null;
  durationSeconds: number | null;
  source: string | null;
  playable: boolean;
  unavailableReason: string | null;
};

export type WorkshopPluginSourceSearchResult = {
  tracks: WorkshopPluginSourceTrack[];
  total: number | null;
  hasMore: boolean;
};

export type WorkshopPluginResolvedSource = {
  url: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  live: boolean;
};

export type WorkshopPluginSettingOption = {
  label: string;
  value: string;
};

export type WorkshopPluginSettingSummary = {
  id: string;
  title: string;
  description: string | null;
  type: 'string' | 'select' | 'boolean' | 'number';
  defaultValue: string | number | boolean | null;
  options: WorkshopPluginSettingOption[];
  placeholder: string | null;
  min: number | null;
  max: number | null;
  required: boolean;
};

export type WorkshopPluginSummary = {
  sourceId: string;
  itemId: string;
  contentId: string;
  version: string;
  pluginId: string;
  name: string;
  permissions: WorkshopPluginCapability[];
  commands: WorkshopPluginCommandSummary[];
  trackContextMenus?: WorkshopPluginTrackContextMenuSummary[];
  playerBarActions?: WorkshopPluginPlayerBarActionSummary[];
  panels: WorkshopPluginPanelSummary[];
  agents: WorkshopPluginAgentSummary[];
  sourceProviders?: WorkshopPluginSourceProviderSummary[];
  lyricsProviders?: WorkshopPluginLyricsProviderSummary[];
  metadataProviders?: WorkshopPluginMetadataProviderSummary[];
  coverProviders?: WorkshopPluginCoverProviderSummary[];
  themePresets?: WorkshopPluginThemePresetSummary[];
  settings: WorkshopPluginSettingSummary[];
  networkHosts: string[];
  dependencies?: WorkshopDependencySummary[];
  conflicts?: string[];
  runtimeEntryUrl: string;
  enabled: boolean;
  error: string | null;
};

export type WorkshopPluginRuntimeRequest = {
  sourceId: string;
  itemId: string;
};

export type WorkshopPluginNetworkRequest = WorkshopPluginRuntimeRequest & {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
};

export type WorkshopPluginNetworkResponse = {
  url: string;
  status: number;
  statusText: string;
  ok: boolean;
  headers: Record<string, string>;
  body: string;
};

export type WorkshopPlaybackShareTrack = {
  id: string | null;
  title: string;
  artist: string;
  album: string;
  durationSeconds: number;
  codec: string | null;
  sizeBytes: number;
};

export type WorkshopPlaybackShareInfo = {
  available: boolean;
  reason: 'no-current-track' | 'not-local-file' | 'file-unavailable' | null;
  track: WorkshopPlaybackShareTrack | null;
  allowedHosts: string[];
};

export type WorkshopPlaybackShareStartRequest = WorkshopPluginRuntimeRequest & {
  uploadUrl: string;
  roomId?: string;
  headers?: Record<string, string>;
};

export type WorkshopPlaybackShareTaskState = 'queued' | 'uploading' | 'ready' | 'error';

export type WorkshopPlaybackShareTask = {
  id: string;
  state: WorkshopPlaybackShareTaskState;
  bytesSent: number;
  totalBytes: number;
  progress: number;
  playbackUrl: string | null;
  expiresAt: string | null;
  error: string | null;
  track: WorkshopPlaybackShareTrack;
};

export type WorkshopPlaybackShareTaskRequest = WorkshopPluginRuntimeRequest & {
  taskId: string;
};

export type WorkshopPluginSnapshot = {
  plugins: WorkshopPluginSummary[];
};

export const workshopAuthoringKinds = [
  'theme',
  'lyrics-style',
  'visualizer-preset',
  'dsp-preset',
  'audio-plugin-profile',
  'plugin-package',
] as const;

export type WorkshopAuthoringKind = (typeof workshopAuthoringKinds)[number];

export type WorkshopAuthoringCreateRequest = {
  kind: WorkshopAuthoringKind;
  id: string;
  title: string;
  licenseHolder: string;
  minEchoVersion: string;
};

export type WorkshopAuthoringDraft = {
  rootDirectory: string;
  entryPath: string;
  kind: WorkshopAuthoringKind;
  id: string;
  title: string;
  manifestText: string;
  entryText: string;
  publication: {
    publishedFileId: string;
    visibility: WorkshopAuthoringVisibility;
    description: string;
    changeNote: string;
    tags: string[];
  };
};

export type WorkshopAuthoringDraftInput = Pick<WorkshopAuthoringDraft, 'manifestText' | 'entryText'>;

export type WorkshopAuthoringSaveRequest = WorkshopAuthoringDraftInput & {
  rootDirectory: string;
  publication?: WorkshopAuthoringDraft['publication'];
};

export type WorkshopAuthoringValidation = {
  ok: boolean;
  kind: WorkshopAuthoringKind | null;
  id: string | null;
  title: string | null;
  normalizedContribution: unknown | null;
  error: string | null;
};

export type WorkshopAuthoringPreparedSummary = {
  rootDirectory: string;
  contentDirectory: string;
  previewPath: string;
  vdfPath: string;
  previewHtmlPath: string;
  kind: WorkshopAuthoringKind;
  id: string;
  title: string;
  version: string;
  fileCount: number;
  totalBytes: number;
};

export type WorkshopAuthoringVisibility = 'private' | 'friends-only' | 'unlisted' | 'public';

export type WorkshopAuthoringPublishRequest = {
  rootDirectory: string;
  rightsConfirmation: 'owned-or-authorized';
  publicationConfirmation: 'publish-to-steam-workshop';
};

export type WorkshopAuthoringPublishResult = {
  itemId: string;
  created: boolean;
  visibility: WorkshopAuthoringVisibility;
  needsToAcceptAgreement: boolean;
};

export type WorkshopAuthoringSdkCopyResult = {
  directory: string;
  sdkVersion: 1;
};

export type WorkshopSdkDescriptor = {
  sdkVersion: 1;
  manifest: {
    type: typeof workshopManifestType;
    schemaVersions: number[];
    contentKinds: WorkshopContentKind[];
  };
  plugin: {
    apiVersions: number[];
    currentApiVersion: number;
    declarationFile: 'docs/workshop-sdk/echo-workshop-plugin.d.ts';
  };
  audioPluginAdapter: {
    api: 'echo.audio-plugin-adapter';
    protocolVersions: number[];
  };
};

export type WorkshopAcceptanceRequest = {
  itemId: string;
  timeoutSeconds?: number;
  cleanupSubscription?: boolean;
  approveUiRuntime?: boolean;
  approvePluginCapabilities?: WorkshopPluginCapability[];
};

export type WorkshopAcceptanceStep = {
  id: 'source' | 'subscribe' | 'download' | 'ingest-enable' | 'verify' | 'cleanup';
  ok: boolean;
  detail: string;
};

export type WorkshopAcceptanceResult = {
  ok: boolean;
  itemId: string;
  startedAt: string;
  completedAt: string;
  steps: WorkshopAcceptanceStep[];
  finalState: WorkshopManagerItemState | 'missing';
};

export type WorkshopManagerItem = {
  sourceId: string;
  itemId: string;
  state: WorkshopManagerItemState;
  contentId: string | null;
  contentKind: WorkshopContentKind | null;
  version: string | null;
  previousVersion?: string | null;
  enabled: boolean;
  catalogReady: boolean;
  errorCode: string | null;
  subscription: WorkshopSubscriptionItem | null;
  theme: WorkshopManagerThemeSummary | null;
  lyricsStyle?: WorkshopManagerLyricsStyleSummary | null;
  audioPluginProfile?: WorkshopManagerAudioPluginProfileSummary | null;
};

export type WorkshopManagerStorageHealth = {
  writable: boolean;
  error: 'registry-unreadable' | 'catalog-unreadable' | null;
  revision: number;
};

export type WorkshopReconcileReport = {
  ok: boolean;
  startedAt: string;
  completedAt: string;
  examined: number;
  stagedRecovered: number;
  catalogRestored: number;
  catalogPruned: number;
  quarantined: number;
  failureCodes: string[];
};

export type WorkshopReconcileStatus = {
  state: 'idle' | 'running' | 'ready' | 'error';
  lastReport: WorkshopReconcileReport | null;
};

export type WorkshopManagerSnapshot = {
  source: WorkshopSubscriptionCatalog;
  registry: WorkshopManagerStorageHealth;
  catalog: WorkshopManagerStorageHealth;
  reconcile: WorkshopReconcileStatus;
  items: WorkshopManagerItem[];
};

export type WorkshopManagerItemRequest = {
  sourceId: string;
  itemId: string;
  approveUiRuntime?: boolean;
  approvePluginCapabilities?: WorkshopPluginCapability[];
};

export type WorkshopManagerAction =
  | 'download'
  | 'ingest'
  | 'enable'
  | 'disable'
  | 'apply'
  | 'use'
  | 'reconcile'
  | 'browse'
  | 'subscribe'
  | 'unsubscribe'
  | 'open-in-steam';

export type WorkshopManagerActionResult = {
  ok: boolean;
  action: WorkshopManagerAction;
  reason: string | null;
  snapshot: WorkshopManagerSnapshot;
};

export const workshopAutomationTriggers = [
  'track-started',
  'track-ended',
  'queue-changed',
  'queue-empty',
  'device-changed',
  'timer',
] as const;

export type WorkshopAutomationTrigger = (typeof workshopAutomationTriggers)[number];

export type WorkshopAutomationRule = {
  id: string;
  title: string;
  enabled: boolean;
  trigger: WorkshopAutomationTrigger;
  intervalMinutes: number | null;
  sourceId: string;
  itemId: string;
  pluginId: string;
  targetKind: 'command' | 'agent';
  targetId: string;
  agentPrompt: string | null;
  cooldownSeconds: number;
};

export type WorkshopDiagnosticEntry = {
  id: string;
  at: string;
  level: 'info' | 'warn' | 'error';
  sourceId: string | null;
  itemId: string | null;
  pluginId: string | null;
  category: 'lifecycle' | 'registration' | 'command' | 'agent' | 'host-action' | 'automation';
  message: string;
  durationMs: number | null;
};

export type WorkshopCustomizationPluginState = {
  sourceId: string;
  itemId: string;
  pluginId: string;
  version: string;
  settings: Record<string, string | number | boolean | null>;
  contributions: {
    hidden: string[];
    pinned: string[];
    order: string[];
  };
};

export type WorkshopCustomizationProfile = {
  type: 'echo-workshop-customization';
  schemaVersion: 1;
  exportedAt: string;
  name: string;
  plugins: WorkshopCustomizationPluginState[];
  automations: WorkshopAutomationRule[];
};

export type WorkshopMaintenanceCandidate = {
  relativePath: string;
  kind: 'revision' | 'staging';
  bytes: number;
  modifiedAt: string;
};

export type WorkshopMaintenancePreview = {
  token: string;
  createdAt: string;
  expiresAt: string;
  candidates: WorkshopMaintenanceCandidate[];
  totalBytes: number;
};

export type WorkshopMaintenanceCleanupResult = {
  removed: number;
  reclaimedBytes: number;
  failed: string[];
};

export type WorkshopRollbackRequest = WorkshopManagerItemRequest;

export type WorkshopRollbackResult = {
  ok: boolean;
  reason: string | null;
  snapshot: WorkshopManagerSnapshot;
};

export const workshopApplicableContentKinds = [
  'theme',
  'lyrics-style',
  'visualizer-preset',
  'dsp-preset',
] as const;

export const workshopBrowseSorts = ['trend', 'votes', 'recent'] as const;
export type WorkshopBrowseSort = (typeof workshopBrowseSorts)[number];
export const workshopBrowsePageSize = 50;

export type WorkshopBrowseRequest = {
  page: number;
  sort: WorkshopBrowseSort;
  searchText?: string;
};

export type WorkshopBrowseItem = {
  itemId: string;
  title: string;
  description: string;
  tags: string[];
  subscribed: boolean;
  numUpvotes: number;
  numDownvotes: number;
  subscriptionCount: number | null;
  previewUrl: string | null;
  updatedAtUnixSeconds: number;
};

export type WorkshopBrowsePage =
  | {
      available: true;
      page: number;
      total: number;
      items: WorkshopBrowseItem[];
    }
  | {
      available: false;
      reason: 'source-unavailable' | 'query-failed' | 'invalid-request';
      page: number;
      total: 0;
      items: [];
    };

export type WorkshopActiveVisualizerPreset = {
  sourceId: string;
  itemId: string;
  contentId: string;
  version: string;
  title: string;
  style: 'bars' | 'wave' | 'radial';
  palette: string[];
  barCount: number;
  smoothing: number;
  sensitivity: number;
  decay: number;
  mirror: boolean;
};

export const workshopThemeSkinModes = ['chrome', 'shell'] as const;
export type WorkshopThemeSkinMode = (typeof workshopThemeSkinModes)[number];

export const workshopThemeSidebarPositions = ['left', 'right'] as const;
export const workshopThemeSidebarPresentations = ['dock', 'overlay', 'rail'] as const;
export const workshopThemeSidebarWidths = ['narrow', 'standard', 'wide'] as const;
export const workshopThemePlayerStyles = ['standard', 'compact', 'floating', 'hero'] as const;
export const workshopThemeTitlebarStyles = ['standard', 'minimal', 'immersive'] as const;
export const workshopThemeContentDensities = ['comfortable', 'compact', 'editorial'] as const;
export const workshopThemeCardStyles = ['flat', 'raised', 'glass', 'outline'] as const;
export const workshopThemeDisplayStyles = ['default', 'editorial', 'technical', 'playful'] as const;
export const workshopThemeNavStyles = ['standard', 'pills', 'ghost'] as const;
export const workshopThemeMotionStyles = ['none', 'gentle', 'cinematic'] as const;
export const workshopThemeHomeStages = ['standard', 'hero', 'cinema', 'magazine'] as const;
export const workshopThemeLyricsStages = ['standard', 'theater', 'poster', 'vinyl'] as const;
export const workshopThemeQueueStyles = ['standard', 'tickets', 'compact'] as const;
export const workshopThemeSongsStyles = ['standard', 'poster', 'dense'] as const;
export const workshopThemeBrandPresentations = ['echo', 'asset', 'hidden'] as const;
export const workshopThemeUiCapabilities = [
  'navigation',
  'playback:read',
  'playback:control',
  'library:read',
  'library:control',
  'queue:read',
  'queue:control',
  'window:control',
] as const;
export const workshopThemeIconKeys = [
  'nav-home',
  'nav-songs',
  'nav-albums',
  'nav-artists',
  'nav-genres',
  'nav-folders',
  'nav-audio-cd',
  'nav-remote',
  'nav-connect',
  'nav-community',
  'nav-workshop',
  'nav-dsp',
  'nav-queue',
  'nav-history',
  'nav-playlists',
  'nav-inbox',
  'nav-liked',
  'nav-settings',
  'nav-audio-settings',
  'nav-lyrics-settings',
  'nav-import-folder',
  'nav-import-file',
  'titlebar-audio-settings',
  'titlebar-lyrics-settings',
  'titlebar-lyrics-visual-settings',
  'titlebar-settings',
  'transport-like',
  'transport-queue',
  'transport-shuffle',
  'transport-previous',
  'transport-play',
  'transport-pause',
  'transport-next',
  'transport-repeat',
  'transport-repeat-one',
  'transport-lyrics',
] as const;
export const workshopThemeSkinAssetKeys = [
  'background',
  'titlebar',
  'sidebar',
  'player',
  'page',
  'home',
  'lyrics',
  'queue',
  'nowPlaying',
  'watermark',
] as const;

export type WorkshopThemeSkinLayout = {
  sidebarPosition: (typeof workshopThemeSidebarPositions)[number];
  sidebarPresentation: (typeof workshopThemeSidebarPresentations)[number];
  sidebarWidth: (typeof workshopThemeSidebarWidths)[number];
  playerStyle: (typeof workshopThemePlayerStyles)[number];
  titlebarStyle: (typeof workshopThemeTitlebarStyles)[number];
  contentDensity: (typeof workshopThemeContentDensities)[number];
  cardStyle: (typeof workshopThemeCardStyles)[number];
  displayStyle: (typeof workshopThemeDisplayStyles)[number];
  navStyle: (typeof workshopThemeNavStyles)[number];
  motion: (typeof workshopThemeMotionStyles)[number];
};

export type WorkshopThemeSkinStages = {
  home: (typeof workshopThemeHomeStages)[number];
  lyrics: (typeof workshopThemeLyricsStages)[number];
  queue: (typeof workshopThemeQueueStyles)[number];
  songs: (typeof workshopThemeSongsStyles)[number];
};

export type WorkshopThemeSkinAssetKey = (typeof workshopThemeSkinAssetKeys)[number];
export type WorkshopThemeSkinAssetUrls = Partial<Record<WorkshopThemeSkinAssetKey, string>>;
export type WorkshopThemeBrandPresentation = (typeof workshopThemeBrandPresentations)[number];
export type WorkshopThemeIconKey = (typeof workshopThemeIconKeys)[number];
export type WorkshopThemeUiCapability = (typeof workshopThemeUiCapabilities)[number];

export type WorkshopThemeIdentity = {
  brandPresentation: WorkshopThemeBrandPresentation;
  brandUrl: string | null;
  showEditionBadge: boolean;
  showVersion: boolean;
};

export type WorkshopThemeIconAtlas = {
  url: string;
  columns: number;
  rows: number;
  map: Partial<Record<WorkshopThemeIconKey, number>>;
};

export type WorkshopThemeUiRuntime = {
  entryUrl: string;
  capabilities: WorkshopThemeUiCapability[];
};

export type WorkshopThemeSkinEffects = {
  grainPercent: number;
  vignettePercent: number;
  glowPercent: number;
  scrimPercent: number;
  bloomPercent: number;
  mistPercent: number;
  dimChromePercent: number;
  spotlightPercent: number;
  frostPercent: number;
};

export const defaultWorkshopThemeSkinLayout: WorkshopThemeSkinLayout = {
  sidebarPosition: 'left',
  sidebarPresentation: 'dock',
  sidebarWidth: 'standard',
  playerStyle: 'standard',
  titlebarStyle: 'standard',
  contentDensity: 'comfortable',
  cardStyle: 'raised',
  displayStyle: 'default',
  navStyle: 'standard',
  motion: 'gentle',
};

export const defaultWorkshopThemeSkinStages: WorkshopThemeSkinStages = {
  home: 'standard',
  lyrics: 'standard',
  queue: 'standard',
  songs: 'standard',
};

export const defaultWorkshopThemeSkinEffects: WorkshopThemeSkinEffects = {
  grainPercent: 0,
  vignettePercent: 0,
  glowPercent: 0,
  scrimPercent: 42,
  bloomPercent: 0,
  mistPercent: 0,
  dimChromePercent: 0,
  spotlightPercent: 0,
  frostPercent: 0,
};

export const defaultWorkshopThemeIdentity: WorkshopThemeIdentity = {
  brandPresentation: 'echo',
  brandUrl: null,
  showEditionBadge: true,
  showVersion: true,
};

export type WorkshopActiveThemeBackground = {
  sourceId: string;
  itemId: string;
  contentId: string;
  version: string;
  themeId: string;
  url: string | null;
  mode: WorkshopThemeSkinMode;
  layout: WorkshopThemeSkinLayout;
  stages: WorkshopThemeSkinStages;
  assets: WorkshopThemeSkinAssetUrls;
  effects: WorkshopThemeSkinEffects;
  identity: WorkshopThemeIdentity;
  iconAtlas: WorkshopThemeIconAtlas | null;
  runtime: WorkshopThemeUiRuntime | null;
};
