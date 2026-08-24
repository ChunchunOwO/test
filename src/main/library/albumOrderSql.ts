export const albumOrderSql = (sort: string): string => {
  switch (sort) {
    case 'artist':
    case 'artistAlbum':
      return 'ORDER BY echo_library_sort_key(albums.album_artist) COLLATE NOCASE, albums.album_artist COLLATE NOCASE, albums.title COLLATE NOCASE';
    case 'recent':
      return `ORDER BY COALESCE((
          SELECT MAX(tracks.created_at)
          FROM album_tracks
          INNER JOIN tracks ON tracks.id = album_tracks.track_id
          WHERE album_tracks.album_id = albums.id
            AND tracks.missing = 0
        ), albums.created_at) DESC, albums.updated_at DESC, albums.title COLLATE NOCASE`;
    case 'yearAsc':
      return 'ORDER BY albums.year IS NULL, albums.year ASC, albums.title COLLATE NOCASE';
    case 'yearDesc':
      return 'ORDER BY albums.year IS NULL, albums.year DESC, albums.title COLLATE NOCASE';
    case 'createdDesc':
      return 'ORDER BY albums.updated_at DESC, albums.title COLLATE NOCASE';
    case 'createdAsc':
      return 'ORDER BY albums.created_at ASC, albums.title COLLATE NOCASE';
    case 'titleDesc':
      return 'ORDER BY echo_library_sort_key(albums.title) COLLATE NOCASE DESC, albums.title COLLATE NOCASE DESC, echo_library_sort_key(albums.album_artist) COLLATE NOCASE, albums.album_artist COLLATE NOCASE';
    case 'durationAsc':
      return 'ORDER BY albums.duration ASC, albums.title COLLATE NOCASE';
    case 'durationDesc':
      return 'ORDER BY albums.duration DESC, albums.title COLLATE NOCASE';
    case 'fileModifiedAsc':
      return `ORDER BY (
          SELECT MIN(tracks.mtime_ms)
          FROM album_tracks
          INNER JOIN tracks ON tracks.id = album_tracks.track_id
          WHERE album_tracks.album_id = albums.id
            AND tracks.missing = 0
        ) ASC, albums.title COLLATE NOCASE`;
    case 'fileModifiedDesc':
      return `ORDER BY (
          SELECT MAX(tracks.mtime_ms)
          FROM album_tracks
          INNER JOIN tracks ON tracks.id = album_tracks.track_id
          WHERE album_tracks.album_id = albums.id
            AND tracks.missing = 0
        ) DESC, albums.title COLLATE NOCASE`;
    case 'random':
      return 'ORDER BY RANDOM()';
    case 'album':
    case 'titleAsc':
    case 'default':
    case 'title':
    default:
      return 'ORDER BY echo_library_sort_key(albums.title) COLLATE NOCASE, albums.title COLLATE NOCASE, echo_library_sort_key(albums.album_artist) COLLATE NOCASE, albums.album_artist COLLATE NOCASE';
  }
};
