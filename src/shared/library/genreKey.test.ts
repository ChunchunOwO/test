import { describe, expect, it } from 'vitest';
import { genreKeyFromSqlValue, genreKeyFromTag, isUnclassifiedGenreKey, unclassifiedGenreKey } from './genreKey';

describe('genreKeyFromTag', () => {
  it('groups letter-case and spacing as the same genre', () => {
    expect(genreKeyFromTag('Rock')).toBe('rock');
    expect(genreKeyFromTag('ROCK')).toBe('rock');
    expect(genreKeyFromTag('  Rock  ')).toBe('rock');
  });

  it('keeps compound tags as one key instead of splitting them', () => {
    expect(genreKeyFromTag('J-Pop/Anime')).toBe('j-pop/anime');
  });

  it('sends empty tags to the unclassified bucket', () => {
    expect(genreKeyFromTag(null)).toBe(unclassifiedGenreKey);
    expect(genreKeyFromTag('')).toBe(unclassifiedGenreKey);
    expect(genreKeyFromTag('   ')).toBe(unclassifiedGenreKey);
    expect(isUnclassifiedGenreKey(unclassifiedGenreKey)).toBe(true);
  });

  it('coerces numeric SQL values instead of sending them to unclassified', () => {
    expect(genreKeyFromSqlValue('Rock')).toBe('rock');
    expect(genreKeyFromSqlValue(13)).toBe('13');
    expect(genreKeyFromSqlValue(null)).toBe(unclassifiedGenreKey);
    expect(genreKeyFromSqlValue(undefined)).toBe(unclassifiedGenreKey);
  });
});
