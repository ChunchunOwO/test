import { genreKeyFromTag, isUnclassifiedGenreKey } from '../../shared/library/genreKey';
import type { LibraryTrack } from '../../shared/types/library';

export type AlbumGenreFact = {
  genreKey: string;
  name: string;
  unclassified: boolean;
};

const maxAlbumGenreFacts = 3;

export const collectAlbumGenreFacts = (tracks: LibraryTrack[]): AlbumGenreFact[] => {
  if (tracks.length === 0) {
    return [];
  }

  const seen = new Map<string, AlbumGenreFact>();
  for (const track of tracks) {
    const genreKey = genreKeyFromTag(track.genre);
    if (isUnclassifiedGenreKey(genreKey) || seen.has(genreKey)) {
      continue;
    }

    seen.set(genreKey, {
      genreKey,
      name: (track.genre ?? '').trim(),
      unclassified: false,
    });

    if (seen.size >= maxAlbumGenreFacts) {
      break;
    }
  }

  return Array.from(seen.values());
};
