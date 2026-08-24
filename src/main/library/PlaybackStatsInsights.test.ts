import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { EchoDatabase } from '../database/createDatabase';
import { getPlaybackStatsInsights } from './PlaybackStatsInsights';

describe('getPlaybackStatsInsights', () => {
  it('compares periods and derives sessions, discovery, and rediscovery locally', () => {
    const database = new DatabaseSync(':memory:');
    database.exec(`
      CREATE TABLE playback_history (
        id TEXT PRIMARY KEY,
        stable_key TEXT,
        track_id TEXT,
        track_path TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        played_seconds REAL NOT NULL,
        completed INTEGER NOT NULL,
        media_type TEXT NOT NULL
      );
    `);
    const insert = database.prepare(`
      INSERT INTO playback_history (
        id, stable_key, track_id, track_path, started_at, ended_at,
        played_seconds, completed, media_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run('old-a', 'track-a', 'track-a', 'A.flac', '2025-12-05T10:00:00.000Z', '2025-12-05T10:01:00.000Z', 60, 1, 'local');
    insert.run('new-a', 'track-a', 'track-a', 'A.flac', '2026-01-20T10:00:00.000Z', '2026-01-20T10:01:40.000Z', 100, 1, 'local');
    insert.run('new-b-1', 'track-b', 'track-b', 'B.flac', '2026-01-20T10:10:00.000Z', '2026-01-20T10:11:40.000Z', 100, 1, 'local');
    insert.run('new-b-2', 'track-b', 'track-b', 'B.flac', '2026-01-20T10:20:00.000Z', '2026-01-20T10:21:20.000Z', 80, 1, 'local');

    const insights = getPlaybackStatsInsights(database as unknown as EchoDatabase, {
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-02-01T00:00:00.000Z',
      mediaType: 'local',
    });

    expect(insights.comparison).toEqual({
      current: { playCount: 3, playedSeconds: 280, uniqueTracks: 2 },
      previous: { playCount: 1, playedSeconds: 60, uniqueTracks: 1 },
    });
    expect(insights.sessions).toMatchObject({
      sessionCount: 1,
      averagePlayedSeconds: 280,
      longestPlayedSeconds: 280,
      averageTrackCount: 3,
      activeDays: 1,
      longestStreakDays: 1,
    });
    expect(insights.discovery).toMatchObject({
      hasBoundedRange: true,
      newTrackCount: 1,
      returningTrackCount: 1,
      replayedTrackCount: 1,
      rediscoveredTrackCount: 1,
    });
    expect(insights.discovery.repeatPlayRate).toBeCloseTo(1 / 3);
    database.close();
  });
});
