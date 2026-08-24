import { memo } from 'react';
import type { CSSProperties } from 'react';
import type { LyricsBackgroundMode } from '../../../shared/types/appSettings';

type LyricsBackdropProps = {
  backgroundMode?: LyricsBackgroundMode;
  coverUrl: string | null;
  isActive?: boolean;
  showCover: boolean;
  previousCover?: {
    id: number;
    style: CSSProperties | undefined;
  } | null;
};

const LyricsBackdropComponent = ({ backgroundMode, coverUrl, isActive = true, showCover, previousCover }: LyricsBackdropProps): JSX.Element | null => {
  if (!isActive) {
    return null;
  }

  const sourceMode = backgroundMode ?? (showCover ? 'cover' : 'theme');

  return (
    <div className="lyrics-backdrop" aria-hidden="true">
      <div className="lyrics-backdrop-source" data-source={sourceMode}>
        {showCover && coverUrl ? (
          <img
            alt=""
            className="lyrics-backdrop-cover"
            decoding="async"
            draggable={false}
            fetchPriority="high"
            loading="eager"
            src={coverUrl}
          />
        ) : null}
        {sourceMode === 'coverColor' || sourceMode === 'customWallpaper' ? (
          <div className="lyrics-backdrop-source-media" />
        ) : null}
      </div>
      <div className="lyrics-backdrop-atmosphere" />
      {previousCover ? (
        <div
          key={previousCover.id}
          className="lyrics-backdrop-previous-cover"
          style={previousCover.style}
        />
      ) : null}
      <div className="lyrics-backdrop-theme-filter" />
    </div>
  );
};

export const LyricsBackdrop = memo(LyricsBackdropComponent);
