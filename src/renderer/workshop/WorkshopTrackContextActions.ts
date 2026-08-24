import type { LibraryTrack } from '../../shared/types/library';

export type WorkshopTrackContextAction = {
  key: string;
  title: string;
  description: string | null;
  pluginName: string;
  localOnly: boolean;
  ready: boolean;
  run: (track: LibraryTrack) => Promise<void>;
};

type Listener = () => void;

let currentActions: WorkshopTrackContextAction[] = [];
const listeners = new Set<Listener>();

export const getWorkshopTrackContextActions = (): readonly WorkshopTrackContextAction[] => currentActions;

export const publishWorkshopTrackContextActions = (actions: WorkshopTrackContextAction[]): void => {
  currentActions = actions;
  listeners.forEach((listener) => listener());
};

export const subscribeWorkshopTrackContextActions = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const clearWorkshopTrackContextActionsForTests = (): void => {
  currentActions = [];
  listeners.forEach((listener) => listener());
};
