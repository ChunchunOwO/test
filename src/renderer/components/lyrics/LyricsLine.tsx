import { memo } from 'react';
import type { CSSProperties } from 'react';
import type { LyricLine as LyricLineType, LyricWordTiming } from '../../../shared/types/lyrics';
import { VerticalText } from './VerticalText';

type LyricsLineProps = {
  line: LyricLineType;
  index: number;
  active: boolean;
  past: boolean;
  onSeek: (timeMs: number) => void;
  seekable?: boolean;
  showRomanization?: boolean;
  preferKanaPronunciation?: boolean;
  showTranslation?: boolean;
  showTimestamp?: boolean;
  wordHighlightEnabled?: boolean;
  estimatedWordTimingEnabled?: boolean;
  lineEndMs?: number | null;
  focusDistance?: number;
  posterFocusWordIndex?: number;
  posterFocusWordState?: 'future' | 'current' | 'passed';
  presentationMode?: 'default' | 'kineticPoster' | 'coverStage' | 'cutBoard';
  textDirection?: 'horizontal' | 'vertical';
};

const formatLyricTimestamp = (timeMs: number): string | null => {
  if (!Number.isFinite(timeMs) || timeMs < 0) {
    return null;
  }

  const totalSeconds = Math.floor(timeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const selectPronunciation = (
  line: LyricLineType,
  preferKanaPronunciation: boolean,
): { text: string | null; kind: 'kana' | 'romanization' | 'none' } => {
  if (preferKanaPronunciation && line.kana?.trim()) {
    return { text: line.kana, kind: 'kana' };
  }

  if (line.romanization?.trim()) {
    return { text: line.romanization, kind: 'romanization' };
  }

  return { text: null, kind: 'none' };
};

const getLyricDensity = (
  line: LyricLineType,
  showRomanization: boolean,
  showTranslation: boolean,
  preferKanaPronunciation: boolean,
): 'short' | 'medium' | 'long' | 'dense' => {
  const textLength = Array.from(line.text.replace(/\s+/g, ' ').trim()).length;
  const pronunciation = selectPronunciation(line, preferKanaPronunciation).text ?? '';
  const secondaryLength = Array.from(
    `${showRomanization ? pronunciation : ''}${showTranslation ? (line.translation ?? '') : ''}`.replace(/\s+/g, ' ').trim(),
  ).length;
  const weightedLength = textLength + Math.round(secondaryLength * 0.45);

  if (weightedLength >= 86) {
    return 'dense';
  }

  if (weightedLength >= 58) {
    return 'long';
  }

  if (weightedLength >= 36) {
    return 'medium';
  }

  return 'short';
};

const maxRawWordHighlightSegments = 480;
const maxRenderableWordHighlightSegments = 160;
const minRenderableWordHighlightSegments = 2;
const minLineTimingSpanMs = 220;
const minVisualWordDurationMs = 72;
const fastVisualWordDurationMs = 150;

const renderableWordsCache = new WeakMap<LyricLineType, readonly LyricWordTiming[] | null>();
const estimatedWordsCache = new WeakMap<LyricLineType, Map<number, readonly LyricWordTiming[] | null>>();

const lyricTextLength = (value: string): number => Array.from(value.replace(/\s+/gu, '')).length;

const hasWhitespace = (value: string): boolean => /\s/u.test(value);

const normalizeTimingText = (value: string): string => value.replace(/\s+/gu, ' ').trim();
const normalizeCompactTimingText = (value: string): string => value.replace(/\s+/gu, '').trim();

const wordsMatchLineText = (line: LyricLineType, words: readonly LyricWordTiming[]): boolean =>
  normalizeTimingText(words.map((word) => word.text).join('')) === normalizeTimingText(line.text) ||
  normalizeCompactTimingText(words.map((word) => word.text).join('')) === normalizeCompactTimingText(line.text);

const preserveLineSpacingInWordTimings = (
  lineText: string,
  words: readonly LyricWordTiming[],
): readonly LyricWordTiming[] => {
  const joinedWordText = words.map((word) => word.text).join('');
  if (normalizeTimingText(joinedWordText) === normalizeTimingText(lineText)) {
    return words;
  }

  if (normalizeCompactTimingText(joinedWordText) !== normalizeCompactTimingText(lineText)) {
    return words;
  }

  const chars = Array.from(lineText.trim());
  let cursor = 0;
  const spacedWords = words.map((word) => {
    const targetLength = lyricTextLength(word.text);
    let text = '';
    let consumedChars = 0;

    while (cursor < chars.length && consumedChars < targetLength) {
      const char = chars[cursor];
      text += char;
      cursor += 1;
      if (!hasWhitespace(char)) {
        consumedChars += 1;
      }
    }

    while (cursor < chars.length && hasWhitespace(chars[cursor])) {
      text += chars[cursor];
      cursor += 1;
    }

    return { ...word, text };
  });

  return wordsMatchLineText({ text: lineText, timeMs: 0 }, spacedWords) ? spacedWords : words;
};

const splitEstimatedHighlightSegments = (value: string): string[] => {
  const segments: string[] = [];
  let latinWord = '';

  const flushLatinWord = (): void => {
    if (latinWord) {
      segments.push(latinWord);
      latinWord = '';
    }
  };

  for (const character of Array.from(value)) {
    if (/\s/u.test(character)) {
      if (latinWord) {
        latinWord += character;
        flushLatinWord();
      } else if (segments.length > 0) {
        segments[segments.length - 1] += character;
      }
      continue;
    }

    if (/[\p{Script=Latin}\p{Number}'’]/u.test(character)) {
      latinWord += character;
      continue;
    }

    flushLatinWord();
    if (/\p{Punctuation}/u.test(character) && segments.length > 0) {
      segments[segments.length - 1] += character;
    } else {
      segments.push(character);
    }
  }

  flushLatinWord();
  return segments.filter((segment) => segment.trim().length > 0);
};

const getEstimatedSegmentWeight = (segment: string): number => {
  const compact = segment.replace(/[\s\p{Punctuation}]+/gu, '');
  const punctuationCount = Array.from(segment.matchAll(/\p{Punctuation}/gu)).length;
  const pauseWeight = Math.min(0.55, punctuationCount * 0.18);
  if (!compact) {
    return 0.4 + pauseWeight;
  }

  if (/^[\p{Script=Latin}]+$/u.test(compact)) {
    const syllableCount = compact.match(/[aeiouyà-öø-ÿ]+/giu)?.length ?? 0;
    const lexicalWeight = Math.max(1, syllableCount * 0.9 + Math.sqrt(Array.from(compact).length) * 0.22);
    return Math.min(5.5, lexicalWeight + pauseWeight);
  }

  if (/^\p{Number}+$/u.test(compact)) {
    return Math.min(3.2, Math.max(1, Array.from(compact).length * 0.62)) + pauseWeight;
  }

  return Math.max(1, Array.from(compact).length) + pauseWeight;
};

const coalesceEstimatedSegments = (segments: readonly string[], maxSegments: number): string[] => {
  if (segments.length <= maxSegments) {
    return [...segments];
  }

  const weights = segments.map(getEstimatedSegmentWeight);
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  const groupCount = Math.max(minRenderableWordHighlightSegments, maxSegments);
  const grouped: string[] = [];
  let text = '';
  let weight = 0;

  for (let index = 0; index < segments.length; index += 1) {
    text += segments[index];
    weight += weights[index];
    const remainingSegments = segments.length - index - 1;
    const remainingGroups = groupCount - grouped.length - 1;
    const targetWeight = totalWeight / groupCount;
    if (grouped.length < groupCount - 1 && remainingSegments >= remainingGroups && weight >= targetWeight) {
      grouped.push(text);
      text = '';
      weight = 0;
    }
  }

  if (text) {
    grouped.push(text);
  }
  return grouped;
};

const getSegmentEndMs = (words: readonly LyricWordTiming[], index: number): number | null => {
  const word = words[index];
  const endMs = word.endMs ?? words[index + 1]?.startMs ?? null;
  return endMs !== null && Number.isFinite(endMs) && endMs > word.startMs ? endMs : null;
};

const coalesceFastTimedWords = (words: readonly LyricWordTiming[]): readonly LyricWordTiming[] => {
  const grouped: LyricWordTiming[] = [];
  let text = '';
  let startMs = 0;
  let endMs: number | null = null;

  words.forEach((word, index) => {
    if (!text) {
      startMs = word.startMs;
    }
    text += word.text;
    endMs = getSegmentEndMs(words, index);

    const nextStartMs = words[index + 1]?.startMs ?? null;
    const hasVisiblePause = endMs !== null && nextStartMs !== null && nextStartMs - endMs >= minVisualWordDurationMs;
    const durationMs = endMs === null ? null : endMs - startMs;
    const shouldFlush =
      index === words.length - 1 ||
      hasVisiblePause ||
      (durationMs !== null && durationMs >= minVisualWordDurationMs);

    if (shouldFlush) {
      grouped.push({ text, startMs, endMs });
      text = '';
      endMs = null;
    }
  });

  return grouped.length >= minRenderableWordHighlightSegments && grouped.length <= maxRenderableWordHighlightSegments
    ? grouped
    : words;
};

const estimateLyricWordTimings = (
  line: LyricLineType,
  lineEndMs: number | null | undefined,
): readonly LyricWordTiming[] | null => {
  if (
    !Number.isFinite(line.timeMs) ||
    line.timeMs < 0 ||
    typeof lineEndMs !== 'number' ||
    !Number.isFinite(lineEndMs) ||
    lineEndMs <= line.timeMs + minLineTimingSpanMs
  ) {
    return null;
  }

  const cacheKey = Math.round(lineEndMs);
  const lineCache = estimatedWordsCache.get(line) ?? new Map<number, readonly LyricWordTiming[] | null>();
  if (!estimatedWordsCache.has(line)) {
    estimatedWordsCache.set(line, lineCache);
  }
  if (lineCache.has(cacheKey)) {
    return lineCache.get(cacheKey) ?? null;
  }

  const rawSegments = splitEstimatedHighlightSegments(line.text);
  if (rawSegments.length < minRenderableWordHighlightSegments || rawSegments.length > maxRawWordHighlightSegments) {
    lineCache.set(cacheKey, null);
    return null;
  }

  const rawWeights = rawSegments.map(getEstimatedSegmentWeight);
  const totalRawWeight = rawWeights.reduce((total, weight) => total + weight, 0);
  const lineWindowMs = cacheKey - line.timeMs;
  const naturalDurationMs = Math.max(900, Math.min(7_000, 650 + totalRawWeight * 340));
  const tailAllowanceMs = Math.min(500, Math.max(0, lineWindowMs - naturalDurationMs) * 0.14);
  const estimatedEndMs = Math.min(cacheKey, line.timeMs + naturalDurationMs + tailAllowanceMs);
  const availableDurationMs = estimatedEndMs - line.timeMs;
  if (availableDurationMs < minLineTimingSpanMs) {
    lineCache.set(cacheKey, null);
    return null;
  }

  const maxSegmentsForPace = Math.max(
    minRenderableWordHighlightSegments,
    Math.min(maxRenderableWordHighlightSegments, Math.floor(availableDurationMs / minVisualWordDurationMs)),
  );
  const segments = coalesceEstimatedSegments(rawSegments, maxSegmentsForPace);
  const weights = segments.map(getEstimatedSegmentWeight);
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  let elapsedWeight = 0;
  const words = segments.map((text, index): LyricWordTiming => {
    const startMs = line.timeMs + Math.round((elapsedWeight / totalWeight) * availableDurationMs);
    elapsedWeight += weights[index];
    const endMs = index === segments.length - 1
      ? estimatedEndMs
      : line.timeMs + Math.round((elapsedWeight / totalWeight) * availableDurationMs);
    return { text, startMs, endMs };
  });

  const result = wordsMatchLineText(line, words) ? words : null;
  lineCache.set(cacheKey, result);
  return result;
};

export const getSourceLyricWords = (line: LyricLineType): readonly LyricWordTiming[] | null => {
  const cached = renderableWordsCache.get(line);
  if (cached !== undefined) {
    return cached;
  }

  const sourceWords = line.words ?? [];
  if (sourceWords.length < minRenderableWordHighlightSegments || sourceWords.length > maxRawWordHighlightSegments) {
    renderableWordsCache.set(line, null);
    return null;
  }

  for (let index = 0; index < sourceWords.length; index += 1) {
    const word = sourceWords[index];
    const previous = sourceWords[index - 1];
    if (!word.text.trim() || !Number.isFinite(word.startMs) || word.startMs < 0) {
      renderableWordsCache.set(line, null);
      return null;
    }
    if (previous && word.startMs <= previous.startMs) {
      renderableWordsCache.set(line, null);
      return null;
    }
    if (word.endMs !== null && (!Number.isFinite(word.endMs) || word.endMs <= word.startMs)) {
      renderableWordsCache.set(line, null);
      return null;
    }
  }

  if (!wordsMatchLineText(line, sourceWords)) {
    renderableWordsCache.set(line, null);
    return null;
  }

  const spacedSourceWords = [...preserveLineSpacingInWordTimings(line.text, sourceWords)];
  const firstStartMs = sourceWords[0].startMs;
  const lastEndMs = getSegmentEndMs(sourceWords, sourceWords.length - 1) ?? sourceWords[sourceWords.length - 1].startMs;
  const lineTimingSpanMs = lastEndMs - firstStartMs;
  if (lineTimingSpanMs < minLineTimingSpanMs) {
    renderableWordsCache.set(line, null);
    return null;
  }

  const renderableWords = coalesceFastTimedWords(spacedSourceWords);
  const result =
    renderableWords.length >= minRenderableWordHighlightSegments &&
    renderableWords.length <= maxRenderableWordHighlightSegments &&
    wordsMatchLineText(line, renderableWords)
      ? renderableWords
      : null;
  renderableWordsCache.set(line, result);
  return result;
};

export const getRenderableLyricWords = (
  line: LyricLineType,
  lineEndMs?: number | null,
): readonly LyricWordTiming[] | null => getSourceLyricWords(line) ?? estimateLyricWordTimings(line, lineEndMs);

const LyricsLineComponent = ({
  active,
  index,
  line,
  onSeek,
  past,
  seekable = false,
  showRomanization = true,
  preferKanaPronunciation = false,
  showTranslation = true,
  showTimestamp = false,
  wordHighlightEnabled = false,
  estimatedWordTimingEnabled = true,
  lineEndMs = null,
  focusDistance = 4,
  posterFocusWordIndex = 0,
  posterFocusWordState = 'future',
  presentationMode = 'default',
  textDirection = 'horizontal',
}: LyricsLineProps): JSX.Element => {
  const density = getLyricDensity(line, showRomanization, showTranslation, preferKanaPronunciation);
  const { text: pronunciation, kind: pronunciationKind } = selectPronunciation(line, preferKanaPronunciation);
  const visibleSecondaryLines =
    (showRomanization && pronunciation ? 1 : 0) +
    (showTranslation && line.translation ? 1 : 0);
  const sourceWords = wordHighlightEnabled && active ? getSourceLyricWords(line) : null;
  const renderableWords = sourceWords ?? (
    wordHighlightEnabled && active && estimatedWordTimingEnabled
      ? getRenderableLyricWords(line, lineEndMs)
      : null
  );
  const hasWordHighlight = Boolean(renderableWords);
  const isVerticalText = textDirection === 'vertical';
  const timestamp = showTimestamp ? formatLyricTimestamp(line.timeMs) : null;
  const getWordVisualDurationMs = (word: LyricWordTiming, wordIndex: number): number => {
    const endMs = word.endMs ?? renderableWords?.[wordIndex + 1]?.startMs ?? lineEndMs;
    return typeof endMs === 'number' && Number.isFinite(endMs) && endMs > word.startMs
      ? endMs - word.startMs
      : 240;
  };
  const renderLyricWord = (
    word: LyricWordTiming,
    wordIndex: number,
    initialState: 'future' | 'current' | 'passed' = 'future',
  ): JSX.Element => {
    const visualDurationMs = getWordVisualDurationMs(word, wordIndex);
    return (
      <mark
        className="lyrics-word"
        data-word-index={wordIndex}
        data-word-pace={visualDurationMs < fastVisualWordDurationMs ? 'fast' : 'normal'}
        data-word-state={initialState}
        key={`${word.startMs}-${wordIndex}-${word.text}`}
        style={{ '--lyrics-word-progress': '0' } as CSSProperties}
      >
        {isVerticalText
          ? <VerticalText className="lyrics-upright-character" text={word.text} />
          : word.text}
      </mark>
    );
  };
  const normalizedPosterFocusWordIndex = renderableWords?.length
    ? Math.max(0, Math.min(renderableWords.length - 1, posterFocusWordIndex))
    : 0;
  const shouldUsePosterWordLayout =
    presentationMode === 'kineticPoster' &&
    active &&
    Boolean(renderableWords?.length) &&
    !isVerticalText;
  const shouldUseCutBoardWordLayout =
    presentationMode === 'cutBoard' &&
    active &&
    Boolean(renderableWords?.length) &&
    !isVerticalText;
  const cutBoardWordPanels = shouldUseCutBoardWordLayout && renderableWords
    ? (() => {
        const indexedWords = renderableWords.map((word, wordIndex) => ({ word, wordIndex }));
        const focusIndex = normalizedPosterFocusWordIndex;
        const averageWordLength = indexedWords.reduce(
          (total, { word }) => total + Math.max(1, Array.from(word.text.trim()).length),
          0,
        ) / indexedWords.length;
        const usesGlyphTimings = averageWordLength <= 1.75;
        const remainingFutureWords = Math.max(0, indexedWords.length - focusIndex - 1);
        const pastNearCount = usesGlyphTimings
          ? Math.min(3, Math.max(1, Math.ceil(focusIndex * 0.35)))
          : 1;
        const futureNearCount = usesGlyphTimings
          ? Math.min(2, Math.max(1, Math.ceil(remainingFutureWords * 0.34)))
          : 1;
        const pastNearStart = Math.max(0, focusIndex - pastNearCount);
        const pastFarStart = Math.max(0, pastNearStart - (usesGlyphTimings ? 6 : 3));
        const futureNearEnd = Math.min(indexedWords.length, focusIndex + 1 + futureNearCount);
        const futureFarEnd = Math.min(indexedWords.length, futureNearEnd + (usesGlyphTimings ? 6 : 3));
        const panels = [
          { role: 'past-edge', state: 'passed', words: indexedWords.slice(0, pastFarStart) },
          { role: 'past-far', state: 'passed', words: indexedWords.slice(pastFarStart, pastNearStart) },
          { role: 'past-near', state: 'passed', words: indexedWords.slice(pastNearStart, focusIndex) },
          { role: 'current', state: posterFocusWordState, words: indexedWords.slice(focusIndex, focusIndex + 1) },
          { role: 'future-near', state: 'future', words: indexedWords.slice(focusIndex + 1, futureNearEnd) },
          { role: 'future-far', state: 'future', words: indexedWords.slice(futureNearEnd, futureFarEnd) },
          { role: 'future-edge', state: 'future', words: indexedWords.slice(futureFarEnd) },
        ] as const;
        return panels.map((panel) => {
          const panelText = panel.words.map(({ word }) => word.text).join('');
          const cjkLength = Array.from(panelText.matchAll(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)).length;
          const latinLength = Array.from(panelText.matchAll(/[\p{Script=Latin}\p{Number}]/gu)).length;
          return { ...panel, script: cjkLength > latinLength ? 'cjk' : 'latin' };
        });
      })()
    : [];

  return (
    <button
      className="lyrics-line"
      data-active={active}
      data-density={density}
      data-focus-distance={Math.min(4, Math.max(0, focusDistance))}
      data-lyric-index={index}
      data-past={past}
      data-seekable={seekable}
      data-secondary-lines={visibleSecondaryLines}
      data-presentation-mode={presentationMode}
      data-word-highlight={hasWordHighlight}
      data-word-timing={hasWordHighlight ? (sourceWords ? 'source' : 'estimated') : undefined}
      type="button"
      onMouseDown={(event) => {
        if (seekable) {
          event.preventDefault();
        }
      }}
      onClick={(event) => {
        if (seekable) {
          event.currentTarget.blur();
          onSeek(line.timeMs);
        }
      }}
    >
      <span className="lyrics-line-text">
        {shouldUsePosterWordLayout && renderableWords ? (
          <span className="lyrics-line-primary lyrics-line-primary--kinetic-poster" aria-label={line.text}>
            <span className="lyrics-kinetic-poster-word-group" data-zone="passed">
              {renderableWords
                .slice(0, normalizedPosterFocusWordIndex)
                .map((word, wordIndex) => renderLyricWord(word, wordIndex, 'passed'))}
            </span>
            <span
              className="lyrics-kinetic-poster-word-focus"
              data-focus-word-state={posterFocusWordState}
            >
              {renderLyricWord(
                renderableWords[normalizedPosterFocusWordIndex],
                normalizedPosterFocusWordIndex,
                posterFocusWordState,
              )}
            </span>
            <span className="lyrics-kinetic-poster-word-group" data-zone="future">
              {renderableWords
                .slice(normalizedPosterFocusWordIndex + 1)
                .map((word, offset) => renderLyricWord(
                  word,
                  normalizedPosterFocusWordIndex + offset + 1,
                ))}
            </span>
          </span>
        ) : shouldUseCutBoardWordLayout && renderableWords ? (
          <span
            className="lyrics-line-primary lyrics-line-primary--cut-board"
            aria-label={line.text}
            style={{ gridTemplateColumns: 'var(--lyrics-cut-board-columns)' }}
          >
            {cutBoardWordPanels.map((panel, panelIndex) => (
              <span
                className="lyrics-cut-board-word-panel"
                data-panel-state={panel.state}
                data-panel-content={panel.words.length > 0 ? 'true' : 'false'}
                data-panel-role={panel.role}
                data-panel-script={panel.script}
                key={panelIndex}
              >
                {panel.words.map(({ word, wordIndex }) => renderLyricWord(
                  word,
                  wordIndex,
                  wordIndex < normalizedPosterFocusWordIndex
                    ? 'passed'
                    : wordIndex === normalizedPosterFocusWordIndex
                      ? posterFocusWordState
                      : 'future',
                ))}
              </span>
            ))}
          </span>
        ) : (
          <span className="lyrics-line-primary" aria-label={isVerticalText ? line.text : undefined}>
            {hasWordHighlight
              ? renderableWords?.map((word, wordIndex) => renderLyricWord(word, wordIndex))
              : isVerticalText
                ? <VerticalText className="lyrics-upright-character" text={line.text} />
                : line.text}
          </span>
        )}
        {showRomanization && pronunciation ? (
          <small data-pronunciation={pronunciationKind} aria-label={isVerticalText ? pronunciation : undefined}>
            {isVerticalText
              ? <VerticalText className="lyrics-upright-character" text={pronunciation} />
              : pronunciation}
          </small>
        ) : null}
        {showTranslation && line.translation ? (
          <em aria-label={isVerticalText ? line.translation : undefined}>
            {isVerticalText
              ? <VerticalText className="lyrics-upright-character" text={line.translation} />
              : line.translation}
          </em>
        ) : null}
      </span>
      {timestamp ? (
        <time className="lyrics-line-time" aria-hidden="true">
          {timestamp}
        </time>
      ) : null}
    </button>
  );
};

export const LyricsLine = memo(LyricsLineComponent);
