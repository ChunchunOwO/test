import type { WebContents } from 'electron';

const activeRuntimeContents = new WeakSet<WebContents>();

type RuntimeEmergencyInput = Pick<Electron.Input, 'type' | 'key' | 'control' | 'shift' | 'alt' | 'meta'>;

export const isWorkshopUiRuntimeEmergencyExitInput = (input: RuntimeEmergencyInput): boolean =>
  input.type === 'keyDown' && input.key === 'F12' && input.control && input.shift &&
  !input.alt && !input.meta;

export const setWorkshopUiRuntimeActive = (contents: WebContents, active: boolean): void => {
  if (active) {
    activeRuntimeContents.add(contents);
  } else {
    activeRuntimeContents.delete(contents);
  }
};

export const isWorkshopUiRuntimeActive = (contents: WebContents): boolean =>
  activeRuntimeContents.has(contents);
