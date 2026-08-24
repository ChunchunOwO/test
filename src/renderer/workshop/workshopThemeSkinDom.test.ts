// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  defaultWorkshopThemeSkinEffects,
  defaultWorkshopThemeIdentity,
  defaultWorkshopThemeSkinLayout,
  defaultWorkshopThemeSkinStages,
  type WorkshopActiveThemeBackground,
} from '../../shared/types/workshop';
import {
  applyWorkshopThemeSkin,
  clearWorkshopThemeSkin,
  workshopThemeSkinWatermarkUrl,
} from './workshopThemeSkinDom';

const asset = (path: string): string =>
  `echo-workshop://asset/?source=steam&item=123&path=${encodeURIComponent(path)}`;

const skin: WorkshopActiveThemeBackground = {
  sourceId: 'steam',
  itemId: '123',
  contentId: 'echo.theme-shell',
  version: '1.0.0',
  themeId: 'workshop:aaaaaaaaaaaaaaaaaaaa',
  url: asset('art/bg.png'),
  mode: 'shell',
  layout: {
    ...defaultWorkshopThemeSkinLayout,
    sidebarPosition: 'right',
    sidebarPresentation: 'overlay',
    playerStyle: 'hero',
    navStyle: 'pills',
    motion: 'cinematic',
  },
  stages: {
    ...defaultWorkshopThemeSkinStages,
    home: 'cinema',
    lyrics: 'theater',
    queue: 'tickets',
    songs: 'poster',
  },
  assets: {
    background: asset('art/bg.png'),
    home: asset('art/home.png'),
    lyrics: asset('art/lyrics.png'),
    queue: asset('art/queue.png'),
    nowPlaying: asset('art/now.png'),
    watermark: asset('art/mark.png'),
  },
  effects: {
    ...defaultWorkshopThemeSkinEffects,
    bloomPercent: 18,
    mistPercent: 12,
    dimChromePercent: 20,
    spotlightPercent: 36,
    frostPercent: 8,
  },
  identity: { ...defaultWorkshopThemeIdentity },
  iconAtlas: null,
  runtime: null,
};

describe('workshopThemeSkinDom', () => {
  it('applies stage, presentation and atmosphere attributes from a protocol-only payload', () => {
    const root = document.documentElement;
    applyWorkshopThemeSkin(root, skin);

    expect(root.dataset.workshopThemeSkin).toBe('shell');
    expect(root.dataset.workshopSidebarPresentation).toBe('overlay');
    expect(root.dataset.workshopPlayer).toBe('hero');
    expect(root.dataset.workshopNav).toBe('pills');
    expect(root.dataset.workshopMotion).toBe('cinematic');
    expect(root.dataset.workshopHome).toBe('cinema');
    expect(root.dataset.workshopLyrics).toBe('theater');
    expect(root.dataset.workshopQueue).toBe('tickets');
    expect(root.dataset.workshopSongs).toBe('poster');
    expect(root.dataset.workshopThemeHomeImage).toBe('true');
    expect(root.dataset.workshopDimChrome).toBe('true');
    expect(root.style.getPropertyValue('--workshop-theme-bloom')).toBe('18');
    expect(root.style.getPropertyValue('--workshop-theme-home-image')).toContain('echo-workshop://asset/');
    expect(workshopThemeSkinWatermarkUrl(skin)).toContain('art%2Fmark.png');

    clearWorkshopThemeSkin(root);
    expect(root.dataset.workshopThemeSkin).toBeUndefined();
    expect(root.dataset.workshopHome).toBeUndefined();
    expect(root.style.getPropertyValue('--workshop-theme-bloom')).toBe('');
  });

  it('ignores non-protocol image URLs', () => {
    const root = document.createElement('html');
    applyWorkshopThemeSkin(root, {
      ...skin,
      url: 'https://example.invalid/bg.png',
      assets: { background: 'https://example.invalid/bg.png', home: 'file:///C:/secret.png' },
    });
    expect(root.dataset.workshopThemeBackground).toBeUndefined();
    expect(root.dataset.workshopThemeHomeImage).toBeUndefined();
    expect(workshopThemeSkinWatermarkUrl({
      ...skin,
      assets: { watermark: 'https://example.invalid/mark.png' },
    })).toBeNull();
  });
});
