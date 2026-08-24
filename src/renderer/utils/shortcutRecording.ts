import { isImeComposingKeyEvent } from './imeInput';
import { acceleratorFromKeyboardEvent, acceleratorFromMouseEvent } from './shortcutAccelerator';

type ShortcutRecordingListeners = {
  includeMouseModifiers?: boolean;
  onAccelerator: (accelerator: string) => void;
  onCancel: () => void;
};

export const bindShortcutRecordingListeners = ({
  includeMouseModifiers = false,
  onAccelerator,
  onCancel,
}: ShortcutRecordingListeners): (() => void) => {
  document.body.dataset.echoShortcutRecording = 'true';
  let consumed = false;

  const emit = (accelerator: string): void => {
    if (consumed) {
      return;
    }

    consumed = true;
    onAccelerator(accelerator);
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (isImeComposingKeyEvent(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (event.key === 'Escape') {
      consumed = true;
      onCancel();
      return;
    }

    const accelerator = acceleratorFromKeyboardEvent(event);
    if (!accelerator) {
      return;
    }

    emit(accelerator);
  };

  const handleMouse = (event: MouseEvent): void => {
    const accelerator = acceleratorFromMouseEvent(event, { includeModifiers: includeMouseModifiers });
    if (!accelerator) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    emit(accelerator);
  };

  const handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
  };

  window.addEventListener('keydown', handleKeyDown, true);
  window.addEventListener('mousedown', handleMouse, true);
  window.addEventListener('mouseup', handleMouse, true);
  window.addEventListener('auxclick', handleMouse, true);
  window.addEventListener('contextmenu', handleContextMenu, true);

  return () => {
    window.removeEventListener('keydown', handleKeyDown, true);
    window.removeEventListener('mousedown', handleMouse, true);
    window.removeEventListener('mouseup', handleMouse, true);
    window.removeEventListener('auxclick', handleMouse, true);
    window.removeEventListener('contextmenu', handleContextMenu, true);
    delete document.body.dataset.echoShortcutRecording;
  };
};
