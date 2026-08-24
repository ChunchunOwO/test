import { describe, expect, it, vi } from 'vitest';
import type { WorkshopDownloadRequestResult, WorkshopSubscriptionCatalog } from '../../shared/types/workshop';
import type { WorkshopRegistryRecord } from './WorkshopRegistryTypes';
import { WorkshopManagerService } from './WorkshopManagerService';

const candidateRevision = {
  contentId: 'echo.manager-fixture',
  contentKind: 'theme' as const,
  version: '1.0.0',
  manifestSha256: 'a'.repeat(64),
  directory: 'C:\\private\\workshop\\installed\\fixture',
  installedAt: '2026-08-11T06:00:00.000Z',
};

const registryRecord: WorkshopRegistryRecord = {
  sourceId: 'steam',
  itemId: '123',
  state: 'disabled',
  candidateRevision,
  activeRevision: null,
  lastKnownGoodRevision: null,
  approvedCapabilities: [],
  error: null,
  createdAt: '2026-08-11T06:00:00.000Z',
  updatedAt: '2026-08-11T06:00:00.000Z',
};

const source = {
  sourceId: 'steam',
  listSubscribed: vi.fn((): WorkshopSubscriptionCatalog => ({
    available: true as const,
    items: [{
      itemId: '123',
      subscribed: true,
      installed: true,
      needsUpdate: false,
      downloading: false,
      downloadPending: false,
      locallyDisabled: false,
      install: { sizeOnDiskBytes: '4096', installedAtUnixSeconds: 1_786_400_000 },
      download: null,
      error: null,
    }],
  })),
  requestDownload: vi.fn((): WorkshopDownloadRequestResult => ({ ok: true, state: 'already-current' })),
  getInstallLocation: vi.fn(),
};

const enabledCatalogRecord = {
  sourceId: 'steam',
  itemId: '123',
  contentId: 'echo.manager-fixture',
  contentKind: 'theme' as const,
  version: '1.0.0',
  manifestSha256: 'a'.repeat(64),
  entryPath: 'theme.json',
  activatedAt: '2026-08-11T06:00:00.000Z',
  contribution: {
    type: 'echo-workshop-theme-preset' as const,
    schemaVersion: 1 as const,
    id: 'echo.manager-fixture',
    title: 'Manager Fixture',
    basePreset: 'classic' as const,
    dark: { accent: '#66ccff' },
  },
};

const createManager = (overrides: {
  ingestInstalledItem?: () => Promise<unknown>;
  enable?: () => Promise<unknown>;
  pluginEnable?: () => Promise<unknown>;
  browse?: {
    browse: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
    unsubscribe: ReturnType<typeof vi.fn>;
    openInSteam: ReturnType<typeof vi.fn>;
  };
} = {}) => {
  const ingestion = {
    ingestInstalledItem: vi.fn(overrides.ingestInstalledItem ?? (async () => ({ ok: true }))),
  };
  const activation = {
    enable: vi.fn(overrides.enable ?? (async () => ({
      ok: true,
      action: 'enabled',
      record: registryRecord,
      catalogRecord: enabledCatalogRecord,
    }))),
    disable: vi.fn(async () => ({ ok: true })),
  };
  const contributionApply = {
    apply: vi.fn(async () => ({ ok: true as const, contentKind: 'theme' as const })),
    getActiveLyricsScene: vi.fn(() => null),
    clearActiveLyricsScene: vi.fn(),
    getActiveVisualizerPreset: vi.fn(() => null),
    getActiveThemeBackground: vi.fn(() => null),
  };
  const plugins = {
    getSnapshot: vi.fn(async () => ({ plugins: [] })),
    enable: vi.fn(overrides.pluginEnable ?? (async () => ({ ok: true }))),
    disable: vi.fn(async () => ({ ok: true })),
  };
  const manager = new WorkshopManagerService({
    source: source as never,
    registry: {
      getHealth: () => ({ writable: true, error: null }),
      getSnapshot: () => ({ formatVersion: 1, revision: 4, records: [registryRecord] }),
    } as never,
    catalog: {
      getHealth: () => ({ writable: true, error: null }),
      getSnapshot: () => ({ formatVersion: 1, revision: 0, records: [] }),
    } as never,
    ingestion: ingestion as never,
    activation: activation as never,
    reconcile: {
      reconcile: vi.fn(async () => ({
        ok: true,
        startedAt: '2026-08-11T06:00:00.000Z',
        completedAt: '2026-08-11T06:00:01.000Z',
        examined: 1,
        stagedRecovered: 0,
        catalogRestored: 0,
        catalogPruned: 0,
        quarantined: 0,
        failureCodes: [],
      })),
    } as never,
    contributionApply,
    plugins: plugins as never,
    ...(overrides.browse ? { browse: overrides.browse as never } : {}),
  });
  return { manager, ingestion, activation, contributionApply, plugins };
};

describe('WorkshopManagerService', () => {
  it('merges subscription and Registry state without exposing owned install paths', () => {
    const { manager } = createManager();

    const snapshot = manager.getSnapshot();

    expect(snapshot.items[0]).toMatchObject({
      sourceId: 'steam',
      itemId: '123',
      state: 'disabled',
      contentId: 'echo.manager-fixture',
      contentKind: 'theme',
      subscription: { installed: true },
    });
    expect(JSON.stringify(snapshot)).not.toContain('private');
    expect(JSON.stringify(snapshot)).not.toContain('directory');
  });

  it('serializes mutation commands so enable cannot overtake ingestion', async () => {
    const deferred = { resolve: (): void => undefined };
    const ingestionPending = new Promise<void>((resolve) => {
      deferred.resolve = resolve;
    });
    const { manager, activation } = createManager({
      ingestInstalledItem: async () => {
        await ingestionPending;
        return { ok: true };
      },
    });

    const ingest = manager.ingest({ sourceId: 'steam', itemId: '123' });
    const enable = manager.enable({ sourceId: 'steam', itemId: '123' });
    await Promise.resolve();
    expect(activation.enable).not.toHaveBeenCalled();

    deferred.resolve();
    await expect(ingest).resolves.toMatchObject({ ok: true, action: 'ingest' });
    await expect(enable).resolves.toMatchObject({ ok: true, action: 'enable' });
    expect(activation.enable).toHaveBeenCalledWith('steam', '123');
  });

  it('routes explicit application through the contribution apply service', async () => {
    const { manager, contributionApply } = createManager();

    await expect(manager.apply({ sourceId: 'steam', itemId: '123' })).resolves.toMatchObject({
      ok: true,
      action: 'apply',
    });
    expect(contributionApply.apply).toHaveBeenCalledWith('steam', '123');
  });

  it('uses an installed data item by ingesting, enabling and applying in one command', async () => {
    const { manager, ingestion, activation, contributionApply } = createManager({
      ingestInstalledItem: async () => ({
        ok: true,
        record: { ...registryRecord, candidateRevision },
        installationCreated: false,
        resumed: false,
      }),
    });

    await expect(manager.use({ sourceId: 'steam', itemId: '123' })).resolves.toMatchObject({
      ok: true,
      action: 'use',
    });
    expect(ingestion.ingestInstalledItem).toHaveBeenCalledWith('123');
    expect(activation.enable).toHaveBeenCalledWith('steam', '123');
    expect(contributionApply.apply).toHaveBeenCalledWith('steam', '123');
  });

  it('routes a plugin package through the capability-gated sandbox activation service', async () => {
    const { manager, activation, contributionApply, plugins } = createManager({
      ingestInstalledItem: async () => ({
        ok: true,
        record: {
          ...registryRecord,
          candidateRevision: { ...candidateRevision, contentKind: 'plugin-package' as const },
        },
        installationCreated: false,
        resumed: false,
      }),
    });

    await expect(manager.use({
      sourceId: 'steam',
      itemId: '123',
      approvePluginCapabilities: ['playback:read'],
    })).resolves.toMatchObject({
      ok: true,
      action: 'use',
    });
    expect(plugins.enable).toHaveBeenCalledWith('steam', '123', ['playback:read']);
    expect(activation.enable).not.toHaveBeenCalled();
    expect(contributionApply.apply).not.toHaveBeenCalled();
  });

  it('requires an explicit second-step approval before applying a theme UI runtime', async () => {
    const runtimeCatalogRecord = {
      ...enabledCatalogRecord,
      contribution: {
        ...enabledCatalogRecord.contribution,
        runtime: { entry: 'ui/index.html', capabilities: ['navigation' as const] },
      },
    };
    const { manager, contributionApply } = createManager({
      ingestInstalledItem: async () => ({
        ok: true,
        record: { ...registryRecord, candidateRevision },
        installationCreated: false,
        resumed: false,
      }),
      enable: async () => ({
        ok: true,
        action: 'enabled',
        record: registryRecord,
        catalogRecord: runtimeCatalogRecord,
      }),
    });

    await expect(manager.use({ sourceId: 'steam', itemId: '123' })).resolves.toMatchObject({
      ok: false,
      action: 'use',
      reason: 'ui-runtime-confirmation-required',
    });
    expect(contributionApply.apply).not.toHaveBeenCalled();

    await expect(manager.use({
      sourceId: 'steam',
      itemId: '123',
      approveUiRuntime: true,
    })).resolves.toMatchObject({ ok: true, action: 'use' });
    expect(contributionApply.apply).toHaveBeenCalledWith('steam', '123');
  });

  it('starts a download instead of ingesting when the subscribed item is not installed', async () => {
    source.listSubscribed.mockReturnValueOnce({
      available: true as const,
      items: [{
        itemId: '123',
        subscribed: true,
        installed: false,
        needsUpdate: false,
        downloading: false,
        downloadPending: false,
        locallyDisabled: false,
        install: null,
        download: null,
        error: null,
      }],
    });
    source.requestDownload.mockReturnValueOnce({ ok: true as const, state: 'accepted' as const });
    const { manager, ingestion } = createManager();

    await expect(manager.use({ sourceId: 'steam', itemId: '123' })).resolves.toMatchObject({
      ok: true,
      action: 'use',
      reason: 'download-started',
    });
    expect(source.requestDownload).toHaveBeenCalledWith('123', true);
    expect(ingestion.ingestInstalledItem).not.toHaveBeenCalled();
  });

  it('auto-subscribes required Workshop dependencies before retrying use', async () => {
    const browse = {
      browse: vi.fn(),
      subscribe: vi.fn(async () => ({ ok: true as const })),
      unsubscribe: vi.fn(),
      openInSteam: vi.fn(),
    };
    const { manager } = createManager({
      browse,
      ingestInstalledItem: async () => ({
        ok: false,
        reason: 'incompatible',
        record: registryRecord,
        compatibilityIssues: [
          { code: 'dependency-missing', subject: '456' },
          { code: 'dependency-missing', subject: '789' },
        ],
      }),
    });

    await expect(manager.use({ sourceId: 'steam', itemId: '123' })).resolves.toMatchObject({
      ok: true,
      action: 'use',
      reason: 'dependency-subscriptions-started',
    });
    expect(browse.subscribe).toHaveBeenCalledWith('456');
    expect(browse.subscribe).toHaveBeenCalledWith('789');
  });
});
