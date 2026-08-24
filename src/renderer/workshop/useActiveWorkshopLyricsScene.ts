import { useEffect, useState } from 'react';
import type { WorkshopActiveLyricsScene } from '../../shared/types/workshopLyricsScene';

export const useActiveWorkshopLyricsScene = (): WorkshopActiveLyricsScene | null => {
  const [scene, setScene] = useState<WorkshopActiveLyricsScene | null>(null);

  useEffect(() => {
    const workshop = window.echo?.workshop;
    if (!workshop || typeof workshop.getActiveLyricsScene !== 'function') {
      setScene(null);
      return;
    }
    let disposed = false;
    void workshop.getActiveLyricsScene()
      .then((nextScene) => {
        if (!disposed) setScene(nextScene);
      })
      .catch(() => {
        if (!disposed) setScene(null);
      });
    const unsubscribe = typeof workshop.onActiveLyricsSceneChanged === 'function'
      ? workshop.onActiveLyricsSceneChanged((nextScene) => {
          if (!disposed) setScene(nextScene);
        })
      : undefined;
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);

  return scene;
};
