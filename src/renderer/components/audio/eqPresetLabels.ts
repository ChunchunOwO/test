import type { TranslationKey } from '../../i18n/locales';

export const builtInEqPresetNameKeyById: Record<string, TranslationKey> = {
  'acoustic-silk': 'settings.eq.preset.name.acoustic-silk',
  'anime-jpop': 'settings.eq.preset.name.anime-jpop',
  'bass-boost': 'settings.eq.preset.name.bass-boost',
  'bk-room-curve': 'settings.eq.preset.name.bk-room-curve',
  'broadcast-voice': 'settings.eq.preset.name.broadcast-voice',
  'cinema-orchestra': 'settings.eq.preset.name.cinema-orchestra',
  'city-pop': 'settings.eq.preset.name.city-pop',
  'classic-smiley': 'settings.eq.preset.name.classic-smiley',
  classical: 'settings.eq.preset.name.classical',
  'diffuse-field': 'settings.eq.preset.name.diffuse-field',
  'diffuse-field-5128': 'settings.eq.preset.name.diffuse-field-5128',
  'diffuse-field-gras-kemar': 'settings.eq.preset.name.diffuse-field-gras-kemar',
  'diffuse-field-iso-11904-1': 'settings.eq.preset.name.diffuse-field-iso-11904-1',
  'female-vocal-air': 'settings.eq.preset.name.female-vocal-air',
  flat: 'settings.eq.preset.name.flat',
  'harman-in-ear': 'settings.eq.preset.name.harman-in-ear',
  'harman-in-ear-2016': 'settings.eq.preset.name.harman-in-ear-2016',
  'harman-in-ear-2017': 'settings.eq.preset.name.harman-in-ear-2017',
  'harman-in-ear-2019-no-bass': 'settings.eq.preset.name.harman-in-ear-2019-no-bass',
  'harman-over-ear-2013': 'settings.eq.preset.name.harman-over-ear-2013',
  'harman-over-ear-2015': 'settings.eq.preset.name.harman-over-ear-2015',
  'harman-over-ear-2018-no-bass': 'settings.eq.preset.name.harman-over-ear-2018-no-bass',
  'harman-speaker-room-2013': 'settings.eq.preset.name.harman-speaker-room-2013',
  'harman-target': 'settings.eq.preset.name.harman-target',
  'headphone-warm': 'settings.eq.preset.name.headphone-warm',
  'live-house': 'settings.eq.preset.name.live-house',
  'lofi-dusk': 'settings.eq.preset.name.lofi-dusk',
  loudness: 'settings.eq.preset.name.loudness',
  night: 'settings.eq.preset.name.night',
  'piano-room': 'settings.eq.preset.name.piano-room',
  rock: 'settings.eq.preset.name.rock',
  'studio-neutral': 'settings.eq.preset.name.studio-neutral',
  'treble-sparkle': 'settings.eq.preset.name.treble-sparkle',
  'vinyl-warmth': 'settings.eq.preset.name.vinyl-warmth',
  'vocal-clear': 'settings.eq.preset.name.vocal-clear',
};

export const resolveEqPresetLabel = (
  preset: { id: string; name: string },
  t: (key: TranslationKey) => string,
): string => {
  const key = builtInEqPresetNameKeyById[preset.id];
  return key ? t(key) : preset.name;
};

export const eqPresetSearchText = (
  preset: { id: string; name: string },
  t: (key: TranslationKey) => string,
): string => `${resolveEqPresetLabel(preset, t)} ${preset.name} ${preset.id}`;
