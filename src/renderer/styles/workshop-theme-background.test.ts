import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Workshop theme background performance policy', () => {
  it('collapses low spec themes to one shell background and removes per-surface images', () => {
    const source = readFileSync('src/renderer/styles/workshop-theme-background.css', 'utf8');

    expect(source).toContain('.app-shell[data-low-spec-mode="true"]');
    expect(source).toContain('background-image: var(--workshop-theme-background-image, none);');
    expect(source).toContain('.app-shell[data-low-spec-mode="true"] .page-surface');
    expect(source).toContain('.app-shell[data-low-spec-mode="true"] .player-bar');
  });
});
