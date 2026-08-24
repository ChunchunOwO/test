import { readWorkshopDataEntry } from './WorkshopDataEntryReader';
import type { WorkshopDataContentHandlerRegistry } from './WorkshopDataContentHandler';
import {
  isWorkshopDataContentKind,
  type WorkshopDataCatalogRecord,
} from './WorkshopDataContributionTypes';
import type { WorkshopRegistryRevision } from './WorkshopRegistryTypes';
import type { WorkshopStagingInstaller } from './WorkshopStagingInstaller';

type WorkshopDataCatalogRecordLoaderInstallerPort = Pick<WorkshopStagingInstaller, 'verifyRevision'>;

export type WorkshopDataCatalogRecordLoaderOptions = {
  installer: WorkshopDataCatalogRecordLoaderInstallerPort;
  handlers: WorkshopDataContentHandlerRegistry;
  now?: () => Date;
};

export const loadWorkshopDataCatalogRecord = async (
  sourceId: string,
  itemId: string,
  revision: WorkshopRegistryRevision,
  options: WorkshopDataCatalogRecordLoaderOptions,
  activatedAt?: string,
): Promise<WorkshopDataCatalogRecord> => {
  if (!isWorkshopDataContentKind(revision.contentKind)) {
    throw new Error('workshop_data_content_kind_unsupported');
  }

  const content = await options.installer.verifyRevision(sourceId, itemId, revision);
  const entry = await readWorkshopDataEntry(content);
  const contribution = options.handlers.normalize(
    revision.contentKind,
    entry,
    revision.contentId,
  );
  if (
    contribution.type === 'echo-workshop-theme-preset' && contribution.runtime &&
    !content.manifest.files.some((file) => file.path.toLowerCase() === contribution.runtime?.entry.toLowerCase())
  ) {
    throw new Error('workshop_data_theme_runtime_entry_missing');
  }

  return {
    sourceId,
    itemId,
    contentId: revision.contentId,
    contentKind: revision.contentKind,
    version: revision.version,
    manifestSha256: revision.manifestSha256,
    entryPath: content.manifest.content.entry,
    contribution,
    activatedAt: activatedAt ?? (options.now ?? (() => new Date()))().toISOString(),
  };
};
