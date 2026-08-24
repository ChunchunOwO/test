import { describe, expect, it, vi } from 'vitest';
import type { SteamClient } from './SteamRuntimeService';
import { SteamWorkshopService } from './SteamWorkshopService';

const createClient = (): SteamClient => ({
  workshop: {
    getSubscribedItems: vi.fn(() => [123n, 456n]),
    state: vi.fn((itemId: bigint) => itemId === 123n ? 1 | 4 : 1 | 8 | 16),
    installInfo: vi.fn((itemId: bigint) => itemId === 123n
      ? { folder: 'D:\\Steam\\workshop\\123', sizeOnDisk: 2048n, timestamp: 1_786_000_000 }
      : null),
    downloadInfo: vi.fn((itemId: bigint) => itemId === 456n ? { current: 512n, total: 4096n } : null),
    download: vi.fn(() => true),
    getAllItems: vi.fn(async () => ({ items: [], returnedResults: 0, totalResults: 0, wasCached: false })),
    subscribe: vi.fn(async () => undefined),
    unsubscribe: vi.fn(async () => undefined),
  },
  overlay: {
    activateToWebPage: vi.fn(),
  },
  utils: {
    getAppId: vi.fn(() => 480),
  },
} as unknown as SteamClient);

describe('SteamWorkshopService', () => {
  it('returns serializable subscribed item state without loading any content', () => {
    const client = createClient();
    const service = new SteamWorkshopService({ getClient: () => client });

    expect(service.listSubscribed()).toEqual({
      available: true,
      items: [
        {
          itemId: '123',
          subscribed: true,
          installed: true,
          needsUpdate: false,
          downloading: false,
          downloadPending: false,
          locallyDisabled: false,
          install: {
            sizeOnDiskBytes: '2048',
            installedAtUnixSeconds: 1_786_000_000,
          },
          download: null,
          error: null,
        },
        {
          itemId: '456',
          subscribed: true,
          installed: false,
          needsUpdate: true,
          downloading: true,
          downloadPending: false,
          locallyDisabled: false,
          install: null,
          download: { downloadedBytes: '512', totalBytes: '4096' },
          error: null,
        },
      ],
    });
  });

  it('fails closed when Steam is unavailable or an item id is invalid', () => {
    const service = new SteamWorkshopService({ getClient: () => null });

    expect(service.listSubscribed()).toEqual({
      available: false,
      reason: 'source-unavailable',
      items: [],
    });
    expect(service.requestDownload('../123')).toEqual({ ok: false, reason: 'invalid-item-id' });
    expect(service.requestDownload('123')).toEqual({ ok: false, reason: 'source-unavailable' });
  });

  it('only requests downloads for subscribed items and preserves Steam acknowledgement', () => {
    const client = createClient();
    const service = new SteamWorkshopService({ getClient: () => client });

    expect(service.requestDownload('456', true)).toEqual({ ok: true, state: 'accepted' });
    expect(client.workshop.download).toHaveBeenCalledWith(456n, true);
    expect(service.requestDownload('123')).toEqual({ ok: true, state: 'already-current' });

    vi.mocked(client.workshop.state).mockReturnValueOnce(0);
    expect(service.requestDownload('999')).toEqual({ ok: false, reason: 'not-subscribed' });
  });

  it('keeps the Steam install directory on a separate main-process-only method', () => {
    const client = createClient();
    const service = new SteamWorkshopService({ getClient: () => client });

    expect(service.getInstallLocation('123')).toEqual({
      ok: true,
      itemId: '123',
      directory: 'D:\\Steam\\workshop\\123',
      sizeOnDiskBytes: '2048',
      installedAtUnixSeconds: 1_786_000_000,
    });
    expect(service.getInstallLocation('456')).toEqual({ ok: false, reason: 'not-installed' });
  });

  it('browses public items without exposing owners and proxies Steam CDN previews', async () => {
    const client = createClient();
    vi.mocked(client.workshop.getAllItems).mockResolvedValueOnce({
      items: [
        {
          publishedFileId: 999n,
          title: 'Mint Theme',
          description: 'A local theme pack',
          tags: ['theme', 'mint'],
          banned: false,
          numUpvotes: 12,
          numDownvotes: 1,
          timeUpdated: 1_786_400_000,
          previewUrl: 'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/1.png',
          owner: { steamId64: 76561198000000000n, steamId32: 'STEAM_0:0:1', accountId: 1 },
          statistics: { numSubscriptions: 40n },
        },
        {
          publishedFileId: 1000n,
          title: 'Banned',
          description: 'nope',
          tags: [],
          banned: true,
          numUpvotes: 0,
          numDownvotes: 0,
          timeUpdated: 1,
          previewUrl: 'https://example.com/tracker.png',
          owner: { steamId64: 1n, steamId32: 'x', accountId: 2 },
          statistics: {},
        },
        {
          publishedFileId: 1001n,
          title: 'Off-host preview',
          description: 'nope',
          tags: [],
          banned: false,
          numUpvotes: 0,
          numDownvotes: 0,
          timeUpdated: 1,
          previewUrl: 'https://example.com/tracker.png',
          owner: { steamId64: 1n, steamId32: 'x', accountId: 2 },
          statistics: {},
        },
      ],
      returnedResults: 3,
      totalResults: 3,
      wasCached: false,
    } as never);
    const service = new SteamWorkshopService({ getClient: () => client });

    const page = await service.browse({ page: 1, sort: 'trend' });
    expect(page).toMatchObject({
      available: true,
      total: 3,
    });
    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({
      itemId: '999',
      title: 'Mint Theme',
      subscribed: false,
      previewUrl: expect.stringMatching(/^echo-workshop:\/\/preview\/\?u=/),
    });
    expect(page.items[1]?.previewUrl).toBeNull();
    expect(JSON.stringify(page)).not.toContain('76561198000000000');
    expect(JSON.stringify(page)).not.toContain('example.com');
    expect(client.workshop.getAllItems).toHaveBeenCalledWith(
      1,
      3,
      0,
      480,
      480,
      expect.objectContaining({ includeMetadata: true }),
    );
  });

  it('subscribes, unsubscribes and opens the Steam overlay to the community item page', async () => {
    const client = createClient();
    const service = new SteamWorkshopService({ getClient: () => client });

    await expect(service.subscribe('999')).resolves.toEqual({ ok: true });
    expect(client.workshop.subscribe).toHaveBeenCalledWith(999n);
    await expect(service.unsubscribe('999')).resolves.toEqual({ ok: true });
    expect(client.workshop.unsubscribe).toHaveBeenCalledWith(999n);
    expect(service.openInSteam('999')).toEqual({ ok: true });
    expect(client.overlay.activateToWebPage).toHaveBeenCalledWith(
      'https://steamcommunity.com/sharedfiles/filedetails/?id=999',
    );
    expect(service.openInSteam('../999')).toEqual({ ok: false, reason: 'invalid-item-id' });
  });
});
