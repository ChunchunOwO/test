import { randomUUID } from 'node:crypto';
import type { EchoDatabase } from '../database/createDatabase';

export type SteamAchievementPlaybackFactInput = {
  trackId: string;
  artist: string;
  startedAtMs: number;
  endedAtMs: number;
  playedSeconds: number;
  durationSeconds: number;
  qualifiedCompletion: boolean;
};

export type SteamAchievementPlaybackFact = SteamAchievementPlaybackFactInput & {
  id: string;
  source: 'audio-core' | 'legacy-history';
};

export type SteamAchievementPlaybackFactQuery = {
  trackId?: string;
  fromMs?: number;
  toMs?: number;
  qualifiedOnly?: boolean;
};

export type SteamAchievementHistoryStats = {
  totalPlayedSeconds: number;
  completedUniqueTracks: number;
  qualifiedCompletedPlayCount: number;
  longestCompletionStreakDays: number;
  nightPlayedSeconds: number;
  hasFavoriteAlbum: boolean;
  completedShortUniqueTracks: number;
  hasCompletedZhaoXiaoliuTrack: boolean;
  completedUniqueAlbums: number;
};

export type SteamLeaderboardHistoryStats = SteamAchievementHistoryStats & {
  listeningSessionCount: number;
  longestListeningSessionSeconds: number;
  rediscoveredTrackCount: number;
};

type DbRow = Record<string, unknown>;

const numberFrom = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const getRow = (database: EchoDatabase, sql: string): DbRow =>
  (database.prepare(sql).get() as DbRow | undefined) ?? {};

export const recordSteamAchievementPlaybackFact = (
  database: EchoDatabase,
  input: SteamAchievementPlaybackFactInput,
): void => {
  const trackId = input.trackId.trim();
  if (!trackId || !Number.isFinite(input.startedAtMs) || !Number.isFinite(input.endedAtMs)) {
    return;
  }
  const startedAtMs = Math.max(0, input.startedAtMs);
  const endedAtMs = Math.max(startedAtMs, input.endedAtMs);
  database.prepare(`
    INSERT INTO steam_achievement_playback_facts (
      id, track_id, artist, started_at, ended_at, played_seconds,
      duration_seconds, qualified_completion, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'audio-core')
  `).run(
    randomUUID(),
    trackId,
    input.artist,
    new Date(startedAtMs).toISOString(),
    new Date(endedAtMs).toISOString(),
    numberFrom(input.playedSeconds),
    numberFrom(input.durationSeconds),
    input.qualifiedCompletion ? 1 : 0,
  );
};

export const getSteamAchievementPlaybackFacts = (
  database: EchoDatabase,
  query: SteamAchievementPlaybackFactQuery = {},
): SteamAchievementPlaybackFact[] => {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (query.trackId) {
    clauses.push('track_id = ?');
    params.push(query.trackId);
  }
  if (Number.isFinite(query.fromMs)) {
    clauses.push('ended_at >= ?');
    params.push(new Date(query.fromMs!).toISOString());
  }
  if (Number.isFinite(query.toMs)) {
    clauses.push('ended_at < ?');
    params.push(new Date(query.toMs!).toISOString());
  }
  if (query.qualifiedOnly) {
    clauses.push('qualified_completion > 0');
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = database.prepare(`SELECT * FROM steam_achievement_playback_facts ${where} ORDER BY ended_at DESC`).all(...params) as DbRow[];
  return rows.map((row) => ({
    id: String(row.id),
    trackId: String(row.track_id),
    artist: String(row.artist ?? ''),
    startedAtMs: Date.parse(String(row.started_at)),
    endedAtMs: Date.parse(String(row.ended_at)),
    playedSeconds: numberFrom(row.played_seconds),
    durationSeconds: numberFrom(row.duration_seconds),
    qualifiedCompletion: numberFrom(row.qualified_completion) > 0,
    source: row.source === 'legacy-history' ? 'legacy-history' : 'audio-core',
  }));
};

export const getSteamAchievementHistoryStats = (
  database: EchoDatabase,
): SteamAchievementHistoryStats => {
  const totals = getRow(database, `SELECT
    COALESCE(SUM(played_seconds), 0) AS total_played_seconds,
    COUNT(DISTINCT CASE WHEN qualified_completion > 0 THEN track_id END) AS completed_unique_tracks,
    COALESCE(SUM(CASE WHEN qualified_completion > 0 THEN 1 ELSE 0 END), 0) AS qualified_completed_play_count
    FROM steam_achievement_playback_facts`);
  const streak = getRow(database, `WITH completion_days AS (
      SELECT DISTINCT date(ended_at, 'localtime') AS active_date
      FROM steam_achievement_playback_facts
      WHERE qualified_completion > 0
    ), grouped_days AS (
      SELECT active_date, julianday(active_date) - ROW_NUMBER() OVER (ORDER BY active_date) AS streak_group
      FROM completion_days
    ), streaks AS (
      SELECT COUNT(*) AS streak_days FROM grouped_days GROUP BY streak_group
    )
    SELECT COALESCE(MAX(streak_days), 0) AS longest_completion_streak_days FROM streaks`);
  const night = getRow(database, `SELECT COALESCE(SUM(played_seconds), 0) AS night_played_seconds
    FROM steam_achievement_playback_facts
    WHERE strftime('%H', started_at, 'localtime') IN ('00', '01', '02', '03', '04')`);
  const favoriteAlbum = getRow(database, `WITH album_track_completions AS (
      SELECT album_tracks.album_id, album_tracks.track_id, COUNT(facts.id) AS completed_count
      FROM album_tracks
      INNER JOIN tracks ON tracks.id = album_tracks.track_id AND tracks.missing = 0
      LEFT JOIN steam_achievement_playback_facts AS facts
        ON facts.track_id = album_tracks.track_id AND facts.qualified_completion > 0
      GROUP BY album_tracks.album_id, album_tracks.track_id
    ), qualifying_albums AS (
      SELECT album_id FROM album_track_completions GROUP BY album_id
      HAVING COUNT(*) >= 4 AND MIN(completed_count) >= 3
    )
    SELECT EXISTS(SELECT 1 FROM qualifying_albums) AS has_favorite_album`);
  const shortTracks = getRow(database, `SELECT COUNT(DISTINCT facts.track_id) AS completed_short_unique_tracks
    FROM steam_achievement_playback_facts AS facts
    INNER JOIN tracks ON tracks.id = facts.track_id AND tracks.missing = 0
    WHERE facts.qualified_completion > 0
      AND COALESCE(tracks.duration, 0) > 0
      AND tracks.duration <= 60`);
  const zhaoXiaoliu = getRow(database, `SELECT EXISTS(
      SELECT 1 FROM steam_achievement_playback_facts
      WHERE qualified_completion > 0 AND INSTR(artist, '赵小六') > 0
    ) AS has_completed_zhao_xiaoliu_track`);
  const completedAlbums = getRow(database, `SELECT COUNT(DISTINCT album_tracks.album_id) AS completed_unique_albums
    FROM steam_achievement_playback_facts AS facts
    INNER JOIN album_tracks ON album_tracks.track_id = facts.track_id
    INNER JOIN tracks ON tracks.id = facts.track_id AND tracks.missing = 0
    WHERE facts.qualified_completion > 0`);

  return {
    totalPlayedSeconds: numberFrom(totals.total_played_seconds),
    completedUniqueTracks: numberFrom(totals.completed_unique_tracks),
    qualifiedCompletedPlayCount: numberFrom(totals.qualified_completed_play_count),
    longestCompletionStreakDays: numberFrom(streak.longest_completion_streak_days),
    nightPlayedSeconds: numberFrom(night.night_played_seconds),
    hasFavoriteAlbum: numberFrom(favoriteAlbum.has_favorite_album) > 0,
    completedShortUniqueTracks: numberFrom(shortTracks.completed_short_unique_tracks),
    hasCompletedZhaoXiaoliuTrack: numberFrom(zhaoXiaoliu.has_completed_zhao_xiaoliu_track) > 0,
    completedUniqueAlbums: numberFrom(completedAlbums.completed_unique_albums),
  };
};
