import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WorkshopRegistryRecord } from './WorkshopRegistryTypes';
import { WorkshopAssetResolver } from './WorkshopAssetResolver';

const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1, 2, 3]);
const updatedAt = '2026-08-13T00:00:00.000Z';

const enabledRecord = (directory: string): WorkshopRegistryRecord => ({
  sourceId: 'steam',
  itemId: '123',
  state: 'enabled',
  candidateRevision: null,
  activeRevision: {
    contentId: 'echo.theme-fixture',
    contentKind: 'theme',
    version: '1.0.0',
    manifestSha256: 'a'.repeat(64),
    directory,
    installedAt: updatedAt,
  },
  lastKnownGoodRevision: null,
  approvedCapabilities: [],
  error: null,
  createdAt: updatedAt,
  updatedAt,
});

let rootDirectory = '';

beforeEach(async () => {
  rootDirectory = await mkdtemp(join(tmpdir(), 'echo-workshop-asset-'));
});

afterEach(async () => {
  await rm(rootDirectory, { recursive: true, force: true });
});

describe('WorkshopAssetResolver', () => {
  it('only reads raster files from an enabled owned revision', async () => {
    const owned = join(rootDirectory, 'owned');
    mkdirSync(join(owned, 'art'), { recursive: true });
    writeFileSync(join(owned, 'art', 'panel.png'), pngMagic);
    writeFileSync(join(owned, 'art', 'note.txt'), 'nope');
    const resolver = new WorkshopAssetResolver({
      get: () => enabledRecord(owned),
    });

    await expect(resolver.resolve('steam', '123', 'art/panel.png')).resolves.toEqual({
      filePath: join(owned, 'art', 'panel.png'),
      mimeType: 'image/png',
    });
    await expect(resolver.resolve('steam', '123', 'art/note.txt')).resolves.toBeNull();
    await expect(resolver.resolve('steam', '123', '../panel.png')).resolves.toBeNull();
  });

  it('fails closed when the item is disabled', async () => {
    const owned = join(rootDirectory, 'owned');
    mkdirSync(owned, { recursive: true });
    writeFileSync(join(owned, 'panel.png'), pngMagic);
    const resolver = new WorkshopAssetResolver({
      get: () => ({ ...enabledRecord(owned), state: 'disabled', activeRevision: null }),
    });

    await expect(resolver.resolve('steam', '123', 'panel.png')).resolves.toBeNull();
  });

  it('serves only bounded packaged UI runtime resource types from enabled themes', async () => {
    const owned = join(rootDirectory, 'owned');
    mkdirSync(join(owned, 'ui'), { recursive: true });
    writeFileSync(join(owned, 'ui', 'index.html'), '<!doctype html><script src="app.js"></script>');
    writeFileSync(join(owned, 'ui', 'app.js'), 'parent.postMessage({ type: "echo:workshop-ui:ready" }, "*")');
    writeFileSync(join(owned, 'ui', 'secret.txt'), 'nope');
    const resolver = new WorkshopAssetResolver({ get: () => enabledRecord(owned) });

    await expect(resolver.resolveUiRuntime('steam', '123', 'ui/index.html')).resolves.toEqual({
      filePath: join(owned, 'ui', 'index.html'),
      mimeType: 'text/html; charset=utf-8',
    });
    await expect(resolver.resolveUiRuntime('steam', '123', 'ui/app.js')).resolves.toMatchObject({
      mimeType: 'text/javascript; charset=utf-8',
    });
    await expect(resolver.resolveUiRuntime('steam', '123', 'ui/secret.txt')).resolves.toBeNull();
    await expect(resolver.resolveUiRuntime('steam', '123', '../secret.txt')).resolves.toBeNull();
  });
});
