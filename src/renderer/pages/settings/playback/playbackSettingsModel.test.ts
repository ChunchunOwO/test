import { describe, expect, it } from 'vitest';
import { getPlaybackOutputModesForPlatform, isPlaybackOutputMode } from './playbackSettingsModel';

describe('playback output modes', () => {
  it('exposes experimental WDM-KS only on Windows', () => {
    expect(getPlaybackOutputModesForPlatform('win32')).toContain('ks');
    expect(getPlaybackOutputModesForPlatform('linux')).not.toContain('ks');
    expect(getPlaybackOutputModesForPlatform('darwin')).not.toContain('ks');
    expect(isPlaybackOutputMode('ks')).toBe(true);
  });
});
