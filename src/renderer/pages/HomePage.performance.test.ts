import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('HomePage foreground idle performance', () => {
  it('keeps the recent-signal marker static so an idle window can stop compositing', () => {
    const styles = readFileSync('src/renderer/styles/home.css', 'utf8');
    const markerRule = styles.match(/\.home-now-copy > span::before \{[\s\S]*?\n\}/)?.[0] ?? '';

    expect(markerRule).toContain('box-shadow: 0 0 0 3px');
    expect(markerRule).not.toContain('animation:');
    expect(styles).not.toContain('@keyframes home-live-dot');
  });
});
