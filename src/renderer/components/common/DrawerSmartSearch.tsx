import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, RefObject } from 'react';
import { ChevronDown, ChevronUp, CornerDownRight, Search, X } from 'lucide-react';
import { createSearchAliasLookup, normalizeSearchText, scoreSearchText } from '../../utils/smartTextSearch';

type DrawerSearchMatch = {
  context?: string;
  description?: string;
  element: HTMLElement;
  score: number;
  title: string;
  value?: string;
};

type DrawerSmartSearchProps = {
  rootRef: RefObject<HTMLElement>;
  enabled?: boolean;
  closeOnActivate?: boolean;
  showResultList?: boolean;
  onActivateMatch?: (element: HTMLElement) => void;
  placeholder: string;
  label: string;
  clearLabel: string;
  disabledValueLabel: string;
  enabledValueLabel: string;
  noResultsLabel: string;
  resultCountLabel: (count: number) => string;
  resultLabel: (result: string) => string;
  nextLabel: string;
  previousLabel: string;
  shortcutHint: string;
};

const candidateSelector = [
  '[data-drawer-search-item]',
  '.audio-engine-meter',
  '.audio-drawer-section',
  '.audio-hidden-devices',
  '.audio-professional-status--drawer',
  '.audio-professional-status-actions',
  '.audio-advanced-group',
  '.audio-buffer-collapse',
  '.audio-toggle-row',
  '.audio-device-pill',
  '.audio-route-mode-tabs button',
  '.audio-diagnostics-copy-button',
  '.mv-threshold-control',
  '.styled-select',
  '.lyrics-settings-master-row',
  '.lyrics-settings-progressive-control',
  '.lyrics-mini-player-shortcut-control',
  '.lyrics-mini-player-tuning-row',
  '.lyrics-desktop-direction-row',
  '.lyrics-drawer-range',
  '.lyrics-font-picker-button',
  '.lyrics-color-swatch',
  '.lyrics-color-reset',
  '.lyrics-source-option',
  '.lyrics-background-select__trigger',
  '.lyrics-background-segmented button',
  '.lyrics-visual-group',
].join(',');

const searchAliasGroups = [
  ['exclusive', 'lowlatency', '专业声卡', '低延迟', '原生输出'],
  ['wasapi', 'shared', '独占', '共享', 'bitperfect', 'bit perfect', '位完美'],
  ['dsp', 'eq', 'equalizer', '均衡器'],
  ['dsd', 'dop', 'sacd', 'dsf', 'dff', '原生dsd', '位流'],
  ['soxr', 'resample', 'upsample', '重采样', '升频'],
  ['buffer', 'latency', 'frames', '缓冲', '爆音'],
  ['lowload', 'lowloadplayback', '低负载', '低占用', '卡顿'],
  ['hqplayer', 'hqp', '接管', '外部输出', '数播'],
  ['lyrics', 'lyric', 'lrc', '歌词', '桌面歌词'],
  ['netease', 'qqmusic', 'kugou', 'kuwo', 'lrclib', 'amll', 'ttml', '歌词源', '网易', 'qq音乐', '酷狗', '酷我'],
  ['romaji', 'romanization', 'kana', 'furigana', '罗马音', '假名'],
  ['translation', 'translate', '翻译', '副歌词', '双语'],
  ['wordhighlight', 'karaoke', '逐字', '卡拉ok', '逐词'],
  ['offset', 'sync', '偏移', '同步', '校准'],
  ['font', 'fontsize', '字体', '字号'],
  ['background', 'wallpaper', '背景', '壁纸'],
  ['mv', 'video'],
];

const aliasLookup = createSearchAliasLookup(searchAliasGroups);

const collectOwnedText = (element: HTMLElement): string[] => {
  const values: string[] = [];

  const visit = (node: Node): void => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const value = child.textContent?.trim();
        if (value) {
          values.push(value);
        }
        return;
      }

      if (!(child instanceof HTMLElement) || child.matches(candidateSelector)) {
        return;
      }

      visit(child);
    });
  };

  visit(element);
  return values;
};

const getAssociatedDescriptionElement = (element: HTMLElement): HTMLElement | null => {
  const sibling = element.nextElementSibling;
  return sibling instanceof HTMLElement && sibling.matches('p, .audio-section-note') ? sibling : null;
};

const collectSearchText = (element: HTMLElement): string => {
  const extraValues = Array.from(element.querySelectorAll<HTMLElement>('[aria-label], [title], [data-search-keywords]'))
    .filter((node) => node.closest(candidateSelector) === element)
    .flatMap((node) => [
      node.getAttribute('aria-label'),
      node.getAttribute('title'),
      node.dataset.searchKeywords,
    ])
    .filter((value): value is string => Boolean(value));

  return [
    ...collectOwnedText(element),
    element.getAttribute('aria-label'),
    element.getAttribute('title'),
    element.dataset.searchKeywords,
    element.dataset.drawerSearchDescription,
    getAssociatedDescriptionElement(element)?.textContent,
    ...extraValues,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ');
};

const getSearchCandidates = (root: HTMLElement): HTMLElement[] => {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(candidateSelector))
    .filter((element) => !element.closest('.drawer-smart-search'));
  return Array.from(new Set(nodes));
};

const resultTitleSelectors = [
  '.audio-drawer-section-title h3',
  '.audio-advanced-group__toggle strong',
  '.lyrics-visual-group__heading strong',
  '.audio-engine-meter__top > div > span',
  '.audio-professional-status__header strong',
  '.mv-threshold-copy strong',
  '.sort-button-label',
  ':scope > span > strong',
  'summary > span',
  ':scope > h3',
  ':scope > h4',
  ':scope > strong',
].join(',');

const resultDescriptionSelectors = [
  '[data-drawer-search-description]',
  '.audio-device-pill small',
  '.audio-advanced-group__toggle small',
  '.lyrics-visual-group__heading small',
  '.mv-threshold-copy em',
  ':scope > span > small',
].join(',');

const compactDisplayText = (value: string | null | undefined): string => value?.replace(/\s+/g, ' ').trim() ?? '';

const getSearchResultTitle = (element: HTMLElement): string => {
  const explicitLabel = compactDisplayText(element.dataset.drawerSearchLabel ?? element.getAttribute('aria-label') ?? element.getAttribute('title'));
  if (explicitLabel) {
    return explicitLabel;
  }

  const heading = element.querySelector<HTMLElement>(resultTitleSelectors);
  const headingText = compactDisplayText(heading?.textContent);
  if (headingText) {
    return headingText;
  }

  return compactDisplayText(collectOwnedText(element)[0]) || compactDisplayText(collectSearchText(element)).slice(0, 80);
};

const getSearchResultDescription = (element: HTMLElement): string | undefined => {
  const explicitDescription = compactDisplayText(element.dataset.drawerSearchDescription);
  if (explicitDescription) {
    return explicitDescription;
  }

  const description = compactDisplayText(element.querySelector<HTMLElement>(resultDescriptionSelectors)?.textContent)
    || compactDisplayText(getAssociatedDescriptionElement(element)?.textContent);
  return description || undefined;
};

const getSearchResultValue = (
  element: HTMLElement,
  enabledValueLabel: string,
  disabledValueLabel: string,
): string | undefined => {
  const explicitValue = compactDisplayText(element.dataset.drawerSearchValue);
  if (explicitValue) {
    return explicitValue;
  }

  const checkbox = element.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (checkbox) {
    return checkbox.checked ? enabledValueLabel : disabledValueLabel;
  }

  const output = element.querySelector<HTMLElement>('output, .mv-threshold-slider > strong, .audio-device-pill > em, :scope > span > em');
  const outputText = compactDisplayText(output?.textContent);
  if (outputText) {
    return outputText;
  }

  const select = element.querySelector<HTMLSelectElement>('select');
  const selectedText = compactDisplayText(select?.selectedOptions[0]?.textContent);
  if (selectedText) {
    return selectedText;
  }

  const range = element.querySelector<HTMLInputElement>('input[type="range"]');
  if (range?.value) {
    return range.value;
  }

  if (
    element.dataset.active === 'true'
    || element.dataset.selected === 'true'
    || element.getAttribute('aria-pressed') === 'true'
    || element.getAttribute('aria-checked') === 'true'
  ) {
    return enabledValueLabel;
  }

  return undefined;
};

const getSearchResultContext = (element: HTMLElement): string | undefined => {
  const ownTitle = getSearchResultTitle(element);
  const path: string[] = [];
  let parent = element.parentElement?.closest<HTMLElement>(candidateSelector) ?? null;

  while (parent && path.length < 3) {
    const title = getSearchResultTitle(parent);
    if (title && title !== ownTitle && !path.includes(title)) {
      path.unshift(title);
    }
    parent = parent.parentElement?.closest<HTMLElement>(candidateSelector) ?? null;
  }

  return path.length ? path.join(' › ') : undefined;
};

const clearSearchState = (root: HTMLElement): void => {
  delete root.dataset.drawerSearching;
  getSearchCandidates(root).forEach((element) => {
    delete element.dataset.drawerSearchHidden;
    delete element.dataset.drawerSearchMatch;
    delete element.dataset.drawerSearchContext;
    delete element.dataset.drawerSearchActive;
    const description = getAssociatedDescriptionElement(element);
    if (description) {
      delete description.dataset.drawerSearchHidden;
    }
  });
};

const toNavigableMatches = <T extends { element: HTMLElement }>(matches: T[]): T[] =>
  matches.filter((match) => !matches.some((other) => other.element !== match.element && match.element.contains(other.element)));

const matchControlSelector = 'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])';

const focusMatchControl = (element: HTMLElement): void => {
  const control = element.matches(matchControlSelector)
    ? element
    : element.querySelector<HTMLElement>(matchControlSelector);
  control?.focus();
};

const scrollMatchIntoView = (element: HTMLElement, block: ScrollLogicalPosition): void => {
  if (typeof element.scrollIntoView !== 'function') {
    return;
  }
  element.scrollIntoView({ block, inline: 'nearest', behavior: 'smooth' });
};

const expandMatch = (element: HTMLElement): void => {
  const expandableElements: HTMLElement[] = [];
  let current: HTMLElement | null = element;

  while (current) {
    if (current.matches(candidateSelector)) {
      expandableElements.unshift(current);
    }
    current = current.parentElement;
  }

  expandableElements.forEach((expandable) => {
    if (expandable instanceof HTMLDetailsElement) {
      expandable.open = true;
      return;
    }

    if (expandable instanceof HTMLButtonElement && expandable.getAttribute('aria-expanded') === 'false') {
      expandable.click();
      return;
    }

    const toggle = Array.from(expandable.children).find(
      (child): child is HTMLButtonElement => child instanceof HTMLButtonElement && child.getAttribute('aria-expanded') === 'false',
    );
    toggle?.click();
  });
};

const scoreCandidate = (query: string, element: HTMLElement): number =>
  scoreSearchText(query, collectSearchText(element), {
    aliasLookup,
    title: getSearchResultTitle(element),
  });

export const DrawerSmartSearch = ({
  rootRef,
  enabled = true,
  closeOnActivate = false,
  showResultList = false,
  placeholder,
  label,
  clearLabel,
  disabledValueLabel,
  enabledValueLabel,
  noResultsLabel,
  resultCountLabel,
  resultLabel,
  nextLabel,
  onActivateMatch,
  previousLabel,
  shortcutHint,
}: DrawerSmartSearchProps): JSX.Element => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const activeElementRef = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<DrawerSearchMatch[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const normalizedQuery = useMemo(() => normalizeSearchText(query), [query]);
  const isSearching = normalizedQuery.length > 0;
  const onActivateMatchRef = useRef(onActivateMatch);
  onActivateMatchRef.current = onActivateMatch;

  const applySearch = useCallback(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const candidates = getSearchCandidates(root);

    if (!normalizedQuery) {
      clearSearchState(root);
      setMatches([]);
      activeElementRef.current = null;
      setActiveIndex(-1);
      return;
    }

    root.dataset.drawerSearching = 'true';
    const nextMatches = toNavigableMatches(
      candidates
        .map((element, order) => ({ element, order, score: scoreCandidate(query, element) }))
        .filter((candidate) => candidate.score > 0)
        .sort((left, right) => right.score - left.score || left.order - right.order)
        .map(({ element, score }) => ({
          context: getSearchResultContext(element),
          description: getSearchResultDescription(element),
          element,
          score,
          title: getSearchResultTitle(element),
          value: getSearchResultValue(element, enabledValueLabel, disabledValueLabel),
        })),
    );

    const matchedElements = new Set(nextMatches.map((match) => match.element));
    candidates.forEach((element) => {
      const isMatch = matchedElements.has(element);
      const isContext = nextMatches.some((match) => element.contains(match.element) || match.element.contains(element));
      element.dataset.drawerSearchHidden = isMatch || isContext ? 'false' : 'true';
      const description = getAssociatedDescriptionElement(element);
      if (description) {
        description.dataset.drawerSearchHidden = isMatch || isContext ? 'false' : 'true';
      }
      if (isMatch) {
        element.dataset.drawerSearchMatch = 'true';
      } else {
        delete element.dataset.drawerSearchMatch;
        delete element.dataset.drawerSearchActive;
      }
      if (!isMatch && isContext) {
        element.dataset.drawerSearchContext = 'true';
      } else {
        delete element.dataset.drawerSearchContext;
      }
    });

    setMatches(nextMatches);
    const preservedIndex = activeElementRef.current
      ? nextMatches.findIndex((match) => match.element === activeElementRef.current)
      : -1;
    const nextActiveIndex = preservedIndex >= 0 ? preservedIndex : (nextMatches.length ? 0 : -1);
    const activeMatch = nextActiveIndex >= 0 ? nextMatches[nextActiveIndex] : null;
    const nextActiveElement = activeMatch?.element ?? null;
    const shouldActivate = Boolean(nextActiveElement) && nextActiveElement !== activeElementRef.current;
    activeElementRef.current = nextActiveElement;
    setActiveIndex(nextActiveIndex);
    if (activeMatch) {
      activeMatch.element.dataset.drawerSearchActive = 'true';
      if (shouldActivate) {
        expandMatch(activeMatch.element);
        onActivateMatchRef.current?.(activeMatch.element);
        window.requestAnimationFrame(() => {
          scrollMatchIntoView(activeMatch.element, 'nearest');
        });
      }
    }
  }, [disabledValueLabel, enabledValueLabel, normalizedQuery, query, rootRef]);

  const focusMatch = useCallback((index: number, dismiss = true) => {
    const match = matches[index];
    const root = rootRef.current;

    if (!match || !root) {
      return;
    }

    getSearchCandidates(root).forEach((element) => delete element.dataset.drawerSearchActive);
    activeElementRef.current = match.element;
    setActiveIndex(index);
    match.element.dataset.drawerSearchActive = 'true';
    if (!closeOnActivate || dismiss) {
      onActivateMatch?.(match.element);
    }
    expandMatch(match.element);
    if (closeOnActivate && dismiss) {
      setQuery('');
    }
    window.requestAnimationFrame(() => {
      scrollMatchIntoView(match.element, 'center');
      if (dismiss) {
        window.requestAnimationFrame(() => {
          focusMatchControl(match.element);
        });
      }
    });
  }, [closeOnActivate, matches, onActivateMatch, rootRef]);

  const moveMatch = useCallback((direction: 1 | -1) => {
    if (!matches.length) {
      return;
    }

    const nextIndex = activeIndex < 0
      ? (direction > 0 ? 0 : matches.length - 1)
      : (activeIndex + direction + matches.length) % matches.length;
    focusMatch(nextIndex, false);
  }, [activeIndex, focusMatch, matches.length]);

  useEffect(() => {
    applySearch();
  }, [applySearch]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'f') {
        event.preventDefault();
        event.stopImmediatePropagation();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const root = rootRef.current;
    if (!root) {
      return undefined;
    }

    let frame = 0;
    const observer = new MutationObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(applySearch);
    });
    observer.observe(root, { childList: true, characterData: true, subtree: true });

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [applySearch, enabled, rootRef]);

  useEffect(() => () => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    clearSearchState(root);
  }, [rootRef]);

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape' && query) {
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      setQuery('');
      return;
    }

    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && matches.length > 0) {
      event.preventDefault();
      moveMatch(event.key === 'ArrowUp' ? -1 : 1);
      return;
    }

    if (event.key === 'Enter' && matches.length > 0) {
      event.preventDefault();
      focusMatch(activeIndex >= 0 ? activeIndex : 0);
    }
  };

  return (
    <section className="drawer-smart-search" aria-label={label}>
      <label className="drawer-smart-search__field">
        <Search size={16} aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder={placeholder}
          aria-label={label}
          aria-keyshortcuts="Control+F Meta+F"
          onChange={(event) => setQuery(event.currentTarget.value)}
          onFocus={applySearch}
          onKeyDown={handleInputKeyDown}
        />
        {!query ? <kbd title={shortcutHint}>Ctrl F</kbd> : null}
        {query ? (
          <span className="drawer-smart-search__tools">
            {isSearching ? (
              <span className="drawer-smart-search__meta" role="status" aria-live="polite" data-empty={matches.length === 0 ? 'true' : undefined}>
                {matches.length ? `${Math.max(activeIndex, 0) + 1} / ${matches.length}` : noResultsLabel}
              </span>
            ) : null}
            {matches.length > 1 ? (
              <span className="drawer-smart-search__steppers">
                <button type="button" aria-label={previousLabel} title={previousLabel} onMouseDown={(event) => event.preventDefault()} onClick={() => moveMatch(-1)}>
                  <ChevronUp size={13} />
                </button>
                <button type="button" aria-label={nextLabel} title={nextLabel} onMouseDown={(event) => event.preventDefault()} onClick={() => moveMatch(1)}>
                  <ChevronDown size={13} />
                </button>
              </span>
            ) : null}
            <button className="drawer-smart-search__clear" type="button" aria-label={clearLabel} title={clearLabel} onMouseDown={(event) => event.preventDefault()} onClick={() => setQuery('')}>
              <X size={14} />
            </button>
          </span>
        ) : null}
      </label>
      {showResultList && matches.length > 0 ? (
        <div className="drawer-smart-search__results" role="listbox" aria-label={resultCountLabel(matches.length)}>
          {matches.map((match, index) => (
            <button
              className="drawer-smart-search__result"
              type="button"
              role="option"
              aria-label={resultLabel([match.title, match.description, match.value, match.context].filter(Boolean).join(' / '))}
              aria-selected={activeIndex === index}
              data-active={activeIndex === index ? 'true' : undefined}
              key={`${match.title}-${index}`}
              onClick={() => focusMatch(index)}
            >
              <CornerDownRight size={14} aria-hidden="true" />
              <span className="drawer-smart-search__result-copy">
                <span className="drawer-smart-search__result-heading">
                  <strong>{match.title}</strong>
                  {match.value ? <em>{match.value}</em> : null}
                </span>
                {match.description ? <small>{match.description}</small> : null}
                {match.context ? <span className="drawer-smart-search__result-context">{match.context}</span> : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
};
