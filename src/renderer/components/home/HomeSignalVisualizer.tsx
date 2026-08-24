import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { AudioStatus } from '../../../shared/types/audio';
import type { WorkshopActiveVisualizerPreset } from '../../../shared/types/workshop';
import { translateCurrentLocale } from '../../i18n/I18nProvider';
import {
  getSharedPlaybackStatusSnapshot,
  subscribeSharedPlaybackStatus,
} from '../../stores/playbackStatusStore';
import { useRenderBudget } from '../../performance/renderBudget';
import '../../styles/workshop-visualizer.css';

const defaultBarCount = 48;
const visualActiveStates = new Set<AudioStatus['state']>(['loading', 'playing']);

type SignalBarModel = {
  delay: string;
  duration: string;
  fallScale: string;
  height: string;
  maxScale: string;
  midScale: string;
  minScale: string;
  motion: string;
  opacity: string;
  targetHeight: number;
  targetMotion: number;
  targetOpacity: number;
  targetScale: number;
};

type HomeSignalVisualizerProps = {
  seed: string;
  preset?: WorkshopActiveVisualizerPreset | null;
};

const clampSignal = (value: number): number => Math.max(0, Math.min(1, value));

const hashStableString = (seed: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const dbToSignalUnit = (db: number | null | undefined): number | null => {
  if (db === null || db === undefined || !Number.isFinite(db)) {
    return null;
  }
  return clampSignal(Math.pow(10, db / 24));
};

const seededSignalNoise = (seed: string, index: number): number => {
  const hash = hashStableString(`${seed}:${index}`);
  return (hash % 1000) / 1000;
};

const signalBand = (position: number, center: number, width: number): number => {
  const distance = (position - center) / width;
  return Math.exp(-(distance * distance));
};

const sanitizeVisualSpectrum = (spectrum: number[] | undefined): number[] => {
  if (!Array.isArray(spectrum) || spectrum.length === 0) {
    return [];
  }
  return spectrum.map((value) => (Number.isFinite(value) ? clampSignal(value) : 0));
};

const visualSpectrumAt = (spectrum: number[], position: number): number => {
  if (spectrum.length === 0) {
    return 0;
  }
  const scaled = clampSignal(position) * (spectrum.length - 1);
  const leftIndex = Math.floor(scaled);
  const rightIndex = Math.min(spectrum.length - 1, leftIndex + 1);
  const mix = scaled - leftIndex;
  return spectrum[leftIndex] * (1 - mix) + spectrum[rightIndex] * mix;
};

const readHomeSignalVisualFlags = (
  status: AudioStatus | null | undefined,
): { isActive: boolean; meterReady: boolean; telemetryState: string } => ({
  isActive: visualActiveStates.has(status?.state ?? 'idle'),
  meterReady: Boolean(status?.audioLevels),
  telemetryState: status?.audioLevels?.visualTelemetryState ?? 'none',
});

const writeHomeSignalStyleIfChanged = (
  element: HTMLElement | null,
  property: string,
  value: string,
  writtenValues: string[],
  index: number,
): void => {
  if (!element || writtenValues[index] === value) {
    return;
  }
  element.style.setProperty(property, value);
  writtenValues[index] = value;
};

const resolveBarCount = (preset: WorkshopActiveVisualizerPreset | null | undefined): number =>
  Math.max(8, Math.min(128, preset?.barCount ?? defaultBarCount));

const samplePosition = (index: number, barCount: number, mirror: boolean): number => {
  if (!mirror) {
    return index / Math.max(1, barCount - 1);
  }
  const half = Math.ceil(barCount / 2);
  const mirroredIndex = index < half ? index : barCount - 1 - index;
  return mirroredIndex / Math.max(1, half - 1);
};

const buildHomeSignalBars = (
  status: AudioStatus | null | undefined,
  seed: string,
  preset: WorkshopActiveVisualizerPreset | null | undefined,
): SignalBarModel[] => {
  const barCount = resolveBarCount(preset);
  const sensitivity = preset?.sensitivity ?? 1;
  const audioLevels = status?.audioLevels ?? null;
  const isActive = visualActiveStates.has(status?.state ?? 'idle');
  const peakUnit = dbToSignalUnit(audioLevels?.estimatedOutputPeakDb ?? audioLevels?.inputPeakDb);
  const rmsUnit = dbToSignalUnit(audioLevels?.estimatedOutputRmsDb ?? audioLevels?.inputRmsDb);
  const peak = (peakUnit ?? 0) * Math.min(2, sensitivity);
  const rms = (rmsUnit ?? 0) * Math.min(2, sensitivity);
  const meterReady = Boolean(audioLevels);
  const signalSeed = status?.currentTrackId ?? seed;
  const visualSpectrum = sanitizeVisualSpectrum(audioLevels?.visualSpectrum);
  const visualSpectrumPeak = Math.max(0, ...visualSpectrum);
  const visualTelemetryState = audioLevels?.visualTelemetryState;
  const telemetryIsPriming = visualTelemetryState === 'priming';
  const trustedPcmSpectrum =
    visualSpectrum.length > 0 && (visualTelemetryState === 'pcm' || telemetryIsPriming || (visualTelemetryState === undefined && visualSpectrumPeak > 0.001));
  const visualEnergy = clampSignal((audioLevels?.visualEnergy ?? 0) * sensitivity);
  const visualTransient = clampSignal((audioLevels?.visualTransient ?? 0) * sensitivity);
  const positionSeconds = status?.positionSeconds ?? 0;
  const meterIsSilent = isActive && meterReady && visualSpectrumPeak <= 0.003 && visualEnergy <= 0.025 && peak <= 0.026 && rms <= 0.02;
  const meterIsPriming = telemetryIsPriming || (meterIsSilent && positionSeconds < 1.2);
  const flatActiveMeter = meterIsSilent && !meterIsPriming;
  const energy = meterIsPriming
    ? telemetryIsPriming
      ? clampSignal(visualEnergy * 0.66 + rms * 0.05)
      : 0.06
    : flatActiveMeter
      ? 0.1
      : meterReady
        ? trustedPcmSpectrum
          ? clampSignal(visualEnergy * 0.86 + peak * 0.16 + rms * 0.14)
          : clampSignal(peak * 0.44 + rms * 0.42)
        : 0;
  const crest = meterIsPriming
    ? telemetryIsPriming
      ? clampSignal(visualTransient * 0.35 + peak * 0.04)
      : 0.04
    : flatActiveMeter
      ? 0.06
      : meterReady
        ? trustedPcmSpectrum
          ? clampSignal(visualTransient * 0.86 + Math.max(0, peak - rms) * 1.8 + peak * 0.08)
          : clampSignal(Math.max(0, peak - rms) * 2.1 + peak * 0.12)
        : 0;
  const hasVisualSpectrum = trustedPcmSpectrum && !flatActiveMeter && visualSpectrumPeak > 0.001;
  const timeSlice = Math.floor(positionSeconds * 12);
  const mirror = preset?.mirror === true;
  return Array.from({ length: barCount }, (_, index) => {
    const position = samplePosition(index, barCount, mirror);
    const coarse = seededSignalNoise(signalSeed, index);
    const fine = seededSignalNoise(signalSeed, index + 101);
    const transient = seededSignalNoise(`${signalSeed}:hit:${timeSlice}`, Math.floor(index / 2));
    const bassBand = signalBand(position, 0.14 + seededSignalNoise(signalSeed, 701) * 0.08, 0.18);
    const vocalBand = signalBand(position, 0.45 + seededSignalNoise(signalSeed, 702) * 0.14, 0.26);
    const airBand = signalBand(position, 0.78 + seededSignalNoise(signalSeed, 703) * 0.08, 0.16);
    const edgeDrop = Math.sin(position * Math.PI);
    const fallbackHit = Math.max(0, (transient - 0.58) / 0.42);
    const comb =
      0.92 +
      Math.sin(position * Math.PI * (4.4 + coarse * 2.8) + fine * Math.PI) * 0.15 +
      Math.sin(position * Math.PI * (10.5 + fine * 4.2)) * 0.08;
    const fallbackProfile = clampSignal(
      bassBand * (0.55 + rms * 0.36) +
        vocalBand * (0.34 + energy * 0.34) +
        airBand * (0.2 + crest * 0.52) +
        edgeDrop * 0.22 +
        (coarse - 0.5) * 0.16 +
        (fine - 0.5) * 0.1,
    );
    const visualSpectrumValue = hasVisualSpectrum ? Math.pow(visualSpectrumAt(visualSpectrum, position), 0.68) : 0;
    const spectrumContour = hasVisualSpectrum
      ? clampSignal(
          visualSpectrumValue * 0.84 +
            Math.pow(visualSpectrumAt(visualSpectrum, Math.max(0, position - 0.035)), 0.72) * 0.08 +
            Math.pow(visualSpectrumAt(visualSpectrum, Math.min(1, position + 0.035)), 0.72) * 0.08,
        )
      : 0;
    const spectralProfile = hasVisualSpectrum
      ? clampSignal(spectrumContour * (1.02 + energy * 0.2) + edgeDrop * (telemetryIsPriming ? 0.006 : 0.018 + visualTransient * 0.035))
      : fallbackProfile;
    const meterHeight = hasVisualSpectrum
      ? 4 +
        (0.028 +
          spectralProfile * (telemetryIsPriming ? 0.2 + energy * 0.12 : 0.66 + energy * 0.58) +
          energy * (telemetryIsPriming ? 0.05 : 0.12) +
          (telemetryIsPriming ? 0 : visualTransient * edgeDrop * 0.18)) *
          86
      : 4 + (energy * (0.16 + spectralProfile * comb) + rms * edgeDrop * 0.1 + fallbackHit * crest * 0.38) * 86;
    const idleHeight = 3 + (0.03 + coarse * 0.05) * 34;
    const height = meterReady && isActive ? meterHeight : idleHeight;
    const motion = hasVisualSpectrum
      ? telemetryIsPriming
        ? 0.018 + spectrumContour * 0.035 + visualTransient * 0.035
        : 0.032 + spectrumContour * 0.09 + visualTransient * 0.18 + crest * 0.05
      : meterReady && isActive
        ? 0.08 + spectralProfile * 0.12 + crest * 0.18 + fallbackHit * 0.18
        : 0.04 + coarse * 0.05;
    const minScale = Math.max(0.32, 1 - motion * (0.66 + fine * 0.24));
    const maxScale = Math.min(1.18, 1 + motion * 0.44);
    const midScale = minScale + (maxScale - minScale) * (0.28 + fine * 0.24);
    const fallScale = minScale + (maxScale - minScale) * (0.48 + coarse * 0.18);
    const targetHeight = Math.max(4, Math.min(96, height));
    const targetScale = targetHeight / 100;
    const targetOpacity =
      meterReady && isActive
        ? 0.5 + Math.min(0.42, energy * 0.25 + spectralProfile * 0.2 + (hasVisualSpectrum ? 0 : fallbackHit * 0.13))
        : 0.12 + coarse * 0.08;
    const requestedMotion = hasVisualSpectrum
      ? telemetryIsPriming
        ? targetScale * (0.024 + spectrumContour * 0.045) + visualTransient * 0.012
        : targetScale * (0.045 + spectrumContour * 0.11) + visualTransient * 0.04 + energy * 0.012 + crest * 0.012
      : targetScale * (0.1 + spectralProfile * 0.18) + energy * 0.02 + crest * 0.024 + fallbackHit * 0.012;
    const liveMotion =
      meterReady && isActive
        ? meterIsPriming
          ? Math.min(telemetryIsPriming ? 0.03 : 0.045, targetScale * (telemetryIsPriming ? 0.32 : 0.5))
          : Math.min(0.24, targetScale * 0.68, Math.max(flatActiveMeter ? 0.055 : 0.024, requestedMotion))
        : 0;

    return {
      delay: `${hasVisualSpectrum ? -(index % 12) * 0.018 : -(index % 23) * (0.026 + fine * 0.018)}s`,
      duration: `${
        hasVisualSpectrum ? 980 + Math.round((0.5 + edgeDrop * 0.5) * 260) + (telemetryIsPriming ? 180 : 0) : 980 + Math.round((coarse * 0.48 + fine * 0.16) * 620)
      }ms`,
      fallScale: fallScale.toFixed(3),
      height: `${targetHeight.toFixed(2)}%`,
      maxScale: maxScale.toFixed(3),
      midScale: midScale.toFixed(3),
      minScale: minScale.toFixed(3),
      motion: liveMotion.toFixed(4),
      opacity: targetOpacity.toFixed(3),
      targetHeight,
      targetMotion: liveMotion,
      targetOpacity,
      targetScale,
    };
  });
};

export const HomeSignalVisualizer = ({ seed, preset = null }: HomeSignalVisualizerProps): JSX.Element => {
  const renderBudget = useRenderBudget();
  const visualizerRef = useRef<HTMLDivElement | null>(null);
  const barElementsRef = useRef<Array<HTMLElement | null>>([]);
  const seedRef = useRef(seed);
  const presetRef = useRef(preset);
  const writtenStylesRef = useRef<{
    writtenDelay: string[];
    writtenDuration: string[];
    writtenHeight: string[];
    writtenOpacity: string[];
    writtenTargetMotion: string[];
    writtenTargetScale: string[];
  }>({
    writtenDelay: [],
    writtenDuration: [],
    writtenHeight: [],
    writtenOpacity: [],
    writtenTargetMotion: [],
    writtenTargetScale: [],
  });
  const renderVisibleRef = useRef(renderBudget.isVisible);
  const [isAnimationVisible, setIsAnimationVisible] = useState(renderBudget.isVisible);
  const [visualFlags, setVisualFlags] = useState(() =>
    readHomeSignalVisualFlags(getSharedPlaybackStatusSnapshot().audioStatus),
  );
  seedRef.current = seed;
  presetRef.current = preset;
  renderVisibleRef.current = renderBudget.isVisible;
  const barCount = resolveBarCount(preset);

  const writeBarModel = (bar: SignalBarModel, index: number): void => {
    const state = writtenStylesRef.current;
    const element = barElementsRef.current[index];
    writeHomeSignalStyleIfChanged(element, '--home-signal-delay', bar.delay, state.writtenDelay, index);
    writeHomeSignalStyleIfChanged(element, '--home-signal-duration', bar.duration, state.writtenDuration, index);
    writeHomeSignalStyleIfChanged(element, '--home-signal-height', bar.height, state.writtenHeight, index);
    writeHomeSignalStyleIfChanged(element, '--home-signal-motion', bar.motion, state.writtenTargetMotion, index);
    writeHomeSignalStyleIfChanged(element, '--home-signal-opacity', bar.opacity, state.writtenOpacity, index);
    writeHomeSignalStyleIfChanged(element, '--home-signal-scale', bar.targetScale.toFixed(4), state.writtenTargetScale, index);
  };

  const syncBarsFromStatus = (status: AudioStatus | null | undefined): void => {
    const nextFlags = readHomeSignalVisualFlags(status);
    buildHomeSignalBars(status, status?.currentTrackId ?? seedRef.current, presetRef.current).forEach(writeBarModel);
    setVisualFlags((current) =>
      current.isActive === nextFlags.isActive &&
      current.meterReady === nextFlags.meterReady &&
      current.telemetryState === nextFlags.telemetryState
        ? current
        : nextFlags,
    );
  };

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }
    let elementVisible = true;
    let isDisposed = false;
    const updateAnimationVisibility = (): void => {
      if (isDisposed) {
        return;
      }
      const nextVisible = renderBudget.isVisible && elementVisible;
      setIsAnimationVisible((current) => (current === nextVisible ? current : nextVisible));
    };
    const element = visualizerRef.current;
    const intersectionObserver =
      element && typeof IntersectionObserver === 'function'
        ? new IntersectionObserver((entries) => {
            const entry = entries[0];
            elementVisible = entry ? entry.isIntersecting || entry.intersectionRatio > 0 : true;
            updateAnimationVisibility();
          })
        : null;
    if (element && intersectionObserver) {
      intersectionObserver.observe(element);
    }
    updateAnimationVisibility();
    return () => {
      isDisposed = true;
      intersectionObserver?.disconnect();
    };
  }, [renderBudget.isVisible]);

  useLayoutEffect(() => {
    if (renderBudget.isVisible) {
      syncBarsFromStatus(getSharedPlaybackStatusSnapshot().audioStatus);
    }
  });

  useEffect(() => {
    return subscribeSharedPlaybackStatus(() => {
      if (renderVisibleRef.current) {
        syncBarsFromStatus(getSharedPlaybackStatusSnapshot().audioStatus);
      }
    });
  }, []);

  const paletteStyle = {
    ...(preset?.palette[0] ? { '--home-signal-color-0': preset.palette[0] } : {}),
    ...(preset?.palette[1] ? { '--home-signal-color-1': preset.palette[1] } : {}),
    '--home-signal-count': String(barCount),
  } as CSSProperties;

  return (
    <div
      className="home-signal-visualizer"
      data-active={visualFlags.isActive}
      data-animation-visible={isAnimationVisible}
      data-meter-ready={visualFlags.meterReady}
      data-telemetry-state={visualFlags.telemetryState}
      data-style={preset?.style ?? 'bars'}
      data-mirror={preset?.mirror === true ? 'true' : 'false'}
      ref={visualizerRef}
      style={paletteStyle}
      aria-label={translateCurrentLocale('home.signalVisualizer.aria')}
    >
      <div className="home-signal-bars" aria-hidden="true">
        {Array.from({ length: barCount }, (_, index) => (
          <i
            key={index}
            ref={(element) => {
              barElementsRef.current[index] = element;
            }}
            style={{ '--home-signal-index': String(index) } as CSSProperties}
          />
        ))}
      </div>
    </div>
  );
};
