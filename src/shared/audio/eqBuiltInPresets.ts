import {
  eqFrequenciesHz,
  eqMaxGainDb,
  eqMinGainDb,
  type EqBand,
  type EqState,
} from '../types/eq';

export type BuiltInEqPresetDefinition = {
  id: string;
  name: string;
  preampDb: number;
  gains: number[];
  sourceLabel?: string;
  sourceUrl?: string;
};

type CurveAnchor = readonly [frequencyHz: number, gainDb: number];

// ECHO's 31 fixed centers are approximately one third of an octave apart.
// A Q near 4.3 prevents the heavy overlap and unintended 5-9 dB summation caused by Q=1.
export const builtInGraphicEqQ = 4.318;

// Preamp only covers the measured 31-band response peak plus this small safety pad.
// Extra attenuation makes presets feel quieter than the source.
export const builtInEqPreampSafetyDb = 0.2;
export const builtInEqPreampMaxExtraDb = 0.3;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const interpolateLogFrequency = (frequencyHz: number, anchors: readonly CurveAnchor[]): number => {
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (!first || !last || frequencyHz <= first[0]) return first?.[1] ?? 0;
  if (frequencyHz >= last[0]) return last[1];

  for (let index = 1; index < anchors.length; index += 1) {
    const lower = anchors[index - 1];
    const upper = anchors[index];
    if (!lower || !upper || frequencyHz > upper[0]) continue;
    const span = Math.log(upper[0]) - Math.log(lower[0]);
    const position = span > 0 ? (Math.log(frequencyHz) - Math.log(lower[0])) / span : 0;
    return lower[1] + (upper[1] - lower[1]) * position;
  }

  return last[1];
};

const curve = (anchors: readonly CurveAnchor[]): number[] =>
  eqFrequenciesHz.map((frequencyHz) => {
    const gainDb = Math.round(interpolateLogFrequency(frequencyHz, anchors) * 10) / 10;
    return Object.is(gainDb, -0) ? 0 : gainDb;
  });

const preset = (
  id: string,
  name: string,
  preampDb: number,
  anchors: readonly CurveAnchor[],
  source?: Pick<BuiltInEqPresetDefinition, 'sourceLabel' | 'sourceUrl'>,
): BuiltInEqPresetDefinition => ({ id, name, preampDb, gains: curve(anchors), ...source });

const autoEqTargetUrl = (fileName: string): string =>
  `https://github.com/jaakkopasanen/AutoEq/blob/master/targets/${encodeURIComponent(fileName)}`;

const harmanReference = (fileName: string, label: string): Pick<BuiltInEqPresetDefinition, 'sourceLabel' | 'sourceUrl'> => ({
  sourceLabel: `${label}; broad ECHO voicing only, not headphone correction`,
  sourceUrl: autoEqTargetUrl(fileName),
});

export const builtInEqPresetDefinitions: BuiltInEqPresetDefinition[] = [
  { id: 'flat', name: 'Flat', preampDb: 0, gains: Array.from({ length: eqFrequenciesHz.length }, () => 0) },

  // Restrained preference voicings, not headphone corrections. Guardrails: ±2 dB, ≤0.7 dB per adjacent 1/3-oct band.
  // AutoEq URLs name the reference shape; the 31-band curve is a broad ECHO voicing of that shape.
  // Preamp tracks the measured response peak with builtInEqPreampSafetyDb; do not pad extra headroom.
  preset('harman-target', 'Harman Inspired · Balanced', -2.3, [[20, 0.6], [40, 1.2], [63, 1.5], [100, 1.2], [200, 0.4], [500, 0], [1000, 0], [2000, 0.2], [3150, 0.4], [5000, 0.1], [8000, -0.2], [12500, 0.1], [20000, 0]], harmanReference('Harman over-ear 2018.csv', 'Harman over-ear preference reference')),
  preset('harman-in-ear', 'Harman Inspired · In-Ear', -2.9, [[20, 1.6], [40, 1.8], [80, 1.5], [160, 0.7], [315, 0], [1000, 0], [2000, 0.3], [3150, 0.6], [5000, 0.2], [8000, -0.3], [12500, -0.2], [20000, 0]], harmanReference('Harman in-ear 2019.csv', 'Harman in-ear preference reference')),
  preset('diffuse-field', 'Diffuse Inspired · Open', -0.9, [[20, -0.4], [80, -0.3], [200, 0], [1000, 0], [2000, 0.2], [3150, 0.5], [5000, 0.3], [8000, 0], [12500, -0.2], [20000, -0.2]]),
  preset('bk-room-curve', 'Room Tilt · Gentle', -2.2, [[20, 1.2], [63, 1.3], [200, 0.6], [1000, 0], [4000, -0.6], [10000, -1.2], [20000, -1.5]]),
  preset('harman-over-ear-2013', 'Harman Inspired · OE Light', -1.2, [[20, 0.3], [63, 0.7], [200, 0.3], [1000, 0], [3000, 0.4], [6000, 0], [10000, -0.4], [20000, -0.3]], harmanReference('Harman over-ear 2013.csv', 'Harman over-ear 2013 reference')),
  preset('harman-over-ear-2015', 'Harman Inspired · OE Warm', -2.2, [[20, 0.7], [63, 1.3], [120, 1], [250, 0.3], [1000, 0], [3000, 0.4], [6000, 0.1], [10000, -0.4], [20000, -0.3]], harmanReference('Harman over-ear 2015.csv', 'Harman over-ear 2015 reference')),
  preset('harman-over-ear-2018-no-bass', 'Harman Inspired · OE Lean', -1.1, [[20, -0.3], [100, 0], [1000, 0], [2500, 0.6], [4000, 0.7], [8000, -0.2], [16000, -0.3], [20000, -0.2]], harmanReference('Harman over-ear 2018 without bass.csv', 'Harman over-ear 2018 reference')),
  preset('harman-in-ear-2016', 'Harman Inspired · IE Warm', -2.6, [[20, 1.4], [50, 1.6], [100, 1.3], [200, 0.6], [1000, 0], [3000, 0.3], [6000, -0.2], [10000, -0.5], [20000, -0.3]], harmanReference('Harman in-ear 2016.csv', 'Harman in-ear 2016 reference')),
  preset('harman-in-ear-2017', 'Harman Inspired · IE Lively', -2.9, [[20, 1.6], [50, 1.8], [100, 1.2], [250, 0.2], [1000, 0], [2500, 0.7], [3150, 0.9], [5000, 0.4], [8000, -0.3], [16000, -0.2], [20000, -0.2]], harmanReference('Harman in-ear 2017-1.csv', 'Harman in-ear 2017 reference')),
  preset('harman-in-ear-2019-no-bass', 'Harman Inspired · IE Lean', -1.3, [[20, 0], [100, 0.1], [1000, 0], [2500, 0.7], [4000, 0.8], [8000, -0.2], [16000, -0.4], [20000, -0.3]], harmanReference('Harman in-ear 2019 without bass.csv', 'Harman in-ear 2019 reference')),
  preset('harman-speaker-room-2013', 'Room Preference · Warm Tilt', -2.5, [[20, 1.5], [63, 1.6], [200, 0.8], [1000, 0], [4000, -0.3], [10000, -0.6], [20000, -0.8]], harmanReference('Harman loudspeaker in-room flat 2013.csv', 'Harman loudspeaker room reference')),
  preset('diffuse-field-iso-11904-1', 'Diffuse Inspired · ISO Mild', -1.7, [[20, -0.4], [100, -0.3], [1000, 0], [2500, 0.7], [4000, 1.1], [6300, 0.2], [10000, -0.1], [16000, -0.3], [20000, -0.3]], harmanReference('Diffuse field ISO 11904-1.csv', 'Diffuse-field reference')),
  preset('diffuse-field-gras-kemar', 'Diffuse Inspired · KEMAR Mild', -1.4, [[20, -0.3], [100, -0.2], [1000, 0], [2500, 0.2], [4000, 0.3], [6300, 1], [8000, 0.7], [10000, 0.1], [16000, -0.3], [20000, -0.3]], harmanReference('Diffuse field GRAS KEMAR.csv', 'GRAS KEMAR diffuse-field reference')),
  preset('diffuse-field-5128', 'Diffuse Inspired · 5128 Mild', -1.2, [[20, -0.2], [100, -0.1], [1000, 0], [2500, 0.3], [4000, 0.4], [8000, 0.8], [10000, 0.7], [16000, -0.2], [20000, -0.3]], harmanReference('Diffuse field 5128.csv', '5128 diffuse-field reference')),

  // Everyday voicings: each curve has one audible job. Tiny 0.1 dB decoration is not a voicing.
  // Studio: slight 250 Hz tightness, forward 2.5 kHz like a close monitor.
  preset('studio-neutral', 'Studio Neutral', -1.1, [[20, 0], [80, 0], [250, -0.5], [500, -0.3], [1000, 0], [2500, 0.6], [4000, 0.5], [8000, 0.2], [16000, 0], [20000, 0]]),
  // Deep bass shelf. Keep 20-63 Hz up; do not peak at 80-90 Hz or notch 300 Hz.
  preset('bass-boost', 'Bass Punch', -2.5, [[20, 1.4], [40, 1.5], [63, 1.4], [100, 1], [160, 0.5], [250, 0.1], [400, 0], [20000, 0]]),
  // Silk vocal: 2.5 kHz presence with air kept. Cutting 8 kHz after a 2 kHz boost sounds nasal.
  preset('vocal-clear', 'Vocal Clarity', -1.6, [[20, -0.4], [100, -0.5], [250, -0.2], [500, 0.2], [1000, 0.5], [2000, 0.7], [2500, 1], [4000, 0.7], [6300, 0.3], [8000, 0.3], [12500, 0.2], [16000, 0], [20000, 0]]),
  preset('treble-sparkle', 'Treble Sparkle', -1.9, [[20, 0], [2000, 0], [4000, 0.1], [6300, 0.5], [8000, 0.9], [10000, 1.3], [12500, 1.5], [16000, 1], [20000, 0.4]]),
  // Low-volume loudness: bass + air up, 1 kHz dip. A 0.2 dB mid cut is not a contour.
  preset('loudness', 'Low-Volume Contour', -2.7, [[20, 1.5], [50, 1.7], [100, 1.2], [250, 0.4], [500, 0], [1000, -0.5], [2000, -0.4], [4000, 0], [8000, 0.8], [12500, 1.2], [20000, 0.6]]),
  // Night: less rumble and less air, speech left intact. Do not add a 2.5 kHz island on a dark tilt.
  preset('night', 'Night Listening', -0.6, [[20, -1], [63, -0.8], [125, -0.4], [250, -0.1], [1000, 0.2], [2000, 0.3], [4000, 0], [6300, -0.5], [10000, -1], [16000, -1.3], [20000, -1.3]]),
  // Warmth lives in 100-250 Hz, not a sub-bass shelf.
  preset('headphone-warm', 'Headphone Warmth', -2.1, [[20, 0.3], [63, 1], [125, 1.3], [250, 0.9], [500, 0.3], [1000, 0], [2500, -0.3], [5000, -0.6], [8000, -0.8], [16000, -0.6], [20000, -0.4]]),
  // Anime/J-Pop: tight 250 Hz, 3.5 kHz vocal edge, 10 kHz sparkle.
  preset('anime-jpop', 'Anime / J-Pop', -1.8, [[20, 0.2], [50, 0.6], [100, 0.3], [250, -0.5], [500, -0.2], [1000, 0.2], [2000, 0.7], [3500, 1.2], [6000, 0.6], [10000, 0.9], [16000, 0.5], [20000, 0.2]]),
  // Rock: 63 Hz kick, 400-800 Hz scoop, 4 kHz crunch. Not a copy of the live-house V.
  preset('rock', 'Rock Drive', -2.3, [[20, 0.5], [63, 1.5], [100, 1.1], [200, 0.1], [400, -0.6], [800, -0.8], [1600, 0.2], [2500, 0.8], [4000, 1.2], [8000, 0.5], [16000, 0.1], [20000, 0]]),
  // Hall: mild low warmth and 8-12 kHz air. 0.1 dB wiggles are not a hall.
  preset('classical', 'Classical Hall', -1.2, [[20, 0.3], [80, 0.6], [200, 0.3], [500, 0], [1000, 0], [4000, 0.4], [8000, 0.7], [12500, 0.8], [20000, 0.3]]),
  preset('classic-smiley', 'Gentle V', -2.5, [[20, 0.8], [63, 1.6], [125, 1], [250, 0], [500, -0.6], [1000, -0.7], [2000, -0.2], [4000, 0.3], [8000, 1], [12500, 1.3], [20000, 0.5]]),
  preset('vinyl-warmth', 'Vinyl Warmth', -2, [[20, 0.4], [50, 0.8], [100, 1.2], [200, 1.1], [400, 0.4], [1000, 0], [3000, -0.3], [6000, -0.8], [10000, -1.2], [16000, -1.5], [20000, -1.5]]),
  // Broadcast: rumble cut, 2 kHz speech, de-essed air. Opposite of vocal-clear's kept air.
  preset('broadcast-voice', 'Broadcast Voice', -2.1, [[20, -1.4], [80, -1.1], [160, -0.6], [315, 0], [500, 0.4], [1000, 0.8], [2000, 1.3], [3150, 0.9], [5000, 0.1], [8000, -0.5], [12500, -0.9], [20000, -1.1]]),
  // City pop: warm 63-125 Hz and silky 8-12 kHz, not a 4 kHz V.
  preset('city-pop', 'Neon City Pop', -2, [[20, 0.6], [63, 1.2], [125, 0.9], [250, 0.3], [500, 0], [1000, 0.1], [2000, 0.2], [4000, 0.3], [8000, 0.9], [12500, 0.8], [20000, 0.2]]),
  // Acoustic body around 200-400 Hz, silk at 12 kHz.
  preset('acoustic-silk', 'Acoustic Silk', -1.2, [[20, -0.3], [80, 0], [200, 0.6], [400, 0.7], [800, 0.3], [2000, 0.2], [4000, 0.3], [8000, 0.4], [12500, 0.8], [16000, 0.6], [20000, 0.2]]),
  // Piano: left-hand body at 80-200 Hz, hammer at 2-4 kHz.
  preset('piano-room', 'Piano Room', -1.4, [[20, -0.3], [63, 0.4], [125, 0.8], [250, 0.7], [500, 0.2], [1000, 0], [2000, 0.5], [4000, 0.7], [8000, 0.2], [16000, 0], [20000, 0]]),
  preset('lofi-dusk', 'Lo-Fi Dusk', -1.9, [[20, 0.4], [63, 1.1], [200, 0.9], [500, 0.3], [1000, 0], [2500, -0.4], [5000, -0.9], [8000, -1.3], [12500, -1.7], [20000, -1.7]]),
  // Cinema: sub for weight, 5 kHz for dialogue/brass. Not another V-shape.
  preset('cinema-orchestra', 'Cinema Depth', -2.7, [[20, 1.6], [40, 1.7], [80, 1.2], [160, 0.4], [400, -0.2], [1000, 0], [2500, 0.3], [5000, 0.7], [8000, 0.2], [16000, 0], [20000, 0]]),
  // Live house: 63 Hz kick, 315 Hz mud cut, 4 kHz PA, little air.
  preset('live-house', 'Live House', -2.3, [[20, 0.2], [63, 1.5], [100, 1], [200, 0], [315, -0.7], [630, -0.3], [2000, 0.6], [4000, 1.1], [8000, 0.1], [16000, -0.5], [20000, -0.4]]),
  // Airy female: 3.15 kHz presence plus 12 kHz air, not a 2 kHz boost.
  preset('female-vocal-air', 'Airy Female Vocal', -1.5, [[20, -0.6], [100, -0.6], [300, -0.1], [500, 0.2], [1000, 0.3], [2000, 0.4], [3150, 1], [5000, 0.3], [8000, 0.2], [12500, 1.1], [16000, 0.7], [20000, 0.2]]),
];

export const createBuiltInEqBands = (definition: BuiltInEqPresetDefinition): EqBand[] =>
  eqFrequenciesHz.map((frequencyHz, index) => ({
    frequencyHz,
    gainDb: clamp(Number(definition.gains[index] ?? 0), eqMinGainDb, eqMaxGainDb),
    q: builtInGraphicEqQ,
    filterType: 'peaking',
    enabled: true,
  }));

export const refreshBuiltInEqState = (state: EqState): EqState => {
  const definition = builtInEqPresetDefinitions.find((candidate) => candidate.id === state.presetId);
  if (!definition) return state;
  if (
    definition.id === 'flat' &&
    (state.preampDb !== 0 || state.bands.some((band) => band.gainDb !== 0))
  ) return state;
  return {
    ...state,
    preampDb: definition.preampDb,
    bands: createBuiltInEqBands(definition),
    presetName: definition.name,
    clippingRisk: false,
  };
};
