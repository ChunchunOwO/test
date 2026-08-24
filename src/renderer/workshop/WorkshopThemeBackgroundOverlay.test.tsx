// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  defaultWorkshopThemeSkinEffects,
  defaultWorkshopThemeIdentity,
  defaultWorkshopThemeSkinLayout,
  defaultWorkshopThemeSkinStages,
  type WorkshopActiveThemeBackground,
} from '../../shared/types/workshop';
import { WorkshopThemeBackgroundOverlay } from './WorkshopThemeBackgroundOverlay';

const themeId = 'workshop:aaaaaaaaaaaaaaaaaaaa';
const otherThemeId = 'workshop:bbbbbbbbbbbbbbbbbbbb';
const background: WorkshopActiveThemeBackground = {
  sourceId: 'steam',
  itemId: '123',
  contentId: 'echo.theme-fixture',
  version: '1.0.0',
  themeId,
  url: 'echo-workshop://asset/?source=steam&item=123&path=art%2Fbg.png',
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
    background: 'echo-workshop://asset/?source=steam&item=123&path=art%2Fbg.png',
  },
  effects: {
    ...defaultWorkshopThemeSkinEffects,
    grainPercent: 12,
    vignettePercent: 20,
    glowPercent: 8,
    scrimPercent: 36,
  },
  identity: { ...defaultWorkshopThemeIdentity },
  iconAtlas: null,
  runtime: null,
};

const workshopApi = {
  getActiveThemeBackground: vi.fn(async () => background),
  onActiveThemeBackgroundChanged: vi.fn(() => () => undefined),
};

beforeEach(() => {
  vi.clearAllMocks();
  document.documentElement.removeAttribute('data-workshop-theme-background');
  document.documentElement.removeAttribute('data-workshop-theme-skin');
  document.documentElement.style.removeProperty('--workshop-theme-background-image');
  window.echo = {
    app: {
      getSettings: vi.fn(async () => ({ appearanceThemeCustomId: themeId })),
    },
    workshop: workshopApi,
  } as unknown as Window['echo'];
});

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-workshop-theme-background');
  document.documentElement.removeAttribute('data-workshop-theme-skin');
  document.documentElement.style.removeProperty('--workshop-theme-background-image');
  window.echo = undefined as unknown as Window['echo'];
});

describe('WorkshopThemeBackgroundOverlay', () => {
  it('shows the packaged background only for the matching workshop theme id', async () => {
    const { rerender } = render(<WorkshopThemeBackgroundOverlay />);

    await waitFor(() => {
      expect(document.documentElement.dataset.workshopThemeBackground).toBe('true');
    });
    expect(document.documentElement.style.getPropertyValue('--workshop-theme-background-image'))
      .toContain('echo-workshop://asset/');
    expect(document.documentElement.dataset.workshopThemeSkin).toBe('shell');
    expect(document.documentElement.dataset.workshopSidebar).toBe('right');
    expect(document.documentElement.dataset.workshopSidebarPresentation).toBe('dock');
    expect(document.documentElement.dataset.workshopPlayer).toBe('floating');
    expect(document.documentElement.dataset.workshopHome).toBe('standard');
    expect(document.querySelector('.workshop-theme-skin-layer--mist')).toBeTruthy();

    window.echo = {
      ...window.echo,
      app: {
        getSettings: vi.fn(async () => ({ appearanceThemeCustomId: otherThemeId })),
      },
    } as unknown as Window['echo'];
    window.dispatchEvent(new CustomEvent('settings:changed', {
      detail: { appearanceThemeCustomId: otherThemeId },
    }));
    rerender(<WorkshopThemeBackgroundOverlay />);

    await waitFor(() => {
      expect(document.documentElement.dataset.workshopThemeBackground).toBeUndefined();
      expect(document.documentElement.dataset.workshopThemeSkin).toBeUndefined();
      expect(document.querySelector('.workshop-theme-skin-layer--mist')).toBeNull();
    });
  });

  it('keeps theme layout but omits full-screen effect layers in low spec mode', async () => {
    window.echo = {
      ...window.echo,
      app: {
        getSettings: vi.fn(async () => ({
          appearanceThemeCustomId: themeId,
          lowSpecModeEnabled: true,
        })),
      },
    } as unknown as Window['echo'];

    render(<WorkshopThemeBackgroundOverlay />);

    await waitFor(() => {
      expect(document.documentElement.dataset.workshopThemeBackground).toBe('true');
      expect(document.documentElement.dataset.workshopThemeSkin).toBe('shell');
      expect(document.querySelector('.workshop-theme-background-overlay')).toBeNull();
      expect(document.querySelector('.workshop-theme-skin-overlay')).toBeNull();
    });
  });
});
