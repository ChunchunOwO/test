// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  analyzeCoverPixels,
  readCoverIntelligenceEnabled,
  tryAnalyzeCoverImage,
  writeCoverIntelligenceEnabled,
} from './coverIntelligence';

const solidPixels = (colors: Array<[number, number, number, number]>): Uint8ClampedArray => {
  const pixels = new Uint8ClampedArray(colors.length * 4);
  colors.forEach(([r, g, b, a], index) => {
    pixels[index * 4] = r;
    pixels[index * 4 + 1] = g;
    pixels[index * 4 + 2] = b;
    pixels[index * 4 + 3] = a;
  });
  return pixels;
};

class PendingCoverImage {
  static instances: PendingCoverImage[] = [];

  crossOrigin = '';
  decoding = '';
  naturalHeight = 0;
  naturalWidth = 0;
  onerror: ((event: Event) => void) | null = null;
  onload: ((event: Event) => void) | null = null;
  src = '';
  readonly removeAttribute = vi.fn((name: string) => {
    if (name === 'src') {
      this.src = '';
    }
  });

  constructor() {
    PendingCoverImage.instances.push(this);
  }
}

afterEach(() => {
  PendingCoverImage.instances = [];
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('coverIntelligence', () => {
  it('keeps the feature disabled by default and persists opt-in locally', () => {
    window.localStorage.clear();

    expect(readCoverIntelligenceEnabled()).toBe(false);
    writeCoverIntelligenceEnabled(true);
    expect(readCoverIntelligenceEnabled()).toBe(true);
    writeCoverIntelligenceEnabled(false);
    expect(readCoverIntelligenceEnabled()).toBe(false);
  });

  it('classifies blue-heavy artwork as a cool palette', () => {
    const result = analyzeCoverPixels(
      solidPixels([
        [30, 70, 210, 255],
        [20, 130, 190, 255],
        [42, 92, 160, 255],
        [230, 236, 250, 255],
      ]),
      2,
      2,
      'cool',
      '2026-06-14T00:00:00.000Z',
    );

    expect(result?.temperature).toBe('cool');
    expect(result?.moodLabels).toContain('cool');
    expect(result?.dominantColor.hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('classifies orange-heavy artwork as a warm palette', () => {
    const result = analyzeCoverPixels(
      solidPixels([
        [230, 82, 26, 255],
        [210, 130, 36, 255],
        [170, 78, 28, 255],
        [250, 210, 150, 255],
      ]),
      2,
      2,
      'warm',
      '2026-06-14T00:00:00.000Z',
    );

    expect(result?.temperature).toBe('warm');
    expect(result?.moodLabels).toContain('warm');
  });

  it('releases the image and abort listener when cover loading times out', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Image', PendingCoverImage as unknown as typeof Image);
    const controller = new AbortController();
    const removeEventListener = vi.spyOn(controller.signal, 'removeEventListener');

    const result = tryAnalyzeCoverImage('echo-cover://large/timeout', 'timeout-cover', {
      signal: controller.signal,
      timeoutMs: 10,
    });
    await vi.advanceTimersByTimeAsync(10);

    await expect(result).resolves.toBeNull();
    const image = PendingCoverImage.instances[0];
    expect(image.onload).toBeNull();
    expect(image.onerror).toBeNull();
    expect(image.removeAttribute).toHaveBeenCalledWith('src');
    expect(removeEventListener).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('does not start an image request when cover analysis is already aborted', async () => {
    vi.stubGlobal('Image', PendingCoverImage as unknown as typeof Image);
    const controller = new AbortController();
    controller.abort();

    await expect(tryAnalyzeCoverImage('echo-cover://large/aborted', 'aborted-cover', {
      signal: controller.signal,
    })).resolves.toBeNull();

    const image = PendingCoverImage.instances[0];
    expect(image.src).toBe('');
    expect(image.removeAttribute).toHaveBeenCalledWith('src');
  });
});
