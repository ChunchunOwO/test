// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RouteActivityProvider } from './RouteActivityContext';
import { DeferredWallImage } from './DeferredWallImage';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DeferredWallImage route activity', () => {
  it('releases its image while the retained route is hidden and reloads when restored', async () => {
    const renderImage = (isActive: boolean): JSX.Element => (
      <RouteActivityProvider isActive={isActive}>
        <DeferredWallImage alt="" priority src="echo-cover://album/retained-route" />
      </RouteActivityProvider>
    );
    const { container, rerender } = render(renderImage(true));

    await waitFor(() => {
      expect(container.querySelector('img')?.getAttribute('src')).toBe('echo-cover://album/retained-route');
    });

    rerender(renderImage(false));
    expect(container.querySelector('img')).toBeNull();

    rerender(renderImage(true));
    await waitFor(() => {
      expect(container.querySelector('img')?.getAttribute('src')).toBe('echo-cover://album/retained-route');
    });
  });

  it('does not burst-reload previously visible non-priority images when the route returns', async () => {
    const observers: Array<{
      callback: IntersectionObserverCallback;
      options?: IntersectionObserverInit;
    }> = [];
    class FakeIntersectionObserver {
      readonly disconnect = vi.fn();
      readonly observe = vi.fn();
      readonly unobserve = vi.fn();
      readonly takeRecords = vi.fn(() => []);

      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        observers.push({ callback, options });
      }
    }
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);

    const renderImage = (isActive: boolean): JSX.Element => (
      <RouteActivityProvider isActive={isActive}>
        <DeferredWallImage alt="" src="echo-cover://album/previously-visible" />
      </RouteActivityProvider>
    );
    const { container, rerender } = render(renderImage(true));
    const nearViewportObserver = observers.find((observer) => observer.options?.rootMargin === '720px 0px');
    await act(async () => {
      nearViewportObserver?.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        nearViewportObserver as unknown as IntersectionObserver,
      );
    });
    await waitFor(() => expect(container.querySelector('img')).toBeTruthy());

    rerender(renderImage(false));
    expect(container.querySelector('img')).toBeNull();
    rerender(renderImage(true));

    expect(container.querySelector('img')).toBeNull();
  });
});
