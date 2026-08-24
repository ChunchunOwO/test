import {
  automixTransitionPlanVersion,
  type AutomixAnalysisV2,
  type AutomixTransitionModeV2,
  type AutomixTransitionPlanV2,
} from '../../shared/types/automix';

export type AutomixPlanV2Input = {
  queueRevision: number;
  fromItemId: string;
  fromTrackId: string;
  toItemId: string;
  toTrackId: string;
  mixSampleRate: number;
  currentOutputFrame: number;
  currentSourcePositionSeconds: number;
  currentAnalysis: AutomixAnalysisV2 | null;
  nextAnalysis: AutomixAnalysisV2 | null;
  currentIsDsd?: boolean;
  nextIsDsd?: boolean;
  playbackRate?: number;
  maxTransitionSeconds?: number;
  trackBoundaryFadeMs?: number;
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));
const roundMillis = (value: number): number => Math.round(value * 1000) / 1000;

const normalizeBpm = (value: number): number => {
  let bpm = value;
  while (bpm < 80) bpm *= 2;
  while (bpm > 180) bpm /= 2;
  return bpm;
};

const keyCompatible = (left: AutomixAnalysisV2['key'], right: AutomixAnalysisV2['key']): boolean => {
  if (!left || !right || left.confidence < 0.15 || right.confidence < 0.15) {
    return false;
  }
  const parse = (value: string): { number: number; ring: string } | null => {
    const match = /^(\d{1,2})([AB])$/u.exec(value);
    return match ? { number: Number(match[1]), ring: match[2] } : null;
  };
  const a = parse(left.camelot);
  const b = parse(right.camelot);
  if (!a || !b) return false;
  const distance = Math.min(Math.abs(a.number - b.number), 12 - Math.abs(a.number - b.number));
  return (a.ring === b.ring && distance <= 1) || (a.number === b.number && a.ring !== b.ring);
};

const selectPhraseBoundary = (
  analysis: AutomixAnalysisV2,
  earliest: number,
  preferred: number,
  latest: number,
): number => {
  const candidates = analysis.phraseBoundaries
    .filter((boundary) => boundary.seconds >= earliest && boundary.seconds <= latest)
    .sort((left, right) => {
      const distance = Math.abs(left.seconds - preferred) - Math.abs(right.seconds - preferred);
      return distance !== 0 ? distance : right.confidence - left.confidence;
    });
  return candidates[0]?.seconds ?? clamp(preferred, earliest, latest);
};

const resolveDownbeatGrid = (analysis: AutomixAnalysisV2, normalizedBpm: number | null): number[] => {
  const explicitDownbeats = analysis.downbeatGridSeconds
    .filter((seconds) => Number.isFinite(seconds) && seconds >= 0 && seconds <= analysis.durationSeconds)
    .sort((left, right) => left - right);
  if (explicitDownbeats.length > 0) {
    return explicitDownbeats;
  }

  const beatGrid = analysis.beatGridSeconds
    .filter((seconds) => Number.isFinite(seconds) && seconds >= 0 && seconds <= analysis.durationSeconds)
    .sort((left, right) => left - right);
  if (beatGrid.length >= 4) {
    return beatGrid.filter((_seconds, index) => index % 4 === 0);
  }

  if (normalizedBpm === null || analysis.beatOffsetMs === null || !Number.isFinite(analysis.beatOffsetMs)) {
    return [];
  }

  const barSeconds = (60 / normalizedBpm) * 4;
  let firstDownbeat = analysis.beatOffsetMs / 1000;
  while (firstDownbeat < 0) firstDownbeat += barSeconds;
  const generated: number[] = [];
  for (let seconds = firstDownbeat; seconds <= analysis.durationSeconds; seconds += barSeconds) {
    generated.push(seconds);
  }
  return generated;
};

const selectNearestDownbeat = (
  downbeats: number[],
  preferred: number,
  earliest: number,
  latest: number,
): number | null => {
  const candidates = downbeats.filter((seconds) => seconds >= earliest && seconds <= latest);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, candidate) =>
    Math.abs(candidate - preferred) < Math.abs(best - preferred) ? candidate : best);
};

const selectNextEntryDownbeat = (downbeats: number[], earliest: number): number | null =>
  downbeats.find((seconds) => seconds >= earliest && seconds <= 16) ?? null;

const average = (values: number[], fallback = 0.5): number =>
  values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;

const estimateMusicalEntrySeconds = (analysis: AutomixAnalysisV2): number => {
  const headBucketCount = Math.max(1, Math.ceil(analysis.energyCurve.length / 2));
  const head = analysis.energyCurve.slice(0, headBucketCount);
  if (head.length < 4) return 0;
  const minimum = Math.min(...head);
  const peak = Math.max(...head);
  if (peak < 0.48 || peak - minimum < 0.2) return 0;
  const threshold = Math.max(0.42, peak * 0.6);
  const firstStrongBucket = head.findIndex((value) => value >= threshold);
  if (firstStrongBucket < 2) return 0;
  // V2 stores nine buckets from the first half of the decoded 36-second
  // head segment. Mapping them across all 36 seconds skips twice as much of
  // a quiet but meaningful intro as the analysis actually observed.
  const headWindowSeconds = Math.min(18, analysis.durationSeconds / 2);
  return clamp((firstStrongBucket / head.length) * headWindowSeconds - 0.2, 0, 12);
};

const resolveTransitionEnergy = (current: AutomixAnalysisV2, next: AutomixAnalysisV2): {
  currentTail: number;
  nextHead: number;
  density: number;
} => {
  const bucketCount = Math.max(2, Math.min(4, Math.floor(current.energyCurve.length / 3)));
  const currentTail = average(current.energyCurve.slice(-bucketCount));
  const nextHead = average(next.energyCurve.slice(0, bucketCount));
  return { currentTail, nextHead, density: (currentTail + nextHead) / 2 };
};

const resolveNextGainDb = (current: AutomixAnalysisV2, next: AutomixAnalysisV2): number => {
  const currentTransitionLufs = current.outroLufs ?? current.integratedLufs;
  const nextTransitionLufs = next.introLufs ?? next.integratedLufs;
  const loudnessDelta = currentTransitionLufs !== null && nextTransitionLufs !== null
    ? currentTransitionLufs - nextTransitionLufs
    : 0;
  return roundMillis(clamp(loudnessDelta * 0.55, -3.5, 3));
};

const fallbackPlan = (
  input: AutomixPlanV2Input,
  reason: string,
  mode: AutomixTransitionModeV2 = 'gapless_fallback',
): AutomixTransitionPlanV2 => {
  const sampleRate = Math.max(8000, Math.round(input.mixSampleRate));
  const currentDuration = input.currentAnalysis?.durationSeconds ?? input.currentSourcePositionSeconds;
  const remaining = Math.max(0, currentDuration - input.currentSourcePositionSeconds);
  const overlapSeconds = mode === 'short_crossfade' ? clamp(remaining * 0.2, 1, 3) : 0;
  const fadeStart = input.currentOutputFrame + Math.max(0, Math.round((remaining - overlapSeconds) * sampleRate));
  const overlapFrames = Math.max(mode === 'gapless_fallback' ? 1 : 2, Math.round(overlapSeconds * sampleRate));
  return {
    version: automixTransitionPlanVersion,
    planId: `${input.queueRevision}:${input.fromItemId}:${input.toItemId}:${fadeStart}`,
    queueRevision: input.queueRevision,
    fromItemId: input.fromItemId,
    fromTrackId: input.fromTrackId,
    toItemId: input.toItemId,
    toTrackId: input.toTrackId,
    mixSampleRate: sampleRate,
    mode,
    handoffProfile: 'balanced',
    currentStartSeconds: roundMillis(input.currentSourcePositionSeconds),
    currentEndSeconds: roundMillis(currentDuration),
    fadeStartOutputFrame: fadeStart,
    fadeEndOutputFrame: fadeStart + overlapFrames,
    commitOutputFrame: fadeStart + overlapFrames,
    nextStartSeconds: 0,
    overlapFrames,
    currentGainDb: 0,
    nextGainDb: 0,
    tempoRatio: 1,
    fallbackReason: reason,
  };
};

const musicalHandoffPlan = (
  input: AutomixPlanV2Input,
  current: AutomixAnalysisV2,
  next: AutomixAnalysisV2,
  reason: 'tempo_incompatible' | 'key_incompatible',
): AutomixTransitionPlanV2 => {
  const sampleRate = Math.max(8000, Math.round(input.mixSampleRate));
  const maxTransition = clamp(input.maxTransitionSeconds ?? 16, 2, 16);
  const audibleEndSeconds = current.durationSeconds
    - Math.max(0, current.trailingSilenceSeconds > 0.16 ? current.trailingSilenceSeconds - 0.08 : 0);
  const preferredEndSeconds = audibleEndSeconds > input.currentSourcePositionSeconds + 0.25
    ? audibleEndSeconds
    : current.durationSeconds;
  const availableSeconds = Math.max(0, preferredEndSeconds - input.currentSourcePositionSeconds);
  const transitionEnergy = resolveTransitionEnergy(current, next);
  const preferredOverlapSeconds = transitionEnergy.density >= 0.62
    ? 3.2
    : transitionEnergy.density >= 0.4
      ? 4
      : 4.8;
  const maxUsefulOverlapSeconds = Math.max(
    1,
    Math.min(maxTransition, Math.max(1, availableSeconds - 0.25), next.durationSeconds * 0.12),
  );
  const overlapSeconds = clamp(
    preferredOverlapSeconds,
    Math.min(2.75, maxUsefulOverlapSeconds),
    maxUsefulOverlapSeconds,
  );
  const earliestEndSeconds = input.currentSourcePositionSeconds + overlapSeconds;
  const fadeEndSeconds = selectPhraseBoundary(
    current,
    earliestEndSeconds,
    Math.max(earliestEndSeconds, preferredEndSeconds),
    Math.min(current.durationSeconds, Math.max(earliestEndSeconds, preferredEndSeconds + 1)),
  );
  const fadeStartSourceSeconds = Math.max(input.currentSourcePositionSeconds, fadeEndSeconds - overlapSeconds);
  const fadeStartOutputFrame = input.currentOutputFrame
    + Math.round((fadeStartSourceSeconds - input.currentSourcePositionSeconds) * sampleRate);
  const actualOverlapSeconds = Math.max(0.001, fadeEndSeconds - fadeStartSourceSeconds);
  const overlapFrames = Math.max(2, Math.round(actualOverlapSeconds * sampleRate));
  const nextBpm = next.bpm !== null && (next.bpmConfidence ?? 0) >= 0.68
    ? normalizeBpm(next.bpm)
    : null;
  const nextDownbeats = resolveDownbeatGrid(next, nextBpm);
  const nextSilenceTrimSeconds = clamp(next.leadingSilenceSeconds > 0.16 ? next.leadingSilenceSeconds - 0.04 : 0, 0, 12);
  const nextEntryFloorSeconds = Math.max(nextSilenceTrimSeconds, estimateMusicalEntrySeconds(next));
  const nextStartSeconds = selectNextEntryDownbeat(nextDownbeats, nextEntryFloorSeconds)
    ?? nextEntryFloorSeconds;

  return {
    version: automixTransitionPlanVersion,
    planId: `${input.queueRevision}:${input.fromItemId}:${input.toItemId}:${fadeStartOutputFrame}`,
    queueRevision: input.queueRevision,
    fromItemId: input.fromItemId,
    fromTrackId: input.fromTrackId,
    toItemId: input.toItemId,
    toTrackId: input.toTrackId,
    mixSampleRate: sampleRate,
    mode: 'short_crossfade',
    handoffProfile: 'rhythmic_bass_swap',
    currentStartSeconds: roundMillis(input.currentSourcePositionSeconds),
    currentEndSeconds: roundMillis(fadeEndSeconds),
    fadeStartOutputFrame,
    fadeEndOutputFrame: fadeStartOutputFrame + overlapFrames,
    commitOutputFrame: fadeStartOutputFrame + overlapFrames,
    nextStartSeconds: roundMillis(nextStartSeconds),
    overlapFrames,
    currentGainDb: 0,
    nextGainDb: resolveNextGainDb(current, next),
    tempoRatio: 1,
    fallbackReason: reason,
  };
};

export const planAutomixTransitionV2 = (input: AutomixPlanV2Input): AutomixTransitionPlanV2 => {
  if (input.currentIsDsd || input.nextIsDsd) {
    return fallbackPlan(input, 'dsd_direct');
  }
  if (Math.abs((input.playbackRate ?? 1) - 1) > 0.0001) {
    return fallbackPlan(input, 'playback_rate_active');
  }
  const current = input.currentAnalysis;
  const next = input.nextAnalysis;
  const trackBoundaryFadeSeconds = clamp((Number(input.trackBoundaryFadeMs) || 0) / 1000, 0, 5);
  if (current && next && trackBoundaryFadeSeconds > 0) {
    const sampleRate = Math.max(8000, Math.round(input.mixSampleRate));
    const remaining = Math.max(0, current.durationSeconds - input.currentSourcePositionSeconds);
    const overlapSeconds = Math.min(trackBoundaryFadeSeconds, remaining - 0.2, next.durationSeconds - 0.2);
    if (overlapSeconds > 0) {
      const fadeStartOutputFrame = input.currentOutputFrame
        + Math.max(0, Math.round((remaining - overlapSeconds) * sampleRate));
      const overlapFrames = Math.max(2, Math.round(overlapSeconds * sampleRate));
      return {
        version: automixTransitionPlanVersion,
        planId: `${input.queueRevision}:${input.fromItemId}:${input.toItemId}:${fadeStartOutputFrame}`,
        queueRevision: input.queueRevision,
        fromItemId: input.fromItemId,
        fromTrackId: input.fromTrackId,
        toItemId: input.toItemId,
        toTrackId: input.toTrackId,
        mixSampleRate: sampleRate,
        mode: 'short_crossfade',
        handoffProfile: 'balanced',
        currentStartSeconds: roundMillis(input.currentSourcePositionSeconds),
        currentEndSeconds: roundMillis(current.durationSeconds),
        fadeStartOutputFrame,
        fadeEndOutputFrame: fadeStartOutputFrame + overlapFrames,
        commitOutputFrame: fadeStartOutputFrame + overlapFrames,
        nextStartSeconds: 0,
        overlapFrames,
        currentGainDb: 0,
        nextGainDb: 0,
        tempoRatio: 1,
        fallbackReason: 'track_boundary_fade',
      };
    }
  }
  if (!current || !next || current.status === 'error' || next.status === 'error'
      || current.status === 'unavailable' || next.status === 'unavailable') {
    return fallbackPlan(input, 'analysis_unavailable', 'short_crossfade');
  }
  const remaining = current.durationSeconds - input.currentSourcePositionSeconds;
  if (remaining < 4 || next.durationSeconds < 4) {
    return fallbackPlan(input, 'short_track', 'short_crossfade');
  }

  const sampleRate = Math.max(8000, Math.round(input.mixSampleRate));
  const maxTransition = clamp(input.maxTransitionSeconds ?? 16, 2, 16);
  const currentBpm = current.bpm !== null && (current.bpmConfidence ?? 0) >= 0.68
    ? normalizeBpm(current.bpm)
    : null;
  const nextBpm = next.bpm !== null && (next.bpmConfidence ?? 0) >= 0.68
    ? normalizeBpm(next.bpm)
    : null;
  const rawTempoRatio = currentBpm !== null && nextBpm !== null ? currentBpm / nextBpm : 1;
  const currentDownbeats = resolveDownbeatGrid(current, currentBpm);
  const nextDownbeats = resolveDownbeatGrid(next, nextBpm);
  const nextSilenceTrimSeconds = clamp(next.leadingSilenceSeconds > 0.16 ? next.leadingSilenceSeconds - 0.04 : 0, 0, 12);
  const nextEntryFloorSeconds = Math.max(nextSilenceTrimSeconds, estimateMusicalEntrySeconds(next));
  const nextEntryDownbeat = selectNextEntryDownbeat(nextDownbeats, nextEntryFloorSeconds);
  const hasReliableTempoPair = current.status === 'complete'
    && next.status === 'complete'
    && currentBpm !== null
    && nextBpm !== null;
  if (hasReliableTempoPair && (rawTempoRatio < 0.94 || rawTempoRatio > 1.06)) {
    return musicalHandoffPlan(input, current, next, 'tempo_incompatible');
  }
  const hasReliableKeyPair = Boolean(
    current.key && next.key && current.key.confidence >= 0.45 && next.key.confidence >= 0.45,
  );
  if (hasReliableKeyPair && !keyCompatible(current.key, next.key)) {
    return musicalHandoffPlan(input, current, next, 'key_incompatible');
  }
  const canBeatMatch = current.status === 'complete'
    && next.status === 'complete'
    && currentBpm !== null
    && nextBpm !== null
    && rawTempoRatio >= 0.985
    && rawTempoRatio <= 1.015
    && keyCompatible(current.key, next.key)
    && currentDownbeats.length > 0
    && nextEntryDownbeat !== null;
  const mode: AutomixTransitionModeV2 = canBeatMatch ? 'beat_match' : 'phrase_crossfade';
  const beatBarSeconds = currentBpm !== null ? (60 / currentBpm) * 4 : 2;
  const transitionEnergy = resolveTransitionEnergy(current, next);
  const beatMatchBars = transitionEnergy.density >= 0.62
    ? 2
    : transitionEnergy.density >= 0.4
      ? 3
      : 4;
  const phraseEnergyLimit = transitionEnergy.density >= 0.62
    ? 5
    : transitionEnergy.density >= 0.4
      ? 7
      : 10;
  const overlapSeconds = canBeatMatch
    ? clamp(beatBarSeconds * beatMatchBars, Math.min(4, maxTransition), maxTransition)
    : clamp(
        Math.min(maxTransition, phraseEnergyLimit, remaining * 0.18, next.durationSeconds * 0.14),
        Math.min(3, maxTransition),
        maxTransition,
      );
  const preferredEnd = current.durationSeconds - Math.max(0, current.trailingSilenceSeconds - 0.08);
  const phraseEndSeconds = selectPhraseBoundary(
    current,
    input.currentSourcePositionSeconds + overlapSeconds + 0.5,
    preferredEnd,
    current.durationSeconds,
  );
  const fadeEndSeconds = canBeatMatch
    ? selectNearestDownbeat(
        currentDownbeats,
        phraseEndSeconds,
        input.currentSourcePositionSeconds + overlapSeconds + 0.5,
        current.durationSeconds,
      ) ?? phraseEndSeconds
    : phraseEndSeconds;
  const fadeStartSourceSeconds = Math.max(input.currentSourcePositionSeconds, fadeEndSeconds - overlapSeconds);
  const fadeStartOutputFrame = input.currentOutputFrame
    + Math.round((fadeStartSourceSeconds - input.currentSourcePositionSeconds) * sampleRate);
  const overlapFrames = Math.max(2, Math.round(overlapSeconds * sampleRate));
  const nextStartSeconds = canBeatMatch && nextEntryDownbeat !== null
    ? nextEntryDownbeat
    : nextEntryFloorSeconds;
  return {
    version: automixTransitionPlanVersion,
    planId: `${input.queueRevision}:${input.fromItemId}:${input.toItemId}:${fadeStartOutputFrame}`,
    queueRevision: input.queueRevision,
    fromItemId: input.fromItemId,
    fromTrackId: input.fromTrackId,
    toItemId: input.toItemId,
    toTrackId: input.toTrackId,
    mixSampleRate: sampleRate,
    mode,
    handoffProfile: 'balanced',
    currentStartSeconds: roundMillis(input.currentSourcePositionSeconds),
    currentEndSeconds: roundMillis(fadeEndSeconds),
    fadeStartOutputFrame,
    fadeEndOutputFrame: fadeStartOutputFrame + overlapFrames,
    commitOutputFrame: fadeStartOutputFrame + overlapFrames,
    nextStartSeconds: roundMillis(nextStartSeconds),
    overlapFrames,
    currentGainDb: 0,
    nextGainDb: resolveNextGainDb(current, next),
    tempoRatio: canBeatMatch ? roundMillis(rawTempoRatio) : 1,
    fallbackReason: canBeatMatch ? null : 'beat_or_key_incompatible',
  };
};
