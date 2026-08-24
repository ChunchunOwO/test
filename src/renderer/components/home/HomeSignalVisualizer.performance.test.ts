import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('HomeSignalVisualizer performance ownership', () => {
  it('uses telemetry updates plus one compositor animation path', () => {
    const component = readFileSync('src/renderer/components/home/HomeSignalVisualizer.tsx', 'utf8');
    const styles = readFileSync('src/renderer/styles/home.css', 'utf8');

    expect(component).toContain('subscribeSharedPlaybackStatus');
    expect(component).toContain('useRenderBudget');
    expect(component).toContain('if (renderVisibleRef.current)');
    expect(component).not.toContain('requestAnimationFrame');
    expect(component).not.toContain('--home-signal-display-scale');
    expect(styles).toContain('animation: homeSignalLive');
    expect(styles).toContain('animation-play-state: paused');
  });
});
