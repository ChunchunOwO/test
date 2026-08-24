import { describe, expect, it } from 'vitest';
import type { WorkshopAuthoringValidation } from '../../shared/types/workshop';
import {
  buildWorkshopAuthoringQualityReport,
  readWorkshopAuthoringEntryField,
  readWorkshopAuthoringManifestForm,
  workshopAuthoringScenarios,
  writeWorkshopAuthoringEntryField,
  writeWorkshopAuthoringManifestForm,
} from './WorkshopAuthoringWorkbenchModel';

const manifest = {
  type: 'echo-workshop-item',
  schemaVersion: 1,
  id: 'fixture-plugin',
  title: 'Fixture Plugin',
  version: '1.0.0',
  content: { kind: 'plugin-package', entry: 'community.echo' },
  compatibility: { minEchoVersion: '26.8.15', pluginApiVersion: 2 },
  files: [{ path: 'community.echo', size: 1, sha256: 'a'.repeat(64) }],
  license: { id: 'MIT', holder: 'Fixture Author' },
};

const entry = {
  type: 'echo-plugin-package',
  version: 1,
  manifest: {
    id: 'fixture-plugin',
    name: 'Fixture Plugin',
    version: '1.0.0',
    apiVersion: 2,
    entry: 'plugin.js',
    permissions: ['playback:read'],
    contributes: {},
  },
  files: [{ path: 'plugin.js', content: '' }],
};

const valid: WorkshopAuthoringValidation = {
  ok: true,
  kind: 'plugin-package',
  id: 'fixture-plugin',
  title: 'Fixture Plugin',
  normalizedContribution: {},
  error: null,
};

describe('WorkshopAuthoringWorkbenchModel', () => {
  it('round-trips structured manifest fields without removing unknown fields', () => {
    const source = JSON.stringify({ ...manifest, extensionField: { keep: true } });
    const form = readWorkshopAuthoringManifestForm(source);
    const next = JSON.parse(writeWorkshopAuthoringManifestForm(source, {
      ...form,
      title: 'Updated Plugin',
      maxEchoVersion: '27.0.0',
      licenseSourceUrl: 'https://opensource.org/license/mit',
      dependenciesText: '1234567890 | ^1.2.0 | optional\n2234567890',
      conflictsText: '3234567890',
      networkHostsText: 'API.EXAMPLE.COM',
    })) as Record<string, unknown>;
    expect(next.extensionField).toEqual({ keep: true });
    expect(next.title).toBe('Updated Plugin');
    expect(next.dependencies).toEqual([
      { itemId: '1234567890', versionRange: '^1.2.0', optional: true },
      '2234567890',
    ]);
    expect(next.networkHosts).toEqual(['api.example.com']);
  });

  it('updates nested entry fields while retaining the rest of the package', () => {
    const nextText = writeWorkshopAuthoringEntryField(JSON.stringify(entry), 'manifest.name', 'Renamed');
    expect(readWorkshopAuthoringEntryField(nextText, 'manifest.name')).toBe('Renamed');
    expect(readWorkshopAuthoringEntryField(nextText, 'files')).toEqual(entry.files);
  });

  it('provides deterministic local fixtures including a host-owned ended status', () => {
    expect(workshopAuthoringScenarios).toHaveLength(5);
    expect(workshopAuthoringScenarios.find((scenario) => scenario.id === 'playback-ended')?.payload)
      .toMatchObject({ playbackStatus: { state: 'ended', nativeBufferedMs: 0 } });
  });

  it('blocks network permission without a declared host and warns about missing license source', () => {
    const networkEntry = JSON.stringify({
      ...entry,
      manifest: { ...entry.manifest, permissions: ['network:request'] },
    });
    const report = buildWorkshopAuthoringQualityReport('plugin-package', JSON.stringify(manifest), networkEntry, valid);
    expect(report).toContainEqual(expect.objectContaining({ code: 'network-hosts', severity: 'blocker' }));
    expect(report).toContainEqual(expect.objectContaining({ code: 'license-source', severity: 'warning' }));
  });
});

