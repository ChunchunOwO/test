import { resolveAudioSdmSoundProfileSelection } from '../../shared/audioSdmSoundProfiles';
import type { AudioEchoSrcFilterProfile } from '../../shared/types/audio';
import {
  createEchoSrcFirStagePlans,
  type EchoSrcFirStagePlan,
} from './EchoSrcFirEngine';

export type SdmSoundStagePlanOptions = {
  sourceSampleRate: number;
  targetSampleRate: number;
  filterProfile1x: AudioEchoSrcFilterProfile;
  filterProfileNx: AudioEchoSrcFilterProfile;
};

// These are absolute audible-band design targets, not ratios of Nyquist.
// Keeping them independent of the 44.1/48 kHz source family prevents the
// same named sound profile from becoming a radically different low-pass.
export const sdmSoundProfileDesign = {
  transient: {
    firstStageCutoffHz: 20_500,
  },
  smooth: {
    firstStageCutoffHz: 20_000,
    // The short Gaussian stage deliberately creates a progressive audible
    // roll-off while still suppressing the first 44.1 kHz image by about
    // 100 dB. A long 1535-tap stage turned this into an abrupt brick wall.
    firstStageTapCount: 127,
  },
} as const;

export const createSdmSoundStagePlans = (
  options: SdmSoundStagePlanOptions,
): EchoSrcFirStagePlan[] => {
  const selection = resolveAudioSdmSoundProfileSelection(
    options.filterProfile1x,
    options.filterProfileNx,
  );
  const stages = createEchoSrcFirStagePlans(
    options.filterProfile1x,
    options.sourceSampleRate,
    options.targetSampleRate,
    {
      resolveProfile: (stageSourceSampleRate) =>
        stageSourceSampleRate < 50_000
          ? options.filterProfile1x
          : options.filterProfileNx,
    },
  );
  const targetCutoffHz = selection === 'transient' || selection === 'smooth'
    ? sdmSoundProfileDesign[selection].firstStageCutoffHz
    : null;
  if (!targetCutoffHz || stages.length === 0) {
    return stages;
  }

  const firstStage = stages[0]!;
  const sourceNyquistHz = firstStage.plan.sourceSampleRate / 2;
  const boundedCutoffHz = Math.min(targetCutoffHz, sourceNyquistHz * 0.98);
  return stages.map((stage) => stage.index === 0
    ? {
        ...stage,
        plan: {
          ...stage.plan,
          normalizedCutoff: boundedCutoffHz / stage.plan.targetSampleRate,
          tapCount: selection === 'smooth'
            ? sdmSoundProfileDesign.smooth.firstStageTapCount
            : stage.plan.tapCount,
        },
      }
    : stage);
};
