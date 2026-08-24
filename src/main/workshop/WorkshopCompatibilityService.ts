import { pluginApiVersion } from '../../shared/types/plugins';
import {
  workshopContentKinds,
  workshopManifestSchemaVersion,
  type WorkshopContentKind,
  type WorkshopItemManifest,
} from '../../shared/types/workshop';
import { compareEchoVersions, isEchoVersion } from './WorkshopVersion';

export type WorkshopCompatibilityIssue = {
  code:
    | 'current-version-invalid'
    | 'manifest-version-invalid'
    | 'echo-version-too-old'
    | 'echo-version-too-new'
    | 'manifest-schema-unsupported'
    | 'content-kind-unsupported'
    | 'plugin-api-version-missing'
    | 'plugin-api-version-unsupported'
    | 'dependency-missing'
    | 'dependency-version-mismatch'
    | 'conflict-present';
  subject?: string;
};

export type WorkshopCompatibilityResult = {
  compatible: boolean;
  issues: WorkshopCompatibilityIssue[];
};

export type WorkshopCompatibilityServiceOptions = {
  currentEchoVersion: string;
  supportedManifestSchemaVersions?: readonly number[];
  supportedContentKinds?: readonly WorkshopContentKind[];
  supportedPluginApiVersions?: readonly number[];
};

export type WorkshopAvailableDependencies = ReadonlySet<string> | ReadonlyMap<string, string>;

const dependencyId = (dependency: NonNullable<WorkshopItemManifest['dependencies']>[number]): string =>
  typeof dependency === 'string' ? dependency : dependency.itemId;

const dependencyVersionRange = (dependency: NonNullable<WorkshopItemManifest['dependencies']>[number]): string | null =>
  typeof dependency === 'string' ? null : dependency.versionRange ?? null;

export const workshopVersionSatisfies = (version: string, range: string | null): boolean => {
  if (!range || range === '*') return true;
  const operator = range.match(/^(\^|~|>=|<=|>|<)/u)?.[1] ?? '=';
  const target = operator === '=' ? range : range.slice(operator.length);
  const comparison = compareEchoVersions(version, target);
  if (comparison === null) return false;
  if (operator === '>=') return comparison >= 0;
  if (operator === '<=') return comparison <= 0;
  if (operator === '>') return comparison > 0;
  if (operator === '<') return comparison < 0;
  if (operator === '^' || operator === '~') {
    const [major, minor] = target.split('.').map(Number);
    const [actualMajor, actualMinor] = version.split('.').map(Number);
    return comparison >= 0 && actualMajor === major && (operator === '^' || actualMinor === minor);
  }
  return comparison === 0;
};

const availableVersion = (available: WorkshopAvailableDependencies, itemId: string): string | null | undefined =>
  available instanceof Map ? available.get(itemId) : available.has(itemId) ? null : undefined;

export class WorkshopCompatibilityService {
  private readonly currentEchoVersion: string;
  private readonly supportedManifestSchemaVersions: ReadonlySet<number>;
  private readonly supportedContentKinds: ReadonlySet<WorkshopContentKind>;
  private readonly supportedPluginApiVersions: ReadonlySet<number>;

  constructor(options: WorkshopCompatibilityServiceOptions) {
    this.currentEchoVersion = options.currentEchoVersion.trim();
    this.supportedManifestSchemaVersions = new Set(
      options.supportedManifestSchemaVersions ?? [workshopManifestSchemaVersion],
    );
    this.supportedContentKinds = new Set(options.supportedContentKinds ?? workshopContentKinds);
    this.supportedPluginApiVersions = new Set(
      options.supportedPluginApiVersions ?? Array.from({ length: pluginApiVersion }, (_, index) => index + 1),
    );
  }

  evaluate(
    manifest: WorkshopItemManifest,
    availableDependencies: WorkshopAvailableDependencies = new Set(),
  ): WorkshopCompatibilityResult {
    const issues: WorkshopCompatibilityIssue[] = [];
    const currentVersionValid = isEchoVersion(this.currentEchoVersion);
    if (!currentVersionValid) {
      issues.push({ code: 'current-version-invalid', subject: this.currentEchoVersion });
    }

    const minimumVersionValid = isEchoVersion(manifest.compatibility.minEchoVersion);
    if (!minimumVersionValid) {
      issues.push({ code: 'manifest-version-invalid', subject: manifest.compatibility.minEchoVersion });
    } else if (
      currentVersionValid &&
      compareEchoVersions(this.currentEchoVersion, manifest.compatibility.minEchoVersion)! < 0
    ) {
      issues.push({ code: 'echo-version-too-old', subject: manifest.compatibility.minEchoVersion });
    }

    if (manifest.compatibility.maxEchoVersion) {
      const maximumVersionValid = isEchoVersion(manifest.compatibility.maxEchoVersion);
      if (!maximumVersionValid) {
        issues.push({ code: 'manifest-version-invalid', subject: manifest.compatibility.maxEchoVersion });
      } else if (
        currentVersionValid &&
        compareEchoVersions(this.currentEchoVersion, manifest.compatibility.maxEchoVersion)! > 0
      ) {
        issues.push({ code: 'echo-version-too-new', subject: manifest.compatibility.maxEchoVersion });
      }
    }

    if (!this.supportedManifestSchemaVersions.has(manifest.schemaVersion)) {
      issues.push({ code: 'manifest-schema-unsupported', subject: String(manifest.schemaVersion) });
    }
    if (!this.supportedContentKinds.has(manifest.content.kind)) {
      issues.push({ code: 'content-kind-unsupported', subject: manifest.content.kind });
    }

    if (manifest.content.kind === 'plugin-package') {
      const requiredPluginApiVersion = manifest.compatibility.pluginApiVersion;
      if (requiredPluginApiVersion === undefined) {
        issues.push({ code: 'plugin-api-version-missing' });
      } else if (!this.supportedPluginApiVersions.has(requiredPluginApiVersion)) {
        issues.push({ code: 'plugin-api-version-unsupported', subject: String(requiredPluginApiVersion) });
      }
    }

    for (const dependency of manifest.dependencies ?? []) {
      const itemId = dependencyId(dependency);
      const installedVersion = availableVersion(availableDependencies, itemId);
      if (installedVersion === undefined) {
        if (typeof dependency === 'string' || dependency.optional !== true) {
          issues.push({ code: 'dependency-missing', subject: itemId });
        }
        continue;
      }
      if (installedVersion !== null && !workshopVersionSatisfies(installedVersion, dependencyVersionRange(dependency))) {
        issues.push({ code: 'dependency-version-mismatch', subject: itemId });
      }
    }
    for (const conflictId of manifest.conflicts ?? []) {
      if (availableVersion(availableDependencies, conflictId) !== undefined) {
        issues.push({ code: 'conflict-present', subject: conflictId });
      }
    }

    return { compatible: issues.length === 0, issues };
  }
}
