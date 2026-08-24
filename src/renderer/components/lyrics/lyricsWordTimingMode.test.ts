import { describe, expect, it } from 'vitest';
import { getLyricsWordTimingMode } from './lyricsWordTimingMode';

describe('getLyricsWordTimingMode', () => {
  it('distinguishes source timing, estimated timing, unsupported lyrics, and missing lyrics', () => {
    expect(getLyricsWordTimingMode({
      kind: 'synced',
      lines: [{
        timeMs: 1000,
        text: 'Hello world',
        words: [
          { text: 'Hello ', startMs: 1000, endMs: 1500 },
          { text: 'world', startMs: 1500, endMs: 2000 },
        ],
      }],
    })).toBe('source');
    expect(getLyricsWordTimingMode({
      kind: 'synced',
      lines: [{ timeMs: 1000, text: 'Line timed only' }],
    })).toBe('estimated');
    expect(getLyricsWordTimingMode({
      kind: 'plain',
      lines: [{ timeMs: -1, text: 'Plain lyrics' }],
    })).toBe('unsupported');
    expect(getLyricsWordTimingMode(null)).toBe('unavailable');
  });
});
