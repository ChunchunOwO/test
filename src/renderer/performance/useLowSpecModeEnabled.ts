import { useEffect, useState } from 'react';
import type { AppSettings } from '../../shared/types/appSettings';
import { isLowSpecModeDomActive, isLowSpecModeEnabled } from '../../shared/utils/performancePolicy';

const readLowSpecModeFromEvent = (event: Event): boolean | null => {
  if (!(event instanceof CustomEvent) || !event.detail || typeof event.detail !== 'object') {
    return null;
  }

  if (!Object.prototype.hasOwnProperty.call(event.detail, 'lowSpecModeEnabled')) {
    return null;
  }

  return (event.detail as Pick<AppSettings, 'lowSpecModeEnabled'>).lowSpecModeEnabled === true;
};

export const useLowSpecModeEnabled = (): boolean => {
  const [enabled, setEnabled] = useState(isLowSpecModeDomActive);

  useEffect(() => {
    let cancelled = false;

    const apply = (settings: Partial<AppSettings> | null | undefined): void => {
      if (!cancelled) {
        setEnabled(isLowSpecModeEnabled(settings));
      }
    };

    void window.echo?.app?.getSettings?.().then(apply).catch(() => apply(null));

    const handleSettingsChanged = (event: Event): void => {
      const fromPatch = readLowSpecModeFromEvent(event);
      if (fromPatch !== null) {
        apply({ lowSpecModeEnabled: fromPatch });
        return;
      }

      void window.echo?.app?.getSettings?.().then(apply).catch(() => apply(null));
    };

    window.addEventListener('settings:changed', handleSettingsChanged);
    return () => {
      cancelled = true;
      window.removeEventListener('settings:changed', handleSettingsChanged);
    };
  }, []);

  return enabled;
};
