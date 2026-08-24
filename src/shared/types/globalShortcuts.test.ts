import { describe, expect, it } from 'vitest';
import {
  createRecommendedGlobalShortcuts,
  createRecommendedLocalShortcuts,
  validateGlobalShortcutAccelerator,
} from './globalShortcuts';

describe('recommended shortcuts', () => {
  it('keeps common playback shortcuts simple and valid', () => {
    const localShortcuts = createRecommendedLocalShortcuts();
    const globalShortcuts = createRecommendedGlobalShortcuts();

    expect(localShortcuts.previousTrack).toEqual({ enabled: false, accelerator: 'Ctrl+K' });
    expect(localShortcuts.nextTrack).toEqual({ enabled: false, accelerator: 'Ctrl+J' });
    expect(globalShortcuts.playPause).toEqual({ enabled: false, accelerator: 'Ctrl+Space' });
    expect(globalShortcuts.previousTrack).toEqual({ enabled: false, accelerator: 'Ctrl+K' });
    expect(globalShortcuts.nextTrack).toEqual({ enabled: false, accelerator: 'Ctrl+J' });
    expect(globalShortcuts.openAudioSettings).toEqual({ enabled: false, accelerator: null });
    expect(globalShortcuts.openMvSettings).toEqual({ enabled: false, accelerator: null });
    expect(globalShortcuts.openLyricsSettings).toEqual({ enabled: false, accelerator: null });
    expect(globalShortcuts.locateCurrentTrack).toEqual({ enabled: false, accelerator: null });
    expect(localShortcuts.toggleCurrentTrackLiked).toEqual({ enabled: false, accelerator: 'L' });
    expect(localShortcuts.openPlaybackQueue).toEqual({ enabled: false, accelerator: 'Q' });
    expect(localShortcuts.openSearch).toEqual({ enabled: false, accelerator: 'Ctrl+F' });
    expect(localShortcuts.toggleMute).toEqual({ enabled: false, accelerator: 'M' });
    expect(localShortcuts.toggleShuffle).toEqual({ enabled: false, accelerator: 'Ctrl+S' });
    expect(localShortcuts.cycleRepeatMode).toEqual({ enabled: false, accelerator: 'R' });
    expect(localShortcuts.replayCurrentTrack).toEqual({ enabled: false, accelerator: '0' });
    expect(localShortcuts.resetPlaybackSpeed).toEqual({ enabled: false, accelerator: 'Ctrl+0' });
    expect(localShortcuts.openSettings).toEqual({ enabled: false, accelerator: 'Ctrl+,' });
    expect(localShortcuts.openLiked).toEqual({ enabled: false, accelerator: 'Ctrl+Shift+L' });
    expect(localShortcuts.toggleLyrics).toEqual({ enabled: false, accelerator: 'Ctrl+L' });
    expect(localShortcuts.toggleEq).toEqual({ enabled: false, accelerator: 'E' });
    expect(localShortcuts.locateCurrentTrack).toEqual({ enabled: false, accelerator: 'Ctrl+G' });
    expect(localShortcuts.revealCurrentTrackInFolder).toEqual({ enabled: false, accelerator: 'Ctrl+Shift+O' });
    expect(globalShortcuts.toggleCurrentTrackLiked).toEqual({ enabled: false, accelerator: null });
    expect(globalShortcuts.openPlaybackQueue).toEqual({ enabled: false, accelerator: null });
    expect(globalShortcuts.openSearch).toEqual({ enabled: false, accelerator: null });
    expect(globalShortcuts.toggleShuffle).toEqual({ enabled: false, accelerator: null });
    expect(globalShortcuts.cycleRepeatMode).toEqual({ enabled: false, accelerator: null });
    expect(globalShortcuts.toggleMute).toEqual({ enabled: false, accelerator: null });
    expect(globalShortcuts.toggleMiniPlayer).toEqual({ enabled: false, accelerator: null });
    expect(localShortcuts.togglePet).toEqual({ enabled: false, accelerator: null });
    expect(globalShortcuts.togglePet).toEqual({ enabled: false, accelerator: null });
    expect(localShortcuts.toggleDesktopLyrics).toEqual({ enabled: false, accelerator: null });
    expect(globalShortcuts.toggleDesktopLyrics).toEqual({ enabled: false, accelerator: null });

    for (const binding of [...Object.values(localShortcuts), ...Object.values(globalShortcuts)]) {
      if (binding.accelerator) {
        expect(validateGlobalShortcutAccelerator(binding.accelerator).valid).toBe(true);
      }
    }
  });

  it('keeps numpad keys distinct from top-row number keys', () => {
    expect(validateGlobalShortcutAccelerator('Ctrl+Alt+Numpad1')).toEqual({
      accelerator: 'Ctrl+Alt+num1',
      available: true,
      reason: 'available',
      valid: true,
    });
    expect(validateGlobalShortcutAccelerator('Ctrl+Alt+num1')).toEqual({
      accelerator: 'Ctrl+Alt+num1',
      available: true,
      reason: 'available',
      valid: true,
    });
  });

  it('normalizes multimedia volume-key aliases before validation', () => {
    expect(validateGlobalShortcutAccelerator('AudioVolumeUp')).toEqual({
      accelerator: 'VolumeUp',
      available: true,
      reason: 'available',
      valid: true,
    });
    expect(validateGlobalShortcutAccelerator('AudioVolumeMute')).toEqual({
      accelerator: 'VolumeMute',
      available: true,
      reason: 'available',
      valid: true,
    });
    expect(validateGlobalShortcutAccelerator('Ctrl+,')).toEqual({
      accelerator: 'Ctrl+,',
      available: true,
      reason: 'available',
      valid: true,
    });
    expect(validateGlobalShortcutAccelerator('0')).toEqual({
      accelerator: '0',
      available: true,
      reason: 'available',
      valid: true,
    });
    expect(validateGlobalShortcutAccelerator('`')).toEqual({
      accelerator: '`',
      available: true,
      reason: 'available',
      valid: true,
    });
    expect(validateGlobalShortcutAccelerator('F13')).toEqual({
      accelerator: 'F13',
      available: true,
      reason: 'available',
      valid: true,
    });
    expect(validateGlobalShortcutAccelerator('Pause')).toEqual({
      accelerator: 'Pause',
      available: true,
      reason: 'available',
      valid: true,
    });
    expect(validateGlobalShortcutAccelerator('Ctrl+MouseButton4')).toEqual({
      accelerator: 'Ctrl+MouseButton4',
      available: true,
      reason: 'available',
      valid: true,
    });
  });
});
