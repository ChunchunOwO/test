import { readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  WorkshopDataCatalogRecord,
  WorkshopLyricsStyleContribution,
} from './WorkshopDataContributionTypes';
import { WorkshopLyricsSceneSelectionStore } from './WorkshopLyricsSceneSelectionStore';
import { WorkshopLyricsSceneService } from './WorkshopLyricsSceneService';
import type { WorkshopRegistryRecord } from './WorkshopRegistryTypes';

const manifestSha256 = 'b'.repeat(64);
const updatedAt = '2026-08-12T04:00:00.000Z';

const lyricsContribution: WorkshopLyricsStyleContribution = {
    type: 'echo-workshop-lyrics-style',
    schemaVersion: 1,
    id: 'echo.lyrics-rebuild',
    title: 'Lyrics Rebuild',
    scene: {
      schemaVersion: 1,
      background: 'theme',
      root: {
        id: 'root',
        type: 'group',
        children: [{ id: 'headline', type: 'slot', slot: 'current-line' }],
      },
    },
};

const catalogRecord: WorkshopDataCatalogRecord = {
  sourceId: 'steam',
  itemId: '456',
  contentId: 'echo.lyrics-rebuild',
  contentKind: 'lyrics-style',
  version: '1.2.0',
  manifestSha256,
  entryPath: 'lyrics-style.json',
  activatedAt: updatedAt,
  contribution: lyricsContribution,
};

const enabledRecord: WorkshopRegistryRecord = {
  sourceId: 'steam',
  itemId: '456',
  state: 'enabled',
  candidateRevision: null,
  activeRevision: {
    contentId: catalogRecord.contentId,
    contentKind: 'lyrics-style',
    version: catalogRecord.version,
    manifestSha256,
    directory: 'C:\\workshop\\active',
    installedAt: updatedAt,
  },
  lastKnownGoodRevision: null,
  approvedCapabilities: [],
  error: null,
  createdAt: updatedAt,
  updatedAt,
};

let rootDirectory = '';

beforeEach(async () => {
  rootDirectory = await mkdtemp(join(tmpdir(), 'echo-workshop-lyrics-scene-'));
});

afterEach(async () => {
  await rm(rootDirectory, { recursive: true, force: true });
});

describe('Workshop lyrics scene selection', () => {
  it('persists only a trusted revision receipt and resolves the current catalog scene', () => {
    let registryRecord: WorkshopRegistryRecord = enabledRecord;
    const selectionPath = join(rootDirectory, 'active-lyrics-scene.json');
    const service = new WorkshopLyricsSceneService({
      registry: { get: () => registryRecord },
      catalog: { get: () => catalogRecord },
      store: new WorkshopLyricsSceneSelectionStore(selectionPath),
    });

    service.select(lyricsContribution, {
      sourceId: catalogRecord.sourceId,
      itemId: catalogRecord.itemId,
      contentId: catalogRecord.contentId,
      version: catalogRecord.version,
      manifestSha256,
      registryUpdatedAt: updatedAt,
    });

    expect(service.getActive()).toMatchObject({
      contentId: 'echo.lyrics-rebuild',
      title: 'Lyrics Rebuild',
      scene: { root: { children: [{ slot: 'current-line' }] } },
    });
    const persisted = readFileSync(selectionPath, 'utf8');
    expect(persisted).toContain('"manifestSha256"');
    expect(persisted).not.toContain('"scene"');
    expect(persisted).not.toContain('current-line');

    registryRecord = { ...enabledRecord, state: 'disabled', activeRevision: null };
    expect(service.getActive()).toBeNull();

    registryRecord = {
      ...enabledRecord,
      updatedAt: '2026-08-12T05:00:00.000Z',
    };
    expect(service.getActive()).toBeNull();
  });

  it('discards an unbound v1 receipt without making the selection store read-only', () => {
    const selectionPath = join(rootDirectory, 'legacy-active-lyrics-scene.json');
    writeFileSync(selectionPath, JSON.stringify({
      formatVersion: 1,
      selection: {
        sourceId: 'steam',
        itemId: '456',
        contentId: 'echo.lyrics-rebuild',
        version: '1.2.0',
        manifestSha256,
      },
    }));
    const store = new WorkshopLyricsSceneSelectionStore(selectionPath);

    expect(store.get()).toBeNull();
    expect(() => store.set({
      sourceId: 'steam',
      itemId: '456',
      contentId: 'echo.lyrics-rebuild',
      version: '1.2.0',
      manifestSha256,
      registryUpdatedAt: updatedAt,
    })).not.toThrow();
    expect(JSON.parse(readFileSync(selectionPath, 'utf8'))).toMatchObject({ formatVersion: 2 });
  });

  it('rewrites packaged image references to the echo-workshop protocol', () => {
    const selectionPath = join(rootDirectory, 'active-lyrics-scene.json');
    const contribution: WorkshopLyricsStyleContribution = {
      ...lyricsContribution,
      scene: {
        schemaVersion: 1,
        background: 'asset',
        backgroundAsset: 'art/panel.png',
        root: {
          id: 'root',
          type: 'group',
          children: [{ id: 'badge', type: 'image', asset: 'art/badge.jpg' }],
        },
      },
    };
    const service = new WorkshopLyricsSceneService({
      registry: { get: () => enabledRecord },
      catalog: { get: () => ({ ...catalogRecord, contribution }) },
      store: new WorkshopLyricsSceneSelectionStore(selectionPath),
    });
    service.select(contribution, {
      sourceId: catalogRecord.sourceId,
      itemId: catalogRecord.itemId,
      contentId: catalogRecord.contentId,
      version: catalogRecord.version,
      manifestSha256,
      registryUpdatedAt: updatedAt,
    });

    const active = service.getActive();
    expect(active?.scene.backgroundSrc).toMatch(/^echo-workshop:\/\/asset\/\?/);
    expect(active?.scene.backgroundSrc).toContain('art%2Fpanel.png');
    expect(active?.scene.root.children[0]).toMatchObject({
      type: 'image',
      asset: 'art/badge.jpg',
      src: expect.stringMatching(/^echo-workshop:\/\/asset\/\?/),
    });
    expect(JSON.stringify(active)).not.toContain('C:\\workshop\\active');
  });
});
