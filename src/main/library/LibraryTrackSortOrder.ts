import type { LibrarySort } from '../../shared/types/library';

const clausesForSort = (sort: LibrarySort): string[] => {
  switch (sort) {
    case 'artist':
      return ['artist COLLATE NOCASE ASC'];
    case 'artistAlbum':
      return [
        'artist COLLATE NOCASE ASC',
        'album COLLATE NOCASE ASC',
        'COALESCE(disc_no, 0) ASC',
        'COALESCE(track_no, 999999) ASC',
      ];
    case 'album':
      return ['album COLLATE NOCASE ASC'];
    case 'recent':
      return ['updated_at DESC'];
    case 'lastPlayed':
      return ['(last_played_at IS NULL) ASC', 'last_played_at DESC'];
    case 'playCountAsc':
      return ['COALESCE(play_count, 0) ASC'];
    case 'playCountDesc':
    case 'frequent':
      return ['COALESCE(play_count, 0) DESC'];
    case 'yearAsc':
      return ['(year IS NULL) ASC', 'year ASC'];
    case 'yearDesc':
      return ['(year IS NULL) ASC', 'year DESC'];
    case 'createdAsc':
      return ['created_at ASC'];
    case 'createdDesc':
      return ['created_at DESC'];
    case 'titleDesc':
      return ['title COLLATE NOCASE DESC'];
    case 'durationAsc':
      return ['duration ASC'];
    case 'durationDesc':
      return ['duration DESC'];
    case 'fileModifiedAsc':
      return ['mtime_ms ASC'];
    case 'fileModifiedDesc':
      return ['mtime_ms DESC'];
    case 'qualityAsc':
      return ['COALESCE(bitrate, 0) ASC', 'size_bytes ASC'];
    case 'qualityDesc':
      return ['COALESCE(bitrate, 0) DESC', 'size_bytes DESC'];
    case 'codecAsc':
      return ["COALESCE(codec, '') COLLATE NOCASE ASC"];
    case 'codecDesc':
      return ["COALESCE(codec, '') COLLATE NOCASE DESC"];
    case 'audioSpecAsc':
      return [
        '(sample_rate IS NULL OR sample_rate <= 0) ASC',
        'sample_rate ASC',
        '(bit_depth IS NULL OR bit_depth <= 0) ASC',
        'bit_depth ASC',
      ];
    case 'audioSpecDesc':
      return [
        '(sample_rate IS NULL OR sample_rate <= 0) ASC',
        'sample_rate DESC',
        '(bit_depth IS NULL OR bit_depth <= 0) ASC',
        'bit_depth DESC',
      ];
    case 'bitrateAsc':
      return ['COALESCE(bitrate, 0) ASC'];
    case 'bitrateDesc':
      return ['COALESCE(bitrate, 0) DESC'];
    case 'bpmAsc':
      return ['(bpm IS NULL OR bpm <= 0) ASC', 'bpm ASC'];
    case 'bpmDesc':
      return ['(bpm IS NULL OR bpm <= 0) ASC', 'bpm DESC'];
    case 'trackNumber':
      return ['(track_no IS NULL) ASC', 'COALESCE(disc_no, 1) ASC', 'COALESCE(track_no, 0) ASC'];
    case 'random':
      return ['RANDOM()'];
    case 'titleAsc':
    case 'title':
    case 'default':
    default:
      return ['title COLLATE NOCASE ASC'];
  }
};

const stableClausesForPrimarySort = (sort: LibrarySort): string[] => {
  switch (sort) {
    case 'playCountAsc':
    case 'playCountDesc':
    case 'frequent':
      return ['last_played_at DESC'];
    case 'titleDesc':
      return ['artist COLLATE NOCASE ASC'];
    case 'trackNumber':
      return ['title COLLATE NOCASE ASC', 'path COLLATE NOCASE ASC'];
    default:
      return [];
  }
};

export const unifiedTrackOrderSql = (sorts: LibrarySort[], searchActive = false): string => {
  const activeSorts: LibrarySort[] = sorts.length > 0 ? sorts : ['default'];
  if (activeSorts[0] === 'random') {
    return 'ORDER BY RANDOM()';
  }

  const clauses = activeSorts.flatMap(clausesForSort);
  if (searchActive && activeSorts[0] === 'default') {
    clauses.unshift('search_rank ASC');
  }
  clauses.push(
    ...stableClausesForPrimarySort(activeSorts[0]),
    'title COLLATE NOCASE ASC',
    'artist COLLATE NOCASE ASC',
    'id ASC',
  );

  return `ORDER BY ${Array.from(new Set(clauses)).join(', ')}`;
};
