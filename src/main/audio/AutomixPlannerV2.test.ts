import { describe, expect, it } from 'vitest';
import {
  automixAnalysisVersion,
  resolveAutomixRuntimePhase,
  type AutomixAnalysisV2,
} from '../../shared/types/automix';
import { planAutomixTransitionV2 } from './AutomixPlannerV2';

const analysis = (
  overrides: Partial<AutomixAnalysisV2> = {},
): AutomixAnalysisV2 => ({
  version: automixAnalysisVersion,
  fingerprint: 'fixture',
  status: 'complete',
  durationSeconds: 180,
  bpm: 120,
  bpmConfidence: 0.95,
  beatOffsetMs: 0,
  beatGridSeconds: Array.from({ length: 360 }, (_value, index) => index * 0.5),
  downbeatGridSeconds: Array.from({ length: 90 }, (_value, index) => index * 2),
  phraseBoundaries: [
    { seconds: 160, bars: 16, confidence: 0.92 },
    { seconds: 176, bars: 8, confidence: 0.84 },
  ],
  key: {
    tonic: 9,
    mode: 'minor',
    camelot: '8A',
    confidence: 0.8,
    chroma: new Array<number>(12).fill(1 / 12),
  },
  leadingSilenceSeconds: 0.4,
  trailingSilenceSeconds: 0.2,
  integratedLufs: -14,
  introLufs: -14,
  outroLufs: -14,
  segmentRmsDb: new Array<number>(18).fill(-14),
  energyCurve: new Array<number>(18).fill(0.7),
  analyzedAt: '2026-07-17T00:00:00.000Z',
  error: null,
  ...overrides,
});

const baseInput = {
  queueRevision: 12,
  fromItemId: 'queue-a',
  fromTrackId: 'track-a',
  toItemId: 'queue-b',
  toTrackId: 'track-b',
  mixSampleRate: 48_000,
  currentOutputFrame: 48_000,
  currentSourcePositionSeconds: 1,
  currentAnalysis: analysis(),
  nextAnalysis: analysis({
    fingerprint: 'next',
    bpm: 119,
    leadingSilenceSeconds: 0.6,
    downbeatGridSeconds: [0.25, 2.267, 4.284, 6.301],
  }),
};

describe('AutomixPlannerV2', () => {
  it('builds a fixed native track-boundary fade without musical retiming', () => {
    const plan = planAutomixTransitionV2({ ...baseInput, trackBoundaryFadeMs: 1500 });

    expect(plan).toMatchObject({
      mode: 'short_crossfade',
      nextStartSeconds: 0,
      currentEndSeconds: 180,
      fallbackReason: 'track_boundary_fade',
      tempoRatio: 1,
    });
    expect(plan.overlapFrames).toBe(72_000);
    expect(plan.fadeStartOutputFrame).toBe(48_000 + (177.5 * 48_000));
    expect(plan.commitOutputFrame).toBe(plan.fadeEndOutputFrame);
  });

  it('defaults production opt-in playback to native beta while preserving the kill switch', () => {
    expect(resolveAutomixRuntimePhase(undefined)).toBe('native_beta');
    expect(resolveAutomixRuntimePhase('off')).toBe('off');
    expect(resolveAutomixRuntimePhase('unexpected', 'shadow')).toBe('shadow');
  });

  it('builds a deterministic, frame-exact beat-match plan for the exact next queue item', () => {
    const first = planAutomixTransitionV2(baseInput);
    const second = planAutomixTransitionV2(baseInput);

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      mode: 'beat_match',
      handoffProfile: 'balanced',
      queueRevision: 12,
      fromItemId: 'queue-a',
      toItemId: 'queue-b',
      mixSampleRate: 48_000,
      fallbackReason: null,
    });
    expect(first.tempoRatio).toBeGreaterThanOrEqual(0.985);
    expect(first.tempoRatio).toBeLessThanOrEqual(1.015);
    expect(first.overlapFrames).toBeLessThanOrEqual(48_000 * 4.1);
    expect(first.fadeEndOutputFrame - first.fadeStartOutputFrame).toBe(first.overlapFrames);
    expect(first.commitOutputFrame).toBe(first.fadeEndOutputFrame);
    const fadeStartSourceSeconds = baseInput.currentSourcePositionSeconds
      + ((first.fadeStartOutputFrame - baseInput.currentOutputFrame) / baseInput.mixSampleRate);
    expect(fadeStartSourceSeconds % 2).toBeCloseTo(0, 6);
    expect(first.nextStartSeconds).toBe(2.267);
    expect(first.nextStartSeconds).not.toBe(0.56);
  });

  it('derives downbeats from beat offset when a cached analysis has no explicit grid', () => {
    const plan = planAutomixTransitionV2({
      ...baseInput,
      nextAnalysis: analysis({
        fingerprint: 'next-offset-only',
        bpm: 120,
        beatOffsetMs: 750,
        beatGridSeconds: [],
        downbeatGridSeconds: [],
      }),
    });

    expect(plan.mode).toBe('beat_match');
    expect(plan.nextStartSeconds).toBe(0.75);
  });

  it('keeps queue identity but uses a musical handoff for confidently incompatible keys', () => {
    const plan = planAutomixTransitionV2({
      ...baseInput,
      nextAnalysis: analysis({
        fingerprint: 'next',
        key: {
          tonic: 1,
          mode: 'major',
          camelot: '3B',
          confidence: 0.9,
          chroma: new Array<number>(12).fill(1 / 12),
        },
      }),
    });

    expect(plan.mode).toBe('short_crossfade');
    expect(plan.toItemId).toBe('queue-b');
    expect(plan.tempoRatio).toBe(1);
    expect(plan.fallbackReason).toBe('key_incompatible');
    expect(plan.handoffProfile).toBe('rhythmic_bass_swap');
    expect(plan.overlapFrames).toBeGreaterThan(48_000 * 3);
    expect(plan.nextStartSeconds).toBeGreaterThanOrEqual(0.6);
    expect(plan.commitOutputFrame).toBe(plan.fadeEndOutputFrame);
  });

  it('enters on a musical downbeat after a weak intro instead of fading into near-silence', () => {
    const plan = planAutomixTransitionV2({
      ...baseInput,
      nextAnalysis: analysis({
        fingerprint: 'next-with-weak-intro',
        leadingSilenceSeconds: 0,
        energyCurve: [0.02, 0.04, 0.08, 0.12, 0.72, 0.82, 0.78, 0.7, 0.66, 0.6, 0.55, 0.5, 0.44, 0.38, 0.3, 0.24, 0.18, 0.12],
        downbeatGridSeconds: [0, 2, 4, 6, 8, 10, 12],
      }),
    });

    expect(plan.mode).toBe('beat_match');
    expect(plan.nextStartSeconds).toBe(8);
  });

  it('matches the outgoing and incoming regions instead of whole-track loudness', () => {
    const plan = planAutomixTransitionV2({
      ...baseInput,
      currentAnalysis: analysis({ integratedLufs: -10, outroLufs: -20 }),
      nextAnalysis: analysis({ fingerprint: 'next-loud-intro', integratedLufs: -20, introLufs: -14 }),
    });

    expect(plan.nextGainDb).toBeLessThan(0);
    expect(plan.nextGainDb).toBeGreaterThanOrEqual(-3.5);
  });

  it('uses an explicit short-crossfade fallback when analysis is unavailable', () => {
    const plan = planAutomixTransitionV2({
      ...baseInput,
      nextAnalysis: analysis({ status: 'unavailable', error: 'not_analyzed' }),
    });

    expect(plan.mode).toBe('short_crossfade');
    expect(plan.fallbackReason).toBe('analysis_unavailable');
    expect(plan.overlapFrames).toBeGreaterThanOrEqual(48_000);
    expect(plan.overlapFrames).toBeLessThanOrEqual(48_000 * 3);
    expect(plan.commitOutputFrame).toBe(plan.fadeEndOutputFrame);
  });

  it('trims silence and hands off at musical boundaries for incompatible tempo', () => {
    const plan = planAutomixTransitionV2({
      ...baseInput,
      currentAnalysis: analysis({
        durationSeconds: 344,
        bpm: 88,
        trailingSilenceSeconds: 6.333,
        outroLufs: -8.625,
        phraseBoundaries: [
          { seconds: 327.273, bars: 8, confidence: 0.78 },
          { seconds: 338.182, bars: 4, confidence: 0.64 },
        ],
        energyCurve: [0.8, 0.7, 0.6, 0.4, 0.2, 0.02, 0, 0],
      }),
      nextAnalysis: analysis({
        fingerprint: 'fast-next',
        durationSeconds: 210,
        bpm: 128,
        leadingSilenceSeconds: 2.401,
        introLufs: -12.194,
        downbeatGridSeconds: [0, 1.875, 3.75, 5.625, 7.5, 9.375, 11.25, 13.125, 15],
        energyCurve: [0, 0, 0.25, 0.49, 0.31, 0.4, 0.35, 0.3, 0.2, 0.2, 0.18, 0.16, 0.14, 0.12, 0.1, 0.08, 0.04, 0],
      }),
    });

    expect(plan.mode).toBe('short_crossfade');
    expect(plan.fallbackReason).toBe('tempo_incompatible');
    expect(plan.handoffProfile).toBe('rhythmic_bass_swap');
    expect(plan.overlapFrames).toBeGreaterThan(48_000 * 3);
    expect(plan.currentEndSeconds).toBe(338.182);
    expect(plan.currentEndSeconds).toBeLessThan(344 - 5);
    expect(plan.nextStartSeconds).toBe(7.5);
    expect(plan.nextGainDb).toBeGreaterThan(0);
  });

  it('keeps a late-enabled handoff inside the remaining source duration', () => {
    const plan = planAutomixTransitionV2({
      ...baseInput,
      currentSourcePositionSeconds: 175,
      currentAnalysis: analysis({ trailingSilenceSeconds: 8 }),
      nextAnalysis: analysis({ fingerprint: 'fast-next', bpm: 150 }),
    });

    const fadeStartSourceSeconds = 175
      + ((plan.fadeStartOutputFrame - baseInput.currentOutputFrame) / baseInput.mixSampleRate);
    expect(plan.mode).toBe('short_crossfade');
    expect(fadeStartSourceSeconds).toBeGreaterThanOrEqual(175);
    expect(plan.currentEndSeconds).toBeLessThanOrEqual(180);
  });

  it('bypasses DSD without selecting a later queue item', () => {
    const plan = planAutomixTransitionV2({ ...baseInput, nextIsDsd: true });

    expect(plan.mode).toBe('gapless_fallback');
    expect(plan.fallbackReason).toBe('dsd_direct');
    expect(plan.toItemId).toBe('queue-b');
    expect(plan.commitOutputFrame).toBe(plan.fadeEndOutputFrame);
  });
});
