import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { workshopManifestFileName } from '../../shared/types/workshop';
import { LocalWorkshopSource } from './LocalWorkshopSource';
import { WorkshopCompatibilityService } from './WorkshopCompatibilityService';
import { WorkshopDataActivationService } from './WorkshopDataActivationService';
import { WorkshopDataCatalog } from './WorkshopDataCatalog';
import { createWorkshopDataHandlerRegistry } from './WorkshopDataHandlers';
import { WorkshopIngestionService } from './WorkshopIngestionService';
import { WorkshopRegistry } from './WorkshopRegistry';
import { WorkshopStagingInstaller } from './WorkshopStagingInstaller';

let rootDirectory = '';
let sourceDirectory = '';
let clock = 1_786_300_000_000;

const sha256Text = (content: string): string =>
  createHash('sha256').update(content, 'utf8').digest('hex');

const writeThemeFixture = (basePreset = 'classic'): void => {
  mkdirSync(sourceDirectory, { recursive: true });
  const entry = JSON.stringify({
    type: 'echo-workshop-theme-preset',
    schemaVersion: 1,
    id: 'echo.activation-fixture',
    title: 'Activation Fixture',
    basePreset,
    dark: { accent: '#66ccff', motionEnabled: false },
  });
  writeFileSync(join(sourceDirectory, 'theme.json'), entry, 'utf8');
  writeFileSync(join(sourceDirectory, workshopManifestFileName), JSON.stringify({
    type: 'echo-workshop-item',
    schemaVersion: 1,
    id: 'echo.activation-fixture',
    title: 'Activation Fixture',
    version: '1.0.0',
    content: { kind: 'theme', entry: 'theme.json' },
    compatibility: { minEchoVersion: '26.8.0' },
    files: [{
      path: 'theme.json',
      size: Buffer.byteLength(entry, 'utf8'),
      sha256: sha256Text(entry),
    }],
    license: { id: 'CC0-1.0', holder: 'ECHO QA' },
  }), 'utf8');
};

const createParts = () => {
  const source = new LocalWorkshopSource([{
    itemId: '123',
    directory: sourceDirectory,
    sizeOnDiskBytes: '4096',
    installedAtUnixSeconds: 1_786_300_000,
  }]);
  const registry = new WorkshopRegistry({
    filePath: join(rootDirectory, 'registry', 'registry.json'),
    now: () => new Date(clock += 1_000),
  });
  const installer = new WorkshopStagingInstaller({
    rootDirectory: join(rootDirectory, 'store'),
    now: () => new Date(clock += 1_000),
  });
  const handlers = createWorkshopDataHandlerRegistry();
  const catalog = new WorkshopDataCatalog({
    filePath: join(rootDirectory, 'catalog', 'data-catalog.json'),
    handlers,
  });
  const ingestion = new WorkshopIngestionService({
    source,
    registry,
    installer,
    compatibility: new WorkshopCompatibilityService({ currentEchoVersion: '26.8.2-beta.1' }),
  });
  const activation = new WorkshopDataActivationService({
    registry,
    installer,
    catalog,
    handlers,
    now: () => new Date(clock += 1_000),
  });
  return { source, registry, installer, handlers, catalog, ingestion, activation };
};

beforeEach(async () => {
  rootDirectory = await mkdtemp(join(tmpdir(), 'echo-workshop-data-activation-'));
  sourceDirectory = join(rootDirectory, 'source');
  clock = 1_786_300_000_000;
  writeThemeFixture();
});

afterEach(async () => {
  await rm(rootDirectory, { recursive: true, force: true });
});

describe('WorkshopDataActivationService', () => {
  it('enables one normalized contribution transactionally and disables it explicitly', async () => {
    const parts = createParts();
    await expect(parts.ingestion.ingestInstalledItem('123')).resolves.toMatchObject({
      ok: true,
      record: { state: 'disabled' },
    });
    const [first, concurrent] = await Promise.all([
      parts.activation.enable('local', '123'),
      parts.activation.enable('local', '123'),
    ]);

    expect(first).toEqual(concurrent);
    expect(first).toMatchObject({
      ok: true,
      action: 'enabled',
      record: { state: 'enabled' },
      catalogRecord: {
        contentKind: 'theme',
        contribution: { type: 'echo-workshop-theme-preset', basePreset: 'classic' },
      },
    });
    expect(parts.catalog.getSnapshot().revision).toBe(1);
    expect(parts.catalog.get('local', '123')).not.toBeNull();

    await expect(parts.activation.disable('local', '123')).resolves.toMatchObject({
      ok: true,
      action: 'disabled',
      record: { state: 'disabled', activeRevision: null },
    });
    expect(parts.catalog.get('local', '123')).toBeNull();
    expect(parts.registry.get('local', '123')?.lastKnownGoodRevision).not.toBeNull();
  });

  it('quarantines an inner data schema that attempts to use a Pro-only theme', async () => {
    await rm(sourceDirectory, { recursive: true, force: true });
    writeThemeFixture('FINAL');
    const parts = createParts();
    await parts.ingestion.ingestInstalledItem('123');
    const result = await parts.activation.enable('local', '123');

    expect(result).toMatchObject({
      ok: false,
      reason: 'content-invalid',
      record: { state: 'quarantined', error: { code: 'data-activation-invalid' } },
    });
    expect(parts.catalog.get('local', '123')).toBeNull();
  });

  it('rolls the catalog back when Registry cannot commit enabled state', async () => {
    const parts = createParts();
    await parts.ingestion.ingestInstalledItem('123');
    const registry = {
      get: parts.registry.get.bind(parts.registry),
      transition: (...args: Parameters<WorkshopRegistry['transition']>) => {
        if (args[2] === 'enabled') {
          throw new Error('simulated_registry_failure');
        }
        return parts.registry.transition(...args);
      },
    };
    const activation = new WorkshopDataActivationService({
      registry,
      installer: parts.installer,
      catalog: parts.catalog,
      handlers: parts.handlers,
    });
    const result = await activation.enable('local', '123');

    expect(result).toMatchObject({ ok: false, reason: 'registry-error' });
    expect(parts.catalog.get('local', '123')).toBeNull();
    expect(parts.registry.get('local', '123')?.state).toBe('disabled');
    expect(existsSync(join(rootDirectory, 'catalog', 'data-catalog.json'))).toBe(true);
  });
});
