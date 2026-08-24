import { describe, expect, it } from 'vitest';
import { eqFrequenciesHz } from '../types/eq';
import { simpleToneGainDb } from './eqSimpleToneVoicings';

describe('simple EQ tone voicings', () => {
  it('keeps bass punch focused below the muddy low-mid range', () => {
    expect(simpleToneGainDb('bass', 80)).toBe(1.5);
    expect(simpleToneGainDb('bass', 250)).toBeLessThan(0);
    expect(simpleToneGainDb('bass', 1000)).toBe(0);
  });

  it('uses smooth, restrained curves at every allowed intensity', () => {
    for (const tone of ['bass', 'vocal', 'air', 'warm'] as const) {
      const gains = eqFrequenciesHz.map((frequencyHz) => simpleToneGainDb(tone, frequencyHz, 1.5));
      expect(Math.max(...gains), tone).toBeLessThanOrEqual(2.3);
      expect(Math.min(...gains), tone).toBeGreaterThanOrEqual(-0.8);
      for (let index = 1; index < gains.length; index += 1) {
        const adjacentDeltaDb = Math.round(Math.abs(gains[index] - gains[index - 1]) * 10) / 10;
        expect(adjacentDeltaDb, tone).toBeLessThanOrEqual(0.7);
      }
    }
  });

  it('keeps flat neutral and clamps excessive intensity', () => {
    expect(simpleToneGainDb('flat', 80, 1.5)).toBe(0);
    expect(simpleToneGainDb('air', 12500, 99)).toBe(simpleToneGainDb('air', 12500, 1.5));
  });
});
