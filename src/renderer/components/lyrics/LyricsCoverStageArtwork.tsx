import { memo, useEffect, useState } from 'react';
import { Disc3 } from 'lucide-react';
import {
  albumCoverUrlFromCachedVariant,
  remoteCoverUrlAtSize,
} from '../../utils/coverDisplayUrl';

type LyricsCoverStageArtworkProps = {
  artworkUrl: string | null;
  isActive: boolean;
};

const scheduleHiddenArtworkRelease = (callback: () => void): (() => void) => {
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(callback, { timeout: 250 });
    return () => window.cancelIdleCallback?.(handle);
  }

  const handle = window.setTimeout(callback, 120);
  return () => window.clearTimeout(handle);
};

const LyricsCoverStageArtworkComponent = ({
  artworkUrl,
  isActive,
}: LyricsCoverStageArtworkProps): JSX.Element | null => {
  const [hiddenArtworkReleased, setHiddenArtworkReleased] = useState(!isActive);

  useEffect(() => {
    if (isActive) {
      setHiddenArtworkReleased(false);
      return undefined;
    }

    return scheduleHiddenArtworkRelease(() => setHiddenArtworkReleased(true));
  }, [isActive]);

  if (!isActive && hiddenArtworkReleased) {
    return null;
  }

  const effectArtworkUrl = albumCoverUrlFromCachedVariant(artworkUrl)
    ?? remoteCoverUrlAtSize(artworkUrl, 320)
    ?? artworkUrl;

  return (
    <div className="lyrics-cover-stage-artwork" data-empty={!artworkUrl} aria-hidden="true">
      {artworkUrl ? (
        <>
          <img
            className="lyrics-cover-stage-color-field"
            key={`${effectArtworkUrl}-color-field`}
            alt=""
            decoding="async"
            draggable={false}
            fetchPriority="low"
            src={effectArtworkUrl ?? artworkUrl}
          />
          <img
            className="lyrics-cover-stage-bridge"
            key={`${effectArtworkUrl}-bridge`}
            alt=""
            decoding="async"
            draggable={false}
            fetchPriority="low"
            src={effectArtworkUrl ?? artworkUrl}
          />
          <img
            className="lyrics-cover-stage-image"
            key={artworkUrl}
            alt=""
            decoding="async"
            draggable={false}
            fetchPriority="high"
            src={artworkUrl}
          />
        </>
      ) : (
        <Disc3 size={72} strokeWidth={1.2} />
      )}
    </div>
  );
};

export const LyricsCoverStageArtwork = memo(LyricsCoverStageArtworkComponent);
