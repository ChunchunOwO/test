import { describe, expect, it, vi } from 'vitest';
import { WorkshopPluginNetworkService } from './WorkshopPluginNetworkService';

const runtimePolicy = (overrides: Partial<{
  permissions: Array<'network:request'>;
  networkHosts: string[];
}> = {}) => ({
  permissions: ['network:request'] as Array<'network:request'>,
  networkHosts: ['api.example', 'redirect.example'],
  ...overrides,
});

describe('WorkshopPluginNetworkService', () => {
  it('performs a bounded request only for an approved declared host', async () => {
    const fetcher = vi.fn(async () => new Response('{"tracks":[]}', {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'set-cookie': 'session=hidden',
        'x-request-id': 'request-1',
      },
    }));
    const service = new WorkshopPluginNetworkService({
      getRuntimePolicy: vi.fn(async () => runtimePolicy()),
    }, fetcher);

    await expect(service.request({
      sourceId: 'steam',
      itemId: '123',
      url: 'https://api.example/v1/catalog',
      headers: { accept: 'application/json', 'x-client-version': '1' },
    })).resolves.toEqual({
      url: 'https://api.example/v1/catalog',
      status: 200,
      statusText: '',
      ok: true,
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'request-1',
      },
      body: '{"tracks":[]}',
    });
    expect(fetcher).toHaveBeenCalledWith(new URL('https://api.example/v1/catalog'), expect.objectContaining({
      method: 'GET',
      redirect: 'manual',
    }));
  });

  it('denies undeclared hosts, credentials and unsupported headers before fetch', async () => {
    const fetcher = vi.fn();
    const service = new WorkshopPluginNetworkService({
      getRuntimePolicy: vi.fn(async () => runtimePolicy()),
    }, fetcher);

    await expect(service.request({
      sourceId: 'steam', itemId: '123', url: 'https://other.example/data',
    })).rejects.toThrow('network-host-denied');
    await expect(service.request({
      sourceId: 'steam', itemId: '123', url: 'https://user:pass@api.example/data',
    })).rejects.toThrow('network-url-unsupported');
    await expect(service.request({
      sourceId: 'steam', itemId: '123', url: 'https://api.example/data', headers: { cookie: 'secret' },
    })).rejects.toThrow('network-header-unsupported');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('revalidates every redirect target and converts POST 303 to GET', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 303,
        headers: { location: 'https://redirect.example/result' },
      }))
      .mockResolvedValueOnce(new Response('done', { status: 200 }));
    const service = new WorkshopPluginNetworkService({
      getRuntimePolicy: vi.fn(async () => runtimePolicy()),
    }, fetcher);

    await expect(service.request({
      sourceId: 'steam',
      itemId: '123',
      url: 'https://api.example/run',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })).resolves.toMatchObject({ status: 200, body: 'done' });
    expect(fetcher).toHaveBeenNthCalledWith(2, new URL('https://redirect.example/result'), expect.objectContaining({
      method: 'GET',
      headers: {},
    }));
  });

  it('fails closed when the capability is not approved', async () => {
    const service = new WorkshopPluginNetworkService({
      getRuntimePolicy: vi.fn(async () => ({ permissions: [], networkHosts: ['api.example'] })),
    }, vi.fn());

    await expect(service.request({
      sourceId: 'steam', itemId: '123', url: 'https://api.example/data',
    })).rejects.toThrow('network-capability-denied');
  });
});
