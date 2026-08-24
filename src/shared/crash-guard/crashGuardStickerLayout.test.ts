import { describe, expect, it } from 'vitest';
import {
  createCrashGuardStickerPlacements,
  crashGuardStickerArtStyle,
  crashGuardStickerStyle,
} from './crashGuardStickerLayout';

const sequenceRandom = (...values: number[]): (() => number) => {
  let index = 0;
  return () => values[index++ % values.length] ?? 0.5;
};

describe('crashGuardStickerLayout', () => {
  it('assigns every sticker to a unique safe slot', () => {
    const placements = createCrashGuardStickerPlacements(sequenceRandom(0.13, 0.81, 0.42, 0.67));

    expect(placements).toHaveLength(6);
    expect(new Set(placements.map((placement) => placement.slotIndex)).size).toBe(6);
    expect(placements.every((placement) => placement.leftPercent >= 57 && placement.leftPercent <= 98)).toBe(true);
    expect(placements.every((placement) => placement.topPercent >= 5 && placement.topPercent <= 91)).toBe(true);
  });

  it('creates a cropped sprite style instead of moving the whole sheet', () => {
    const placement = createCrashGuardStickerPlacements(() => 0.5)[1];
    const style = crashGuardStickerStyle(placement);
    const artStyle = crashGuardStickerArtStyle(placement);

    expect(artStyle.backgroundSize).toMatch(/^\d+(?:\.\d+)?px \d+(?:\.\d+)?px$/);
    expect(artStyle.backgroundPosition).toMatch(/^-?\d+(?:\.\d+)?px -?\d+(?:\.\d+)?px$/);
    expect(artStyle.backgroundPosition).toContain('-');
    expect(artStyle.animationDuration).toMatch(/^\d+ms$/);
    expect(artStyle.animationDelay).toMatch(/^-\d+ms$/);
    expect(style.transform).toContain('rotate(');
    expect(Number.parseFloat(style.width)).toBeLessThan(120);
  });

  it('assigns a distinct motion personality to every sticker', () => {
    const placements = createCrashGuardStickerPlacements(() => 0.5);

    expect(new Set(placements.map((placement) => placement.motion))).toEqual(
      new Set(['sway', 'bob', 'bounce', 'pulse', 'twinkle', 'drift']),
    );
  });
});
