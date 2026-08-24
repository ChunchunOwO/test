import type { LibraryGenre } from '../../shared/types/library';
import { isUnclassifiedGenreKey } from '../../shared/library/genreKey';
import { translateStatic } from '../i18n/translateStatic';
import type { TranslationKey } from '../i18n/locales';
import type { DetailReturnTarget } from './albumNavigation';

export const genreDetailNavigationEvent = 'app:navigate:genre-detail';

export type GenreDetailNavigationRequest = {
  genre: LibraryGenre;
  returnTo?: DetailReturnTarget;
};

let pendingGenreDetail: GenreDetailNavigationRequest | null = null;

export const genreDisplayName = (
  genre: Pick<LibraryGenre, 'name' | 'unclassified' | 'genreKey'>,
  t: (key: TranslationKey) => string,
): string => {
  if (genre.unclassified || isUnclassifiedGenreKey(genre.genreKey)) {
    return t('library.genres.unclassified');
  }

  const name = genre.name.trim();
  return name || genre.genreKey;
};

export const requestGenreDetailNavigation = (genre: LibraryGenre, options: { returnTo?: DetailReturnTarget } = {}): void => {
  const request = { genre, returnTo: options.returnTo };
  pendingGenreDetail = request;
  window.dispatchEvent(new CustomEvent<GenreDetailNavigationRequest>(genreDetailNavigationEvent, { detail: request }));
};

export const consumePendingGenreDetailNavigation = (): GenreDetailNavigationRequest | null => {
  const request = pendingGenreDetail;
  pendingGenreDetail = null;
  return request;
};

export const openGenreDetailByKey = async (
  genreKey: string,
  options: { returnTo?: DetailReturnTarget; sourceProvider?: 'local' | 'remote'; sourceId?: string | null } = {},
): Promise<LibraryGenre | null> => {
  const library = window.echo?.library;
  const trimmedKey = genreKey.trim();

  if (!trimmedKey) {
    return null;
  }

  if (!library?.getGenre) {
    throw new Error(translateStatic('genreDetail.error.desktopBridgeRead'));
  }

  const genre = await library.getGenre(trimmedKey, {
    sourceProvider: options.sourceProvider,
    ...(options.sourceId ? { sourceId: options.sourceId } : {}),
  });

  if (genre) {
    requestGenreDetailNavigation(genre, { returnTo: options.returnTo });
  }

  return genre;
};
