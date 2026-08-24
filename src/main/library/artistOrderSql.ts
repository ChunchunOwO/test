import {
  ARTIST_IMAGE_CACHE_SOURCE_HASH_PREFIX,
  ARTIST_IMAGE_CACHE_SOURCE_VERSION,
} from './artistImages/ArtistImageTypes';

const sqlString = (value: string): string => `'${value.replace(/'/gu, "''")}'`;

export const artistAvatarPriorityOrderSql = (): string => `CASE
      WHEN avatar_status = 'matched'
        AND (avatar_source_hash = ${sqlString(ARTIST_IMAGE_CACHE_SOURCE_VERSION)}
          OR avatar_source_hash LIKE ${sqlString(`${ARTIST_IMAGE_CACHE_SOURCE_HASH_PREFIX}%`)})
        AND COALESCE(avatar_large_path, avatar_medium_path, avatar_thumb_path) IS NOT NULL
      THEN 0
      ELSE 1
    END`;

const localArtistTrackAggregateSql = (selectSql: string): string => `(
          SELECT ${selectSql}
          FROM artist_tracks
          INNER JOIN tracks ON tracks.id = artist_tracks.track_id
          WHERE artist_tracks.artist_id = library_artists.id
            AND tracks.missing = 0
        )`;

const withAvatarPriority = (prioritizeArtistAvatars: boolean, orderSql: string): string => {
  const prioritySql = prioritizeArtistAvatars ? `${artistAvatarPriorityOrderSql()}, ` : '';
  return `ORDER BY ${prioritySql}${orderSql}`;
};

export const unifiedArtistOrderSql = (sort: string, prioritizeArtistAvatars = false): string => {
  const order = (orderSql: string): string => withAvatarPriority(prioritizeArtistAvatars, orderSql);

  switch (sort) {
    case 'frequent':
    case 'trackCountDesc':
      return order('track_count DESC, album_count DESC, name COLLATE NOCASE');
    case 'albumCountDesc':
      return order('album_count DESC, track_count DESC, name COLLATE NOCASE');
    case 'lastPlayed':
      return order(`${localArtistTrackAggregateSql('MAX(tracks.last_played_at)')} IS NULL, ${localArtistTrackAggregateSql('MAX(tracks.last_played_at)')} DESC, name COLLATE NOCASE`);
    case 'playCountDesc':
      return order(`COALESCE(${localArtistTrackAggregateSql('SUM(COALESCE(tracks.play_count, 0))')}, 0) DESC, name COLLATE NOCASE`);
    case 'playCountAsc':
      return order(`COALESCE(${localArtistTrackAggregateSql('SUM(COALESCE(tracks.play_count, 0))')}, 0) ASC, name COLLATE NOCASE`);
    case 'createdDesc':
    case 'recent':
      return order(`${localArtistTrackAggregateSql('MAX(tracks.created_at)')} IS NULL, ${localArtistTrackAggregateSql('MAX(tracks.created_at)')} DESC, name COLLATE NOCASE`);
    case 'titleDesc':
      return order('name COLLATE NOCASE DESC');
    case 'random':
      return order('RANDOM()');
    case 'artist':
    case 'artistAlbum':
    case 'titleAsc':
    case 'default':
    case 'title':
    default:
      return order('sort_name COLLATE NOCASE, name COLLATE NOCASE');
  }
};

export const albumArtistListOrderSql = (sort: string, prioritizeArtistAvatars = false): string => {
  const prioritySql = prioritizeArtistAvatars ? `${artistAvatarPriorityOrderSql()}, ` : '';

  if (sort === 'frequent' || sort === 'trackCountDesc') {
    return `ORDER BY ${prioritySql}track_count DESC, album_count DESC, display_name COLLATE NOCASE ASC`;
  }
  if (sort === 'albumCountDesc') {
    return `ORDER BY ${prioritySql}album_count DESC, track_count DESC, display_name COLLATE NOCASE ASC`;
  }
  if (sort === 'lastPlayed') {
    return `ORDER BY ${prioritySql}grouped.last_played_at IS NULL, grouped.last_played_at DESC, display_name COLLATE NOCASE ASC`;
  }
  if (sort === 'playCountDesc') {
    return `ORDER BY ${prioritySql}COALESCE(grouped.play_count, 0) DESC, display_name COLLATE NOCASE ASC`;
  }
  if (sort === 'createdDesc' || sort === 'recent') {
    return `ORDER BY ${prioritySql}grouped.added_at IS NULL, grouped.added_at DESC, display_name COLLATE NOCASE ASC`;
  }
  if (sort === 'titleDesc') {
    return `ORDER BY ${prioritySql}display_name COLLATE NOCASE DESC`;
  }
  if (sort === 'random') {
    return `ORDER BY ${prioritySql}RANDOM()`;
  }
  return `ORDER BY ${prioritySql}display_name COLLATE NOCASE ASC`;
};
