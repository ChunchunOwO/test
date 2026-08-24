import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('background window animation budget', () => {
  it('pauses animation timelines without hiding or rebuilding the UI', () => {
    const styles = readFileSync('src/renderer/styles/background-window-budget.css', 'utf8');
    const styleEntry = readFileSync('src/renderer/styles/mainWindowStyles.ts', 'utf8');

    expect(styleEntry).toContain("import './background-window-budget.css'");
    expect(styles).toContain(".app-shell[data-render-budget='hidden'] *");
    expect(styles).toContain('animation-play-state: paused !important');
    expect(styles).not.toMatch(/\bdisplay\s*:\s*none/);
    expect(styles).not.toMatch(/\bvisibility\s*:\s*hidden/);
    expect(styles).not.toContain('animation: none');
  });
});
