import { describe, expect, it } from 'vitest';
import type { WorkshopItemManifest } from '../../shared/types/workshop';
import { WorkshopCompatibilityService } from './WorkshopCompatibilityService';
import { compareEchoVersions } from './WorkshopVersion';

const checksum = 'a'.repeat(64);

const createManifest = (
  overrides: Partial<WorkshopItemManifest> = {},
): WorkshopItemManifest => ({
  type: 'echo-workshop-item',
  schemaVersion: 1,
  id: 'echo.compatibility-fixture',
  title: 'Compatibility Fixture',
  version: '1.0.0',
  content: { kind: 'theme', entry: 'theme.json' },
  compatibility: { minEchoVersion: '26.8.0', maxEchoVersion: '27.0.0' },
  files: [{ path: 'theme.json', size: 2, sha256: checksum }],
  license: { id: 'CC0-1.0', holder: 'ECHO QA' },
  ...overrides,
});

describe('WorkshopCompatibilityService', () => {
  it('compares stable and prerelease ECHO versions deterministically', () => {
    expect(compareEchoVersions('26.8.2-beta.1', '26.8.2')).toBe(-1);
    expect(compareEchoVersions('26.8.2-beta.2', '26.8.2-beta.10')).toBe(-1);
    expect(compareEchoVersions('26.8.2', '26.8.2-beta.10')).toBe(1);
    expect(compareEchoVersions('invalid', '26.8.2')).toBeNull();
  });

  it('accepts a compatible data-only item', () => {
    const service = new WorkshopCompatibilityService({ currentEchoVersion: '26.8.2-beta.1' });
    expect(service.evaluate(createManifest())).toEqual({ compatible: true, issues: [] });
  });

  it('reports ECHO range and missing dependency failures together', () => {
    const service = new WorkshopCompatibilityService({ currentEchoVersion: '26.7.9' });
    const result = service.evaluate(createManifest({ dependencies: ['123', '456'] }), new Set(['123']));

    expect(result.compatible).toBe(false);
    expect(result.issues).toEqual([
      { code: 'echo-version-too-old', subject: '26.8.0' },
      { code: 'dependency-missing', subject: '456' },
    ]);
  });

  it('supports optional dependencies, version ranges, and declared conflicts', () => {
    const service = new WorkshopCompatibilityService({ currentEchoVersion: '26.8.2' });
    const result = service.evaluate(createManifest({
      dependencies: [
        { itemId: '123', versionRange: '^2.0.0' },
        { itemId: '456', optional: true },
      ],
      conflicts: ['789'],
    }), new Map([['123', '1.9.0'], ['789', '4.0.0']]));

    expect(result.issues).toEqual([
      { code: 'dependency-version-mismatch', subject: '123' },
      { code: 'conflict-present', subject: '789' },
    ]);
  });

  it('fails closed for unsupported plugin APIs and future manifest schemas', () => {
    const service = new WorkshopCompatibilityService({
      currentEchoVersion: '26.8.2',
      supportedPluginApiVersions: [1, 2],
    });
    const futurePlugin = createManifest({
      schemaVersion: 2,
      content: { kind: 'plugin-package', entry: 'plugin.echo' },
      compatibility: { minEchoVersion: '26.8.0', pluginApiVersion: 3 },
      files: [{ path: 'plugin.echo', size: 2, sha256: checksum }],
    } as unknown as Partial<WorkshopItemManifest>);

    expect(service.evaluate(futurePlugin).issues).toEqual([
      { code: 'manifest-schema-unsupported', subject: '2' },
      { code: 'plugin-api-version-unsupported', subject: '3' },
    ]);
  });
});
