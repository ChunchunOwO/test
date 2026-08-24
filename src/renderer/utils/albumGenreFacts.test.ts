import { describe, expect, it } from 'vitest';
import type { LibraryTrack } from '../../shared/types/library';
import { collectAlbumGenreFacts } from './albumGenreFacts';

const track = (genre: string | null): LibraryTrack => ({ genre } as LibraryTrack);

describe('collectAlbumGenreFacts', () => {
  it('returns nothing until tracks have loaded', () => {
    expect(collectAlbumGenreFacts([])).toEqual([]);
  });

  it('groups letter-case and spacing as one genre and keeps the first label', () => {
    expect(collectAlbumGenreFacts([track('Rock'), track('ROCK'), track('  Rock  ')])).toEqual([
      { genreKey: 'rock', name: 'Rock', unclassified: false },
    ]);
  });

  it('keeps compound tags as one genre instead of splitting them', () => {
    expect(collectAlbumGenreFacts([track('J-Pop/Anime')])).toEqual([
      { genreKey: 'j-pop/anime', name: 'J-Pop/Anime', unclassified: false },
    ]);
  });

  it('returns nothing when every tag is empty', () => {
    expect(collectAlbumGenreFacts([track(null), track('  ')])).toEqual([]);
  });

  it('keeps tagged genres and drops empty tags when both exist', () => {
    expect(collectAlbumGenreFacts([track(null), track('Jazz'), track('Jazz')])).toEqual([
      { genreKey: 'jazz', name: 'Jazz', unclassified: false },
    ]);
  });

  it('caps the visible genres at three', () => {
    expect(collectAlbumGenreFacts([track('Rock'), track('Jazz'), track('Pop'), track('Folk')]).map((genre) => genre.name)).toEqual([
      'Rock',
      'Jazz',
      'Pop',
    ]);
  });
});
