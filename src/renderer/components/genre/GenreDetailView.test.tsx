// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LibraryGenre, LibraryTrack } from '../../../shared/types/library';
import { GenreDetailView } from './GenreDetailView';

vi.mock('../../i18n/I18nProvider', () => ({
  useI18n: () => ({
    locale: 'en-US',
    t: (key: string, options?: Record<string, string | number>) =>
      key === 'genreDetail.aria.details'
        ? `${options?.genre} genre details`
        : key === 'genreDetail.albums.heading'
          ? `Albums in ${options?.genre}`
          : key === 'genreDetail.tracks.heading'
            ? `Tracks in ${options?.genre}`
            : key === 'genreDetail.albums.aria'
              ? `${options?.genre} albums`
              : key,
  }),
}));

const queueMock = vi.hoisted(() => ({
  appendTracksToQueue: vi.fn(),
  currentTrackId: null as string | null,
  playTrack: vi.fn(),
}));

vi.mock('../../stores/PlaybackQueueProvider', () => ({
  usePlaybackQueue: () => queueMock,
}));

vi.mock('../album/SteamAlbumDetailView', () => ({
  SteamAlbumDetailView: () => <div>Album detail</div>,
}));

vi.mock('./GenreAlbumGrid', () => ({
  GenreAlbumGrid: () => <div>Genre albums</div>,
}));

const genre: LibraryGenre = {
  genreKey: 'rock',
  name: 'Rock',
  unclassified: false,
  trackCount: 1,
  albumCount: 1,
  coverId: null,
  coverThumb: null,
};

const track: LibraryTrack = {
  id: 'track-1',
  path: 'D:\\Music\\track-1.flac',
  title: 'Track One',
  artist: 'Artist One',
  album: 'Album One',
  albumArtist: 'Artist One',
  trackNo: 1,
  discNo: 1,
  year: 2026,
  genre: 'Rock',
  duration: 180,
  codec: 'flac',
  sampleRate: 44_100,
  bitDepth: 16,
  bitrate: 320_000,
  coverId: null,
  coverThumb: null,
  embeddedMetadataStatus: 'present',
  embeddedCoverStatus: 'missing',
  networkMetadataStatus: 'none',
  fieldSources: {},
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('GenreDetailView', () => {
  it('opens on the album wall without fetching the full track list', async () => {
    window.echo = {
      library: {
        getGenreTracks: vi.fn().mockResolvedValue({ items: [track], page: 1, pageSize: 500, total: 1, hasMore: false }),
      },
    } as unknown as Window['echo'];

    render(<GenreDetailView genre={genre} onBack={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Rock' })).toBeTruthy();
    expect(document.querySelector('.album-detail-page.genre-detail-page')).toBeTruthy();
    expect(document.querySelector('.album-detail-hero')).toBeTruthy();
    expect(screen.getByText('Genre albums')).toBeTruthy();
    expect(screen.queryByText('Track One')).toBeNull();
    expect(window.echo.library.getGenreTracks).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'genreDetail.tab.tracks' }));
    expect(await screen.findByText('Track One')).toBeTruthy();
    expect(screen.getByText('Artist One')).toBeTruthy();

    await waitFor(() => expect(window.echo.library.getGenreTracks).toHaveBeenCalledTimes(1));
  });

  it('loads genre tracks only when playback is requested from the album wall', async () => {
    window.echo = {
      library: {
        getGenreTracks: vi.fn().mockResolvedValue({ items: [track], page: 1, pageSize: 500, total: 1, hasMore: false }),
      },
    } as unknown as Window['echo'];
    queueMock.playTrack.mockResolvedValue(undefined);

    render(<GenreDetailView genre={genre} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'genreDetail.action.play' }));

    await waitFor(() => expect(window.echo.library.getGenreTracks).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(queueMock.playTrack).toHaveBeenCalledWith(track, expect.objectContaining({
      replaceQueueWith: [track],
    })));
    expect(screen.queryByText('Track One')).toBeNull();
  });

  it('renders large genre track lists in bounded batches without truncating playback context', async () => {
    const manyTracks = Array.from({ length: 200 }, (_, index) => ({
      ...track,
      id: `track-${index + 1}`,
      path: `D:\\Music\\track-${index + 1}.flac`,
      title: `Track ${index + 1}`,
    }));
    window.echo = {
      library: {
        getGenreTracks: vi.fn().mockResolvedValue({
          items: manyTracks,
          page: 1,
          pageSize: 500,
          total: manyTracks.length,
          hasMore: false,
        }),
      },
    } as unknown as Window['echo'];
    queueMock.playTrack.mockResolvedValue(undefined);

    render(<GenreDetailView genre={{ ...genre, trackCount: manyTracks.length }} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'genreDetail.tab.tracks' }));

    expect(await screen.findByText('Track 1')).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(80);
    expect(screen.queryByText('Track 81')).toBeNull();
    expect(document.querySelector('.infinite-scroll-sentinel')).toBeTruthy();

    fireEvent.click(screen.getAllByRole('listitem')[0]);
    await waitFor(() => expect(queueMock.playTrack).toHaveBeenCalledWith(manyTracks[0], expect.objectContaining({
      replaceQueueWith: manyTracks,
    })));
  });
});
