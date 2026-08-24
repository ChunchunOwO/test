const dedicatedCodeAliases = new Map<string, string>([
  [' ', 'Space'],
  ['Space', 'Space'],
  ['Spacebar', 'Space'],
  ['ArrowLeft', 'Left'],
  ['ArrowRight', 'Right'],
  ['ArrowUp', 'Up'],
  ['ArrowDown', 'Down'],
  ['Escape', 'Esc'],
  ['Home', 'Home'],
  ['End', 'End'],
  ['PageUp', 'PageUp'],
  ['PageDown', 'PageDown'],
  ['Insert', 'Insert'],
  ['Delete', 'Delete'],
  ['Backspace', 'Backspace'],
  ['Tab', 'Tab'],
  ['Enter', 'Enter'],
  ['NumpadEnter', 'Enter'],
  ['Pause', 'Pause'],
  ['PrintScreen', 'PrintScreen'],
  ['ScrollLock', 'Scrolllock'],
  ['CapsLock', 'Capslock'],
  ['NumLock', 'Numlock'],
  ['ContextMenu', 'ContextMenu'],
  ['Help', 'Help'],
  ['Clear', 'Clear'],
  ['Add', 'Plus'],
  ['NumpadAdd', 'numadd'],
  ['Subtract', '-'],
  ['NumpadSubtract', 'numsub'],
  ['Multiply', '*'],
  ['NumpadMultiply', 'nummult'],
  ['Divide', '/'],
  ['NumpadDivide', 'numdiv'],
  ['Decimal', '.'],
  ['NumpadDecimal', 'numdec'],
  ['NumpadEqual', '='],
  ['NumpadComma', ','],
  ['MediaPlayPause', 'MediaPlayPause'],
  ['MediaPlay', 'MediaPlayPause'],
  ['MediaPause', 'MediaPlayPause'],
  ['MediaNextTrack', 'MediaNextTrack'],
  ['MediaTrackNext', 'MediaNextTrack'],
  ['MediaPreviousTrack', 'MediaPreviousTrack'],
  ['MediaTrackPrevious', 'MediaPreviousTrack'],
  ['MediaStop', 'MediaStop'],
  ['AudioVolumeUp', 'VolumeUp'],
  ['VolumeUp', 'VolumeUp'],
  ['AudioVolumeDown', 'VolumeDown'],
  ['VolumeDown', 'VolumeDown'],
  ['AudioVolumeMute', 'VolumeMute'],
  ['VolumeMute', 'VolumeMute'],
  ['BrowserBack', 'BrowserBack'],
  ['BrowserForward', 'BrowserForward'],
  ['BrowserHome', 'BrowserHome'],
  ['BrowserRefresh', 'BrowserRefresh'],
  ['BrowserSearch', 'BrowserSearch'],
  ['BrowserStop', 'BrowserStop'],
  ['BrowserFavorites', 'BrowserFavorites'],
  ['LaunchMail', 'LaunchMail'],
  ['LaunchApp1', 'LaunchApp1'],
  ['LaunchApp2', 'LaunchApp2'],
  ['LaunchMediaPlayer', 'LaunchMediaPlayer'],
  ['Lang1', 'Lang1'],
  ['Lang2', 'Lang2'],
  ['Convert', 'Convert'],
  ['NonConvert', 'NonConvert'],
  ['KanaMode', 'KanaMode'],
  ['IntlBackslash', '\\'],
  ['IntlRo', 'Ro'],
  ['IntlYen', 'Yen'],
  ['Backquote', '`'],
]);

const shortcutKeyAliases = new Map<string, string>([
  [' ', 'Space'],
  ['Spacebar', 'Space'],
  ['ArrowLeft', 'Left'],
  ['ArrowRight', 'Right'],
  ['ArrowUp', 'Up'],
  ['ArrowDown', 'Down'],
  ['Escape', 'Esc'],
  ['+', 'Plus'],
  ['Add', 'Plus'],
  ['Subtract', '-'],
  ['Multiply', '*'],
  ['Divide', '/'],
  ['Decimal', '.'],
  ['AudioVolumeUp', 'VolumeUp'],
  ['VolumeUp', 'VolumeUp'],
  ['AudioVolumeDown', 'VolumeDown'],
  ['VolumeDown', 'VolumeDown'],
  ['AudioVolumeMute', 'VolumeMute'],
  ['VolumeMute', 'VolumeMute'],
  ['MediaPlay', 'MediaPlayPause'],
  ['MediaPause', 'MediaPlayPause'],
  ['MediaTrackNext', 'MediaNextTrack'],
  ['MediaTrackPrevious', 'MediaPreviousTrack'],
  ['Return', 'Enter'],
  ['CapsLock', 'Capslock'],
  ['NumLock', 'Numlock'],
  ['ScrollLock', 'Scrolllock'],
  ['ContextMenu', 'ContextMenu'],
  ['Apps', 'ContextMenu'],
]);

const unidentifiedKeys = new Set(['Unidentified', 'Dead', 'Process']);
const modifierKeys = new Set(['Control', 'Alt', 'Shift', 'Meta', 'AltGraph']);
const namedKeyPattern = /^[A-Za-z][A-Za-z0-9]+$/u;
const functionKeyPattern = /^F(?:[1-9]|1[0-9]|2[0-4])$/u;

const mouseButtonByIndex: Record<number, string> = {
  1: 'MouseButton3',
  3: 'MouseButton4',
  4: 'MouseButton5',
};

const keyboardModifiers = (event: KeyboardEvent | MouseEvent): string[] =>
  [
    event.ctrlKey ? 'Ctrl' : null,
    event.altKey ? 'Alt' : null,
    event.shiftKey ? 'Shift' : null,
    'metaKey' in event && event.metaKey ? 'Command' : null,
  ].filter((item): item is string => Boolean(item));

const dedicatedKeyFromCode = (code: string): string | null => {
  const aliased = dedicatedCodeAliases.get(code);
  if (aliased) {
    return aliased;
  }

  if (functionKeyPattern.test(code)) {
    return code.toUpperCase();
  }

  if (/^Key[A-Z]$/u.test(code)) {
    return code.slice(3);
  }

  if (/^Digit[0-9]$/u.test(code)) {
    return code.slice(5);
  }

  if (/^Numpad[0-9]$/u.test(code)) {
    return `num${code.slice(6)}`;
  }

  return null;
};

export const normalizeShortcutEventKey = (event: KeyboardEvent): string | null => {
  if (modifierKeys.has(event.key)) {
    return null;
  }

  const dedicated = dedicatedKeyFromCode(event.code);
  if (dedicated) {
    return dedicated;
  }

  if (unidentifiedKeys.has(event.key)) {
    return event.code && event.code !== 'Unidentified' && namedKeyPattern.test(event.code) ? event.code : null;
  }

  const aliasedKey = shortcutKeyAliases.get(event.key);
  if (aliasedKey) {
    return aliasedKey;
  }

  if (event.key.length === 1) {
    return event.key.toUpperCase();
  }

  if (namedKeyPattern.test(event.key)) {
    return `${event.key.charAt(0).toUpperCase()}${event.key.slice(1)}`;
  }

  return null;
};

export const acceleratorFromKeyboardEvent = (event: KeyboardEvent): string | null => {
  const key = normalizeShortcutEventKey(event);
  if (!key) {
    return null;
  }

  return [...keyboardModifiers(event), key].join('+');
};

export const acceleratorFromMouseEvent = (
  event: MouseEvent,
  options?: { includeModifiers?: boolean },
): string | null => {
  const button = mouseButtonByIndex[event.button];
  if (!button) {
    return null;
  }

  if (!options?.includeModifiers) {
    return button;
  }

  return [...keyboardModifiers(event), button].join('+');
};

const mouseButtonShortcutPattern = /(?:^|\+)mousebutton[3-5]$/iu;

export const acceleratorUsesMouseButton = (accelerator: string | null | undefined): boolean =>
  typeof accelerator === 'string' && mouseButtonShortcutPattern.test(accelerator);

export const formatAcceleratorForDisplay = (
  accelerator: string | null | undefined,
  emptyLabel: string,
  keyLabels?: Record<string, string>,
): string => {
  if (!accelerator) {
    return emptyLabel;
  }

  return accelerator
    .split('+')
    .map((part) => keyLabels?.[part] ?? part)
    .join(' + ');
};

const isTextEditingElement = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) {
    return false;
  }

  const editableTarget = target.closest(
    'input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"], [role="textbox"]',
  );
  return Boolean(editableTarget) || target instanceof HTMLElement && target.isContentEditable;
};

export const isShortcutTextTarget = (event: KeyboardEvent): boolean =>
  event.composedPath().some((target) => isTextEditingElement(target)) || isTextEditingElement(document.activeElement);
