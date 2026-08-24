import { ArrowLeft, Disc3, Pause, Play, SkipBack, SkipForward, Volume1, Volume2, VolumeX } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, MutableRefObject, PointerEvent, RefObject } from 'react';
import type {
  WorkshopActiveLyricsScene,
  WorkshopLyricsSceneNode,
  WorkshopLyricsSceneSlotNode,
  WorkshopLyricsSceneStyle,
} from '../../shared/types/workshopLyricsScene';
import { LyricsView, getActiveLyricIndex, getEstimatedPlainLyricIndex } from '../components/lyrics/LyricsView';
import type { LyricsState } from '../components/lyrics/lyricsTypes';
import '../styles/workshop-lyrics-scene.css';
import { WorkshopProtocolImage } from './WorkshopProtocolImage';
import { isWorkshopAssetProtocolUrl } from './workshopAssetUrl';

type SceneViewport = 'compact' | 'standard' | 'wide';

export type WorkshopLyricsSceneTrackTech = {
  codec: string | null;
  sampleRateHz: number | null;
  bitDepth: number | null;
  bitrateKbps: number | null;
  bpm: number | null;
};

export type WorkshopLyricsSceneRendererProps = {
  activeScene: WorkshopActiveLyricsScene;
  title: string;
  artist: string;
  album: string | null;
  coverUrl: string | null;
  lyrics: LyricsState;
  durationMs: number;
  positionMs: number;
  playbackRate: number;
  playbackState: string;
  positionUpdatedAtMs: number;
  isPlaying: boolean;
  spectrumBands: number[];
  defaultShowRomanization: boolean;
  defaultShowTranslation: boolean;
  defaultWordHighlightEnabled: boolean;
  highFrequencyUpdatesEnabled: boolean;
  motionEnabled: boolean;
  seekEnabled: boolean;
  timelineSeekEnabled: boolean;
  seekTimelineOffsetMs: number;
  canGoNext: boolean;
  canGoPrevious: boolean;
  trackTech?: WorkshopLyricsSceneTrackTech | null;
  volume?: number;
  volumeInteractive?: boolean;
  onVolumeChange?: (volume: number) => void;
  onSeek: (timeMs: number) => void;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onBack: () => void;
};

const themeTokens: Record<string, string> = {
  '$text': 'var(--theme-text)',
  '$muted': 'var(--theme-muted-text)',
  '$accent': 'var(--theme-accent)',
  '$accent-strong': 'var(--theme-accent-strong)',
  '$panel': 'var(--theme-panel-bg)',
  '$background': 'var(--theme-app-bg)',
  '$border': 'var(--theme-panel-border)',
  '$danger': 'var(--theme-danger)',
  '$success': 'var(--theme-success)',
  '$on-cover': '#ffffff',
};

const resolveStyle = (
  style: WorkshopLyricsSceneStyle | undefined,
  responsive: WorkshopLyricsSceneNode['responsive'],
  viewport: SceneViewport,
): CSSProperties => {
  const merged = {
    ...(style ?? {}),
    ...(viewport === 'compact' ? responsive?.compact : viewport === 'wide' ? responsive?.wide : {}),
  };
  return Object.fromEntries(Object.entries(merged).map(([key, rawValue]) => [
    key,
    typeof rawValue === 'string'
      ? rawValue.replace(/\$(?:accent-strong|on-cover|background|success|danger|accent|muted|panel|border|text)\b/gu, (token) => themeTokens[token] ?? token)
      : rawValue,
  ])) as CSSProperties;
};

const formatTime = (milliseconds: number): string => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`;
};

const clampSpectrumValue = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

const shapeSpectrumValue = (value: number, gain: number): number => {
  const source = clampSpectrumValue(value);
  if (source <= 0) return 0;
  const normalized = clampSpectrumValue((source - 0.025) / 0.975);
  const expanded = normalized ** 1.55 * Math.max(0, gain);
  return clampSpectrumValue(expanded);
};

const sampleSpectrumValue = (
  bands: number[],
  index: number,
  count: number,
  scale: 'linear' | 'perceptual',
): number => {
  if (bands.length === 0) return 0;
  const normalizedPosition = index / Math.max(1, count - 1);
  const scaledPosition = scale === 'perceptual' ? normalizedPosition ** 2 : normalizedPosition;
  const position = scaledPosition * Math.max(0, bands.length - 1);
  const leftIndex = Math.floor(position);
  const rightIndex = Math.min(bands.length - 1, leftIndex + 1);
  const mix = position - leftIndex;
  const left = clampSpectrumValue(bands[leftIndex] ?? 0);
  const right = clampSpectrumValue(bands[rightIndex] ?? left);
  return left * (1 - mix) + right * mix;
};

type SpectrumBarsProps = {
  bandsRef: MutableRefObject<number[]>;
  count: number;
  gain: number;
  scale: 'linear' | 'perceptual';
  attackMs: number;
  releaseMs: number;
};

const SpectrumBars = memo(({ bandsRef, count, gain, scale, attackMs, releaseMs }: SpectrumBarsProps): JSX.Element => {
  const rootRef = useRef<HTMLSpanElement>(null);
  const initialValues = useMemo(() => Array.from({ length: count }, (_, index) =>
    shapeSpectrumValue(sampleSpectrumValue(bandsRef.current, index, count, scale), gain)
  ), [bandsRef, count, gain, scale]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const bars = Array.from(root.children) as HTMLElement[];
    const currentValues = [...initialValues];
    let frameId = 0;
    let previousTime = performance.now();

    const renderFrame = (time: number): void => {
      const elapsedMs = Math.min(64, Math.max(0, time - previousTime));
      previousTime = time;
      const source = bandsRef.current;
      bars.forEach((bar, index) => {
        const target = shapeSpectrumValue(sampleSpectrumValue(source, index, count, scale), gain);
        const responseMs = target >= currentValues[index] ? attackMs : releaseMs;
        const blend = 1 - Math.exp(-elapsedMs / responseMs);
        const next = currentValues[index] + (target - currentValues[index]) * blend;
        currentValues[index] = Math.abs(next - target) < 0.002 ? target : next;
        bar.style.setProperty('--workshop-spectrum-value', String(currentValues[index]));
      });
      frameId = requestAnimationFrame(renderFrame);
    };

    if (typeof requestAnimationFrame === 'function') {
      frameId = requestAnimationFrame(renderFrame);
      return () => cancelAnimationFrame(frameId);
    }
    return undefined;
  }, [attackMs, bandsRef, count, gain, initialValues, releaseMs, scale]);

  return (
    <span ref={rootRef} className="workshop-lyrics-scene__spectrum" aria-hidden="true">
      {initialValues.map((value, index) => (
        <i key={index} style={{ '--workshop-spectrum-value': value } as CSSProperties} />
      ))}
    </span>
  );
});

SpectrumBars.displayName = 'SpectrumBars';

type SeekBarProps = {
  progress: number;
  durationMs: number;
  positionMs: number;
  interactive: boolean;
  onSeek: (timeMs: number) => void;
};

const seekBarKeyboardStepMs = 5_000;

const SeekBar = ({ progress, durationMs, positionMs, interactive, onSeek }: SeekBarProps): JSX.Element => {
  const trackRef = useRef<HTMLSpanElement>(null);
  const [scrubProgress, setScrubProgress] = useState<number | null>(null);

  const progressAtClientX = useCallback((clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  const handlePointerDown = (event: PointerEvent<HTMLSpanElement>): void => {
    if (!interactive || event.button !== 0) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointers cannot be captured; scrubbing still works without it.
    }
    setScrubProgress(progressAtClientX(event.clientX));
  };

  const handlePointerMove = (event: PointerEvent<HTMLSpanElement>): void => {
    if (scrubProgress === null) return;
    setScrubProgress(progressAtClientX(event.clientX));
  };

  const handlePointerUp = (event: PointerEvent<HTMLSpanElement>): void => {
    if (scrubProgress === null) return;
    setScrubProgress(null);
    onSeek(progressAtClientX(event.clientX) * durationMs);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>): void => {
    if (!interactive) return;
    const step = event.key === 'ArrowLeft' ? -seekBarKeyboardStepMs : event.key === 'ArrowRight' ? seekBarKeyboardStepMs : 0;
    if (step === 0) return;
    event.preventDefault();
    onSeek(Math.max(0, Math.min(durationMs, positionMs + step)));
  };

  const displayedProgress = scrubProgress ?? progress;
  return (
    <span
      ref={trackRef}
      className="workshop-lyrics-scene__seek-bar"
      data-interactive={interactive ? 'true' : 'false'}
      data-scrubbing={scrubProgress === null ? undefined : 'true'}
      role="slider"
      tabIndex={interactive ? 0 : -1}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(durationMs)}
      aria-valuenow={Math.round(displayedProgress * durationMs)}
      aria-valuetext={formatTime(displayedProgress * durationMs)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => setScrubProgress(null)}
      onKeyDown={handleKeyDown}
    >
      <span className="workshop-lyrics-scene__seek-bar-fill" style={{ width: `${displayedProgress * 100}%` }} />
      <span className="workshop-lyrics-scene__seek-bar-thumb" style={{ left: `${displayedProgress * 100}%` }} />
    </span>
  );
};

const formatSampleRate = (sampleRateHz: number): string => {
  const kilohertz = sampleRateHz / 1000;
  return `${Number.isInteger(kilohertz) ? kilohertz : Number(kilohertz.toFixed(1))} KHZ`;
};

const trackTechItems = (tech: WorkshopLyricsSceneTrackTech | null | undefined): string[] => {
  if (!tech) return [];
  return [
    tech.codec?.trim() ? tech.codec.trim().toUpperCase() : null,
    tech.bitDepth && tech.bitDepth > 0 ? `${tech.bitDepth}-BIT` : null,
    tech.sampleRateHz && tech.sampleRateHz > 0 ? formatSampleRate(tech.sampleRateHz) : null,
    tech.bitrateKbps && tech.bitrateKbps > 0 ? `${Math.round(tech.bitrateKbps)} KBPS` : null,
    tech.bpm && tech.bpm > 0 ? `${Math.round(tech.bpm)} BPM` : null,
  ].filter((item): item is string => item !== null);
};

type VolumeBarProps = {
  volume: number;
  interactive: boolean;
  onVolumeChange: (volume: number) => void;
};

const volumeKeyboardStep = 0.05;

const VolumeBar = ({ volume, interactive, onVolumeChange }: VolumeBarProps): JSX.Element => {
  const trackRef = useRef<HTMLSpanElement>(null);
  const [scrubVolume, setScrubVolume] = useState<number | null>(null);

  const volumeAtClientX = useCallback((clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  const handlePointerDown = (event: PointerEvent<HTMLSpanElement>): void => {
    if (!interactive || event.button !== 0) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointers cannot be captured; scrubbing still works without it.
    }
    setScrubVolume(volumeAtClientX(event.clientX));
  };

  const handlePointerMove = (event: PointerEvent<HTMLSpanElement>): void => {
    if (scrubVolume === null) return;
    setScrubVolume(volumeAtClientX(event.clientX));
  };

  const handlePointerUp = (event: PointerEvent<HTMLSpanElement>): void => {
    if (scrubVolume === null) return;
    setScrubVolume(null);
    onVolumeChange(volumeAtClientX(event.clientX));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>): void => {
    if (!interactive) return;
    const step = event.key === 'ArrowLeft' || event.key === 'ArrowDown'
      ? -volumeKeyboardStep
      : event.key === 'ArrowRight' || event.key === 'ArrowUp'
        ? volumeKeyboardStep
        : 0;
    if (step === 0) return;
    event.preventDefault();
    onVolumeChange(Math.max(0, Math.min(1, volume + step)));
  };

  const displayedVolume = scrubVolume ?? volume;
  const Icon = displayedVolume <= 0 ? VolumeX : displayedVolume < 0.5 ? Volume1 : Volume2;
  return (
    <span className="workshop-lyrics-scene__volume">
      <Icon className="workshop-lyrics-scene__volume-icon" aria-hidden="true" />
      <span
        ref={trackRef}
        className="workshop-lyrics-scene__seek-bar workshop-lyrics-scene__seek-bar--volume"
        data-interactive={interactive ? 'true' : 'false'}
        data-scrubbing={scrubVolume === null ? undefined : 'true'}
        role="slider"
        tabIndex={interactive ? 0 : -1}
        aria-label="Volume"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(displayedVolume * 100)}
        aria-valuetext={`${Math.round(displayedVolume * 100)}%`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => setScrubVolume(null)}
        onKeyDown={handleKeyDown}
      >
        <span className="workshop-lyrics-scene__seek-bar-fill" style={{ width: `${displayedVolume * 100}%` }} />
        <span className="workshop-lyrics-scene__seek-bar-thumb" style={{ left: `${displayedVolume * 100}%` }} />
      </span>
    </span>
  );
};

type TransitionedLyricTextProps = {
  text: string;
  transitionKey: string;
  motionEnabled: boolean;
};

type LyricTextTransitionState = {
  currentKey: string;
  currentText: string;
  outgoingText: string | null;
  revision: number;
  animate: boolean;
};

const LYRIC_TEXT_TRANSITION_MS = 520;

const TransitionedLyricText = ({
  text,
  transitionKey,
  motionEnabled,
}: TransitionedLyricTextProps): JSX.Element => {
  const [transition, setTransition] = useState<LyricTextTransitionState>(() => ({
    currentKey: transitionKey,
    currentText: text,
    outgoingText: null,
    revision: 0,
    animate: motionEnabled,
  }));

  useEffect(() => {
    setTransition((previous) => {
      const sameLine = previous.currentKey === transitionKey && previous.currentText === text;
      if (!motionEnabled) {
        if (sameLine && previous.outgoingText === null) {
          return previous;
        }
        return {
          currentKey: transitionKey,
          currentText: text,
          outgoingText: null,
          revision: sameLine ? previous.revision : previous.revision + 1,
          animate: false,
        };
      }
      if (sameLine) {
        return previous;
      }
      return {
        currentKey: transitionKey,
        currentText: text,
        outgoingText: previous.currentText || null,
        revision: previous.revision + 1,
        animate: true,
      };
    });
  }, [motionEnabled, text, transitionKey]);

  useEffect(() => {
    if (!transition.outgoingText) return undefined;
    const revision = transition.revision;
    const timer = window.setTimeout(() => {
      setTransition((current) => current.revision === revision
        ? { ...current, outgoingText: null }
        : current);
    }, LYRIC_TEXT_TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [transition.outgoingText, transition.revision]);

  return (
    <span className="workshop-lyrics-scene__lyric-transition">
      {transition.outgoingText ? (
        <span
          key={`outgoing-${transition.revision}`}
          className="workshop-lyrics-scene__lyric-transition-line workshop-lyrics-scene__lyric-transition-line--outgoing"
          aria-hidden="true"
        >
          {transition.outgoingText}
        </span>
      ) : null}
      <span
        key={`incoming-${transition.revision}`}
        className={`workshop-lyrics-scene__lyric-transition-line workshop-lyrics-scene__lyric-transition-line--incoming${transition.animate ? ' workshop-lyrics-scene__lyric-transition-line--animate' : ''}`}
      >
        {transition.currentText}
      </span>
    </span>
  );
};

const sceneNodeUsesSpectrum = (node: WorkshopLyricsSceneNode): boolean =>
  node.type === 'slot'
    ? node.slot === 'spectrum'
    : node.type === 'group' && node.children.some(sceneNodeUsesSpectrum);

const useSceneViewport = (): { ref: RefObject<HTMLDivElement>; viewport: SceneViewport } => {
  const ref = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<SceneViewport>('standard');
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? 0;
      setViewport(width < 760 ? 'compact' : width >= 1440 ? 'wide' : 'standard');
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, viewport };
};

export const WorkshopLyricsSceneRenderer = ({
  activeScene,
  title,
  artist,
  album,
  coverUrl,
  lyrics,
  durationMs,
  positionMs,
  playbackRate,
  playbackState,
  positionUpdatedAtMs,
  isPlaying,
  spectrumBands,
  defaultShowRomanization,
  defaultShowTranslation,
  defaultWordHighlightEnabled,
  highFrequencyUpdatesEnabled,
  motionEnabled,
  seekEnabled,
  timelineSeekEnabled,
  seekTimelineOffsetMs,
  canGoNext,
  canGoPrevious,
  trackTech = null,
  volume = 1,
  volumeInteractive = false,
  onVolumeChange,
  onSeek,
  onTogglePlay,
  onNext,
  onPrevious,
  onBack,
}: WorkshopLyricsSceneRendererProps): JSX.Element => {
  const { ref, viewport } = useSceneViewport();
  const [enterSettled, setEnterSettled] = useState(!motionEnabled);
  useEffect(() => {
    if (!motionEnabled) {
      setEnterSettled(true);
      return undefined;
    }
    if (enterSettled) return undefined;
    const timer = window.setTimeout(() => setEnterSettled(true), 800);
    return () => window.clearTimeout(timer);
  }, [enterSettled, motionEnabled]);
  const spectrumBandsRef = useRef(spectrumBands);
  spectrumBandsRef.current = spectrumBands;
  const usesSpectrum = useMemo(
    () => sceneNodeUsesSpectrum(activeScene.scene.root),
    [activeScene.scene.root],
  );
  useEffect(() => {
    const workshop = window.echo?.workshop;
    if (!usesSpectrum || !workshop?.setLyricsSpectrumActive) return undefined;
    void workshop.setLyricsSpectrumActive(true).catch(() => undefined);
    return () => {
      void workshop.setLyricsSpectrumActive(false).catch(() => undefined);
    };
  }, [usesSpectrum]);
  const activeLineIndex = useMemo(() => {
    if (lyrics.kind === 'synced') {
      return getActiveLyricIndex(lyrics.lines, positionMs, lyrics.offsetMs);
    }
    if (lyrics.kind === 'plain') {
      return getEstimatedPlainLyricIndex(lyrics.lines, positionMs, durationMs);
    }
    return -1;
  }, [durationMs, lyrics, positionMs]);
  const lineAt = (offset: number) => lyrics.lines[activeLineIndex + offset] ?? null;
  const progress = durationMs > 0 ? Math.max(0, Math.min(1, positionMs / durationMs)) : 0;
  const context = { hasCover: Boolean(coverUrl), hasLyrics: lyrics.lines.length > 0, isPlaying };

  const renderSlot = (node: WorkshopLyricsSceneSlotNode): JSX.Element | null => {
    const line = node.slot === 'previous-line'
      ? lineAt(-1)
      : node.slot === 'next-line'
        ? lineAt(1)
        : lineAt(0);
    switch (node.slot) {
      case 'cover':
        return coverUrl
          ? <img className="workshop-lyrics-scene__cover" alt="" draggable={false} src={coverUrl} />
          : <span className="workshop-lyrics-scene__cover-empty" aria-hidden="true"><Disc3 /></span>;
      case 'title': return <span>{title}</span>;
      case 'artist': return <span>{artist}</span>;
      case 'album': return album ? <span>{album}</span> : null;
      case 'lyrics':
        return (
          <LyricsView
            lyrics={lyrics}
            durationMs={durationMs}
            positionMs={positionMs}
            playbackRate={playbackRate}
            playbackState={playbackState}
            positionUpdatedAtMs={positionUpdatedAtMs}
            onSeek={onSeek}
            seekEnabled={seekEnabled}
            seekTimelineOffsetMs={seekTimelineOffsetMs}
            emptyLabel={node.options?.emptyText}
            showRomanization={node.options?.showRomanization ?? defaultShowRomanization}
            showTranslation={node.options?.showTranslation ?? defaultShowTranslation}
            showTimestamps={node.options?.showTimestamps === true}
            wordHighlightEnabled={node.options?.wordHighlightEnabled ?? defaultWordHighlightEnabled}
            estimatedWordTimingEnabled
            highFrequencyUpdatesEnabled={highFrequencyUpdatesEnabled}
            textDirection="horizontal"
          />
        );
      case 'current-line':
      case 'previous-line':
      case 'next-line': {
        const text = line?.text || node.options?.emptyText;
        return text ? (
          <TransitionedLyricText
            text={text}
            transitionKey={`${activeLineIndex}:${node.slot}`}
            motionEnabled={motionEnabled}
          />
        ) : null;
      }
      case 'translation': {
        const text = line?.translation || node.options?.emptyText;
        return text ? (
          <TransitionedLyricText
            text={text}
            transitionKey={`${activeLineIndex}:${node.slot}`}
            motionEnabled={motionEnabled}
          />
        ) : null;
      }
      case 'progress':
        return (
          <span className="workshop-lyrics-scene__progress" role="progressbar" aria-valuenow={Math.round(progress * 100)}>
            <span style={{ width: `${progress * 100}%` }} />
          </span>
        );
      case 'seek-bar':
        return (
          <SeekBar
            progress={progress}
            durationMs={durationMs}
            positionMs={positionMs}
            interactive={timelineSeekEnabled && durationMs > 0}
            onSeek={onSeek}
          />
        );
      case 'play-toggle':
        return (
          <button
            className="workshop-lyrics-scene__control workshop-lyrics-scene__control--play"
            type="button"
            aria-label={isPlaying ? 'Pause' : 'Play'}
            onClick={onTogglePlay}
          >
            {isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          </button>
        );
      case 'previous-track':
        return (
          <button
            className="workshop-lyrics-scene__control"
            type="button"
            aria-label="Previous track"
            disabled={!canGoPrevious}
            onClick={onPrevious}
          >
            <SkipBack aria-hidden="true" />
          </button>
        );
      case 'next-track':
        return (
          <button
            className="workshop-lyrics-scene__control"
            type="button"
            aria-label="Next track"
            disabled={!canGoNext}
            onClick={onNext}
          >
            <SkipForward aria-hidden="true" />
          </button>
        );
      case 'time-current': return <span>{formatTime(positionMs)}</span>;
      case 'time-duration': return <span>{formatTime(durationMs)}</span>;
      case 'spectrum': {
        const count = node.options?.spectrumBars ?? 24;
        const gain = node.options?.spectrumGain ?? 1;
        const scale = node.options?.spectrumScale ?? 'linear';
        return (
          <SpectrumBars
            bandsRef={spectrumBandsRef}
            count={count}
            gain={gain}
            scale={scale}
            attackMs={node.options?.spectrumAttackMs ?? 18}
            releaseMs={node.options?.spectrumReleaseMs ?? 48}
          />
        );
      }
      case 'status': return <span>{playbackState}</span>;
      case 'track-tech': {
        const items = trackTechItems(trackTech);
        return items.length > 0 ? (
          <span className="workshop-lyrics-scene__tech">
            {items.map((item) => (
              <span key={item} className="workshop-lyrics-scene__tech-item">{item}</span>
            ))}
          </span>
        ) : null;
      }
      case 'volume-slider':
        return (
          <VolumeBar
            volume={Math.max(0, Math.min(1, volume))}
            interactive={volumeInteractive && typeof onVolumeChange === 'function'}
            onVolumeChange={(nextVolume) => onVolumeChange?.(nextVolume)}
          />
        );
    }
  };

  const renderNode = (node: WorkshopLyricsSceneNode): JSX.Element | null => {
    if (node.when && Object.entries(node.when).some(([key, value]) => context[key as keyof typeof context] !== value)) {
      return null;
    }
    const motion = node.motion;
    const style = {
      ...resolveStyle(node.style, node.responsive, viewport),
      ...(motion ? {
        '--workshop-motion-duration': `${motion.durationMs ?? 600}ms`,
        '--workshop-motion-delay': `${motion.delayMs ?? 0}ms`,
        '--workshop-motion-intensity': motion.intensity ?? 1,
        '--workshop-motion-offset': `${22 * (motion.intensity ?? 1)}px`,
        '--workshop-motion-scale-in': 1 - 0.08 * (motion.intensity ?? 1),
        '--workshop-motion-scale-out': 1 + 0.025 * (motion.intensity ?? 1),
      } : {}),
    } as CSSProperties;
    const common = {
      className: `workshop-lyrics-scene__node workshop-lyrics-scene__node--${node.type}${node.type === 'slot' ? ` workshop-lyrics-scene__slot--${node.slot}` : ''}`,
      'data-motion': motion?.preset ?? undefined,
      'data-motion-loop': motion?.loop === true ? 'true' : undefined,
      'data-node-id': node.id,
      style,
    };
    if (node.type === 'group') {
      return <div key={node.id} {...common}>{node.children.map(renderNode)}</div>;
    }
    if (node.type === 'slot') {
      const content = renderSlot(node);
      return content === null ? null : <div key={node.id} {...common}>{content}</div>;
    }
    if (node.type === 'text') {
      return <div key={node.id} {...common}>{node.text}</div>;
    }
    if (node.type === 'image') {
      if (!isWorkshopAssetProtocolUrl(node.src)) {
        return null;
      }
      return (
        <div key={node.id} {...common} aria-hidden="true">
          <WorkshopProtocolImage className="workshop-lyrics-scene__image" src={node.src} />
        </div>
      );
    }
    return <div key={node.id} {...common} aria-hidden="true" />;
  };

  const background = activeScene.scene.background;
  const showCoverBackground = coverUrl && (background === 'cover' || background === 'cover-blur' || background === 'cover-color');
  const showAssetBackground = background === 'asset' && isWorkshopAssetProtocolUrl(activeScene.scene.backgroundSrc);
  return (
    <div
      ref={ref}
      className="workshop-lyrics-scene"
      role="region"
      data-background={background}
      data-viewport={viewport}
      data-motion-enabled={motionEnabled ? 'true' : 'false'}
      data-enter-settled={enterSettled ? 'true' : 'false'}
      aria-label={`${activeScene.title} Workshop 歌词场景`}
    >
      {showCoverBackground ? <img className="workshop-lyrics-scene__background" alt="" draggable={false} src={coverUrl} /> : null}
      {showAssetBackground ? (
        <WorkshopProtocolImage className="workshop-lyrics-scene__background" src={activeScene.scene.backgroundSrc ?? ''} />
      ) : null}
      <button className="workshop-lyrics-scene__back" type="button" aria-label="Back" onClick={onBack}>
        <ArrowLeft size={17} />
      </button>
      {renderNode(activeScene.scene.root)}
    </div>
  );
};
