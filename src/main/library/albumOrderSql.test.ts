import { describe, expect, it } from 'vitest';
import { albumOrderSql } from './albumOrderSql';

describe('albumOrderSql', () => {
  it('puts unknown years last when sorting by release year', () => {
    expect(albumOrderSql('yearDesc')).toContain('albums.year IS NULL, albums.year DESC');
    expect(albumOrderSql('yearAsc')).toContain('albums.year IS NULL, albums.year ASC');
  });
});
