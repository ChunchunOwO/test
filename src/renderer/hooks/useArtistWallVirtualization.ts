import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { VirtualItem } from '@tanstack/react-virtual';
import { getPageScrollContainer } from '../components/ui/InfiniteScrollSentinel';

const virtualOverscanRows = 3;
const virtualFallbackRows = 4;
const virtualLoadAheadRows = 3;
const defaultMinColumnWidthPx = 128;
const compactMinColumnWidthPx = 112;
const finalMinColumnWidthPx = 164;
const defaultRowHeightPx = 184;

export const artistWallVirtualizationThreshold = 192;
export const artistWallVirtualPendingCardLimit = 24;

export type ArtistWallVirtualLayout = {
  width: number;
  columnCount: number;
  cardWidth: number;
  columnGap: number;
  rowGap: number;
  rowHeight: number;
  paddingTop: number;
  paddingLeft: number;
};

type ArtistWallVirtualRow = Pick<VirtualItem, 'index' | 'key' | 'start'>;

type UseArtistWallVirtualizationOptions = {
  enabled: boolean;
  hasMore: boolean;
  isLoading: boolean;
  itemCount: number;
  totalCount: number;
  onLoadMore: () => void;
  overscan?: number;
  scrollRootRef: RefObject<HTMLElement | null>;
  wallRef: RefObject<HTMLElement | null>;
};

type ArtistWallVirtualization = {
  columnCount: number;
  isScrolling: boolean;
  layout: ArtistWallVirtualLayout | null;
  layoutReady: boolean;
  rows: ArtistWallVirtualRow[];
  scrollToItemIndex: (index: number) => void;
  sectionStyle: CSSProperties;
};

const countResolvedGridColumns = (value: string): number => {
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'none' || /^repeat\(/i.test(trimmed)) {
    return 0;
  }

  let depth = 0;
  let count = 0;
  let hasToken = false;
  for (const character of trimmed) {
    if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth = Math.max(0, depth - 1);
    } else if (/\s/.test(character) && depth === 0) {
      if (hasToken) {
        count += 1;
        hasToken = false;
      }
      continue;
    }
    hasToken = true;
  }

  return count + Number(hasToken);
};

export const useArtistWallVirtualization = ({
  enabled,
  hasMore,
  isLoading,
  itemCount,
  totalCount,
  onLoadMore,
  overscan = virtualOverscanRows,
  scrollRootRef,
  wallRef,
}: UseArtistWallVirtualizationOptions): ArtistWallVirtualization => {
  const [layout, setLayout] = useState<ArtistWallVirtualLayout | null>(null);
  const loadRequestedRef = useRef(false);
  const layoutReady = enabled && layout !== null;
  const columnCount = layout?.columnCount ?? 1;
  const rowHeight = layout?.rowHeight ?? defaultRowHeightPx;
  const loadedRowCount = layoutReady ? Math.ceil(itemCount / columnCount) : 0;
  const virtualItemCount = hasMore ? Math.max(itemCount, totalCount) : itemCount;
  const rowCount = layoutReady ? Math.ceil(virtualItemCount / columnCount) : 0;
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => getPageScrollContainer(scrollRootRef.current),
    estimateSize: () => rowHeight,
    overscan,
  });
  const virtualRows = virtualizer.getVirtualItems();
  const rows: ArtistWallVirtualRow[] = layoutReady && virtualRows.length > 0
    ? virtualRows
    : layoutReady
      ? Array.from({ length: Math.min(rowCount, virtualFallbackRows) }, (_, index) => ({
          index,
          key: `artist-wall-fallback-${index}`,
          start: index * rowHeight,
        }))
      : [];
  const lastRowIndex = rows.at(-1)?.index ?? -1;
  const measuredTotalSize = virtualizer.getTotalSize();
  const estimatedTotalSize = rowCount * rowHeight;
  const totalSize = Number.isFinite(measuredTotalSize)
    ? Math.max(measuredTotalSize, estimatedTotalSize)
    : estimatedTotalSize;

  useLayoutEffect(() => {
    if (!enabled) {
      setLayout(null);
      return undefined;
    }

    const wall = wallRef.current;
    if (!wall) {
      return undefined;
    }

    const updateLayout = (): void => {
      const width = Math.max(0, Math.floor(wall.clientWidth || wall.getBoundingClientRect().width));
      if (width <= 0) {
        return;
      }

      const computedStyle = window.getComputedStyle(wall);
      const columnGap = Number.parseFloat(computedStyle.columnGap) || 0;
      const rowGap = Number.parseFloat(computedStyle.rowGap) || 0;
      const paddingTop = Number.parseFloat(computedStyle.paddingTop) || 0;
      const paddingRight = Number.parseFloat(computedStyle.paddingRight) || 0;
      const paddingLeft = Number.parseFloat(computedStyle.paddingLeft) || 0;
      const resolvedColumnCount = countResolvedGridColumns(computedStyle.gridTemplateColumns);
      const defaultMinColumnWidth = document.documentElement.dataset.themePreset === 'FINAL'
        ? finalMinColumnWidthPx
        : window.matchMedia?.('(max-width: 820px)').matches
          ? compactMinColumnWidthPx
          : defaultMinColumnWidthPx;
      const contentWidth = Math.max(defaultMinColumnWidth, width - paddingLeft - paddingRight);
      const nextColumnCount = resolvedColumnCount || Math.max(
        1,
        Math.floor((contentWidth + columnGap) / (defaultMinColumnWidth + columnGap)),
      );
      const cardWidth = Math.max(1, (contentWidth - columnGap * (nextColumnCount - 1)) / nextColumnCount);
      const measuredCardHeight = (wall.firstElementChild as HTMLElement | null)?.getBoundingClientRect().height ?? 0;
      const estimatedCardHeight = measuredCardHeight > 0
        ? measuredCardHeight
        : document.documentElement.dataset.themePreset === 'FINAL'
          ? cardWidth + 54
          : defaultRowHeightPx;
      const nextLayout = {
        width,
        columnCount: nextColumnCount,
        cardWidth,
        columnGap,
        rowGap,
        rowHeight: Math.max(1, Math.ceil(estimatedCardHeight + rowGap)),
        paddingTop,
        paddingLeft,
      };
      setLayout((current) => (
        current
        && current.width === nextLayout.width
        && current.columnCount === nextLayout.columnCount
        && current.cardWidth === nextLayout.cardWidth
        && current.columnGap === nextLayout.columnGap
        && current.rowGap === nextLayout.rowGap
        && current.rowHeight === nextLayout.rowHeight
        && current.paddingTop === nextLayout.paddingTop
        && current.paddingLeft === nextLayout.paddingLeft
          ? current
          : nextLayout
      ));
    };

    updateLayout();
    const resizeObserver = typeof window.ResizeObserver === 'function'
      ? new window.ResizeObserver(updateLayout)
      : null;
    resizeObserver?.observe(wall);
    const themeObserver = typeof window.MutationObserver === 'function'
      ? new window.MutationObserver(updateLayout)
      : null;
    themeObserver?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme-preset'],
    });
    window.addEventListener('resize', updateLayout);
    return () => {
      resizeObserver?.disconnect();
      themeObserver?.disconnect();
      window.removeEventListener('resize', updateLayout);
    };
  }, [enabled, wallRef]);

  useEffect(() => {
    if (!isLoading) {
      loadRequestedRef.current = false;
    }
  }, [isLoading, itemCount]);

  useEffect(() => {
    if (!layoutReady || !hasMore || isLoading || loadedRowCount <= 0 || loadRequestedRef.current) {
      return;
    }
    if (lastRowIndex < Math.max(0, loadedRowCount - virtualLoadAheadRows)) {
      return;
    }

    loadRequestedRef.current = true;
    onLoadMore();
  }, [hasMore, isLoading, lastRowIndex, layoutReady, loadedRowCount, onLoadMore]);

  const scrollToItemIndex = useCallback((index: number): void => {
    if (!layoutReady || itemCount <= 0) {
      return;
    }

    const boundedIndex = Math.max(0, Math.min(itemCount - 1, index));
    virtualizer.scrollToIndex(Math.floor(boundedIndex / columnCount), { align: 'auto' });
  }, [columnCount, itemCount, layoutReady, virtualizer]);

  return {
    columnCount,
    isScrolling: virtualizer.isScrolling,
    layout,
    layoutReady,
    rows,
    scrollToItemIndex,
    sectionStyle: { height: totalSize },
  };
};
