import { describe, expect, it } from 'vitest';
import { unifiedTrackOrderSql } from './LibraryTrackSortOrder';

describe('unifiedTrackOrderSql', () => {
  it('keeps selected sort rules in priority order before stable tie breakers', () => {
    const sql = unifiedTrackOrderSql(['playCountDesc', 'yearAsc']);

    expect(sql.indexOf('COALESCE(play_count, 0) DESC')).toBeLessThan(sql.indexOf('(year IS NULL) ASC'));
    expect(sql.indexOf('year ASC')).toBeLessThan(sql.indexOf('title COLLATE NOCASE ASC'));
    expect(sql).toContain('id ASC');
  });

  it('keeps search relevance ahead of the default sort and random exclusive', () => {
    expect(unifiedTrackOrderSql(['default'], true)).toMatch(/^ORDER BY search_rank ASC/u);
    expect(unifiedTrackOrderSql(['random', 'yearAsc'], true)).toBe('ORDER BY RANDOM()');
  });
});
