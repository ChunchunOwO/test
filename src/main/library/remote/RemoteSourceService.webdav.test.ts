import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, type EchoDatabase } from '../../database/createDatabase';
import { LibraryStore } from '../LibraryStore';
import { RemoteSourceService } from './RemoteSourceService';

vi.mock('electron', () => ({
  default: {},
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value, 'utf8'),
    decryptString: (value: Buffer) => value.toString('utf8'),
  },
}));

const audioBytes = Buffer.from('0123456789abcdef');
const rootPath = '/音乐 Space/';
const trackPath = `${rootPath}会魔法的老人.mp3`;
const username = 'echo-user';
const password = 'echo-secret';
const authHeader = `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;

const listen = async (server: Server): Promise<number> =>
  new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('server did not bind'));
        return;
      }
      resolve(address.port);
    });
  });

const close = async (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

const encodeHref = (path: string): string => `/dav${path.split('/').map((part) => encodeURIComponent(part)).join('/')}`;

const xmlResponse = (href: string, collection: boolean, size = audioBytes.length): string => `
  <d:response>
    <d:href>${href}</d:href>
    <d:propstat>
      <d:prop>
        ${collection ? '<d:resourcetype><d:collection /></d:resourcetype>' : '<d:resourcetype />'}
        <d:getcontentlength>${size}</d:getcontentlength>
        <d:getlastmodified>Thu, 01 Jan 2026 00:00:00 GMT</d:getlastmodified>
        <d:getetag>"etag-${size}"</d:getetag>
        <d:getcontenttype>${collection ? 'httpd/unix-directory' : 'audio/mpeg'}</d:getcontenttype>
      </d:prop>
    </d:propstat>
  </d:response>`;

const xml = (responses: string[]): string => `<?xml version="1.0" encoding="utf-8"?><d:multistatus xmlns:d="DAV:">${responses.join('')}</d:multistatus>`;

const requestPath = (request: IncomingMessage): string => {
  const url = request.url ?? '/';
  return decodeURIComponent(url.split('?')[0].replace(/^\/dav/u, '') || '/');
};

const writeAudio = (request: IncomingMessage, response: ServerResponse): void => {
  if (request.headers.authorization !== authHeader) {
    response.writeHead(401);
    response.end();
    return;
  }

  response.setHeader('Content-Type', 'audio/mpeg');
  response.setHeader('Accept-Ranges', 'bytes');
  response.setHeader('ETag', '"track"');

  const range = request.headers.range;
  if (typeof range === 'string') {
    const match = range.match(/^bytes=(\d+)-(\d+)$/u);
    const start = match ? Number(match[1]) : 0;
    const end = match ? Math.min(Number(match[2]), audioBytes.length - 1) : audioBytes.length - 1;
    const chunk = audioBytes.subarray(start, end + 1);
    response.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${audioBytes.length}`,
      'Content-Length': String(chunk.length),
    });
    response.end(request.method === 'HEAD' ? undefined : chunk);
    return;
  }

  response.writeHead(200, { 'Content-Length': String(audioBytes.length) });
  response.end(request.method === 'HEAD' ? undefined : audioBytes);
};

const makeWebDavServer = (state: { includeTrack: boolean }): Server =>
  createServer((request, response) => {
    if (request.headers.authorization !== authHeader) {
      response.writeHead(401);
      response.end();
      return;
    }

    if (request.method === 'PROPFIND') {
      const path = requestPath(request);
      if (path !== rootPath && path !== rootPath.replace(/\/$/u, '')) {
        response.writeHead(404, { 'Content-Type': 'text/plain' });
        response.end('missing');
        return;
      }

      response.writeHead(207, { 'Content-Type': 'application/xml' });
      response.end(xml([
        xmlResponse(encodeHref(rootPath), true),
        ...(state.includeTrack ? [xmlResponse(encodeHref(trackPath), false)] : []),
      ]));
      return;
    }

    if ((request.method === 'GET' || request.method === 'HEAD') && requestPath(request) === trackPath) {
      writeAudio(request, response);
      return;
    }

    response.writeHead(404);
    response.end();
  });

const waitForSync = async (service: RemoteSourceService, sourceId: string): Promise<void> => {
  for (let index = 0; index < 100; index += 1) {
    const status = service.getSyncStatus(sourceId);
    if (status.status === 'completed') {
      return;
    }
    if (status.status === 'failed' || status.status === 'cancelled') {
      throw new Error(`sync ${status.status}: ${status.errors.join(', ')}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error('Timed out waiting for WebDAV sync');
};

const waitForJobAttempt = async (service: RemoteSourceService, sourceId: string, kind: 'metadata' | 'cover'): Promise<void> => {
  for (let index = 0; index < 100; index += 1) {
    const status = service.getJobStatus(sourceId);
    if (
      status.pending[kind] > 0 ||
      status.running[kind] > 0 ||
      status.completed[kind] > 0 ||
      status.failed[kind] > 0 ||
      status.skipped[kind] > 0
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`Timed out waiting for ${kind} job`);
};

describe('RemoteSourceService WebDAV integration', () => {
  const servers: Server[] = [];
  let database: EchoDatabase | null = null;
  let service: RemoteSourceService | null = null;

  afterEach(async () => {
    service?.close();
    service = null;
    database = null;
    for (const server of servers.splice(0)) {
      await close(server);
    }
  });

  it('caches source lists briefly and invalidates them through service writes', () => {
    database = createDatabase(':memory:');
    service = new RemoteSourceService(database, () => database?.close());

    const source = service.createSource({
      provider: 'webdav',
      displayName: 'Cache Test',
      baseUrl: 'http://127.0.0.1/dav',
      username: null,
      secret: null,
      authType: 'none',
      config: { rootPath },
      syncMode: 'index',
    });

    const firstList = service.listSources();
    expect(firstList).toEqual([expect.objectContaining({ id: source.id, displayName: 'Cache Test' })]);
    firstList[0].config.rootPath = '/mutated-by-caller';

    database.prepare('UPDATE remote_sources SET display_name = ? WHERE id = ?').run('Direct Database Edit', source.id);

    expect(service.listSources()).toEqual([
      expect.objectContaining({
        id: source.id,
        displayName: 'Cache Test',
        config: expect.objectContaining({ rootPath }),
      }),
    ]);

    service.updateSource({ id: source.id, displayName: 'Service Update' });

    expect(service.listSources()).toEqual([
      expect.objectContaining({ id: source.id, displayName: 'Service Update' }),
    ]);
  });

  it('requires credentials to be re-entered when a saved endpoint identity changes', () => {
    database = createDatabase(':memory:');
    service = new RemoteSourceService(database, () => database?.close());
    const source = service.createSource({
      provider: 'webdav',
      displayName: 'Credential Scope',
      baseUrl: 'https://library.example.test/dav',
      username: 'alice',
      secret: 'saved-password',
      authType: 'basic',
      config: { rootPath: '/' },
      syncMode: 'index',
    });

    expect(() => service!.updateSource({
      id: source.id,
      baseUrl: 'https://attacker.example.test/dav',
    })).toThrow('Credentials must be re-entered');
    expect(() => service!.updateSource({
      id: source.id,
      provider: 'subsonic',
    })).toThrow('provider cannot be changed');

    expect(service.updateSource({
      id: source.id,
      baseUrl: 'https://new-library.example.test/dav',
      secret: 'new-password',
    })).toEqual(expect.objectContaining({ baseUrl: 'https://new-library.example.test/dav' }));
  });

  it('retires legacy Baidu records and transactionally removes hidden endpoint and index data', async () => {
    database = createDatabase(':memory:');
    service = new RemoteSourceService(database, () => database?.close());
    const source = service.createSource({
      provider: 'webdav',
      displayName: 'Legacy Source',
      baseUrl: 'https://library.example.test/dav',
      authType: 'none',
      config: { rootPath: '/' },
      syncMode: 'index',
    });

    database.prepare("UPDATE remote_sources SET provider = 'baidu', username = 'legacy-user', auth_type = 'token', encrypted_secret = ?, config_json = ? WHERE id = ?")
      .run(`plain:${Buffer.from('legacy-token').toString('base64')}`, JSON.stringify({ refreshToken: 'legacy-refresh' }), source.id);
    const timestamp = new Date().toISOString();
    database.prepare(
      `INSERT INTO remote_tracks (
        id, source_id, provider, remote_path, remote_url_hash, stable_key,
        title, artist, album, album_artist, cover_status, metadata_status,
        lyrics_status, mv_status, availability, field_sources_json, search_terms,
        created_at, updated_at
      ) VALUES (?, ?, 'baidu', '/legacy.flac', 'legacy-hash', 'legacy-key',
        'Legacy', 'Artist', 'Album', 'Artist', 'pending', 'pending',
        'pending', 'pending', 'available', '{}', '', ?, ?)`,
    ).run('remote:legacy-track', source.id, timestamp, timestamp);
    database.prepare(
      `INSERT INTO remote_provider_scan_cache (
        source_id, namespace, cache_key, fingerprint, payload_json, verified_at, updated_at
      ) VALUES (?, 'baidu-scan', '/', 'legacy-fingerprint', '{}', ?, ?)`,
    ).run(source.id, timestamp, timestamp);
    service = new RemoteSourceService(database, () => database?.close());

    expect(service.listSources()).toEqual([]);
    expect(service.getOverview()).toEqual(expect.objectContaining({ totalSources: 0, trackCount: 0 }));
    await expect(service.testSource(source.id)).rejects.toThrow('Unknown remote source');
    expect(database.prepare('SELECT base_url, username, auth_type, encrypted_secret, config_json, status FROM remote_sources WHERE id = ?').get(source.id)).toEqual({
      base_url: null,
      username: null,
      auth_type: 'none',
      encrypted_secret: null,
      config_json: '{}',
      status: 'disabled',
    });
    expect(database.prepare('SELECT COUNT(*) AS count FROM remote_tracks WHERE source_id = ?').get(source.id)).toEqual({ count: 0 });
    expect(database.prepare('SELECT COUNT(*) AS count FROM remote_provider_scan_cache WHERE source_id = ?').get(source.id)).toEqual({ count: 0 });
  });

  it('migrates legacy plaintext secrets and scrubs credential-like config keys', () => {
    database = createDatabase(':memory:');
    service = new RemoteSourceService(database, () => database?.close());
    const source = service.createSource({
      provider: 'webdav',
      displayName: 'Legacy Credentials',
      baseUrl: 'https://library.example.test/dav',
      authType: 'none',
      config: { rootPath: '/' },
      syncMode: 'index',
    });
    const legacySecret = `plain:${Buffer.from('legacy-password').toString('base64')}`;
    database.prepare("UPDATE remote_sources SET username = 'alice', auth_type = 'basic', encrypted_secret = ?, config_json = ? WHERE id = ?")
      .run(legacySecret, JSON.stringify({ rootPath: '/', password: 'config-leak', scanConcurrency: 2 }), source.id);

    service = new RemoteSourceService(database, () => database?.close());

    const row = database.prepare('SELECT encrypted_secret, config_json FROM remote_sources WHERE id = ?').get(source.id) as {
      encrypted_secret: string;
      config_json: string;
    };
    expect(row.encrypted_secret).toBe(Buffer.from('legacy-password').toString('base64'));
    expect(row.encrypted_secret.startsWith('plain:')).toBe(false);
    expect(JSON.parse(row.config_json)).toEqual(expect.objectContaining({ rootPath: '/', scanConcurrency: 2 }));
    expect(row.config_json).not.toContain('config-leak');
  });

  it('blocks stored credentials from reaching a tampered public HTTP endpoint', async () => {
    database = createDatabase(':memory:');
    service = new RemoteSourceService(database, () => database?.close());
    const source = service.createSource({
      provider: 'webdav',
      displayName: 'Credential Transport Guard',
      baseUrl: 'https://library.example.test/dav',
      username: 'alice',
      secret: 'saved-password',
      authType: 'basic',
      config: { rootPath: '/' },
      syncMode: 'index',
    });
    database.prepare('UPDATE remote_sources SET base_url = ? WHERE id = ?').run('http://public.example/dav', source.id);

    await expect(service.testSource(source.id)).rejects.toThrow('must use HTTPS');
  });

  it('rejects network work and playback URL creation after a source is disconnected', async () => {
    database = createDatabase(':memory:');
    service = new RemoteSourceService(database, () => database?.close());
    const serviceInstance = service;
    const source = serviceInstance.createSource({
      provider: 'webdav',
      displayName: 'Disconnected WebDAV',
      baseUrl: 'http://127.0.0.1/dav',
      username: null,
      secret: null,
      authType: 'none',
      config: { rootPath },
      syncMode: 'index',
    });

    serviceInstance.disconnectSource(source.id);

    expect(serviceInstance.listSources()).toEqual([
      expect.objectContaining({ id: source.id, status: 'disabled' }),
    ]);
    await expect(serviceInstance.browse(source.id)).rejects.toThrow('is not enabled');
    await expect(serviceInstance.previewSync(source.id)).rejects.toThrow('is not enabled');
    await expect(serviceInstance.createStreamUrl({ trackId: 'missing-track' })).rejects.toThrow('is not available');
    expect(() => serviceInstance.syncSource(source.id)).toThrow('is not enabled');
    expect(() => serviceInstance.startBackgroundJobs(source.id)).toThrow('is not enabled');
  });

  it('tests, syncs, exposes library tracks, proxies playback, and deletes a WebDAV source without real cloud credentials', async () => {
    const state = { includeTrack: true };
    const server = makeWebDavServer(state);
    servers.push(server);
    const port = await listen(server);
    database = createDatabase(':memory:');
    service = new RemoteSourceService(database, () => database?.close());
    const libraryStore = new LibraryStore(database);

    const source = service.createSource({
      provider: 'webdav',
      displayName: 'Mock AList',
      baseUrl: `http://127.0.0.1:${port}/dav`,
      username,
      secret: password,
      authType: 'basic',
      config: { rootPath, scanConcurrency: 2, metadataConcurrency: 1 },
      syncMode: 'index',
    });

    await expect(service.testSource(source.id)).resolves.toMatchObject({ ok: true, status: 'enabled' });
    await expect(service.browse(source.id)).resolves.toEqual([
      expect.objectContaining({ path: trackPath, kind: 'file', audio: true, name: '会魔法的老人.mp3' }),
    ]);

    service.syncSource(source.id);
    await waitForSync(service, source.id);
    await waitForJobAttempt(service, source.id, 'metadata');
    await waitForJobAttempt(service, source.id, 'cover');

    const tracks = libraryStore.getTracks({ search: 'mofa' });
    expect(tracks.total).toBe(1);
    expect(libraryStore.getTracks({ search: '魔法' }).total).toBe(1);
    expect(libraryStore.getTracks({ sourceProvider: 'remote', sourceId: source.id }).total).toBe(1);
    expect(service.listIndexedTracks(source.id, rootPath)).toEqual([
      expect.objectContaining({
        id: tracks.items[0].id,
        mediaType: 'remote',
        remotePath: trackPath,
      }),
    ]);
    expect(service.getIndexedFolderStats(source.id, rootPath)).toMatchObject({
      sourceId: source.id,
      rootPath,
      trackCount: 1,
      totalSizeBytes: audioBytes.length,
    });
    expect(service.listIndexedTracksPage(source.id, { rootPath, page: 1, pageSize: 1 })).toMatchObject({
      page: 1,
      pageSize: 1,
      total: 1,
      hasMore: false,
      items: [expect.objectContaining({ id: tracks.items[0].id, mediaType: 'remote' })],
    });
    expect(service.listIndexedTracksPage(source.id, { rootPath, page: 1, pageSize: 10, search: 'mofa' })).toMatchObject({
      total: 1,
      items: [expect.objectContaining({ id: tracks.items[0].id })],
    });
    const restartedService = new RemoteSourceService(database, () => undefined);
    try {
      expect(restartedService.listIndexedTracksPage(source.id, { rootPath, page: 1, pageSize: 1 })).toMatchObject({
        total: 1,
        items: [expect.objectContaining({ remotePath: trackPath })],
      });
      expect(restartedService.getIndexedFolderStats(source.id, rootPath)).toMatchObject({ trackCount: 1 });
    } finally {
      restartedService.close();
    }
    expect(tracks.items[0]).toEqual(expect.objectContaining({
      mediaType: 'remote',
      provider: 'webdav',
      sourceId: source.id,
      sourceDisplayName: 'Mock AList',
      remotePath: trackPath,
      title: '会魔法的老人',
    }));

    await expect(service.hydrateVisibleTracks(['local-track-id', tracks.items[0].id], { metadata: false, cover: false })).resolves.toEqual([
      expect.objectContaining({ id: tracks.items[0].id, mediaType: 'remote' }),
    ]);

    expect(service.lookupTracks(source.id, [trackPath, '/音乐 Space/missing.flac', trackPath])).toEqual([
      expect.objectContaining({
        trackId: tracks.items[0].id,
        sourceId: source.id,
        remotePath: trackPath,
        title: '会魔法的老人',
        metadataStatus: expect.any(String),
        availability: 'available',
      }),
    ]);
    expect(service.lookupTracks(source.id, [])).toEqual([]);

    const otherSource = service.createSource({
      provider: 'webdav',
      displayName: 'Other AList',
      baseUrl: `http://127.0.0.1:${port}/dav`,
      username,
      secret: password,
      authType: 'basic',
      config: { rootPath, scanConcurrency: 2, metadataConcurrency: 1 },
      syncMode: 'index',
    });
    expect(service.lookupTracks(otherSource.id, [trackPath])).toEqual([]);

    database.prepare("UPDATE remote_tracks SET metadata_status = 'error', cover_status = 'error', lyrics_status = 'not_found' WHERE source_id = ?").run(source.id);
    expect(service.getOverview(source.id)).toMatchObject({
      totalSources: 1,
      enabledSources: 1,
      trackCount: 1,
      totalSizeBytes: audioBytes.length,
      missingTrackCount: 0,
      sources: [
        expect.objectContaining({
          sourceId: source.id,
          trackCount: 1,
          totalSizeBytes: audioBytes.length,
          metadata: expect.objectContaining({ error: 1 }),
          cover: expect.objectContaining({ error: 1 }),
          lyrics: expect.objectContaining({ not_found: 1 }),
        }),
      ],
    });
    expect(service.listIssues(source.id, 'metadata', 10)).toEqual([
      expect.objectContaining({
        kind: 'metadata',
        status: 'error',
        remotePath: trackPath,
      }),
    ]);

    const stream = await service.createStreamUrl({ trackId: tracks.items[0].id });
    expect(stream.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/remote-stream\//u);
    expect(stream.url).not.toContain(username);
    expect(stream.url).not.toContain(password);

    const head = await fetch(stream.url, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers.get('accept-ranges')).toBe('bytes');

    const partial = await fetch(stream.url, { headers: { Range: 'bytes=2-5' } });
    expect(partial.status).toBe(206);
    expect(partial.headers.get('content-range')).toBe(`bytes 2-5/${audioBytes.length}`);
    expect(Buffer.from(await partial.arrayBuffer()).toString('utf8')).toBe('2345');

    state.includeTrack = false;
    service.syncSource(source.id);
    await waitForSync(service, source.id);
    expect(libraryStore.getTracks({ search: 'mofa' }).total).toBe(0);
    expect(service.getOverview(source.id)).toMatchObject({ trackCount: 0, missingTrackCount: 1 });
    expect(service.listIssues(source.id, 'missing', 10)).toEqual([
      expect.objectContaining({ kind: 'missing', status: 'missing', remotePath: trackPath }),
    ]);

    service.deleteSource(source.id);
    expect(libraryStore.getTracks({ search: 'mofa' }).total).toBe(0);
    expect(service.listSources()).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: source.id }),
    ]));
    expect(await fetch(stream.url)).toMatchObject({ status: 401 });
  });

  it('can sync only the browsed WebDAV directory without marking the rest of the source missing', async () => {
    const scopedDir = `${rootPath}Scoped/`;
    const otherDir = `${rootPath}Other/`;
    const scopedTrack = `${scopedDir}scoped.mp3`;
    const otherTrack = `${otherDir}other.mp3`;
    const state = { includeScoped: true, includeOther: true };
    const server = createServer((request, response) => {
      if (request.headers.authorization !== authHeader) {
        response.writeHead(401);
        response.end();
        return;
      }

      if (request.method === 'PROPFIND') {
        const path = requestPath(request);
        response.writeHead(207, { 'Content-Type': 'application/xml' });
        if (path === rootPath || path === rootPath.replace(/\/$/u, '')) {
          response.end(xml([
            xmlResponse(encodeHref(rootPath), true),
            xmlResponse(encodeHref(scopedDir), true),
            xmlResponse(encodeHref(otherDir), true),
          ]));
          return;
        }
        if (path === scopedDir || path === scopedDir.replace(/\/$/u, '')) {
          response.end(xml([
            xmlResponse(encodeHref(scopedDir), true),
            ...(state.includeScoped ? [xmlResponse(encodeHref(scopedTrack), false)] : []),
          ]));
          return;
        }
        if (path === otherDir || path === otherDir.replace(/\/$/u, '')) {
          response.end(xml([
            xmlResponse(encodeHref(otherDir), true),
            ...(state.includeOther ? [xmlResponse(encodeHref(otherTrack), false)] : []),
          ]));
          return;
        }

        response.writeHead(404);
        response.end('missing');
        return;
      }

      if ((request.method === 'GET' || request.method === 'HEAD') && [scopedTrack, otherTrack].includes(requestPath(request))) {
        writeAudio(request, response);
        return;
      }

      response.writeHead(404);
      response.end();
    });
    servers.push(server);
    const port = await listen(server);
    database = createDatabase(':memory:');
    service = new RemoteSourceService(database, () => database?.close());
    const libraryStore = new LibraryStore(database);
    const source = service.createSource({
      provider: 'webdav',
      displayName: 'Scoped AList',
      baseUrl: `http://127.0.0.1:${port}/dav`,
      username,
      secret: password,
      authType: 'basic',
      config: { rootPath, scanConcurrency: 2, metadataConcurrency: 1 },
      syncMode: 'index',
    });

    service.syncSource(source.id, { includeCover: false });
    await waitForSync(service, source.id);
    expect(libraryStore.getTracks({ sourceProvider: 'remote', sourceId: source.id }).total).toBe(2);
    const firstPage = service.listIndexedTracksPage(source.id, { rootPath, page: 1, pageSize: 1 });
    expect(firstPage).toMatchObject({
      page: 1,
      pageSize: 1,
      total: 2,
      hasMore: true,
    });
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    const secondPage = service.listIndexedTracksPage(source.id, { rootPath, page: 2, pageSize: 1, cursor: firstPage.nextCursor });
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0].id).not.toBe(firstPage.items[0].id);

    state.includeScoped = false;
    service.syncSource(source.id, { rootPath: scopedDir, markMissing: false, includeCover: false });
    await waitForSync(service, source.id);

    const tracks = libraryStore.getTracks({ sourceProvider: 'remote', sourceId: source.id });
    expect(tracks.total).toBe(2);
    expect(service.listIndexedTracks(source.id, scopedDir)).toEqual([
      expect.objectContaining({ remotePath: scopedTrack }),
    ]);
    expect(service.getIndexedFolderStats(source.id, scopedDir)).toMatchObject({
      sourceId: source.id,
      rootPath: scopedDir,
      trackCount: 1,
      totalSizeBytes: audioBytes.length,
    });
    expect(service.listIndexedTracksPage(source.id, { rootPath: scopedDir, page: 1, pageSize: 1 })).toMatchObject({
      page: 1,
      pageSize: 1,
      total: 1,
      hasMore: false,
      items: [expect.objectContaining({ remotePath: scopedTrack })],
    });
    expect(service.getOverview(source.id)).toMatchObject({ trackCount: 2, missingTrackCount: 0 });
  });
});
