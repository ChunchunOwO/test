import { extname } from 'node:path';
import {
  workshopContentKinds,
  workshopManifestFileName,
  workshopManifestSchemaVersion,
  workshopManifestType,
  type WorkshopContentKind,
  type WorkshopDependencyDeclaration,
  type WorkshopItemManifest,
  type WorkshopLicenseDeclaration,
  type WorkshopManifestFile,
} from '../../shared/types/workshop';
import { compareEchoVersions } from './WorkshopVersion';

const manifestIdPattern = /^[a-z0-9](?:[a-z0-9._-]{1,78}[a-z0-9])?$/u;
const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9a-z]+(?:[.-][0-9a-z]+)*)?$/iu;
const dependencyVersionRangePattern = /^(?:\*|(?:\^|~|>=|<=|>|<)?\d+\.\d+\.\d+(?:-[0-9a-z]+(?:[.-][0-9a-z]+)*)?)$/iu;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const workshopItemIdPattern = /^[1-9]\d{0,19}$/u;
const invalidWindowsPathCharacters = new Set(['<', '>', ':', '"', '|', '?', '*']);
const windowsReservedNamePattern = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;

const entryExtensionByKind: Record<WorkshopContentKind, string> = {
  theme: '.json',
  'lyrics-style': '.json',
  'visualizer-preset': '.json',
  'dsp-preset': '.json',
  'audio-plugin-profile': '.json',
  'plugin-package': '.echo',
};

export type WorkshopManifestPolicy = {
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
  allowedContentKinds: readonly WorkshopContentKind[];
};

export const defaultWorkshopManifestPolicy: WorkshopManifestPolicy = Object.freeze({
  maxFiles: 512,
  maxFileBytes: 16 * 1024 * 1024,
  maxTotalBytes: 64 * 1024 * 1024,
  allowedContentKinds: workshopContentKinds,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const boundedString = (value: unknown, field: string, maxLength: number): string => {
  if (typeof value !== 'string') {
    throw new Error(`workshop_manifest_${field}_invalid`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`workshop_manifest_${field}_invalid`);
  }
  return normalized;
};

const normalizeVersion = (value: unknown, field: string): string => {
  const version = boundedString(value, field, 48);
  if (!versionPattern.test(version)) {
    throw new Error(`workshop_manifest_${field}_invalid`);
  }
  return version;
};

const hasInvalidWindowsPathCharacter = (value: string): boolean =>
  [...value].some((character) =>
    character.charCodeAt(0) <= 31 || invalidWindowsPathCharacters.has(character),
  );

export const normalizeWorkshopRelativePath = (value: unknown, field = 'path'): string => {
  const path = boundedString(value, field, 240);
  if (path.includes('\\') || path.startsWith('/') || /^[a-z]:/iu.test(path)) {
    throw new Error(`workshop_manifest_${field}_unsafe`);
  }

  const segments = path.split('/');
  if (
    segments.some((segment) =>
      !segment ||
      segment === '.' ||
      segment === '..' ||
      segment.endsWith('.') ||
      segment.endsWith(' ') ||
      hasInvalidWindowsPathCharacter(segment) ||
      windowsReservedNamePattern.test(segment),
    )
  ) {
    throw new Error(`workshop_manifest_${field}_unsafe`);
  }
  return path;
};

const normalizeLicense = (value: unknown): WorkshopLicenseDeclaration => {
  if (!isRecord(value)) {
    throw new Error('workshop_manifest_license_invalid');
  }
  const id = boundedString(value.id, 'license_id', 80);
  const holder = boundedString(value.holder, 'license_holder', 160);
  const sourceUrl = value.sourceUrl === undefined
    ? undefined
    : boundedString(value.sourceUrl, 'license_source_url', 500);

  if (sourceUrl) {
    let parsed: URL;
    try {
      parsed = new URL(sourceUrl);
    } catch {
      throw new Error('workshop_manifest_license_source_url_invalid');
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('workshop_manifest_license_source_url_invalid');
    }
  }

  return { id, holder, ...(sourceUrl ? { sourceUrl } : {}) };
};

const normalizeNetworkHost = (value: unknown): string => {
  const host = boundedString(value, 'network_host', 253).toLowerCase();
  if (
    host.includes('://') ||
    host.includes('/') ||
    host.includes(':') ||
    host.startsWith('.') ||
    host.endsWith('.') ||
    host.includes('*')
  ) {
    throw new Error('workshop_manifest_network_host_invalid');
  }
  try {
    if (new URL(`https://${host}`).hostname !== host) {
      throw new Error('invalid');
    }
  } catch {
    throw new Error('workshop_manifest_network_host_invalid');
  }
  return host;
};

const normalizeDependency = (value: unknown): WorkshopDependencyDeclaration => {
  if (typeof value === 'string') {
    const itemId = boundedString(value, 'dependency', 20);
    if (!workshopItemIdPattern.test(itemId)) throw new Error('workshop_manifest_dependency_invalid');
    return itemId;
  }
  if (!isRecord(value)) throw new Error('workshop_manifest_dependency_invalid');
  const itemId = boundedString(value.itemId, 'dependency_item_id', 20);
  if (!workshopItemIdPattern.test(itemId)) throw new Error('workshop_manifest_dependency_invalid');
  const versionRange = value.versionRange === undefined
    ? undefined
    : boundedString(value.versionRange, 'dependency_version_range', 48);
  if (versionRange && !dependencyVersionRangePattern.test(versionRange)) {
    throw new Error('workshop_manifest_dependency_version_range_invalid');
  }
  if (value.optional !== undefined && typeof value.optional !== 'boolean') {
    throw new Error('workshop_manifest_dependency_optional_invalid');
  }
  return {
    itemId,
    ...(versionRange ? { versionRange } : {}),
    ...(value.optional === true ? { optional: true } : {}),
  };
};

const dependencyItemId = (dependency: WorkshopDependencyDeclaration): string =>
  typeof dependency === 'string' ? dependency : dependency.itemId;

const normalizeManifestFile = (value: unknown, policy: WorkshopManifestPolicy): WorkshopManifestFile => {
  if (!isRecord(value)) {
    throw new Error('workshop_manifest_file_invalid');
  }
  const path = normalizeWorkshopRelativePath(value.path, 'file_path');
  const size = value.size;
  const sha256 = typeof value.sha256 === 'string' ? value.sha256.trim().toLowerCase() : '';
  if (!Number.isSafeInteger(size) || (size as number) < 0 || (size as number) > policy.maxFileBytes) {
    throw new Error('workshop_manifest_file_size_invalid');
  }
  if (!sha256Pattern.test(sha256)) {
    throw new Error('workshop_manifest_file_sha256_invalid');
  }
  return { path, size: size as number, sha256 };
};

const normalizeUniqueStrings = <T>(
  value: unknown,
  maximum: number,
  normalize: (entry: unknown) => T,
  key: (entry: T) => string,
  error: string,
): T[] => {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.length > maximum) {
    throw new Error(error);
  }
  const result: T[] = [];
  const seen = new Set<string>();
  for (const rawEntry of value) {
    const entry = normalize(rawEntry);
    const normalizedKey = key(entry);
    if (seen.has(normalizedKey)) {
      throw new Error(error);
    }
    seen.add(normalizedKey);
    result.push(entry);
  }
  return result;
};

export const normalizeWorkshopItemManifest = (
  value: unknown,
  policy: WorkshopManifestPolicy = defaultWorkshopManifestPolicy,
): WorkshopItemManifest => {
  if (!isRecord(value) || value.type !== workshopManifestType || value.schemaVersion !== workshopManifestSchemaVersion) {
    throw new Error('workshop_manifest_header_invalid');
  }

  const id = boundedString(value.id, 'id', 80).toLowerCase();
  if (!manifestIdPattern.test(id)) {
    throw new Error('workshop_manifest_id_invalid');
  }
  const title = boundedString(value.title, 'title', 120);
  const version = normalizeVersion(value.version, 'version');

  if (!isRecord(value.content) || !policy.allowedContentKinds.includes(value.content.kind as WorkshopContentKind)) {
    throw new Error('workshop_manifest_content_kind_invalid');
  }
  const kind = value.content.kind as WorkshopContentKind;
  const entry = normalizeWorkshopRelativePath(value.content.entry, 'entry');
  if (extname(entry).toLowerCase() !== entryExtensionByKind[kind]) {
    throw new Error('workshop_manifest_entry_type_invalid');
  }

  if (!isRecord(value.compatibility)) {
    throw new Error('workshop_manifest_compatibility_invalid');
  }
  const minEchoVersion = normalizeVersion(value.compatibility.minEchoVersion, 'min_echo_version');
  const maxEchoVersion = value.compatibility.maxEchoVersion === undefined
    ? undefined
    : normalizeVersion(value.compatibility.maxEchoVersion, 'max_echo_version');
  if (maxEchoVersion && compareEchoVersions(maxEchoVersion, minEchoVersion)! < 0) {
    throw new Error('workshop_manifest_compatibility_range_invalid');
  }
  const pluginApiVersion = value.compatibility.pluginApiVersion;
  if (kind === 'plugin-package') {
    if (!Number.isSafeInteger(pluginApiVersion) || (pluginApiVersion as number) < 1 || (pluginApiVersion as number) > 9999) {
      throw new Error('workshop_manifest_plugin_api_version_invalid');
    }
  } else if (pluginApiVersion !== undefined) {
    throw new Error('workshop_manifest_data_content_cannot_declare_plugin_api');
  }

  const files = normalizeUniqueStrings(
    value.files,
    policy.maxFiles,
    (file) => normalizeManifestFile(file, policy),
    (file) => file.path.toLowerCase(),
    'workshop_manifest_files_invalid',
  );
  if (files.length === 0 || !files.some((file) => file.path.toLowerCase() === entry.toLowerCase())) {
    throw new Error('workshop_manifest_entry_missing');
  }
  if (files.some((file) => file.path.toLowerCase() === workshopManifestFileName.toLowerCase())) {
    throw new Error('workshop_manifest_cannot_list_itself');
  }
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (!Number.isSafeInteger(totalBytes) || totalBytes > policy.maxTotalBytes) {
    throw new Error('workshop_manifest_total_size_exceeded');
  }

  const dependencies = normalizeUniqueStrings(
    value.dependencies,
    64,
    normalizeDependency,
    dependencyItemId,
    'workshop_manifest_dependencies_invalid',
  );
  const conflicts = normalizeUniqueStrings(
    value.conflicts,
    64,
    (conflict) => boundedString(conflict, 'conflict', 20),
    (conflict) => conflict,
    'workshop_manifest_conflicts_invalid',
  );
  if (conflicts.some((conflict) => !workshopItemIdPattern.test(conflict))) {
    throw new Error('workshop_manifest_conflict_invalid');
  }
  if (conflicts.some((conflict) => dependencies.some((dependency) => dependencyItemId(dependency) === conflict))) {
    throw new Error('workshop_manifest_dependency_conflict_overlap');
  }

  const networkHosts = normalizeUniqueStrings(
    value.networkHosts,
    32,
    normalizeNetworkHost,
    (host) => host,
    'workshop_manifest_network_hosts_invalid',
  );
  if (kind !== 'plugin-package' && networkHosts.length > 0) {
    throw new Error('workshop_manifest_data_content_cannot_use_network');
  }

  return {
    type: workshopManifestType,
    schemaVersion: workshopManifestSchemaVersion,
    id,
    title,
    version,
    content: { kind, entry },
    compatibility: {
      minEchoVersion,
      ...(maxEchoVersion ? { maxEchoVersion } : {}),
      ...(typeof pluginApiVersion === 'number' ? { pluginApiVersion } : {}),
    },
    files,
    license: normalizeLicense(value.license),
    ...(dependencies.length > 0 ? { dependencies } : {}),
    ...(conflicts.length > 0 ? { conflicts } : {}),
    ...(networkHosts.length > 0 ? { networkHosts } : {}),
  };
};
