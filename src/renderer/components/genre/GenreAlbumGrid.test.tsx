// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LibraryAlbum } from '../../../shared/types/library';
import { GenreAlbumGrid } from './GenreAlbumGrid';

vi.mock('../../i18n/I18nProvider', () => ({
  useI18n: () => ({
    locale: 'en-US',
    t: (key: string, options?: Record<string, string | number>) =>
      key === 'library.albums.card.tracks'
        ? `${options?.count} tracks`
        : key === 'genreDetail.albums.aria'
          ? `${options?.genre} albums`
          : key,
  }),
}));

const album: LibraryAlbum = {
  id: 'album-1',
  albumKey: 'album-1',
  title: 'First Light',
  albumArtist: 'Artist One',
  year: 2026,
  trackCount: 8,
  duration: 2400,
  coverId: 'cover-1',
  coverThumb: null,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('GenreAlbumGrid', () => {
  it('renders the albums wall cards instead of artist-detail album chips', async () => {
    const onPreviewCovers = vi.fn();
    window.echo = {
      library: {
        getGenreAlbums: vi.fn().mockResolvedValue({
          items: [album],
          page: 1,
          pageSize: 24,
          total: 1,
          hasMore: false,
        }),
      },
    } as unknown as Window['echo'];

    render(
      <GenreAlbumGrid
        genreKey="rock"
        genreName="Rock"
        albumCount={1}
        onAlbumSelect={vi.fn()}
        onPreviewCovers={onPreviewCovers}
      />,
    );

    expect(await screen.findByText('First Light')).toBeTruthy();
    expect(screen.getByText('Artist One')).toBeTruthy();
    expect(document.querySelector('.album-wall .album-card')).toBeTruthy();
    expect(document.querySelector('.artist-album-card')).toBeNull();
    await waitFor(() => expect(onPreviewCovers).toHaveBeenCalledWith(['echo-cover://large/cover-1']));
  });
});
