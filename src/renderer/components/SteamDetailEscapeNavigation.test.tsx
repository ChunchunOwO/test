// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ArtistInsights, LibraryAlbum, LibraryArtist, LibraryTrack } from '../../shared/types/library';
import { SteamAlbumDetailView } from './album/SteamAlbumDetailView';
import { SteamArtistDetailView } from './artist/SteamArtistDetailView';

vi.mock('../i18n/I18nProvider', () => ({
  useI18n: () => ({
    locale: 'en-US',
    t: (key: string, options?: Record<string, string | number>) =>
      key === 'albumDetail.aria.details'
        ? `${options?.album} album details`
        : key === 'artistDetail.aria.details'
          ? `${options?.artist} artist details`
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

const artist: LibraryArtist = {
  id: 'artist-1',
  name: 'Artist One',
  sortName: 'artist one',
  role: 'both',
  trackCount: 1,
  albumCount: 1,
  coverId: null,
  coverThumb: null,
};

const albumTrack: LibraryTrack = {
  id: 'track-1',
  path: 'D:\\Music\\track-1.flac',
  title: 'Track One',
  artist: 'Artist One',
  album: 'Album One',
  albumArtist: 'Artist One',
  trackNo: 1,
  discNo: 1,
  year: 2026,
  genre: null,
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

const artistInsights = (concerts: ArtistInsights['concerts']): ArtistInsights => ({
  artist,
  nodes: [],
  edges: [],
  onlineInfo: {
    status: 'empty',
    bio: null,
    imageCredits: [],
    externalLinks: [],
    relatedArtists: [],
    sourceLabels: [],
    fetchedAt: null,
  },
  concerts,
  generatedAt: '2026-06-01T00:00:00.000Z',
});

const installBridge = (getArtistInsights = vi.fn().mockResolvedValue(null)): void => {
  window.echo = {
    app: {
      getSettings: vi.fn().mockResolvedValue({}),
    },
    library: {
      getAlbumOnlineInfo: vi.fn().mockResolvedValue(null),
      getAlbumTracks: vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0, hasMore: false }),
      getArtistInsights,
      getArtistTracks: vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 500, total: 0, hasMore: false }),
    },
  } as unknown as Window['echo'];
};

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.clearAllMocks();
});

describe('Steam detail Escape navigation', () => {
  it('uses a compact heading scale for very long album titles without truncating them', () => {
    installBridge();
    const title = 'In The Court Of The Crimson King (An Observation By King Crimson) (King Crimson 40th Anniversary Series Version)';
    render(<SteamAlbumDetailView album={{ ...album, title }} onBack={vi.fn()} />);

    const heading = screen.getByRole('heading', { level: 1, name: title });
    expect(heading.classList.contains('album-detail-title--very-long')).toBe(true);
    expect(heading.textContent).toBe(title);
  });

  it('returns from an album detail after the existing return animation', () => {
    installBridge();
    const onBack = vi.fn();
    render(<SteamAlbumDetailView album={album} onBack={onBack} />);

    vi.useFakeTimers();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onBack).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(160));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('opens the shared track menu from a Steam album row right click', async () => {
    installBridge();
    window.echo.library.getAlbumTracks = vi.fn().mockResolvedValue({ items: [albumTrack], page: 1, pageSize: 100, total: 1, hasMore: false });
    render(<SteamAlbumDetailView album={album} onBack={vi.fn()} />);

    const row = await screen.findByRole('listitem');
    fireEvent.contextMenu(row, { clientX: 320, clientY: 220 });

    const playNext = await screen.findByRole('menuitem', { name: 'trackMenu.action.playNext' });
    fireEvent.click(playNext);

    await waitFor(() => expect(queueMock.playTrackNext).toHaveBeenCalledWith(albumTrack, expect.objectContaining({ albumId: album.id })));
  });

  it('returns from an artist detail after the existing return animation', () => {
    installBridge();
    const onBack = vi.fn();
    render(<SteamArtistDetailView artist={artist} onBack={onBack} />);

    vi.useFakeTimers();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onBack).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(180));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('Steam artist concert information', () => {
  it('shows the year, venue-local time, location, source, and external-link affordance', async () => {
    installBridge(vi.fn().mockResolvedValue(artistInsights({
      status: 'ready',
      region: 'HK',
      sources: ['ticketmaster'],
      fetchedAt: '2026-06-01T00:00:00.000Z',
      events: [{
        id: 'ticketmaster:event-1',
        source: 'ticketmaster',
        sourceLabel: 'Ticketmaster',
        title: 'Echo Unit Live',
        startsAt: '2026-06-01T11:00:00Z',
        timezone: 'Asia/Hong_Kong',
        timeTbd: false,
        venueName: 'Echo Arena',
        city: 'Hong Kong',
        region: 'HK',
        country: 'HK',
        url: 'https://tickets.example/event-1',
        ticketUrl: 'https://tickets.example/event-1',
        venueUrl: null,
        imageUrl: null,
      }],
    })));

    render(<SteamArtistDetailView artist={artist} onBack={vi.fn()} />);

    expect(await screen.findByText('Echo Arena')).toBeTruthy();
    expect(screen.getByText('Echo Unit Live / Hong Kong / HK')).toBeTruthy();
    expect(screen.getByText('19:00')).toBeTruthy();
    expect(screen.getAllByText('Ticketmaster').length).toBeGreaterThan(0);
    expect(screen.getByText(/2026/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /artistDetail\.events\.openDetails/u }).getAttribute('href')).toBe('https://tickets.example/event-1');
  });

  it('localizes unavailable state instead of exposing a backend error message', async () => {
    installBridge(vi.fn().mockResolvedValue(artistInsights({
      status: 'unavailable',
      region: null,
      sources: ['eventernote'],
      events: [],
      fetchedAt: '2026-06-01T00:00:00.000Z',
      message: 'eventernote_request_failed:503',
    })));

    render(<SteamArtistDetailView artist={artist} onBack={vi.fn()} />);

    expect((await screen.findAllByText('artistDetail.events.unavailable')).length).toBeGreaterThan(0);
    expect(screen.queryByText('eventernote_request_failed:503')).toBeNull();
  });
});
