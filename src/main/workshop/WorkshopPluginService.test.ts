import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkshopItemManifest } from '../../shared/types/workshop';
import type { WorkshopRegistryRecord } from './WorkshopRegistryTypes';
import { normalizeWorkshopPluginPackage, WorkshopPluginService } from './WorkshopPluginService';

const roots: string[] = [];

const createPackage = () => {
  const root = mkdtempSync(join(tmpdir(), 'echo-workshop-plugin-'));
  roots.push(root);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'community.echo'), JSON.stringify({
    type: 'echo-plugin-package',
    version: 1,
    exportedAt: '2026-08-16T00:00:00.000Z',
    manifest: {
      id: 'echo.community-tools',
      name: 'Community Tools',
      version: '1.0.0',
      apiVersion: 2,
      entry: 'plugin.js',
      permissions: [
        'navigation',
        'playback:read',
        'playback:control',
        'playback:share',
        'audio:spectrum',
        'library:read',
        'library:control',
        'queue:read',
        'queue:control',
        'sources:provide',
        'sources:direct',
        'agent:runtime',
        'lyrics:provide',
        'fs:plugin',
      ],
      contributes: {
        commands: [{ id: 'show-status', title: 'Show status' }],
        trackContextMenus: [{
          id: 'inspect-track',
          title: 'Inspect track',
          commandId: 'show-status',
          localOnly: true,
        }],
        playerBarActions: [{
          id: 'quick-status',
          title: 'Quick status',
          commandId: 'show-status',
          icon: 'sparkles',
        }],
        panels: [{ id: 'main', title: 'Tools', path: 'panel.html' }],
        agents: [{ id: 'library-helper', title: 'Library helper', inputPlaceholder: 'Ask the library' }],
        sourceProviders: [{ id: 'community-radio', title: 'Community radio' }],
        lyricsProviders: [{ id: 'community-lyrics', title: 'Community lyrics' }],
        metadataProviders: [{ id: 'community-metadata', title: 'Community metadata' }],
        coverProviders: [{ id: 'community-covers', title: 'Community covers' }],
        themePresets: [{
          id: 'aurora-glass',
          title: 'Aurora Glass',
          description: 'A two-tone Workshop theme',
          basePreset: 'classic',
          preview: 'linear-gradient(135deg, #08111f 0%, #257f96 100%)',
          swatches: ['#08111f', '#257f96', '#f0b35b'],
          light: { appBg: '#eef8ff', panel: '#ffffff', accent: '#257f96', text: '#234150' },
          dark: { appBg: '#08111f', panel: '#142234', accent: '#5cc8dc', text: '#c8dce8' },
        }],
        settings: [
          { id: 'compact-mode', title: 'Compact mode', type: 'boolean', defaultValue: true },
          { id: 'result-count', title: 'Result count', type: 'number', defaultValue: 12, min: 1, max: 50 },
        ],
      },
    },
    files: [
      { path: 'plugin.js', content: "echo.commands.register('show-status', { title: 'Show status' }, () => null);" },
      { path: 'panel.html', content: '<!doctype html><script src="__bridge__.js"></script>' },
    ],
  }), 'utf8');
  return root;
};

const manifest = (): WorkshopItemManifest => ({
  type: 'echo-workshop-item',
  schemaVersion: 1,
  id: 'echo.community-tools',
  title: 'Community Tools',
  version: '1.0.0',
  content: { kind: 'plugin-package', entry: 'community.echo' },
  compatibility: { minEchoVersion: '26.8.0', pluginApiVersion: 2 },
  networkHosts: ['share.example'],
  files: [],
  license: { id: 'MIT', holder: 'ECHO Community' },
});

const createRecord = (directory: string): WorkshopRegistryRecord => ({
  sourceId: 'steam',
  itemId: '123',
  state: 'disabled',
  candidateRevision: {
    contentId: 'echo.community-tools',
    contentKind: 'plugin-package',
    version: '1.0.0',
    manifestSha256: 'a'.repeat(64),
    directory,
    installedAt: '2026-08-16T00:00:00.000Z',
  },
  activeRevision: null,
  lastKnownGoodRevision: null,
  approvedCapabilities: [],
  error: null,
  createdAt: '2026-08-16T00:00:00.000Z',
  updatedAt: '2026-08-16T00:00:00.000Z',
});

afterEach(() => {
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

describe('WorkshopPluginService', () => {
  it('describes a verified package and requires exact capability approval before enabling it', async () => {
    const root = createPackage();
    const record = createRecord(root);
    const registry = {
      get: vi.fn(() => record),
      getSnapshot: vi.fn(() => ({ formatVersion: 1 as const, revision: 1, records: [record] })),
      setApprovedCapabilities: vi.fn((_sourceId: string, _itemId: string, capabilities: readonly string[]) => {
        record.approvedCapabilities = [...capabilities];
        return record;
      }),
      transition: vi.fn((_sourceId: string, _itemId: string, state: 'enabled' | 'disabled') => {
        record.state = state;
        if (state === 'enabled') record.activeRevision = record.candidateRevision;
        return record;
      }),
    };
    const installer = {
      verifyRevision: vi.fn(async () => ({
        rootDirectory: root,
        manifest: manifest(),
        files: [],
        totalBytes: 0,
        manifestSha256: 'a'.repeat(64),
      })),
    };
    const service = new WorkshopPluginService(registry, installer);

    await expect(service.getSnapshot()).resolves.toMatchObject({
      plugins: [{
        pluginId: 'echo.community-tools',
        permissions: [
          'navigation',
          'playback:read',
          'playback:control',
          'playback:share',
          'audio:spectrum',
          'library:read',
          'library:control',
          'queue:read',
          'queue:control',
          'sources:provide',
          'sources:direct',
          'agent:runtime',
          'lyrics:provide',
          'fs:plugin',
        ],
        commands: [{ id: 'show-status' }],
        trackContextMenus: [{ id: 'inspect-track', commandId: 'show-status', localOnly: true }],
        playerBarActions: [{ id: 'quick-status', commandId: 'show-status', icon: 'sparkles' }],
        panels: [{ id: 'main', entryUrl: 'echo-workshop://plugin/steam/123/panel.html' }],
        agents: [{ id: 'library-helper', inputPlaceholder: 'Ask the library' }],
        sourceProviders: [{ id: 'community-radio', title: 'Community radio' }],
        lyricsProviders: [{ id: 'community-lyrics', title: 'Community lyrics' }],
        metadataProviders: [{ id: 'community-metadata', title: 'Community metadata' }],
        coverProviders: [{ id: 'community-covers', title: 'Community covers' }],
        themePresets: [{
          id: 'aurora-glass',
          title: 'Aurora Glass',
          basePreset: 'classic',
          light: { accent: '#257f96' },
          dark: { accent: '#5cc8dc' },
        }],
        settings: [
          { id: 'compact-mode', type: 'boolean', defaultValue: true },
          { id: 'result-count', type: 'number', defaultValue: 12, min: 1, max: 50 },
        ],
        networkHosts: ['share.example'],
      }],
    });
    await expect(service.enable('steam', '123', undefined)).resolves.toEqual({
      ok: false,
      reason: 'plugin-capabilities-confirmation-required',
    });
    const capabilities = [
      'navigation',
      'playback:read',
      'playback:control',
      'playback:share',
      'audio:spectrum',
      'library:read',
      'library:control',
      'queue:read',
      'queue:control',
      'sources:provide',
      'sources:direct',
      'agent:runtime',
      'lyrics:provide',
      'fs:plugin',
    ] as const;
    await expect(service.enable('steam', '123', capabilities)).resolves.toEqual({ ok: true });
    expect(registry.setApprovedCapabilities).toHaveBeenCalledWith('steam', '123', capabilities);
    expect(registry.transition).toHaveBeenCalledWith('steam', '123', 'enabled');
    await expect(service.getRuntimePolicy('steam', '123')).resolves.toEqual({
      permissions: capabilities,
      networkHosts: ['share.example'],
    });

    await expect(service.resolveAsset('steam', '123', '__bridge__.js')).resolves.toMatchObject({
      mimeType: 'text/javascript; charset=utf-8',
      body: expect.stringContaining("Object.defineProperty(globalThis, 'echo'"),
    });
    const bridge = await service.resolveAsset('steam', '123', '__bridge__.js');
    expect(bridge?.body).toContain('agents: Object.freeze');
    expect(bridge?.body).toContain('sources: Object.freeze');
    expect(bridge?.body).toContain('settings: Object.freeze');
  });

  it('rejects packages that request capabilities outside the Workshop sandbox', async () => {
    const root = createPackage();
    const packagePath = join(root, 'community.echo');
    const value = JSON.parse(readFileSync(packagePath, 'utf8')) as { manifest: { permissions: string[] } };
    value.manifest.permissions.push('network');
    writeFileSync(packagePath, JSON.stringify(value), 'utf8');
    const record = createRecord(root);
    const service = new WorkshopPluginService({
      get: () => record,
      getSnapshot: () => ({ formatVersion: 1, revision: 1, records: [record] }),
      setApprovedCapabilities: () => record,
      transition: () => record,
    }, {
      verifyRevision: async () => ({
        rootDirectory: root,
        manifest: manifest(),
        files: [],
        totalBytes: 0,
        manifestSha256: 'a'.repeat(64),
      }),
    });

    await expect(service.getSnapshot()).resolves.toMatchObject({
      plugins: [{ enabled: false, error: 'plugin-permission-unsupported' }],
    });
  });

  it('rejects track context menu contributions that do not reference a declared command', async () => {
    const root = createPackage();
    const packagePath = join(root, 'community.echo');
    const value = JSON.parse(readFileSync(packagePath, 'utf8')) as {
      manifest: { contributes: { trackContextMenus: Array<Record<string, unknown>> } };
    };
    value.manifest.contributes.trackContextMenus[0].commandId = 'missing-command';
    writeFileSync(packagePath, JSON.stringify(value), 'utf8');
    const record = createRecord(root);
    const service = new WorkshopPluginService({
      get: () => record,
      getSnapshot: () => ({ formatVersion: 1, revision: 1, records: [record] }),
      setApprovedCapabilities: () => record,
      transition: () => record,
    }, {
      verifyRevision: async () => ({
        rootDirectory: root,
        manifest: manifest(),
        files: [],
        totalBytes: 0,
        manifestSha256: 'a'.repeat(64),
      }),
    });

    await expect(service.getSnapshot()).resolves.toMatchObject({
      plugins: [{ error: 'plugin-track-context-menus-invalid' }],
    });
  });

  it('rejects player bar actions that do not reference a declared command', () => {
    const root = createPackage();
    const value = JSON.parse(readFileSync(join(root, 'community.echo'), 'utf8')) as {
      manifest: { contributes: { playerBarActions: Array<Record<string, unknown>> } };
    };
    value.manifest.contributes.playerBarActions[0].commandId = 'missing-command';

    expect(() => normalizeWorkshopPluginPackage(value)).toThrow('plugin-player-bar-actions-invalid');
    value.manifest.contributes.playerBarActions[0].commandId = 'show-status';
    value.manifest.contributes.playerBarActions[0].icon = 'untrusted-icon-url';
    expect(() => normalizeWorkshopPluginPackage(value)).toThrow('plugin-player-bar-actions-invalid');
  });

  it('rejects a Workshop theme preset that cannot be normalized losslessly', async () => {
    const root = createPackage();
    const packagePath = join(root, 'community.echo');
    const value = JSON.parse(readFileSync(packagePath, 'utf8')) as {
      manifest: { contributes: { themePresets: Array<Record<string, unknown>> } };
    };
    value.manifest.contributes.themePresets.push({
      id: 'broken-theme',
      title: 'Broken theme',
      basePreset: 'classic',
    });
    writeFileSync(packagePath, JSON.stringify(value), 'utf8');
    const record = createRecord(root);
    const service = new WorkshopPluginService({
      get: () => record,
      getSnapshot: () => ({ formatVersion: 1, revision: 1, records: [record] }),
      setApprovedCapabilities: () => record,
      transition: () => record,
    }, {
      verifyRevision: async () => ({
        rootDirectory: root,
        manifest: manifest(),
        files: [],
        totalBytes: 0,
        manifestSha256: 'a'.repeat(64),
      }),
    });

    await expect(service.getSnapshot()).resolves.toMatchObject({
      plugins: [{ error: 'plugin-theme-presets-invalid' }],
    });
  });

  it('requires a network capability when an outer Workshop manifest declares hosts', async () => {
    const root = createPackage();
    const packagePath = join(root, 'community.echo');
    const value = JSON.parse(readFileSync(packagePath, 'utf8')) as { manifest: { permissions: string[] } };
    value.manifest.permissions = value.manifest.permissions.filter((permission) => permission !== 'playback:share');
    writeFileSync(packagePath, JSON.stringify(value), 'utf8');
    const record = createRecord(root);
    const service = new WorkshopPluginService({
      get: () => record,
      getSnapshot: () => ({ formatVersion: 1, revision: 1, records: [record] }),
      setApprovedCapabilities: () => record,
      transition: () => record,
    }, {
      verifyRevision: async () => ({
        rootDirectory: root,
        manifest: manifest(),
        files: [],
        totalBytes: 0,
        manifestSha256: 'a'.repeat(64),
      }),
    });

    await expect(service.getSnapshot()).resolves.toMatchObject({
      plugins: [{ error: 'plugin-network-hosts-require-capability' }],
    });
  });

  it('accepts declared hosts for the bounded network request capability', async () => {
    const root = createPackage();
    const packagePath = join(root, 'community.echo');
    const value = JSON.parse(readFileSync(packagePath, 'utf8')) as { manifest: { permissions: string[] } };
    value.manifest.permissions = value.manifest.permissions
      .filter((permission) => permission !== 'playback:share')
      .concat('network:request');
    writeFileSync(packagePath, JSON.stringify(value), 'utf8');
    const record = createRecord(root);
    const service = new WorkshopPluginService({
      get: () => record,
      getSnapshot: () => ({ formatVersion: 1, revision: 1, records: [record] }),
      setApprovedCapabilities: () => record,
      transition: () => record,
    }, {
      verifyRevision: async () => ({
        rootDirectory: root,
        manifest: manifest(),
        files: [],
        totalBytes: 0,
        manifestSha256: 'a'.repeat(64),
      }),
    });

    await expect(service.getSnapshot()).resolves.toMatchObject({
      plugins: [{ permissions: expect.arrayContaining(['network:request']), networkHosts: ['share.example'], error: null }],
    });
  });

  it('requires sources:provide for declared Workshop source providers', async () => {
    const root = createPackage();
    const packagePath = join(root, 'community.echo');
    const value = JSON.parse(readFileSync(packagePath, 'utf8')) as { manifest: { permissions: string[] } };
    value.manifest.permissions = value.manifest.permissions.filter((permission) => permission !== 'sources:provide');
    writeFileSync(packagePath, JSON.stringify(value), 'utf8');
    const record = createRecord(root);
    const service = new WorkshopPluginService({
      get: () => record,
      getSnapshot: () => ({ formatVersion: 1, revision: 1, records: [record] }),
      setApprovedCapabilities: () => record,
      transition: () => record,
    }, {
      verifyRevision: async () => ({
        rootDirectory: root,
        manifest: manifest(),
        files: [],
        totalBytes: 0,
        manifestSha256: 'a'.repeat(64),
      }),
    });

    await expect(service.getSnapshot()).resolves.toMatchObject({
      plugins: [{ error: 'plugin-source-providers-require-capability' }],
    });
  });

  it('rejects secret settings because Workshop storage is not a credential vault', async () => {
    const root = createPackage();
    const packagePath = join(root, 'community.echo');
    const value = JSON.parse(readFileSync(packagePath, 'utf8')) as {
      manifest: { contributes: { settings: Array<Record<string, unknown>> } };
    };
    value.manifest.contributes.settings.push({ id: 'api-key', title: 'API key', type: 'secret' });
    writeFileSync(packagePath, JSON.stringify(value), 'utf8');
    const record = createRecord(root);
    const service = new WorkshopPluginService({
      get: () => record,
      getSnapshot: () => ({ formatVersion: 1, revision: 1, records: [record] }),
      setApprovedCapabilities: () => record,
      transition: () => record,
    }, {
      verifyRevision: async () => ({
        rootDirectory: root,
        manifest: manifest(),
        files: [],
        totalBytes: 0,
        manifestSha256: 'a'.repeat(64),
      }),
    });

    await expect(service.getSnapshot()).resolves.toMatchObject({
      plugins: [{ enabled: false, error: 'plugin-setting-secret-unsupported' }],
    });
  });
});
