import { useEffect, useState } from 'react';
import type { WorkshopActiveThemeBackground } from '../../shared/types/workshop';
import { readThemeCustomId } from '../preferences/themePreferences';
import { getAppBridge } from '../utils/echoBridge';

const readActiveWorkshopThemeId = async (): Promise<string | null> => {
  try {
    const settings = await getAppBridge()?.getSettings();
    if (typeof settings?.appearanceThemeCustomId === 'string') {
      return settings.appearanceThemeCustomId;
    }
  } catch {
    // Fall through to the locally persisted custom theme id.
  }
  return readThemeCustomId();
};

export const useActiveWorkshopThemeSelection = (
  background: WorkshopActiveThemeBackground | null,
): boolean => {
  const [customThemeId, setCustomThemeId] = useState<string | null>(() => readThemeCustomId());

  useEffect(() => {
    let disposed = false;
    const refresh = (): void => {
      void readActiveWorkshopThemeId().then((nextId) => {
        if (!disposed) setCustomThemeId(nextId);
      });
    };
    refresh();
    const onSettingsChanged = (event: Event): void => {
      const patch = event instanceof CustomEvent
        ? event.detail as { appearanceThemeCustomId?: string | null } | null
        : null;
      if (patch && Object.prototype.hasOwnProperty.call(patch, 'appearanceThemeCustomId')) {
        setCustomThemeId(typeof patch.appearanceThemeCustomId === 'string'
          ? patch.appearanceThemeCustomId
          : null);
        return;
      }
      refresh();
    };
    window.addEventListener('settings:changed', onSettingsChanged);
    return () => {
      disposed = true;
      window.removeEventListener('settings:changed', onSettingsChanged);
    };
  }, []);

  return Boolean(background && customThemeId === background.themeId);
};
