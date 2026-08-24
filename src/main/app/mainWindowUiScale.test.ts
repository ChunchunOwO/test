import { describe, expect, it, vi } from 'vitest';
import {
  adjustMainWindowUiScalePercent,
  applyMainWindowUiScale,
  normalizeMainWindowUiScalePercent,
  resolveMainWindowZoomFactor,
  resolveMainWindowUiScaleShortcut,
} from './mainWindowUiScale';

describe('main window UI scale', () => {
  it('normalizes persisted values to the supported five-percent range', () => {
    expect(normalizeMainWindowUiScalePercent(73)).toBe(75);
    expect(normalizeMainWindowUiScalePercent(112)).toBe(110);
    expect(normalizeMainWindowUiScalePercent(999)).toBe(150);
    expect(normalizeMainWindowUiScalePercent('invalid')).toBe(100);
  });

  it('converts the percentage to an Electron zoom factor', () => {
    expect(resolveMainWindowZoomFactor(95)).toBe(0.95);
    expect(resolveMainWindowZoomFactor(125)).toBe(1.25);
  });

  it('maps standard keyboard zoom shortcuts to the persisted scale control', () => {
    expect(resolveMainWindowUiScaleShortcut({ type: 'keyDown', control: true, code: 'Equal', key: '+' })).toBe('increase');
    expect(resolveMainWindowUiScaleShortcut({ type: 'keyDown', meta: true, code: 'Minus', key: '-' })).toBe('decrease');
    expect(resolveMainWindowUiScaleShortcut({ type: 'keyDown', control: true, code: 'Digit0', key: '0' })).toBe('reset');
    expect(resolveMainWindowUiScaleShortcut({ type: 'keyUp', control: true, code: 'Equal', key: '+' })).toBeNull();
    expect(resolveMainWindowUiScaleShortcut({ type: 'keyDown', control: true, alt: true, code: 'Equal', key: '+' })).toBeNull();
  });

  it('steps and resets keyboard zoom within the supported range', () => {
    expect(adjustMainWindowUiScalePercent(100, 'increase')).toBe(105);
    expect(adjustMainWindowUiScalePercent(100, 'decrease')).toBe(95);
    expect(adjustMainWindowUiScalePercent(150, 'increase')).toBe(150);
    expect(adjustMainWindowUiScalePercent(75, 'decrease')).toBe(75);
    expect(adjustMainWindowUiScalePercent(135, 'reset')).toBe(100);
  });

  it('updates only the supplied live main window', () => {
    const setZoomFactor = vi.fn();
    const window = {
      isDestroyed: () => false,
      webContents: { setZoomFactor },
    };

    expect(applyMainWindowUiScale(window, 150)).toBe(1.5);
    expect(setZoomFactor).toHaveBeenCalledOnce();
    expect(setZoomFactor).toHaveBeenCalledWith(1.5);
  });

  it('does not touch a destroyed window', () => {
    const setZoomFactor = vi.fn();
    applyMainWindowUiScale({
      isDestroyed: () => true,
      webContents: { setZoomFactor },
    }, 125);

    expect(setZoomFactor).not.toHaveBeenCalled();
  });
});
