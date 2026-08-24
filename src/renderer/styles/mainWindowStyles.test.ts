import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('main window style ownership', () => {
  it('loads shared library styles before any lazy route renders', () => {
    const mainWindowStyles = readFileSync('src/renderer/styles/mainWindowStyles.ts', 'utf8');
    const trackList = readFileSync('src/renderer/components/library/TrackList.tsx', 'utf8');

    expect(mainWindowStyles).toContain("import './songs.css';");
    expect(mainWindowStyles).toContain("import './player-transport-polish.css';");
    expect(mainWindowStyles).toContain("import './theme-transition.css';");
    expect(mainWindowStyles.indexOf("import './player-transport-polish.css';")).toBeGreaterThan(
      mainWindowStyles.indexOf("import './theme-presets.css';"),
    );
    expect(trackList).not.toContain("styles/songs.css");
  });

  it('lets the streaming route own the album detail styles it renders', () => {
    const streamingSearchPage = readFileSync('src/renderer/components/streaming/StreamingSearchPage.tsx', 'utf8');

    expect(streamingSearchPage).toContain("import '../../styles/album-detail.css';");
  });

  it('keeps route-specific liked and history styles out of the startup bundle', () => {
    const mainWindowStyles = readFileSync('src/renderer/styles/mainWindowStyles.ts', 'utf8');
    const likedPage = readFileSync('src/renderer/pages/LikedPage.tsx', 'utf8');
    const historyPage = readFileSync('src/renderer/pages/HistoryPage.tsx', 'utf8');

    expect(mainWindowStyles).not.toContain("import './liked.css';");
    expect(mainWindowStyles).not.toContain("import './history-redesign.css';");
    expect(likedPage).toContain("import '../styles/liked.css';");
    expect(historyPage).toContain("import '../styles/history-redesign.css';");
  });

  it('does not draw Chromium\'s native outline around the full route surface', () => {
    const layout = readFileSync('src/renderer/styles/layout.css', 'utf8');

    expect(layout).toMatch(/\.page-surface:focus \{\s*outline: none;\s*\}/);
  });

  it('crossfades the complete theme snapshot and retains a reduced-motion fallback', () => {
    const transition = readFileSync('src/renderer/styles/theme-transition.css', 'utf8');

    expect(transition).toContain("html[data-theme-transition='view']::view-transition-old(root)");
    expect(transition).toContain("html[data-theme-transition='view']::view-transition-new(root)");
    expect(transition).toContain('@media (prefers-reduced-motion: reduce)');
    expect(transition).not.toContain('transform:');
  });

  it('does not resize the route surface when a shared sort menu opens', () => {
    const songs = readFileSync('src/renderer/styles/songs.css', 'utf8');
    const scrollbars = readFileSync('src/renderer/styles/scrollbars.css', 'utf8');

    expect(songs).not.toContain('.page-surface:has(.sort-menu)');
    expect(scrollbars).not.toContain('.page-surface:has(.sort-menu)');
  });

  it('keeps settings, drawer, genres, and lyrics-route polish in their lazy owners', () => {
    const mainWindowStyles = readFileSync('src/renderer/styles/mainWindowStyles.ts', 'utf8');
    const settingsRoute = readFileSync('src/renderer/pages/SettingsRoute.tsx', 'utf8');
    const audioDrawer = readFileSync('src/renderer/components/player/AudioSettingsDrawer.tsx', 'utf8');
    const lyricsDrawer = readFileSync('src/renderer/components/lyrics/LyricsSettingsDrawer.tsx', 'utf8');
    const lyricsVisualDrawer = readFileSync('src/renderer/components/lyrics/LyricsVisualSettingsDrawer.tsx', 'utf8');
    const lyricsPage = readFileSync('src/renderer/pages/LyricsPage.tsx', 'utf8');
    const genreDetail = readFileSync('src/renderer/components/genre/GenreDetailView.tsx', 'utf8');

    for (const routeStyle of [
      'genres.css',
      'lyrics-settings-page.css',
      'settings-polish.css',
      'settings-about.css',
      'theme-preset-gallery.css',
      'audio-drawer-polish.css',
      'lyrics-drawer-polish.css',
      'lyrics-settings-display.css',
      'lyrics-visual-drawer-polish.css',
      'lyrics-route-motion.css',
    ]) {
      expect(mainWindowStyles).not.toContain(routeStyle);
    }

    expect(settingsRoute).toContain("import '../styles/settings-polish.css';");
    expect(settingsRoute).toContain("import '../styles/settings-about.css';");
    expect(audioDrawer).toContain("import '../../styles/audio-drawer-polish.css';");
    expect(lyricsDrawer).toContain("import '../../styles/lyrics-drawer-polish.css';");
    expect(lyricsDrawer).toContain("import '../../styles/lyrics-settings-display.css';");
    expect(lyricsVisualDrawer).toContain("import '../../styles/lyrics-visual-drawer-polish.css';");
    expect(lyricsPage).toContain('import "../styles/lyrics-route-motion.css";');
    expect(genreDetail).toContain("import '../../styles/genres.css';");
  });

  it('keeps lyrics route motion to a fade and does not slide the sidebar away', () => {
    const lyricsRouteMotion = readFileSync('src/renderer/styles/lyrics-route-motion.css', 'utf8');
    const layout = readFileSync('src/renderer/styles/layout.css', 'utf8');

    expect(layout).toMatch(/\.app-shell--lyrics \.sidebar \{[\s\S]*?visibility: hidden;[\s\S]*?pointer-events: none;/);
    expect(lyricsRouteMotion).toContain('visibility: hidden');
    expect(lyricsRouteMotion).toContain('[data-lyrics-sidebar-restoring="true"]');
    expect(lyricsRouteMotion).toContain('transition: none !important');
    expect(lyricsRouteMotion).toContain('lyrics-route-surface-in');
    expect(lyricsRouteMotion).not.toContain('grid-template-columns');
    expect(lyricsRouteMotion).not.toContain('translate3d');
    expect(lyricsRouteMotion).not.toContain('scale(');
  });

  it('keeps the filtered lyrics mini player on its own compositor layer', () => {
    const layout = readFileSync('src/renderer/styles/layout.css', 'utf8');

    expect(layout).toMatch(
      /\.app-shell--lyrics-player-drawer \.lyrics-player-drawer-host \.player-bar \{[\s\S]*?backdrop-filter: blur\(22px\) saturate\(1\.18\);[\s\S]*?backface-visibility: hidden;[\s\S]*?transform: translate3d\(0, 0, 0\);/,
    );
  });

  it('keeps shared chrome motion to short fades instead of slides and scales', () => {
    const motion = readFileSync('src/renderer/styles/motion.css', 'utf8');
    const settingsPolish = readFileSync('src/renderer/styles/settings-polish.css', 'utf8');
    const layout = readFileSync('src/renderer/styles/layout.css', 'utf8');
    const uiPolish = readFileSync('src/renderer/styles/ui-polish.css', 'utf8');
    const songs = readFileSync('src/renderer/styles/songs.css', 'utf8');
    const presets = readFileSync('src/renderer/ui/motion/presets.ts', 'utf8');

    expect(motion).toContain('--echo-motion-mini-player-ms: 180ms');
    expect(motion).toContain('--echo-motion-sidebar-ms: 180ms');
    expect(motion).toContain('--echo-motion-drawer-ms: 280ms');
    expect(motion).toContain('--echo-motion-ease-drawer: cubic-bezier(0.33, 0.7, 0.2, 1)');
    expect(settingsPolish).not.toContain('520ms');
    expect(settingsPolish).not.toContain('settings-return-rail-in');
    expect(settingsPolish).not.toContain('settings-return-page-in');
    expect(settingsPolish).not.toContain('translate3d');
    expect(settingsPolish).not.toContain('scale(0.968)');
    expect(settingsPolish).toMatch(/\.app-shell\.app-shell--settings-focus:not\(\.app-shell--standalone\) \{[\s\S]*?grid-template-columns: 0 minmax\(0, 1fr\);[\s\S]*?\}/);
    expect(settingsPolish).not.toMatch(/\.app-shell\.app-shell--settings-focus:not\(\.app-shell--standalone\) \{\s*grid-template-columns: 0 minmax\(0, 1fr\);\s*transition: none;/);
    expect(layout).not.toContain('echo-fullscreen-titlebar-enter');
    expect(layout).not.toContain('scale(0.998)');
    expect(layout).not.toMatch(/\.lyrics-player-drawer-host--auto-hide,[\s\S]*?will-change:/);
    expect(layout).not.toMatch(/\.lyrics-player-drawer-host--auto-hidden \{[^}]*filter:/);
    expect(layout).toContain('translate3d(0, 12px, 0)');
    expect(uiPolish).not.toContain('echo-nav-active-settle');
    expect(uiPolish).not.toContain('echo-nav-icon-pop');
    expect(presets).not.toContain('stiffness');
    expect(presets).not.toContain('x: 12');
    expect(songs).toMatch(/@keyframes sort-menu-in \{\s*from \{\s*opacity: 0;\s*\}\s*to \{\s*opacity: 1;\s*\}/);
    expect(songs).not.toMatch(/\.sort-menu \{[^}]*will-change:/);
    expect(songs).not.toMatch(/\.track-context-menu \{[^}]*will-change:/);
  });

  it('keeps settings drawers to a calm nudge without full-window blur or shadow bloom', () => {
    const audioDrawer = readFileSync('src/renderer/styles/audio-drawer-polish.css', 'utf8');
    const lyricsDrawer = readFileSync('src/renderer/styles/lyrics-drawer-polish.css', 'utf8');
    const visualDrawer = readFileSync('src/renderer/styles/lyrics-visual-drawer-polish.css', 'utf8');
    const app = readFileSync('src/renderer/styles/app.css', 'utf8');

    expect(audioDrawer).not.toContain('540ms');
    expect(audioDrawer).not.toContain('500ms');
    expect(audioDrawer).toMatch(/@keyframes adp-pill-in \{[\s\S]*?from \{[\s\S]*?opacity: 0;/);
    expect(audioDrawer).not.toMatch(/@keyframes adp-pill-in \{[\s\S]*?translateX\(20px\)/);
    expect(audioDrawer).not.toMatch(/\.audio-drawer-scrim \{[^}]*backdrop-filter/);
    expect(lyricsDrawer).not.toContain('llp-panel-in 300ms');
    expect(lyricsDrawer).not.toContain('translate3d(10px, 0, 0)');
    expect(lyricsDrawer).not.toContain('opacity 360ms');
    expect(lyricsDrawer).not.toMatch(/\.audio-drawer-scrim \{[^}]*backdrop-filter/);
    expect(visualDrawer).not.toMatch(/\.audio-drawer-scrim \{[^}]*backdrop-filter/);
    expect(app).toContain('opacity var(--echo-motion-drawer-ms) var(--echo-motion-ease-drawer)');
    expect(app).toContain('translate3d(12px, 0, 0)');
    expect(app).not.toContain('transform 460ms');
    expect(app).not.toContain('transform 380ms');
    expect(app).not.toContain('transform 360ms');
    expect(app).not.toContain('translate3d(10px, 0, 0)');
    expect(app).not.toContain('translate3d(calc(100% + 12px)');
    expect(app).not.toMatch(/\.audio-drawer \{[^}]*will-change:/);
  });
});
