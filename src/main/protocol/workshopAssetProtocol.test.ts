import { describe, expect, it, vi } from 'vitest';

const handleMock = vi.fn();
const resolveMock = vi.fn();
const resolveUiRuntimeMock = vi.fn();
const resolvePluginAssetMock = vi.fn();
const fetchMock = vi.fn();

vi.mock('electron', () => ({
  protocol: {
    handle: handleMock,
  },
}));

vi.mock('../workshop/WorkshopAssetResolver', () => ({
  getWorkshopAssetResolver: () => ({ resolve: resolveMock, resolveUiRuntime: resolveUiRuntimeMock }),
}));

vi.mock('../workshop/WorkshopPluginService', () => ({
  getBoundWorkshopPluginService: () => ({ resolveAsset: resolvePluginAssetMock }),
}));

vi.mock('../network/networkFetch', () => ({
  fetchWithNetworkProxy: (...args: unknown[]) => fetchMock(...args),
}));

const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

describe('echo-workshop protocol', () => {
  it('serves owned rasters and Steam CDN previews fail-closed', async () => {
    handleMock.mockClear();
    resolveMock.mockReset();
    fetchMock.mockReset();
    const { registerWorkshopAssetProtocolHandler } = await import('./workshopAssetProtocol');
    registerWorkshopAssetProtocolHandler();
    const handler = handleMock.mock.calls[0]?.[1] as (request: Request) => Promise<Response>;

    resolveMock.mockResolvedValueOnce({
      filePath: 'C:\\owned\\art\\panel.png',
      mimeType: 'image/png',
    });
    const missing = await handler(new Request('echo-workshop://other/?path=x'));
    expect(missing.status).toBe(404);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      url: 'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/1.png',
      headers: new Headers(),
      arrayBuffer: async () => pngBytes,
    });
    const preview = await handler(new Request(
      'echo-workshop://preview/?u=https%3A%2F%2Fcdn.akamai.steamstatic.com%2Fsteamcommunity%2Fpublic%2Fimages%2Fapps%2F1.png',
    ));
    expect(preview.status).toBe(200);
    expect(preview.headers.get('Content-Type')).toBe('image/png');

    const blocked = await handler(new Request(
      'echo-workshop://preview/?u=https%3A%2F%2Fexample.com%2Ftracker.png',
    ));
    expect(blocked.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('serves sandbox runtime documents with a no-network CSP', async () => {
    handleMock.mockClear();
    resolveUiRuntimeMock.mockReset().mockResolvedValue({
      filePath: 'C:\\owned\\ui\\index.html',
      mimeType: 'text/html; charset=utf-8',
    });
    const { registerWorkshopAssetProtocolHandler } = await import('./workshopAssetProtocol');
    registerWorkshopAssetProtocolHandler();
    const handler = handleMock.mock.calls[0]?.[1] as (request: Request) => Promise<Response>;
    const response = await handler(new Request('echo-workshop://ui/steam/123/ui/index.html'));

    expect(response.status).toBe(200);
    expect(resolveUiRuntimeMock).toHaveBeenCalledWith('steam', '123', 'ui/index.html');
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    expect(response.headers.get('Content-Security-Policy')).toContain('connect-src echo-workshop:');
    expect(response.headers.get('Content-Security-Policy')).toContain('img-src echo-workshop: echo-cover: data:');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('serves enabled plugin assets with network, media and child frames disabled', async () => {
    handleMock.mockClear();
    resolvePluginAssetMock.mockReset().mockResolvedValue({
      body: '<!doctype html><script src="__bridge__.js"></script>',
      mimeType: 'text/html; charset=utf-8',
    });
    const { registerWorkshopAssetProtocolHandler } = await import('./workshopAssetProtocol');
    registerWorkshopAssetProtocolHandler();
    const handler = handleMock.mock.calls[0]?.[1] as (request: Request) => Promise<Response>;
    const response = await handler(new Request('echo-workshop://plugin/steam/123/panel.html'));

    expect(response.status).toBe(200);
    expect(resolvePluginAssetMock).toHaveBeenCalledWith('steam', '123', 'panel.html');
    expect(response.headers.get('Content-Security-Policy')).toContain("connect-src 'none'");
    expect(response.headers.get('Content-Security-Policy')).toContain("media-src 'none'");
    expect(response.headers.get('Content-Security-Policy')).toContain("frame-src 'none'");
  });
});
