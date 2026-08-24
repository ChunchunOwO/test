import { ArrowUp, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useRef, useState } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MutableRefObject,
} from 'react';
import { EchoSearchFieldTools } from '../../../components/common/EchoSearchFieldTools';
import type { Locale, TranslationKey } from '../../../i18n/locales';
import type { SettingsNavGroup, SettingsNavItem } from '../settingsNavigation';
import type { SettingsSearchResult } from '../settingsSearch';
import { settingsLocaleCopy } from '../settingsSubsections';
import type { SettingsNavKey } from '../settingsTypes';
import { resolveSettingsWasdDirection } from '../useSettingsWasdNavigation';

type Translate = (
  key: TranslationKey,
  options?: Record<string, string | number>,
) => string;

type SettingsHeaderProps = {
  activeNavItem: SettingsNavItem;
  activeResultIndex: number;
  backHint?: string;
  backLabel?: string;
  inputRef: MutableRefObject<HTMLInputElement | null>;
  locale: Locale;
  onActiveResultIndexChange: (index: number) => void;
  onBack?: () => void;
  onQueryChange: (query: string) => void;
  onResultSelect: (result: SettingsSearchResult) => void;
  onSearchKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  query: string;
  searchResults: SettingsSearchResult[];
  t: Translate;
  visibleSearchResults: SettingsSearchResult[];
};

export const SettingsHeader = ({
  activeNavItem,
  activeResultIndex,
  backHint,
  backLabel,
  inputRef,
  locale,
  onActiveResultIndexChange,
  onBack,
  onQueryChange,
  onResultSelect,
  onSearchKeyDown,
  query,
  searchResults,
  t,
  visibleSearchResults,
}: SettingsHeaderProps): JSX.Element => {
  const ActiveNavIcon = activeNavItem.icon;
  const trimmedQuery = query.trim();
  const activeResult = visibleSearchResults[activeResultIndex];
  const [searchExpanded, setSearchExpanded] = useState(false);
  const showSearchResults = Boolean(trimmedQuery && searchExpanded);

  return (
    <header className="settings-header" data-has-back={onBack ? 'true' : undefined}>
      <div className="settings-header-copy">
        {onBack ? (
          <button
            className="settings-header-back"
            type="button"
            aria-label={backHint ?? backLabel}
            title={backHint ?? backLabel}
            onClick={onBack}
          >
            <ChevronLeft size={18} strokeWidth={2.25} aria-hidden="true" />
          </button>
        ) : null}
        <h1>{t('route.settings.label')}</h1>
        <div className="settings-header-context">
          <span className="settings-header-context-icon">
            <ActiveNavIcon size={14} aria-hidden="true" />
          </span>
          <span>{t(activeNavItem.labelKey)}</span>
          <em>{t(activeNavItem.descriptionKey)}</em>
        </div>
      </div>
      <div
        className="settings-search echo-search-surface"
        data-expanded={showSearchResults ? 'true' : undefined}
        role="search"
        onFocusCapture={() => setSearchExpanded(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setSearchExpanded(false);
          }
        }}
      >
        <Search size={16} aria-hidden="true" />
        <input
          ref={(node) => {
            inputRef.current = node;
          }}
          type="search"
          value={query}
          onChange={(event) => {
            setSearchExpanded(true);
            onQueryChange(event.target.value);
          }}
          onKeyDown={onSearchKeyDown}
          placeholder={t('settings.header.searchPlaceholder')}
          aria-label={t('settings.header.searchPlaceholder')}
          aria-autocomplete="list"
          aria-controls="settings-search-results"
          aria-expanded={showSearchResults}
          aria-activedescendant={
            showSearchResults && activeResult
              ? `settings-search-result-${activeResult.id}`
              : undefined
          }
        />
        {query ? (
          <EchoSearchFieldTools
            clearLabel={t('settings.header.searchClear')}
            count={trimmedQuery && searchResults.length > 0 ? `${activeResultIndex + 1} / ${searchResults.length}` : null}
            onClear={() => {
              onQueryChange('');
              inputRef.current?.focus();
            }}
          />
        ) : (
          <kbd className="settings-search-shortcut" aria-hidden="true">Ctrl K</kbd>
        )}
        {showSearchResults ? (
          <div
            id="settings-search-results"
            className="settings-search-results"
            role="listbox"
            aria-label={t('settings.header.searchPlaceholder')}
          >
            {searchResults.length ? (
              visibleSearchResults.map((result, index) => (
                <button
                  className="settings-search-result"
                  id={`settings-search-result-${result.id}`}
                  key={result.id}
                  type="button"
                  role="option"
                  aria-selected={index === activeResultIndex}
                  onMouseEnter={() => onActiveResultIndexChange(index)}
                  onClick={() => onResultSelect(result)}
                >
                  <strong>{result.title}</strong>
                  <span>{result.path}</span>
                  <small>{result.description}</small>
                </button>
              ))
            ) : (
              <p className="settings-search-empty">{t('settings.header.searchEmpty')}</p>
            )}
            {searchResults.length ? (
              <div className="settings-search-results-hint" aria-live="polite">
                <span>{settingsLocaleCopy(locale, {
                  'zh-CN': `${searchResults.length} 个匹配项`,
                  'zh-TW': `${searchResults.length} 個相符項目`,
                  'ja-JP': `${searchResults.length} 件の一致`,
                  'en-US': `${searchResults.length} matches`,
                  'ko-KR': `${searchResults.length}개 일치`,
                })}</span>
                <span aria-hidden="true"><kbd>↑</kbd><kbd>↓</kbd><kbd>Enter</kbd></span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
};

export type SettingsNavViewGroup = SettingsNavGroup & {
  items: SettingsNavItem[];
};

type SettingsNavigationProps = {
  activeSection: SettingsNavKey;
  groups: SettingsNavViewGroup[];
  locale: Locale;
  onNavigate: (key: SettingsNavKey) => void;
  t: Translate;
};

export const SettingsNavigation = ({
  activeSection,
  groups,
  locale,
  onNavigate,
  t,
}: SettingsNavigationProps): JSX.Element => {
  const navigationRef = useRef<HTMLElement | null>(null);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>): void => {
    const wasdDirection = !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
      ? resolveSettingsWasdDirection(event.key)
      : null;
    const navigationKey = wasdDirection === 'up'
      ? 'ArrowUp'
      : wasdDirection === 'down'
        ? 'ArrowDown'
        : event.key;
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(navigationKey)) {
      return;
    }

    const currentButton = event.target instanceof HTMLElement
      ? event.target.closest<HTMLButtonElement>('.settings-nav-item')
      : null;
    const buttons = Array.from(navigationRef.current?.querySelectorAll<HTMLButtonElement>('.settings-nav-item:not(:disabled)') ?? []);
    const currentIndex = currentButton ? buttons.indexOf(currentButton) : -1;
    if (currentIndex < 0 || buttons.length === 0) {
      return;
    }

    event.preventDefault();
    const nextIndex = navigationKey === 'Home'
      ? 0
      : navigationKey === 'End'
        ? buttons.length - 1
        : (currentIndex + (navigationKey === 'ArrowDown' || navigationKey === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[nextIndex]?.focus();
  };

  return (
    <nav ref={navigationRef} className="settings-nav" aria-label={t('route.settings.label')} onKeyDown={handleKeyDown}>
      {groups.map((group) => (
        <div className="settings-nav-group" key={group.id}>
          <span className="settings-nav-group-label">
            {settingsLocaleCopy(locale, group.label)}
          </span>
          {group.items.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.key;
            const isDanger = item.key === 'danger';

            return (
              <button
                className={`settings-nav-item ${isActive ? 'active' : ''} ${isDanger ? 'is-danger' : ''}`}
                key={item.key}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onNavigate(item.key)}
              >
                <span className="settings-nav-icon">
                  <Icon size={17} />
                </span>
                <span className="settings-nav-copy">
                  <span className="settings-nav-label">{t(item.labelKey)}</span>
                  <span className="settings-nav-desc">{t(item.descriptionKey)}</span>
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
};

type SettingsHorizontalPagerProps = {
  canLeft: boolean;
  canRight: boolean;
  onScroll: (direction: -1 | 1) => void;
};

export const SettingsHorizontalPager = ({
  canLeft,
  canRight,
  onScroll,
}: SettingsHorizontalPagerProps): JSX.Element => (
  <>
    <button
      className="settings-horizontal-pager settings-horizontal-pager--left"
      type="button"
      aria-label="向左翻动设置内容"
      disabled={!canLeft}
      onClick={() => onScroll(-1)}
    >
      <ChevronLeft size={18} aria-hidden="true" />
    </button>
    <button
      className="settings-horizontal-pager settings-horizontal-pager--right"
      type="button"
      aria-label="向右翻动设置内容"
      disabled={!canRight}
      onClick={() => onScroll(1)}
    >
      <ChevronRight size={18} aria-hidden="true" />
    </button>
  </>
);

type SettingsBackToTopProps = {
  label: string;
  onClick: () => void;
  visible: boolean;
};

export const SettingsBackToTop = ({
  label,
  onClick,
  visible,
}: SettingsBackToTopProps): JSX.Element | null => visible ? (
  <button className="settings-back-to-top" type="button" aria-label={label} title={label} onClick={onClick}>
    <ArrowUp size={17} aria-hidden="true" />
  </button>
) : null;

export type SettingsSectionIndexItem = {
  id: string;
  label: string;
};

type SettingsSectionIndexProps = {
  activeId: string | null;
  ariaLabel: string;
  items: SettingsSectionIndexItem[];
  onSelect: (id: string) => void;
};

export const SettingsSectionIndex = ({
  activeId,
  ariaLabel,
  items,
  onSelect,
}: SettingsSectionIndexProps): JSX.Element => (
  <aside className="settings-section-index" aria-label={ariaLabel}>
    {items.map((item) => (
      <button
        className="settings-section-index-item"
        aria-current={item.id === activeId ? 'location' : undefined}
        data-active={item.id === activeId ? 'true' : undefined}
        key={item.id}
        title={item.label}
        type="button"
        onClick={() => onSelect(item.id)}
      >
        <span aria-hidden="true" />
        {item.label}
      </button>
    ))}
  </aside>
);
