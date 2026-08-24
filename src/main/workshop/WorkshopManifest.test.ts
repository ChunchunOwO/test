import { describe, expect, it } from 'vitest';
import { normalizeWorkshopItemManifest } from './WorkshopManifest';

const checksum = 'a'.repeat(64);

const validManifest = {
  type: 'echo-workshop-item',
  schemaVersion: 1,
  id: 'Echo.Aurora-Theme',
  title: 'Aurora Theme',
  version: '1.2.0',
  content: {
    kind: 'theme',
    entry: 'theme.json',
  },
  compatibility: {
    minEchoVersion: '26.8.0',
    maxEchoVersion: '27.0.0-beta.1',
  },
  files: [{ path: 'theme.json', size: 128, sha256: checksum }],
  license: {
    id: 'CC-BY-4.0',
    holder: 'ECHO Community Author',
    sourceUrl: 'https://example.com/echo-aurora',
  },
};

describe('Workshop manifest validation', () => {
  it('normalizes a valid data-only item without granting runtime execution', () => {
    const manifest = normalizeWorkshopItemManifest(validManifest);

    expect(manifest).toMatchObject({
      id: 'echo.aurora-theme',
      content: { kind: 'theme', entry: 'theme.json' },
      compatibility: { minEchoVersion: '26.8.0', maxEchoVersion: '27.0.0-beta.1' },
      license: { id: 'CC-BY-4.0', holder: 'ECHO Community Author' },
    });
    expect(manifest.networkHosts).toBeUndefined();
  });

  it('supports sandboxed plugin packages with declared exact network hosts', () => {
    const manifest = normalizeWorkshopItemManifest({
      ...validManifest,
      id: 'echo.community-tools',
      content: { kind: 'plugin-package', entry: 'community-tools.echo' },
      compatibility: { ...validManifest.compatibility, pluginApiVersion: 2 },
      files: [{ path: 'community-tools.echo', size: 512, sha256: checksum }],
      dependencies: ['1234567890', '9876543210'],
      conflicts: ['2222222222'],
      networkHosts: ['API.Example.com', 'metadata.example.org'],
    });

    expect(manifest.networkHosts).toEqual(['api.example.com', 'metadata.example.org']);
    expect(manifest.dependencies).toEqual(['1234567890', '9876543210']);
    expect(manifest.conflicts).toEqual(['2222222222']);
  });

  it('normalizes versioned and optional dependency declarations', () => {
    const manifest = normalizeWorkshopItemManifest({
      ...validManifest,
      dependencies: [{ itemId: '1234567890', versionRange: '^2.1.0' }, { itemId: '9876543210', optional: true }],
    });
    expect(manifest.dependencies).toEqual([
      { itemId: '1234567890', versionRange: '^2.1.0' },
      { itemId: '9876543210', optional: true },
    ]);
  });

  it('requires plugin packages to declare the inner plugin API compatibility', () => {
    expect(() => normalizeWorkshopItemManifest({
      ...validManifest,
      id: 'echo.missing-plugin-api',
      content: { kind: 'plugin-package', entry: 'plugin.echo' },
      files: [{ path: 'plugin.echo', size: 2, sha256: checksum }],
    })).toThrow('workshop_manifest_plugin_api_version_invalid');
  });

  it('rejects path traversal, duplicate files, and entries missing from the integrity list', () => {
    expect(() => normalizeWorkshopItemManifest({
      ...validManifest,
      content: { kind: 'theme', entry: '../theme.json' },
    })).toThrow('workshop_manifest_entry_unsafe');

    expect(() => normalizeWorkshopItemManifest({
      ...validManifest,
      files: [
        { path: 'theme.json', size: 128, sha256: checksum },
        { path: 'THEME.json', size: 128, sha256: checksum },
      ],
    })).toThrow('workshop_manifest_files_invalid');

    expect(() => normalizeWorkshopItemManifest({
      ...validManifest,
      files: [{ path: 'preview.png', size: 128, sha256: checksum }],
    })).toThrow('workshop_manifest_entry_missing');
  });

  it('keeps data-only contributions offline and validates compatibility ranges', () => {
    expect(() => normalizeWorkshopItemManifest({
      ...validManifest,
      networkHosts: ['api.example.com'],
    })).toThrow('workshop_manifest_data_content_cannot_use_network');

    expect(() => normalizeWorkshopItemManifest({
      ...validManifest,
      compatibility: { minEchoVersion: '27.0.0', maxEchoVersion: '26.9.0' },
    })).toThrow('workshop_manifest_compatibility_range_invalid');

    expect(() => normalizeWorkshopItemManifest({
      ...validManifest,
      compatibility: { minEchoVersion: '26.8.2', maxEchoVersion: '26.8.2-beta.1' },
    })).toThrow('workshop_manifest_compatibility_range_invalid');

    expect(() => normalizeWorkshopItemManifest({
      ...validManifest,
      compatibility: { ...validManifest.compatibility, pluginApiVersion: 2 },
    })).toThrow('workshop_manifest_data_content_cannot_declare_plugin_api');
  });
});
