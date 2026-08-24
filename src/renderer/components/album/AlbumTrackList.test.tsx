// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AlbumTrackList } from './AlbumTrackList';
import type { LibraryPage, LibraryTrack } from '../../../shared/types/library';

vi.mock('../../i18n/I18nProvider', () => {
  const strings: Record<string, string> = {
    'albumDetail.count.loadedTracks': '{loaded} of {total} tracks',
    'albumDetail.count.tracks': '{count} tracks',
    'albumDetail.duration.hours': '{hours} hr {minutes} min',
    'albumDetail.duration.minutes': '{minutes} min',
    'albumDetail.status.readingSignal': 'Reading signal',
    'albumDetail.status.unknownLength': 'Unknown length',
    'albumDetail.tracks.action.like': 'Like {title}',
    'albumDetail.tracks.action.likeTitle': 'Like',
    'albumDetail.tracks.action.unlike': 'Unlike {title}',
    'albumDetail.tracks.action.unlikeTitle': 'Unlike',
    'albumDetail.tracks.aria': 'Album tracks',
    'albumDetail.tracks.column.signal': 'Signal',
    'albumDetail.tracks.column.time': 'Time',
    'albumDetail.tracks.column.title': 'Title',
    'albumDetail.tracks.disc': 'DISC {number}',
    'albumDetail.tracks.discUnknown': 'DISC ?',
    'albumDetail.tracks.empty': 'No tracks found for this album.',
    'albumDetail.tracks.formatAria': 'Track format',
    'albumDetail.tracks.loadMore': 'Load more',
    'albumDetail.tracks.loading': 'Loading...',
    'albumDetail.tracks.sort.aria': 'Track sort',
    'albumDetail.tracks.sort.default': 'Disc / track number',
    'albumDetail.tracks.sort.filename': 'File name',
    'albumDetail.tracks.summaryAria': 'Track summary',
    'library.albums.sort.artist': 'Artist',
    'library.albums.sort.titleAsc': 'Title A-Z',
    'library.albums.sort.titleDesc': 'Title Z-A',
    'library.sort.durationAsc': 'Shortest first',
    'library.sort.durationDesc': 'Longest first',
  };

  return {
    useI18n: () => ({
      t: (key: string, options?: Record<string, string | number>) =>
        Object.entries(options ?? {}).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), strings[key] ?? key),
    }),
  };
});

const track = (id: string, overrides: Partial<LibraryTrack> = {}): LibraryTrack => ({
  id,
  path: `D:\\Music\\${id}.flac`,
  title: `Track ${id}`,
  artist: 'Artist',
  album: 'Album',
  albumArtist: 'Artist',
  trackNo: Number(id.replace(/\D/g, '')) || 1,
  discNo: 1,
  year: 2026,
  genre: null,
  duration: 180,
  codec: 'flac',
  sampleRate: 96000,
  bitDepth: 24,
  bitrate: 900000,
  coverId: null,
  coverThumb: null,
  embeddedMetadataStatus: 'present',
  embeddedCoverStatus: 'missing',
  networkMetadataStatus: 'none',
  fieldSources: {},
  ...overrides,
});

const page = (items: LibraryTrack[], overrides: Partial<LibraryPage<LibraryTrack>> = {}): LibraryPage<LibraryTrack> => ({
  items,
  page: 1,
  pageSize: 100,
  total: items.length,
  hasMore: false,
  ...overrides,
});

const installLibrary = (getAlbumTracks: ReturnType<typeof vi.fn>): void => {
  window.echo = {
    library: {
      getAlbumTracks,
    },
  } as unknown as Window['echo'];
};

afterEach(() => {
  window.localStorage.removeItem('echo.album-detail.track-sort');
  cleanup();
  vi.restoreAllMocks();
});

describe('AlbumTrackList', () => {
  it('initially requests only page 1 and loads more on demand', async () => {
    const getAlbumTracks = vi
      .fn()
      .mockResolvedValueOnce(page([track('1')], { page: 1, total: 2, hasMore: true }))
      .mockResolvedValueOnce(page([track('2')], { page: 2, total: 2, hasMore: false }));
    installLibrary(getAlbumTracks);

    render(<AlbumTrackList albumId="album-1" currentTrackId={null} onPlayTrack={vi.fn()} />);

    await waitFor(() => expect(getAlbumTracks).toHaveBeenCalledTimes(1));
    expect(getAlbumTracks).toHaveBeenNthCalledWith(1, 'album-1', { page: 1, pageSize: 100 });

    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));

    await waitFor(() => expect(getAlbumTracks).toHaveBeenCalledTimes(2));
    expect(getAlbumTracks).toHaveBeenNthCalledWith(2, 'album-1', { page: 2, pageSize: 100 });
  });

  it('defers the initial track query when a load delay is provided', async () => {
    const getAlbumTracks = vi.fn().mockResolvedValue(page([track('1')]));
    installLibrary(getAlbumTracks);

    render(<AlbumTrackList albumId="album-1" currentTrackId={null} initialLoadDelayMs={25} onPlayTrack={vi.fn()} />);

    expect(getAlbumTracks).not.toHaveBeenCalled();
    await new Promise((resolve) => window.setTimeout(resolve, 10));
    expect(getAlbumTracks).not.toHaveBeenCalled();

    await waitFor(() => expect(getAlbumTracks).toHaveBeenCalledTimes(1));
    expect(getAlbumTracks).toHaveBeenCalledWith('album-1', { page: 1, pageSize: 100 });
  });

  it('blocks the initial track query until playback priority pressure clears', async () => {
    const getAlbumTracks = vi.fn().mockResolvedValue(page([track('1')]));
    installLibrary(getAlbumTracks);

    const view = render(<AlbumTrackList albumId="album-1" currentTrackId={null} initialLoadBlocked onPlayTrack={vi.fn()} />);

    await new Promise((resolve) => window.setTimeout(resolve, 20));
    expect(getAlbumTracks).not.toHaveBeenCalled();

    view.rerender(<AlbumTrackList albumId="album-1" currentTrackId={null} initialLoadBlocked={false} onPlayTrack={vi.fn()} />);

    await waitFor(() => expect(getAlbumTracks).toHaveBeenCalledTimes(1));
    expect(getAlbumTracks).toHaveBeenCalledWith('album-1', { page: 1, pageSize: 100 });
  });

  it('reports loaded tracks, total count, and loading state to the detail console', async () => {
    const first = track('1', { genre: 'Future Bass' });
    const second = track('2', { discNo: 2, genre: 'Future Bass' });
    const getAlbumTracks = vi
      .fn()
      .mockResolvedValueOnce(page([first], { page: 1, total: 2, hasMore: true }))
      .mockResolvedValueOnce(page([second], { page: 2, total: 2, hasMore: false }));
    const onLoadedTracksChange = vi.fn();
    const onFirstTrackChange = vi.fn();
    installLibrary(getAlbumTracks);

    render(
      <AlbumTrackList
        albumId="album-1"
        currentTrackId={null}
        onFirstTrackChange={onFirstTrackChange}
        onLoadedTracksChange={onLoadedTracksChange}
        onPlayTrack={vi.fn()}
      />,
    );

    await waitFor(() => expect(onLoadedTracksChange).toHaveBeenLastCalledWith([first], 2, false));
    expect(onFirstTrackChange).toHaveBeenLastCalledWith(first, false);

    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));

    await waitFor(() => expect(onLoadedTracksChange).toHaveBeenLastCalledWith([first, second], 2, false));
  });

  it('plays a track once from row click', async () => {
    const getAlbumTracks = vi.fn().mockResolvedValue(page([track('1')]));
    const onPlayTrack = vi.fn();
    installLibrary(getAlbumTracks);

    render(<AlbumTrackList albumId="album-1" currentTrackId={null} onPlayTrack={onPlayTrack} />);

    await screen.findByText('Track 1');
    fireEvent.click(screen.getByRole('listitem'));

    expect(onPlayTrack).toHaveBeenCalledTimes(1);
    expect(onPlayTrack).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }));
  });

  it('groups loaded album tracks by disc number when multi-disc tags are present', async () => {
    const getAlbumTracks = vi.fn().mockResolvedValue(
      page([
        track('1', { discNo: 1, trackNo: 1, title: 'Disc one opener' }),
        track('2', { discNo: 2, trackNo: 1, title: 'Disc two opener' }),
      ]),
    );
    installLibrary(getAlbumTracks);

    render(<AlbumTrackList albumId="album-1" currentTrackId={null} onPlayTrack={vi.fn()} />);

    expect(await screen.findByText('DISC 1')).toBeTruthy();
    expect(screen.getByText('DISC 2')).toBeTruthy();
    expect(screen.getByText('1-1')).toBeTruthy();
    expect(screen.getByText('2-1')).toBeTruthy();
    expect(screen.getByText('Disc one opener')).toBeTruthy();
    expect(screen.getByText('Disc two opener')).toBeTruthy();
  });

  it('lets the user sort album tracks without disc headings', async () => {
    const getAlbumTracks = vi.fn().mockResolvedValue(
      page([
        track('1', { title: 'Zebra', discNo: 1, trackNo: 1 }),
        track('2', { title: 'Alpha', discNo: 2, trackNo: 1 }),
      ]),
    );
    installLibrary(getAlbumTracks);

    render(<AlbumTrackList albumId="album-1" currentTrackId={null} onPlayTrack={vi.fn()} />);

    expect(await screen.findByText('DISC 1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Track sort' }));
    fireEvent.click(screen.getByRole('option', { name: 'Title A-Z' }));

    await waitFor(() => expect(screen.queryByText('DISC 1')).toBeNull());
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]?.textContent).toContain('Alpha');
    expect(rows[1]?.textContent).toContain('Zebra');
  });

  it('accepts an external sort while hiding its local sort control', async () => {
    const getAlbumTracks = vi.fn().mockResolvedValue(
      page([
        track('1', { title: 'Zebra', discNo: 1, trackNo: 1 }),
        track('2', { title: 'Alpha', discNo: 2, trackNo: 1 }),
      ]),
    );
    installLibrary(getAlbumTracks);

    render(
      <AlbumTrackList
        albumId="album-1"
        currentTrackId={null}
        trackSort="titleAsc"
        showSortControl={false}
        onPlayTrack={vi.fn()}
      />,
    );

    await screen.findByText('Alpha');
    expect(screen.queryByRole('button', { name: 'Track sort' })).toBeNull();
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]?.textContent).toContain('Alpha');
    expect(rows[1]?.textContent).toContain('Zebra');
  });

  it('opens the shared track menu from row right click', async () => {
    const getAlbumTracks = vi.fn().mockResolvedValue(page([track('1')]));
    const onOpenTrackMenu = vi.fn();
    installLibrary(getAlbumTracks);

    render(<AlbumTrackList albumId="album-1" currentTrackId={null} onOpenTrackMenu={onOpenTrackMenu} onPlayTrack={vi.fn()} />);

    const row = await screen.findByRole('listitem');
    fireEvent.contextMenu(row, { clientX: 240, clientY: 160 });

    expect(onOpenTrackMenu).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }), { x: 240, y: 160 });
  });

  it('renders the compact album summary and empty state', async () => {
    const getAlbumTracks = vi.fn().mockResolvedValue(page([]));
    installLibrary(getAlbumTracks);

    render(
      <AlbumTrackList
        albumId="album-1"
        currentTrackId={null}
        summary={{ duration: '42 min', signal: 'DSF / 1bit / 5645kHz', totalLabel: '2 tracks' }}
        onPlayTrack={vi.fn()}
      />,
    );

    const summary = await screen.findByLabelText('Track summary');
    expect(summary.textContent).toContain('2 tracks');
    expect(summary.textContent).toContain('42 min');
    expect(summary.textContent).toContain('DSF / 1bit / 5645kHz');
    expect(await screen.findByText('No tracks found for this album.')).toBeTruthy();
  });

  it('derives the compact summary from loaded track metadata when no summary is provided', async () => {
    const getAlbumTracks = vi.fn().mockResolvedValue(
      page([
        track('1', { duration: 276, codec: 'flac', sampleRate: 44100, bitDepth: 24, bitrate: 1800000 }),
      ]),
    );
    installLibrary(getAlbumTracks);

    render(<AlbumTrackList albumId="album-1" currentTrackId={null} onPlayTrack={vi.fn()} />);

    const summary = await screen.findByLabelText('Track summary');
    await waitFor(() => expect(summary.textContent).toContain('5 min'));
    expect(summary.textContent).toContain('FLAC');
    expect(summary.textContent).toContain('24bit');
    expect(summary.textContent).toContain('44kHz');
  });
});
