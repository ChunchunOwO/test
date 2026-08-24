import { useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';

export type ConnectDeviceFilter = 'all' | 'ready' | 'active' | 'attention';

type ConnectDeviceFilterOption = {
  count: number;
  id: ConnectDeviceFilter;
  label: string;
};

type ConnectDeviceSearchProps = {
  clearLabel: string;
  enabled: boolean;
  filterAriaLabel: string;
  filters: ConnectDeviceFilterOption[];
  inputLabel: string;
  listId: string;
  matchCount?: string | null;
  onFilterChange: (filter: ConnectDeviceFilter) => void;
  onQueryChange: (query: string) => void;
  placeholder: string;
  query: string;
  resultLabel: string;
  selectedFilter: ConnectDeviceFilter;
};

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName);
};

export const ConnectDeviceSearch = ({
  clearLabel,
  enabled,
  filterAriaLabel,
  filters,
  inputLabel,
  listId,
  matchCount,
  onFilterChange,
  onQueryChange,
  placeholder,
  query,
  resultLabel,
  selectedFilter,
}: ConnectDeviceSearchProps): JSX.Element => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultId = `${listId}-result-status`;

  const clearQuery = (): void => {
    onQueryChange('');
    inputRef.current?.focus();
  };

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const handleShortcut = (event: KeyboardEvent): void => {
      if (
        event.defaultPrevented
        || event.repeat
        || event.isComposing
        || event.key !== '/'
        || event.altKey
        || event.ctrlKey
        || event.metaKey
        || event.shiftKey
        || isEditableTarget(event.target)
        || document.querySelector('[aria-modal="true"]')
      ) {
        return;
      }
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [enabled]);

  return (
    <div className="connect-device-search">
      <div className="connect-device-search__field">
        <Search aria-hidden="true" size={16} />
        <input
          ref={inputRef}
          aria-controls={listId}
          aria-describedby={resultId}
          aria-keyshortcuts="/"
          aria-label={inputLabel}
          autoComplete="off"
          placeholder={placeholder}
          spellCheck={false}
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && query) {
              event.preventDefault();
              clearQuery();
            }
          }}
        />
        {!query ? <kbd aria-hidden="true">/</kbd> : null}
        {query ? (
          <span className="echo-search-tools">
            {matchCount ? <span className="echo-search-count">{matchCount}</span> : null}
            <button type="button" aria-label={clearLabel} title={clearLabel} onMouseDown={(event) => event.preventDefault()} onClick={clearQuery}>
              <X aria-hidden="true" size={15} />
            </button>
          </span>
        ) : null}
      </div>
      <small id={resultId} role="status" aria-atomic="true" aria-live="polite">{resultLabel}</small>
      <div className="connect-device-filters" role="group" aria-label={filterAriaLabel}>
        {filters.map((filter) => (
          <button
            key={filter.id}
            type="button"
            aria-pressed={selectedFilter === filter.id}
            data-active={selectedFilter === filter.id ? 'true' : undefined}
            onClick={() => onFilterChange(filter.id)}
          >
            <span>{filter.label}</span>
            <small aria-hidden="true">{filter.count}</small>
          </button>
        ))}
      </div>
    </div>
  );
};
