import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { EchoDatabase } from './createDatabase';
import { migrations, runMigrations } from './migrations';
import { librarySchemaSql } from './schema';

class FakeStatement<T = { id: number }> {
  constructor(private readonly allResult: T[] = [], private readonly onRun: (...args: unknown[]) => void = () => undefined) {}

  all(): T[] {
    return this.allResult;
  }

  run(...args: unknown[]): void {
    this.onRun(...args);
  }
}

class FakeDatabase {
  readonly executedSql: string[] = [];
  readonly insertedMigrationIds: number[] = [];

  constructor(
    private readonly appliedMigrationIds: number[],
    private readonly tableColumns: Record<string, string[]> = {},
  ) {}

  exec(sql: string): void {
    this.executedSql.push(sql);
  }

  prepare(sql: string) {
    const tableInfoMatch = sql.match(/PRAGMA table_info\(([^)]+)\)/i);
    if (tableInfoMatch) {
      const tableName = tableInfoMatch[1];
      return new FakeStatement((this.tableColumns[tableName] ?? []).map((name) => ({ name })));
    }

    if (sql.includes('SELECT id FROM schema_migrations')) {
      return new FakeStatement(this.appliedMigrationIds.map((id) => ({ id })));
    }

    if (sql.includes('INSERT INTO schema_migrations')) {
      return new FakeStatement([], (id) => {
        this.insertedMigrationIds.push(Number(id));
      });
    }

    throw new Error(`Unexpected SQL: ${sql}`);
  }
}

describe('database migrations', () => {
  it('includes scan directory snapshots and artist online caches in the base schema for new databases', () => {
    expect(librarySchemaSql).toContain('CREATE TABLE IF NOT EXISTS scan_directory_snapshots');
    expect(librarySchemaSql).toContain('PRIMARY KEY (folder_id, path)');
    expect(librarySchemaSql).toContain('CREATE TABLE IF NOT EXISTS artist_online_info_cache');
    expect(librarySchemaSql).toContain('CREATE TABLE IF NOT EXISTS artist_event_cache');
    expect(librarySchemaSql).toContain('CREATE TABLE IF NOT EXISTS library_inbox_item_states');
    expect(librarySchemaSql).toContain('CREATE TABLE IF NOT EXISTS lyrics_backfill_jobs');
    expect(librarySchemaSql).toContain('CREATE INDEX IF NOT EXISTS idx_remote_tracks_source_availability');
    expect(librarySchemaSql).toContain('CREATE INDEX IF NOT EXISTS idx_remote_tracks_server_album');
    expect(librarySchemaSql).toContain('CREATE INDEX IF NOT EXISTS idx_tracks_genre');
    expect(librarySchemaSql).toContain('CREATE INDEX IF NOT EXISTS idx_remote_tracks_genre');
    expect(librarySchemaSql).toContain('CREATE TABLE IF NOT EXISTS remote_provider_scan_cache');
    expect(librarySchemaSql).toContain('CREATE TABLE IF NOT EXISTS steam_achievement_playback_facts');
    expect(librarySchemaSql).toContain("selection_origin TEXT NOT NULL DEFAULT 'unknown'");
  });

  it('adds scan directory snapshots to existing databases without touching library rows', () => {
    const database = new FakeDatabase(Array.from({ length: 35 }, (_, index) => index + 1));

    runMigrations(database as unknown as EchoDatabase);

    const migrationSql = database.executedSql.join('\n');
    expect(database.insertedMigrationIds).toEqual([36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51]);
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS scan_directory_snapshots');
    expect(migrationSql).not.toMatch(/\b(?:DELETE|UPDATE)\s+(?:FROM\s+)?(?:folders|tracks|scan_jobs)\b/iu);
  });

  it('adds artist online caches to existing databases without touching library rows', () => {
    const database = new FakeDatabase(Array.from({ length: 36 }, (_, index) => index + 1));

    runMigrations(database as unknown as EchoDatabase);

    const migrationSql = database.executedSql.join('\n');
    expect(database.insertedMigrationIds).toEqual([37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51]);
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS artist_online_info_cache');
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS artist_event_cache');
    expect(migrationSql).not.toMatch(/\b(?:DELETE|UPDATE)\s+(?:FROM\s+)?(?:folders|tracks|artists|artist_tracks|artist_albums)\b/iu);
  });

  it('adds inbox item states to existing databases without touching library rows', () => {
    const database = new FakeDatabase(Array.from({ length: 37 }, (_, index) => index + 1));

    runMigrations(database as unknown as EchoDatabase);

    const migrationSql = database.executedSql.join('\n');
    expect(database.insertedMigrationIds).toEqual([38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51]);
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS library_inbox_item_states');
    expect(migrationSql).not.toMatch(/\b(?:DELETE|UPDATE)\s+(?:FROM\s+)?(?:folders|tracks|library_inbox_items|library_inbox_batches)\b/iu);
  });

  it('adds region columns to existing artist online caches without touching library rows', () => {
    const database = new FakeDatabase(Array.from({ length: 38 }, (_, index) => index + 1), {
      artist_online_info_cache: ['cache_key', 'artist_id', 'normalized_name', 'locale'],
      artist_event_cache: ['cache_key', 'artist_id', 'normalized_name', 'source'],
    });

    runMigrations(database as unknown as EchoDatabase);

    const migrationSql = database.executedSql.join('\n');
    expect(database.insertedMigrationIds).toEqual([39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51]);
    expect(migrationSql).toContain('ALTER TABLE artist_online_info_cache ADD COLUMN region TEXT');
    expect(migrationSql).toContain('ALTER TABLE artist_event_cache ADD COLUMN region TEXT');
    expect(migrationSql).not.toMatch(/\b(?:DELETE|UPDATE)\s+(?:FROM\s+)?(?:folders|tracks|artists|artist_tracks|artist_albums)\b/iu);
  });

  it('keeps the Audio Core achievement ledger as the latest additive step', () => {
    expect(migrations.at(-1)).toMatchObject({ id: 51 });
  });

  it('backfills legacy history without accepting the old 30-second completion threshold', () => {
    const database = new DatabaseSync(':memory:');
    database.exec(`
      CREATE TABLE schema_migrations (id INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE playback_history (
        id TEXT PRIMARY KEY,
        track_id TEXT,
        media_type TEXT NOT NULL,
        provider TEXT,
        artist TEXT,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        played_seconds REAL NOT NULL,
        duration_seconds REAL NOT NULL,
        completed INTEGER NOT NULL
      );
    `);
    const markApplied = database.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)');
    for (let id = 1; id <= 50; id += 1) markApplied.run(id, '2026-08-17T00:00:00.000Z');
    const insertHistory = database.prepare(`INSERT INTO playback_history (
      id, track_id, media_type, provider, artist, started_at, ended_at,
      played_seconds, duration_seconds, completed
    ) VALUES (?, ?, 'local', NULL, 'ECHO', ?, ?, ?, 100, 1)`);
    insertHistory.run('short', 'track-short', '2026-08-17T00:00:00.000Z', '2026-08-17T00:00:30.000Z', 30);
    insertHistory.run('qualified', 'track-qualified', '2026-08-17T00:01:00.000Z', '2026-08-17T00:02:20.000Z', 80);

    runMigrations(database as unknown as EchoDatabase);

    const rows = database.prepare(`SELECT track_id, qualified_completion, source
      FROM steam_achievement_playback_facts ORDER BY track_id`).all();
    expect(rows).toEqual([
      { track_id: 'track-qualified', qualified_completion: 1, source: 'legacy-history' },
      { track_id: 'track-short', qualified_completion: 0, source: 'legacy-history' },
    ]);
    database.close();
  });
});
