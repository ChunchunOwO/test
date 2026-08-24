/** @vitest-environment jsdom */

import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LyricsCoverStageArtwork } from './LyricsCoverStageArtwork';

describe('LyricsCoverStageArtwork', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the large cover for the visible image and uses the album variant for effects', () => {
    const { container } = render(
      <LyricsCoverStageArtwork artworkUrl="echo-cover://large/cover-1" isActive />,
    );

    expect(container.querySelector<HTMLImageElement>('.lyrics-cover-stage-image')?.getAttribute('src')).toBe(
      'echo-cover://large/cover-1',
    );
    expect(container.querySelector<HTMLImageElement>('.lyrics-cover-stage-color-field')?.getAttribute('src')).toBe(
      'echo-cover://album/cover-1',
    );
    expect(container.querySelector<HTMLImageElement>('.lyrics-cover-stage-bridge')?.getAttribute('src')).toBe(
      'echo-cover://album/cover-1',
    );
  });

  it('releases GPU artwork after the retained route is hidden, outside the route-switch commit', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(
      <LyricsCoverStageArtwork artworkUrl="echo-cover://large/cover-1" isActive />,
    );

    rerender(<LyricsCoverStageArtwork artworkUrl="echo-cover://large/cover-1" isActive={false} />);
    expect(container.querySelector('.lyrics-cover-stage-artwork')).toBeTruthy();

    act(() => vi.advanceTimersByTime(120));
    expect(container.querySelector('.lyrics-cover-stage-artwork')).toBeNull();
  });
});
