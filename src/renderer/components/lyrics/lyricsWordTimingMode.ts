import type { TrackLyrics } from '../../../shared/types/lyrics';

export type LyricsWordTimingMode = 'source' | 'estimated' | 'unsupported' | 'unavailable';

type LyricsWordTimingInput = Pick<TrackLyrics, 'kind' | 'lines'>;

export const getLyricsWordTimingMode = (
  lyrics: LyricsWordTimingInput | null | undefined,
): LyricsWordTimingMode => {
  if (!lyrics) {
    return 'unavailable';
  }

  if (lyrics.lines?.some((line) => Boolean(line.words?.length))) {
    return 'source';
  }

  if (lyrics.kind === 'synced') {
    return 'estimated';
  }

  return lyrics.kind === 'empty' ? 'unavailable' : 'unsupported';
};
