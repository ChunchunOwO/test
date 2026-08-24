import { describe, expect, it } from 'vitest';
import {
  acceleratorFromKeyboardEvent,
  acceleratorFromMouseEvent,
  acceleratorUsesMouseButton,
  formatAcceleratorForDisplay,
} from './shortcutAccelerator';

const keyboardEvent = (
  code: string,
  key = code,
  modifiers: Partial<Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>> = {},
): KeyboardEvent =>
  ({
    altKey: false,
    code,
    ctrlKey: false,
    key,
    metaKey: false,
    shiftKey: false,
    ...modifiers,
  }) as KeyboardEvent;

const mouseEvent = (button: number, modifiers: Partial<Pick<MouseEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>> = {}): MouseEvent =>
  ({
    altKey: false,
    button,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...modifiers,
  }) as MouseEvent;

describe('shortcut keyboard event normalization', () => {
  it('normalizes multimedia volume keys to Electron accelerator names', () => {
    expect(acceleratorFromKeyboardEvent(keyboardEvent('AudioVolumeUp'))).toBe('VolumeUp');
    expect(acceleratorFromKeyboardEvent(keyboardEvent('AudioVolumeDown'))).toBe('VolumeDown');
    expect(acceleratorFromKeyboardEvent(keyboardEvent('AudioVolumeMute'))).toBe('VolumeMute');
  });

  it('keeps browser navigation keys distinct', () => {
    expect(acceleratorFromKeyboardEvent(keyboardEvent('BrowserBack'))).toBe('BrowserBack');
    expect(acceleratorFromKeyboardEvent(keyboardEvent('BrowserForward'))).toBe('BrowserForward');
  });

  it('records macro-pad F-keys even when the browser reports Unidentified', () => {
    expect(acceleratorFromKeyboardEvent(keyboardEvent('F13', 'Unidentified'))).toBe('F13');
    expect(acceleratorFromKeyboardEvent(keyboardEvent('F24', 'Unidentified'))).toBe('F24');
  });

  it('records punctuation and navigation keys that used to fail validation', () => {
    expect(acceleratorFromKeyboardEvent(keyboardEvent('Backquote', '`'))).toBe('`');
    expect(acceleratorFromKeyboardEvent(keyboardEvent('Backquote', 'Unidentified'))).toBe('`');
    expect(acceleratorFromKeyboardEvent(keyboardEvent('Home', 'Home'))).toBe('Home');
    expect(acceleratorFromKeyboardEvent(keyboardEvent('Pause', 'Pause'))).toBe('Pause');
    expect(acceleratorFromKeyboardEvent(keyboardEvent('IntlYen', '¥'))).toBe('Yen');
  });

  it('ignores modifier-only keydowns so chords can be recorded', () => {
    expect(acceleratorFromKeyboardEvent(keyboardEvent('ControlLeft', 'Control', { ctrlKey: true }))).toBeNull();
    expect(acceleratorFromKeyboardEvent(keyboardEvent('ShiftLeft', 'Shift', { shiftKey: true }))).toBeNull();
    expect(acceleratorFromKeyboardEvent(keyboardEvent('KeyK', 'k', { ctrlKey: true }))).toBe('Ctrl+K');
  });
});

describe('shortcut mouse event normalization', () => {
  it('maps middle and side buttons', () => {
    expect(acceleratorFromMouseEvent(mouseEvent(1))).toBe('MouseButton3');
    expect(acceleratorFromMouseEvent(mouseEvent(3))).toBe('MouseButton4');
    expect(acceleratorFromMouseEvent(mouseEvent(4))).toBe('MouseButton5');
    expect(acceleratorFromMouseEvent(mouseEvent(0))).toBeNull();
  });

  it('can include modifiers for local mouse chords', () => {
    expect(acceleratorFromMouseEvent(mouseEvent(3, { ctrlKey: true }), { includeModifiers: true })).toBe('Ctrl+MouseButton4');
    expect(acceleratorFromMouseEvent(mouseEvent(3, { ctrlKey: true }))).toBe('MouseButton4');
  });

  it('shows readable mouse button names when labels are provided', () => {
    expect(
      formatAcceleratorForDisplay('Ctrl+MouseButton4', 'empty', {
        MouseButton4: 'Side button (Back)',
      }),
    ).toBe('Ctrl + Side button (Back)');
  });

  it('detects bound mouse-button accelerators regardless of case', () => {
    expect(acceleratorUsesMouseButton('MouseButton4')).toBe(true);
    expect(acceleratorUsesMouseButton('ctrl+mousebutton5')).toBe(true);
    expect(acceleratorUsesMouseButton('Ctrl+K')).toBe(false);
    expect(acceleratorUsesMouseButton('MouseButton1')).toBe(false);
    expect(acceleratorUsesMouseButton(null)).toBe(false);
  });
});
