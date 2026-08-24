import { parsePlainLyrics, parseSyncedLyrics } from './lyricsParser';
import { containsInstrumentalPlaceholderLine } from '../../shared/utils/instrumentalLyrics';

export const isInstrumentalLyricsText = (value: string | null | undefined): boolean => {
  if (!value) {
    return false;
  }

  const syncedLines = parseSyncedLyrics(value).map((line) => line.text);
  const plainLines = parsePlainLyrics(value).map((line) => line.text);
  const lines = syncedLines.length > 0 ? syncedLines : plainLines;

  return containsInstrumentalPlaceholderLine(lines);
};
