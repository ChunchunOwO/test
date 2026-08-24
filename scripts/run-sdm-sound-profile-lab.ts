import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzeEchoSrcFirTaps,
  createEchoSrcFirCompositeTaps,
  createEchoSrcFirTaps,
  measureEchoSrcFirMagnitudeDb,
} from '../src/main/audio/EchoSrcFirEngine';
import { createSdmSoundStagePlans, sdmSoundProfileDesign } from '../src/main/audio/SdmSoundProfilePlan';
import { audioSdmSoundProfiles } from '../src/shared/audioSdmSoundProfiles';

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(scriptPath), '..');
const reportPath = join(projectRoot, 'out', 'sdm-quality-lab', 'sdm-sound-profiles.json');
const audibleFrequenciesHz = [10_000, 15_000, 18_000, 19_000, 19_500, 20_000, 22_000, 24_100, 28_000] as const;
const routes = [
  { family: '44.1k', sourceSampleRate: 44_100, targetSampleRate: 1_411_200 },
  { family: '48k', sourceSampleRate: 48_000, targetSampleRate: 1_536_000 },
] as const;

const round = (value: number, digits = 8): number => Number(value.toFixed(digits));

const measurements = routes.flatMap((route) => audioSdmSoundProfiles.map((profile) => {
  const stages = createSdmSoundStagePlans({
    sourceSampleRate: route.sourceSampleRate,
    targetSampleRate: route.targetSampleRate,
    filterProfile1x: profile.filterProfile1x,
    filterProfileNx: profile.filterProfileNx,
  });
  if (stages.length !== 5) {
    throw new Error(`sdm_sound_lab_invalid_stage_plan:${profile.id}:${route.family}:${stages.length}`);
  }

  const compositeTaps = createEchoSrcFirCompositeTaps(stages.map((stage) => ({
    taps: createEchoSrcFirTaps(stage.plan),
    upsampleFactor: stage.upsampleFactor,
  })));
  const analysis = analyzeEchoSrcFirTaps(
    stages[0]!.plan,
    compositeTaps,
  );
  const responseDb = Object.fromEntries(audibleFrequenciesHz.map((frequencyHz) => [
    String(frequencyHz),
    round(measureEchoSrcFirMagnitudeDb(compositeTaps, route.targetSampleRate, frequencyHz), 6),
  ]));

  return {
    family: route.family,
    profile: profile.id,
    sourceSampleRate: route.sourceSampleRate,
    carrierSampleRate: route.targetSampleRate,
    filterProfile1x: profile.filterProfile1x,
    filterProfileNx: profile.filterProfileNx,
    stageProfiles: stages.map((stage) => stage.plan.profile),
    stageTapCounts: stages.map((stage) => stage.plan.tapCount),
    firstStageCutoffHz: round(stages[0]!.plan.normalizedCutoff * stages[0]!.plan.targetSampleRate, 3),
    compositeTapCount: compositeTaps.length,
    impulsePeakFrame: analysis.peakIndex,
    impulsePeakMilliseconds: round((analysis.peakIndex * 1_000) / route.targetSampleRate, 6),
    energyCentroidFrame: round(analysis.energyCentroid, 6),
    preRingingEnergyRatio: round(analysis.preRingingEnergyRatio, 10),
    postRingingEnergyRatio: round(analysis.postRingingEnergyRatio, 10),
    passbandRippleDb: round(analysis.passbandRippleDb, 8),
    responseDb,
  };
}));

for (const route of routes) {
  const routeMeasurements = measurements.filter((measurement) => measurement.family === route.family);
  const linear = routeMeasurements.find((measurement) => measurement.profile === 'linear')!;
  const transient = routeMeasurements.find((measurement) => measurement.profile === 'transient')!;
  const smooth = routeMeasurements.find((measurement) => measurement.profile === 'smooth')!;
  if (transient.preRingingEnergyRatio >= linear.preRingingEnergyRatio * 0.8) {
    throw new Error(
      `sdm_sound_lab_transient_preringing_not_distinct:${route.family}:linear=${linear.preRingingEnergyRatio}:transient=${transient.preRingingEnergyRatio}`,
    );
  }
  if (Number(transient.responseDb['18000']) <= -0.1 || Number(transient.responseDb['20000']) <= -0.1) {
    throw new Error(
      `sdm_sound_lab_transient_bandwidth_regression:${route.family}:18k=${transient.responseDb['18000']}:20k=${transient.responseDb['20000']}`,
    );
  }
  const smooth18k = Number(smooth.responseDb['18000']);
  const smooth19k = Number(smooth.responseDb['19000']);
  const smooth20k = Number(smooth.responseDb['20000']);
  if (smooth18k <= -0.5 || smooth19k <= -2 || smooth19k >= -0.5 || smooth20k <= -7 || smooth20k >= -5) {
    throw new Error(
      `sdm_sound_lab_smooth_rolloff_out_of_bounds:${route.family}:18k=${smooth18k}:19k=${smooth19k}:20k=${smooth20k}`,
    );
  }
  const firstImageFrequencyHz = route.sourceSampleRate === 44_100 ? 24_100 : 28_000;
  const firstImageRejectionDb = route.sourceSampleRate === 44_100
    ? Number(smooth.responseDb['24100'])
    : Number(smooth.responseDb['28000']);
  if (firstImageRejectionDb >= -90) {
    throw new Error(
      `sdm_sound_lab_smooth_image_rejection_regression:${route.family}:${firstImageFrequencyHz}=${firstImageRejectionDb}`,
    );
  }
}

for (const profile of ['transient', 'smooth'] as const) {
  const family44 = measurements.find((measurement) => measurement.family === '44.1k' && measurement.profile === profile)!;
  const family48 = measurements.find((measurement) => measurement.family === '48k' && measurement.profile === profile)!;
  const difference19k = Math.abs(Number(family44.responseDb['19000']) - Number(family48.responseDb['19000']));
  const difference20k = Math.abs(Number(family44.responseDb['20000']) - Number(family48.responseDb['20000']));
  if (difference19k >= 0.5 || difference20k >= 0.75) {
    throw new Error(`sdm_sound_lab_family_mismatch:${profile}:difference19k=${difference19k}:difference20k=${difference20k}`);
  }
}

const report = {
  schemaVersion: 2,
  generator: 'echo-sdm-sound-profile-lab',
  measurementOnly: true,
  listeningConclusion: false,
  hardwareProof: false,
  design: sdmSoundProfileDesign,
  acceptanceCriteria: {
    transient: {
      preRingingEnergyRatioVsLinearMaximum: 0.8,
      minimumResponseDbAt18kHz: -0.1,
      minimumResponseDbAt20kHz: -0.1,
    },
    smooth: {
      responseDbAt18kHz: { minimum: -0.5 },
      responseDbAt19kHz: { minimum: -2, maximum: -0.5 },
      responseDbAt20kHz: { minimum: -7, maximum: -5 },
      maximumFirstImageDb: -90,
    },
    familyConsistency: {
      maximumDifferenceDbAt19kHz: 0.5,
      maximumDifferenceDbAt20kHz: 0.75,
    },
    listening: {
      required: true,
      minimumBlindTrials: 10,
      minimumCorrectTrials: 9,
    },
  },
  routes: measurements,
};

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log('\nSDM Sound Profile Lab');
console.log('Family\tProfile\tPeak ms\tPre-ring\tPost-ring\t20 kHz dB');
for (const measurement of measurements) {
  console.log([
    measurement.family,
    measurement.profile,
    measurement.impulsePeakMilliseconds.toFixed(4),
    measurement.preRingingEnergyRatio.toFixed(6),
    measurement.postRingingEnergyRatio.toFixed(6),
    Number(measurement.responseDb['20000']).toFixed(3),
  ].join('\t'));
}
console.log(`\nReport: ${reportPath}`);
console.log('Scope: FIR impulse/frequency evidence only; this is not a listening or DAC proof.');
