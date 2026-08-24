import { describe, expect, it } from 'vitest';
import {
  containsInstrumentalPlaceholderLine,
  containsOnlyInstrumentalPlaceholderLines,
  isInstrumentalPlaceholderLine,
} from './instrumentalLyrics';

describe('instrumental lyric placeholders', () => {
  it('recognizes common simplified, traditional, and English placeholders', () => {
    expect(isInstrumentalPlaceholderLine('纯音乐，请欣赏')).toBe(true);
    expect(isInstrumentalPlaceholderLine('純音樂，請欣賞')).toBe(true);
    expect(isInstrumentalPlaceholderLine('Instrumental track')).toBe(true);
  });

  it('does not treat real lyrics as an all-placeholder lyric state', () => {
    expect(containsInstrumentalPlaceholderLine(['Instrumental track', 'A real lyric line'])).toBe(true);
    expect(containsOnlyInstrumentalPlaceholderLines(['Instrumental track', 'A real lyric line'])).toBe(false);
  });
});
