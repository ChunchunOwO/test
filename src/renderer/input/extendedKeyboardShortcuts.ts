import type { GlobalShortcutAction } from '../../shared/types/globalShortcuts';

const extendedKeyboardShortcutActions = new Map<string, GlobalShortcutAction>([
  ['mediaplaypause', 'playPause'],
  ['medianexttrack', 'nextTrack'],
  ['mediaprevioustrack', 'previousTrack'],
  ['mediastop', 'stop'],
  ['volumeup', 'volumeUp'],
  ['volumedown', 'volumeDown'],
  ['volumemute', 'toggleMute'],
]);

/**
 * Dedicated media keys are a focused-window fallback. User-recorded local or
 * global bindings are resolved first by PlaybackCommandController.
 */
export const resolveExtendedKeyboardShortcutAction = (
  accelerator: string | null,
): GlobalShortcutAction | null => (
  accelerator ? extendedKeyboardShortcutActions.get(accelerator.toLowerCase()) ?? null : null
);
