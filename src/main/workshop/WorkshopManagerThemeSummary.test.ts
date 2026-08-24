import { describe, expect, it } from 'vitest';
import { buildWorkshopManagerThemeSummary } from './WorkshopManagerThemeSummary';
import { buildWorkshopThemeCustomId } from './workshopThemeCustomId';

describe('buildWorkshopManagerThemeSummary', () => {
  it('exposes only validated preview metadata and marks the active AppSettings theme', () => {
    const themeId = buildWorkshopThemeCustomId('steam', '123', 'echo.aurora-shell');
    const summary = buildWorkshopManagerThemeSummary({
      sourceId: 'steam',
      itemId: '123',
      contentId: 'echo.aurora-shell',
      contentKind: 'theme',
      version: '1.0.0',
      manifestSha256: 'a'.repeat(64),
      entryPath: 'theme.json',
      contribution: {
        type: 'echo-workshop-theme-preset',
        schemaVersion: 1,
        id: 'echo.aurora-shell',
        title: 'Aurora Shell',
        description: 'A complete reskin.',
        basePreset: 'classic',
        light: { accent: '#1686c9' },
        dark: { accent: '#66ccff', appBg: '#10131a' },
        skin: {
          mode: 'shell',
          layout: {
            sidebarPosition: 'right',
            sidebarPresentation: 'overlay',
            sidebarWidth: 'wide',
            playerStyle: 'hero',
            titlebarStyle: 'immersive',
            contentDensity: 'editorial',
            cardStyle: 'glass',
            displayStyle: 'editorial',
            navStyle: 'pills',
            motion: 'cinematic',
          },
          stages: { home: 'cinema', lyrics: 'theater', queue: 'tickets', songs: 'poster' },
          assets: { background: 'art/background.jpg', player: 'art/player.png' },
          effects: {
            grainPercent: 8,
            vignettePercent: 20,
            glowPercent: 16,
            scrimPercent: 36,
            bloomPercent: 12,
            mistPercent: 8,
            dimChromePercent: 10,
            spotlightPercent: 28,
            frostPercent: 6,
          },
          identity: {
            brandPresentation: 'hidden',
            showEditionBadge: false,
            showVersion: false,
          },
        },
        runtime: {
          entry: 'ui/index.html',
          capabilities: ['navigation', 'playback:control'],
        },
      },
      activatedAt: '2026-08-14T00:00:00.000Z',
    }, themeId);

    expect(summary).toMatchObject({
      themeId,
      title: 'Aurora Shell',
      colorModes: ['light', 'dark'],
      active: true,
      skin: { mode: 'shell', assetCount: 2 },
      uiRuntime: { capabilities: ['navigation', 'playback:control'] },
    });
    expect(summary?.swatches).toEqual(['#66ccff', '#10131a', '#1686c9']);
  });
});
