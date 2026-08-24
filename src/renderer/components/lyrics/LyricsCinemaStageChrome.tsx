import { memo } from 'react';

const LyricsCinemaStageChromeComponent = (): JSX.Element => (
  <div className="lyrics-cinema-stage-chrome" aria-hidden="true">
    <span className="lyrics-cinema-stage-bar" data-edge="top" />
    <span className="lyrics-cinema-stage-bar" data-edge="bottom" />
    <span className="lyrics-cinema-stage-light" />
    <span className="lyrics-cinema-stage-label">ECHO / CINEMA</span>
  </div>
);

export const LyricsCinemaStageChrome = memo(LyricsCinemaStageChromeComponent);
