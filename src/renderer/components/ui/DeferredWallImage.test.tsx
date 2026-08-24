// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { DeferredWallImage } from './DeferredWallImage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('DeferredWallImage', () => {
  it('loads priority images immediately even when scrolling is active', () => {
    const { container } = render(<DeferredWallImage alt="" decoding="async" paused priority src="echo-cover://album/priority" />);

    expect((container.querySelector('img') as HTMLImageElement | null)?.getAttribute('src')).toBe('echo-cover://album/priority');
  });

  it('waits for scroll idle before starting non-priority images', async () => {
    const { container, rerender } = render(<DeferredWallImage alt="" paused src="echo-cover://album/deferred" />);

    expect(container.querySelector('img')).toBeNull();

    rerender(<DeferredWallImage alt="" paused={false} src="echo-cover://album/deferred" />);

    await waitFor(() => {
      expect((container.querySelector('img') as HTMLImageElement | null)?.getAttribute('src')).toBe('echo-cover://album/deferred');
    });
  });

  it('limits concurrent non-priority image starts', async () => {
    const { container } = render(
      <>
        {Array.from({ length: 12 }, (_, index) => (
          <DeferredWallImage alt="" key={index} src={`echo-cover://album/${index}`} />
        ))}
      </>,
    );

    await waitFor(() => {
      expect(container.querySelectorAll('img')).toHaveLength(6);
    });
  });

  it('limits concurrent non-priority image starts further in lightweight mode', async () => {
    const shell = document.createElement('div');
    shell.className = 'app-shell';
    shell.setAttribute('data-low-spec-mode', 'true');
    document.body.appendChild(shell);

    try {
      const { container } = render(
        <>
          {Array.from({ length: 12 }, (_, index) => (
            <DeferredWallImage alt="" key={`low-spec-${index}`} src={`echo-cover://album/low-spec-${index}`} />
          ))}
        </>,
      );

      await waitFor(() => {
        expect(container.querySelectorAll('img')).toHaveLength(2);
      });
    } finally {
      shell.remove();
    }
  });

  it('releases slow image slots so jumped-to rows can start loading', async () => {
    vi.useFakeTimers();
    const { container } = render(
      <>
        {Array.from({ length: 12 }, (_, index) => (
          <DeferredWallImage alt="" key={index} src={`echo-cover://album/${index}`} />
        ))}
      </>,
    );

    expect(container.querySelectorAll('img')).toHaveLength(6);

    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });

    expect(container.querySelectorAll('img')).toHaveLength(12);
  });

  it('does not start newly visible images until scrolling stops', async () => {
    const observers: Array<{
      callback: IntersectionObserverCallback;
      options?: IntersectionObserverInit;
      disconnect: ReturnType<typeof vi.fn>;
      observe: ReturnType<typeof vi.fn>;
    }> = [];
    class FakeIntersectionObserver {
      readonly disconnect = vi.fn();
      readonly observe = vi.fn();
      readonly unobserve = vi.fn();
      readonly takeRecords = vi.fn(() => []);

      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        observers.push({ callback, options, disconnect: this.disconnect, observe: this.observe });
      }
    }
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);

    const { container, rerender } = render(
      <>
        {Array.from({ length: 12 }, (_, index) => (
          <DeferredWallImage alt="" key={index} paused src={`echo-cover://album/${index}`} />
        ))}
      </>,
    );

    expect(container.querySelectorAll('img')).toHaveLength(0);

    await act(async () => {
      observers
        .filter((observer) => observer.options?.rootMargin === '0px')
        .forEach((observer) =>
          observer.callback(
            [{ isIntersecting: true } as IntersectionObserverEntry],
            observer as unknown as IntersectionObserver,
          ),
        );
    });

    expect(container.querySelectorAll('img')).toHaveLength(0);

    rerender(
      <>
        {Array.from({ length: 12 }, (_, index) => (
          <DeferredWallImage alt="" key={index} paused={false} src={`echo-cover://album/${index}`} />
        ))}
      </>,
    );

    await waitFor(() => {
      expect(container.querySelectorAll('img')).toHaveLength(6);
    });
  });
});
