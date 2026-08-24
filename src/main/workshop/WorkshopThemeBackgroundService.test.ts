import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WorkshopDataCatalogRecord, WorkshopThemePresetContribution } from './WorkshopDataContributionTypes';
import type { WorkshopRegistryRecord } from './WorkshopRegistryTypes';
import { WorkshopRevisionReceiptStore } from './WorkshopRevisionReceiptStore';
import {
  defaultWorkshopThemeSkinEffects,
  defaultWorkshopThemeIdentity,
  defaultWorkshopThemeSkinLayout,
  defaultWorkshopThemeSkinStages,
} from '../../shared/types/workshop';
import { WorkshopThemeBackgroundService } from './WorkshopThemeBackgroundService';

const manifestSha256 = 'c'.repeat(64);
const updatedAt = '2026-08-13T12:00:00.000Z';

const themeContribution: WorkshopThemePresetContribution = {
  type: 'echo-workshop-theme-preset',
  schemaVersion: 1,
  id: 'echo.theme-shell',
  title: 'Harbor Shell',
  basePreset: 'classic',
  dark: { accent: '#66ccff' },
  backgroundAsset: 'art/bg.png',
  skin: {
    mode: 'shell',
    layout: {
      ...defaultWorkshopThemeSkinLayout,
      sidebarPosition: 'right',
      sidebarWidth: 'wide',
      playerStyle: 'floating',
      titlebarStyle: 'immersive',
      contentDensity: 'editorial',
      cardStyle: 'glass',
      displayStyle: 'editorial',
    },
    stages: { ...defaultWorkshopThemeSkinStages },
    assets: {
      background: 'art/bg.png',
      sidebar: 'art/sidebar.png',
    },
    effects: {
      ...defaultWorkshopThemeSkinEffects,
      grainPercent: 10,
      vignettePercent: 20,
      glowPercent: 8,
      scrimPercent: 30,
    },
    identity: { ...defaultWorkshopThemeIdentity },
  },
  runtime: {
    entry: 'ui/index.html',
    capabilities: ['navigation', 'playback:read', 'playback:control'],
  },
};

const catalogRecord: WorkshopDataCatalogRecord = {
  sourceId: 'steam',
  itemId: '123',
  contentId: 'echo.theme-shell',
  contentKind: 'theme',
  version: '1.0.0',
  manifestSha256,
  entryPath: 'theme.json',
  activatedAt: updatedAt,
  contribution: themeContribution,
};

const enabledRecord: WorkshopRegistryRecord = {
  sourceId: 'steam',
  itemId: '123',
  state: 'enabled',
  candidateRevision: null,
  activeRevision: {
    contentId: catalogRecord.contentId,
    contentKind: 'theme',
    version: catalogRecord.version,
    manifestSha256,
    directory: 'C:\\workshop\\active',
    installedAt: updatedAt,
  },
  lastKnownGoodRevision: null,
  approvedCapabilities: [],
  error: null,
  createdAt: updatedAt,
  updatedAt,
};

let rootDirectory = '';

beforeEach(async () => {
  rootDirectory = await mkdtemp(join(tmpdir(), 'echo-workshop-theme-skin-'));
});

afterEach(async () => {
  await rm(rootDirectory, { recursive: true, force: true });
});

describe('Workshop theme skin selection', () => {
  it('resolves a shell skin with packaged chrome assets and no wallpaper settings', () => {
    const service = new WorkshopThemeBackgroundService({
      registry: { get: () => enabledRecord },
      catalog: { get: () => catalogRecord },
      store: new WorkshopRevisionReceiptStore(join(rootDirectory, 'active-theme-background.json')),
    });

    service.select(themeContribution, {
      sourceId: 'steam',
      itemId: '123',
      contentId: 'echo.theme-shell',
      version: '1.0.0',
      manifestSha256,
      registryUpdatedAt: updatedAt,
    });

    expect(service.getActive()).toMatchObject({
      themeId: expect.stringMatching(/^workshop:/),
      url: expect.stringContaining('echo-workshop://asset/'),
      mode: 'shell',
      layout: { sidebarPosition: 'right', playerStyle: 'floating', sidebarPresentation: 'dock' },
      stages: { home: 'standard', lyrics: 'standard' },
      assets: {
        background: expect.stringContaining('path=art%2Fbg.png'),
        sidebar: expect.stringContaining('path=art%2Fsidebar.png'),
      },
      effects: { grainPercent: 10, scrimPercent: 30, bloomPercent: 0 },
      runtime: {
        entryUrl: 'echo-workshop://ui/steam/123/ui/index.html',
        capabilities: ['navigation', 'playback:read', 'playback:control'],
      },
    });
  });

  it('maps stage rasters and extreme atmosphere onto protocol URLs', () => {
    const extremeContribution: WorkshopThemePresetContribution = {
      ...themeContribution,
      skin: {
        mode: 'shell',
        layout: {
          ...defaultWorkshopThemeSkinLayout,
          sidebarPresentation: 'overlay',
          playerStyle: 'hero',
          navStyle: 'pills',
          motion: 'cinematic',
        },
        stages: {
          home: 'cinema',
          lyrics: 'theater',
          queue: 'tickets',
          songs: 'poster',
        },
        assets: {
          home: 'art/home.png',
          lyrics: 'art/lyrics.png',
          queue: 'art/queue.png',
          nowPlaying: 'art/now.png',
          watermark: 'art/mark.png',
        },
        effects: {
          ...defaultWorkshopThemeSkinEffects,
          bloomPercent: 20,
          mistPercent: 12,
          dimChromePercent: 18,
          spotlightPercent: 40,
          frostPercent: 10,
        },
        identity: { ...defaultWorkshopThemeIdentity },
      },
    };
    const service = new WorkshopThemeBackgroundService({
      registry: { get: () => enabledRecord },
      catalog: { get: () => ({ ...catalogRecord, contribution: extremeContribution }) },
      store: new WorkshopRevisionReceiptStore(join(rootDirectory, 'active-theme-background.json')),
    });
    service.select(extremeContribution, {
      sourceId: 'steam',
      itemId: '123',
      contentId: 'echo.theme-shell',
      version: '1.0.0',
      manifestSha256,
      registryUpdatedAt: updatedAt,
    });
    expect(service.getActive()).toMatchObject({
      layout: { sidebarPresentation: 'overlay', playerStyle: 'hero' },
      stages: { home: 'cinema', lyrics: 'theater', queue: 'tickets', songs: 'poster' },
      assets: {
        home: expect.stringContaining('path=art%2Fhome.png'),
        watermark: expect.stringContaining('path=art%2Fmark.png'),
      },
      effects: { bloomPercent: 20, spotlightPercent: 40 },
    });
  });
});
