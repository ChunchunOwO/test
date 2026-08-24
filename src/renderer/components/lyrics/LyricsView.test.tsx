// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import {
  LyricsView,
  getActiveLyricIndex,
  getLyricsPlaybackSyncIntervalMs,
  getScrollFollowStep,
  getWordPlaybackState,
  stabilizeWordPlaybackPosition,
} from './LyricsView';
import type { LyricsState } from './lyricsTypes';

const makeRect = (top: number, height: number): DOMRect => ({
  bottom: top + height,
  height,
  left: 0,
  right: 320,
  top,
  width: 320,
  x: 0,
  y: top,
  toJSON: () => ({}),
});

const setLayoutNumber = (element: HTMLElement, property: 'clientHeight' | 'scrollHeight' | 'offsetHeight' | 'offsetTop', value: number): void => {
  Object.defineProperty(element, property, { configurable: true, value });
};

const lyrics: LyricsState = {
  kind: 'synced',
  source: 'placeholder',
  offsetMs: 0,
  lines: [
    { timeMs: 0, text: 'First line' },
    { timeMs: 1000, text: 'Second line' },
    { timeMs: 2000, text: 'Third line' },
  ],
};

const wordLyrics: LyricsState = {
  kind: 'synced',
  source: 'placeholder',
  offsetMs: 0,
  lines: [
    {
      timeMs: 1000,
      text: 'Hello world',
      words: [
        { text: 'Hello ', startMs: 1000, endMs: 1500 },
        { text: 'world', startMs: 1500, endMs: 2000 },
      ],
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('LyricsView', () => {
  it('only enables bounded timestamps for explicitly seekable synced lyrics', () => {
    const onSeek = vi.fn();
    const { container } = render(
      <LyricsView
        durationMs={1500}
        hideEmptyState={false}
        lyrics={{
          ...lyrics,
          lines: [
            { timeMs: -1, text: 'Untimed' },
            { timeMs: 1000, text: 'Valid' },
            { timeMs: 2000, text: 'Past duration' },
          ],
        }}
        positionMs={0}
        seekEnabled
        onSeek={onSeek}
      />,
    );
    const lineButtons = Array.from(container.querySelectorAll<HTMLButtonElement>('.lyrics-line'));

    expect(lineButtons.map((line) => line.dataset.seekable)).toEqual(['false', 'true', 'false']);
    fireEvent.click(lineButtons[0]);
    fireEvent.click(lineButtons[1]);
    fireEvent.click(lineButtons[2]);
    expect(onSeek).toHaveBeenCalledOnce();
    expect(onSeek).toHaveBeenCalledWith(1000);
  });

  it('keeps active line lookup stable when synced lines include untimed rows', () => {
    expect(getActiveLyricIndex([
      { timeMs: 1000, text: 'First' },
      { timeMs: -1, text: 'Untimed note' },
      { timeMs: 2000, text: 'Second' },
    ], 1500, 0)).toBe(0);
  });

  it('finds the latest eligible line when synced line timestamps are out of order', () => {
    expect(getActiveLyricIndex([
      { timeMs: 1400, text: 'Future line' },
      { timeMs: 1200, text: 'Current line' },
      { timeMs: 1800, text: 'Later line' },
    ], 1250, 0)).toBe(1);
  });

  it('activates the next line when its precise first-word timing starts before its coarse line timestamp', () => {
    expect(getActiveLyricIndex([
      {
        timeMs: 1000,
        text: 'Previous line',
        words: [
          { text: 'Previous ', startMs: 1000, endMs: 1600 },
          { text: 'line', startMs: 1600, endMs: 2400 },
        ],
      },
      {
        timeMs: 2500,
        text: 'Next line',
        words: [
          { text: 'Next ', startMs: 2200, endMs: 2500 },
          { text: 'line', startMs: 2500, endMs: 2900 },
        ],
      },
    ], 2250, 0)).toBe(1);
  });

  it('locates dense word timing state without treating a deliberate gap as an active word', () => {
    const words = [
      { text: 'one ', startMs: 1000, endMs: 1100 },
      { text: 'two ', startMs: 1200, endMs: 1300 },
      { text: 'three', startMs: 1400, endMs: 1500 },
    ];

    expect(getWordPlaybackState(words, 1150, 1600)).toEqual({ completedCount: 1, currentIndex: -1 });
    expect(getWordPlaybackState(words, 1250, 1600)).toEqual({ completedCount: 1, currentIndex: 1 });
    expect(getWordPlaybackState(words, 1550, 1600)).toEqual({ completedCount: 3, currentIndex: -1 });
  });

  it('smooths small playback telemetry corrections but snaps on a real seek', () => {
    const corrected = stabilizeWordPlaybackPosition({
      previous: { positionMs: 1000, sampledAtMs: 1000 },
      rawPositionMs: 1116,
      sampledAtMs: 1016,
      playbackRate: 1,
      smoothingEnabled: true,
    });

    expect(corrected.positionMs).toBe(1036);
    expect(stabilizeWordPlaybackPosition({
      previous: corrected,
      rawPositionMs: 2200,
      sampledAtMs: 1032,
      playbackRate: 1,
      smoothingEnabled: true,
    }).positionMs).toBe(2200);
    expect(stabilizeWordPlaybackPosition({
      previous: corrected,
      rawPositionMs: 900,
      sampledAtMs: 1032,
      playbackRate: 1,
      smoothingEnabled: true,
    }).positionMs).toBe(900);
  });

  it('follows updated lyric scroll targets without jumping directly to them', () => {
    const firstStep = getScrollFollowStep(0, 100, 16, 180);
    const redirectedStep = getScrollFollowStep(firstStep, 200, 16, 180);

    expect(firstStep).toBeGreaterThan(0);
    expect(firstStep).toBeLessThan(100);
    expect(redirectedStep).toBeGreaterThan(firstStep);
    expect(redirectedStep).toBeLessThan(200);
    expect(getScrollFollowStep(0, 100, 1000, 180)).toBeLessThan(100);
  });

  it('uses explicit timer budgets instead of display-refresh cadence for playback sync', () => {
    expect(getLyricsPlaybackSyncIntervalMs({
      frameIntervalMs: 1000 / 30,
      lyricLineIntervalMs: 100,
      wordHighlightEnabled: true,
      wordHighlightProgressMode: 'continuous',
    })).toBeCloseTo(1000 / 30);
    expect(getLyricsPlaybackSyncIntervalMs({
      frameIntervalMs: 1000 / 30,
      lyricLineIntervalMs: 100,
      wordHighlightEnabled: true,
      wordHighlightProgressMode: 'discrete',
    })).toBe(50);
    expect(getLyricsPlaybackSyncIntervalMs({
      frameIntervalMs: 1000 / 30,
      lyricLineIntervalMs: 100,
      wordHighlightEnabled: false,
      wordHighlightProgressMode: 'continuous',
    })).toBe(100);
  });

  it('aligns word highlight immediately after seeking', async () => {
    const { container } = render(
      <LyricsView
        durationMs={3000}
        hideEmptyState={false}
        lyrics={wordLyrics}
        playbackState="paused"
        positionMs={1250}
        positionUpdatedAtMs={0}
        onSeek={vi.fn()}
        wordHighlightEnabled
      />,
    );

    await waitFor(() => {
      const currentWord = container.querySelector<HTMLElement>('.lyrics-word[data-word-state="current"]');
      expect(currentWord?.textContent).toBe('Hello ');
      expect(currentWord?.style.getPropertyValue('--lyrics-word-progress')).toBe('0.5000');
    });
  });

  it('uses discrete word states without continuous progress writes when requested', async () => {
    const { container } = render(
      <LyricsView
        durationMs={3000}
        hideEmptyState={false}
        lyrics={wordLyrics}
        playbackState="paused"
        positionMs={1250}
        positionUpdatedAtMs={0}
        onSeek={vi.fn()}
        wordHighlightEnabled
        wordHighlightProgressMode="discrete"
      />,
    );

    await waitFor(() => {
      const currentWord = container.querySelector<HTMLElement>('.lyrics-word[data-word-state="current"]');
      expect(currentWord?.textContent).toBe('Hello ');
      expect(currentWord?.style.getPropertyValue('--lyrics-word-progress')).toBe('1');
    });
  });

  it('animates line-timed lyrics with estimated word segments', async () => {
    const lineTimedLyrics: LyricsState = {
      kind: 'synced',
      source: 'placeholder',
      offsetMs: 0,
      lines: [
        { timeMs: 1000, text: 'Hello world' },
        { timeMs: 3000, text: 'Next line' },
      ],
    };
    const { container } = render(
      <LyricsView
        durationMs={5000}
        hideEmptyState={false}
        lyrics={lineTimedLyrics}
        playbackState="paused"
        positionMs={1500}
        positionUpdatedAtMs={0}
        onSeek={vi.fn()}
        wordHighlightEnabled
      />,
    );

    await waitFor(() => {
      const activeLine = container.querySelector<HTMLElement>('.lyrics-line[data-active="true"]');
      expect(activeLine?.dataset.wordTiming).toBe('estimated');
      expect(activeLine?.querySelector<HTMLElement>('.lyrics-word[data-word-state="current"]')?.textContent).toBe('Hello ');
    });
  });

  it('does not advance word highlight while paused', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(1750);

    const { container } = render(
      <LyricsView
        durationMs={3000}
        hideEmptyState={false}
        lyrics={wordLyrics}
        playbackState="paused"
        positionMs={1250}
        positionUpdatedAtMs={0}
        onSeek={vi.fn()}
        wordHighlightEnabled
      />,
    );

    await waitFor(() => {
      const currentWord = container.querySelector<HTMLElement>('.lyrics-word[data-word-state="current"]');
      expect(currentWord?.style.getPropertyValue('--lyrics-word-progress')).toBe('0.5000');
    });
  });

  it('uses the next lyric line to pace an open-ended final word', async () => {
    const openEndedLyrics: LyricsState = {
      kind: 'synced',
      source: 'placeholder',
      offsetMs: 0,
      lines: [
        {
          timeMs: 1000,
          text: 'Hello world',
          words: [
            { text: 'Hello ', startMs: 1000, endMs: 1500 },
            { text: 'world', startMs: 1500, endMs: null },
          ],
        },
        { timeMs: 2500, text: 'Next line' },
      ],
    };

    const { container } = render(
      <LyricsView
        durationMs={4000}
        hideEmptyState={false}
        lyrics={openEndedLyrics}
        playbackState="paused"
        positionMs={2000}
        positionUpdatedAtMs={0}
        onSeek={vi.fn()}
        wordHighlightEnabled
      />,
    );

    await waitFor(() => {
      const currentWord = container.querySelector<HTMLElement>('.lyrics-word[data-word-state="current"]');
      expect(currentWord?.textContent).toBe('world');
      expect(currentWord?.style.getPropertyValue('--lyrics-word-progress')).toBe('0.5000');
    });
  });

  it('keeps all words upcoming before the first word timing starts', async () => {
    const delayedWordsLyrics: LyricsState = {
      kind: 'synced',
      source: 'placeholder',
      offsetMs: 0,
      lines: [
        {
          timeMs: 1000,
          text: 'Hello world',
          words: [
            { text: 'Hello ', startMs: 1200, endMs: 1500 },
            { text: 'world', startMs: 1500, endMs: 2000 },
          ],
        },
      ],
    };

    const { container } = render(
      <LyricsView
        durationMs={3000}
        hideEmptyState={false}
        lyrics={delayedWordsLyrics}
        playbackState="paused"
        positionMs={1100}
        positionUpdatedAtMs={0}
        onSeek={vi.fn()}
        wordHighlightEnabled
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('.lyrics-word[data-word-state="current"]')).toBeNull();
      const words = Array.from(container.querySelectorAll<HTMLElement>('.lyrics-word'));
      expect(words.map((word) => word.dataset.wordState)).toEqual(['future', 'future']);
      expect(words.map((word) => word.style.getPropertyValue('--lyrics-word-progress'))).toEqual(['0', '0']);
    });
  });

  it('does not highlight the next word before its start time during a timing gap', async () => {
    const lyricsWithGap: LyricsState = {
      kind: 'synced',
      source: 'placeholder',
      offsetMs: 0,
      lines: [
        {
          timeMs: 1000,
          text: 'Hello world',
          words: [
            { text: 'Hello ', startMs: 1000, endMs: 1300 },
            { text: 'world', startMs: 1500, endMs: 1800 },
          ],
        },
      ],
    };
    const { container } = render(
      <LyricsView
        durationMs={3000}
        hideEmptyState={false}
        lyrics={lyricsWithGap}
        playbackState="paused"
        positionMs={1400}
        positionUpdatedAtMs={0}
        onSeek={vi.fn()}
        wordHighlightEnabled
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('.lyrics-word[data-word-state="current"]')).toBeNull();
      const words = Array.from(container.querySelectorAll<HTMLElement>('.lyrics-word'));
      expect(words.map((word) => word.dataset.wordState)).toEqual(['passed', 'future']);
      expect(words.map((word) => word.style.getPropertyValue('--lyrics-word-progress'))).toEqual(['1', '0']);
    });
  });

  it('marks the final word as passed after its timing ends', async () => {
    const { container } = render(
      <LyricsView
        durationMs={3000}
        hideEmptyState={false}
        lyrics={wordLyrics}
        playbackState="paused"
        positionMs={2200}
        positionUpdatedAtMs={0}
        onSeek={vi.fn()}
        wordHighlightEnabled
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('.lyrics-word[data-word-state="current"]')).toBeNull();
      const words = Array.from(container.querySelectorAll<HTMLElement>('.lyrics-word'));
      expect(words.map((word) => word.dataset.wordState)).toEqual(['passed', 'passed']);
    });
  });

  it('keeps static word highlighting when reduced motion is enabled', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const { container } = render(
      <LyricsView
        durationMs={3000}
        hideEmptyState={false}
        lyrics={wordLyrics}
        playbackState="playing"
        positionMs={1250}
        positionUpdatedAtMs={performance.now()}
        onSeek={vi.fn()}
        wordHighlightEnabled
      />,
    );

    await waitFor(() => {
      const currentWord = container.querySelector<HTMLElement>('.lyrics-word[data-word-state="current"]');
      expect(currentWord?.textContent).toBe('Hello ');
      expect(currentWord?.style.getPropertyValue('--lyrics-word-progress')).toBe('1');
    });
  });

  it('estimates an open-ended last word from nearby word durations when there is no next line', async () => {
    const openEndedLyrics: LyricsState = {
      kind: 'synced',
      source: 'placeholder',
      offsetMs: 0,
      lines: [
        {
          timeMs: 1000,
          text: 'Hello world',
          words: [
            { text: 'Hello ', startMs: 1000, endMs: 1500 },
            { text: 'world', startMs: 1500, endMs: null },
          ],
        },
      ],
    };

    const { container } = render(
      <LyricsView
        durationMs={4000}
        hideEmptyState={false}
        lyrics={openEndedLyrics}
        playbackState="paused"
        positionMs={2000}
        positionUpdatedAtMs={0}
        onSeek={vi.fn()}
        wordHighlightEnabled
      />,
    );

    await waitFor(() => {
      const currentWord = container.querySelector<HTMLElement>('.lyrics-word[data-word-state="current"]');
      expect(currentWord?.textContent).toBe('world');
      expect(currentWord?.style.getPropertyValue('--lyrics-word-progress')).toBe('0.8333');
    });
  });

  it('keeps ordinary line rendering when word highlight is omitted by default', () => {
    const { container } = render(
      <LyricsView
        durationMs={3000}
        hideEmptyState={false}
        lyrics={wordLyrics}
        positionMs={1250}
        onSeek={vi.fn()}
      />,
    );

    expect(container.querySelector('.lyrics-word')).toBeNull();
    expect(container.textContent).toContain('Hello world');
  });

  it('hides romanization for Chinese-only lyrics even when cached lines contain it', () => {
    const chineseLyrics: LyricsState = {
      kind: 'synced',
      source: 'cached',
      offsetMs: 0,
      lines: [
        {
          timeMs: 1000,
          text: '还为分手前那句抱歉在感动',
          romanization: '还 为 bun temae 那 ku 抱 歉 zai kan 动',
        },
      ],
    };

    const { container } = render(
      <LyricsView
        durationMs={3000}
        hideEmptyState={false}
        lyrics={chineseLyrics}
        positionMs={1000}
        onSeek={vi.fn()}
      />,
    );

    expect(container.textContent).toContain('还为分手前那句抱歉在感动');
    expect(container.textContent).not.toContain('bun temae');
    expect(container.querySelector('.lyrics-line')?.getAttribute('data-secondary-lines')).toBe('0');
  });

  it('keeps romanization visible when Japanese kana appears in the lyric set', () => {
    const japaneseLyrics: LyricsState = {
      kind: 'synced',
      source: 'cached',
      offsetMs: 0,
      lines: [
        { timeMs: 1000, text: '夢', romanization: 'yume' },
        { timeMs: 2000, text: '君が好き', romanization: 'kimi ga suki' },
      ],
    };

    const { container } = render(
      <LyricsView
        durationMs={3000}
        hideEmptyState={false}
        lyrics={japaneseLyrics}
        positionMs={1000}
        onSeek={vi.fn()}
      />,
    );

    expect(container.textContent).toContain('yume');
    expect(container.textContent).toContain('kimi ga suki');
  });

  it('updates word progress through the playback timer while keeping the active line mounted', () => {
    vi.useFakeTimers();
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);

    const { container } = render(
      <LyricsView
        durationMs={3000}
        hideEmptyState={false}
        lyrics={wordLyrics}
        playbackRate={1}
        playbackState="playing"
        positionMs={1000}
        positionUpdatedAtMs={1000}
        onSeek={vi.fn()}
        wordHighlightEnabled
      />,
    );
    const activeLine = container.querySelector('.lyrics-line[data-active="true"]');

    act(() => {
      now = 1250;
      vi.advanceTimersByTime(34);
    });

    const currentWord = container.querySelector<HTMLElement>('.lyrics-word[data-word-state="current"]');
    expect(currentWord?.style.getPropertyValue('--lyrics-word-progress')).toBe('0.5000');
    expect(container.querySelector('.lyrics-line[data-active="true"]')).toBe(activeLine);
  });

  it('groups the active word into the kinetic poster focus column without duplicating lyric segments', async () => {
    const { container } = render(
      <LyricsView
        durationMs={3000}
        lyrics={wordLyrics}
        playbackState="paused"
        positionMs={1600}
        presentationMode="kineticPoster"
        wordHighlightEnabled
        wordHighlightProgressMode="discrete"
        onSeek={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('.lyrics-kinetic-poster-word-focus')?.textContent).toBe('world');
    });

    expect(container.querySelector('.lyrics-kinetic-poster-word-focus')?.getAttribute('data-focus-word-state')).toBe('current');
    expect(container.querySelector('[data-zone="passed"]')?.textContent).toBe('Hello ');
    expect(container.querySelector('[data-zone="future"]')?.textContent).toBe('');
    expect(container.querySelectorAll('.lyrics-line[data-active="true"] .lyrics-word')).toHaveLength(2);
    expect(container.querySelector('.lyrics-scroll')?.getAttribute('data-presentation-mode')).toBe('kineticPoster');
  });

  it('previews upcoming cover-stage lyrics before the first timed line without activating them early', () => {
    const { container } = render(
      <LyricsView
        durationMs={6000}
        lyrics={{
          ...lyrics,
          lines: [
            { timeMs: 3000, text: 'First upcoming line' },
            { timeMs: 4500, text: 'Second upcoming line' },
          ],
        }}
        playbackState="paused"
        positionMs={500}
        presentationMode="coverStage"
        wordHighlightEnabled
        onSeek={vi.fn()}
      />,
    );

    const lines = container.querySelectorAll<HTMLElement>('.lyrics-line');
    expect(lines[0]?.dataset.focusDistance).toBe('1');
    expect(lines[1]?.dataset.focusDistance).toBe('2');
    expect(container.querySelector('.lyrics-line[data-active="true"]')).toBeNull();
    expect(container.querySelector('.lyrics-word')).toBeNull();
  });

  it('groups every active lyric word into cut-board panels without changing timing nodes', async () => {
    const { container } = render(
      <LyricsView
        durationMs={3000}
        lyrics={wordLyrics}
        playbackState="paused"
        positionMs={1600}
        presentationMode="cutBoard"
        wordHighlightEnabled
        wordHighlightProgressMode="discrete"
        onSeek={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('.lyrics-line-primary--cut-board')).not.toBeNull();
    });
    expect(container.querySelectorAll('.lyrics-line[data-active="true"] .lyrics-word')).toHaveLength(2);
    expect(container.querySelectorAll('.lyrics-cut-board-word-panel')).toHaveLength(7);
    expect(container.querySelectorAll('.lyrics-cut-board-word-panel[data-panel-state="passed"]')).toHaveLength(3);
    expect(container.querySelectorAll('.lyrics-cut-board-word-panel[data-panel-state="current"]')).toHaveLength(1);
    expect(container.querySelector('.lyrics-cut-board-word-panel[data-panel-state="current"]')?.textContent).toBe('world');
    expect(container.querySelector('.lyrics-cut-board-word-panel[data-panel-role="past-near"]')?.textContent).toBe('Hello ');
    expect(container.querySelector('.lyrics-scroll')?.getAttribute('data-presentation-mode')).toBe('cutBoard');
  });

  it('keeps off-stage cut-board glyphs mounted so word highlighting can keep advancing', async () => {
    const glyphs = Array.from('｢大人になれないまま僕でいさせて｣');
    const { container } = render(
      <LyricsView
        durationMs={4000}
        lyrics={{
          kind: 'synced',
          source: 'placeholder',
          offsetMs: 0,
          lines: [{
            timeMs: 1000,
            text: glyphs.join(''),
            words: glyphs.map((text, index) => ({
              text,
              startMs: 1000 + index * 100,
              endMs: 1100 + index * 100,
            })),
          }],
        }}
        playbackState="paused"
        positionMs={2050}
        presentationMode="cutBoard"
        wordHighlightEnabled
        wordHighlightProgressMode="discrete"
        onSeek={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('.lyrics-cut-board-word-panel[data-panel-role="current"]')?.textContent).toBe('僕');
    });
    expect(container.querySelectorAll('.lyrics-line[data-active="true"] .lyrics-word')).toHaveLength(glyphs.length);
    expect(container.querySelector('.lyrics-cut-board-word-panel[data-panel-role="past-edge"]')?.textContent).toBe('｢');
  });

  it('clears the kinetic poster accent after a line ends and moves it to the next line on time', async () => {
    const boundaryLyrics: LyricsState = {
      kind: 'synced',
      source: 'placeholder',
      offsetMs: 0,
      lines: [
        {
          timeMs: 1000,
          text: 'Hello world',
          words: [
            { text: 'Hello ', startMs: 1000, endMs: 1400 },
            { text: 'world', startMs: 1400, endMs: 1800 },
          ],
        },
        {
          timeMs: 2000,
          text: 'Good night',
          words: [
            { text: 'Good ', startMs: 2000, endMs: 2400 },
            { text: 'night', startMs: 2400, endMs: 2800 },
          ],
        },
      ],
    };
    const view = (positionMs: number): JSX.Element => (
      <LyricsView
        durationMs={3000}
        lyrics={boundaryLyrics}
        playbackState="paused"
        positionMs={positionMs}
        presentationMode="kineticPoster"
        wordHighlightEnabled
        wordHighlightProgressMode="discrete"
        onSeek={vi.fn()}
      />
    );
    const { container, rerender } = render(view(1900));

    await waitFor(() => {
      const focus = container.querySelector('.lyrics-kinetic-poster-word-focus');
      expect(focus?.textContent).toBe('world');
      expect(focus?.getAttribute('data-focus-word-state')).toBe('passed');
      expect(focus?.querySelector('.lyrics-word')?.getAttribute('data-word-state')).toBe('passed');
    });

    rerender(view(2100));

    await waitFor(() => {
      const focus = container.querySelector('.lyrics-kinetic-poster-word-focus');
      expect(focus?.textContent).toBe('Good ');
      expect(focus?.getAttribute('data-focus-word-state')).toBe('current');
      expect(focus?.querySelector('.lyrics-word')?.getAttribute('data-word-state')).toBe('current');
    });
  });

  it('limits word progress writes to the 30 Hz timer cadence', () => {
    vi.useFakeTimers();
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);

    const { container } = render(
      <LyricsView
        durationMs={3000}
        hideEmptyState={false}
        lyrics={wordLyrics}
        playbackRate={1}
        playbackState="playing"
        positionMs={1000}
        positionUpdatedAtMs={1000}
        onSeek={vi.fn()}
        wordHighlightEnabled
      />,
    );
    const currentWord = container.querySelector<HTMLElement>('.lyrics-word[data-word-state="current"]');
    expect(currentWord?.style.getPropertyValue('--lyrics-word-progress')).toBe('0.0000');

    act(() => {
      now = 1032;
      vi.advanceTimersByTime(32);
    });
    expect(currentWord?.style.getPropertyValue('--lyrics-word-progress')).toBe('0.0000');

    act(() => {
      now = 1034;
      vi.advanceTimersByTime(2);
    });
    expect(Number(currentWord?.style.getPropertyValue('--lyrics-word-progress'))).toBeGreaterThan(0);
  });

  it('keeps the playback sync timer alive across playback telemetry updates', () => {
    vi.useFakeTimers();
    const clearTimerSpy = vi.spyOn(window, 'clearTimeout');
    vi.spyOn(performance, 'now').mockReturnValue(1000);

    const view = (positionMs: number, positionUpdatedAtMs: number): JSX.Element => (
      <LyricsView
        durationMs={3000}
        hideEmptyState={false}
        lyrics={wordLyrics}
        playbackRate={1}
        playbackState="playing"
        positionMs={positionMs}
        positionUpdatedAtMs={positionUpdatedAtMs}
        onSeek={vi.fn()}
        wordHighlightEnabled
      />
    );
    const { rerender } = render(view(1000, 1000));
    clearTimerSpy.mockClear();

    rerender(view(1050, 1050));

    expect(clearTimerSpy).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
  });

  it('clears and rearms the playback sync timer across visibility changes', () => {
    const visibilityDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    let visibilityState: DocumentVisibilityState = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibilityState });
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const setTimerSpy = vi.spyOn(window, 'setTimeout');
    const clearTimerSpy = vi.spyOn(window, 'clearTimeout');

    try {
      const { unmount } = render(
        <LyricsView
          durationMs={3000}
          hideEmptyState={false}
          lyrics={wordLyrics}
          playbackRate={1}
          playbackState="playing"
          positionMs={1000}
          positionUpdatedAtMs={1000}
          onSeek={vi.fn()}
          wordHighlightEnabled
          wordHighlightProgressMode="discrete"
        />,
      );

      const playbackTimerCalls = (): unknown[] => setTimerSpy.mock.calls
        .map(([, delay], index) => delay === 50 ? setTimerSpy.mock.results[index]?.value : undefined)
        .filter((value) => value !== undefined);
      const initialTimer = playbackTimerCalls().at(-1);
      expect(initialTimer).toBeDefined();

      act(() => {
        visibilityState = 'hidden';
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(clearTimerSpy).toHaveBeenCalledWith(initialTimer);

      act(() => {
        visibilityState = 'visible';
        document.dispatchEvent(new Event('visibilitychange'));
      });
      const resumedTimer = playbackTimerCalls().at(-1);
      expect(resumedTimer).toBeDefined();
      expect(resumedTimer).not.toBe(initialTimer);

      unmount();
      expect(clearTimerSpy).toHaveBeenCalledWith(resumedTimer);
    } finally {
      if (visibilityDescriptor) {
        Object.defineProperty(document, 'visibilityState', visibilityDescriptor);
      } else {
        Reflect.deleteProperty(document, 'visibilityState');
      }
    }
  });

  it('refreshes cached word elements when a new lyric set reuses the same line timing shape', async () => {
    const nextWordLyrics: LyricsState = {
      kind: 'synced',
      source: 'placeholder',
      offsetMs: 0,
      lines: [
        {
          timeMs: 1000,
          text: 'Good night',
          words: [
            { text: 'Good ', startMs: 1000, endMs: 1500 },
            { text: 'night', startMs: 1500, endMs: 2000 },
          ],
        },
      ],
    };

    const { container, rerender } = render(
      <LyricsView
        durationMs={3000}
        hideEmptyState={false}
        lyrics={wordLyrics}
        playbackState="paused"
        positionMs={1250}
        positionUpdatedAtMs={0}
        onSeek={vi.fn()}
        wordHighlightEnabled
      />,
    );

    await waitFor(() => {
      expect(container.querySelector<HTMLElement>('.lyrics-word[data-word-state="current"]')?.textContent).toBe('Hello ');
    });

    rerender(
      <LyricsView
        durationMs={3000}
        hideEmptyState={false}
        lyrics={nextWordLyrics}
        playbackState="paused"
        positionMs={1250}
        positionUpdatedAtMs={0}
        onSeek={vi.fn()}
        wordHighlightEnabled
      />,
    );

    await waitFor(() => {
      const currentWord = container.querySelector<HTMLElement>('.lyrics-word[data-word-state="current"]');
      expect(currentWord?.textContent).toBe('Good ');
      expect(currentWord?.style.getPropertyValue('--lyrics-word-progress')).toBe('0.5000');
    });
  });

  it('does not advance word progress with high-frequency updates disabled', async () => {
    let frameId = 0;
    const frames = new Map<number, FrameRequestCallback>();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameId += 1;
      frames.set(frameId, callback);
      return frameId;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
    vi.spyOn(performance, 'now').mockReturnValue(1000);

    const { container } = render(
      <LyricsView
        durationMs={3000}
        hideEmptyState={false}
        lyrics={wordLyrics}
        playbackRate={1}
        playbackState="playing"
        positionMs={1000}
        positionUpdatedAtMs={1000}
        highFrequencyUpdatesEnabled={false}
        onSeek={vi.fn()}
        wordHighlightEnabled
      />,
    );

    await waitFor(() => {
      const currentWord = container.querySelector<HTMLElement>('.lyrics-word[data-word-state="current"]');
      expect(currentWord?.style.getPropertyValue('--lyrics-word-progress')).toBe('0.0000');
    });

    vi.mocked(performance.now).mockReturnValue(1250);
    act(() => {
      const callbacks = Array.from(frames.entries());
      frames.clear();
      for (const [, callback] of callbacks) {
        callback(1250);
      }
    });

    const currentWord = container.querySelector<HTMLElement>('.lyrics-word[data-word-state="current"]');
    expect(currentWord?.style.getPropertyValue('--lyrics-word-progress')).toBe('0.0000');
  });

  it('centers immediately when seeking backward to an earlier lyric line', async () => {
    let frameId = 0;
    const frames = new Map<number, FrameRequestCallback>();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameId += 1;
      frames.set(frameId, callback);
      return frameId;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });

    const longLyrics: LyricsState = {
      ...lyrics,
      lines: [
        { timeMs: 0, text: 'First line' },
        { timeMs: 1000, text: 'Second line' },
        { timeMs: 2000, text: 'Third line' },
        { timeMs: 3000, text: 'Fourth line' },
        { timeMs: 4000, text: 'Fifth line' },
      ],
    };
    const { container, rerender } = render(
      <LyricsView
        durationMs={5000}
        hideEmptyState={false}
        lyrics={longLyrics}
        playbackState="paused"
        positionMs={4000}
        onSeek={vi.fn()}
      />,
    );
    const scrollContainer = container.querySelector('.lyrics-scroll') as HTMLElement;

    Object.defineProperty(scrollContainer, 'clientHeight', { configurable: true, value: 400 });
    Object.defineProperty(scrollContainer, 'scrollHeight', { configurable: true, value: 1200 });
    scrollContainer.getBoundingClientRect = vi.fn(() => makeRect(0, 400));

    act(() => {
      for (const [id, callback] of Array.from(frames.entries())) {
        frames.delete(id);
        callback(16);
      }
    });
    frames.clear();
    scrollContainer.scrollTop = 200;

    rerender(
      <LyricsView
        durationMs={5000}
        hideEmptyState={false}
        lyrics={longLyrics}
        playbackState="paused"
        positionMs={2000}
        onSeek={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('.lyrics-line[data-active="true"]')?.textContent).toContain('Third line');
    });
    const activeLine = container.querySelector('.lyrics-line[data-active="true"]') as HTMLButtonElement;
    activeLine.getBoundingClientRect = vi.fn(() => makeRect(80, 42));

    act(() => {
      for (const [id, callback] of Array.from(frames.entries())) {
        frames.delete(id);
        callback(32);
      }
    });

    expect(scrollContainer.scrollTop).toBe(93);
    expect(frames.size).toBe(0);
  });

  it('centers from layout coordinates so line transform transitions do not change the target', () => {
    let frameId = 0;
    const frames = new Map<number, FrameRequestCallback>();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameId += 1;
      frames.set(frameId, callback);
      return frameId;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });

    const { container } = render(
      <LyricsView
        durationMs={3000}
        hideEmptyState={false}
        lyrics={lyrics}
        playbackState="paused"
        positionMs={1000}
        onSeek={vi.fn()}
      />,
    );
    const scrollContainer = container.querySelector('.lyrics-scroll') as HTMLElement;
    const activeLine = container.querySelector('.lyrics-line[data-active="true"]') as HTMLButtonElement;

    setLayoutNumber(scrollContainer, 'clientHeight', 200);
    setLayoutNumber(scrollContainer, 'scrollHeight', 1000);
    setLayoutNumber(activeLine, 'offsetTop', 300);
    setLayoutNumber(activeLine, 'offsetHeight', 40);
    scrollContainer.getBoundingClientRect = vi.fn(() => makeRect(0, 200));
    activeLine.getBoundingClientRect = vi.fn(() => makeRect(820, 40));

    act(() => {
      for (const [id, callback] of Array.from(frames.entries())) {
        frames.delete(id);
        callback(16);
      }
    });

    expect(scrollContainer.scrollTop).toBe(216);
    expect(frames.size).toBe(0);
  });

  it('uses the editorial reading axis instead of the default lyric center', () => {
    let frameId = 0;
    const frames = new Map<number, FrameRequestCallback>();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameId += 1;
      frames.set(frameId, callback);
      return frameId;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });

    const { container } = render(
      <div className="lyrics-page" data-lyrics-page-style="editorial">
        <LyricsView
          durationMs={3000}
          hideEmptyState={false}
          lyrics={lyrics}
          playbackState="paused"
          positionMs={1000}
          onSeek={vi.fn()}
        />
      </div>,
    );
    const scrollContainer = container.querySelector('.lyrics-scroll') as HTMLElement;
    const activeLine = container.querySelector('.lyrics-line[data-active="true"]') as HTMLButtonElement;

    setLayoutNumber(scrollContainer, 'clientHeight', 200);
    setLayoutNumber(scrollContainer, 'scrollHeight', 1000);
    setLayoutNumber(activeLine, 'offsetTop', 300);
    setLayoutNumber(activeLine, 'offsetHeight', 40);

    act(() => {
      for (const [id, callback] of Array.from(frames.entries())) {
        frames.delete(id);
        callback(16);
      }
    });

    expect(scrollContainer.scrollTop).toBe(228);
    expect(frames.size).toBe(0);
  });

  it('recenters immediately when the lyric set changes but the active index stays the same', async () => {
    let frameId = 0;
    const frames = new Map<number, FrameRequestCallback>();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameId += 1;
      frames.set(frameId, callback);
      return frameId;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
    const nextLyrics: LyricsState = {
      ...lyrics,
      lines: [
        { timeMs: 0, text: 'New first line' },
        { timeMs: 1000, text: 'New second line' },
        { timeMs: 2000, text: 'New third line' },
      ],
    };

    const { container, rerender } = render(
      <LyricsView
        durationMs={3000}
        hideEmptyState={false}
        lyrics={lyrics}
        playbackState="paused"
        positionMs={1000}
        onSeek={vi.fn()}
      />,
    );
    const scrollContainer = container.querySelector('.lyrics-scroll') as HTMLElement;
    setLayoutNumber(scrollContainer, 'clientHeight', 200);
    setLayoutNumber(scrollContainer, 'scrollHeight', 1000);

    let activeLine = container.querySelector('.lyrics-line[data-active="true"]') as HTMLButtonElement;
    setLayoutNumber(activeLine, 'offsetTop', 300);
    setLayoutNumber(activeLine, 'offsetHeight', 40);
    act(() => {
      for (const [id, callback] of Array.from(frames.entries())) {
        frames.delete(id);
        callback(16);
      }
    });
    scrollContainer.scrollTop = 620;

    rerender(
      <LyricsView
        durationMs={3000}
        hideEmptyState={false}
        lyrics={nextLyrics}
        playbackState="paused"
        positionMs={1000}
        onSeek={vi.fn()}
      />,
    );

    await waitFor(() => expect(frames.size).toBeGreaterThan(0));
    activeLine = container.querySelector('.lyrics-line[data-active="true"]') as HTMLButtonElement;
    setLayoutNumber(activeLine, 'offsetTop', 300);
    setLayoutNumber(activeLine, 'offsetHeight', 40);

    act(() => {
      for (const [id, callback] of Array.from(frames.entries())) {
        frames.delete(id);
        callback(32);
      }
    });

    expect(container.querySelector('.lyrics-line[data-active="true"]')?.textContent).toContain('New second line');
    expect(scrollContainer.scrollTop).toBe(216);
    expect(frames.size).toBe(0);
  });

  it('preserves the active lyric screen position when display settings change', () => {
    let frameId = 0;
    const frames = new Map<number, FrameRequestCallback>();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameId += 1;
      frames.set(frameId, callback);
      return frameId;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });

    const { container } = render(
      <LyricsView
        durationMs={3000}
        hideEmptyState={false}
        lyrics={lyrics}
        positionMs={1000}
        onSeek={vi.fn()}
      />,
    );
    const scrollContainer = container.querySelector('.lyrics-scroll') as HTMLElement;
    const activeLine = container.querySelector('.lyrics-line[data-active="true"]') as HTMLButtonElement;
    let activeTop = 200;

    Object.defineProperty(scrollContainer, 'clientHeight', { configurable: true, value: 400 });
    Object.defineProperty(scrollContainer, 'scrollHeight', { configurable: true, value: 1200 });
    scrollContainer.getBoundingClientRect = vi.fn(() => makeRect(0, 400));
    activeLine.getBoundingClientRect = vi.fn(() => makeRect(activeTop, 42));
    scrollContainer.scrollTop = 120;

    act(() => {
      window.dispatchEvent(new CustomEvent('lyrics:display-settings-changed', { detail: { lyricsFontSizePx: 44 } }));
    });

    activeTop = 164;
    act(() => {
      for (const [id, callback] of Array.from(frames.entries())) {
        frames.delete(id);
        callback(16);
      }
    });

    expect(scrollContainer.scrollTop).toBe(84);
  });

  it('ignores persisted settings payloads because display preview events handle lyric layout changes', () => {
    let frameId = 0;
    const frames = new Map<number, FrameRequestCallback>();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameId += 1;
      frames.set(frameId, callback);
      return frameId;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });

    const { container } = render(
      <LyricsView
        durationMs={3000}
        hideEmptyState={false}
        lyrics={lyrics}
        positionMs={1000}
        onSeek={vi.fn()}
      />,
    );
    const scrollContainer = container.querySelector('.lyrics-scroll') as HTMLElement;
    const activeLine = container.querySelector('.lyrics-line[data-active="true"]') as HTMLButtonElement;
    let activeTop = 200;

    Object.defineProperty(scrollContainer, 'clientHeight', { configurable: true, value: 400 });
    Object.defineProperty(scrollContainer, 'scrollHeight', { configurable: true, value: 1200 });
    scrollContainer.getBoundingClientRect = vi.fn(() => makeRect(0, 400));
    activeLine.getBoundingClientRect = vi.fn(() => makeRect(activeTop, 42));
    scrollContainer.scrollTop = 120;

    act(() => {
      for (const [id, callback] of Array.from(frames.entries())) {
        frames.delete(id);
        callback(16);
      }
    });
    scrollContainer.scrollTop = 120;

    act(() => {
      window.dispatchEvent(new CustomEvent('settings:changed', { detail: { lyricsFontSizePx: 44 } }));
    });

    activeTop = 164;
    act(() => {
      for (const [id, callback] of Array.from(frames.entries())) {
        frames.delete(id);
        callback(16);
      }
    });

    expect(scrollContainer.scrollTop).toBe(120);
  });
});
