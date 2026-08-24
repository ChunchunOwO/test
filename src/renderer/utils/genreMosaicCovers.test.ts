import { describe, expect, it } from 'vitest';
import { collectUniqueCoverUrls, sameCoverUrls } from './genreMosaicCovers';

describe('genre mosaic covers', () => {
  it('keeps first unique covers and ignores blanks', () => {
    expect(collectUniqueCoverUrls([
      ' echo-cover://large/a ',
      null,
      'echo-cover://large/a',
      '',
      'echo-cover://large/b',
      'echo-cover://large/c',
      'echo-cover://large/d',
      'echo-cover://large/e',
    ])).toEqual([
      'echo-cover://large/a',
      'echo-cover://large/b',
      'echo-cover://large/c',
      'echo-cover://large/d',
    ]);
  });

  it('can keep a single cover for lightweight mode', () => {
    expect(collectUniqueCoverUrls([
      'echo-cover://large/a',
      'echo-cover://large/b',
      'echo-cover://large/c',
    ], 1)).toEqual(['echo-cover://large/a']);
  });

  it('compares cover lists by value', () => {
    expect(sameCoverUrls(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameCoverUrls(['a', 'b'], ['b', 'a'])).toBe(false);
  });
});
