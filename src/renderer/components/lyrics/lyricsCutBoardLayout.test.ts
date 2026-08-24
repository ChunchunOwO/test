import { describe, expect, it } from 'vitest';
import { analyzeLyricsCutBoardPixels, fallbackLyricsCutBoardLayout } from './lyricsCutBoardLayout';

const createStripedPixels = (width: number, height: number): Uint8ClampedArray => {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const band = Math.floor(x / 12) % 3;
      pixels[offset] = band === 0 ? 24 : band === 1 ? 220 : 86;
      pixels[offset + 1] = band === 2 ? 168 : 44;
      pixels[offset + 2] = band === 1 ? 64 : 190;
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
};

describe('lyricsCutBoardLayout', () => {
  it('keeps the seven editorial columns stable while adapting cover color', () => {
    const layout = analyzeLyricsCutBoardPixels(createStripedPixels(96, 54), 96, 54);
    expect(layout.columns).toEqual(fallbackLyricsCutBoardLayout.columns);
    expect(layout.sliceShades).toHaveLength(7);
    expect(layout.sliceShades.every((shade) => shade >= 0.08 && shade <= 0.36)).toBe(true);
    expect(layout.accentIndex).toBe(3);
    expect(layout.accentColor).toMatch(/^rgb\(\d+ \d+ \d+\)$/u);
  });

  it('uses the stable fallback when pixels are unavailable', () => {
    expect(analyzeLyricsCutBoardPixels(new Uint8ClampedArray(), 0, 0)).toEqual(fallbackLyricsCutBoardLayout);
  });
});
