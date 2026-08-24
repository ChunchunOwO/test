import { useEffect, useState } from 'react';
import type { WorkshopActiveVisualizerPreset } from '../../shared/types/workshop';

export const useActiveWorkshopVisualizerPreset = (): WorkshopActiveVisualizerPreset | null => {
  const [preset, setPreset] = useState<WorkshopActiveVisualizerPreset | null>(null);

  useEffect(() => {
    const workshop = window.echo?.workshop;
    if (!workshop || typeof workshop.getActiveVisualizerPreset !== 'function') {
      setPreset(null);
      return;
    }
    let disposed = false;
    void workshop.getActiveVisualizerPreset()
      .then((nextPreset) => {
        if (!disposed) setPreset(nextPreset);
      })
      .catch(() => {
        if (!disposed) setPreset(null);
      });
    const unsubscribe = typeof workshop.onActiveVisualizerPresetChanged === 'function'
      ? workshop.onActiveVisualizerPresetChanged((nextPreset) => {
          if (!disposed) setPreset(nextPreset);
        })
      : undefined;
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);

  return preset;
};
