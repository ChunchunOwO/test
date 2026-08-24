import { createServer } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const audioStatus = vi.hoisted(() => ({
  currentFilePath: '',
  currentTrackId: 'track-1',
  currentTrackTitle: 'Local Song',
  currentTrackArtist: 'Artist',
  currentTrackAlbum: 'Album',
  durationSeconds: 180,
  codec: 'flac',
}));

vi.mock('../audioPublicApi', () => ({
  getAudioSession: () => ({ getStatus: () => ({ ...audioStatus }) }),
}));

import { WorkshopPlaybackShareService } from './WorkshopPlaybackShareService';

const roots: string[] = [];

afterEach(() => {
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

describe('WorkshopPlaybackShareService', () => {
  it('streams the current local track to an approved host without exposing its path', async () => {
    const root = mkdtempSync(join(tmpdir(), 'echo-workshop-share-'));
    roots.push(root);
    audioStatus.currentFilePath = join(root, 'song.flac');
    writeFileSync(audioStatus.currentFilePath, Buffer.from('local-audio-payload'));
    let uploaded = Buffer.alloc(0);
    let metadata = '';
    const server = createServer((request, response) => {
      metadata = String(request.headers['x-echo-track-metadata'] ?? '');
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        uploaded = Buffer.concat(chunks);
        const address = server.address();
        const port = address && typeof address !== 'string' ? address.port : 0;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ playbackUrl: `http://127.0.0.1:${port}/play/task-1` }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = address && typeof address !== 'string' ? address.port : 0;
    const service = new WorkshopPlaybackShareService({
      getRuntimePolicy: vi.fn(async () => ({ permissions: ['playback:share'], networkHosts: ['127.0.0.1'] })),
    } as never);

    const info = await service.getShareInfo('steam', '123');
    expect(info).toMatchObject({
      available: true,
      track: { title: 'Local Song', sizeBytes: 19 },
      allowedHosts: ['127.0.0.1'],
    });
    expect(JSON.stringify(info)).not.toContain(audioStatus.currentFilePath);

    const started = await service.shareCurrentTrack({
      sourceId: 'steam',
      itemId: '123',
      uploadUrl: `http://127.0.0.1:${port}/upload`,
      roomId: 'room-1',
    });
    let task = started;
    for (let attempt = 0; attempt < 40 && task.state !== 'ready' && task.state !== 'error'; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      task = await service.getShareTask({ sourceId: 'steam', itemId: '123', taskId: started.id });
    }
    server.close();

    expect(task).toMatchObject({
      state: 'ready',
      progress: 1,
      playbackUrl: `http://127.0.0.1:${port}/play/task-1`,
    });
    expect(uploaded.toString()).toBe('local-audio-payload');
    expect(JSON.parse(Buffer.from(metadata, 'base64url').toString('utf8'))).toMatchObject({
      roomId: 'room-1',
      track: { title: 'Local Song' },
    });
  });

  it('fails closed when the plugin lacks the capability or destination host', async () => {
    const denied = new WorkshopPlaybackShareService({
      getRuntimePolicy: vi.fn(async () => ({ permissions: [], networkHosts: ['share.example'] })),
    } as never);
    await expect(denied.getShareInfo('steam', '123')).rejects.toThrow('capability-denied');

    const allowed = new WorkshopPlaybackShareService({
      getRuntimePolicy: vi.fn(async () => ({ permissions: ['playback:share'], networkHosts: ['share.example'] })),
    } as never);
    await expect(allowed.shareCurrentTrack({
      sourceId: 'steam',
      itemId: '123',
      uploadUrl: 'https://other.example/upload',
    })).rejects.toThrow('share-destination-denied');
  });
});
