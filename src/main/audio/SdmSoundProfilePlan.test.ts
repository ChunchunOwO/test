import { describe, expect, it } from 'vitest';
import { createEchoSrcFirCompositeTaps, createEchoSrcFirTaps, measureEchoSrcFirMagnitudeDb } from './EchoSrcFirEngine';
import { createSdmSoundStagePlans } from './SdmSoundProfilePlan';

const measure = (
  sourceSampleRate: number,
  filterProfile1x: 'sinc-long' | 'minringFIR-mp' | 'apod-gauss',
  filterProfileNx: 'poly-sinc-hb' | 'poly-sinc-ext2-hires-mp' | 'poly-sinc-gauss-hires-lp',
) => {
  const targetSampleRate = sourceSampleRate === 44_100 ? 1_411_200 : 1_536_000;
  const stages = createSdmSoundStagePlans({
    sourceSampleRate,
    targetSampleRate,
    filterProfile1x,
    filterProfileNx,
  });
  const compositeTaps = createEchoSrcFirCompositeTaps(stages.map((stage) => ({
    taps: createEchoSrcFirTaps(stage.plan),
    upsampleFactor: stage.upsampleFactor,
  })));
  return {
    stages,
    db18k: measureEchoSrcFirMagnitudeDb(compositeTaps, targetSampleRate, 18_000),
    db19k: measureEchoSrcFirMagnitudeDb(compositeTaps, targetSampleRate, 19_000),
    db20k: measureEchoSrcFirMagnitudeDb(compositeTaps, targetSampleRate, 20_000),
    imageDb: measureEchoSrcFirMagnitudeDb(
      compositeTaps,
      targetSampleRate,
      sourceSampleRate === 44_100 ? 24_100 : 28_000,
    ),
  };
};

describe('createSdmSoundStagePlans', () => {
  it('keeps the five-stage DSD512 profile identity while using absolute first-stage targets', () => {
    const transient44 = measure(44_100, 'minringFIR-mp', 'poly-sinc-ext2-hires-mp');
    const transient48 = measure(48_000, 'minringFIR-mp', 'poly-sinc-ext2-hires-mp');

    expect(transient44.stages.map((stage) => stage.plan.profile)).toEqual([
      'minringFIR-mp',
      'poly-sinc-ext2-hires-mp',
      'poly-sinc-ext2-hires-mp',
      'poly-sinc-ext2-hires-mp',
      'poly-sinc-ext2-hires-mp',
    ]);
    expect(transient44.stages[0]!.plan.normalizedCutoff * 88_200).toBeCloseTo(20_500, 3);
    expect(transient48.stages[0]!.plan.normalizedCutoff * 96_000).toBeCloseTo(20_500, 3);
  });

  it('keeps both source families consistent through the audible band', () => {
    const transient44 = measure(44_100, 'minringFIR-mp', 'poly-sinc-ext2-hires-mp');
    const transient48 = measure(48_000, 'minringFIR-mp', 'poly-sinc-ext2-hires-mp');
    const smooth44 = measure(44_100, 'apod-gauss', 'poly-sinc-gauss-hires-lp');
    const smooth48 = measure(48_000, 'apod-gauss', 'poly-sinc-gauss-hires-lp');

    expect(transient44.db18k).toBeGreaterThan(-0.1);
    expect(transient48.db18k).toBeGreaterThan(-0.1);
    expect(Math.abs(transient44.db20k - transient48.db20k)).toBeLessThan(0.75);
    expect(smooth44.db18k).toBeGreaterThan(-0.5);
    expect(smooth48.db18k).toBeGreaterThan(-0.5);
    expect(smooth44.stages[0]!.plan.tapCount).toBe(127);
    expect(smooth48.stages[0]!.plan.tapCount).toBe(127);
    expect(smooth44.db19k).toBeLessThan(-0.5);
    expect(smooth44.db19k).toBeGreaterThan(-2);
    expect(smooth44.db20k).toBeLessThan(-5);
    expect(smooth44.db20k).toBeGreaterThan(-7);
    expect(Math.abs(smooth44.db20k - smooth48.db20k)).toBeLessThan(0.75);
    expect(smooth44.imageDb).toBeLessThan(-90);
    expect(smooth48.imageDb).toBeLessThan(-90);
  });
});
