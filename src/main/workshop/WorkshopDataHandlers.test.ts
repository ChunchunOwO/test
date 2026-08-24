import { describe, expect, it } from 'vitest';
import { eqFrequenciesHz } from '../../shared/types/eq';
import { createWorkshopDataHandlerRegistry } from './WorkshopDataHandlers';
import { toWorkshopEqSavePresetRequest } from './WorkshopDataContributionTypes';

const handlers = createWorkshopDataHandlerRegistry();

describe('Workshop data content handlers', () => {
  it('normalizes a declarative theme without allowing Pro base presets', () => {
    expect(handlers.normalize('theme', {
      type: 'echo-workshop-theme-preset',
      schemaVersion: 1,
      id: 'echo.theme-fixture',
      title: 'Aurora Glass',
      basePreset: 'classic',
      light: { accent: '#66CCFF', panelOpacityPercent: 80 },
      dark: { appBg: '#10131a', motionEnabled: false },
      swatches: ['#66ccff', '#10131a'],
    }, 'echo.theme-fixture')).toMatchObject({
      type: 'echo-workshop-theme-preset',
      id: 'echo.theme-fixture',
      light: { accent: '#66ccff', panelOpacityPercent: 80 },
    });

    expect(() => handlers.normalize('theme', {
      type: 'echo-workshop-theme-preset',
      schemaVersion: 1,
      id: 'echo.theme-fixture',
      title: 'Unlock Attempt',
      basePreset: 'FINAL',
      dark: { accent: '#ffffff' },
    }, 'echo.theme-fixture')).toThrow('workshop_data_theme_base_preset_forbidden');
  });

  it('accepts packaged raster theme backgrounds and rejects SVG or remote paths', () => {
    expect(handlers.normalize('theme', {
      type: 'echo-workshop-theme-preset',
      schemaVersion: 1,
      id: 'echo.theme-fixture',
      title: 'Aurora Glass',
      basePreset: 'classic',
      dark: { accent: '#66ccff' },
      backgroundAsset: 'art/panel.png',
    }, 'echo.theme-fixture')).toMatchObject({
      backgroundAsset: 'art/panel.png',
      skin: {
        mode: 'chrome',
        assets: { background: 'art/panel.png' },
      },
    });

    expect(() => handlers.normalize('theme', {
      type: 'echo-workshop-theme-preset',
      schemaVersion: 1,
      id: 'echo.theme-fixture',
      title: 'Aurora Glass',
      basePreset: 'classic',
      dark: { accent: '#66ccff' },
      backgroundAsset: 'art/panel.svg',
    }, 'echo.theme-fixture')).toThrow('workshop_data_theme_background_asset_invalid');
  });

  it('normalizes a shell skin that can restyle chrome without raw CSS', () => {
    expect(handlers.normalize('theme', {
      type: 'echo-workshop-theme-preset',
      schemaVersion: 1,
      id: 'echo.theme-fixture',
      title: 'Harbor Shell',
      basePreset: 'classic',
      dark: { accent: '#66ccff' },
      skin: {
        mode: 'shell',
        layout: {
          sidebarPosition: 'right',
          sidebarWidth: 'wide',
          playerStyle: 'floating',
          titlebarStyle: 'immersive',
          contentDensity: 'editorial',
          cardStyle: 'glass',
          displayStyle: 'editorial',
        },
        assets: {
          background: 'art/bg.png',
          sidebar: 'art/sidebar.png',
        },
        effects: {
          grainPercent: 12,
          vignettePercent: 28,
          glowPercent: 18,
          scrimPercent: 36,
        },
      },
    }, 'echo.theme-fixture')).toMatchObject({
      backgroundAsset: 'art/bg.png',
      skin: {
        mode: 'shell',
        layout: {
          sidebarPosition: 'right',
          playerStyle: 'floating',
          titlebarStyle: 'immersive',
        },
        assets: { background: 'art/bg.png', sidebar: 'art/sidebar.png' },
        effects: { grainPercent: 12, vignettePercent: 28 },
      },
    });

    expect(() => handlers.normalize('theme', {
      type: 'echo-workshop-theme-preset',
      schemaVersion: 1,
      id: 'echo.theme-fixture',
      title: 'Unsafe CSS',
      basePreset: 'classic',
      dark: { accent: '#66ccff' },
      skin: { css: 'body { display:none }' },
    }, 'echo.theme-fixture')).toThrow('workshop_data_theme_skin_unknown_field');
  });

  it('accepts a packaged full UI runtime with explicit capabilities', () => {
    expect(handlers.normalize('theme', {
      type: 'echo-workshop-theme-preset',
      schemaVersion: 1,
      id: 'echo.theme-fixture',
      title: 'Independent UI',
      basePreset: 'classic',
      dark: { accent: '#66ccff' },
      runtime: {
        entry: 'ui/index.html',
        capabilities: ['navigation', 'playback:read', 'playback:control', 'window:control'],
      },
    }, 'echo.theme-fixture')).toMatchObject({
      runtime: {
        entry: 'ui/index.html',
        capabilities: ['navigation', 'playback:read', 'playback:control', 'window:control'],
      },
    });

    expect(() => handlers.normalize('theme', {
      type: 'echo-workshop-theme-preset',
      schemaVersion: 1,
      id: 'echo.theme-fixture',
      title: 'Unsafe entry',
      basePreset: 'classic',
      dark: { accent: '#66ccff' },
      runtime: { entry: 'ui/app.js', capabilities: [] },
    }, 'echo.theme-fixture')).toThrow('workshop_data_theme_runtime_entry_invalid');

    expect(() => handlers.normalize('theme', {
      type: 'echo-workshop-theme-preset',
      schemaVersion: 1,
      id: 'echo.theme-fixture',
      title: 'Unknown authority',
      basePreset: 'classic',
      dark: { accent: '#66ccff' },
      runtime: { entry: 'ui/index.html', capabilities: ['filesystem'] },
    }, 'echo.theme-fixture')).toThrow('workshop_data_theme_runtime_capabilities_invalid');
  });

  it('normalizes extreme stage skins and still rejects raw CSS or out-of-range atmosphere', () => {
    expect(handlers.normalize('theme', {
      type: 'echo-workshop-theme-preset',
      schemaVersion: 1,
      id: 'echo.theme-fixture',
      title: 'Cinema Shell',
      basePreset: 'classic',
      dark: { accent: '#66ccff' },
      skin: {
        mode: 'shell',
        layout: {
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
          watermark: 'art/mark.png',
        },
        effects: {
          bloomPercent: 20,
          mistPercent: 12,
          dimChromePercent: 18,
          spotlightPercent: 40,
          frostPercent: 10,
        },
      },
    }, 'echo.theme-fixture')).toMatchObject({
      skin: {
        mode: 'shell',
        layout: {
          sidebarPresentation: 'overlay',
          playerStyle: 'hero',
          navStyle: 'pills',
          motion: 'cinematic',
        },
        stages: { home: 'cinema', lyrics: 'theater', queue: 'tickets', songs: 'poster' },
        assets: { home: 'art/home.png', watermark: 'art/mark.png' },
        effects: { bloomPercent: 20, spotlightPercent: 40, grainPercent: 0 },
      },
    });

    expect(() => handlers.normalize('theme', {
      type: 'echo-workshop-theme-preset',
      schemaVersion: 1,
      id: 'echo.theme-fixture',
      title: 'Unsafe stage CSS',
      basePreset: 'classic',
      dark: { accent: '#66ccff' },
      skin: { stages: { home: 'cinema', css: '.x{}' } },
    }, 'echo.theme-fixture')).toThrow('workshop_data_theme_skin_stages_unknown_field');

    expect(() => handlers.normalize('theme', {
      type: 'echo-workshop-theme-preset',
      schemaVersion: 1,
      id: 'echo.theme-fixture',
      title: 'Overbloom',
      basePreset: 'classic',
      dark: { accent: '#66ccff' },
      skin: { effects: { bloomPercent: 99 } },
    }, 'echo.theme-fixture')).toThrow('workshop_data_theme_skin_bloomPercent_invalid');
  });

  it('normalizes a bounded lyrics style and rejects filesystem-oriented settings', () => {
    expect(handlers.normalize('lyrics-style', {
      type: 'echo-workshop-lyrics-style',
      schemaVersion: 1,
      id: 'echo.lyrics-fixture',
      title: 'Readable Stage',
      settings: {
        lyricsPageStyle: 'cinemaStage',
        lyricsFontSizePx: 42,
        lyricsBackgroundMode: 'coverColor',
        lyricsSmartReadableColorsEnabled: true,
      },
    }, 'echo.lyrics-fixture')).toMatchObject({
      settings: { lyricsPageStyle: 'cinemaStage', lyricsFontSizePx: 42 },
    });

    expect(() => handlers.normalize('lyrics-style', {
      type: 'echo-workshop-lyrics-style',
      schemaVersion: 1,
      id: 'echo.lyrics-fixture',
      title: 'Unsafe Wallpaper',
      settings: { lyricsCustomWallpaperPath: 'C:\\private.png' },
    }, 'echo.lyrics-fixture')).toThrow('workshop_data_lyrics_settings_unknown_field');
  });

  it('normalizes a complete declarative lyrics scene and blocks executable CSS', () => {
    const contribution = handlers.normalize('lyrics-style', {
      type: 'echo-workshop-lyrics-style',
      schemaVersion: 1,
      id: 'echo.lyrics-scene',
      title: 'Editorial Rebuild',
      scene: {
        schemaVersion: 1,
        background: 'cover-blur',
        root: {
          id: 'stage',
          type: 'group',
          style: {
            display: 'grid',
            gridTemplateColumns: 'minmax(240px, 0.8fr) minmax(0, 1.2fr)',
            gap: 'clamp(24px, 4vw, 72px)',
            padding: '32px 5vw',
            boxSizing: 'border-box',
            backgroundImage: 'linear-gradient(135deg, $panel, transparent)',
          },
          responsive: {
            compact: { gridTemplateColumns: '1fr', padding: '20px' },
          },
          children: [
            {
              id: 'art',
              type: 'slot',
              slot: 'cover',
              style: {
                width: '100%',
                aspectRatio: '1 / 1',
                borderRadius: '24px 0',
                clipPath: 'polygon(0 0, 100% 0, 92% 100%, 0 100%)',
              },
            },
            {
              id: 'copy',
              type: 'group',
              style: { display: 'flex', flexDirection: 'column', gap: '18px' },
              children: [
                {
                  id: 'headline',
                  type: 'slot',
                  slot: 'title',
                  style: { fontFamily: "'思源黑体', sans-serif", fontSize: 'clamp(32px, 6vw, 96px)' },
                  motion: { preset: 'slide-up', durationMs: 720, intensity: 0.8 },
                },
                {
                  id: 'full-lyrics',
                  type: 'slot',
                  slot: 'lyrics',
                  options: { showTranslation: true, wordHighlightEnabled: true },
                },
                {
                  id: 'spectrum',
                  type: 'slot',
                  slot: 'spectrum',
                  options: {
                    spectrumBars: 128,
                    spectrumGain: 2.2,
                    spectrumScale: 'perceptual',
                    spectrumAttackMs: 110,
                    spectrumReleaseMs: 240,
                  },
                },
              ],
            },
          ],
        },
      },
    }, 'echo.lyrics-scene');

    expect(contribution).toMatchObject({
      type: 'echo-workshop-lyrics-style',
      scene: {
        background: 'cover-blur',
        root: {
          id: 'stage',
          children: [
            { id: 'art', slot: 'cover' },
            {
              id: 'copy',
              children: [
                { id: 'headline', slot: 'title' },
                { id: 'full-lyrics', slot: 'lyrics' },
                {
                  id: 'spectrum',
                  slot: 'spectrum',
                  options: {
                    spectrumBars: 128,
                    spectrumGain: 2.2,
                    spectrumScale: 'perceptual',
                    spectrumAttackMs: 110,
                    spectrumReleaseMs: 240,
                  },
                },
              ],
            },
          ],
        },
      },
    });

    expect(() => handlers.normalize('lyrics-style', {
      type: 'echo-workshop-lyrics-style',
      schemaVersion: 1,
      id: 'echo.lyrics-unsafe',
      title: 'Remote Injection',
      scene: {
        schemaVersion: 1,
        background: 'theme',
        root: {
          id: 'stage',
          type: 'group',
          style: { background: 'url(https://example.com/tracker.png)' },
          children: [],
        },
      },
    }, 'echo.lyrics-unsafe')).toThrow('workshop_data_lyrics_scene_style_background_invalid');
  });

  it('only lets a lyrics scene replace the host mini player when it declares a play control', () => {
    const buildTransportScene = (transportSlot: string) => ({
      type: 'echo-workshop-lyrics-style',
      schemaVersion: 1,
      id: 'echo.lyrics-transport',
      title: 'Transport Scene',
      scene: {
        schemaVersion: 1,
        background: 'theme',
        hostChrome: { miniPlayer: 'hidden' },
        root: {
          id: 'stage',
          type: 'group',
          children: [{ id: 'control', type: 'slot', slot: transportSlot }],
        },
      },
    });

    expect(handlers.normalize('lyrics-style', buildTransportScene('play-toggle'), 'echo.lyrics-transport'))
      .toMatchObject({ scene: { hostChrome: { miniPlayer: 'hidden' } } });

    expect(() => handlers.normalize('lyrics-style', buildTransportScene('seek-bar'), 'echo.lyrics-transport'))
      .toThrow('workshop_data_lyrics_scene_host_chrome_mini_player_requires_play_toggle');
  });

  it('normalizes packaged lyrics scene images and rejects SVG or url() assets', () => {
    expect(handlers.normalize('lyrics-style', {
      type: 'echo-workshop-lyrics-style',
      schemaVersion: 1,
      id: 'echo.lyrics-art',
      title: 'Art Scene',
      scene: {
        schemaVersion: 1,
        background: 'asset',
        backgroundAsset: 'art/panel.webp',
        root: {
          id: 'stage',
          type: 'group',
          children: [
            { id: 'badge', type: 'image', asset: 'art/badge.png' },
          ],
        },
      },
    }, 'echo.lyrics-art')).toMatchObject({
      scene: {
        background: 'asset',
        backgroundAsset: 'art/panel.webp',
        root: { children: [{ id: 'badge', type: 'image', asset: 'art/badge.png' }] },
      },
    });

    expect(() => handlers.normalize('lyrics-style', {
      type: 'echo-workshop-lyrics-style',
      schemaVersion: 1,
      id: 'echo.lyrics-art',
      title: 'Art Scene',
      scene: {
        schemaVersion: 1,
        background: 'theme',
        root: {
          id: 'stage',
          type: 'group',
          children: [{ id: 'badge', type: 'image', asset: 'https://example.com/x.png' }],
        },
      },
    }, 'echo.lyrics-art')).toThrow('workshop_manifest_lyrics_scene_image_asset_unsafe');
  });

  it('normalizes renderer-only visualizer parameters', () => {
    expect(handlers.normalize('visualizer-preset', {
      type: 'echo-workshop-visualizer-preset',
      schemaVersion: 1,
      id: 'echo.visualizer-fixture',
      title: 'Mint Spectrum',
      style: 'bars',
      palette: ['#66ccff', '#99ffcc'],
      barCount: 48,
      smoothing: 0.75,
      sensitivity: 1.2,
      decay: 0.4,
      mirror: true,
    }, 'echo.visualizer-fixture')).toMatchObject({
      style: 'bars',
      barCount: 48,
      mirror: true,
    });
  });

  it('normalizes a 32-band DSP preset without applying it to Audio Core', () => {
    const contribution = handlers.normalize('dsp-preset', {
      type: 'echo-workshop-dsp-preset',
      schemaVersion: 1,
      id: 'echo.dsp-fixture',
      title: 'Safe Headroom',
      preampDb: -6,
      bands: eqFrequenciesHz.map((frequencyHz) => ({
        frequencyHz,
        gainDb: 0,
        q: 1,
      })),
    }, 'echo.dsp-fixture');

    expect(contribution).toMatchObject({
      type: 'echo-workshop-dsp-preset',
      preampDb: -6,
    });
    if (contribution.type !== 'echo-workshop-dsp-preset') {
      throw new Error('expected a DSP preset contribution');
    }

    expect(contribution.bands[0]).toMatchObject({
      frequencyHz: 20,
      gainDb: 0,
      filterType: 'peaking',
      enabled: true,
    });
    expect(toWorkshopEqSavePresetRequest(contribution)).toMatchObject({
      id: 'workshop-echo-dsp-fixture',
      name: 'Safe Headroom',
    });
  });

  it('cross-checks the inner entry id with the outer Workshop manifest id', () => {
    expect(() => handlers.normalize('visualizer-preset', {
      type: 'echo-workshop-visualizer-preset',
      schemaVersion: 1,
      id: 'echo.someone-else',
      title: 'Mismatch',
      style: 'wave',
      palette: ['#66ccff'],
      barCount: 32,
      smoothing: 0.5,
      sensitivity: 1,
      decay: 0.5,
      mirror: false,
    }, 'echo.expected')).toThrow('workshop_data_id_mismatch');
  });
});
