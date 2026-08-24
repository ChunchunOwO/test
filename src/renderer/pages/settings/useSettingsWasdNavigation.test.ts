// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  resolveSettingsWasdDirection,
  shouldHandleSettingsWasd,
} from './useSettingsWasdNavigation';

const keydown = (key: string, target: HTMLElement = document.body, init: KeyboardEventInit = {}): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...init });
  target.dispatchEvent(event);
  return event;
};

afterEach(() => {
  document.body.innerHTML = '';
  delete document.body.dataset.echoShortcutRecording;
});

describe('settings WASD navigation guards', () => {
  it('maps WASD case-insensitively to directions', () => {
    expect(resolveSettingsWasdDirection('w')).toBe('up');
    expect(resolveSettingsWasdDirection('A')).toBe('left');
    expect(resolveSettingsWasdDirection('s')).toBe('down');
    expect(resolveSettingsWasdDirection('D')).toBe('right');
    expect(resolveSettingsWasdDirection('ArrowDown')).toBeNull();
  });

  it('allows an unmodified WASD key from non-interactive settings chrome', () => {
    expect(shouldHandleSettingsWasd(keydown('w'))).toBe(true);
  });

  it('never captures WASD while the user is editing or searching', () => {
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    expect(shouldHandleSettingsWasd(keydown('w', input))).toBe(false);

    const editor = document.createElement('div');
    editor.contentEditable = 'true';
    document.body.append(editor);
    editor.focus();
    expect(shouldHandleSettingsWasd(keydown('s', editor))).toBe(false);
  });

  it('does not override controls, dialogs, modifiers, IME, or shortcut recording', () => {
    const button = document.createElement('button');
    document.body.append(button);
    expect(shouldHandleSettingsWasd(keydown('a', button))).toBe(false);
    expect(shouldHandleSettingsWasd(keydown('d', document.body, { ctrlKey: true }))).toBe(false);
    expect(shouldHandleSettingsWasd(keydown('d', document.body, { isComposing: true }))).toBe(false);

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.append(dialog);
    expect(shouldHandleSettingsWasd(keydown('w'))).toBe(false);
    dialog.remove();

    document.body.dataset.echoShortcutRecording = 'true';
    expect(shouldHandleSettingsWasd(keydown('s'))).toBe(false);
  });
});
