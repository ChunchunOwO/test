import { describe, expect, it } from 'vitest';
import { createDefaultGlobalShortcuts, createDefaultLocalShortcuts } from '../../shared/types/globalShortcuts';
import { resolveUltraLightShortcutAction } from './ultraLightShortcutResolver';

describe('resolveUltraLightShortcutAction', () => {
  it('uses the focused-window Space default for play/pause', () => {
    expect(resolveUltraLightShortcutAction('Space', undefined, undefined)).toBe('playPause');
  });

  it('resolves user-configured local shortcuts', () => {
    const local = createDefaultLocalShortcuts();
    local.nextTrack = { enabled: true, accelerator: 'Ctrl+J' };
    expect(resolveUltraLightShortcutAction('Ctrl+J', local, undefined)).toBe('nextTrack');
  });

  it('does not double-dispatch a key already owned by a global shortcut', () => {
    const local = createDefaultLocalShortcuts();
    const global = createDefaultGlobalShortcuts();
    global.playPause = { enabled: true, accelerator: 'Ctrl+Space' };
    local.playPause = { enabled: true, accelerator: 'CommandOrControl+Space' };
    expect(resolveUltraLightShortcutAction('Ctrl+Space', local, global)).toBeNull();
  });
});
