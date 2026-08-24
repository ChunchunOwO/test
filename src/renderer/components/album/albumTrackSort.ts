import type { LibraryTrack } from '../../../shared/types/library';
import type { TranslationKey } from '../../i18n/locales';

export type AlbumTrackSort =
  | 'default'
  | 'titleAsc'
  | 'titleDesc'
  | 'artist'
  | 'durationAsc'
  | 'durationDesc'
  | 'filename';

export const albumTrackSortStorageKey = 'echo.album-detail.track-sort';

export const albumTrackSortOptions: Array<{ value: AlbumTrackSort; labelKey: TranslationKey }> = [
  { value: 'default', labelKey: 'albumDetail.tracks.sort.default' },
  { value: 'titleAsc', labelKey: 'library.albums.sort.titleAsc' },
  { value: 'titleDesc', labelKey: 'library.albums.sort.titleDesc' },
  { value: 'artist', labelKey: 'library.albums.sort.artist' },
  { value: 'durationAsc', labelKey: 'library.sort.durationAsc' },
  { value: 'durationDesc', labelKey: 'library.sort.durationDesc' },
  { value: 'filename', labelKey: 'albumDetail.tracks.sort.filename' },
];

export const validAlbumTrackSortValues = new Set<AlbumTrackSort>(albumTrackSortOptions.map((option) => option.value));

const compareText = (left: string, right: string): number =>
  left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });

export const albumTrackFileName = (path: string): string => {
  const trimmed = path.trim();
  const separatorIndex = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'));
  return separatorIndex >= 0 ? trimmed.slice(separatorIndex + 1) : trimmed;
};

export const sortAlbumTracks = (tracks: LibraryTrack[], sort: AlbumTrackSort): LibraryTrack[] => {
  if (sort === 'default' || tracks.length < 2) {
    return tracks;
  }

  return [...tracks].sort((left, right) => {
    switch (sort) {
      case 'titleAsc':
        return compareText(left.title, right.title);
      case 'titleDesc':
        return compareText(right.title, left.title);
      case 'artist':
        return compareText(left.artist, right.artist) || compareText(left.title, right.title);
      case 'durationAsc':
        return left.duration - right.duration;
      case 'durationDesc':
        return right.duration - left.duration;
      case 'filename':
        return compareText(albumTrackFileName(left.path), albumTrackFileName(right.path));
      default:
        return 0;
    }
  });
};

export const readStoredAlbumTrackSort = (): AlbumTrackSort => {
  try {
    const stored = window.localStorage.getItem(albumTrackSortStorageKey);
    return stored && validAlbumTrackSortValues.has(stored as AlbumTrackSort) ? (stored as AlbumTrackSort) : 'default';
  } catch {
    return 'default';
  }
};

export const writeStoredAlbumTrackSort = (sort: AlbumTrackSort): void => {
  try {
    window.localStorage.setItem(albumTrackSortStorageKey, sort);
  } catch {
    // Sort memory is only a view preference and must not block album browsing.
  }
};
