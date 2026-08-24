import type { SteamLeaderboardHistoryStats } from '../../library/SteamAchievementHistoryStats';
import type {
  SteamListeningStatId,
  SteamListeningStatSyncPolicy,
  SteamListeningStatsError,
  SteamListeningStatsStatus,
} from '../../../shared/types/steam';
import type { SteamRuntimeService } from './SteamRuntimeService';

type SteamClientProvider = Pick<SteamRuntimeService, 'getClient'>;

type SteamListeningStatDefinition = {
  id: SteamListeningStatId;
  apiName: string;
  unit: 'minutes' | 'count' | 'days';
  syncPolicy: SteamListeningStatSyncPolicy;
  value(stats: SteamLeaderboardHistoryStats): number;
};

export const steamListeningStatDefinitions = [
  {
    id: 'listening-minutes',
    apiName: 'ECHO_STAT_LISTEN_MINUTES',
    unit: 'minutes',
    syncPolicy: 'achievement',
    value: (stats: SteamLeaderboardHistoryStats) => stats.totalPlayedSeconds / 60,
  },
  {
    id: 'completed-plays',
    apiName: 'ECHO_STAT_COMPLETED_PLAYS',
    unit: 'count',
    syncPolicy: 'achievement',
    value: (stats: SteamLeaderboardHistoryStats) => stats.qualifiedCompletedPlayCount,
  },
  {
    id: 'unique-tracks',
    apiName: 'ECHO_STAT_UNIQUE_TRACKS',
    unit: 'count',
    syncPolicy: 'achievement',
    value: (stats: SteamLeaderboardHistoryStats) => stats.completedUniqueTracks,
  },
  {
    id: 'longest-streak-days',
    apiName: 'ECHO_STAT_LONGEST_STREAK_DAYS',
    unit: 'days',
    syncPolicy: 'achievement',
    value: (stats: SteamLeaderboardHistoryStats) => stats.longestCompletionStreakDays,
  },
  {
    id: 'night-minutes',
    apiName: 'ECHO_STAT_NIGHT_MINUTES',
    unit: 'minutes',
    syncPolicy: 'achievement',
    value: (stats: SteamLeaderboardHistoryStats) => stats.nightPlayedSeconds / 60,
  },
  {
    id: 'longest-session-minutes',
    apiName: 'ECHO_STAT_LONGEST_SESSION_MINUTES',
    unit: 'minutes',
    syncPolicy: 'optional',
    value: (stats: SteamLeaderboardHistoryStats) => stats.longestListeningSessionSeconds / 60,
  },
  {
    id: 'rediscovered-tracks',
    apiName: 'ECHO_STAT_REDISCOVERED_TRACKS',
    unit: 'count',
    syncPolicy: 'optional',
    value: (stats: SteamLeaderboardHistoryStats) => stats.rediscoveredTrackCount,
  },
  {
    id: 'completed-albums',
    apiName: 'ECHO_STAT_COMPLETED_ALBUMS',
    unit: 'count',
    syncPolicy: 'achievement',
    value: (stats: SteamLeaderboardHistoryStats) => stats.completedUniqueAlbums,
  },
] as const satisfies readonly SteamListeningStatDefinition[];

const maximumStatValue = 2_147_483_647;
const normalizeStatValue = (value: number): number =>
  Math.max(0, Math.min(maximumStatValue, Math.floor(Number.isFinite(value) ? value : 0)));

const emptyStatus = (enabled: boolean): SteamListeningStatsStatus => ({
  enabled,
  available: false,
  syncState: 'idle',
  pendingStore: false,
  pendingCount: 0,
  lastAttemptedAt: null,
  lastSyncedAt: null,
  nextRetryAt: null,
  retryCount: 0,
  lastUpdatedCount: 0,
  lastError: enabled ? 'steam_unavailable' : null,
  stats: steamListeningStatDefinitions.map(({ id, apiName, unit, syncPolicy }) => ({
    id,
    apiName,
    unit,
    syncPolicy,
    available: false,
    localValue: 0,
    steamValue: null,
    lastSubmittedValue: null,
  })),
});

type SteamListeningStatsServiceOptions = {
  runtime: SteamClientProvider;
  now?: () => Date;
};

export class SteamListeningStatsService {
  private readonly runtime: SteamClientProvider;
  private readonly now: () => Date;
  private status = emptyStatus(false);
  private pendingStore = false;
  private operation: Promise<unknown> = Promise.resolve();

  constructor(options: SteamListeningStatsServiceOptions) {
    this.runtime = options.runtime;
    this.now = options.now ?? (() => new Date());
  }

  getStatus(enabled: boolean): SteamListeningStatsStatus {
    return { ...this.status, enabled };
  }

  setRetryState(enabled: boolean, nextRetryAt: string | null, retryCount: number): SteamListeningStatsStatus {
    this.status = {
      ...this.status,
      enabled,
      syncState: nextRetryAt ? 'retrying' : this.status.lastSyncedAt ? 'synced' : 'idle',
      nextRetryAt,
      retryCount,
    };
    return this.getStatus(enabled);
  }

  preview(stats: SteamLeaderboardHistoryStats, enabled: boolean): SteamListeningStatsStatus {
    this.status = {
      ...this.status,
      enabled,
      stats: steamListeningStatDefinitions.map((definition, index) => ({
        ...(this.status.stats[index] ?? {
          id: definition.id,
          apiName: definition.apiName,
          unit: definition.unit,
          available: false,
          steamValue: null,
          lastSubmittedValue: null,
        }),
        localValue: normalizeStatValue(definition.value(stats)),
      })),
    };
    return this.getStatus(enabled);
  }

  sync(stats: SteamLeaderboardHistoryStats, optionalStatsEnabled: boolean): Promise<SteamListeningStatsStatus> {
    return this.serialize(async () => {
      this.preview(stats, optionalStatsEnabled);
      const attemptedAt = this.now().toISOString();
      this.status = {
        ...this.status,
        syncState: 'syncing',
        lastAttemptedAt: attemptedAt,
        nextRetryAt: null,
        lastUpdatedCount: 0,
      };

      const client = this.runtime.getClient();
      if (!client) return this.fail('steam_unavailable');

      try {
        const syncedDefinitions = steamListeningStatDefinitions.filter((definition) =>
          definition.syncPolicy === 'achievement' || optionalStatsEnabled);
        const remoteValues = new Map<string, number | null>(syncedDefinitions.map((definition) => [
          definition.apiName,
          client.stats.getInt(definition.apiName),
        ]));
        this.status = {
          ...this.status,
          stats: this.status.stats.map((stat) => ({
            ...stat,
            available: remoteValues.has(stat.apiName) && remoteValues.get(stat.apiName) !== null,
            steamValue: remoteValues.has(stat.apiName) && remoteValues.get(stat.apiName) !== null
              ? normalizeStatValue(remoteValues.get(stat.apiName) ?? 0)
              : stat.steamValue,
          })),
        };
        if ([...remoteValues.values()].some((value) => value === null)) {
          return this.fail('stats_not_published');
        }

        const pendingCount = syncedDefinitions.reduce((count, definition) => {
          const remoteValue = normalizeStatValue(remoteValues.get(definition.apiName) ?? 0);
          const localValue = normalizeStatValue(definition.value(stats));
          return count + (localValue > remoteValue ? 1 : 0);
        }, this.pendingStore ? 1 : 0);
        this.status = { ...this.status, pendingCount };

        const submittedValues = new Map<string, number>();
        let changedCount = 0;
        for (const definition of syncedDefinitions) {
          const remoteValue = normalizeStatValue(remoteValues.get(definition.apiName) ?? 0);
          const localValue = normalizeStatValue(definition.value(stats));
          const nextValue = Math.max(remoteValue, localValue);
          if (nextValue > remoteValue) {
            if (!client.stats.setInt(definition.apiName, nextValue)) {
              return this.fail('write_failed');
            }
            this.pendingStore = true;
            changedCount += 1;
          }
          submittedValues.set(definition.apiName, nextValue);
        }

        this.status = { ...this.status, pendingStore: this.pendingStore, lastUpdatedCount: changedCount };
        if (this.pendingStore) {
          if (!client.stats.store()) {
            return this.fail('store_failed');
          }
          this.pendingStore = false;
        }

        this.status = {
          enabled: optionalStatsEnabled,
          available: true,
          syncState: 'synced',
          pendingStore: false,
          pendingCount: 0,
          lastAttemptedAt: attemptedAt,
          lastSyncedAt: attemptedAt,
          nextRetryAt: null,
          retryCount: 0,
          lastUpdatedCount: changedCount,
          lastError: null,
          stats: this.status.stats.map((stat) => submittedValues.has(stat.apiName) ? {
            ...stat,
            available: true,
            steamValue: submittedValues.get(stat.apiName) ?? 0,
            lastSubmittedValue: submittedValues.get(stat.apiName) ?? 0,
          } : stat),
        };
        return this.status;
      } catch {
        return this.fail('request_failed');
      }
    }) as Promise<SteamListeningStatsStatus>;
  }

  private fail(error: SteamListeningStatsError): SteamListeningStatsStatus {
    this.status = {
      ...this.status,
      enabled: this.status.enabled,
      available: false,
      syncState: 'error',
      pendingStore: this.pendingStore,
      lastError: error,
    };
    return this.status;
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operation.then(operation, operation);
    this.operation = next.then(() => undefined, () => undefined);
    return next;
  }
}
