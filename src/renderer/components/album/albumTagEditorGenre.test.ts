import { describe, expect, it } from 'vitest';
import type { LibraryTrack } from '../../../shared/types/library';
import { albumGenreEditorValue } from './albumTagEditorGenre';

const track = (genre: string | null): LibraryTrack => ({ genre } as LibraryTrack);

describe('albumGenreEditorValue', () => {
  it('keeps a shared genre so the album editor can show and save it', () => {
    expect(albumGenreEditorValue([track('Jazz'), track(' jazz ')])).toEqual({ genre: 'Jazz', mixed: false });
  });

  it('stays empty when no tracks are tagged', () => {
    expect(albumGenreEditorValue([track(null), track('  ')])).toEqual({ genre: '', mixed: false });
  });

  it('marks mixed tags so saving other album fields does not overwrite them', () => {
    expect(albumGenreEditorValue([track('Jazz'), track('Rock')])).toEqual({ genre: '', mixed: true });
  });
});
