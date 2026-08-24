const defaultDetachedImageTimeoutMs = 8_000;

export type DetachedImageSamplingTask<T> = {
  cancel: () => void;
  promise: Promise<T | null>;
};

type DetachedImageSamplingOptions = {
  crossOrigin?: '' | 'anonymous' | 'use-credentials';
  timeoutMs?: number;
};

/**
 * Loads an image outside the DOM for a short, synchronous sampling pass.
 * The backing image is always detached after success, failure, timeout, or cancellation.
 */
export const sampleDetachedImage = <T>(
  url: string,
  sample: (image: HTMLImageElement) => T,
  options: DetachedImageSamplingOptions = {},
): DetachedImageSamplingTask<T> => {
  if (typeof Image === 'undefined') {
    return {
      cancel: () => undefined,
      promise: Promise.resolve(null),
    };
  }

  const image = new Image();
  const timeoutMs = Math.max(1, options.timeoutMs ?? defaultDetachedImageTimeoutMs);
  let settled = false;
  let resolvePromise: (value: T | null) => void = () => undefined;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const releaseImage = (): void => {
    image.onload = null;
    image.onerror = null;
    if (typeof image.removeAttribute === 'function') {
      image.removeAttribute('src');
    }
  };

  const finish = (value: T | null): void => {
    if (settled) {
      return;
    }
    settled = true;
    if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
    try {
      releaseImage();
    } finally {
      resolvePromise(value);
    }
  };

  const readSample = (): void => {
    if (settled) {
      return;
    }
    try {
      finish(sample(image));
    } catch {
      finish(null);
    }
  };

  const promise = new Promise<T | null>((resolve) => {
    resolvePromise = resolve;
  });

  image.decoding = 'async';
  if (options.crossOrigin !== undefined) {
    image.crossOrigin = options.crossOrigin;
  }
  image.onload = readSample;
  image.onerror = () => finish(null);
  timeoutHandle = setTimeout(() => finish(null), timeoutMs);
  image.src = url;

  if (image.complete && image.naturalWidth > 0) {
    queueMicrotask(readSample);
  }

  return {
    cancel: () => finish(null),
    promise,
  };
};
