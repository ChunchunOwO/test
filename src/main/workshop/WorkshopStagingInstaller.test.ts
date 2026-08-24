import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { workshopManifestFileName } from '../../shared/types/workshop';
import { validateWorkshopContentDirectory } from './WorkshopContentValidator';
import { WorkshopStagingInstaller } from './WorkshopStagingInstaller';

let rootDirectory = '';
let sourceDirectory = '';
let clock = 1_786_100_000_000;

const sha256Text = (content: string): string =>
  createHash('sha256').update(content, 'utf8').digest('hex');

const writeFixture = (title = 'Staging Fixture'): void => {
  const files = {
    'theme.json': '{"accent":"#7dd3fc"}',
    'assets/preview.txt': 'preview',
  };
  for (const [path, content] of Object.entries(files)) {
    const target = join(sourceDirectory, ...path.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }
  writeFileSync(join(sourceDirectory, workshopManifestFileName), JSON.stringify({
    type: 'echo-workshop-item',
    schemaVersion: 1,
    id: 'echo.staging-fixture',
    title,
    version: '1.0.0',
    content: { kind: 'theme', entry: 'theme.json' },
    compatibility: { minEchoVersion: '26.8.0' },
    files: Object.entries(files).map(([path, content]) => ({
      path,
      size: Buffer.byteLength(content, 'utf8'),
      sha256: sha256Text(content),
    })),
    license: { id: 'CC0-1.0', holder: 'ECHO QA' },
  }), 'utf8');
};

const createInstaller = (): WorkshopStagingInstaller => new WorkshopStagingInstaller({
  rootDirectory: join(rootDirectory, 'workshop-store'),
  now: () => new Date(clock += 1_000),
});

beforeEach(async () => {
  rootDirectory = await mkdtemp(join(tmpdir(), 'echo-workshop-staging-'));
  sourceDirectory = join(rootDirectory, 'source');
  clock = 1_786_100_000_000;
  writeFixture();
});

afterEach(async () => {
  await rm(rootDirectory, { recursive: true, force: true });
});

describe('WorkshopStagingInstaller', () => {
  it('copies into an owned content-addressed directory and verifies the copy again', async () => {
    const installer = createInstaller();
    const content = await installer.inspect(sourceDirectory);
    const first = await installer.stage({ sourceId: 'local', itemId: '123', content });
    const second = await installer.stage({ sourceId: 'local', itemId: '123', content });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.revision.directory).toBe(first.revision.directory);
    expect(first.revision.directory).not.toBe(sourceDirectory);
    expect(first.revision.manifestSha256).toMatch(/^[a-f0-9]{64}$/u);
    await expect(validateWorkshopContentDirectory(first.revision.directory)).resolves.toMatchObject({
      manifest: { id: 'echo.staging-fixture', version: '1.0.0' },
    });
  });

  it('rejects a source manifest changed after the first inspection', async () => {
    const installer = createInstaller();
    const content = await installer.inspect(sourceDirectory);
    const manifestPath = join(sourceDirectory, workshopManifestFileName);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    manifest.title = 'Changed after inspection';
    writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');

    await expect(
      installer.stage({ sourceId: 'local', itemId: '123', content }),
    ).rejects.toThrow('workshop_staging_source_changed');
  });

  it('rejects an install store nested inside the untrusted source tree', async () => {
    const installer = new WorkshopStagingInstaller({
      rootDirectory: join(sourceDirectory, 'workshop-store'),
    });
    const content = await installer.inspect(sourceDirectory);

    await expect(
      installer.stage({ sourceId: 'local', itemId: '123', content }),
    ).rejects.toThrow('workshop_staging_source_store_overlap');
    expect(existsSync(installer.layout.rootDirectory)).toBe(false);
  });

  it('preserves and rejects a corrupted existing destination', async () => {
    const installer = createInstaller();
    const content = await installer.inspect(sourceDirectory);
    const installed = await installer.stage({ sourceId: 'local', itemId: '123', content });
    const installedEntry = join(installed.revision.directory, 'theme.json');
    writeFileSync(installedEntry, '{}', 'utf8');

    await expect(
      installer.stage({ sourceId: 'local', itemId: '123', content }),
    ).rejects.toThrow('workshop_staging_destination_invalid');
    expect(readFileSync(installedEntry, 'utf8')).toBe('{}');
  });

  it('rolls back only a directory created by the current stage result', async () => {
    const installer = createInstaller();
    const content = await installer.inspect(sourceDirectory);
    const installed = await installer.stage({ sourceId: 'local', itemId: '123', content });

    await expect(installer.rollbackStaged(installed)).resolves.toBe(true);
    expect(existsSync(installed.revision.directory)).toBe(false);
    await expect(installer.rollbackStaged({ ...installed, created: false })).resolves.toBe(false);
  });
});
