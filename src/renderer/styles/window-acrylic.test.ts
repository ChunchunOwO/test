import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('window acrylic visual system', () => {
  it('loads after theme presets so the dedicated material layer owns final polish', () => {
    const imports = readFileSync('src/renderer/styles/mainWindowStyles.ts', 'utf8');

    expect(imports).toContain("import './window-acrylic.css';");
    expect(imports.indexOf("import './window-acrylic.css';")).toBeGreaterThan(
      imports.indexOf("import './theme-presets-fable.css';"),
    );
  });

  it('keeps light acrylic neutral and gives dark acrylic its own smoke veil', () => {
    const css = readFileSync('src/renderer/styles/window-acrylic.css', 'utf8');

    expect(css).toContain('html[data-theme="dark"] .app-shell.app-shell--acrylic:not(.app-shell--wallpaper)::before');
    expect(css).toContain('linear-gradient(180deg, rgb(4 8 15 / 0.24), rgb(3 6 12 / 0.36))');
    expect(css).toContain(':is(.app-titlebar, .sidebar, .player-bar)');
    expect(css).not.toContain('#74d3e5');
    expect(css).not.toContain('!important');
  });
});
