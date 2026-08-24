import { describe, expect, it } from 'vitest';
import { resolveGamepadFrame, type GamepadInputState } from './GamepadInputController';

const state = (patch: Partial<GamepadInputState> = {}): GamepadInputState => ({
  buttons: [],
  repeatAction: null,
  repeatAtMs: 0,
  ...patch,
});

const snapshot = (pressedButtons: number[] = [], axes: number[] = [0, 0]) => ({
  axes,
  buttons: Array.from({ length: 16 }, (_, index) => pressedButtons.includes(index)),
});

describe('standard gamepad input mapping', () => {
  it('maps navigation, confirmation, playback, queue, track and volume controls', () => {
    expect(resolveGamepadFrame(snapshot([0]), state(), 0).actions).toEqual(['activate']);
    expect(resolveGamepadFrame(snapshot([1]), state(), 0).actions).toEqual(['back']);
    expect(resolveGamepadFrame(snapshot([2]), state(), 0).actions).toEqual(['playPause']);
    expect(resolveGamepadFrame(snapshot([3]), state(), 0).actions).toEqual(['openPlaybackQueue']);
    expect(resolveGamepadFrame(snapshot([4]), state(), 0).actions).toEqual(['previousTrack']);
    expect(resolveGamepadFrame(snapshot([5]), state(), 0).actions).toEqual(['nextTrack']);
    expect(resolveGamepadFrame(snapshot([6]), state(), 0).actions).toEqual(['volumeDown']);
    expect(resolveGamepadFrame(snapshot([7]), state(), 0).actions).toEqual(['volumeUp']);
    expect(resolveGamepadFrame(snapshot([10]), state(), 0).actions).toEqual(['toggleMute']);
    expect(resolveGamepadFrame(snapshot([12]), state(), 0).actions).toEqual(['focusUp']);
    expect(resolveGamepadFrame(snapshot([], [0.8, 0]), state(), 0).actions).toEqual(['focusRight']);
  });

  it('fires command buttons on the press edge and repeats held navigation predictably', () => {
    const firstButtonFrame = resolveGamepadFrame(snapshot([2]), state(), 100);
    expect(resolveGamepadFrame(snapshot([2]), firstButtonFrame.state, 500).actions).toEqual([]);

    const firstNavigationFrame = resolveGamepadFrame(snapshot([13]), state(), 100);
    expect(firstNavigationFrame.actions).toEqual(['focusDown']);
    expect(resolveGamepadFrame(snapshot([13]), firstNavigationFrame.state, 300).actions).toEqual([]);
    expect(resolveGamepadFrame(snapshot([13]), firstNavigationFrame.state, 460).actions).toEqual(['focusDown']);
  });

  it('uses a deadzone so resting stick drift does not move focus', () => {
    expect(resolveGamepadFrame(snapshot([], [0.4, -0.5]), state(), 0).actions).toEqual([]);
  });
});
