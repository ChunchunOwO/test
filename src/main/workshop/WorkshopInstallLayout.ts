import { createHash, randomUUID } from 'node:crypto';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { app } from 'electron';

export type WorkshopInstalledRevisionIdentity = {
  contentId: string;
  version: string;
  manifestSha256: string;
};

export type WorkshopInstallLayoutOptions = {
  rootDirectory?: string;
  createNonce?: () => string;
};

const contentIdPattern = /^[a-z0-9](?:[a-z0-9._-]{1,78}[a-z0-9])?$/u;
const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9a-z]+(?:[.-][0-9a-z]+)*)?$/iu;
const sha256Pattern = /^[a-f0-9]{64}$/u;

const assertStorageIdentity = (identity: WorkshopInstalledRevisionIdentity): void => {
  if (!contentIdPattern.test(identity.contentId)) {
    throw new Error('workshop_install_content_id_invalid');
  }
  if (!versionPattern.test(identity.version)) {
    throw new Error('workshop_install_version_invalid');
  }
  if (!sha256Pattern.test(identity.manifestSha256)) {
    throw new Error('workshop_install_manifest_checksum_invalid');
  }
};

const assertItemIdentity = (sourceId: string, itemId: string): void => {
  if (!sourceId.trim() || sourceId.length > 64 || !itemId.trim() || itemId.length > 128) {
    throw new Error('workshop_install_item_identity_invalid');
  }
};

const isStrictDescendant = (rootDirectory: string, candidate: string): boolean => {
  const relativePath = relative(rootDirectory, candidate);
  return Boolean(relativePath) && !relativePath.startsWith('..') && !isAbsolute(relativePath);
};

export const getWorkshopInstallRootDirectory = (): string =>
  join(app.getPath('userData'), 'workshop');

export class WorkshopInstallLayout {
  readonly rootDirectory: string;
  readonly stagingRootDirectory: string;
  readonly installedRootDirectory: string;
  private readonly createNonce: () => string;

  constructor(options: WorkshopInstallLayoutOptions = {}) {
    this.rootDirectory = resolve(options.rootDirectory ?? getWorkshopInstallRootDirectory());
    this.stagingRootDirectory = join(this.rootDirectory, 'staging');
    this.installedRootDirectory = join(this.rootDirectory, 'installed');
    this.createNonce = options.createNonce ?? randomUUID;
  }

  createStagingDirectory(sourceId: string, itemId: string): string {
    const storageKey = this.createItemStorageKey(sourceId, itemId);
    const directory = join(
      this.stagingRootDirectory,
      `${storageKey}.${process.pid}.${this.createNonce()}.tmp`,
    );
    this.assertOwnedStagingDirectory(directory);
    return directory;
  }

  getInstalledDirectory(
    sourceId: string,
    itemId: string,
    identity: WorkshopInstalledRevisionIdentity,
  ): string {
    assertStorageIdentity(identity);
    const directory = join(
      this.installedRootDirectory,
      this.createItemStorageKey(sourceId, itemId),
      identity.contentId,
      identity.version,
      identity.manifestSha256,
    );
    this.assertOwnedInstalledDirectory(directory);
    return directory;
  }

  assertOwnedStagingDirectory(directory: string): void {
    if (!isStrictDescendant(this.stagingRootDirectory, resolve(directory))) {
      throw new Error('workshop_install_staging_path_unowned');
    }
  }

  assertOwnedInstalledDirectory(directory: string): void {
    if (!isStrictDescendant(this.installedRootDirectory, resolve(directory))) {
      throw new Error('workshop_install_destination_path_unowned');
    }
  }

  private createItemStorageKey(sourceId: string, itemId: string): string {
    assertItemIdentity(sourceId, itemId);
    return createHash('sha256')
      .update(sourceId.trim().toLowerCase(), 'utf8')
      .update('\0', 'utf8')
      .update(itemId.trim().toLowerCase(), 'utf8')
      .digest('hex')
      .slice(0, 32);
  }
}
