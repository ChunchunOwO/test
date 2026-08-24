import {
  uiScalePercentMax,
  uiScalePercentMin,
  uiScalePercentStep,
} from '../../shared/types/appSettings';

export const defaultMainWindowUiScalePercent = 100;

export const normalizeMainWindowUiScalePercent = (value: unknown): number => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return defaultMainWindowUiScalePercent;
  }

  const clampedValue = Math.max(uiScalePercentMin, Math.min(uiScalePercentMax, numericValue));
  return Math.round(clampedValue / uiScalePercentStep) * uiScalePercentStep;
};

export const resolveMainWindowZoomFactor = (value: unknown): number =>
  normalizeMainWindowUiScalePercent(value) / 100;

export type MainWindowUiScaleShortcutAction = 'decrease' | 'increase' | 'reset';

type MainWindowUiScaleKeyboardInput = {
  alt?: boolean;
  code?: string;
  control?: boolean;
  isComposing?: boolean;
  key?: string;
  meta?: boolean;
  type?: string;
};

export const resolveMainWindowUiScaleShortcut = (
  input: MainWindowUiScaleKeyboardInput,
): MainWindowUiScaleShortcutAction | null => {
  if (
    input.type !== 'keyDown' ||
    input.isComposing === true ||
    input.alt === true ||
    (input.control !== true && input.meta !== true)
  ) {
    return null;
  }

  const code = input.code ?? '';
  const key = input.key ?? '';
  if (code === 'Equal' || code === 'NumpadAdd' || key === '+' || key === '=') {
    return 'increase';
  }
  if (code === 'Minus' || code === 'NumpadSubtract' || key === '-' || key === '_') {
    return 'decrease';
  }
  if (code === 'Digit0' || code === 'Numpad0' || key === '0') {
    return 'reset';
  }
  return null;
};

export const adjustMainWindowUiScalePercent = (
  value: unknown,
  action: MainWindowUiScaleShortcutAction,
): number => {
  if (action === 'reset') {
    return defaultMainWindowUiScalePercent;
  }

  const current = normalizeMainWindowUiScalePercent(value);
  return normalizeMainWindowUiScalePercent(
    current + (action === 'increase' ? uiScalePercentStep : -uiScalePercentStep),
  );
};

type MainWindowUiScaleTarget = {
  isDestroyed: () => boolean;
  webContents: {
    setZoomFactor: (factor: number) => void;
  };
};

export const applyMainWindowUiScale = (
  window: MainWindowUiScaleTarget,
  uiScalePercent: unknown,
): number => {
  const zoomFactor = resolveMainWindowZoomFactor(uiScalePercent);
  if (!window.isDestroyed()) {
    window.webContents.setZoomFactor(zoomFactor);
  }
  return zoomFactor;
};
