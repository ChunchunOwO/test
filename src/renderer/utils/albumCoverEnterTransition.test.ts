// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  beginAlbumCoverEnter,
  cancelAlbumCoverEnter,
  completeAlbumCoverEnter,
  dismissAlbumCoverEnterLayer,
  findAlbumCoverEnterElement,
  hasPendingAlbumCoverEnter,
} from './albumCoverEnterTransition';

const rect = (left: number, top: number, width: number, height: number): DOMRect => ({
  x: left,
  y: top,
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
  toJSON: () => ({}),
});

const mockCoverRect = (element: HTMLElement, box: DOMRect): void => {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(box);
};

const createAlbumCard = (): { card: HTMLElement; cover: HTMLElement } => {
  const card = document.createElement('article');
  card.className = 'album-card';
  const cover = document.createElement('div');
  cover.className = 'album-cover';
  const image = document.createElement('img');
  image.src = 'echo-cover://album/cover-1';
  cover.appendChild(image);
  card.appendChild(cover);
  document.body.appendChild(card);
  mockCoverRect(cover, rect(40, 120, 164, 164));
  return { card, cover };
};

describe('albumCoverEnterTransition', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
  });

  afterEach(() => {
    cancelAlbumCoverEnter();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('finds the cover inside an album card click target', () => {
    const { card, cover } = createAlbumCard();
    expect(findAlbumCoverEnterElement(card)).toBe(cover);
    expect(findAlbumCoverEnterElement(cover)).toBe(cover);
  });

  it('skips motion when the cover has no layout box', () => {
    const { card, cover } = createAlbumCard();
    mockCoverRect(cover, rect(0, 0, 0, 0));

    expect(beginAlbumCoverEnter(card)).toBe(false);
    expect(hasPendingAlbumCoverEnter()).toBe(false);
    expect(document.querySelector('.album-cover-enter-layer')).toBeNull();
  });

  it('skips motion when reduced motion is requested', () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
    const { card } = createAlbumCard();

    expect(beginAlbumCoverEnter(card)).toBe(false);
    expect(document.querySelector('.album-cover-enter-layer')).toBeNull();
  });

  it('lifts a flying cover clone and lands it on the detail artwork', async () => {
    vi.useFakeTimers();
    const { card, cover } = createAlbumCard();
    const destination = document.createElement('div');
    destination.className = 'album-detail-cover';
    const destinationImage = document.createElement('img');
    destinationImage.src = 'echo-cover://large/cover-1';
    Object.defineProperty(destinationImage, 'complete', { value: true });
    destination.appendChild(destinationImage);
    document.body.appendChild(destination);
    mockCoverRect(destination, rect(82, 64, 320, 320));

    expect(beginAlbumCoverEnter(card)).toBe(true);
    expect(hasPendingAlbumCoverEnter()).toBe(true);
    const clone = document.querySelector('.album-cover-enter-clone') as HTMLElement;
    expect(clone).toBeTruthy();
    expect(clone.querySelector('img')?.getAttribute('src')).toBe(cover.querySelector('img')?.src);
    expect(clone.style.width).toBe('164px');

    const onDone = vi.fn();
    completeAlbumCoverEnter(destination, onDone);
    expect(hasPendingAlbumCoverEnter()).toBe(true);

    await vi.advanceTimersByTimeAsync(16);
    expect(clone.isConnected).toBe(true);

    await vi.advanceTimersByTimeAsync(700);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(hasPendingAlbumCoverEnter()).toBe(false);
    expect(document.querySelector('.album-cover-enter-layer')).toBeTruthy();

    dismissAlbumCoverEnterLayer();
    expect(document.querySelector('.album-cover-enter-layer')).toBeNull();
    vi.useRealTimers();
  });
});

describe('album cover enter styles', () => {
  it('keeps the flying cover and detail fade companion in dedicated styles', () => {
    const overlay = readFileSync('src/renderer/styles/album-cover-enter.css', 'utf8');
    const detail = readFileSync('src/renderer/styles/album-detail.css', 'utf8');

    expect(overlay).toContain('.album-cover-enter-clone');
    expect(overlay).toContain('@media (prefers-reduced-motion: reduce)');
    expect(detail).toContain('.album-detail-page--cover-enter');
    expect(detail).toContain('.album-detail-page--cover-entered');
    expect(detail).toContain('album-detail-cover-enter-fade');
    expect(detail).toContain('.album-detail-page--cover-entered .album-detail-switch-surface');
    expect(detail).toContain('album-wall-return-in');
    expect(detail).toMatch(/@keyframes detail-page-enter \{[\s\S]*?from \{[\s\S]*?opacity: 0;/);
    expect(detail).not.toContain('translateX(18px)');
    expect(detail).not.toContain('translateX(10px)');
    expect(detail).not.toContain('scale(0.992)');
  });
});
