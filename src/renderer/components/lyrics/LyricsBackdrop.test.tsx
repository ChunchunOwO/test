/** @vitest-environment jsdom */

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LyricsBackdrop } from './LyricsBackdrop';

describe('LyricsBackdrop', () => {
  it('renders one eager high-resolution cover surface without a filtered duplicate', () => {
    const { container } = render(
      <LyricsBackdrop coverUrl="echo-cover://large/cover-1" showCover />,
    );

    const covers = container.querySelectorAll<HTMLImageElement>('.lyrics-backdrop-cover');
    expect(covers).toHaveLength(1);
    expect(covers[0]?.getAttribute('src')).toBe('echo-cover://large/cover-1');
    expect(covers[0]?.getAttribute('decoding')).toBe('async');
    expect(container.querySelector('.lyrics-backdrop-source')?.getAttribute('data-source')).toBe('cover');
    expect(container.querySelector('.lyrics-backdrop-atmosphere')).toBeTruthy();
  });

  it('does not retain a cover image when the selected background does not use one', () => {
    const { container } = render(
      <LyricsBackdrop coverUrl="echo-cover://large/cover-1" showCover={false} />,
    );

    expect(container.querySelector('.lyrics-backdrop-cover')).toBeNull();
  });

  it('releases the backdrop while its retained route is hidden', () => {
    const { container, rerender } = render(
      <LyricsBackdrop coverUrl="echo-cover://large/cover-1" isActive showCover />,
    );

    expect(container.querySelector('.lyrics-backdrop')).toBeTruthy();
    rerender(<LyricsBackdrop coverUrl="echo-cover://large/cover-1" isActive={false} showCover />);
    expect(container.querySelector('.lyrics-backdrop')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders a dedicated media surface for explicit cover color and wallpaper sources', () => {
    const { container, rerender } = render(
      <LyricsBackdrop backgroundMode="coverColor" coverUrl={null} showCover={false} />,
    );

    expect(container.querySelector('.lyrics-backdrop-source')?.getAttribute('data-source')).toBe('coverColor');
    expect(container.querySelector('.lyrics-backdrop-source-media')).toBeTruthy();

    rerender(<LyricsBackdrop backgroundMode="customWallpaper" coverUrl={null} showCover={false} />);
    expect(container.querySelector('.lyrics-backdrop-source')?.getAttribute('data-source')).toBe('customWallpaper');
    expect(container.querySelector('.lyrics-backdrop-source-media')).toBeTruthy();
  });
});
