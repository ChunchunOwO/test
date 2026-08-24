import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { workshopManifestFileName } from '../../shared/types/workshop';
import { WorkshopCompatibilityService } from './WorkshopCompatibilityService';
import { WorkshopDataActivationService } from './WorkshopDataActivationService';
import { WorkshopDataCatalog } from './WorkshopDataCatalog';
import { createWorkshopDataHandlerRegistry } from './WorkshopDataHandlers';
import { WorkshopIngestionService } from './WorkshopIngestionService';
import { LocalWorkshopSource } from './LocalWorkshopSource';
import { WorkshopReconcileService } from './WorkshopReconcileService';
import { WorkshopRegistry } from './WorkshopRegistry';
import { WorkshopStagingInstaller } from './WorkshopStagingInstaller';

let rootDirectory = '';
let sourceDirectory = '';
let clock = 1_786_400_000_000;

const now = (): Date => new Date(clock += 1_000);
const sha256Text = (content: string): string =>
  createHash('sha256').update(content, 'utf8').digest('hex');

const writeThemeFixture = (): void => {
  mkdirSync(sourceDirectory, { recursive: true });
  const entry = JSON.stringify({
    type: 'echo-workshop-theme-preset',
    schemaVersion: 1,
    id: 'echo.reconcile-fixture',
    title: 'Reconcile Fixture',
    basePreset: 'classic',
    dark: { accent: '#66ccff' },
  });
  writeFileSync(join(sourceDirectory, 'theme.json'), entry, 'utf8');
  writeFileSync(join(sourceDirectory, workshopManifestFileName), JSON.stringify({
    type: 'echo-workshop-item',
    schemaVersion: 1,
    id: 'echo.reconcile-fixture',
    title: 'Reconcile Fixture',
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
    installedAtUnixSeconds: 1_786_400_000,
  }]);
  const registry = new WorkshopRegistry({
    filePath: join(rootDirectory, 'registry', 'registry.json'),
    now,
  });
  const installer = new WorkshopStagingInstaller({
    rootDirectory: join(rootDirectory, 'store'),
    now,
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
    now,
  });
  const reconcile = new WorkshopReconcileService({
    registry,
    catalog,
    installer,
    handlers,
    now,
  });
  return { source, registry, installer, catalog, ingestion, activation, reconcile };
};

beforeEach(async () => {
  rootDirectory = await mkdtemp(join(tmpdir(), 'echo-workshop-reconcile-'));
  sourceDirectory = join(rootDirectory, 'source');
  clock = 1_786_400_000_000;
  writeThemeFixture();
});

afterEach(async () => {
  await rm(rootDirectory, { recursive: true, force: true });
});

describe('WorkshopReconcileService', () => {
  it('recovers a verified staged revision to disabled without auto-enabling it', async () => {
    const parts = createParts();
    const inspected = await parts.installer.inspect(sourceDirectory);
    const staged = await parts.installer.stage({
      sourceId: 'local',
      itemId: '123',
      content: inspected,
    });
    parts.registry.registerDetected('local', '123');
    parts.registry.transition('local', '123', 'verified');
    parts.registry.transition('local', '123', 'staged', { candidateRevision: staged.revision });

    const report = await parts.reconcile.reconcile();

    expect(report).toMatchObject({ ok: true, examined: 1, stagedRecovered: 1 });
    expect(parts.registry.get('local', '123')).toMatchObject({ state: 'disabled' });
    expect(parts.catalog.get('local', '123')).toBeNull();
  });

  it('rebuilds a missing catalog record for valid enabled data', async () => {
    const parts = createParts();
    await parts.ingestion.ingestInstalledItem('123');
    await parts.activation.enable('local', '123');
    parts.catalog.remove('local', '123');

    const report = await parts.reconcile.reconcile();

    expect(report).toMatchObject({ ok: true, catalogRestored: 1, quarantined: 0 });
    expect(parts.registry.get('local', '123')).toMatchObject({ state: 'enabled' });
    expect(parts.catalog.get('local', '123')).toMatchObject({
      contentId: 'echo.reconcile-fixture',
      contribution: { type: 'echo-workshop-theme-preset' },
    });
  });

  it('fails closed by pruning and quarantining tampered enabled content', async () => {
    const parts = createParts();
    await parts.ingestion.ingestInstalledItem('123');
    await parts.activation.enable('local', '123');
    const installed = parts.registry.get('local', '123')?.activeRevision;
    if (!installed) {
      throw new Error('expected active revision');
    }
    writeFileSync(join(installed.directory, 'theme.json'), '{"tampered":true}', 'utf8');

    const report = await parts.reconcile.reconcile();

    expect(report).toMatchObject({ ok: true, catalogPruned: 1, quarantined: 1 });
    expect(parts.registry.get('local', '123')).toMatchObject({
      state: 'quarantined',
      error: { code: 'enabled-content-invalid' },
    });
    expect(parts.catalog.get('local', '123')).toBeNull();
  });
});
