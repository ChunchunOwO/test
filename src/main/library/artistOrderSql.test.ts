import { describe, expect, it } from 'vitest';
import { albumArtistListOrderSql, unifiedArtistOrderSql } from './artistOrderSql';

describe('unifiedArtistOrderSql', () => {
  it('sorts by listening activity and library size', () => {
    expect(unifiedArtistOrderSql('lastPlayed')).toContain('MAX(tracks.last_played_at)');
    expect(unifiedArtistOrderSql('playCountDesc')).toContain('play_count');
    expect(unifiedArtistOrderSql('albumCountDesc')).toContain('album_count DESC');
    expect(unifiedArtistOrderSql('recent')).toContain('MAX(tracks.created_at)');
  });
});

describe('albumArtistListOrderSql', () => {
  it('uses grouped artist stats for time and album sorts', () => {
    expect(albumArtistListOrderSql('lastPlayed')).toContain('grouped.last_played_at DESC');
    expect(albumArtistListOrderSql('albumCountDesc')).toContain('album_count DESC');
    expect(albumArtistListOrderSql('recent')).toContain('grouped.added_at DESC');
  });
});
