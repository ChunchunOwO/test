import type { EchoDatabase } from '../database/createDatabase';
import type {
  PlaybackHistoryQuery,
  PlaybackStatsInsights,
  PlaybackStatsPeriodTotals,
} from '../../shared/types/library';

type DbRow = Record<string, unknown>;

const sessionGapSeconds = 30 * 60;
const rediscoveryGapDays = 45;

const numberFrom = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const textFrom = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

const allRows = (database: EchoDatabase, sql: string, params: readonly unknown[] = []): DbRow[] =>
  database.prepare(sql).all(...params) as DbRow[];

const getRow = (database: EchoDatabase, sql: string, params: readonly unknown[] = []): DbRow =>
  (database.prepare(sql).get(...params) as DbRow | undefined) ?? {};

const historyKeySql = "COALESCE(history.stable_key, history.track_id, history.track_path)";

const baseFilter = (
  query: PlaybackHistoryQuery | undefined,
  options: { includeRange: boolean },
): { clauses: string[]; params: unknown[] } => {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (options.includeRange && textFrom(query?.from)) {
    clauses.push('history.started_at >= ?');
    params.push(query?.from);
  }

  if (options.includeRange && textFrom(query?.to)) {
    clauses.push('history.started_at < ?');
    params.push(query?.to);
  }

  if (query?.completedOnly === true) {
    clauses.push('history.completed > 0');
  }

  if (query?.mediaType === 'local' || query?.mediaType === 'streaming') {
    clauses.push('history.media_type = ?');
    params.push(query.mediaType);
  }

  return { clauses, params };
};

const whereSql = (clauses: readonly string[]): string =>
  clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

const aggregatePeriod = (
  database: EchoDatabase,
  query: PlaybackHistoryQuery | undefined,
  from: string,
  to: string,
): PlaybackStatsPeriodTotals => {
  const filter = baseFilter(query, { includeRange: false });
  filter.clauses.push('history.started_at >= ?', 'history.started_at < ?');
  filter.params.push(from, to);
  const row = getRow(
    database,
    `SELECT
       COUNT(*) AS play_count,
       COALESCE(SUM(history.played_seconds), 0) AS played_seconds,
       COUNT(DISTINCT ${historyKeySql}) AS unique_tracks
     FROM playback_history AS history
     ${whereSql(filter.clauses)}`,
    filter.params,
  );

  return {
    playCount: numberFrom(row.play_count),
    playedSeconds: numberFrom(row.played_seconds),
    uniqueTracks: numberFrom(row.unique_tracks),
  };
};

const periodComparison = (
  database: EchoDatabase,
  query: PlaybackHistoryQuery | undefined,
): PlaybackStatsInsights['comparison'] => {
  const from = textFrom(query?.from);
  const to = textFrom(query?.to);
  const fromMs = from ? Date.parse(from) : Number.NaN;
  const toMs = to ? Date.parse(to) : Number.NaN;

  if (!from || !to || !Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
    return null;
  }

  const previousFrom = new Date(fromMs - (toMs - fromMs)).toISOString();
  return {
    current: aggregatePeriod(database, query, from, to),
    previous: aggregatePeriod(database, query, previousFrom, from),
  };
};

const streakSummary = (dates: readonly string[]): { current: number; longest: number } => {
  const sorted = Array.from(new Set(dates.filter(Boolean))).sort();
  if (sorted.length === 0) {
    return { current: 0, longest: 0 };
  }

  let longest = 1;
  let running = 1;
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = Date.parse(`${sorted[index - 1]}T00:00:00.000Z`);
    const current = Date.parse(`${sorted[index]}T00:00:00.000Z`);
    running = current - previous === 86_400_000 ? running + 1 : 1;
    longest = Math.max(longest, running);
  }

  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const yesterday = new Date(today.getTime() - 86_400_000).toISOString().slice(0, 10);
  const latest = sorted.at(-1);
  if (latest !== todayKey && latest !== yesterday) {
    return { current: 0, longest };
  }

  let current = 1;
  for (let index = sorted.length - 1; index > 0; index -= 1) {
    const right = Date.parse(`${sorted[index]}T00:00:00.000Z`);
    const left = Date.parse(`${sorted[index - 1]}T00:00:00.000Z`);
    if (right - left !== 86_400_000) {
      break;
    }
    current += 1;
  }

  return { current, longest };
};

const sessionSummary = (
  database: EchoDatabase,
  query: PlaybackHistoryQuery | undefined,
): PlaybackStatsInsights['sessions'] => {
  const filter = baseFilter(query, { includeRange: true });
  const row = getRow(
    database,
    `WITH filtered AS (
       SELECT
         history.id,
         history.started_at,
         COALESCE(history.ended_at, history.started_at) AS ended_at,
         MAX(0, history.played_seconds) AS played_seconds
       FROM playback_history AS history
       ${whereSql(filter.clauses)}
     ), ordered AS (
       SELECT
         filtered.*,
         LAG(filtered.ended_at) OVER (ORDER BY filtered.started_at, filtered.id) AS previous_ended_at
       FROM filtered
     ), marked AS (
       SELECT
         ordered.*,
         CASE
           WHEN previous_ended_at IS NULL THEN 1
           WHEN (julianday(started_at) - julianday(previous_ended_at)) * 86400 > ${sessionGapSeconds} THEN 1
           ELSE 0
         END AS starts_session
       FROM ordered
     ), grouped AS (
       SELECT
         marked.*,
         SUM(starts_session) OVER (ORDER BY started_at, id) AS session_id
       FROM marked
     ), sessions AS (
       SELECT
         session_id,
         COUNT(*) AS track_count,
         SUM(played_seconds) AS played_seconds
       FROM grouped
       GROUP BY session_id
     )
     SELECT
       COUNT(*) AS session_count,
       COALESCE(AVG(played_seconds), 0) AS average_played_seconds,
       COALESCE(MAX(played_seconds), 0) AS longest_played_seconds,
       COALESCE(AVG(track_count), 0) AS average_track_count
     FROM sessions`,
    filter.params,
  );
  const dateRows = allRows(
    database,
    `SELECT DISTINCT substr(history.started_at, 1, 10) AS date
     FROM playback_history AS history
     ${whereSql(filter.clauses)}
     ORDER BY date`,
    filter.params,
  );
  const dates = dateRows.map((item) => String(item.date ?? '')).filter(Boolean);
  const streaks = streakSummary(dates);

  return {
    sessionCount: numberFrom(row.session_count),
    averagePlayedSeconds: numberFrom(row.average_played_seconds),
    longestPlayedSeconds: numberFrom(row.longest_played_seconds),
    averageTrackCount: numberFrom(row.average_track_count),
    activeDays: dates.length,
    currentStreakDays: streaks.current,
    longestStreakDays: streaks.longest,
  };
};

const discoverySummary = (
  database: EchoDatabase,
  query: PlaybackHistoryQuery | undefined,
): PlaybackStatsInsights['discovery'] => {
  const currentFilter = baseFilter(query, { includeRange: true });
  const lifetimeFilter = baseFilter(query, { includeRange: false });
  const from = textFrom(query?.from);
  const to = textFrom(query?.to);
  const currentRow = getRow(
    database,
    `WITH current_tracks AS (
       SELECT ${historyKeySql} AS history_key, COUNT(*) AS play_count
       FROM playback_history AS history
       ${whereSql(currentFilter.clauses)}
       GROUP BY history_key
     ), lifetime_tracks AS (
       SELECT ${historyKeySql} AS history_key, MIN(history.started_at) AS first_played_at
       FROM playback_history AS history
       ${whereSql(lifetimeFilter.clauses)}
       GROUP BY history_key
     )
     SELECT
       COUNT(*) AS unique_tracks,
       COALESCE(SUM(current_tracks.play_count), 0) AS play_count,
       COALESCE(SUM(CASE WHEN current_tracks.play_count > 1 THEN 1 ELSE 0 END), 0) AS replayed_tracks,
       COALESCE(SUM(CASE WHEN lifetime_tracks.first_played_at >= COALESCE(?, lifetime_tracks.first_played_at) THEN 1 ELSE 0 END), 0) AS new_tracks,
       COALESCE(SUM(CASE WHEN ? IS NOT NULL AND lifetime_tracks.first_played_at < ? THEN 1 ELSE 0 END), 0) AS returning_tracks
     FROM current_tracks
     INNER JOIN lifetime_tracks ON lifetime_tracks.history_key = current_tracks.history_key`,
    [...currentFilter.params, ...lifetimeFilter.params, from, from, from],
  );
  const timelineFilter = baseFilter(query, { includeRange: false });
  const rangeClauses: string[] = [];
  const rangeParams: unknown[] = [];
  if (from) {
    rangeClauses.push('started_at >= ?');
    rangeParams.push(from);
  }
  if (to) {
    rangeClauses.push('started_at < ?');
    rangeParams.push(to);
  }
  const rediscoveryRow = getRow(
    database,
    `WITH timeline AS (
       SELECT
         ${historyKeySql} AS history_key,
         history.started_at,
         LAG(history.started_at) OVER (
           PARTITION BY ${historyKeySql}
           ORDER BY history.started_at, history.id
         ) AS previous_started_at
       FROM playback_history AS history
       ${whereSql(timelineFilter.clauses)}
     )
     SELECT COUNT(DISTINCT history_key) AS rediscovered_tracks
     FROM timeline
     ${whereSql([
       ...rangeClauses,
       'previous_started_at IS NOT NULL',
       `(julianday(started_at) - julianday(previous_started_at)) >= ${rediscoveryGapDays}`,
     ])}`,
    [...timelineFilter.params, ...rangeParams],
  );
  const playCount = numberFrom(currentRow.play_count);
  const uniqueTracks = numberFrom(currentRow.unique_tracks);

  return {
    hasBoundedRange: Boolean(from && to),
    newTrackCount: from ? numberFrom(currentRow.new_tracks) : uniqueTracks,
    returningTrackCount: from ? numberFrom(currentRow.returning_tracks) : 0,
    replayedTrackCount: numberFrom(currentRow.replayed_tracks),
    repeatPlayRate: playCount > 0 ? Math.max(0, playCount - uniqueTracks) / playCount : 0,
    rediscoveredTrackCount: numberFrom(rediscoveryRow.rediscovered_tracks),
  };
};

export const getPlaybackStatsInsights = (
  database: EchoDatabase,
  query?: PlaybackHistoryQuery,
): PlaybackStatsInsights => ({
  comparison: periodComparison(database, query),
  sessions: sessionSummary(database, query),
  discovery: discoverySummary(database, query),
});
