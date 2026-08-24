/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { sampleDetachedImage } from './detachedImageSampling';

type FakeImageRecord = {
  onerror: (() => void) | null;
  onload: (() => void) | null;
  removedAttributes: string[];
};

describe('sampleDetachedImage', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const installFakeImage = (): FakeImageRecord[] => {
    const images: FakeImageRecord[] = [];

    class FakeImage {
      complete = false;
      crossOrigin = '';
      decoding = '';
      naturalHeight = 96;
      naturalWidth = 96;
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      removedAttributes: string[] = [];

      constructor() {
        images.push(this);
      }

      removeAttribute(name: string): void {
        this.removedAttributes.push(name);
      }

      set src(_value: string) {}
    }

    vi.stubGlobal('Image', FakeImage);
    return images;
  };

  it('releases the backing image after a successful synchronous sample', async () => {
    const images = installFakeImage();
    const task = sampleDetachedImage('echo-cover://thumb/cover-1', () => 'sampled');

    images[0].onload?.();

    await expect(task.promise).resolves.toBe('sampled');
    expect(images[0].onload).toBeNull();
    expect(images[0].onerror).toBeNull();
    expect(images[0].removedAttributes).toEqual(['src']);
  });

  it('releases and resolves a stalled image after the bounded timeout', async () => {
    vi.useFakeTimers();
    const images = installFakeImage();
    const task = sampleDetachedImage('echo-cover://thumb/stalled', () => 'unreachable', { timeoutMs: 25 });

    await vi.advanceTimersByTimeAsync(25);

    await expect(task.promise).resolves.toBeNull();
    expect(images[0].onload).toBeNull();
    expect(images[0].onerror).toBeNull();
    expect(images[0].removedAttributes).toEqual(['src']);
  });

  it('releases immediately when the owning view cancels sampling', async () => {
    const images = installFakeImage();
    const task = sampleDetachedImage('echo-cover://thumb/old-cover', () => 'unreachable');

    task.cancel();

    await expect(task.promise).resolves.toBeNull();
    expect(images[0].removedAttributes).toEqual(['src']);
  });
});
