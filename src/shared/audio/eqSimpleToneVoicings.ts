export type EqSimpleToneId = 'bass' | 'vocal' | 'air' | 'warm' | 'flat';

type ToneAnchor = readonly [frequencyHz: number, gainDb: number];

const simpleToneAnchors: Record<Exclude<EqSimpleToneId, 'flat'>, readonly ToneAnchor[]> = {
  bass: [
    [20, 0.4],
    [31.5, 0.8],
    [50, 1.2],
    [80, 1.5],
    [100, 1.3],
    [125, 0.9],
    [160, 0.5],
    [200, 0.1],
    [315, -0.3],
    [500, -0.1],
    [1000, 0],
    [10000, 0.1],
    [20000, 0],
  ],
  vocal: [
    [20, -0.2],
    [80, -0.3],
    [160, -0.2],
    [315, 0],
    [500, 0.2],
    [800, 0.5],
    [1250, 0.8],
    [2000, 1],
    [3150, 0.6],
    [5000, 0.1],
    [6300, -0.3],
    [8000, -0.4],
    [12500, -0.1],
    [20000, 0],
  ],
  air: [
    [20, 0],
    [1000, 0],
    [3150, 0.1],
    [5000, 0.3],
    [6300, 0.5],
    [8000, 0.7],
    [10000, 0.9],
    [12500, 1.1],
    [16000, 1],
    [20000, 0.6],
  ],
  warm: [
    [20, 0.2],
    [40, 0.5],
    [80, 0.8],
    [125, 0.8],
    [200, 0.6],
    [315, 0.4],
    [500, 0.2],
    [1000, 0],
    [2000, -0.1],
    [4000, -0.3],
    [8000, -0.5],
    [12500, -0.4],
    [20000, -0.2],
  ],
};

const interpolateLogFrequency = (frequencyHz: number, anchors: readonly ToneAnchor[]): number => {
  const safeFrequencyHz = Math.max(1, frequencyHz);
  const first = anchors[0];
  const last = anchors[anchors.length - 1];

  if (!first || !last || safeFrequencyHz <= first[0]) {
    return first?.[1] ?? 0;
  }
  if (safeFrequencyHz >= last[0]) {
    return last[1];
  }

  for (let index = 1; index < anchors.length; index += 1) {
    const upper = anchors[index];
    const lower = anchors[index - 1];
    if (!upper || !lower || safeFrequencyHz > upper[0]) {
      continue;
    }

    const span = Math.log(upper[0]) - Math.log(lower[0]);
    const position = span > 0 ? (Math.log(safeFrequencyHz) - Math.log(lower[0])) / span : 0;
    return lower[1] + (upper[1] - lower[1]) * position;
  }

  return last[1];
};

export const simpleToneGainDb = (tone: EqSimpleToneId, frequencyHz: number, intensity = 1): number => {
  if (tone === 'flat') {
    return 0;
  }

  const safeIntensity = Math.max(0.5, Math.min(1.5, intensity));
  const gainDb = interpolateLogFrequency(frequencyHz, simpleToneAnchors[tone]) * safeIntensity;
  return Math.round(gainDb * 10) / 10;
};
