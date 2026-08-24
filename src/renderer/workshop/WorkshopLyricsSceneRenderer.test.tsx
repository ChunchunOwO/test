// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkshopActiveLyricsScene } from '../../shared/types/workshopLyricsScene';
import type { LyricsState } from '../components/lyrics/lyricsTypes';
import { WorkshopLyricsSceneRenderer } from './WorkshopLyricsSceneRenderer';

const activeScene: WorkshopActiveLyricsScene = {
  sourceId: 'steam',
  itemId: '456',
  contentId: 'echo.lyrics-rebuild',
  version: '1.0.0',
  title: 'Lyrics Rebuild',
  scene: {
    schemaVersion: 1,
    background: 'theme',
    root: {
      id: 'root',
      type: 'group',
      style: { display: 'grid', gridTemplateColumns: '1fr 1fr' },
      children: [
        { id: 'title', type: 'slot', slot: 'title', style: { color: '$accent' } },
        { id: 'current', type: 'slot', slot: 'current-line' },
        { id: 'translation', type: 'slot', slot: 'translation' },
        { id: 'progress', type: 'slot', slot: 'progress' },
        { id: 'spectrum', type: 'slot', slot: 'spectrum', options: { spectrumBars: 4, spectrumGain: 2 } },
        { id: 'playing', type: 'text', text: 'LIVE', when: { isPlaying: true } },
        { id: 'cover-only', type: 'text', text: 'COVER', when: { hasCover: true } },
        { id: 'literal', type: 'text', text: '<img src=x onerror=alert(1)>' },
      ],
    },
  },
};

const transportProps = {
  timelineSeekEnabled: true,
  canGoNext: true,
  canGoPrevious: true,
  onTogglePlay: vi.fn(),
  onNext: vi.fn(),
  onPrevious: vi.fn(),
};

const lyrics: LyricsState = {
  kind: 'synced',
  source: 'local',
  offsetMs: 0,
  lines: [
    { timeMs: 0, text: 'First line' },
    { timeMs: 2_000, text: 'Current line', translation: '当前歌词' },
  ],
};

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'echo');
});

describe('Workshop lyrics scene renderer', () => {
  it('leases Audio Core spectrum telemetry only while a spectrum scene is mounted', async () => {
    const setLyricsSpectrumActive = vi.fn(async (active: boolean) => active);
    Object.defineProperty(window, 'echo', {
      configurable: true,
      value: { workshop: { setLyricsSpectrumActive } },
    });
    const { unmount } = render(
      <WorkshopLyricsSceneRenderer
        activeScene={activeScene}
        title="Track title"
        artist="Artist"
        album="Album"
        coverUrl={null}
        lyrics={lyrics}
        durationMs={10_000}
        positionMs={2_500}
        playbackRate={1}
        playbackState="playing"
        positionUpdatedAtMs={0}
        isPlaying
        spectrumBands={[0.2, 0.4, 0.6, 0.8]}
        defaultShowRomanization={false}
        defaultShowTranslation
        defaultWordHighlightEnabled
        highFrequencyUpdatesEnabled={false}
        motionEnabled
        seekEnabled
        seekTimelineOffsetMs={0}
        {...transportProps}
        onSeek={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    await waitFor(() => expect(setLyricsSpectrumActive).toHaveBeenCalledWith(true));
    unmount();
    await waitFor(() => expect(setLyricsSpectrumActive).toHaveBeenCalledWith(false));
  });

  it('composes trusted host slots while rendering author text as inert text', () => {
    const onBack = vi.fn();
    const { container } = render(
      <WorkshopLyricsSceneRenderer
        activeScene={activeScene}
        title="Track title"
        artist="Artist"
        album="Album"
        coverUrl={null}
        lyrics={lyrics}
        durationMs={10_000}
        positionMs={2_500}
        playbackRate={1}
        playbackState="playing"
        positionUpdatedAtMs={0}
        isPlaying
        spectrumBands={[0.2, 0.4, 0.6, 0.8]}
        defaultShowRomanization={false}
        defaultShowTranslation
        defaultWordHighlightEnabled
        highFrequencyUpdatesEnabled={false}
        motionEnabled
        seekEnabled
        seekTimelineOffsetMs={0}
        {...transportProps}
        onSeek={vi.fn()}
        onBack={onBack}
      />,
    );

    expect(screen.getByRole('region', { name: 'Lyrics Rebuild Workshop 歌词场景' })).toBeTruthy();
    expect(screen.getByText('Track title')).toBeTruthy();
    expect(screen.getByText('Current line')).toBeTruthy();
    expect(screen.getByText('当前歌词')).toBeTruthy();
    expect(screen.getByText('LIVE')).toBeTruthy();
    expect(screen.queryByText('COVER')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
    expect(container.querySelector('[data-node-id="literal"] img')).toBeNull();
    expect((container.querySelector('[data-node-id="title"]') as HTMLElement).style.color)
      .toBe('var(--theme-accent)');
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('25');
    expect(container.querySelectorAll('[data-node-id="spectrum"] i')).toHaveLength(4);
    expect(Array.from(container.querySelectorAll<HTMLElement>('[data-node-id="spectrum"] i')).map((bar) =>
      Number(bar.style.getPropertyValue('--workshop-spectrum-value')),
    )).toEqual([0.2, 0.4, 0.6, 0.8].map((value) =>
      Math.min(1, (Math.max(0, (value - 0.025) / 0.975) ** 1.55) * 2)
    ));

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('omits empty optional lyric slots so untranslated songs do not keep blank gaps', () => {
    const { container } = render(
      <WorkshopLyricsSceneRenderer
        activeScene={activeScene}
        title="Track title"
        artist="Artist"
        album="Album"
        coverUrl={null}
        lyrics={{ ...lyrics, lines: [{ timeMs: 0, text: '日本語の歌詞' }] }}
        durationMs={10_000}
        positionMs={1_000}
        playbackRate={1}
        playbackState="playing"
        positionUpdatedAtMs={0}
        isPlaying
        spectrumBands={[0.2, 0.4, 0.6, 0.8]}
        defaultShowRomanization={false}
        defaultShowTranslation
        defaultWordHighlightEnabled
        highFrequencyUpdatesEnabled={false}
        motionEnabled
        seekEnabled
        seekTimelineOffsetMs={0}
        {...transportProps}
        onSeek={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText('日本語の歌詞')).toBeTruthy();
    expect(container.querySelector('[data-node-id="translation"]')).toBeNull();
    expect(container.querySelector('[data-node-id="current"]')).toBeTruthy();
  });

  it('crossfades lyric context when the active line changes and skips it when motion is disabled', async () => {
    const animatedLyrics: LyricsState = {
      ...lyrics,
      lines: [
        { timeMs: 0, text: 'First line' },
        { timeMs: 2_000, text: 'Second line' },
        { timeMs: 4_000, text: 'Third line' },
      ],
    };
    const props = {
      activeScene,
      title: 'Track title',
      artist: 'Artist',
      album: 'Album',
      coverUrl: null,
      lyrics: animatedLyrics,
      durationMs: 10_000,
      playbackRate: 1,
      playbackState: 'playing',
      positionUpdatedAtMs: 0,
      isPlaying: true,
      spectrumBands: [0.2, 0.4, 0.6, 0.8],
      defaultShowRomanization: false,
      defaultShowTranslation: true,
      defaultWordHighlightEnabled: true,
      highFrequencyUpdatesEnabled: false,
      seekEnabled: true,
      seekTimelineOffsetMs: 0,
      ...transportProps,
      onSeek: vi.fn(),
      onBack: vi.fn(),
    };
    const { container, rerender } = render(
      <WorkshopLyricsSceneRenderer {...props} positionMs={2_500} motionEnabled />,
    );

    rerender(<WorkshopLyricsSceneRenderer {...props} positionMs={4_500} motionEnabled />);

    await waitFor(() => {
      expect(container.querySelector('[data-node-id="current"] .workshop-lyrics-scene__lyric-transition-line--incoming')?.textContent)
        .toBe('Third line');
      expect(container.querySelector('[data-node-id="current"] .workshop-lyrics-scene__lyric-transition-line--outgoing')?.textContent)
        .toBe('Second line');
    });

    rerender(<WorkshopLyricsSceneRenderer {...props} positionMs={2_500} motionEnabled={false} />);

    await waitFor(() => {
      expect(container.querySelector('[data-node-id="current"] .workshop-lyrics-scene__lyric-transition-line--incoming')?.textContent)
        .toBe('Second line');
      expect(container.querySelector('[data-node-id="current"] .workshop-lyrics-scene__lyric-transition-line--outgoing'))
        .toBeNull();
    });
  });

  it('does not restart scene or lyric enter motion when playback is paused and resumed', () => {
    const { container, rerender } = render(
      <WorkshopLyricsSceneRenderer
        activeScene={activeScene}
        title="Track title"
        artist="Artist"
        album="Album"
        coverUrl={null}
        lyrics={lyrics}
        durationMs={10_000}
        positionMs={2_500}
        playbackRate={1}
        playbackState="playing"
        positionUpdatedAtMs={0}
        isPlaying
        spectrumBands={[]}
        defaultShowRomanization={false}
        defaultShowTranslation
        defaultWordHighlightEnabled
        highFrequencyUpdatesEnabled={false}
        motionEnabled
        seekEnabled
        seekTimelineOffsetMs={0}
        {...transportProps}
        onSeek={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    const incoming = container.querySelector('[data-node-id="current"] .workshop-lyrics-scene__lyric-transition-line--incoming');
    expect(incoming?.classList.contains('workshop-lyrics-scene__lyric-transition-line--animate')).toBe(true);

    rerender(
      <WorkshopLyricsSceneRenderer
        activeScene={activeScene}
        title="Track title"
        artist="Artist"
        album="Album"
        coverUrl={null}
        lyrics={lyrics}
        durationMs={10_000}
        positionMs={2_500}
        playbackRate={1}
        playbackState="paused"
        positionUpdatedAtMs={0}
        isPlaying={false}
        spectrumBands={[]}
        defaultShowRomanization={false}
        defaultShowTranslation
        defaultWordHighlightEnabled
        highFrequencyUpdatesEnabled={false}
        motionEnabled={false}
        seekEnabled
        seekTimelineOffsetMs={0}
        {...transportProps}
        onSeek={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    rerender(
      <WorkshopLyricsSceneRenderer
        activeScene={activeScene}
        title="Track title"
        artist="Artist"
        album="Album"
        coverUrl={null}
        lyrics={lyrics}
        durationMs={10_000}
        positionMs={2_500}
        playbackRate={1}
        playbackState="playing"
        positionUpdatedAtMs={0}
        isPlaying
        spectrumBands={[]}
        defaultShowRomanization={false}
        defaultShowTranslation
        defaultWordHighlightEnabled
        highFrequencyUpdatesEnabled={false}
        motionEnabled
        seekEnabled
        seekTimelineOffsetMs={0}
        {...transportProps}
        onSeek={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    const resumed = container.querySelector('[data-node-id="current"] .workshop-lyrics-scene__lyric-transition-line--incoming');
    expect(resumed).toBe(incoming);
    expect(resumed?.classList.contains('workshop-lyrics-scene__lyric-transition-line--animate')).toBe(true);
    expect(container.querySelector('[data-node-id="current"] .workshop-lyrics-scene__lyric-transition-line--outgoing')).toBeNull();
    expect(container.querySelector('.workshop-lyrics-scene')?.getAttribute('data-enter-settled')).toBe('true');
  });

  it('eases spectrum bars toward new telemetry using the declared attack time', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    const tick = (time: number): void => {
      frames.splice(0).forEach((callback) => callback(time));
    };

    const easingScene: WorkshopActiveLyricsScene = {
      ...activeScene,
      scene: {
        schemaVersion: 1,
        background: 'theme',
        root: {
          id: 'root',
          type: 'group',
          children: [
            { id: 'snap', type: 'slot', slot: 'spectrum', options: { spectrumBars: 4, spectrumGain: 2 } },
            {
              id: 'eased',
              type: 'slot',
              slot: 'spectrum',
              options: { spectrumBars: 4, spectrumGain: 2, spectrumAttackMs: 200, spectrumReleaseMs: 400 },
            },
          ],
        },
      },
    };
    const props = {
      activeScene: easingScene,
      title: 'Track title',
      artist: 'Artist',
      album: 'Album',
      coverUrl: null,
      lyrics,
      durationMs: 10_000,
      positionMs: 2_500,
      playbackRate: 1,
      playbackState: 'playing',
      positionUpdatedAtMs: 0,
      isPlaying: true,
      defaultShowRomanization: false,
      defaultShowTranslation: true,
      defaultWordHighlightEnabled: true,
      highFrequencyUpdatesEnabled: false,
      motionEnabled: true,
      seekEnabled: true,
      seekTimelineOffsetMs: 0,
      ...transportProps,
      onSeek: vi.fn(),
      onBack: vi.fn(),
    };

    const { container, rerender } = render(
      <WorkshopLyricsSceneRenderer {...props} spectrumBands={[0, 0, 0, 0]} />,
    );
    tick(1_000);
    rerender(<WorkshopLyricsSceneRenderer {...props} spectrumBands={[1, 1, 1, 1]} />);
    tick(1_016);

    const barValue = (nodeId: string): number => Number(
      container.querySelector<HTMLElement>(`[data-node-id="${nodeId}"] i`)
        ?.style.getPropertyValue('--workshop-spectrum-value'),
    );

    // A 16 ms frame covers most of an 18 ms attack but only a sliver of a 200 ms one.
    expect(barValue('snap')).toBeGreaterThan(0.5);
    expect(barValue('eased')).toBeLessThan(0.15);
    expect(barValue('eased')).toBeGreaterThan(0.02);

    vi.unstubAllGlobals();
  });

  it('routes declared transport slots back to host playback commands', () => {
    const onTogglePlay = vi.fn();
    const onNext = vi.fn();
    const onPrevious = vi.fn();
    const onSeek = vi.fn();
    const transportScene: WorkshopActiveLyricsScene = {
      ...activeScene,
      scene: {
        schemaVersion: 1,
        background: 'theme',
        hostChrome: { miniPlayer: 'hidden' },
        root: {
          id: 'root',
          type: 'group',
          children: [
            { id: 'seek', type: 'slot', slot: 'seek-bar' },
            { id: 'play', type: 'slot', slot: 'play-toggle' },
            { id: 'prev', type: 'slot', slot: 'previous-track' },
            { id: 'next', type: 'slot', slot: 'next-track' },
          ],
        },
      },
    };
    const { container } = render(
      <WorkshopLyricsSceneRenderer
        activeScene={transportScene}
        title="Track title"
        artist="Artist"
        album="Album"
        coverUrl={null}
        lyrics={lyrics}
        durationMs={10_000}
        positionMs={2_500}
        playbackRate={1}
        playbackState="playing"
        positionUpdatedAtMs={0}
        isPlaying
        spectrumBands={[0.2, 0.4, 0.6, 0.8]}
        defaultShowRomanization={false}
        defaultShowTranslation
        defaultWordHighlightEnabled
        highFrequencyUpdatesEnabled={false}
        motionEnabled
        seekEnabled
        seekTimelineOffsetMs={0}
        timelineSeekEnabled
        canGoNext
        canGoPrevious={false}
        onSeek={onSeek}
        onTogglePlay={onTogglePlay}
        onNext={onNext}
        onPrevious={onPrevious}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText('Pause'));
    fireEvent.click(screen.getByLabelText('Next track'));
    expect(onTogglePlay).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText<HTMLButtonElement>('Previous track').disabled).toBe(true);

    const seekBar = container.querySelector<HTMLElement>('.workshop-lyrics-scene__seek-bar');
    expect(seekBar?.dataset.interactive).toBe('true');
    seekBar!.getBoundingClientRect = () => ({ left: 0, width: 200, top: 0, height: 2, right: 200, bottom: 2, x: 0, y: 0, toJSON: () => ({}) });
    seekBar!.setPointerCapture = () => undefined;
    fireEvent.pointerDown(seekBar!, { button: 0, pointerId: 1, clientX: 0 });
    fireEvent.pointerUp(seekBar!, { pointerId: 1, clientX: 50 });
    expect(onSeek).toHaveBeenCalledWith(2_500);
  });

  it('renders track tech facts and routes the volume slider to the host', () => {
    const onVolumeChange = vi.fn();
    const infoScene: WorkshopActiveLyricsScene = {
      ...activeScene,
      scene: {
        schemaVersion: 1,
        background: 'theme',
        root: {
          id: 'root',
          type: 'group',
          children: [
            { id: 'tech', type: 'slot', slot: 'track-tech' },
            { id: 'volume', type: 'slot', slot: 'volume-slider' },
          ],
        },
      },
    };
    const { container } = render(
      <WorkshopLyricsSceneRenderer
        activeScene={infoScene}
        title="Track title"
        artist="Artist"
        album="Album"
        coverUrl={null}
        lyrics={lyrics}
        durationMs={10_000}
        positionMs={2_500}
        playbackRate={1}
        playbackState="playing"
        positionUpdatedAtMs={0}
        isPlaying
        spectrumBands={[]}
        defaultShowRomanization={false}
        defaultShowTranslation
        defaultWordHighlightEnabled
        highFrequencyUpdatesEnabled={false}
        motionEnabled
        seekEnabled
        seekTimelineOffsetMs={0}
        {...transportProps}
        trackTech={{ codec: 'flac', sampleRateHz: 44_100, bitDepth: 16, bitrateKbps: 1_053, bpm: 144.4 }}
        volume={0.6}
        volumeInteractive
        onVolumeChange={onVolumeChange}
        onSeek={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    const techItems = Array.from(container.querySelectorAll('.workshop-lyrics-scene__tech-item')).map((node) => node.textContent);
    expect(techItems).toEqual(['FLAC', '16-BIT', '44.1 KHZ', '1053 KBPS', '144 BPM']);

    const volumeBar = screen.getByLabelText<HTMLElement>('Volume');
    expect(volumeBar.dataset.interactive).toBe('true');
    expect(volumeBar.getAttribute('aria-valuenow')).toBe('60');
    volumeBar.getBoundingClientRect = () => ({ left: 0, width: 100, top: 0, height: 2, right: 100, bottom: 2, x: 0, y: 0, toJSON: () => ({}) });
    volumeBar.setPointerCapture = () => undefined;
    fireEvent.pointerDown(volumeBar, { button: 0, pointerId: 1, clientX: 0 });
    fireEvent.pointerUp(volumeBar, { pointerId: 1, clientX: 25 });
    expect(onVolumeChange).toHaveBeenCalledWith(0.25);

    fireEvent.keyDown(volumeBar, { key: 'ArrowRight' });
    expect(onVolumeChange).toHaveBeenLastCalledWith(expect.closeTo(0.65, 5));
  });

  it('renders packaged image nodes only from echo-workshop protocol URLs', () => {
    const { container } = render(
      <WorkshopLyricsSceneRenderer
        activeScene={{
          ...activeScene,
          scene: {
            schemaVersion: 1,
            background: 'asset',
            backgroundSrc: 'echo-workshop://asset/?source=steam&item=456&path=art%2Fpanel.png',
            root: {
              id: 'root',
              type: 'group',
              children: [
                {
                  id: 'safe',
                  type: 'image',
                  asset: 'art/badge.png',
                  src: 'echo-workshop://asset/?source=steam&item=456&path=art%2Fbadge.png',
                },
                {
                  id: 'unsafe',
                  type: 'image',
                  asset: 'art/badge.png',
                  src: 'file:///C:/private/badge.png',
                },
              ],
            },
          },
        }}
        title="Track title"
        artist="Artist"
        album="Album"
        coverUrl={null}
        lyrics={lyrics}
        durationMs={10_000}
        positionMs={2_500}
        playbackRate={1}
        playbackState="playing"
        positionUpdatedAtMs={0}
        isPlaying
        spectrumBands={[0.2, 0.4, 0.6, 0.8]}
        defaultShowRomanization={false}
        defaultShowTranslation
        defaultWordHighlightEnabled
        highFrequencyUpdatesEnabled={false}
        motionEnabled
        seekEnabled
        seekTimelineOffsetMs={0}
        {...transportProps}
        onSeek={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(container.querySelector('[data-background="asset"] img.workshop-lyrics-scene__background')?.getAttribute('src'))
      .toBe('echo-workshop://asset/?source=steam&item=456&path=art%2Fpanel.png');
    expect(container.querySelector('[data-node-id="safe"] img')?.getAttribute('src'))
      .toBe('echo-workshop://asset/?source=steam&item=456&path=art%2Fbadge.png');
    expect(container.querySelector('[data-node-id="unsafe"]')).toBeNull();
    expect(container.querySelector('img[src="file:///C:/private/badge.png"]')).toBeNull();
  });
});
