import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings } from '../../shared/types/appSettings';
import type { EqPreset, EqState } from '../../shared/types/eq';
import {
  createWorkshopLyricsStyleApplyAdapter,
  createWorkshopThemeApplyAdapter,
  type WorkshopAppSettingsPort,
} from './WorkshopAppSettingsApplyAdapters';
import { WorkshopContributionApplyService } from './WorkshopContributionApplyService';
import { createWorkshopDspPresetApplyAdapter } from './WorkshopDspPresetApplyAdapter';
import type { WorkshopDataCatalogRecord } from './WorkshopDataContributionTypes';
import type { WorkshopRegistryRecord } from './WorkshopRegistryTypes';
import { buildWorkshopThemeCustomId } from './workshopThemeCustomId';

const manifestSha256 = 'a'.repeat(64);

const themeRecord: WorkshopDataCatalogRecord = {
  sourceId: 'steam',
  itemId: '123',
  contentId: 'echo.theme-fixture',
  contentKind: 'theme',
  version: '1.0.0',
  manifestSha256,
  entryPath: 'theme.json',
  activatedAt: '2026-08-12T00:00:00.000Z',
  contribution: {
    type: 'echo-workshop-theme-preset',
    schemaVersion: 1,
    id: 'theme-fixture',
    title: 'Workshop Fixture',
    basePreset: 'classic',
    dark: { accent: '#ff3366' },
  },
};

const enabledRegistryRecord: WorkshopRegistryRecord = {
  sourceId: 'steam',
  itemId: '123',
  state: 'enabled',
  candidateRevision: null,
  activeRevision: {
    contentId: themeRecord.contentId,
    contentKind: themeRecord.contentKind,
    version: themeRecord.version,
    manifestSha256,
    directory: 'C:\\private\\active',
    installedAt: '2026-08-12T00:00:00.000Z',
  },
  lastKnownGoodRevision: null,
  approvedCapabilities: [],
  error: null,
  createdAt: '2026-08-12T00:00:00.000Z',
  updatedAt: '2026-08-12T00:00:00.000Z',
};

const createSettingsPort = (): WorkshopAppSettingsPort & { applySettings: ReturnType<typeof vi.fn> } => {
  let current = {
    appearanceTheme: 'dark',
    appearanceThemePreset: 'classic',
    appearanceCustomThemes: [],
    appearanceThemeCustomId: null,
  } as unknown as AppSettings;
  const applySettings = vi.fn(async (patch: Partial<AppSettings>) => {
    current = { ...current, ...patch };
    return current;
  });
  return {
    getSettings: () => current,
    applySettings,
  };
};

describe('Workshop contribution application', () => {
  const lyricsScenes = {
    getActive: () => null,
    clear: vi.fn(),
    getSelection: () => null,
    select: vi.fn(),
    restore: vi.fn(),
  };
  const themeBackgrounds = {
    getActive: () => null,
    getSelection: () => null,
    select: vi.fn(),
    restore: vi.fn(),
  };
  const visualizerPresets = {
    getActive: () => null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuses catalog data unless the matching Registry revision is enabled', async () => {
    const adapter = { contentKind: 'theme' as const, apply: vi.fn(async () => undefined) };
    const service = new WorkshopContributionApplyService({
      registry: { get: () => ({ ...enabledRegistryRecord, state: 'disabled', activeRevision: null }) },
      catalog: { get: () => themeRecord },
      adapters: [adapter],
      lyricsScenes,
      visualizerPresets,
      themeBackgrounds,
    });

    await expect(service.apply('steam', '123')).resolves.toEqual({
      ok: false,
      reason: 'content-not-enabled',
    });
    expect(adapter.apply).not.toHaveBeenCalled();
  });

  it('rejects a catalog revision that no longer matches Registry truth', async () => {
    const service = new WorkshopContributionApplyService({
      registry: { get: () => enabledRegistryRecord },
      catalog: { get: () => ({ ...themeRecord, version: '2.0.0' }) },
      adapters: [],
      lyricsScenes,
      visualizerPresets,
      themeBackgrounds,
    });

    await expect(service.apply('steam', '123')).resolves.toEqual({
      ok: false,
      reason: 'catalog-revision-mismatch',
    });
  });

  it('installs a Workshop theme as an isolated custom theme and selects it', async () => {
    const settings = createSettingsPort();
    const adapter = createWorkshopThemeApplyAdapter(
      settings,
      themeBackgrounds,
      () => new Date('2026-08-12T01:02:03.000Z'),
    );

    await adapter.apply(themeRecord.contribution, {
      sourceId: themeRecord.sourceId,
      itemId: themeRecord.itemId,
      contentId: themeRecord.contentId,
      version: themeRecord.version,
      manifestSha256,
      registryUpdatedAt: enabledRegistryRecord.updatedAt,
    });

    expect(settings.applySettings).toHaveBeenCalledWith(expect.objectContaining({
      appearanceThemePreset: 'classic',
      appearanceThemeCustomId: buildWorkshopThemeCustomId('steam', '123', 'echo.theme-fixture'),
      appearanceCustomThemes: [expect.objectContaining({
        name: 'Workshop Fixture',
        dark: { accent: '#ff3366' },
        createdAt: '2026-08-12T01:02:03.000Z',
      })],
    }));
  });

  it('applies only the validated lyrics settings contribution', async () => {
    const settings = createSettingsPort();
    const adapter = createWorkshopLyricsStyleApplyAdapter(settings, lyricsScenes);
    const contribution = {
      type: 'echo-workshop-lyrics-style' as const,
      schemaVersion: 1 as const,
      id: 'lyrics-fixture',
      title: 'Lyrics Fixture',
      settings: { lyricsPageStyle: 'editorial' as const, lyricsFontSizePx: 58 },
    };

    await adapter.apply(contribution, {
      sourceId: 'steam',
      itemId: '456',
      contentId: 'echo.lyrics-fixture',
      version: '1.0.0',
      manifestSha256,
      registryUpdatedAt: enabledRegistryRecord.updatedAt,
    });

    expect(settings.applySettings).toHaveBeenCalledWith({
      lyricsPageStyle: 'editorial',
      lyricsFontSizePx: 58,
    });
    expect(lyricsScenes.select).toHaveBeenCalledWith(contribution, expect.objectContaining({
      contentId: 'echo.lyrics-fixture',
      registryUpdatedAt: enabledRegistryRecord.updatedAt,
    }));
  });

  it('rolls lyrics settings back when the scene receipt cannot be persisted', async () => {
    const settings = createSettingsPort();
    const brokenScenes = {
      getSelection: () => null,
      select: vi.fn(() => { throw new Error('disk-unavailable'); }),
      restore: vi.fn(),
    };
    const adapter = createWorkshopLyricsStyleApplyAdapter(settings, brokenScenes);

    await expect(adapter.apply({
      type: 'echo-workshop-lyrics-style',
      schemaVersion: 1,
      id: 'lyrics-rebuild',
      title: 'Lyrics Rebuild',
      settings: { lyricsFontSizePx: 60 },
      scene: {
        schemaVersion: 1,
        background: 'theme',
        root: { id: 'root', type: 'group', children: [] },
      },
    }, {
      sourceId: 'steam',
      itemId: '456',
      contentId: 'echo.lyrics-rebuild',
      version: '1.0.0',
      manifestSha256,
      registryUpdatedAt: enabledRegistryRecord.updatedAt,
    })).rejects.toMatchObject({ reason: 'lyrics-scene-state-unavailable' });

    expect(settings.applySettings).toHaveBeenNthCalledWith(1, { lyricsFontSizePx: 60 });
    expect(settings.applySettings).toHaveBeenNthCalledWith(2, { lyricsFontSizePx: undefined });
    expect(brokenScenes.restore).toHaveBeenCalledWith(null);
  });

  it('waits for DSP confirmation and rolls back a newly saved preset on failure', async () => {
    const presets: EqPreset[] = [];
    const state = { presetId: 'flat', presetName: 'Flat' } as EqState;
    const bridge = {
      getState: vi.fn(() => state),
      listPresets: vi.fn(() => [...presets]),
      savePreset: vi.fn((request) => {
        const preset = { ...request, id: request.id!, readonly: false } as EqPreset;
        presets.push(preset);
        return preset;
      }),
      deletePreset: vi.fn((presetId: string) => {
        const index = presets.findIndex((preset) => preset.id === presetId);
        if (index >= 0) presets.splice(index, 1);
        return [...presets];
      }),
      setPreset: vi.fn(async () => { throw new Error('native-failed'); }),
    };
    const adapter = createWorkshopDspPresetApplyAdapter(() => bridge);
    const contribution = {
      type: 'echo-workshop-dsp-preset' as const,
      schemaVersion: 1 as const,
      id: 'dsp-fixture',
      title: 'DSP Fixture',
      preampDb: -2,
      bands: [],
    };

    await expect(adapter.apply(contribution, {
      sourceId: 'steam',
      itemId: '789',
      contentId: 'echo.dsp-fixture',
      version: '1.0.0',
      manifestSha256,
      registryUpdatedAt: enabledRegistryRecord.updatedAt,
    })).rejects.toThrow('native-failed');
    expect(bridge.deletePreset).toHaveBeenCalledWith('workshop-dsp-fixture');
    expect(presets).toEqual([]);
  });
});
