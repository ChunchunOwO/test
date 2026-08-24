import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkshopDataCatalog } from './WorkshopDataCatalog';
import type { WorkshopDataCatalogRecord } from './WorkshopDataContributionTypes';
import { createWorkshopDataHandlerRegistry } from './WorkshopDataHandlers';

let rootDirectory = '';
let catalogPath = '';

const createRecord = (): WorkshopDataCatalogRecord => ({
  sourceId: 'local',
  itemId: '123',
  contentId: 'echo.catalog-fixture',
  contentKind: 'theme',
  version: '1.0.0',
  manifestSha256: 'a'.repeat(64),
  entryPath: 'theme.json',
  contribution: {
    type: 'echo-workshop-theme-preset',
    schemaVersion: 1,
    id: 'echo.catalog-fixture',
    title: 'Catalog Fixture',
    basePreset: 'classic',
    dark: { accent: '#66ccff' },
  },
  activatedAt: '2026-08-11T00:00:00.000Z',
});

beforeEach(async () => {
  rootDirectory = await mkdtemp(join(tmpdir(), 'echo-workshop-data-catalog-'));
  catalogPath = join(rootDirectory, 'workshop', 'data-catalog.json');
});

afterEach(async () => {
  await rm(rootDirectory, { recursive: true, force: true });
});

describe('WorkshopDataCatalog', () => {
  it('atomically persists normalized data contributions and removes them explicitly', () => {
    const handlers = createWorkshopDataHandlerRegistry();
    const catalog = new WorkshopDataCatalog({ filePath: catalogPath, handlers });
    const stored = catalog.put(createRecord());

    expect(stored.contribution).toMatchObject({ dark: { accent: '#66ccff' } });
    expect(new WorkshopDataCatalog({ filePath: catalogPath, handlers }).get('local', '123'))
      .toEqual(stored);
    expect(catalog.remove('local', '123')).toEqual(stored);
    expect(catalog.get('local', '123')).toBeNull();
    expect(JSON.parse(readFileSync(catalogPath, 'utf8'))).toMatchObject({
      formatVersion: 1,
      revision: 2,
      records: [],
    });
  });

  it('preserves a corrupt catalog and becomes read-only', () => {
    mkdirSync(dirname(catalogPath), { recursive: true });
    writeFileSync(catalogPath, '{broken json', 'utf8');
    const catalog = new WorkshopDataCatalog({ filePath: catalogPath });

    expect(catalog.getHealth()).toEqual({ writable: false, error: 'catalog-unreadable' });
    expect(() => catalog.put(createRecord())).toThrow('workshop_data_catalog_unreadable');
    expect(readFileSync(catalogPath, 'utf8')).toBe('{broken json');
  });

  it('rejects a contribution whose inner schema does not match its catalog kind', () => {
    const catalog = new WorkshopDataCatalog({ filePath: catalogPath });
    const mismatched = {
      ...createRecord(),
      contribution: {
        type: 'echo-workshop-visualizer-preset',
        schemaVersion: 1,
        id: 'echo.catalog-fixture',
      },
    } as unknown as WorkshopDataCatalogRecord;

    expect(() => catalog.put(mismatched)).toThrow('workshop_data_header_invalid');
  });
});
