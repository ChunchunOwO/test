import { describe, expect, it } from 'vitest';
import { isLyricsPageStyleVisible, resolveVisibleLyricsPageStyle } from './lyricsPageStyleAvailability';

describe('lyrics page style availability', () => {
  it('keeps the cut board implementation hidden behind the default style', () => {
    expect(isLyricsPageStyleVisible('cutBoard')).toBe(false);
    expect(resolveVisibleLyricsPageStyle('cutBoard')).toBe('default');
    expect(isLyricsPageStyleVisible('cinemaStage')).toBe(true);
    expect(resolveVisibleLyricsPageStyle('cinemaStage')).toBe('cinemaStage');
    expect(resolveVisibleLyricsPageStyle('kineticPoster')).toBe('kineticPoster');
  });
});
