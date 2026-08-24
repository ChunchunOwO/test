// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { AudioStatus } from '../../shared/types/audio';
import type { PlaybackStatus } from '../../shared/types/playback';
import {
  setPlaybackStatusSnapshot,
  useSharedAudioPlaybackState,
  useSharedPlaybackActivityState,
  useSharedPlaybackStatusForChrome,
  useSharedPlaybackStatusForUi,
  useSharedPlaybackStatusOnly,
} from './playbackStatusStore';

const playbackStatus = (overrides: Partial<PlaybackStatus> = {}): PlaybackStatus => ({
  state: 'playing',
  currentTrackId: 'track-1',
  filePath: 'D:\\Music\\track-1.flac',
  positionMs: 0,
  durationMs: 180_000,
  ...overrides,
});

const audioStatus = (overrides: Partial<AudioStatus> = {}): AudioStatus => ({
  state: 'playing',
  currentTrackId: 'track-1',
  currentFilePath: 'D:\\Music\\track-1.flac',
  positionSeconds: 0,
  ...overrides,
} as AudioStatus);

afterEach(() => {
  cleanup();
  setPlaybackStatusSnapshot({
    audioStatus: null,
    playbackStatus: null,
    playbackVisualIntent: null,
    error: null,
  });
});

describe('playbackStatusStore narrow subscriptions', () => {
  it('does not rerender a PlaybackStatus-only subscriber for audio-only updates', () => {
    let renders = 0;
    const Probe = (): JSX.Element => {
      renders += 1;
      const status = useSharedPlaybackStatusOnly();
      return <output>{status?.positionMs ?? ''}</output>;
    };

    render(<Probe />);
    act(() => setPlaybackStatusSnapshot({ playbackStatus: playbackStatus() }));
    const rendersAfterPlaybackStatus = renders;

    act(() => setPlaybackStatusSnapshot({ audioStatus: audioStatus({ positionSeconds: 12.5 }) }));
    expect(renders).toBe(rendersAfterPlaybackStatus);

    act(() => setPlaybackStatusSnapshot({ playbackStatus: playbackStatus({ positionMs: 12_500 }) }));
    expect(renders).toBe(rendersAfterPlaybackStatus + 1);
  });

  it('keeps playback-state subscribers stable for position-only updates', () => {
    let activityRenders = 0;
    let audioRenders = 0;
    const Probe = (): JSX.Element => {
      activityRenders += 1;
      const activityState = useSharedPlaybackActivityState();
      audioRenders += 1;
      const audioState = useSharedAudioPlaybackState();
      return <output>{`${activityState}:${audioState ?? 'none'}`}</output>;
    };

    render(<Probe />);
    act(() => setPlaybackStatusSnapshot({ audioStatus: audioStatus({ positionSeconds: 1 }) }));
    const activityRendersAfterState = activityRenders;
    const audioRendersAfterState = audioRenders;

    act(() => setPlaybackStatusSnapshot({ audioStatus: audioStatus({ positionSeconds: 2 }) }));
    expect(activityRenders).toBe(activityRendersAfterState);
    expect(audioRenders).toBe(audioRendersAfterState);

    act(() => setPlaybackStatusSnapshot({ audioStatus: audioStatus({ state: 'paused', positionSeconds: 2 }) }));
    expect(activityRenders).toBe(activityRendersAfterState + 1);
    expect(audioRenders).toBe(audioRendersAfterState + 1);
  });

  it('does not rerender UI subscribers for spectrum or level-only updates', () => {
    let renders = 0;
    const Probe = (): JSX.Element => {
      renders += 1;
      const status = useSharedPlaybackStatusForUi();
      return <output>{status.audioStatus?.state ?? 'none'}</output>;
    };

    render(<Probe />);
    expect(screen.getByRole('status').textContent).toBe('none');
    const rendersBeforeStatus = renders;
    act(() => setPlaybackStatusSnapshot({
      audioStatus: audioStatus({
        positionSeconds: 8,
        audioLevels: {
          inputPeakDb: -12,
          inputRmsDb: -18,
          estimatedOutputPeakDb: -10,
          estimatedOutputRmsDb: -16,
          visualSpectrum: [0.1, 0.2, 0.3],
          headroomDb: 10,
          clipCount: 0,
          lastClipAt: null,
          meterSource: 'native_post_dsp',
        },
      }),
    }));
    expect(renders).toBeGreaterThan(rendersBeforeStatus);
    expect(screen.getByRole('status').textContent).toBe('playing');
    const rendersAfterStatus = renders;

    act(() => setPlaybackStatusSnapshot({
      audioStatus: audioStatus({
        positionSeconds: 8,
        audioLevels: {
          inputPeakDb: -6,
          inputRmsDb: -12,
          estimatedOutputPeakDb: -4,
          estimatedOutputRmsDb: -10,
          visualSpectrum: [0.8, 0.7, 0.9],
          headroomDb: 4,
          clipCount: 0,
          lastClipAt: null,
          meterSource: 'native_post_dsp',
        },
      }),
    }));
    expect(renders).toBe(rendersAfterStatus);

    act(() => setPlaybackStatusSnapshot({
      audioStatus: audioStatus({
        positionSeconds: 8.4,
        audioLevels: {
          inputPeakDb: -6,
          inputRmsDb: -12,
          estimatedOutputPeakDb: -4,
          estimatedOutputRmsDb: -10,
          visualSpectrum: [0.2, 0.1, 0.3],
          headroomDb: 4,
          clipCount: 0,
          lastClipAt: null,
          meterSource: 'native_post_dsp',
        },
      }),
    }));
    expect(renders).toBe(rendersAfterStatus + 1);
  });

  it('rerenders UI subscribers when an audio error appears', () => {
    let renders = 0;
    const Probe = (): JSX.Element => {
      renders += 1;
      const status = useSharedPlaybackStatusForUi();
      return <output>{status.audioStatus?.error ?? status.error ?? 'none'}</output>;
    };

    render(<Probe />);
    act(() => setPlaybackStatusSnapshot({
      audioStatus: audioStatus({ state: 'playing' }),
      error: null,
    }));
    expect(screen.getByRole('status').textContent).toBe('none');
    const rendersAfterPlaying = renders;

    act(() => setPlaybackStatusSnapshot({
      audioStatus: audioStatus({ state: 'error', error: 'host failed' }),
      error: 'host failed',
    }));
    expect(renders).toBe(rendersAfterPlaying + 1);
    expect(screen.getByRole('status').textContent).toBe('host failed');
  });

  it('does not rerender chrome subscribers for position-only updates', () => {
    let renders = 0;
    const Probe = (): JSX.Element => {
      renders += 1;
      const status = useSharedPlaybackStatusForChrome();
      return <output>{status.audioStatus?.state ?? 'none'}</output>;
    };

    render(<Probe />);
    expect(screen.getByRole('status').textContent).toBe('none');
    const rendersBeforeState = renders;
    act(() => setPlaybackStatusSnapshot({ audioStatus: audioStatus({ positionSeconds: 4 }) }));
    expect(renders).toBeGreaterThan(rendersBeforeState);
    expect(screen.getByRole('status').textContent).toBe('playing');
    const rendersAfterState = renders;

    act(() => setPlaybackStatusSnapshot({ audioStatus: audioStatus({ positionSeconds: 12 }) }));
    expect(renders).toBe(rendersAfterState);

    act(() => setPlaybackStatusSnapshot({ audioStatus: audioStatus({ state: 'paused', positionSeconds: 12 }) }));
    expect(renders).toBe(rendersAfterState + 1);
    expect(screen.getByRole('status').textContent).toBe('paused');
  });
});
