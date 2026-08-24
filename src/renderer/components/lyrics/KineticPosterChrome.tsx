import { memo } from 'react';

const KineticPosterChromeComponent = (): JSX.Element => (
  <div className="lyrics-kinetic-poster-chrome" aria-hidden="true">
    <span className="lyrics-kinetic-poster-corner" data-corner="top-left" />
    <span className="lyrics-kinetic-poster-corner" data-corner="top-right" />
    <span className="lyrics-kinetic-poster-corner" data-corner="bottom-left" />
    <span className="lyrics-kinetic-poster-corner" data-corner="bottom-right" />

    <div className="lyrics-kinetic-poster-brand">
      <strong>ECHO</strong>
      <span className="lyrics-kinetic-poster-meter">
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
    </div>

    <div className="lyrics-kinetic-poster-side-note" data-side="left">
      <span>REV</span>
      <i />
      <i />
    </div>
    <div className="lyrics-kinetic-poster-side-note" data-side="right">
      <span>PLAY</span>
      <i />
    </div>

    <p className="lyrics-kinetic-poster-signature">
      <span>Kinetic Poster System</span>
      <i />
      <span>lyrics / motion</span>
    </p>
  </div>
);

export const KineticPosterChrome = memo(KineticPosterChromeComponent);
