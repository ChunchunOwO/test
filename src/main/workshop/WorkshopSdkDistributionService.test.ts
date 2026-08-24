import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  requiredWorkshopSdkFiles,
  WorkshopSdkDistributionService,
  workshopSdkDirectoryName,
} from './WorkshopSdkDistributionService';

const temporaryDirectories: string[] = [];

const createFixture = async (): Promise<{ root: string; source: string; destination: string }> => {
  const root = await mkdtemp(resolve(tmpdir(), 'echo-workshop-sdk-'));
  temporaryDirectories.push(root);
  const source = resolve(root, 'source');
  const destination = resolve(root, 'destination');
  await mkdir(destination);
  for (const path of requiredWorkshopSdkFiles) {
    const target = resolve(source, ...path.split('/'));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, path, 'utf8');
  }
  return { root, source, destination };
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('WorkshopSdkDistributionService', () => {
  it('copies the complete SDK without overwriting an existing copy', async () => {
    const fixture = await createFixture();
    const service = new WorkshopSdkDistributionService(fixture.source);

    const first = await service.copyTo(fixture.destination);
    const second = await service.copyTo(fixture.destination);

    expect(first).toBe(resolve(fixture.destination, workshopSdkDirectoryName));
    expect(second).toBe(resolve(fixture.destination, `${workshopSdkDirectoryName}-2`));
    await expect(readFile(resolve(first, 'echo-workshop-sdk.json'), 'utf8')).resolves.toBe('echo-workshop-sdk.json');
  });

  it('fails before creating a distributable folder when the SDK source is incomplete', async () => {
    const fixture = await createFixture();
    await rm(resolve(fixture.source, 'schemas', 'plugin-package.schema.json'));
    const service = new WorkshopSdkDistributionService(fixture.source);

    await expect(service.copyTo(fixture.destination)).rejects.toThrow('workshop_sdk_source_missing');
  });
});
