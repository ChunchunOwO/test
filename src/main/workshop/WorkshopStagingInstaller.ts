import { createHash } from 'node:crypto';
import { constants, existsSync } from 'node:fs';
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
} from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { workshopManifestFileName } from '../../shared/types/workshop';
import {
  validateWorkshopContentDirectory,
  type ValidatedWorkshopContent,
} from './WorkshopContentValidator';
import {
  defaultWorkshopManifestPolicy,
  type WorkshopManifestPolicy,
} from './WorkshopManifest';
import {
  WorkshopInstallLayout,
  type WorkshopInstallLayoutOptions,
} from './WorkshopInstallLayout';
import type { WorkshopRegistryRevision } from './WorkshopRegistryTypes';

export type InspectedWorkshopContent = ValidatedWorkshopContent & {
  manifestSha256: string;
};

export type WorkshopStagingInstallerOptions = WorkshopInstallLayoutOptions & {
  now?: () => Date;
  manifestPolicy?: WorkshopManifestPolicy;
};

export type WorkshopStagingInput = {
  sourceId: string;
  itemId: string;
  content: InspectedWorkshopContent;
};

export type WorkshopStagingResult = {
  sourceId: string;
  itemId: string;
  revision: WorkshopRegistryRevision;
  created: boolean;
};

const sha256File = async (path: string): Promise<string> =>
  createHash('sha256').update(await readFile(path)).digest('hex');

const isStrictDescendant = (rootDirectory: string, candidate: string): boolean => {
  const relativePath = relative(rootDirectory, candidate);
  return Boolean(relativePath) && !relativePath.startsWith('..') && !isAbsolute(relativePath);
};

const pathsOverlap = (left: string, right: string): boolean =>
  relative(left, right) === '' ||
  isStrictDescendant(left, right) ||
  isStrictDescendant(right, left);

const assertSameContent = (
  actual: InspectedWorkshopContent,
  expected: InspectedWorkshopContent,
  errorCode: string,
): void => {
  if (
    actual.manifestSha256 !== expected.manifestSha256 ||
    actual.manifest.id !== expected.manifest.id ||
    actual.manifest.version !== expected.manifest.version ||
    actual.manifest.content.kind !== expected.manifest.content.kind
  ) {
    throw new Error(errorCode);
  }
};

export class WorkshopStagingInstaller {
  readonly layout: WorkshopInstallLayout;
  private readonly now: () => Date;
  private readonly manifestPolicy: WorkshopManifestPolicy;

  constructor(options: WorkshopStagingInstallerOptions = {}) {
    this.layout = new WorkshopInstallLayout(options);
    this.now = options.now ?? (() => new Date());
    this.manifestPolicy = options.manifestPolicy ?? defaultWorkshopManifestPolicy;
  }

  async inspect(sourceDirectory: string): Promise<InspectedWorkshopContent> {
    const content = await validateWorkshopContentDirectory(sourceDirectory, this.manifestPolicy);
    const manifestSha256 = await sha256File(join(content.rootDirectory, workshopManifestFileName));
    return { ...content, manifestSha256 };
  }

  async stage(input: WorkshopStagingInput): Promise<WorkshopStagingResult> {
    if (pathsOverlap(resolve(input.content.rootDirectory), this.layout.rootDirectory)) {
      throw new Error('workshop_staging_source_store_overlap');
    }
    const destinationDirectory = this.layout.getInstalledDirectory(
      input.sourceId,
      input.itemId,
      {
        contentId: input.content.manifest.id,
        version: input.content.manifest.version,
        manifestSha256: input.content.manifestSha256,
      },
    );
    const existing = await this.inspectExisting(destinationDirectory, input.content);
    if (existing) {
      return this.createResult(input, destinationDirectory, false);
    }

    const stagingDirectory = this.layout.createStagingDirectory(input.sourceId, input.itemId);
    await mkdir(this.layout.stagingRootDirectory, { recursive: true });
    await mkdir(stagingDirectory);

    try {
      await this.copyValidatedContent(input.content, stagingDirectory);
      const stagedContent = await this.inspect(stagingDirectory);
      assertSameContent(stagedContent, input.content, 'workshop_staging_source_changed');

      await mkdir(dirname(destinationDirectory), { recursive: true });
      try {
        await rename(stagingDirectory, destinationDirectory);
      } catch (error) {
        if (!existsSync(destinationDirectory)) {
          throw error;
        }
        await this.requireValidExisting(destinationDirectory, input.content);
        await this.removeOwnedStagingDirectory(stagingDirectory);
        return this.createResult(input, destinationDirectory, false);
      }
      return this.createResult(input, destinationDirectory, true);
    } catch (error) {
      await this.removeOwnedStagingDirectory(stagingDirectory);
      throw error;
    }
  }

  async verifyRevision(
    sourceId: string,
    itemId: string,
    revision: WorkshopRegistryRevision,
  ): Promise<InspectedWorkshopContent> {
    const expectedDirectory = this.layout.getInstalledDirectory(sourceId, itemId, revision);
    if (resolve(expectedDirectory) !== resolve(revision.directory)) {
      throw new Error('workshop_install_revision_path_mismatch');
    }
    const content = await this.inspect(expectedDirectory);
    if (
      content.manifestSha256 !== revision.manifestSha256 ||
      content.manifest.id !== revision.contentId ||
      content.manifest.version !== revision.version ||
      content.manifest.content.kind !== revision.contentKind
    ) {
      throw new Error('workshop_install_revision_mismatch');
    }
    return content;
  }

  async rollbackStaged(result: WorkshopStagingResult): Promise<boolean> {
    if (!result.created) {
      return false;
    }
    const expectedDirectory = this.layout.getInstalledDirectory(
      result.sourceId,
      result.itemId,
      result.revision,
    );
    if (resolve(expectedDirectory) !== resolve(result.revision.directory)) {
      throw new Error('workshop_install_rollback_path_mismatch');
    }
    this.layout.assertOwnedInstalledDirectory(expectedDirectory);
    if (!existsSync(expectedDirectory)) {
      return false;
    }
    await rm(expectedDirectory, { recursive: true, force: false });
    return true;
  }

  private async copyValidatedContent(
    content: InspectedWorkshopContent,
    stagingDirectory: string,
  ): Promise<void> {
    const sourceRoot = await realpath(content.rootDirectory);
    await this.copyOneFile(
      sourceRoot,
      join(content.rootDirectory, workshopManifestFileName),
      join(stagingDirectory, workshopManifestFileName),
    );
    for (const file of content.files) {
      await this.copyOneFile(
        sourceRoot,
        join(content.rootDirectory, ...file.path.split('/')),
        join(stagingDirectory, ...file.path.split('/')),
      );
    }
  }

  private async copyOneFile(
    canonicalSourceRoot: string,
    sourcePath: string,
    destinationPath: string,
  ): Promise<void> {
    const sourceStatus = await lstat(sourcePath);
    const canonicalSourcePath = await realpath(sourcePath);
    if (
      !sourceStatus.isFile() ||
      sourceStatus.isSymbolicLink() ||
      !isStrictDescendant(canonicalSourceRoot, canonicalSourcePath)
    ) {
      throw new Error('workshop_staging_source_file_invalid');
    }
    await mkdir(dirname(destinationPath), { recursive: true });
    await copyFile(sourcePath, destinationPath, constants.COPYFILE_EXCL);
  }

  private async inspectExisting(
    destinationDirectory: string,
    expected: InspectedWorkshopContent,
  ): Promise<InspectedWorkshopContent | null> {
    if (!existsSync(destinationDirectory)) {
      return null;
    }
    return this.requireValidExisting(destinationDirectory, expected);
  }

  private async requireValidExisting(
    destinationDirectory: string,
    expected: InspectedWorkshopContent,
  ): Promise<InspectedWorkshopContent> {
    try {
      const existing = await this.inspect(destinationDirectory);
      assertSameContent(existing, expected, 'workshop_staging_destination_conflict');
      return existing;
    } catch (error) {
      if (error instanceof Error && error.message === 'workshop_staging_destination_conflict') {
        throw error;
      }
      throw new Error('workshop_staging_destination_invalid');
    }
  }

  private createResult(
    input: WorkshopStagingInput,
    destinationDirectory: string,
    created: boolean,
  ): WorkshopStagingResult {
    return {
      sourceId: input.sourceId,
      itemId: input.itemId,
      revision: {
        contentId: input.content.manifest.id,
        contentKind: input.content.manifest.content.kind,
        version: input.content.manifest.version,
        manifestSha256: input.content.manifestSha256,
        directory: destinationDirectory,
        installedAt: this.now().toISOString(),
      },
      created,
    };
  }

  private async removeOwnedStagingDirectory(directory: string): Promise<void> {
    this.layout.assertOwnedStagingDirectory(directory);
    await rm(directory, { recursive: true, force: true });
  }
}
