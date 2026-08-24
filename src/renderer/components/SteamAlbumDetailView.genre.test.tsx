// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AlbumOnlineInfo, LibraryAlbum, LibraryGenre, LibraryTrack } from '../../shared/types/library';
import { consumePendingGenreDetailNavigation } from '../utils/genreNavigation';
import { SteamAlbumDetailView } from './album/SteamAlbumDetailView';

vi.mock('../i18n/I18nProvider', () => ({
  useI18n: () => ({
    locale: 'en-US',
    t: (key: string, options?: Record<string, string | number>) =>
      key === 'albumDetail.aria.details'
        ? `${options?.album} album details`
        : key,
  }),
}));

const queueMock = vi.hoisted(() => ({
  appendToQueue: vi.fn(),
  appendTracksToQueue: vi.fn(),
  currentTrackId: null,
  playTrack: vi.fn(),
  playTrackNext: vi.fn(),
  removeTrackFromQueue: vi.fn(),
}));

vi.mock('../stores/PlaybackQueueProvider', () => ({
  usePlaybackQueue: () => queueMock,
}));

const album: LibraryAlbum = {
  id: 'album-1',
  albumKey: 'album-1',
  title: 'Album One',
  albumArtist: 'Artist One',
  year: 2026,
  trackCount: 1,
  duration: 180,
  coverId: null,
  coverThumb: null,
};

const albumTrack = (genre: string | null): LibraryTrack => ({
  id: 'track-1',
  path: 'D:\\Music\\track-1.flac',
  title: 'Track One',
  artist: 'Artist One',
  album: 'Album One',
  albumArtist: 'Artist One',
  trackNo: 1,
  discNo: 1,
  year: 2026,
  genre,
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
});

const rockGenre: LibraryGenre = {
  genreKey: 'rock',
  name: 'Rock',
  unclassified: false,
  trackCount: 1,
  albumCount: 1,
  coverId: null,
  coverThumb: null,
};

const installBridge = (
  tracks: LibraryTrack[],
  getGenre = vi.fn().mockResolvedValue(rockGenre),
  onlineInfo: AlbumOnlineInfo | null = null,
): ReturnType<typeof vi.fn> => {
  window.echo = {
    app: {
      getSettings: vi.fn().mockResolvedValue({}),
    },
    library: {
      getAlbumOnlineInfo: vi.fn().mockResolvedValue(onlineInfo),
      getAlbumTracks: vi.fn().mockResolvedValue({ items: tracks, page: 1, pageSize: 100, total: tracks.length, hasMore: false }),
      getGenre,
    },
  } as unknown as Window['echo'];
  return getGenre;
};

afterEach(() => {
  consumePendingGenreDetailNavigation();
  window.localStorage.removeItem('echo.album-detail.track-sort');
  cleanup();
  vi.clearAllMocks();
});

describe('Steam album detail genres', () => {
  it('shows tagged genres and opens the matching genre browse page', async () => {
    const getGenre = installBridge([albumTrack('Rock')]);
    render(<SteamAlbumDetailView album={album} onBack={vi.fn()} />);

    const genreButtons = await screen.findAllByRole('button', { name: 'albumDetail.fact.genre: Rock' });
    expect(genreButtons.length).toBeGreaterThan(0);
    fireEvent.click(genreButtons[0]);

    await waitFor(() => expect(getGenre).toHaveBeenCalledWith('rock', { sourceProvider: 'local' }));
    expect(consumePendingGenreDetailNavigation()?.genre.genreKey).toBe('rock');
  });

  it('hides the genre block when the album has no genre tags', async () => {
    installBridge([albumTrack(null)]);
    render(<SteamAlbumDetailView album={album} onBack={vi.fn()} />);

    await screen.findByText('Track One');
    expect(screen.queryByRole('button', { name: /albumDetail.fact.genre/ })).toBeNull();
    expect(screen.queryByText('albumDetail.fact.genre')).toBeNull();
  });

  it('moves track sorting into the hero more menu', async () => {
    installBridge([albumTrack(null)]);
    render(<SteamAlbumDetailView album={album} onBack={vi.fn()} />);

    await screen.findByText('Track One');
    expect(screen.queryByRole('button', { name: 'albumDetail.tracks.sort.aria' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'albumDetail.action.more' }));
    fireEvent.click(screen.getByRole('option', { name: 'library.albums.sort.titleAsc' }));

    expect(window.localStorage.getItem('echo.album-detail.track-sort')).toBe('titleAsc');
    expect(screen.queryByRole('listbox', { name: 'albumDetail.tracks.sort.aria' })).toBeNull();
  });

  it('shows every available album rating below the track count in the overview facts', async () => {
    installBridge([albumTrack(null)], vi.fn().mockResolvedValue(rockGenre), {
      albumId: album.id,
      status: 'ready',
      sources: [],
      match: null,
      sourceLinks: [],
      externalRatings: [
        {
          provider: 'discogs',
          score: 4.63,
          maxScore: 5,
          ratingCount: 19,
          rankText: null,
          url: null,
          fetchedAt: null,
          expiresAt: null,
          confidence: 0.83,
        },
        {
          provider: 'musicbrainz',
          score: 91,
          maxScore: 100,
          ratingCount: 8,
          rankText: null,
          url: null,
          fetchedAt: null,
          expiresAt: null,
          confidence: 0.91,
        },
      ],
      releaseDetails: null,
      releaseVersions: [],
      credits: [],
      information: null,
      artistInformation: null,
      fetchedAt: null,
      expiresAt: null,
      fromCache: false,
      errors: [],
    });

    const { container } = render(<SteamAlbumDetailView album={album} onBack={vi.fn()} />);
    await screen.findByText('4.63 / 5');
    await screen.findByText('91 / 100');

    const facts = Array.from(container.querySelectorAll('.album-detail-facts .album-fact'));
    expect(facts.map((fact) => fact.textContent)).toEqual([
      'albumDetail.tab.sourcesalbumDetail.fact.library',
      'albumDetail.tab.tracks1',
      'albumDetail.fact.rating · Discogs4.63 / 5',
      'albumDetail.fact.rating · MusicBrainz91 / 100',
    ]);
  });

  it('loads ratings immediately when a remote album detail opens', async () => {
    installBridge([albumTrack(null)]);
    const getAlbumOnlineInfo = window.echo?.library?.getAlbumOnlineInfo as ReturnType<typeof vi.fn>;

    render(<SteamAlbumDetailView album={{ ...album, id: 'remote-album', mediaType: 'remote' }} onBack={vi.fn()} />);

    await waitFor(() => expect(getAlbumOnlineInfo).toHaveBeenCalledWith('remote-album', { force: false, provider: 'all' }));
  });
});
