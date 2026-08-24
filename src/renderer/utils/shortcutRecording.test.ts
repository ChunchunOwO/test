// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindShortcutRecordingListeners } from './shortcutRecording';

describe('shortcut recording listeners', () => {
  afterEach(() => {
    delete document.body.dataset.echoShortcutRecording;
  });

  it('waits through modifier-only keydowns and then records the chord', () => {
    const onAccelerator = vi.fn();
    const onCancel = vi.fn();
    const stop = bindShortcutRecordingListeners({ onAccelerator, onCancel });

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ControlLeft', key: 'Control', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(onAccelerator).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyK', key: 'k', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(onAccelerator).toHaveBeenCalledWith('Ctrl+K');

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyL', key: 'l', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(onAccelerator).toHaveBeenCalledTimes(1);
    stop();
  });

  it('records the first mouse side-button event and ignores the following auxclick', () => {
    const onAccelerator = vi.fn();
    const stop = bindShortcutRecordingListeners({ onAccelerator, onCancel: vi.fn() });

    window.dispatchEvent(new MouseEvent('mousedown', { button: 3, bubbles: true, cancelable: true }));
    window.dispatchEvent(new MouseEvent('auxclick', { button: 3, bubbles: true, cancelable: true }));

    expect(onAccelerator).toHaveBeenCalledTimes(1);
    expect(onAccelerator).toHaveBeenCalledWith('MouseButton4');
    stop();
  });

  it('records local mouse chords with modifiers', () => {
    const onAccelerator = vi.fn();
    const stop = bindShortcutRecordingListeners({
      includeMouseModifiers: true,
      onAccelerator,
      onCancel: vi.fn(),
    });

    window.dispatchEvent(new MouseEvent('mousedown', { button: 4, ctrlKey: true, bubbles: true, cancelable: true }));
    expect(onAccelerator).toHaveBeenCalledWith('Ctrl+MouseButton5');
    stop();
  });

  it('cancels on Escape without recording Esc', () => {
    const onAccelerator = vi.fn();
    const onCancel = vi.fn();
    const stop = bindShortcutRecordingListeners({ onAccelerator, onCancel });

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true, cancelable: true }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onAccelerator).not.toHaveBeenCalled();
    stop();
  });
});
