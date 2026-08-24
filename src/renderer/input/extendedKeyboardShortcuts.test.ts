import { describe, expect, it } from 'vitest';
import { resolveExtendedKeyboardShortcutAction } from './extendedKeyboardShortcuts';

describe('extended keyboard shortcuts', () => {
  it('maps dedicated media and volume keys onto existing playback actions', () => {
    expect(resolveExtendedKeyboardShortcutAction('MediaPlayPause')).toBe('playPause');
    expect(resolveExtendedKeyboardShortcutAction('MediaPreviousTrack')).toBe('previousTrack');
    expect(resolveExtendedKeyboardShortcutAction('MediaNextTrack')).toBe('nextTrack');
    expect(resolveExtendedKeyboardShortcutAction('MediaStop')).toBe('stop');
    expect(resolveExtendedKeyboardShortcutAction('VolumeUp')).toBe('volumeUp');
    expect(resolveExtendedKeyboardShortcutAction('VolumeDown')).toBe('volumeDown');
    expect(resolveExtendedKeyboardShortcutAction('VolumeMute')).toBe('toggleMute');
  });

  it('does not claim ordinary or browser-navigation keys', () => {
    expect(resolveExtendedKeyboardShortcutAction('Space')).toBeNull();
    expect(resolveExtendedKeyboardShortcutAction('BrowserBack')).toBeNull();
  });
});
