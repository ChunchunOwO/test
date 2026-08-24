import { cp, lstat, readdir, rename, rm } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

export const workshopSdkDirectoryName = 'echo-workshop-sdk-1.1.0' as const;

export const requiredWorkshopSdkFiles = [
  'README.md',
  'package.json',
  'echo-workshop-plugin.d.ts',
  'echo-workshop-sdk.json',
  'bin/echo-workshop-sdk.mjs',
  'schemas/echo.workshop.schema.json',
  'schemas/plugin-package.schema.json',
  'templates/plugin-basic/plugin.js',
  'templates/github/validate-workshop.yml',
  'templates/catalog.json',
  'lib/project-templates.mjs',
  'lib/mock-host.mjs',
  'lib/quality-report.mjs',
  'examples/README.md',
  'examples/lyrics-source/plugin.js',
  'examples/author-agent/plugin.js',
  'examples/network-source/plugin.js',
  'examples/listen-together/plugin.js',
  'examples/metadata-provider/plugin.js',
  'examples/complete-ui-theme/manifest.fragment.json',
] as const;

const assertSdkSource = async (sourceDirectory: string): Promise<void> => {
  const source = await lstat(sourceDirectory);
  if (!source.isDirectory() || source.isSymbolicLink()) {
    throw new Error('workshop_sdk_source_invalid');
  }
  for (const relativePath of requiredWorkshopSdkFiles) {
    try {
      const entry = await lstat(resolve(sourceDirectory, ...relativePath.split('/')));
      if (entry.isFile() && !entry.isSymbolicLink()) continue;
    } catch {
      // Report the same stable error for a missing or unreadable SDK file.
    }
    throw new Error(`workshop_sdk_source_missing:${relativePath}`);
  }
};

const nextAvailableTarget = async (parentDirectory: string): Promise<string> => {
  for (let suffix = 1; suffix <= 999; suffix += 1) {
    const name = suffix === 1 ? workshopSdkDirectoryName : `${workshopSdkDirectoryName}-${suffix}`;
    const candidate = resolve(parentDirectory, name);
    try {
      await lstat(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return candidate;
      throw error;
    }
  }
  throw new Error('workshop_sdk_destination_exhausted');
};

export class WorkshopSdkDistributionService {
  constructor(private readonly sourceDirectory: string) {}

  async copyTo(parentDirectoryInput: string): Promise<string> {
    const parentDirectory = resolve(parentDirectoryInput);
    const parent = await lstat(parentDirectory);
    if (!parent.isDirectory() || parent.isSymbolicLink()) {
      throw new Error('workshop_sdk_destination_invalid');
    }
    await assertSdkSource(this.sourceDirectory);
    const targetDirectory = await nextAvailableTarget(parentDirectory);
    const temporaryDirectory = resolve(
      parentDirectory,
      `.${basename(targetDirectory)}.copying-${process.pid}-${Date.now()}`,
    );
    try {
      await cp(this.sourceDirectory, temporaryDirectory, {
        recursive: true,
        force: false,
        errorOnExist: true,
      });
      await assertSdkSource(temporaryDirectory);
      if ((await readdir(temporaryDirectory)).length === 0) {
        throw new Error('workshop_sdk_copy_empty');
      }
      await rename(temporaryDirectory, targetDirectory);
      return targetDirectory;
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }
}
