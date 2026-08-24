import { useLayoutEffect, useRef, useState } from 'react';
import {
  completeAlbumCoverEnter,
  dismissAlbumCoverEnterLayer,
  hasPendingAlbumCoverEnter,
  retainAlbumCoverEnter,
} from '../utils/albumCoverEnterTransition';

export const useAlbumCoverEnterTransition = (
  albumId: string,
  coverRef: { current: HTMLElement | null },
): { isCoverEntering: boolean; skipPageEnter: boolean } => {
  const [isCoverEntering, setIsCoverEntering] = useState(() => hasPendingAlbumCoverEnter());
  const skipPageEnterRef = useRef(isCoverEntering);

  if (isCoverEntering) {
    skipPageEnterRef.current = true;
  }

  useLayoutEffect(() => {
    const cover = coverRef.current;
    if (!cover || !hasPendingAlbumCoverEnter()) {
      setIsCoverEntering(false);
      return undefined;
    }

    const release = retainAlbumCoverEnter();
    skipPageEnterRef.current = true;
    setIsCoverEntering(true);
    completeAlbumCoverEnter(cover, () => setIsCoverEntering(false));
    return release;
  }, [albumId, coverRef]);

  useLayoutEffect(() => {
    if (isCoverEntering) {
      return undefined;
    }

    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!cancelled) {
          dismissAlbumCoverEnterLayer();
        }
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [isCoverEntering]);

  return { isCoverEntering, skipPageEnter: skipPageEnterRef.current };
};
