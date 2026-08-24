import { isAbsolute } from 'node:path';
import { workshopContentKinds, type WorkshopContentKind } from '../../shared/types/workshop';
import {
  workshopRegistryFormatVersion,
  workshopRegistryStates,
  type WorkshopRegistryError,
  type WorkshopRegistryRecord,
  type WorkshopRegistryRevision,
  type WorkshopRegistrySnapshot,
  type WorkshopRegistryState,
} from './WorkshopRegistryTypes';

const sourceIdPattern = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/u;
const itemIdPattern = /^[a-z0-9](?:[a-z0-9._:-]{0,126}[a-z0-9])?$/iu;
const contentIdPattern = /^[a-z0-9](?:[a-z0-9._-]{1,78}[a-z0-9])?$/u;
const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9a-z]+(?:[.-][0-9a-z]+)*)?$/iu;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const capabilityPattern = /^[a-z0-9](?:[a-z0-9._:-]{0,126}[a-z0-9])?$/u;
const errorCodePattern = /^[a-z0-9](?:[a-z0-9._:-]{0,126}[a-z0-9])?$/u;
const stateSet = new Set<WorkshopRegistryState>(workshopRegistryStates);
const contentKindSet = new Set<WorkshopContentKind>(workshopContentKinds);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));

export const cloneWorkshopRegistryValue = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

export const normalizeWorkshopRegistryIdentity = (
  sourceIdInput: string,
  itemIdInput: string,
): { sourceId: string; itemId: string } => {
  const sourceId = sourceIdInput.trim().toLowerCase();
  const itemId = itemIdInput.trim();
  if (!sourceIdPattern.test(sourceId)) {
    throw new Error('workshop_registry_source_id_invalid');
  }
  if (!itemIdPattern.test(itemId)) {
    throw new Error('workshop_registry_item_id_invalid');
  }
  return { sourceId, itemId };
};

export const normalizeWorkshopRegistryRevision = (value: unknown): WorkshopRegistryRevision => {
  if (!isRecord(value)) {
    throw new Error('workshop_registry_revision_invalid');
  }
  const contentId = typeof value.contentId === 'string' ? value.contentId.trim().toLowerCase() : '';
  const version = typeof value.version === 'string' ? value.version.trim() : '';
  const manifestSha256 = typeof value.manifestSha256 === 'string'
    ? value.manifestSha256.trim().toLowerCase()
    : '';
  if (!contentIdPattern.test(contentId)) {
    throw new Error('workshop_registry_content_id_invalid');
  }
  if (!contentKindSet.has(value.contentKind as WorkshopContentKind)) {
    throw new Error('workshop_registry_content_kind_invalid');
  }
  if (!versionPattern.test(version)) {
    throw new Error('workshop_registry_version_invalid');
  }
  if (!sha256Pattern.test(manifestSha256)) {
    throw new Error('workshop_registry_checksum_invalid');
  }
  if (typeof value.directory !== 'string' || !isAbsolute(value.directory)) {
    throw new Error('workshop_registry_directory_invalid');
  }
  if (!isTimestamp(value.installedAt)) {
    throw new Error('workshop_registry_installed_at_invalid');
  }
  return {
    contentId,
    contentKind: value.contentKind as WorkshopContentKind,
    version,
    manifestSha256,
    directory: value.directory,
    installedAt: value.installedAt,
  };
};

const normalizeOptionalRevision = (value: unknown): WorkshopRegistryRevision | null =>
  value === null ? null : normalizeWorkshopRegistryRevision(value);

export const normalizeWorkshopRegistryCapabilities = (value: unknown): string[] => {
  if (!Array.isArray(value) || value.length > 64) {
    throw new Error('workshop_registry_capabilities_invalid');
  }
  const capabilities = value.map((entry) => typeof entry === 'string' ? entry.trim().toLowerCase() : '');
  if (
    capabilities.some((entry) => !capabilityPattern.test(entry)) ||
    new Set(capabilities).size !== capabilities.length
  ) {
    throw new Error('workshop_registry_capabilities_invalid');
  }
  return capabilities;
};

export const normalizeWorkshopRegistryErrorCode = (value: unknown): string => {
  const errorCode = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!errorCodePattern.test(errorCode)) {
    throw new Error('workshop_registry_error_code_invalid');
  }
  return errorCode;
};

const normalizeError = (value: unknown): WorkshopRegistryError | null => {
  if (value === null) {
    return null;
  }
  if (!isRecord(value) || !isTimestamp(value.at)) {
    throw new Error('workshop_registry_error_invalid');
  }
  return { code: normalizeWorkshopRegistryErrorCode(value.code), at: value.at };
};

export const normalizeWorkshopRegistryRecord = (value: unknown): WorkshopRegistryRecord => {
  if (!isRecord(value)) {
    throw new Error('workshop_registry_record_invalid');
  }
  const identity = normalizeWorkshopRegistryIdentity(
    typeof value.sourceId === 'string' ? value.sourceId : '',
    typeof value.itemId === 'string' ? value.itemId : '',
  );
  if (!stateSet.has(value.state as WorkshopRegistryState)) {
    throw new Error('workshop_registry_state_invalid');
  }
  const state = value.state as WorkshopRegistryState;
  const candidateRevision = normalizeOptionalRevision(value.candidateRevision);
  const activeRevision = normalizeOptionalRevision(value.activeRevision);
  const lastKnownGoodRevision = normalizeOptionalRevision(value.lastKnownGoodRevision);
  const error = normalizeError(value.error);
  if (['staged', 'disabled', 'enabled'].includes(state) && !candidateRevision) {
    throw new Error('workshop_registry_candidate_missing');
  }
  if (state === 'enabled' && !activeRevision) {
    throw new Error('workshop_registry_active_revision_missing');
  }
  if ((state === 'error' || state === 'quarantined') !== Boolean(error)) {
    throw new Error('workshop_registry_error_state_invalid');
  }
  if (!isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt)) {
    throw new Error('workshop_registry_timestamp_invalid');
  }
  return {
    ...identity,
    state,
    candidateRevision,
    activeRevision,
    lastKnownGoodRevision,
    approvedCapabilities: normalizeWorkshopRegistryCapabilities(value.approvedCapabilities),
    error,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
};

export const normalizeWorkshopRegistrySnapshot = (value: unknown): WorkshopRegistrySnapshot => {
  if (
    !isRecord(value) ||
    value.formatVersion !== workshopRegistryFormatVersion ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 0 ||
    !Array.isArray(value.records) ||
    value.records.length > 10_000
  ) {
    throw new Error('workshop_registry_snapshot_invalid');
  }
  const records = value.records.map(normalizeWorkshopRegistryRecord);
  const keys = records.map((record) => `${record.sourceId}\u0000${record.itemId.toLowerCase()}`);
  if (new Set(keys).size !== keys.length) {
    throw new Error('workshop_registry_record_duplicate');
  }
  return {
    formatVersion: workshopRegistryFormatVersion,
    revision: value.revision as number,
    records,
  };
};

export const createEmptyWorkshopRegistrySnapshot = (): WorkshopRegistrySnapshot => ({
  formatVersion: workshopRegistryFormatVersion,
  revision: 0,
  records: [],
});
