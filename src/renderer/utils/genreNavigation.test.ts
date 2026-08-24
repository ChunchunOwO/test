// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { LibraryGenre } from '../../shared/types/library';
import { unclassifiedGenreKey } from '../../shared/library/genreKey';
import {
  consumePendingGenreDetailNavigation,
  genreDetailNavigationEvent,
  genreDisplayName,
  openGenreDetailByKey,
  requestGenreDetailNavigation,
} from './genreNavigation';

const genre = (overrides: Partial<LibraryGenre> = {}): LibraryGenre => ({
  genreKey: 'rock',
  name: 'Rock',
  unclassified: false,
  trackCount: 4,
  albumCount: 1,
  coverId: null,
  coverThumb: null,
  ...overrides,
});

describe('genreNavigation', () => {
  it('stores a pending genre detail request for the genres page', () => {
    const target = genre();
    requestGenreDetailNavigation(target, { returnTo: 'songs' });
    expect(consumePendingGenreDetailNavigation()).toEqual({ genre: target, returnTo: 'songs' });
    expect(consumePendingGenreDetailNavigation()).toBeNull();
  });

  it('uses the unclassified label when the tag is empty', () => {
    expect(genreDisplayName({ genreKey: unclassifiedGenreKey, name: '', unclassified: true }, (key) => key)).toBe('library.genres.unclassified');
    expect(genreDisplayName({ genreKey: 'jazz', name: 'Jazz', unclassified: false }, (key) => key)).toBe('Jazz');
  });

  it('falls back to the genre key instead of unclassified when the display name is missing', () => {
    expect(genreDisplayName({ genreKey: 'rock', name: '', unclassified: false }, (key) => key)).toBe('rock');
  });

  it('opens a genre detail from the desktop bridge', async () => {
    const target = genre({ genreKey: unclassifiedGenreKey, unclassified: true, name: '' });
    const getGenre = vi.fn().mockResolvedValue(target);
    (window as unknown as { echo: { library: { getGenre: typeof getGenre } } }).echo = {
      library: { getGenre },
    };
    const seen: string[] = [];
    const handle = (event: Event): void => {
      seen.push((event as CustomEvent).type);
    };
    window.addEventListener(genreDetailNavigationEvent, handle);

    await expect(openGenreDetailByKey(unclassifiedGenreKey, { sourceProvider: 'local' })).resolves.toEqual(target);
    expect(getGenre).toHaveBeenCalledWith(unclassifiedGenreKey, { sourceProvider: 'local' });
    expect(seen).toEqual([genreDetailNavigationEvent]);
    expect(consumePendingGenreDetailNavigation()?.genre.genreKey).toBe(unclassifiedGenreKey);

    window.removeEventListener(genreDetailNavigationEvent, handle);
  });
});
