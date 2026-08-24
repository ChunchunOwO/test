// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GenresPage } from './GenresPage';
import type { LibraryGenre, LibraryPage } from '../../shared/types/library';
import { unclassifiedGenreKey } from '../../shared/library/genreKey';
import { I18nProvider } from '../i18n/I18nProvider';
import { requestGenreDetailNavigation } from '../utils/genreNavigation';

const sharedPlaybackState = vi.hoisted(() => ({
  value: {
    audioStatus: null as { state?: string } | null,
    playbackStatus: null as { state?: string } | null,
  },
}));

vi.mock('../stores/playbackStatusStore', () => ({
  beginPlaybackSwitchSnapshot: vi.fn(),
  setPlaybackStatusSnapshot: vi.fn(),
  useSharedPlaybackStatusOnly: () => sharedPlaybackState.value.playbackStatus ?? null,
  useSharedPlaybackActivityState: () =>
    sharedPlaybackState.value.audioStatus?.state ?? sharedPlaybackState.value.playbackStatus?.state ?? 'idle',
}));

vi.mock('../components/genre/GenreDetailView', () => ({
  GenreDetailView: ({ genre, onBack }: { genre: LibraryGenre; onBack: () => void }) => (
    <div>
      <h1>Detail: {genre.name || genre.genreKey}</h1>
      <button type="button" onClick={onBack}>
        Back to genres
      </button>
    </div>
  ),
}));

const genre = (genreKey: string, overrides: Partial<LibraryGenre> = {}): LibraryGenre => ({
  genreKey,
  name: genreKey === unclassifiedGenreKey ? '' : `Genre ${genreKey}`,
  unclassified: genreKey === unclassifiedGenreKey,
  trackCount: 4,
  albumCount: 1,
  coverId: null,
  coverThumb: null,
  ...overrides,
});

const page = (items: LibraryGenre[], overrides: Partial<LibraryPage<LibraryGenre>> = {}): LibraryPage<LibraryGenre> => ({
  items,
  page: 1,
  pageSize: 96,
  total: items.length,
  hasMore: false,
  ...overrides,
});

const installLibrary = (getGenres: ReturnType<typeof vi.fn>): void => {
  window.echo = {
    app: {
      getSettings: vi.fn().mockResolvedValue({}),
    },
    library: {
      getGenres,
      getGenre: vi.fn(),
      getGenreTracks: vi.fn(),
      getGenreAlbums: vi.fn(),
    },
  } as unknown as Window['echo'];
};

const renderGenresPage = (): ReturnType<typeof render> =>
  render(
    <I18nProvider>
      <main className="page-surface">
        <GenresPage />
      </main>
    </I18nProvider>,
  );

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sharedPlaybackState.value.audioStatus = null;
  sharedPlaybackState.value.playbackStatus = null;
});

describe('GenresPage', () => {
  it('loads genres from the desktop bridge and shows the unclassified bucket', async () => {
    const getGenres = vi.fn().mockResolvedValue(page([
      genre('rock', { name: 'Rock' }),
      genre(unclassifiedGenreKey),
    ], { total: 2 }));
    installLibrary(getGenres);

    renderGenresPage();

    await waitFor(() => expect(getGenres).toHaveBeenCalledTimes(1));
    expect(getGenres).toHaveBeenCalledWith({ page: 1, pageSize: 96, search: '', sort: 'default', sourceProvider: 'local' });
    expect(await screen.findByText('Rock')).toBeTruthy();
    expect(await screen.findByText('Unclassified')).toBeTruthy();
    expect(screen.getAllByText('4 tracks / 1 albums')).toHaveLength(2);
  });

  it('opens a genre detail from a card click and a cross-page navigation event', async () => {
    const target = genre('jazz', { name: 'Jazz' });
    const getGenres = vi.fn().mockResolvedValue(page([target]));
    installLibrary(getGenres);

    renderGenresPage();
    await waitFor(() => expect(getGenres).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('Jazz'));
    expect(await screen.findByText('Detail: Jazz')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to genres' }));
    await waitFor(() => expect(screen.queryByText('Detail: Jazz')).toBeNull());

    requestGenreDetailNavigation(target);
    expect(await screen.findByText('Detail: Jazz')).toBeTruthy();
  });

  it('searches genres through the desktop bridge', async () => {
    const getGenres = vi.fn().mockResolvedValue(page([genre('rock', { name: 'Rock' })]));
    installLibrary(getGenres);

    renderGenresPage();
    await waitFor(() => expect(getGenres).toHaveBeenCalledTimes(1));

    fireEvent.change(await screen.findByPlaceholderText('Search genres'), { target: { value: 'Rock' } });
    await waitFor(() => expect(getGenres).toHaveBeenCalledTimes(2));
    expect(getGenres).toHaveBeenNthCalledWith(2, { page: 1, pageSize: 96, search: 'Rock', sort: 'default', sourceProvider: 'local' });
  });
});
