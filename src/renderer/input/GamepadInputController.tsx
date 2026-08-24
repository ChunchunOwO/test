import { useEffect, useRef } from 'react';
import type { GlobalShortcutAction } from '../../shared/types/globalShortcuts';

export type GamepadNavigationAction =
  | 'activate'
  | 'back'
  | 'focusDown'
  | 'focusLeft'
  | 'focusRight'
  | 'focusUp';

export type GamepadControlAction = GamepadNavigationAction | GlobalShortcutAction;

type GamepadSnapshot = {
  axes: readonly number[];
  buttons: readonly boolean[];
};

export type GamepadInputState = {
  buttons: readonly boolean[];
  repeatAction: GamepadNavigationAction | null;
  repeatAtMs: number;
};

type GamepadFrameResult = {
  actions: GamepadControlAction[];
  state: GamepadInputState;
};

type GamepadInputControllerProps = {
  onPlaybackAction: (action: GlobalShortcutAction) => void;
};

const axisThreshold = 0.68;
const initialRepeatDelayMs = 360;
const heldRepeatIntervalMs = 115;
const shortcutRecordingFlag = 'echoShortcutRecording';

const buttonActions = new Map<number, GamepadControlAction>([
  [0, 'activate'],
  [1, 'back'],
  [2, 'playPause'],
  [3, 'openPlaybackQueue'],
  [4, 'previousTrack'],
  [5, 'nextTrack'],
  [6, 'volumeDown'],
  [7, 'volumeUp'],
  [9, 'playPause'],
  [10, 'toggleMute'],
]);

const focusableSelector = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[role="button"]:not([aria-disabled="true"])',
  '[role="checkbox"]:not([aria-disabled="true"])',
  '[role="menuitem"]:not([aria-disabled="true"])',
  '[role="option"]:not([aria-disabled="true"])',
  '[role="radio"]:not([aria-disabled="true"])',
  '[role="slider"]:not([aria-disabled="true"])',
  '[tabindex]:not([tabindex="-1"]):not([aria-disabled="true"])',
].join(',');

const emptyGamepadInputState = (): GamepadInputState => ({
  buttons: [],
  repeatAction: null,
  repeatAtMs: 0,
});

const resolveNavigationAction = (snapshot: GamepadSnapshot): GamepadNavigationAction | null => {
  if (snapshot.buttons[12] || (snapshot.axes[1] ?? 0) < -axisThreshold) {
    return 'focusUp';
  }
  if (snapshot.buttons[13] || (snapshot.axes[1] ?? 0) > axisThreshold) {
    return 'focusDown';
  }
  if (snapshot.buttons[14] || (snapshot.axes[0] ?? 0) < -axisThreshold) {
    return 'focusLeft';
  }
  if (snapshot.buttons[15] || (snapshot.axes[0] ?? 0) > axisThreshold) {
    return 'focusRight';
  }
  return null;
};

export const resolveGamepadFrame = (
  snapshot: GamepadSnapshot,
  previousState: GamepadInputState = emptyGamepadInputState(),
  nowMs = 0,
): GamepadFrameResult => {
  const actions: GamepadControlAction[] = [];

  for (const [buttonIndex, action] of buttonActions) {
    if (snapshot.buttons[buttonIndex] && !previousState.buttons[buttonIndex]) {
      actions.push(action);
    }
  }

  const navigationAction = resolveNavigationAction(snapshot);
  let repeatAtMs = 0;
  if (navigationAction) {
    if (navigationAction !== previousState.repeatAction) {
      actions.push(navigationAction);
      repeatAtMs = nowMs + initialRepeatDelayMs;
    } else if (nowMs >= previousState.repeatAtMs) {
      actions.push(navigationAction);
      repeatAtMs = nowMs + heldRepeatIntervalMs;
    } else {
      repeatAtMs = previousState.repeatAtMs;
    }
  }

  return {
    actions,
    state: {
      buttons: [...snapshot.buttons],
      repeatAction: navigationAction,
      repeatAtMs,
    },
  };
};

const isVisibleFocusable = (element: HTMLElement): boolean => {
  if (element.closest('[inert], [aria-hidden="true"]')) {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};

const getFocusableElements = (): HTMLElement[] => (
  Array.from(document.querySelectorAll<HTMLElement>(focusableSelector)).filter(isVisibleFocusable)
);

const focusElement = (element: HTMLElement): void => {
  element.focus({ preventScroll: true });
  element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
};

const adjustFocusedControl = (direction: GamepadNavigationAction): boolean => {
  const activeElement = document.activeElement;
  if (direction !== 'focusLeft' && direction !== 'focusRight' && direction !== 'focusUp' && direction !== 'focusDown') {
    return false;
  }

  const increasing = direction === 'focusRight' || direction === 'focusUp';
  if (activeElement instanceof HTMLSelectElement) {
    const offset = direction === 'focusLeft' || direction === 'focusUp' ? -1 : 1;
    const nextIndex = Math.max(0, Math.min(activeElement.options.length - 1, activeElement.selectedIndex + offset));
    if (nextIndex !== activeElement.selectedIndex) {
      activeElement.selectedIndex = nextIndex;
      activeElement.dispatchEvent(new Event('input', { bubbles: true }));
      activeElement.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
  }
  if (!(activeElement instanceof HTMLInputElement) || activeElement.type !== 'range') {
    return false;
  }

  try {
    if (increasing) {
      activeElement.stepUp();
    } else {
      activeElement.stepDown();
    }
  } catch {
    return false;
  }
  activeElement.dispatchEvent(new Event('input', { bubbles: true }));
  activeElement.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
};

const navigateFocus = (direction: GamepadNavigationAction): void => {
  if (adjustFocusedControl(direction)) {
    return;
  }

  const elements = getFocusableElements();
  if (elements.length === 0) {
    return;
  }

  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const activeIndex = activeElement ? elements.indexOf(activeElement) : -1;
  if (activeIndex < 0 || !activeElement) {
    focusElement(elements[0]);
    return;
  }

  const currentRect = activeElement.getBoundingClientRect();
  const currentX = currentRect.left + currentRect.width / 2;
  const currentY = currentRect.top + currentRect.height / 2;
  let best: { element: HTMLElement; score: number } | null = null;

  for (const element of elements) {
    if (element === activeElement) {
      continue;
    }
    const rect = element.getBoundingClientRect();
    const deltaX = rect.left + rect.width / 2 - currentX;
    const deltaY = rect.top + rect.height / 2 - currentY;
    const isCandidate =
      direction === 'focusLeft' ? deltaX < -1 :
      direction === 'focusRight' ? deltaX > 1 :
      direction === 'focusUp' ? deltaY < -1 :
      deltaY > 1;
    if (!isCandidate) {
      continue;
    }

    const primaryDistance = direction === 'focusLeft' || direction === 'focusRight' ? Math.abs(deltaX) : Math.abs(deltaY);
    const secondaryDistance = direction === 'focusLeft' || direction === 'focusRight' ? Math.abs(deltaY) : Math.abs(deltaX);
    const score = primaryDistance * 4 + secondaryDistance;
    if (!best || score < best.score) {
      best = { element, score };
    }
  }

  if (best) {
    focusElement(best.element);
    return;
  }

  const wrappedIndex = direction === 'focusLeft' || direction === 'focusUp' ? elements.length - 1 : 0;
  focusElement(elements[wrappedIndex]);
};

const activateFocusedElement = (): void => {
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement && activeElement !== document.body) {
    activeElement.click();
    return;
  }

  const firstElement = getFocusableElements()[0];
  if (firstElement) {
    focusElement(firstElement);
  }
};

const dispatchBackKey = (): void => {
  const target = document.activeElement instanceof HTMLElement ? document.activeElement : window;
  target.dispatchEvent(new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    code: 'Escape',
    key: 'Escape',
  }));
  target.dispatchEvent(new KeyboardEvent('keyup', {
    bubbles: true,
    cancelable: true,
    code: 'Escape',
    key: 'Escape',
  }));
};

const snapshotGamepad = (gamepad: Gamepad): GamepadSnapshot => ({
  axes: [...gamepad.axes],
  buttons: gamepad.buttons.map((button) => button.pressed || button.value >= 0.6),
});

const readConnectedGamepads = (): Gamepad[] => {
  try {
    return typeof navigator.getGamepads === 'function'
      ? Array.from(navigator.getGamepads()).filter(
          (gamepad): gamepad is Gamepad => Boolean(gamepad?.connected && gamepad.mapping === 'standard'),
        )
      : [];
  } catch {
    return [];
  }
};

export const GamepadInputController = ({ onPlaybackAction }: GamepadInputControllerProps): null => {
  const onPlaybackActionRef = useRef(onPlaybackAction);
  onPlaybackActionRef.current = onPlaybackAction;

  useEffect(() => {
    let animationFrame = 0;
    let disposed = false;
    const controllerStates = new Map<number, GamepadInputState>();

    const markGamepadInput = (): void => {
      document.body.dataset.echoGamepadInput = 'true';
    };

    const dispatchAction = (action: GamepadControlAction): void => {
      if (document.body.dataset[shortcutRecordingFlag] === 'true') {
        return;
      }
      markGamepadInput();
      if (action === 'activate') {
        activateFocusedElement();
      } else if (action === 'back') {
        dispatchBackKey();
      } else if (action.startsWith('focus')) {
        navigateFocus(action as GamepadNavigationAction);
      } else {
        onPlaybackActionRef.current(action as GlobalShortcutAction);
      }
    };

    const poll = (nowMs: number): void => {
      animationFrame = 0;
      if (disposed) {
        return;
      }

      const gamepads = readConnectedGamepads();
      const connectedIndexes = new Set(gamepads.map((gamepad) => gamepad.index));
      for (const index of controllerStates.keys()) {
        if (!connectedIndexes.has(index)) {
          controllerStates.delete(index);
        }
      }

      for (const gamepad of gamepads) {
        const frame = resolveGamepadFrame(
          snapshotGamepad(gamepad),
          controllerStates.get(gamepad.index) ?? emptyGamepadInputState(),
          nowMs,
        );
        controllerStates.set(gamepad.index, frame.state);
        frame.actions.forEach(dispatchAction);
      }

      if (gamepads.length > 0) {
        animationFrame = window.requestAnimationFrame(poll);
      }
    };

    const ensurePolling = (): void => {
      if (!disposed && document.hasFocus() && animationFrame === 0) {
        animationFrame = window.requestAnimationFrame(poll);
      }
    };
    const handleWindowBlur = (): void => {
      if (animationFrame !== 0) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }
      controllerStates.clear();
      delete document.body.dataset.echoGamepadInput;
    };
    const handleWindowFocus = (): void => {
      if (readConnectedGamepads().length > 0) {
        ensurePolling();
      }
    };
    const handleGamepadDisconnected = (event: GamepadEvent): void => {
      controllerStates.delete(event.gamepad.index);
    };
    const clearGamepadInputMode = (event: Event): void => {
      if (event.isTrusted) {
        delete document.body.dataset.echoGamepadInput;
      }
    };

    window.addEventListener('gamepadconnected', ensurePolling);
    window.addEventListener('gamepaddisconnected', handleGamepadDisconnected);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('keydown', clearGamepadInputMode, true);
    window.addEventListener('pointerdown', clearGamepadInputMode, true);
    if (readConnectedGamepads().length > 0) {
      ensurePolling();
    }

    return () => {
      disposed = true;
      if (animationFrame !== 0) {
        window.cancelAnimationFrame(animationFrame);
      }
      controllerStates.clear();
      delete document.body.dataset.echoGamepadInput;
      window.removeEventListener('gamepadconnected', ensurePolling);
      window.removeEventListener('gamepaddisconnected', handleGamepadDisconnected);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('keydown', clearGamepadInputMode, true);
      window.removeEventListener('pointerdown', clearGamepadInputMode, true);
    };
  }, []);

  return null;
};
