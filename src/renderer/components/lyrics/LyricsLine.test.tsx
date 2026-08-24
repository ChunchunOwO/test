// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LyricsLine, getRenderableLyricWords } from './LyricsLine';

afterEach(() => {
  cleanup();
});

describe('LyricsLine', () => {
  const line = { timeMs: 1000, text: 'Sakura', romanization: 'sakura', translation: 'Cherry blossoms' };

  it('shows romanization when enabled', () => {
    render(<LyricsLine active={false} index={0} line={line} past={false} onSeek={vi.fn()} />);

    expect(screen.getByText('sakura')).toBeTruthy();
  });

  it('uses romanization instead of cached kana by default', () => {
    render(
      <LyricsLine
        active={false}
        index={0}
        line={{ ...line, kana: 'さくら' }}
        past={false}
        onSeek={vi.fn()}
      />,
    );

    expect(screen.getByText('sakura')).toBeTruthy();
    expect(screen.queryByText('さくら')).toBeNull();
  });

  it('prefers kana over romanization when requested', () => {
    render(
      <LyricsLine
        active={false}
        index={0}
        line={{ ...line, kana: 'さくら' }}
        past={false}
        preferKanaPronunciation
        onSeek={vi.fn()}
      />,
    );

    expect(screen.getByText('さくら')).toBeTruthy();
    expect(screen.queryByText('sakura')).toBeNull();
  });

  it('hides romanization when disabled', () => {
    render(<LyricsLine active={false} index={0} line={line} past={false} showRomanization={false} onSeek={vi.fn()} />);

    expect(screen.queryByText('sakura')).toBeNull();
    expect(screen.getByText('Sakura')).toBeTruthy();
  });

  it('shows translation when enabled', () => {
    render(<LyricsLine active={false} index={0} line={line} past={false} onSeek={vi.fn()} />);

    expect(screen.getByText('Cherry blossoms')).toBeTruthy();
  });

  it('shows a compact timestamp only when the page style requests it', () => {
    const { container, rerender } = render(
      <LyricsLine active={false} index={0} line={line} past={false} onSeek={vi.fn()} />,
    );

    expect(container.querySelector('.lyrics-line-time')).toBeNull();

    rerender(
      <LyricsLine active={false} index={0} line={line} past={false} showTimestamp onSeek={vi.fn()} />,
    );

    expect(container.querySelector('.lyrics-line-time')?.textContent).toBe('0:01');
  });

  it('hides translation when disabled', () => {
    render(<LyricsLine active={false} index={0} line={line} past={false} showTranslation={false} onSeek={vi.fn()} />);

    expect(screen.queryByText('Cherry blossoms')).toBeNull();
  });

  it('marks how many secondary lyric rows are visible', () => {
    const { container, rerender } = render(<LyricsLine active index={0} line={line} past={false} onSeek={vi.fn()} />);

    expect(container.querySelector('.lyrics-line')?.getAttribute('data-secondary-lines')).toBe('2');

    rerender(<LyricsLine active index={0} line={line} past={false} showTranslation={false} onSeek={vi.fn()} />);

    expect(container.querySelector('.lyrics-line')?.getAttribute('data-secondary-lines')).toBe('1');
  });

  it('renders timed words only when word highlighting is enabled', () => {
    const timedLine = {
      timeMs: 1000,
      text: 'Hello world',
      words: [
        { text: 'Hello ', startMs: 1000, endMs: 1500 },
        { text: 'world', startMs: 1500, endMs: null },
      ],
    };
    const { container, rerender } = render(
      <LyricsLine active index={0} line={timedLine} past={false} onSeek={vi.fn()} wordHighlightEnabled />,
    );

    expect(Array.from(container.querySelectorAll('.lyrics-word')).map((word) => word.textContent)).toEqual([
      'Hello ',
      'world',
    ]);
    expect(container.querySelector('.lyrics-line')?.getAttribute('data-word-highlight')).toBe('true');

    rerender(<LyricsLine active index={0} line={timedLine} past={false} onSeek={vi.fn()} wordHighlightEnabled={false} />);

    expect(container.querySelector('.lyrics-word')).toBeNull();
    expect(screen.getByText('Hello world')).toBeTruthy();
    expect(container.querySelector('.lyrics-line')?.getAttribute('data-word-highlight')).toBe('false');
  });

  it('estimates visible word progress for line-timed lyrics', () => {
    const estimatedLine = {
      timeMs: 1000,
      text: 'どうかこうかして得る Favor',
    };

    const { container } = render(
      <LyricsLine
        active
        index={0}
        line={estimatedLine}
        lineEndMs={5000}
        past={false}
        onSeek={vi.fn()}
        wordHighlightEnabled
      />,
    );

    const words = Array.from(container.querySelectorAll('.lyrics-word'));
    expect(words.length).toBeGreaterThan(2);
    expect(words.map((word) => word.textContent).join('')).toBe(estimatedLine.text);
    expect(container.querySelector('.lyrics-line')?.getAttribute('data-word-timing')).toBe('estimated');
  });

  it('keeps line-timed lyrics as a whole line when estimated word timing is disabled', () => {
    const line = {
      timeMs: 1000,
      text: 'Walk toward the light',
    };

    const { container } = render(
      <LyricsLine
        active
        estimatedWordTimingEnabled={false}
        index={0}
        line={line}
        lineEndMs={5000}
        past={false}
        onSeek={vi.fn()}
        wordHighlightEnabled
      />,
    );

    expect(container.querySelector('.lyrics-word')).toBeNull();
    expect(container.querySelector('.lyrics-line')?.getAttribute('data-word-timing')).toBeNull();
    expect(screen.getByText(line.text)).toBeTruthy();
  });

  it('preserves display spaces when timed words omit English spacing', () => {
    const timedLine = {
      timeMs: 1000,
      text: "You don't want my heart",
      words: [
        { text: 'You', startMs: 1000, endMs: 1200 },
        { text: "don't", startMs: 1200, endMs: 1500 },
        { text: 'want', startMs: 1500, endMs: 1800 },
        { text: 'my', startMs: 1800, endMs: 2000 },
        { text: 'heart', startMs: 2000, endMs: 2400 },
      ],
    };

    const { container } = render(
      <LyricsLine active index={0} line={timedLine} past={false} onSeek={vi.fn()} wordHighlightEnabled />,
    );

    const words = Array.from(container.querySelectorAll('.lyrics-word'));
    expect(words.map((word) => word.textContent).join('')).toBe("You don't want my heart");
    expect(container.querySelector('.lyrics-line')?.getAttribute('data-word-highlight')).toBe('true');
  });

  it('preserves character-level timings as true word highlight segments', () => {
    const text = '世界中のすべて';
    const timedLine = {
      timeMs: 1000,
      text,
      words: Array.from(text).map((char, index) => ({
        text: char,
        startMs: 1000 + index * 180,
        endMs: 1000 + (index + 1) * 180,
      })),
    };

    const { container } = render(
      <LyricsLine active index={0} line={timedLine} past={false} onSeek={vi.fn()} wordHighlightEnabled />,
    );
    const words = Array.from(container.querySelectorAll('.lyrics-word'));

    expect(words).toHaveLength(Array.from(text).length);
    expect(words.map((word) => word.textContent).join('')).toBe(text);
  });

  it('coalesces very fast source timings without discarding their original timing envelope', () => {
    const text = 'abcdefghijkl';
    const fastTimedLine = {
      timeMs: 1000,
      text,
      words: Array.from(text).map((char, index) => ({
        text: char,
        startMs: 1000 + index * 45,
        endMs: 1000 + (index + 1) * 45,
      })),
    };

    const renderableWords = getRenderableLyricWords(fastTimedLine, 1800);

    expect(renderableWords).not.toBeNull();
    expect(renderableWords?.length).toBeLessThan(fastTimedLine.words.length);
    expect(renderableWords?.map((word) => word.text).join('')).toBe(text);
    expect(renderableWords?.[0].startMs).toBe(1000);
    expect(renderableWords?.at(-1)?.endMs).toBe(1540);
  });

  it('uses syllable-aware estimated timing instead of allocating English words by raw letter count', () => {
    const estimatedWords = getRenderableLyricWords({ timeMs: 1000, text: 'I beautiful' }, 4000);

    expect(estimatedWords).toHaveLength(2);
    const shortWordDuration = (estimatedWords?.[0].endMs ?? 0) - (estimatedWords?.[0].startMs ?? 0);
    const longWordDuration = (estimatedWords?.[1].endMs ?? 0) - (estimatedWords?.[1].startMs ?? 0);
    expect(longWordDuration / shortWordDuration).toBeLessThan(4);
  });

  it('marks fast lyric segments for a tighter highlight edge', () => {
    const fastTimedLine = {
      timeMs: 1000,
      text: 'Go now',
      words: [
        { text: 'Go ', startMs: 1000, endMs: 1120 },
        { text: 'now', startMs: 1120, endMs: 1240 },
      ],
    };
    const { container } = render(
      <LyricsLine
        active
        index={0}
        line={fastTimedLine}
        lineEndMs={1300}
        past={false}
        onSeek={vi.fn()}
        wordHighlightEnabled
      />,
    );

    const firstWord = container.querySelector<HTMLElement>('.lyrics-word');
    expect(firstWord?.dataset.wordPace).toBe('fast');
  });

  it('preserves every timing segment in long word-timed lines', () => {
    const tokens = Array.from({ length: 30 }, (_, index) => `word${index + 1}`);
    const timedLine = {
      timeMs: 1000,
      text: tokens.join(' '),
      words: tokens.map((token, index) => ({
        text: index === tokens.length - 1 ? token : `${token} `,
        startMs: 1000 + index * 240,
        endMs: 1000 + (index + 1) * 240,
      })),
    };

    const renderableWords = getRenderableLyricWords(timedLine);

    expect(renderableWords).not.toBeNull();
    expect(renderableWords).toHaveLength(tokens.length);
    expect(renderableWords?.map((word) => word.text).join('')).toBe(timedLine.text);
  });

  it('mounts timed word nodes only for the active line', () => {
    const timedLine = {
      timeMs: 1000,
      text: 'Hello world',
      words: [
        { text: 'Hello ', startMs: 1000, endMs: 1500 },
        { text: 'world', startMs: 1500, endMs: 2000 },
      ],
    };
    const { container } = render(
      <LyricsLine active={false} index={0} line={timedLine} past={false} onSeek={vi.fn()} wordHighlightEnabled />,
    );

    expect(container.querySelector('.lyrics-word')).toBeNull();
    expect(screen.getByText('Hello world')).toBeTruthy();
  });

  it('falls back to plain text when word timings are too jittery', () => {
    const timedLine = {
      timeMs: 1000,
      text: 'abcdef',
      words: Array.from('abcdef').map((char, index) => ({
        text: char,
        startMs: 1000 + index * 30,
        endMs: 1000 + (index + 1) * 30,
      })),
    };

    const { container } = render(
      <LyricsLine active index={0} line={timedLine} past={false} onSeek={vi.fn()} wordHighlightEnabled />,
    );

    expect(container.querySelector('.lyrics-word')).toBeNull();
    expect(screen.getByText('abcdef')).toBeTruthy();
    expect(container.querySelector('.lyrics-line')?.getAttribute('data-word-highlight')).toBe('false');
  });
});
