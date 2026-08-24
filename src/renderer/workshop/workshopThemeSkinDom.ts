import {
  defaultWorkshopThemeIdentity,
  workshopThemeIconKeys,
  type WorkshopActiveThemeBackground,
  type WorkshopThemeIconKey,
} from '../../shared/types/workshop';
import { isWorkshopAssetProtocolUrl } from './workshopAssetUrl';

const workshopThemeIconCssToken = (key: WorkshopThemeIconKey): string => key.replaceAll('-', '_');

const workshopThemeIconPositionStyleKeys = workshopThemeIconKeys.flatMap((key) => {
  const token = workshopThemeIconCssToken(key);
  return [`--workshop-theme-icon-${token}-x`, `--workshop-theme-icon-${token}-y`];
});

export const workshopThemeSkinStyleKeys = [
  '--workshop-theme-background-image',
  '--workshop-theme-titlebar-image',
  '--workshop-theme-sidebar-image',
  '--workshop-theme-player-image',
  '--workshop-theme-page-image',
  '--workshop-theme-home-image',
  '--workshop-theme-lyrics-image',
  '--workshop-theme-queue-image',
  '--workshop-theme-now-playing-image',
  '--workshop-theme-grain',
  '--workshop-theme-vignette',
  '--workshop-theme-glow',
  '--workshop-theme-scrim',
  '--workshop-theme-bloom',
  '--workshop-theme-mist',
  '--workshop-theme-dim-chrome',
  '--workshop-theme-spotlight',
  '--workshop-theme-frost',
  '--workshop-theme-brand-image',
  '--workshop-theme-icon-atlas-image',
  '--workshop-theme-icon-atlas-columns',
  '--workshop-theme-icon-atlas-rows',
  ...workshopThemeIconPositionStyleKeys,
] as const;

export const workshopThemeSkinDataKeys = [
  'workshopThemeBackground',
  'workshopThemeSkin',
  'workshopSidebar',
  'workshopSidebarPresentation',
  'workshopSidebarWidth',
  'workshopPlayer',
  'workshopTitlebar',
  'workshopDensity',
  'workshopCards',
  'workshopDisplay',
  'workshopNav',
  'workshopMotion',
  'workshopHome',
  'workshopLyrics',
  'workshopQueue',
  'workshopSongs',
  'workshopThemeTitlebar',
  'workshopThemeSidebarImage',
  'workshopThemePlayerImage',
  'workshopThemeHomeImage',
  'workshopThemeLyricsImage',
  'workshopThemeQueueImage',
  'workshopThemeNowPlayingImage',
  'workshopDimChrome',
  'workshopBrand',
  'workshopShowEditionBadge',
  'workshopShowVersion',
  'workshopIconAtlas',
  'workshopIconMap',
] as const;

type ImageSlot = {
  url: string | undefined;
  cssVar: string;
  dataKey?: (typeof workshopThemeSkinDataKeys)[number];
};

const protocolUrl = (value: string | undefined): string | null =>
  isWorkshopAssetProtocolUrl(value) ? value : null;

const cssImage = (value: string): string => `url("${value}")`;

const assignProtocolImage = (root: HTMLElement, slot: ImageSlot): void => {
  const safe = protocolUrl(slot.url);
  if (!safe) {
    return;
  }
  root.style.setProperty(slot.cssVar, cssImage(safe));
  if (slot.dataKey) {
    root.dataset[slot.dataKey] = 'true';
  }
};

export const clearWorkshopThemeSkin = (root: HTMLElement): void => {
  for (const key of workshopThemeSkinDataKeys) {
    delete root.dataset[key];
  }
  for (const property of workshopThemeSkinStyleKeys) {
    root.style.removeProperty(property);
  }
};

export const applyWorkshopThemeSkin = (root: HTMLElement, skin: WorkshopActiveThemeBackground): void => {
  clearWorkshopThemeSkin(root);
  root.dataset.workshopThemeSkin = skin.mode;
  root.dataset.workshopSidebar = skin.layout.sidebarPosition;
  root.dataset.workshopSidebarPresentation = skin.layout.sidebarPresentation;
  root.dataset.workshopSidebarWidth = skin.layout.sidebarWidth;
  root.dataset.workshopPlayer = skin.layout.playerStyle;
  root.dataset.workshopTitlebar = skin.layout.titlebarStyle;
  root.dataset.workshopDensity = skin.layout.contentDensity;
  root.dataset.workshopCards = skin.layout.cardStyle;
  root.dataset.workshopDisplay = skin.layout.displayStyle;
  root.dataset.workshopNav = skin.layout.navStyle;
  root.dataset.workshopMotion = skin.layout.motion;
  root.dataset.workshopHome = skin.stages.home;
  root.dataset.workshopLyrics = skin.stages.lyrics;
  root.dataset.workshopQueue = skin.stages.queue;
  root.dataset.workshopSongs = skin.stages.songs;

  const identity = skin.identity ?? defaultWorkshopThemeIdentity;
  root.dataset.workshopBrand = identity.brandPresentation;
  root.dataset.workshopShowEditionBadge = identity.showEditionBadge ? 'true' : 'false';
  root.dataset.workshopShowVersion = identity.showVersion ? 'true' : 'false';
  if (identity.brandPresentation === 'asset' && identity.brandUrl) {
    assignProtocolImage(root, {
      url: identity.brandUrl,
      cssVar: '--workshop-theme-brand-image',
    });
  }

  const atlas = skin.iconAtlas;
  if (atlas && protocolUrl(atlas.url)) {
    root.dataset.workshopIconAtlas = 'true';
    const mappedKeys = workshopThemeIconKeys.filter((key) => atlas.map[key] !== undefined);
    root.dataset.workshopIconMap = mappedKeys.join(' ');
    root.style.setProperty('--workshop-theme-icon-atlas-image', cssImage(atlas.url));
    root.style.setProperty('--workshop-theme-icon-atlas-columns', String(atlas.columns));
    root.style.setProperty('--workshop-theme-icon-atlas-rows', String(atlas.rows));
    for (const key of mappedKeys) {
      const index = atlas.map[key];
      if (index === undefined) {
        continue;
      }
      const column = index % atlas.columns;
      const row = Math.floor(index / atlas.columns);
      const x = atlas.columns <= 1 ? 0 : column / (atlas.columns - 1) * 100;
      const y = atlas.rows <= 1 ? 0 : row / (atlas.rows - 1) * 100;
      const token = workshopThemeIconCssToken(key);
      root.style.setProperty(`--workshop-theme-icon-${token}-x`, `${x}%`);
      root.style.setProperty(`--workshop-theme-icon-${token}-y`, `${y}%`);
    }
  }

  assignProtocolImage(root, {
    url: skin.url ?? skin.assets.background,
    cssVar: '--workshop-theme-background-image',
    dataKey: 'workshopThemeBackground',
  });
  assignProtocolImage(root, {
    url: skin.assets.titlebar,
    cssVar: '--workshop-theme-titlebar-image',
    dataKey: 'workshopThemeTitlebar',
  });
  assignProtocolImage(root, {
    url: skin.assets.sidebar,
    cssVar: '--workshop-theme-sidebar-image',
    dataKey: 'workshopThemeSidebarImage',
  });
  assignProtocolImage(root, {
    url: skin.assets.player,
    cssVar: '--workshop-theme-player-image',
    dataKey: 'workshopThemePlayerImage',
  });
  assignProtocolImage(root, {
    url: skin.assets.page,
    cssVar: '--workshop-theme-page-image',
  });
  assignProtocolImage(root, {
    url: skin.assets.home,
    cssVar: '--workshop-theme-home-image',
    dataKey: 'workshopThemeHomeImage',
  });
  assignProtocolImage(root, {
    url: skin.assets.lyrics,
    cssVar: '--workshop-theme-lyrics-image',
    dataKey: 'workshopThemeLyricsImage',
  });
  assignProtocolImage(root, {
    url: skin.assets.queue,
    cssVar: '--workshop-theme-queue-image',
    dataKey: 'workshopThemeQueueImage',
  });
  assignProtocolImage(root, {
    url: skin.assets.nowPlaying,
    cssVar: '--workshop-theme-now-playing-image',
    dataKey: 'workshopThemeNowPlayingImage',
  });

  if (skin.effects.dimChromePercent > 0) {
    root.dataset.workshopDimChrome = 'true';
  }

  root.style.setProperty('--workshop-theme-grain', String(skin.effects.grainPercent));
  root.style.setProperty('--workshop-theme-vignette', String(skin.effects.vignettePercent));
  root.style.setProperty('--workshop-theme-glow', String(skin.effects.glowPercent));
  root.style.setProperty('--workshop-theme-scrim', String(skin.effects.scrimPercent));
  root.style.setProperty('--workshop-theme-bloom', String(skin.effects.bloomPercent));
  root.style.setProperty('--workshop-theme-mist', String(skin.effects.mistPercent));
  root.style.setProperty('--workshop-theme-dim-chrome', String(skin.effects.dimChromePercent));
  root.style.setProperty('--workshop-theme-spotlight', String(skin.effects.spotlightPercent));
  root.style.setProperty('--workshop-theme-frost', String(skin.effects.frostPercent));
};

export const workshopThemeSkinWatermarkUrl = (skin: WorkshopActiveThemeBackground): string | null =>
  protocolUrl(skin.assets.watermark);
