import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('playlists cinematic theme', () => {
  const css = readFileSync('src/renderer/styles/playlists-cinematic.css', 'utf8').replace(/\r\n/g, '\n');

  it('maps playlist colors to the shared theme tokens', () => {
    expect(css).toContain('--playlist-page-bg: var(--theme-app-bg);');
    expect(css).toContain('--playlist-accent: var(--theme-accent-solid-bg);');
    expect(css).toContain('--playlist-text: var(--theme-page-text);');
    expect(css).toContain('background: var(--echo-polish-play-bg);');
    expect(css).toContain('background: var(--echo-polish-page-bg), var(--theme-app-bg);');
  });

  it('does not keep a private light/dark palette', () => {
    expect(css).not.toContain('#f5f7fb');
    expect(css).not.toContain('#5362ed');
    expect(css).not.toContain('#09101e');
    expect(css).not.toContain('html[data-theme="dark"]');
  });
});
