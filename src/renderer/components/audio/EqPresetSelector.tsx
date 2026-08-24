import { Check, ChevronDown, Search } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { EqPreset } from '../../../shared/types/eq';
import { useI18n } from '../../i18n/I18nProvider';
import { matchesSearchText } from '../../utils/smartTextSearch';
import { EchoSearchFieldTools } from '../common/EchoSearchFieldTools';
import { eqPresetSearchText, resolveEqPresetLabel } from './eqPresetLabels';
import { describePreset, type PresetCategory } from './eqPanelUtils';

type EqPresetSelectorProps = {
  presets: EqPreset[];
  value: string;
  onChange: (presetId: string) => void;
};

export const EqPresetSelector = ({ presets, value, onChange }: EqPresetSelectorProps): JSX.Element => {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PresetCategory | 'all' | 'built-in'>('all');
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuMounted, setMenuMounted] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef(new Map<string, HTMLButtonElement>());
  const focusRequestRef = useRef<'search' | 'selected' | 'first' | 'last'>('selected');
  const menuId = useId();
  const queryText = query.trim();
  const filterOptions: Array<{ value: PresetCategory | 'all' | 'built-in'; label: string }> = [
    { value: 'all', label: t('settings.eq.preset.filter.all') },
    { value: 'built-in', label: t('settings.eq.preset.filter.builtIn') },
    { value: 'user', label: t('settings.eq.preset.filter.user') },
    { value: 'target', label: t('settings.eq.preset.filter.target') },
    { value: 'genre', label: t('settings.eq.preset.filter.genre') },
    { value: 'utility', label: t('settings.eq.preset.filter.utility') },
  ];
  const visiblePresets = useMemo(
    () =>
      presets.filter((preset) => {
        const metadata = describePreset(preset.id);
        const matchesQuery = !queryText || matchesSearchText(queryText, eqPresetSearchText(preset, t));
        const matchesFilter =
          filter === 'all' ||
          (filter === 'built-in' && preset.readonly) ||
          (filter === 'user' && !preset.readonly) ||
          metadata?.category === filter;
        return matchesQuery && matchesFilter;
      }),
    [filter, presets, queryText, t],
  );
  const selectedPreset = presets.find((preset) => preset.id === value);
  const selectedLabel = value === 'custom'
    ? t('settings.eq.preset.modified')
    : selectedPreset
      ? resolveEqPresetLabel(selectedPreset, t)
      : t('settings.eq.preset.selectorAria');
  const safeVisiblePresets = selectedPreset && !visiblePresets.some((preset) => preset.id === selectedPreset.id)
    ? [selectedPreset, ...visiblePresets]
    : visiblePresets;
  const builtInPresets = safeVisiblePresets.filter((preset) => preset.readonly);
  const userPresets = safeVisiblePresets.filter((preset) => !preset.readonly);

  useEffect(() => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    if (menuOpen) {
      setMenuMounted(true);
      return undefined;
    }

    closeTimerRef.current = window.setTimeout(() => {
      setMenuMounted(false);
      closeTimerRef.current = null;
    }, 150);

    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen || !menuMounted) {
      return;
    }

    if (focusRequestRef.current === 'search') {
      searchRef.current?.focus();
      focusRequestRef.current = 'selected';
      return;
    }

    const options = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
    const requestedOption = focusRequestRef.current === 'first'
      ? options[0]
      : focusRequestRef.current === 'last'
        ? options.at(-1)
        : optionRefs.current.get(value === 'custom' ? 'custom' : value) ?? options[0];
    requestedOption?.focus();
    focusRequestRef.current = 'selected';
  }, [menuMounted, menuOpen, value]);

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      setMenuOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [menuOpen]);

  const registerOptionRef = (optionId: string, node: HTMLButtonElement | null): void => {
    if (node) {
      optionRefs.current.set(optionId, node);
    } else {
      optionRefs.current.delete(optionId);
    }
  };

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }
    event.preventDefault();
    focusRequestRef.current = event.key === 'ArrowDown' ? 'first' : 'last';
    setMenuOpen(true);
  };

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Tab') {
      setMenuOpen(false);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      return;
    }

    const options = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
    if (options.length === 0) {
      return;
    }
    event.preventDefault();
    const currentIndex = Math.max(0, options.indexOf(document.activeElement as HTMLButtonElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? options.length - 1
        : event.key === 'ArrowDown'
          ? (currentIndex + 1) % options.length
          : (currentIndex - 1 + options.length) % options.length;
    options[nextIndex]?.focus();
  };

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }
    const options = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
    const nextOption = event.key === 'ArrowDown' ? options[0] : options.at(-1);
    if (!nextOption) {
      return;
    }
    event.preventDefault();
    nextOption.focus();
  };

  const choosePreset = (presetId: string): void => {
    onChange(presetId);
    setMenuOpen(false);
  };

  return (
    <div className="eq-preset-browser" ref={rootRef}>
      <div className="eq-preset-selector">
        <button
          className="eq-preset-trigger"
          data-open={menuOpen}
          type="button"
          ref={triggerRef}
          aria-label={t('settings.eq.preset.selectorAria')}
          aria-expanded={menuOpen}
          aria-controls={menuId}
          aria-haspopup="listbox"
          onKeyDown={handleTriggerKeyDown}
          onClick={() => {
            focusRequestRef.current = 'search';
            setMenuOpen((current) => !current);
          }}
        >
          <span>{selectedLabel}</span>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
        {menuMounted ? (
        <div className="eq-preset-menu" data-state={menuOpen ? 'open' : 'closing'}>
          <div className="eq-preset-menu__controls">
            <label className="eq-preset-search echo-search-surface">
              <Search size={14} aria-hidden="true" />
              <input
                ref={searchRef}
                aria-label={t('settings.eq.preset.searchAria')}
                value={query}
                placeholder={t('settings.eq.preset.searchPlaceholder')}
                onKeyDown={handleSearchKeyDown}
                onChange={(event) => setQuery(event.currentTarget.value)}
              />
              {queryText ? (
                <EchoSearchFieldTools
                  clearLabel={t('common.search.clear')}
                  count={`${visiblePresets.length} / ${presets.length}`}
                  onClear={() => setQuery('')}
                />
              ) : null}
            </label>
            <div className="eq-preset-filter" role="group" aria-label={t('settings.eq.preset.filterAria')}>
              {filterOptions.map((option) => (
                <button
                  className="eq-preset-filter-chip"
                  data-active={filter === option.value}
                  type="button"
                  key={option.value}
                  onClick={() => setFilter(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div
            className="eq-preset-options"
            id={menuId}
            ref={menuRef}
            role="listbox"
            aria-label={t('settings.eq.preset.selectorAria')}
            onKeyDown={handleMenuKeyDown}
          >
            {value === 'custom' ? (
            <button
              className="eq-preset-option eq-preset-option--custom"
              data-selected="true"
              type="button"
              role="option"
              aria-selected="true"
              ref={(node) => registerOptionRef('custom', node)}
              onClick={() => setMenuOpen(false)}
            >
              <span>{t('settings.eq.preset.modified')}</span>
              <Check size={15} aria-hidden="true" />
            </button>
            ) : null}
            {builtInPresets.length > 0 ? (
            <section>
              <span className="eq-preset-menu-heading">{t('settings.eq.preset.builtIn')}</span>
              {builtInPresets.map((preset) => (
                <button
                  className="eq-preset-option"
                  data-selected={preset.id === value}
                  type="button"
                  role="option"
                  aria-selected={preset.id === value}
                  key={preset.id}
                  ref={(node) => registerOptionRef(preset.id, node)}
                  onClick={() => choosePreset(preset.id)}
                >
                  <span>{resolveEqPresetLabel(preset, t)}</span>
                  {preset.id === value ? <Check size={15} aria-hidden="true" /> : null}
                </button>
              ))}
            </section>
            ) : null}
            {userPresets.length > 0 ? (
            <section>
              <span className="eq-preset-menu-heading">{t('settings.eq.preset.user')}</span>
              {userPresets.map((preset) => (
                <button
                  className="eq-preset-option"
                  data-selected={preset.id === value}
                  type="button"
                  role="option"
                  aria-selected={preset.id === value}
                  key={preset.id}
                  ref={(node) => registerOptionRef(preset.id, node)}
                  onClick={() => choosePreset(preset.id)}
                >
                  <span>{preset.name}</span>
                  {preset.id === value ? <Check size={15} aria-hidden="true" /> : null}
                </button>
              ))}
            </section>
            ) : null}
          </div>
        </div>
        ) : null}
      </div>
    </div>
  );
};
