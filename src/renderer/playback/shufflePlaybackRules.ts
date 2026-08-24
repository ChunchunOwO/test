import type { TranslationKey } from '../i18n/locales';

export type ShufflePlaybackModeOption = {
  id: 'library' | 'avoid-recent' | 'pseudo-random';
  avoidRecentCount: number;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
};

export const shufflePlaybackModeOptions: ShufflePlaybackModeOption[] = [
  {
    id: 'library',
    avoidRecentCount: 0,
    labelKey: 'settings.playback.shuffleCredibility.mode.library',
    descriptionKey: 'settings.playback.shuffleCredibility.mode.library.description',
  },
  {
    id: 'avoid-recent',
    avoidRecentCount: 25,
    labelKey: 'settings.playback.shuffleCredibility.mode.avoidRecent',
    descriptionKey: 'settings.playback.shuffleCredibility.mode.avoidRecent.description',
  },
  {
    id: 'pseudo-random',
    avoidRecentCount: 100,
    labelKey: 'settings.playback.shuffleCredibility.mode.pseudoRandom',
    descriptionKey: 'settings.playback.shuffleCredibility.mode.pseudoRandom.description',
  },
];

export const getShufflePlaybackModeId = (avoidRecentCount: number): ShufflePlaybackModeOption['id'] => {
  if (avoidRecentCount <= 0) {
    return 'library';
  }
  if (avoidRecentCount >= 50) {
    return 'pseudo-random';
  }
  return 'avoid-recent';
};
