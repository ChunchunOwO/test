// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContributorsPage } from './ContributorsPage';
import { contributorIds } from './contributors';
import { githubContributorIds } from './contributors.github.generated';

describe('ContributorsPage', () => {
  it('renders display-only contributor IDs and returns to About', () => {
    const onBack = vi.fn();
    const { container } = render(<ContributorsPage locale="zh-CN" onBack={onBack} />);

    expect(screen.getByRole('heading', { name: '贡献者' })).toBeTruthy();
    expect(screen.getByText(`${contributorIds.length} 位贡献者`)).toBeTruthy();
    expect(screen.getByText('Esc')).toBeTruthy();
    expect(container.querySelector('.contributors-space-backdrop')?.getAttribute('src')).toContain('contributors-deep-space.png');
    expect(container.querySelectorAll('.contributors-grid li')).toHaveLength(contributorIds.length);
    expect(container.querySelectorAll('[data-constellation-edge]').length).toBeGreaterThanOrEqual(contributorIds.length - 1);
    for (const id of contributorIds) {
      expect(screen.getByText(id)).toBeTruthy();
    }
    expect(screen.queryByText('uright008')).toBeNull();
    expect(githubContributorIds).toContain('zpf2234');
    expect(screen.queryByRole('link')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '返回关于' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('keeps contributor IDs unique and ASCII-only', () => {
    expect(new Set(contributorIds).size).toBe(contributorIds.length);
    expect(contributorIds.every((id) => /^[\x20-\x7E]+$/.test(id))).toBe(true);
    expect(contributorIds.map((id) => id.toLocaleLowerCase('en-US'))).not.toContain('uright008');
  });

  it('supports dragging the constellation from the full-screen page surface', () => {
    const { container } = render(<ContributorsPage locale="zh-CN" onBack={vi.fn()} />);
    const page = container.querySelector<HTMLElement>('.contributors-page');
    const viewport = container.querySelector<HTMLElement>('.contributors-viewport');
    expect(page).toBeTruthy();
    expect(viewport).toBeTruthy();
    if (!page || !viewport) return;

    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 600 },
      clientWidth: { configurable: true, value: 900 },
      scrollHeight: { configurable: true, value: 800 },
      scrollLeft: { configurable: true, value: 0, writable: true },
      scrollTop: { configurable: true, value: 0, writable: true },
      scrollWidth: { configurable: true, value: 1400 },
    });
    fireEvent(window, new Event('resize'));

    fireEvent.pointerDown(page, { button: 0, clientX: 320, clientY: 260, pointerId: 7 });
    fireEvent.pointerMove(page, { clientX: 210, clientY: 180, pointerId: 7 });
    expect(viewport.scrollLeft).toBe(110);
    expect(viewport.scrollTop).toBe(80);
    expect(page.getAttribute('data-dragging')).toBe('true');

    fireEvent.pointerUp(page, { pointerId: 7 });
    expect(page.getAttribute('data-dragging')).toBe('false');
  });
});

