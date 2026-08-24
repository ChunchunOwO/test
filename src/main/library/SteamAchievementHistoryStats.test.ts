import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { EchoDatabase } from '../database/createDatabase';
import {
  getSteamAchievementHistoryStats,
  recordSteamAchievementPlaybackFact,
} from './SteamAchievementHistoryStats';

const createDatabase = (): DatabaseSync => {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE tracks (id TEXT PRIMARY KEY, missing INTEGER NOT NULL DEFAULT 0, duration REAL);
    CREATE TABLE album_tracks (album_id TEXT NOT NULL, track_id TEXT NOT NULL);
    CREATE TABLE steam_achievement_playback_facts (
      id TEXT PRIMARY KEY,
      track_id TEXT NOT NULL,
      artist TEXT NOT NULL DEFAULT '',
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL,
      played_seconds REAL NOT NULL,
      duration_seconds REAL NOT NULL,
      qualified_completion INTEGER NOT NULL,
      source TEXT NOT NULL
    );
  `);
  return database;
};

const insertFact = (
  database: DatabaseSync,
  id: string,
  trackId: string,
  startedAt: Date,
  playedSeconds: number,
  qualifiedCompletion: boolean,
  artist = 'ECHO',
): void => {
  database.prepare(`INSERT INTO steam_achievement_playback_facts (
    id, track_id, artist, started_at, ended_at, played_seconds,
    duration_seconds, qualified_completion, source
  ) VALUES (?, ?, ?, ?, ?, ?, 100, ?, 'audio-core')`).run(
    id,
    trackId,
    artist,
    startedAt.toISOString(),
    startedAt.toISOString(),
    playedSeconds,
    qualifiedCompletion ? 1 : 0,
  );
};

describe('getSteamAchievementHistoryStats', () => {
  it('derives progress only from Main-owned qualified playback facts', () => {
    const database = createDatabase();
    for (let index = 0; index < 4; index += 1) {
      const trackId = `track-${index}`;
      database.prepare('INSERT INTO tracks (id, missing, duration) VALUES (?, 0, 45)').run(trackId);
      database.prepare('INSERT INTO album_tracks (album_id, track_id) VALUES (?, ?)').run('album-1', trackId);
      for (let play = 0; play < 3; play += 1) {
        insertFact(database, `${trackId}-${play}`, trackId, new Date(2026, 7, play + 1, 2), 80, true);
      }
    }
    for (let day = 4; day <= 7; day += 1) {
      insertFact(database, `streak-${day}`, 'track-0', new Date(2026, 7, day, 2), 80, true);
    }
    insertFact(database, 'not-qualified', 'track-0', new Date(2026, 7, 8, 12), 9_999, false);
    insertFact(database, 'special', 'track-0', new Date(2026, 7, 8, 12), 80, true, 'MC赵小六');

    expect(getSteamAchievementHistoryStats(database as unknown as EchoDatabase)).toEqual({
      totalPlayedSeconds: 11_359,
      completedUniqueTracks: 4,
      qualifiedCompletedPlayCount: 17,
      longestCompletionStreakDays: 8,
      nightPlayedSeconds: 1_280,
      hasFavoriteAlbum: true,
      completedShortUniqueTracks: 4,
      hasCompletedZhaoXiaoliuTrack: true,
      completedUniqueAlbums: 1,
    });
    database.close();
  });

  it('does not treat a renderer-style 30-second completion as achievement-qualified', () => {
    const database = createDatabase();
    database.prepare('INSERT INTO tracks (id, missing, duration) VALUES (?, 0, 100)').run('track-1');
    insertFact(database, 'unqualified', 'track-1', new Date(2026, 7, 1, 12), 30, false);

    const stats = getSteamAchievementHistoryStats(database as unknown as EchoDatabase);
    expect(stats.completedUniqueTracks).toBe(0);
    expect(stats.qualifiedCompletedPlayCount).toBe(0);
    database.close();
  });

  it('persists Audio Core facts with a server-generated identity', () => {
    const database = createDatabase();
    recordSteamAchievementPlaybackFact(database as unknown as EchoDatabase, {
      trackId: 'track-1',
      artist: 'ECHO',
      startedAtMs: Date.parse('2026-08-17T00:00:00.000Z'),
      endedAtMs: Date.parse('2026-08-17T00:01:20.000Z'),
      playedSeconds: 80,
      durationSeconds: 100,
      qualifiedCompletion: true,
    });

    const row = database.prepare('SELECT track_id, qualified_completion, source FROM steam_achievement_playback_facts').get();
    expect(row).toEqual({ track_id: 'track-1', qualified_completion: 1, source: 'audio-core' });
    database.close();
  });
});
