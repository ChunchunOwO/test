import { memo, type CSSProperties } from 'react';

type CinemaParticleStyle = CSSProperties & {
  '--cinema-particle-band': string;
  '--cinema-particle-depth': string;
  '--cinema-particle-drift-x': string;
  '--cinema-particle-drift-y': string;
  '--cinema-particle-response': string;
  '--cinema-particle-size': string;
};

const cinemaParticleCount = 24;

const seededUnit = (index: number, salt: number): number => {
  const value = Math.sin((index + 1) * (salt * 17.31 + 5.73)) * 43758.5453;
  return value - Math.floor(value);
};

const cinemaParticles = Array.from({ length: cinemaParticleCount }, (_, index) => {
  const bandIndex = index % 12;
  const frequency = bandIndex < 4 ? 'low' : bandIndex < 8 ? 'mid' : 'high';
  const x = 5 + seededUnit(index, 1) * 90;
  const y = 12 + seededUnit(index, 2) * 76;
  const size = 1.4 + seededUnit(index, 3) * 3.2;
  const depth = 0.52 + seededUnit(index, 4) * 0.64;
  const driftX = -34 + seededUnit(index, 5) * 68;
  const driftY = -(10 + seededUnit(index, 6) * 34);
  const response = 0.62 + seededUnit(index, 7) * 0.7;

  return {
    frequency,
    key: `cinema-particle-${index}`,
    style: {
      left: `${x.toFixed(2)}%`,
      top: `${y.toFixed(2)}%`,
      '--cinema-particle-band': `var(--lyrics-reactive-band-${bandIndex})`,
      '--cinema-particle-depth': depth.toFixed(3),
      '--cinema-particle-drift-x': `${driftX.toFixed(2)}px`,
      '--cinema-particle-drift-y': `${driftY.toFixed(2)}px`,
      '--cinema-particle-response': response.toFixed(3),
      '--cinema-particle-size': `${size.toFixed(2)}px`,
    } satisfies CinemaParticleStyle,
  };
});

const LyricsCinemaStageParticlesComponent = (): JSX.Element => (
  <div
    className="lyrics-cinema-stage-particles"
    data-particle-count={cinemaParticleCount}
    aria-hidden="true"
  >
    {cinemaParticles.map((particle) => (
      <span
        key={particle.key}
        data-frequency={particle.frequency}
        style={particle.style}
      />
    ))}
  </div>
);

export const LyricsCinemaStageParticles = memo(LyricsCinemaStageParticlesComponent);
