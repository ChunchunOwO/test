import type { AppSettings } from './appSettings';

export type SteamUnavailableReason =
  | 'release_app_id_missing'
  | 'development_app_id_missing'
  | 'native_module_load_failed'
  | 'steam_client_unavailable'
  | 'license_unavailable'
  | 'unknown';

export type SteamRichPresenceStatus = {
  mode: 'off' | 'basic' | 'detailed';
  preset: 'music' | 'minimal' | 'privacy';
  enabled: boolean;
  showAlbum: boolean;
  showProgress: boolean;
  showGenre: boolean;
  showPlaybackOrder: boolean;
  showBpm: boolean;
  showQuality: boolean;
  showFormat: boolean;
  showBitPerfect: boolean;
  publicationState: 'disabled' | 'waiting' | 'published' | 'error';
  preview: string | null;
  lastPublishedAt: string | null;
  lastError: 'write_failed' | null;
};

export type SteamCloudSettingsError =
  | 'unavailable'
  | 'disabled'
  | 'invalid_profile'
  | 'profile_too_large'
  | 'write_failed'
  | 'invalid_snapshot'
  | 'apply_failed';

export type SteamCloudSettingsStatus = {
  enabled: boolean | null;
  available: boolean;
  syncState: 'idle' | 'pending' | 'retrying' | 'synced' | 'disabled' | 'error';
  fileName: string;
  remoteUpdatedAt: string | null;
  lastAttemptedAt: string | null;
  lastSucceededAt: string | null;
  lastUploadedAt: string | null;
  lastDownloadedAt: string | null;
  nextRetryAt: string | null;
  retryCount: number;
  settingsCount: number;
  pendingUpload: boolean;
  lastError: SteamCloudSettingsError | null;
};

export type SteamCloudSettingsUploadResult = SteamCloudSettingsStatus & {
  uploaded: boolean;
};

export type SteamCloudSettingsDownloadResult = SteamCloudSettingsStatus & {
  applied: boolean;
  settings: AppSettings | null;
};

export type SteamStatus = {
  state: 'unconfigured' | 'restarting' | 'ready' | 'unavailable' | 'error';
  appId: number | null;
  appIdSource: 'release-build' | 'development-environment' | 'none';
  playerName: string | null;
  appBuildId: number | null;
  betaName: string | null;
  subscribed: boolean | null;
  runningOnSteamDeck: boolean | null;
  cloudEnabled: boolean | null;
  unavailableReason: SteamUnavailableReason | null;
  message: string;
  richPresence?: SteamRichPresenceStatus;
};

export type SteamListenTogetherProbeError =
  | 'probe_disabled'
  | 'steam_unavailable'
  | 'operation_in_progress'
  | 'invalid_room_id'
  | 'room_create_failed'
  | 'room_join_failed'
  | 'incompatible_room'
  | 'not_in_room'
  | 'not_room_host'
  | 'p2p_session_failed'
  | 'host_left';

export type SteamListenTogetherProbeSnapshot = {
  enabled: boolean;
  available: boolean;
  state: 'disabled' | 'idle' | 'creating' | 'joining' | 'connected' | 'error';
  role: 'none' | 'host' | 'guest';
  lobbyId: string | null;
  memberCount: number;
  transportRunning: boolean;
  protocolVersion: number;
  targetKbps: number;
  sentPackets: number;
  sentBytes: number;
  sendFailures: number;
  receivedPackets: number;
  receivedBytes: number;
  receivedKbps: number;
  estimatedLostPackets: number;
  estimatedLossPercent: number;
  averageRttMs: number | null;
  lastPacketAt: string | null;
  lastError: SteamListenTogetherProbeError | null;
};

export type SteamListenTogetherReactionId = 'heart' | 'fire' | 'headphones' | 'sparkles';

export type SteamListenTogetherError =
  | 'steam_unavailable'
  | 'operation_in_progress'
  | 'invalid_room_id'
  | 'room_create_failed'
  | 'room_join_failed'
  | 'incompatible_room'
  | 'not_in_room'
  | 'not_room_host'
  | 'transport_failed'
  | 'playback_sync_failed'
  | 'local_track_not_found';

export type SteamListenTogetherTrack = {
  key: string;
  title: string;
  artist: string | null;
  album: string | null;
  durationSeconds: number;
};

export type SteamListenTogetherPlayback = {
  state: 'idle' | 'loading' | 'playing' | 'paused' | 'stopped' | 'ended' | 'error';
  positionSeconds: number;
  durationSeconds: number;
  playbackRate: number;
  track: SteamListenTogetherTrack | null;
  receivedAt: string;
};

export type SteamListenTogetherReaction = {
  id: string;
  reaction: SteamListenTogetherReactionId;
  senderName: string;
  receivedAt: string;
};

export type SteamListenTogetherSnapshot = {
  available: boolean;
  state: 'idle' | 'creating' | 'joining' | 'connected' | 'error';
  role: 'none' | 'host' | 'guest';
  lobbyId: string | null;
  memberCount: number;
  memberLimit: number;
  localPlayerName: string | null;
  syncState:
    | 'not-in-room'
    | 'host'
    | 'waiting-for-host'
    | 'waiting-for-track'
    | 'syncing'
    | 'synced'
    | 'error';
  playback: SteamListenTogetherPlayback | null;
  recentReactions: SteamListenTogetherReaction[];
  lastHostUpdateAt: string | null;
  lastError: SteamListenTogetherError | null;
};

export type SteamLeaderboardBoardId =
  | 'listening-time'
  | 'completed-tracks'
  | 'listening-streak'
  | 'deep-session'
  | 'rediscovered-tracks';
export type SteamLeaderboardScope = 'global' | 'friends' | 'around-user';
export type SteamLeaderboardError =
  | 'steam_unavailable'
  | 'bridge_unavailable'
  | 'leaderboard_not_found'
  | 'invalid_board'
  | 'request_failed';

export type SteamLeaderboardEntry = {
  playerName: string | null;
  rank: number;
  score: number;
  isCurrentUser: boolean;
  details: SteamLeaderboardAggregateDetails;
};

export type SteamLeaderboardAggregateDetails = {
  completedUniqueTracks: number;
  listeningSessionCount: number;
  longestListeningSessionSeconds: number;
  longestListeningStreakDays: number;
  nightListeningSeconds: number;
  rediscoveredTrackCount: number;
  completedShortUniqueTracks: number;
};

export type SteamLeaderboardStatus = {
  enabled: boolean;
  available: boolean;
  lastSyncedAt: string | null;
  lastError: SteamLeaderboardError | null;
  boards: Array<{
    id: SteamLeaderboardBoardId;
    apiName: string;
    scoreUnit: 'seconds' | 'count';
    available: boolean;
    lastSubmittedScore: number | null;
    lastGlobalRank: number | null;
  }>;
};

export type SteamLeaderboardSnapshot = {
  status: SteamLeaderboardStatus;
  boardId: SteamLeaderboardBoardId;
  scope: SteamLeaderboardScope;
  entries: SteamLeaderboardEntry[];
};

export type SteamListeningStatId =
  | 'listening-minutes'
  | 'completed-plays'
  | 'unique-tracks'
  | 'longest-streak-days'
  | 'night-minutes'
  | 'longest-session-minutes'
  | 'rediscovered-tracks'
  | 'completed-albums';

export type SteamListeningStatSyncPolicy = 'achievement' | 'optional';

export type SteamListeningStatsError =
  | 'steam_unavailable'
  | 'stats_not_published'
  | 'write_failed'
  | 'store_failed'
  | 'request_failed';

export type SteamListeningStatsStatus = {
  enabled: boolean;
  available: boolean;
  syncState: 'idle' | 'syncing' | 'retrying' | 'synced' | 'error';
  pendingStore: boolean;
  pendingCount: number;
  lastAttemptedAt: string | null;
  lastSyncedAt: string | null;
  nextRetryAt: string | null;
  retryCount: number;
  lastUpdatedCount: number;
  lastError: SteamListeningStatsError | null;
  stats: Array<{
    id: SteamListeningStatId;
    apiName: string;
    unit: 'minutes' | 'count' | 'days';
    syncPolicy: SteamListeningStatSyncPolicy;
    available: boolean;
    localValue: number;
    steamValue: number | null;
    lastSubmittedValue: number | null;
  }>;
};
