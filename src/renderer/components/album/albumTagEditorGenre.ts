import { genreKeyFromTag, isUnclassifiedGenreKey } from '../../../shared/library/genreKey';
import type { LibraryTrack } from '../../../shared/types/library';

export type AlbumGenreEditorValue = {
  genre: string;
  mixed: boolean;
};

export const albumGenreEditorValue = (tracks: LibraryTrack[]): AlbumGenreEditorValue => {
  const unique: string[] = [];
  const seen = new Set<string>();

  for (const track of tracks) {
    const name = (track.genre ?? '').trim();
    if (!name) {
      continue;
    }

    const genreKey = genreKeyFromTag(name);
    if (isUnclassifiedGenreKey(genreKey) || seen.has(genreKey)) {
      continue;
    }

    seen.add(genreKey);
    unique.push(name);
  }

  if (unique.length === 1) {
    return { genre: unique[0]!, mixed: false };
  }

  return { genre: '', mixed: unique.length > 1 };
};
