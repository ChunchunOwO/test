import { useEffect, useState } from 'react';
import type { WorkshopActiveThemeBackground } from '../../shared/types/workshop';

export const useActiveWorkshopThemeBackground = (): WorkshopActiveThemeBackground | null => {
  const [background, setBackground] = useState<WorkshopActiveThemeBackground | null>(null);

  useEffect(() => {
    const workshop = window.echo?.workshop;
    if (!workshop || typeof workshop.getActiveThemeBackground !== 'function') {
      setBackground(null);
      return;
    }
    let disposed = false;
    void workshop.getActiveThemeBackground()
      .then((nextBackground) => {
        if (!disposed) setBackground(nextBackground);
      })
      .catch(() => {
        if (!disposed) setBackground(null);
      });
    const unsubscribe = typeof workshop.onActiveThemeBackgroundChanged === 'function'
      ? workshop.onActiveThemeBackgroundChanged((nextBackground) => {
          if (!disposed) setBackground(nextBackground);
        })
      : undefined;
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);

  return background;
};
