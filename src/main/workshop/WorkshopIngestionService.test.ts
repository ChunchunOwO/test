import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { workshopManifestFileName } from '../../shared/types/workshop';
import { LocalWorkshopSource } from './LocalWorkshopSource';
import { WorkshopCompatibilityService } from './WorkshopCompatibilityService';
import { WorkshopIngestionService } from './WorkshopIngestionService';
import { WorkshopRegistry } from './WorkshopRegistry';
import { WorkshopStagingInstaller } from './WorkshopStagingInstaller';

let rootDirectory = '';
let sourceDirectory = '';
let registryPath = '';
let installRootDirectory = '';
let clock = 1_786_200_000_000;

const sha256Text = (content: string): string =>
  createHash('sha256').update(content, 'utf8').digest('hex');

const writeFixture = (options: { minEchoVersion?: string; dependencies?: string[] } = {}): void => {
  const content = '{"accent":"#7dd3fc"}';
  mkdirSync(sourceDirectory, { recursive: true });
  writeFileSync(join(sourceDirectory, 'theme.json'), content, 'utf8');
  writeFileSync(join(sourceDirectory, workshopManifestFileName), JSON.stringify({
    type: 'echo-workshop-item',
    schemaVersion: 1,
    id: 'echo.ingestion-fixture',
    title: 'Ingestion Fixture',
    version: '1.0.0',
    content: { kind: 'theme', entry: 'theme.json' },
    compatibility: { minEchoVersion: options.minEchoVersion ?? '26.8.0' },
    files: [{
      path: 'theme.json',
      size: Buffer.byteLength(content, 'utf8'),
      sha256: sha256Text(content),
    }],
    license: { id: 'CC0-1.0', holder: 'ECHO QA' },
    ...(options.dependencies ? { dependencies: options.dependencies } : {}),
  }), 'utf8');
};

const createParts = () => {
  const source = new LocalWorkshopSource([{
    itemId: '123',
    directory: sourceDirectory,
    sizeOnDiskBytes: '4096',
    installedAtUnixSeconds: 1_786_200_000,
  }]);
  const registry = new WorkshopRegistry({
    filePath: registryPath,
    now: () => new Date(clock += 1_000),
  });
  const compatibility = new WorkshopCompatibilityService({
    currentEchoVersion: '26.8.2-beta.1',
  });
  const installer = new WorkshopStagingInstaller({
    rootDirectory: installRootDirectory,
    now: () => new Date(clock += 1_000),
  });
  return { source, registry, compatibility, installer };
};

beforeEach(async () => {
  rootDirectory = await mkdtemp(join(tmpdir(), 'echo-workshop-ingestion-'));
  sourceDirectory = join(rootDirectory, 'source');
  registryPath = join(rootDirectory, 'registry', 'registry.json');
  installRootDirectory = join(rootDirectory, 'store');
  clock = 1_786_200_000_000;
  writeFixture();
});

afterEach(async () => {
  await rm(rootDirectory, { recursive: true, force: true });
});

describe('WorkshopIngestionService', () => {
  it('coordinates source inspection, compatibility, staging and a disabled registry record', async () => {
    const parts = createParts();
    const stageSpy = vi.spyOn(parts.installer, 'stage');
    const service = new WorkshopIngestionService(parts);
    const [first, concurrent] = await Promise.all([
      service.ingestInstalledItem('123'),
      service.ingestInstalledItem('123'),
    ]);

    expect(first).toEqual(concurrent);
    expect(first).toMatchObject({
      ok: true,
      installationCreated: true,
      resumed: false,
      record: {
        state: 'disabled',
        activeRevision: null,
        candidateRevision: { contentId: 'echo.ingestion-fixture' },
      },
    });
    expect(stageSpy).toHaveBeenCalledTimes(1);
    if (first.ok) {
      expect(first.record.candidateRevision?.directory).not.toBe(sourceDirectory);
      expect(existsSync(first.record.candidateRevision?.directory ?? '')).toBe(true);
    }
  });

  it('quarantines incompatible content before any files enter the installed store', async () => {
    await rm(sourceDirectory, { recursive: true, force: true });
    writeFixture({ minEchoVersion: '99.0.0', dependencies: ['456'] });
    const parts = createParts();
    const service = new WorkshopIngestionService(parts);
    const result = await service.ingestInstalledItem('123');

    expect(result).toMatchObject({
      ok: false,
      reason: 'incompatible',
      record: { state: 'quarantined' },
      compatibilityIssues: [
        { code: 'echo-version-too-old' },
        { code: 'dependency-missing', subject: '456' },
      ],
    });
    expect(existsSync(parts.installer.layout.installedRootDirectory)).toBe(false);
  });

  it('resumes a verified staged revision after an interrupted registry finalization', async () => {
    const parts = createParts();
    const content = await parts.installer.inspect(sourceDirectory);
    const staged = await parts.installer.stage({ sourceId: 'local', itemId: '123', content });
    parts.registry.registerDetected('local', '123');
    parts.registry.transition('local', '123', 'verified');
    parts.registry.transition('local', '123', 'staged', { candidateRevision: staged.revision });
    const locationSpy = vi.spyOn(parts.source, 'getInstallLocation');
    const service = new WorkshopIngestionService(parts);

    await expect(service.ingestInstalledItem('123')).resolves.toMatchObject({
      ok: true,
      resumed: true,
      installationCreated: false,
      record: { state: 'disabled' },
    });
    expect(locationSpy).not.toHaveBeenCalled();
  });

  it('removes a newly staged directory when the Registry cannot record it', async () => {
    const parts = createParts();
    const rollbackSpy = vi.spyOn(parts.installer, 'rollbackStaged');
    const registry = {
      get: parts.registry.get.bind(parts.registry),
      getSnapshot: parts.registry.getSnapshot.bind(parts.registry),
      registerDetected: parts.registry.registerDetected.bind(parts.registry),
      transition: (...args: Parameters<WorkshopRegistry['transition']>) => {
        if (args[2] === 'staged') {
          throw new Error('simulated_registry_write_failure');
        }
        return parts.registry.transition(...args);
      },
    };
    const service = new WorkshopIngestionService({ ...parts, registry });
    const result = await service.ingestInstalledItem('123');

    expect(result).toMatchObject({ ok: false, reason: 'registry-error' });
    expect(rollbackSpy).toHaveBeenCalledTimes(1);
    const stagedResult = rollbackSpy.mock.calls[0]?.[0];
    expect(stagedResult?.created).toBe(true);
    expect(existsSync(stagedResult?.revision.directory ?? '')).toBe(false);
  });
});
