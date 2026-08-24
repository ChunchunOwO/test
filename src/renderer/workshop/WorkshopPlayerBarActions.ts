import type { PluginPlayerBarActionIcon } from '../../shared/types/plugins';

export type WorkshopPlayerBarAction = {
  key: string;
  title: string;
  description: string | null;
  pluginName: string;
  icon: PluginPlayerBarActionIcon;
  ready: boolean;
  run: () => Promise<void>;
};

type Listener = () => void;

let currentActions: WorkshopPlayerBarAction[] = [];
const listeners = new Set<Listener>();

export const getWorkshopPlayerBarActions = (): readonly WorkshopPlayerBarAction[] => currentActions;

export const publishWorkshopPlayerBarActions = (actions: WorkshopPlayerBarAction[]): void => {
  currentActions = actions;
  listeners.forEach((listener) => listener());
};

export const subscribeWorkshopPlayerBarActions = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const clearWorkshopPlayerBarActionsForTests = (): void => {
  currentActions = [];
  listeners.forEach((listener) => listener());
};
