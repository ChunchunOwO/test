import { useEffect, useState } from 'react';
import {
  collectWorkshopThemeOptions,
  type PluginThemeOption,
} from './themeSettingsModel';

export const useWorkshopThemeOptions = (enabled: boolean): PluginThemeOption[] => {
  const [themes, setThemes] = useState<PluginThemeOption[]>([]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let active = true;
    const refresh = async (): Promise<void> => {
      try {
        const snapshot = await window.echo?.workshop?.getPlugins?.();
        if (active) {
          setThemes(collectWorkshopThemeOptions(snapshot?.plugins ?? []));
        }
      } catch {
        if (active) {
          setThemes([]);
        }
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [enabled]);

  return themes;
};
