import {
  workshopDataCatalogFormatVersion,
  workshopDataContentKinds,
  type WorkshopDataCatalogRecord,
  type WorkshopDataCatalogSnapshot,
  type WorkshopDataContentKind,
} from './WorkshopDataContributionTypes';
import type { WorkshopDataContentHandlerRegistry } from './WorkshopDataContentHandler';
import { workshopDataIdPattern } from './WorkshopDataValidation';
import { normalizeWorkshopRelativePath } from './WorkshopManifest';
import { normalizeWorkshopRegistryIdentity } from './WorkshopRegistryCodec';

const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9a-z]+(?:[.-][0-9a-z]+)*)?$/iu;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const contentKindSet = new Set<WorkshopDataContentKind>(workshopDataContentKinds);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));

export const cloneWorkshopDataCatalogValue = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

export const normalizeWorkshopDataCatalogRecord = (
  value: unknown,
  handlers: WorkshopDataContentHandlerRegistry,
): WorkshopDataCatalogRecord => {
  if (!isRecord(value)) {
    throw new Error('workshop_data_catalog_record_invalid');
  }
  const identity = normalizeWorkshopRegistryIdentity(
    typeof value.sourceId === 'string' ? value.sourceId : '',
    typeof value.itemId === 'string' ? value.itemId : '',
  );
  const contentId = typeof value.contentId === 'string'
    ? value.contentId.trim().toLowerCase()
    : '';
  const version = typeof value.version === 'string' ? value.version.trim() : '';
  const manifestSha256 = typeof value.manifestSha256 === 'string'
    ? value.manifestSha256.trim().toLowerCase()
    : '';
  if (!workshopDataIdPattern.test(contentId)) {
    throw new Error('workshop_data_catalog_content_id_invalid');
  }
  if (!contentKindSet.has(value.contentKind as WorkshopDataContentKind)) {
    throw new Error('workshop_data_catalog_content_kind_invalid');
  }
  if (!versionPattern.test(version)) {
    throw new Error('workshop_data_catalog_version_invalid');
  }
  if (!sha256Pattern.test(manifestSha256)) {
    throw new Error('workshop_data_catalog_checksum_invalid');
  }
  if (!isTimestamp(value.activatedAt)) {
    throw new Error('workshop_data_catalog_timestamp_invalid');
  }
  const contentKind = value.contentKind as WorkshopDataContentKind;
  return {
    ...identity,
    contentId,
    contentKind,
    version,
    manifestSha256,
    entryPath: normalizeWorkshopRelativePath(value.entryPath, 'catalog_entry_path'),
    contribution: handlers.normalize(contentKind, value.contribution, contentId),
    activatedAt: value.activatedAt,
  };
};

export const normalizeWorkshopDataCatalogSnapshot = (
  value: unknown,
  handlers: WorkshopDataContentHandlerRegistry,
): WorkshopDataCatalogSnapshot => {
  if (
    !isRecord(value) ||
    value.formatVersion !== workshopDataCatalogFormatVersion ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 0 ||
    !Array.isArray(value.records) ||
    value.records.length > 10_000
  ) {
    throw new Error('workshop_data_catalog_snapshot_invalid');
  }
  const records = value.records.map((record) =>
    normalizeWorkshopDataCatalogRecord(record, handlers));
  const keys = records.map((record) =>
    `${record.sourceId}\0${record.itemId.toLowerCase()}`);
  if (new Set(keys).size !== keys.length) {
    throw new Error('workshop_data_catalog_record_duplicate');
  }
  return {
    formatVersion: workshopDataCatalogFormatVersion,
    revision: value.revision as number,
    records,
  };
};

export const createEmptyWorkshopDataCatalogSnapshot = (): WorkshopDataCatalogSnapshot => ({
  formatVersion: workshopDataCatalogFormatVersion,
  revision: 0,
  records: [],
});
