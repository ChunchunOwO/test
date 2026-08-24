import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { Music2 } from 'lucide-react';
import { LyricsLine, getRenderableLyricWords, getSourceLyricWords } from './LyricsLine';
import type { LyricsState } from './lyricsTypes';
import type { LyricWordTiming } from '../../../shared/types/lyrics';
import { shouldShowRomanizationForLyrics } from '../../../shared/utils/lyricsLanguage';
import { translateFallback, useOptionalI18n } from '../../i18n/I18nProvider';
import { useRenderBudget } from '../../performance/renderBudget';

type LyricScrollMode = 'animated' | 'instant' | 'recenter';
type LyricsTextDirection = 'horizontal' | 'vertical';
const lyricsLayoutSettingKeys = new Set([
  'lyricsFontSizePx',
  'lyricsSecondaryFontSizePx',
  'lyricsFontFamily',
  'lyricsFontFilePath',
  'lyricsTextDirection',
  'lyricsLineSpacingPercent',
  'lyricsLineMaxChars',
  'lyricsRomanizationEnabled',
  'lyricsUtatenKanaEnabled',
  'lyricsTranslationEnabled',
  'lyricsContextOpacityPercent',
]);

type LyricsViewProps = {
  lyrics: LyricsState;
  durationMs?: number | null;
  positionMs: number;
  playbackRate?: number;
  playbackState?: string;
  positionUpdatedAtMs?: number;
  onContextMenu?: (event: MouseEvent<HTMLElement>) => void;
  onSeek: (timeMs: number) => void;
  seekEnabled?: boolean;
  seekTimelineOffsetMs?: number;
  emptyLabel?: string;
  hideEmptyState?: boolean;
  showRomanization?: boolean;
  preferKanaPronunciation?: boolean;
  showTranslation?: boolean;
  showTimestamps?: boolean;
  wordHighlightEnabled?: boolean;
  wordHighlightProgressMode?: 'continuous' | 'discrete';
  estimatedWordTimingEnabled?: boolean;
  highFrequencyUpdatesEnabled?: boolean;
  presentationMode?: 'default' | 'kineticPoster' | 'cutBoard' | 'coverStage';
  textDirection?: LyricsTextDirection;
};

const activeIndexSearchCache = new WeakMap<LyricsState['lines'], boolean>();

const getLyricLineActivationTimeMs = (line: LyricsState['lines'][number]): number => {
  if (line.timeMs < 0) {
    return line.timeMs;
  }

  const words = getSourceLyricWords(line);
  const firstWordStartMs = words?.[0]?.startMs;
  return firstWordStartMs !== undefined
    ? Math.min(line.timeMs, firstWordStartMs)
    : line.timeMs;
};

const canUseBinaryActiveIndexSearch = (lines: LyricsState['lines']): boolean => {
  const cached = activeIndexSearchCache.get(lines);
  if (cached !== undefined) {
    return cached;
  }

  let previousTimeMs = Number.NEGATIVE_INFINITY;
  for (const line of lines) {
    const activationTimeMs = getLyricLineActivationTimeMs(line);
    if (activationTimeMs < 0 || activationTimeMs < previousTimeMs) {
      activeIndexSearchCache.set(lines, false);
      return false;
    }
    previousTimeMs = activationTimeMs;
  }

  activeIndexSearchCache.set(lines, true);
  return true;
};

const getActiveLyricIndexLinear = (lines: LyricsState['lines'], adjustedPositionMs: number): number => {
  let activeIndex = -1;
  let activeTimeMs = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < lines.length; index += 1) {
    const timeMs = getLyricLineActivationTimeMs(lines[index]);
    if (timeMs < 0 || timeMs > adjustedPositionMs || timeMs < activeTimeMs) {
      continue;
    }

    activeIndex = index;
    activeTimeMs = timeMs;
  }

  return activeIndex;
};

export const getActiveLyricIndex = (lines: LyricsState['lines'], positionMs: number, offsetMs: number): number => {
  if (lines.length === 0) {
    return -1;
  }

  const adjustedPositionMs = Math.max(0, positionMs + offsetMs);
  if (!canUseBinaryActiveIndexSearch(lines)) {
    return getActiveLyricIndexLinear(lines, adjustedPositionMs);
  }

  let low = 0;
  let high = lines.length - 1;
  let activeIndex = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const timeMs = getLyricLineActivationTimeMs(lines[mid]);

    if (timeMs < 0 || timeMs <= adjustedPositionMs) {
      if (timeMs >= 0) {
        activeIndex = mid;
      }
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return activeIndex;
};

export const getEstimatedPlainLyricIndex = (
  lines: LyricsState['lines'],
  positionMs: number,
  durationMs?: number | null,
): number => {
  if (lines.length === 0 || !durationMs || durationMs <= 0 || !Number.isFinite(durationMs)) {
    return lines.length > 0 ? 0 : -1;
  }

  const progress = Math.max(0, Math.min(0.999999, positionMs / durationMs));
  return Math.max(0, Math.min(lines.length - 1, Math.floor(progress * lines.length)));
};

export const getScrollFollowStep = (
  currentTop: number,
  targetTop: number,
  elapsedMs: number,
  responseMs: number,
): number => {
  const safeElapsedMs = Math.max(0, Math.min(48, elapsedMs));
  const safeResponseMs = Math.max(48, responseMs);
  const followRatio = 1 - Math.exp(-safeElapsedMs / safeResponseMs);
  return currentTop + (targetTop - currentTop) * followRatio;
};

const getAnimationNow = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const requestLyricAnimationFrame = (callback: FrameRequestCallback): number => {
  if (typeof window.requestAnimationFrame === 'function') {
    return window.requestAnimationFrame(callback);
  }

  return window.setTimeout(() => {
    callback(getAnimationNow());
  }, 16);
};

const cancelLyricAnimationFrame = (frameId: number): void => {
  if (typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(frameId);
    return;
  }

  window.clearTimeout(frameId);
};

const foldedDiscreteWordIntervalMs = 50;

export const getLyricsPlaybackSyncIntervalMs = ({
  frameIntervalMs,
  lyricLineIntervalMs,
  wordHighlightEnabled,
  wordHighlightProgressMode,
}: {
  frameIntervalMs: number | null;
  lyricLineIntervalMs: number | null;
  wordHighlightEnabled: boolean;
  wordHighlightProgressMode: 'continuous' | 'discrete';
}): number | null => {
  if (!wordHighlightEnabled) {
    return lyricLineIntervalMs;
  }

  if (frameIntervalMs === null) {
    return null;
  }

  return wordHighlightProgressMode === 'discrete'
    ? Math.max(frameIntervalMs, foldedDiscreteWordIntervalMs)
    : frameIntervalMs;
};

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const clampPositionMs = (positionMs: number, durationMs?: number | null): number => {
  const safePositionMs = Number.isFinite(positionMs) ? Math.max(0, positionMs) : 0;
  return durationMs && durationMs > 0 && Number.isFinite(durationMs)
    ? Math.min(safePositionMs, durationMs)
    : safePositionMs;
};

const defaultImplicitLastWordDurationMs = 900;
const minImplicitLastWordDurationMs = 420;
const maxImplicitLastWordDurationMs = 1800;

const getKnownWordDurationsMs = (words: readonly LyricWordTiming[], ignoredIndex: number): number[] =>
  words
    .map((word, index) => {
      if (index === ignoredIndex) {
        return null;
      }

      const endMs = word.endMs ?? words[index + 1]?.startMs ?? null;
      return endMs !== null && endMs > word.startMs ? endMs - word.startMs : null;
    })
    .filter((duration): duration is number => duration !== null && Number.isFinite(duration) && duration > 0);

const getEstimatedImplicitWordDurationMs = (
  words: readonly LyricWordTiming[],
  wordIndex: number,
): number => {
  const durations = getKnownWordDurationsMs(words, wordIndex).sort((a, b) => a - b);
  if (durations.length === 0) {
    return defaultImplicitLastWordDurationMs;
  }

  const middle = Math.floor(durations.length / 2);
  const median = durations.length % 2 === 0
    ? (durations[middle - 1] + durations[middle]) / 2
    : durations[middle];
  return Math.round(Math.max(
    minImplicitLastWordDurationMs,
    Math.min(maxImplicitLastWordDurationMs, median * 1.2),
  ));
};

const getWordEndMs = (
  words: readonly LyricWordTiming[],
  wordIndex: number,
  fallbackLineEndMs?: number,
): number => {
  const word = words[wordIndex];
  if (!word) {
    return 0;
  }

  const nextWordStartMs = words[wordIndex + 1]?.startMs;
  const explicitEndMs = word.endMs;
  const boundedExplicitEndMs =
    explicitEndMs !== null && nextWordStartMs !== undefined
      ? Math.min(explicitEndMs, nextWordStartMs)
      : explicitEndMs ?? nextWordStartMs;
  if (boundedExplicitEndMs !== undefined && boundedExplicitEndMs > word.startMs) {
    return boundedExplicitEndMs;
  }

  const implicitEndMs = fallbackLineEndMs && fallbackLineEndMs > word.startMs
    ? fallbackLineEndMs
    : word.startMs + getEstimatedImplicitWordDurationMs(words, wordIndex);
  return Math.min(implicitEndMs, word.startMs + maxImplicitLastWordDurationMs);
};

const getInterpolatedPositionMs = ({
  durationMs,
  playbackRate,
  playbackState,
  positionMs,
  positionUpdatedAtMs,
}: {
  durationMs?: number | null;
  playbackRate: number;
  playbackState: string;
  positionMs: number;
  positionUpdatedAtMs: number;
}): number => {
  if (playbackState !== 'playing') {
    return clampPositionMs(positionMs, durationMs);
  }

  const elapsedMs = Math.max(0, getAnimationNow() - positionUpdatedAtMs);
  return clampPositionMs(positionMs + elapsedMs * playbackRate, durationMs);
};

export type WordPlaybackClock = {
  positionMs: number;
  sampledAtMs: number;
};

const wordClockSnapThresholdMs = 320;
const wordClockBackwardSeekThresholdMs = 120;
const wordClockCorrectionRatio = 0.2;
export const stabilizeWordPlaybackPosition = ({
  previous,
  rawPositionMs,
  sampledAtMs,
  playbackRate,
  smoothingEnabled,
}: {
  previous: WordPlaybackClock | null;
  rawPositionMs: number;
  sampledAtMs: number;
  playbackRate: number;
  smoothingEnabled: boolean;
}): WordPlaybackClock => {
  if (!previous || !smoothingEnabled) {
    return { positionMs: rawPositionMs, sampledAtMs };
  }

  const elapsedMs = Math.max(0, sampledAtMs - previous.sampledAtMs);
  const expectedPositionMs = previous.positionMs + elapsedMs * Math.max(0, playbackRate);
  const correctionMs = rawPositionMs - expectedPositionMs;
  const isSeek =
    Math.abs(correctionMs) >= wordClockSnapThresholdMs ||
    rawPositionMs < previous.positionMs - wordClockBackwardSeekThresholdMs;
  if (isSeek) {
    return { positionMs: rawPositionMs, sampledAtMs };
  }

  const correctedPositionMs = expectedPositionMs + correctionMs * wordClockCorrectionRatio;
  return {
    positionMs: playbackRate >= 0
      ? Math.max(previous.positionMs, correctedPositionMs)
      : correctedPositionMs,
    sampledAtMs,
  };
};

export const getLinePlaybackPositionMs = (
  words: readonly LyricWordTiming[],
  nextLine: LyricsState['lines'][number] | undefined,
  adjustedPositionMs: number,
): number => {
  if (!words.length) {
    return adjustedPositionMs;
  }

  const naturalEndMs = getWordEndMs(words, words.length - 1, nextLine?.timeMs);

  return Math.min(adjustedPositionMs, naturalEndMs);
};

export type WordPlaybackState = {
  completedCount: number;
  currentIndex: number;
};

export const getWordPlaybackState = (
  words: readonly LyricWordTiming[],
  adjustedPositionMs: number,
  fallbackLineEndMs?: number,
): WordPlaybackState => {
  if (words.length === 0 || adjustedPositionMs < words[0].startMs) {
    return { completedCount: 0, currentIndex: -1 };
  }

  let low = 0;
  let high = words.length - 1;
  let candidateIndex = 0;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (words[mid].startMs <= adjustedPositionMs) {
      candidateIndex = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const candidateEndMs = getWordEndMs(words, candidateIndex, fallbackLineEndMs);
  return adjustedPositionMs < candidateEndMs
    ? { completedCount: candidateIndex, currentIndex: candidateIndex }
    : { completedCount: candidateIndex + 1, currentIndex: -1 };
};

export const getWordProgress = (
  words: readonly LyricWordTiming[],
  wordIndex: number,
  adjustedPositionMs: number,
  fallbackLineEndMs?: number,
): number => {
  const word = words[wordIndex];
  if (!word) {
    return 0;
  }

  const endMs = getWordEndMs(words, wordIndex, fallbackLineEndMs);
  if (endMs <= word.startMs) {
    return adjustedPositionMs >= word.startMs ? 1 : 0;
  }

  return Math.max(0, Math.min(1, (adjustedPositionMs - word.startMs) / (endMs - word.startMs)));
};

const calculateActiveIndex = (
  lines: LyricsState['lines'],
  positionMs: number,
  offsetMs: number,
  durationMs: number | null | undefined,
  isSynced: boolean,
  isPlain: boolean,
): number =>
  isSynced
    ? getActiveLyricIndex(lines, positionMs, offsetMs)
    : isPlain
      ? getEstimatedPlainLyricIndex(lines, positionMs, durationMs)
      : -1;

const getActiveLineLayoutCenter = (
  scrollContainer: HTMLElement,
  activeLine: HTMLButtonElement,
): number => {
  if (activeLine.offsetHeight > 0) {
    return activeLine.offsetTop + activeLine.offsetHeight / 2;
  }

  const containerRect = scrollContainer.getBoundingClientRect();
  const activeRect = activeLine.getBoundingClientRect();
  return activeRect.top - containerRect.top + scrollContainer.scrollTop + activeRect.height / 2;
};

type ActiveWordElementCache = {
  activeLine: HTMLButtonElement;
  line: LyricsState['lines'][number];
  lineIndex: number;
  words: readonly LyricWordTiming[];
  wordElements: HTMLElement[];
};

type ScrollFollowTarget = {
  container: HTMLElement;
  responseMs: number;
  targetTop: number;
};

type PosterFocusWord = {
  index: number;
  state: 'future' | 'current' | 'passed';
};

export const LyricsView = ({
  durationMs,
  emptyLabel,
  hideEmptyState = false,
  lyrics,
  onContextMenu,
  onSeek,
  playbackRate = 1,
  playbackState = 'idle',
  positionMs,
  positionUpdatedAtMs = getAnimationNow(),
  seekEnabled = false,
  seekTimelineOffsetMs = 0,
  showRomanization = true,
  preferKanaPronunciation = false,
  showTranslation = true,
  showTimestamps = false,
  wordHighlightEnabled = false,
  wordHighlightProgressMode = 'continuous',
  estimatedWordTimingEnabled = true,
  highFrequencyUpdatesEnabled = true,
  presentationMode = 'default',
  textDirection = 'horizontal',
}: LyricsViewProps): JSX.Element | null => {
  const t = useOptionalI18n()?.t ?? translateFallback;
  const scrollRef = useRef<HTMLElement | null>(null);
  const scrollAnimationFrameRef = useRef<number | null>(null);
  const scrollAnimationVersionRef = useRef(0);
  const scrollFollowTargetRef = useRef<ScrollFollowTarget | null>(null);
  const scrollFollowLastFrameAtRef = useRef<number | null>(null);
  const activeCenterFrameRef = useRef<number | null>(null);
  const layoutPreserveFrameRef = useRef<number | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const wordSyncTimerRef = useRef<number | null>(null);
  const wordPlaybackClockRef = useRef<WordPlaybackClock | null>(null);
  const syncPlaybackPositionRef = useRef<() => void>(() => undefined);
  const activeIndexRef = useRef(-1);
  const wordElementCacheRef = useRef<ActiveWordElementCache | null>(null);
  const wordProgressRef = useRef<{
    completedCount: number;
    currentIndex: number;
    line: LyricsState['lines'][number];
    lineIndex: number;
    progressValue: string | null;
    words: readonly LyricWordTiming[];
  } | null>(null);
  const isSynced = lyrics.kind === 'synced';
  const isPlain = lyrics.kind === 'plain';
  const effectiveWordHighlightEnabled = wordHighlightEnabled && isSynced;
  const reducedMotion = prefersReducedMotion();
  const renderBudget = useRenderBudget();
  const canShowRomanization = showRomanization && shouldShowRomanizationForLyrics(lyrics.lines);
  const [activeIndex, setActiveIndex] = useState(() =>
    calculateActiveIndex(
      lyrics.lines,
      positionMs,
      lyrics.offsetMs,
      durationMs,
      isSynced,
      isPlain,
    ),
  );
  const lastCenteredActiveIndexRef = useRef(activeIndex);
  const hasCenteredActiveLyricRef = useRef(false);
  const lastLyricsLinesRef = useRef(lyrics.lines);
  const [centerRevision, setCenterRevision] = useState(0);
  const [posterFocusWord, setPosterFocusWord] = useState<PosterFocusWord>({
    index: 0,
    state: 'future',
  });
  const coverStagePreviewLineIndex = presentationMode === 'coverStage' && isSynced && activeIndex < 0
    ? lyrics.lines.findIndex((line) => getLyricLineActivationTimeMs(line) >= 0)
    : -1;
  activeIndexRef.current = activeIndex;

  const stopScrollAnimation = useCallback((): void => {
    scrollAnimationVersionRef.current += 1;
    if (scrollAnimationFrameRef.current !== null) {
      cancelLyricAnimationFrame(scrollAnimationFrameRef.current);
      scrollAnimationFrameRef.current = null;
    }
    scrollFollowTargetRef.current = null;
    scrollFollowLastFrameAtRef.current = null;
  }, []);

  const stopWordAnimation = useCallback((): void => {
    if (wordSyncTimerRef.current !== null) {
      window.clearTimeout(wordSyncTimerRef.current);
      wordSyncTimerRef.current = null;
    }
  }, []);

  const resetWordHighlightCache = useCallback((): void => {
    wordElementCacheRef.current = null;
    wordProgressRef.current = null;
  }, []);

  const getStableWordPlaybackPosition = useCallback((rawPositionMs: number): number => {
    const sampledAtMs = getAnimationNow();
    const nextClock = stabilizeWordPlaybackPosition({
      previous: wordPlaybackClockRef.current,
      rawPositionMs,
      sampledAtMs,
      playbackRate,
      smoothingEnabled: highFrequencyUpdatesEnabled && playbackState === 'playing' && !reducedMotion,
    });
    wordPlaybackClockRef.current = nextClock;
    return nextClock.positionMs;
  }, [highFrequencyUpdatesEnabled, playbackRate, playbackState, reducedMotion]);

  const getActiveWordElements = useCallback((
    scrollContainer: HTMLElement,
    line: LyricsState['lines'][number],
    lineIndex: number,
    words: readonly LyricWordTiming[],
  ): HTMLElement[] | null => {
    const cached = wordElementCacheRef.current;
    const firstCachedWord = cached?.wordElements[0];
    const lastCachedWord = cached?.wordElements[cached.wordElements.length - 1];
    if (
      cached &&
      cached.line === line &&
      cached.lineIndex === lineIndex &&
      cached.words === words &&
      cached.wordElements.length === words.length &&
      cached.activeLine.isConnected &&
      cached.activeLine.dataset.active === 'true' &&
      firstCachedWord &&
      lastCachedWord &&
      cached.activeLine.contains(firstCachedWord) &&
      cached.activeLine.contains(lastCachedWord)
    ) {
      return cached.wordElements;
    }

    const activeLine = scrollContainer.querySelector<HTMLButtonElement>('.lyrics-line[data-active="true"]');
    if (!activeLine) {
      wordElementCacheRef.current = null;
      return null;
    }

    const wordElements = Array.from(activeLine.querySelectorAll<HTMLElement>('.lyrics-word'));
    if (wordElements.length !== words.length) {
      wordElementCacheRef.current = null;
      return null;
    }

    wordElementCacheRef.current = { activeLine, line, lineIndex, words, wordElements };
    return wordElements;
  }, []);

  const syncActiveWordHighlight = useCallback((currentPositionMs: number): void => {
    if (!effectiveWordHighlightEnabled) {
      return;
    }

    const scrollContainer = scrollRef.current;
    const currentIndex = activeIndexRef.current;
    const line = lyrics.lines[currentIndex];
    const nextLine = lyrics.lines[currentIndex + 1];
    const nextLineStartMs = nextLine ? getLyricLineActivationTimeMs(nextLine) : undefined;
    const estimatedLineEndMs = nextLineStartMs ?? durationMs;
    const words = line && isSynced
      ? estimatedWordTimingEnabled
        ? getRenderableLyricWords(line, estimatedLineEndMs)
        : getSourceLyricWords(line)
      : null;
    if (!scrollContainer || !line || !words) {
      resetWordHighlightCache();
      return;
    }

    const wordElements = getActiveWordElements(scrollContainer, line, currentIndex, words);
    if (!wordElements) {
      wordProgressRef.current = null;
      return;
    }

    const adjustedPositionMs = getLinePlaybackPositionMs(
      words,
      nextLine,
      currentPositionMs + lyrics.offsetMs,
    );
    const { completedCount, currentIndex: currentWordIndex } = getWordPlaybackState(
      words,
      adjustedPositionMs,
      nextLineStartMs,
    );
    if (presentationMode === 'kineticPoster' || presentationMode === 'cutBoard') {
      const nextPosterFocus: PosterFocusWord = currentWordIndex >= 0
        ? { index: currentWordIndex, state: 'current' }
        : completedCount >= words.length
          ? { index: Math.max(0, words.length - 1), state: 'passed' }
          : { index: Math.max(0, completedCount), state: 'future' };
      setPosterFocusWord((current) =>
        current.index === nextPosterFocus.index && current.state === nextPosterFocus.state
          ? current
          : nextPosterFocus,
      );
    }
    const previous = wordProgressRef.current;
    const changedWord =
      !previous ||
      previous.line !== line ||
      previous.lineIndex !== currentIndex ||
      previous.words !== words ||
      previous.currentIndex !== currentWordIndex ||
      previous.completedCount !== completedCount;

    if (changedWord) {
      wordElements.forEach((element, index) => {
        const state = index < completedCount
          ? 'passed'
          : index === currentWordIndex
              ? 'current'
              : 'future';
        element.dataset.wordState = state;
        const progress = state === 'passed' || (state === 'current' && wordHighlightProgressMode === 'discrete')
          ? '1'
          : '0';
        element.style.setProperty('--lyrics-word-progress', progress);
      });
      wordProgressRef.current = {
        completedCount,
        currentIndex: currentWordIndex,
        line,
        lineIndex: currentIndex,
        progressValue: null,
        words,
      };
    }

    if (currentWordIndex >= 0 && wordHighlightProgressMode === 'continuous') {
      const currentWord = wordElements[currentWordIndex];
      const progressValue = reducedMotion
        ? '1'
        : getWordProgress(words, currentWordIndex, adjustedPositionMs, nextLineStartMs).toFixed(4);
      if (wordProgressRef.current?.progressValue !== progressValue) {
        currentWord?.style.setProperty('--lyrics-word-progress', progressValue);
        wordProgressRef.current = {
          completedCount,
          currentIndex: currentWordIndex,
          line,
          lineIndex: currentIndex,
          progressValue,
          words,
        };
      }
    }
  }, [
    getActiveWordElements,
    durationMs,
    estimatedWordTimingEnabled,
    isSynced,
    lyrics.lines,
    lyrics.offsetMs,
    reducedMotion,
    resetWordHighlightCache,
    effectiveWordHighlightEnabled,
    wordHighlightProgressMode,
    presentationMode,
  ]);

  const syncPlaybackPosition = useCallback((): void => {
    const currentPositionMs = getInterpolatedPositionMs({
      durationMs,
      playbackRate,
      playbackState,
      positionMs,
      positionUpdatedAtMs,
    });
    const nextActiveIndex = calculateActiveIndex(
      lyrics.lines,
      currentPositionMs,
      lyrics.offsetMs,
      durationMs,
      isSynced,
      isPlain,
    );

    if (activeIndexRef.current !== nextActiveIndex) {
      activeIndexRef.current = nextActiveIndex;
      wordPlaybackClockRef.current = effectiveWordHighlightEnabled
        ? {
            positionMs: currentPositionMs,
            sampledAtMs: getAnimationNow(),
          }
        : null;
      resetWordHighlightCache();
      if (presentationMode === 'kineticPoster' || presentationMode === 'cutBoard') {
        setPosterFocusWord({ index: 0, state: 'future' });
      }
      setActiveIndex(nextActiveIndex);
    } else if (effectiveWordHighlightEnabled) {
      syncActiveWordHighlight(getStableWordPlaybackPosition(currentPositionMs));
    }
  }, [
    durationMs,
    isPlain,
    isSynced,
    lyrics.lines,
    lyrics.offsetMs,
    playbackRate,
    playbackState,
    positionMs,
    positionUpdatedAtMs,
    getStableWordPlaybackPosition,
    resetWordHighlightCache,
    syncActiveWordHighlight,
    effectiveWordHighlightEnabled,
    presentationMode,
  ]);

  const animateScrollTop = useCallback(
    (scrollContainer: HTMLElement, targetTop: number, durationMs: number): void => {
      const distance = targetTop - scrollContainer.scrollTop;
      if (Math.abs(distance) < 1 || durationMs <= 0 || prefersReducedMotion()) {
        stopScrollAnimation();
        scrollContainer.scrollTop = targetTop;
        return;
      }

      const existingTarget = scrollFollowTargetRef.current;
      if (existingTarget && existingTarget.container !== scrollContainer) {
        stopScrollAnimation();
      }
      scrollFollowTargetRef.current = {
        container: scrollContainer,
        responseMs: Math.max(64, durationMs / 4),
        targetTop,
      };
      if (scrollAnimationFrameRef.current !== null) {
        return;
      }

      const animationVersion = scrollAnimationVersionRef.current;
      scrollFollowLastFrameAtRef.current = getAnimationNow();
      const tick = (now: number): void => {
        const followTarget = scrollFollowTargetRef.current;
        if (
          animationVersion !== scrollAnimationVersionRef.current ||
          scrollRef.current !== scrollContainer ||
          !followTarget ||
          followTarget.container !== scrollContainer
        ) {
          return;
        }

        const previousFrameAt = scrollFollowLastFrameAtRef.current ?? now - 16;
        scrollFollowLastFrameAtRef.current = now;
        const remainingDistance = followTarget.targetTop - scrollContainer.scrollTop;
        if (Math.abs(remainingDistance) < 0.5) {
          scrollContainer.scrollTop = followTarget.targetTop;
          scrollAnimationFrameRef.current = null;
          scrollFollowTargetRef.current = null;
          scrollFollowLastFrameAtRef.current = null;
          return;
        }

        scrollContainer.scrollTop = getScrollFollowStep(
          scrollContainer.scrollTop,
          followTarget.targetTop,
          now - previousFrameAt,
          followTarget.responseMs,
        );
        scrollAnimationFrameRef.current = requestLyricAnimationFrame(tick);
      };

      scrollAnimationFrameRef.current = requestLyricAnimationFrame(tick);
    },
    [stopScrollAnimation],
  );

  const centerActiveLyric = useCallback((mode: LyricScrollMode = 'animated'): boolean => {
    if (activeIndex < 0) {
      return false;
    }

    const scrollContainer = scrollRef.current;
    const activeLine = scrollContainer?.querySelector<HTMLButtonElement>('.lyrics-line[data-active="true"]');
    if (!scrollContainer || !activeLine) {
      return false;
    }

    const activeCenter = getActiveLineLayoutCenter(scrollContainer, activeLine);
    const lyricsPage = scrollContainer.closest('.lyrics-page') as HTMLElement | null;
    const targetCenterRatio = lyricsPage?.dataset.lyricsPageStyle === 'editorial' ? 0.46 : 0.52;
    const targetCenter = scrollContainer.clientHeight * targetCenterRatio;
    const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
    const nextScrollTop = Math.max(0, Math.min(maxScrollTop, activeCenter - targetCenter));

    if (mode === 'instant') {
      stopScrollAnimation();
      scrollContainer.scrollTop = nextScrollTop;
      return true;
    }

    const durationMs = presentationMode === 'coverStage'
      ? mode === 'recenter' ? 160 : 260
      : mode === 'recenter' ? 320 : 720;
    animateScrollTop(scrollContainer, nextScrollTop, durationMs);
    return true;
  }, [activeIndex, animateScrollTop, presentationMode, stopScrollAnimation]);

  const preserveActiveLyricPosition = useCallback((event: Event): void => {
    if (event.type === 'settings:changed' && event instanceof CustomEvent) {
      return;
    }

    if (event instanceof CustomEvent && event.detail && typeof event.detail === 'object' && !Array.isArray(event.detail)) {
      const hasLayoutSetting = Object.keys(event.detail as Record<string, unknown>).some((key) => lyricsLayoutSettingKeys.has(key));
      if (!hasLayoutSetting) {
        return;
      }
    }

    const scrollContainer = scrollRef.current;
    const activeLine = scrollContainer?.querySelector<HTMLButtonElement>('.lyrics-line[data-active="true"]');
    if (!scrollContainer || !activeLine) {
      return;
    }

    const previousTop = activeLine.getBoundingClientRect().top;
    stopScrollAnimation();
    if (activeCenterFrameRef.current !== null) {
      cancelLyricAnimationFrame(activeCenterFrameRef.current);
      activeCenterFrameRef.current = null;
    }
    if (layoutPreserveFrameRef.current !== null) {
      cancelLyricAnimationFrame(layoutPreserveFrameRef.current);
    }

    layoutPreserveFrameRef.current = requestLyricAnimationFrame(() => {
      layoutPreserveFrameRef.current = null;
      const nextActiveLine = scrollContainer.querySelector<HTMLButtonElement>('.lyrics-line[data-active="true"]');
      if (!nextActiveLine) {
        return;
      }

      const deltaTop = nextActiveLine.getBoundingClientRect().top - previousTop;
      if (Math.abs(deltaTop) > 0.5) {
        scrollContainer.scrollTop += deltaTop;
      }
    });
  }, [stopScrollAnimation]);

  useEffect(() => {
    stopWordAnimation();

    if (!highFrequencyUpdatesEnabled || playbackState !== 'playing' || reducedMotion || renderBudget.targetFps === 0) {
      return undefined;
    }

    const syncIntervalMs = getLyricsPlaybackSyncIntervalMs({
      frameIntervalMs: renderBudget.frameIntervalMs,
      lyricLineIntervalMs: renderBudget.lyricLineIntervalMs,
      wordHighlightEnabled: effectiveWordHighlightEnabled,
      wordHighlightProgressMode,
    });
    if (syncIntervalMs === null) {
      return undefined;
    }

    const tick = (): void => {
      syncPlaybackPositionRef.current();
      wordSyncTimerRef.current = window.setTimeout(tick, syncIntervalMs);
    };
    syncPlaybackPositionRef.current();
    wordSyncTimerRef.current = window.setTimeout(tick, syncIntervalMs);
    return () => {
      stopWordAnimation();
    };
  }, [
    highFrequencyUpdatesEnabled,
    playbackState,
    reducedMotion,
    renderBudget.frameIntervalMs,
    renderBudget.lyricLineIntervalMs,
    renderBudget.targetFps,
    stopWordAnimation,
    effectiveWordHighlightEnabled,
    wordHighlightProgressMode,
  ]);

  useLayoutEffect(() => {
    syncPlaybackPositionRef.current = syncPlaybackPosition;
    syncPlaybackPosition();
  }, [activeIndex, syncPlaybackPosition]);

  useLayoutEffect(() => {
    if (lastLyricsLinesRef.current === lyrics.lines) {
      return;
    }

    lastLyricsLinesRef.current = lyrics.lines;
    hasCenteredActiveLyricRef.current = false;
    stopScrollAnimation();
    resetWordHighlightCache();
    setCenterRevision((revision) => revision + 1);
  }, [lyrics.lines, resetWordHighlightCache, stopScrollAnimation]);

  useEffect(() => {
    if (activeCenterFrameRef.current !== null) {
      cancelLyricAnimationFrame(activeCenterFrameRef.current);
      activeCenterFrameRef.current = null;
    }

    if (activeIndex < 0) {
      hasCenteredActiveLyricRef.current = false;
      lastCenteredActiveIndexRef.current = activeIndex;
      return undefined;
    }

    const previousCenteredActiveIndex = lastCenteredActiveIndexRef.current;
    const shouldJumpToSeekTarget =
      hasCenteredActiveLyricRef.current &&
      previousCenteredActiveIndex >= 0 &&
      activeIndex >= 0 &&
      (activeIndex < previousCenteredActiveIndex || Math.abs(activeIndex - previousCenteredActiveIndex) > 1);
    const scrollMode: LyricScrollMode =
      !hasCenteredActiveLyricRef.current || shouldJumpToSeekTarget ? 'instant' : 'animated';

    activeCenterFrameRef.current = requestLyricAnimationFrame(() => {
      activeCenterFrameRef.current = null;
      if (centerActiveLyric(scrollMode)) {
        hasCenteredActiveLyricRef.current = true;
        lastCenteredActiveIndexRef.current = activeIndex;
      }
    });

    return () => {
      if (activeCenterFrameRef.current !== null) {
        cancelLyricAnimationFrame(activeCenterFrameRef.current);
        activeCenterFrameRef.current = null;
      }
    };
  }, [activeIndex, centerActiveLyric, centerRevision]);

  useEffect(() => {
    window.addEventListener('settings:changed', preserveActiveLyricPosition);
    window.addEventListener('lyrics:display-settings-changed', preserveActiveLyricPosition);
    return () => {
      window.removeEventListener('settings:changed', preserveActiveLyricPosition);
      window.removeEventListener('lyrics:display-settings-changed', preserveActiveLyricPosition);
      if (layoutPreserveFrameRef.current !== null) {
        cancelLyricAnimationFrame(layoutPreserveFrameRef.current);
        layoutPreserveFrameRef.current = null;
      }
    };
  }, [preserveActiveLyricPosition]);

  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer || activeIndex < 0) {
      return undefined;
    }

    const scheduleRecenter = (): void => {
      if (resizeFrameRef.current !== null) {
        cancelLyricAnimationFrame(resizeFrameRef.current);
      }

      resizeFrameRef.current = requestLyricAnimationFrame(() => {
        resizeFrameRef.current = null;
        centerActiveLyric('recenter');
      });
    };

    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(scheduleRecenter)
        : null;
    observer?.observe(scrollContainer);
    window.addEventListener('resize', scheduleRecenter);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', scheduleRecenter);
      if (resizeFrameRef.current !== null) {
        cancelLyricAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, [activeIndex, centerActiveLyric]);

  useEffect(
    () => () => {
      stopScrollAnimation();
      stopWordAnimation();
      if (activeCenterFrameRef.current !== null) {
        cancelLyricAnimationFrame(activeCenterFrameRef.current);
        activeCenterFrameRef.current = null;
      }
      if (resizeFrameRef.current !== null) {
        cancelLyricAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      if (layoutPreserveFrameRef.current !== null) {
        cancelLyricAnimationFrame(layoutPreserveFrameRef.current);
        layoutPreserveFrameRef.current = null;
      }
    },
    [stopScrollAnimation, stopWordAnimation],
  );

  if (lyrics.lines.length === 0) {
    if (hideEmptyState) {
      return null;
    }

    return (
      <section className="lyrics-empty" aria-label="Lyrics">
        <Music2 size={26} />
        <strong>{emptyLabel ?? (lyrics.kind === 'instrumental' ? t('lyricsView.empty.instrumental') : t('lyricsView.empty.noLyrics'))}</strong>
        {lyrics.kind === 'instrumental' ? <span>Instrumental track</span> : null}
      </section>
    );
  }

  return (
    <section
      className="lyrics-scroll"
      aria-label="Lyrics"
      data-kind={lyrics.kind}
      data-render-budget={renderBudget.mode}
      data-presentation-mode={presentationMode}
      data-text-direction={textDirection}
      ref={scrollRef}
      onContextMenu={onContextMenu}
    >
      {lyrics.lines.map((line, index) => {
        const seekTargetMs = line.timeMs - seekTimelineOffsetMs;
        const focusDistance = activeIndex >= 0
          ? Math.min(4, Math.abs(index - activeIndex))
          : coverStagePreviewLineIndex >= 0 && index >= coverStagePreviewLineIndex
            ? Math.min(4, index - coverStagePreviewLineIndex + 1)
            : 4;
        const seekable =
          seekEnabled &&
          isSynced &&
          Number.isFinite(line.timeMs) &&
          line.timeMs >= 0 &&
          Number.isFinite(seekTargetMs) &&
          typeof durationMs === 'number' &&
          Number.isFinite(durationMs) &&
          durationMs > 0 &&
          Math.max(0, seekTargetMs) < durationMs;

        return (
          <LyricsLine
            active={index === activeIndex}
            index={index}
            focusDistance={focusDistance}
            key={`${line.timeMs}-${index}`}
            line={line}
            lineEndMs={isSynced
              ? (lyrics.lines[index + 1]
                  ? getLyricLineActivationTimeMs(lyrics.lines[index + 1])
                  : durationMs)
              : null}
            past={activeIndex >= 0 && index < activeIndex}
            posterFocusWordIndex={posterFocusWord.index}
            posterFocusWordState={posterFocusWord.state}
            presentationMode={presentationMode}
            showRomanization={canShowRomanization}
            preferKanaPronunciation={preferKanaPronunciation}
            showTranslation={showTranslation}
            showTimestamp={showTimestamps}
            textDirection={textDirection}
            wordHighlightEnabled={effectiveWordHighlightEnabled}
            estimatedWordTimingEnabled={estimatedWordTimingEnabled}
            onSeek={onSeek}
            seekable={seekable}
          />
        );
      })}
    </section>
  );
};
