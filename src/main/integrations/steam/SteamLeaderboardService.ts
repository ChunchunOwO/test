import type { SteamLeaderboardHistoryStats } from '../../library/SteamAchievementHistoryStats';
import type {
  SteamLeaderboardAggregateDetails,
  SteamLeaderboardBoardId,
  SteamLeaderboardEntry,
  SteamLeaderboardError,
  SteamLeaderboardScope,
  SteamLeaderboardSnapshot,
  SteamLeaderboardStatus,
} from '../../../shared/types/steam';
import type { SteamRuntimeService } from './SteamRuntimeService';
import {
  loadSteamLeaderboardNativeBinding,
  type SteamLeaderboardNativeBinding,
} from './SteamLeaderboardNative';

type SteamClientProvider = Pick<SteamRuntimeService, 'getClient'>;

type SteamLeaderboardDefinition = {
  id: SteamLeaderboardBoardId;
  apiName: string;
  scoreUnit: 'seconds' | 'count';
  score(stats: SteamLeaderboardHistoryStats): number;
};

export const steamLeaderboardDefinitions = [
  {
    id: 'listening-time',
    apiName: 'ECHO_LISTENING_SECONDS_V1',
    scoreUnit: 'seconds',
    score: (stats: SteamLeaderboardHistoryStats) => stats.totalPlayedSeconds,
  },
  {
    id: 'completed-tracks',
    apiName: 'ECHO_COMPLETED_TRACKS_V1',
    scoreUnit: 'count',
    score: (stats: SteamLeaderboardHistoryStats) => stats.completedUniqueTracks,
  },
  {
    id: 'listening-streak',
    apiName: 'ECHO_LONGEST_STREAK_DAYS_V1',
    scoreUnit: 'count',
    score: (stats: SteamLeaderboardHistoryStats) => stats.longestCompletionStreakDays,
  },
  {
    id: 'deep-session',
    apiName: 'ECHO_LONGEST_SESSION_SECONDS_V1',
    scoreUnit: 'seconds',
    score: (stats: SteamLeaderboardHistoryStats) => stats.longestListeningSessionSeconds,
  },
  {
    id: 'rediscovered-tracks',
    apiName: 'ECHO_REDISCOVERED_TRACKS_V1',
    scoreUnit: 'count',
    score: (stats: SteamLeaderboardHistoryStats) => stats.rediscoveredTrackCount,
  },
] as const satisfies readonly SteamLeaderboardDefinition[];

const maximumLeaderboardScore = 2_147_483_647;
const transientRequestRetryDelaysMs = [250, 750] as const;

const retryTransientSteamRequest = async <T>(operation: () => Promise<T>): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 0; attempt <= transientRequestRetryDelaysMs.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const retryDelay = transientRequestRetryDelaysMs[attempt];
      if (retryDelay !== undefined) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
  }
  throw lastError;
};

const normalizeScore = (value: number): number =>
  Math.max(0, Math.min(maximumLeaderboardScore, Math.floor(Number.isFinite(value) ? value : 0)));

const aggregateDetails = (stats: SteamLeaderboardHistoryStats): number[] => [
  stats.completedUniqueTracks,
  stats.listeningSessionCount,
  stats.longestListeningSessionSeconds,
  stats.longestCompletionStreakDays,
  stats.nightPlayedSeconds,
  stats.rediscoveredTrackCount,
  stats.completedShortUniqueTracks,
].map(normalizeScore);

const entryDetails = (details: readonly number[]): SteamLeaderboardAggregateDetails => ({
  completedUniqueTracks: normalizeScore(details[0] ?? 0),
  listeningSessionCount: normalizeScore(details[1] ?? 0),
  longestListeningSessionSeconds: normalizeScore(details[2] ?? 0),
  longestListeningStreakDays: normalizeScore(details[3] ?? 0),
  nightListeningSeconds: normalizeScore(details[4] ?? 0),
  rediscoveredTrackCount: normalizeScore(details[5] ?? 0),
  completedShortUniqueTracks: normalizeScore(details[6] ?? 0),
});

const scopeRequest: Record<SteamLeaderboardScope, { request: 0 | 1 | 2; start: number; end: number }> = {
  global: { request: 0, start: 1, end: 50 },
  friends: { request: 2, start: 0, end: 0 },
  'around-user': { request: 1, start: -4, end: 5 },
};

const emptyStatus = (enabled: boolean): SteamLeaderboardStatus => ({
  enabled,
  available: false,
  lastSyncedAt: null,
  lastError: enabled ? 'steam_unavailable' : null,
  boards: steamLeaderboardDefinitions.map(({ id, apiName, scoreUnit }) => ({
    id,
    apiName,
    scoreUnit,
    available: false,
    lastSubmittedScore: null,
    lastGlobalRank: null,
  })),
});

type SteamLeaderboardServiceOptions = {
  runtime: SteamClientProvider;
  loadBinding?: () => SteamLeaderboardNativeBinding;
  now?: () => Date;
};

export class SteamLeaderboardService {
  private readonly runtime: SteamClientProvider;
  private readonly loadBinding: () => SteamLeaderboardNativeBinding;
  private readonly now: () => Date;
  private binding: SteamLeaderboardNativeBinding | null = null;
  private bindingAttempted = false;
  private readonly handles = new Map<SteamLeaderboardBoardId, bigint>();
  private status = emptyStatus(false);
  private operation: Promise<unknown> = Promise.resolve();

  constructor(options: SteamLeaderboardServiceOptions) {
    this.runtime = options.runtime;
    this.loadBinding = options.loadBinding ?? loadSteamLeaderboardNativeBinding;
    this.now = options.now ?? (() => new Date());
  }

  getStatus(enabled: boolean): SteamLeaderboardStatus {
    if (!enabled) return { ...this.status, enabled: false, lastError: null };
    return { ...this.status, enabled: true };
  }

  sync(stats: SteamLeaderboardHistoryStats, enabled: boolean): Promise<SteamLeaderboardStatus> {
    return this.serialize(async () => {
      if (!enabled) {
        this.status = { ...this.status, enabled: false, lastError: null };
        return this.status;
      }
      const binding = this.getBinding();
      if (!binding) return this.fail('bridge_unavailable', true);

      let successfulBoards = 0;
      let lastError: SteamLeaderboardError | null = null;
      const details = aggregateDetails(stats);
      for (const definition of steamLeaderboardDefinitions) {
        try {
          const handle = await retryTransientSteamRequest(() => this.getHandle(binding, definition));
          const score = normalizeScore(definition.score(stats));
          const result = await retryTransientSteamRequest(() => binding.uploadScore(handle, score, details));
          successfulBoards += 1;
          this.updateBoard(definition.id, {
            available: true,
            lastSubmittedScore: score,
            lastGlobalRank: result.globalRank > 0 ? result.globalRank : null,
          });
        } catch {
          lastError = 'request_failed';
          this.updateBoard(definition.id, { available: false });
        }
      }
      this.status = {
        ...this.status,
        enabled: true,
        available: successfulBoards > 0,
        lastSyncedAt: successfulBoards > 0 ? this.now().toISOString() : this.status.lastSyncedAt,
        lastError,
      };
      return this.status;
    }) as Promise<SteamLeaderboardStatus>;
  }

  getSnapshot(
    boardId: SteamLeaderboardBoardId,
    scope: SteamLeaderboardScope,
    enabled: boolean,
  ): Promise<SteamLeaderboardSnapshot> {
    return this.serialize(async () => {
      if (!enabled) return { status: this.getStatus(false), boardId, scope, entries: [] };
      const definition = steamLeaderboardDefinitions.find((item) => item.id === boardId);
      if (!definition) return { status: this.fail('invalid_board', true), boardId, scope, entries: [] };
      const binding = this.getBinding();
      if (!binding) return { status: this.fail('bridge_unavailable', true), boardId, scope, entries: [] };

      try {
        const handle = await retryTransientSteamRequest(() => this.getHandle(binding, definition));
        const range = scopeRequest[scope];
        const currentSteamId = this.getCurrentSteamId();
        const currentPlayerName = this.runtime.getClient()?.localplayer.getName()?.trim() || null;
        const entries = await retryTransientSteamRequest(() =>
          binding.downloadEntries(handle, range.request, range.start, range.end));
        const normalizedEntries: SteamLeaderboardEntry[] = entries.map((entry) => ({
          playerName: entry.playerName || (entry.steamId === currentSteamId ? currentPlayerName : null),
          rank: entry.rank,
          score: entry.score,
          isCurrentUser: entry.steamId === currentSteamId,
          details: entryDetails(entry.details ?? []),
        }));
        const currentEntry = normalizedEntries.find((entry) => entry.isCurrentUser);
        this.updateBoard(boardId, {
          available: true,
          ...(currentEntry && currentEntry.rank > 0 ? { lastGlobalRank: currentEntry.rank } : {}),
        });
        this.status = { ...this.status, enabled: true, available: true, lastError: null };
        return { status: this.status, boardId, scope, entries: normalizedEntries };
      } catch {
        return {
          status: this.fail(this.handles.has(boardId) ? 'request_failed' : 'leaderboard_not_found', true),
          boardId,
          scope,
          entries: [],
        };
      }
    }) as Promise<SteamLeaderboardSnapshot>;
  }

  private getBinding(): SteamLeaderboardNativeBinding | null {
    if (!this.runtime.getClient()) {
      this.fail('steam_unavailable', true);
      return null;
    }
    if (this.binding) return this.binding;
    if (this.bindingAttempted) return null;
    this.bindingAttempted = true;
    try {
      this.binding = this.loadBinding();
      return this.binding;
    } catch {
      return null;
    }
  }

  private async getHandle(
    binding: SteamLeaderboardNativeBinding,
    definition: SteamLeaderboardDefinition,
  ): Promise<bigint> {
    const cached = this.handles.get(definition.id);
    if (cached) return cached;
    const handle = await binding.findLeaderboard(definition.apiName);
    this.handles.set(definition.id, handle);
    return handle;
  }

  private getCurrentSteamId(): string | null {
    try {
      return this.runtime.getClient()?.localplayer.getSteamId().steamId64.toString() ?? null;
    } catch {
      return null;
    }
  }

  private updateBoard(
    boardId: SteamLeaderboardBoardId,
    patch: Partial<SteamLeaderboardStatus['boards'][number]>,
  ): void {
    this.status = {
      ...this.status,
      boards: this.status.boards.map((board) => board.id === boardId ? { ...board, ...patch } : board),
    };
  }

  private fail(error: SteamLeaderboardError, enabled: boolean): SteamLeaderboardStatus {
    this.status = { ...this.status, enabled, available: false, lastError: error };
    return this.status;
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operation.then(operation, operation);
    this.operation = next.then(() => undefined, () => undefined);
    return next;
  }
}
