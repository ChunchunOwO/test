import { describe, expect, it } from 'vitest';
import { isLyricsMiniPlayerRequiredForPageStyle } from './lyricsMiniPlayerPolicy';

describe('lyrics mini player policy', () => {
  it('requires the mini player for every visible non-default lyrics page style', () => {
    expect(isLyricsMiniPlayerRequiredForPageStyle('default')).toBe(false);
    expect(isLyricsMiniPlayerRequiredForPageStyle('editorial')).toBe(true);
    expect(isLyricsMiniPlayerRequiredForPageStyle('folded')).toBe(true);
    expect(isLyricsMiniPlayerRequiredForPageStyle('roseVinyl')).toBe(true);
    expect(isLyricsMiniPlayerRequiredForPageStyle('cinemaStage')).toBe(true);
    expect(isLyricsMiniPlayerRequiredForPageStyle('kineticPoster')).toBe(true);
    expect(isLyricsMiniPlayerRequiredForPageStyle('coverStage')).toBe(true);
  });

  it('does not force the mini player for unavailable styles that resolve to default', () => {
    expect(isLyricsMiniPlayerRequiredForPageStyle('cutBoard')).toBe(false);
  });
});
