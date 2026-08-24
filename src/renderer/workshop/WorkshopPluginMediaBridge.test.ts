// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runWorkshopPluginMediaAction } from './WorkshopPluginMediaBridge';

beforeEach(() => {
  window.echo = {
    library: {
      getAlbums: vi.fn(async () => ({
        page: 1,
        pageSize: 50,
        total: 1,
        hasMore: false,
        items: [{
          id: 'album-1',
          mediaType: 'remote',
          sourceId: 'private-source',
          provider: 'private-provider',
          albumKey: 'private-key',
          title: 'Album',
          albumArtist: 'Artist',
          year: 2026,
          trackCount: 2,
          duration: 360,
          coverId: null,
          coverThumb: 'https://private.example/cover.jpg',
        }],
      })),
      getPlaylists: vi.fn(async () => ([
        { id: 'local-1', name: 'Local', description: null, kind: 'manual', sourceProvider: 'local', itemCount: 2, coverThumb: null },
        { id: 'remote-1', name: 'Remote', description: null, kind: 'manual', sourceProvider: 'subsonic', itemCount: 5, coverThumb: null },
      ])),
      createPlaylist: vi.fn(async (input: { name: string; description?: string | null }) => ({
        id: 'created-1', name: input.name, description: input.description ?? null, kind: 'manual', sourceProvider: 'local', itemCount: 0, coverThumb: null,
      })),
    },
  } as unknown as Window['echo'];
});

afterEach(() => {
  window.echo = undefined as unknown as Window['echo'];
});

describe('WorkshopPluginMediaBridge', () => {
  it('sanitizes structured library groups and exposes only local playlists', async () => {
    await expect(runWorkshopPluginMediaAction('library:getAlbums', {}, null)).resolves.toEqual({
      page: 1,
      pageSize: 50,
      total: 1,
      hasMore: false,
      items: [{
        id: 'album-1',
        mediaType: 'remote',
        title: 'Album',
        albumArtist: 'Artist',
        year: 2026,
        trackCount: 2,
        durationSeconds: 360,
        coverUrl: null,
      }],
    });
    await expect(runWorkshopPluginMediaAction('library:getPlaylists', {}, null)).resolves.toEqual([
      expect.objectContaining({ id: 'local-1', name: 'Local' }),
    ]);
  });

  it('bounds local playlist creation and rejects arbitrary navigation targets', async () => {
    await expect(runWorkshopPluginMediaAction('library:createPlaylist', {
      name: `  ${'A'.repeat(140)}  `,
      description: 'Ideas',
    }, null)).resolves.toEqual(expect.objectContaining({
      id: 'created-1',
      name: 'A'.repeat(120),
    }));
    await expect(runWorkshopPluginMediaAction('navigation:open', {
      routeId: 'https://example.com',
    }, null)).rejects.toThrow('invalid-payload');
  });

  it('creates a temporary direct-stream track but rejects platform page URLs', async () => {
    const playTrack = vi.fn(async () => undefined);
    const queue = { playTrack } as never;
    await expect(runWorkshopPluginMediaAction('sources:playDirect', {
      url: 'https://radio.example/live.mp3',
      title: 'My Radio',
      live: true,
    }, queue)).resolves.toEqual({
      track: expect.objectContaining({ title: 'My Radio', mediaType: 'streaming' }),
    });
    expect(playTrack).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'm3u8', isTemporary: true, isLiveStream: true }),
      expect.objectContaining({ routeToConnectOutput: false, forceRefresh: true }),
    );
    await expect(runWorkshopPluginMediaAction('playback:playUrl', {
      url: 'https://share.example/tracks/shared.flac',
      title: 'Shared Song',
      live: false,
    }, queue)).resolves.toEqual({
      track: expect.objectContaining({ title: 'Shared Song', mediaType: 'streaming' }),
    });
    await expect(runWorkshopPluginMediaAction('sources:playDirect', {
      url: 'https://www.youtube.com/watch?v=not-a-direct-stream',
    }, queue)).rejects.toThrow('direct-source-platform-unsupported');
  });
});
