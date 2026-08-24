import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import type { GlobalShortcutAction, GlobalShortcutSettings, LocalShortcutSettings } from '../../../../shared/types/globalShortcuts';
import type { TranslationKey } from '../../../i18n/locales';
import {
  ChipButton,
  SettingRow,
  SettingSubsectionTitle,
  ToggleButton,
  type SettingSubsectionTitleProps,
} from '../components/SettingsPrimitives';
import {
  fallbackShortcutActionIcon,
  formatAcceleratorForDisplay,
  globalShortcutActionMeta,
  groupShortcutActionMeta,
  localShortcutUnavailableActions,
  matchesShortcutFilter,
  shortcutActionCategory,
  shortcutActionIcons,
  shortcutCategoryMeta,
  shortcutFilterOptions,
  shortcutMessageKey,
  shortcutMouseDisplayKeys,
  type RecordingShortcutTarget,
  type ShortcutCategory,
  type ShortcutFilter,
  type ShortcutMessageKey,
  type ShortcutScope,
} from './shortcutSettingsModel';
import './shortcut-bindings.css';

type Translate = (key: TranslationKey, options?: Record<string, string | number>) => string;

type ShortcutBindingsPanelProps = {
  disabled: boolean;
  globalShortcuts: GlobalShortcutSettings;
  localShortcuts: LocalShortcutSettings;
  recordingShortcutTarget: RecordingShortcutTarget | null;
  shortcutMessages: Partial<Record<ShortcutMessageKey, string | null>>;
  subsection: SettingSubsectionTitleProps;
  t: Translate;
  onClear: (scope: ShortcutScope, action: GlobalShortcutAction) => void;
  onRecord: (target: RecordingShortcutTarget) => void;
  onToggle: (scope: ShortcutScope, action: GlobalShortcutAction) => void;
};

const toggleCategory = (current: Set<ShortcutCategory>, category: ShortcutCategory): Set<ShortcutCategory> => {
  const next = new Set(current);
  if (next.has(category)) {
    next.delete(category);
  } else {
    next.add(category);
  }
  return next;
};

export const ShortcutBindingsPanel = ({
  disabled,
  globalShortcuts,
  localShortcuts,
  recordingShortcutTarget,
  shortcutMessages,
  subsection,
  t,
  onClear,
  onRecord,
  onToggle,
}: ShortcutBindingsPanelProps): JSX.Element => {
  const [shortcutFilter, setShortcutFilter] = useState<ShortcutFilter>('all');
  const [activeCategory, setActiveCategory] = useState<ShortcutCategory | 'all'>('all');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<ShortcutCategory>>(() => new Set());

  const visibleGroups = useMemo(() => {
    const filtered = globalShortcutActionMeta.filter((item) => {
      if (activeCategory !== 'all' && shortcutActionCategory[item.action] !== activeCategory) {
        return false;
      }

      return matchesShortcutFilter(
        shortcutFilter,
        localShortcuts[item.action],
        globalShortcuts[item.action],
        Boolean(
          shortcutMessages[shortcutMessageKey('local', item.action)] ||
            shortcutMessages[shortcutMessageKey('global', item.action)],
        ),
      );
    });

    return groupShortcutActionMeta(filtered);
  }, [activeCategory, globalShortcuts, localShortcuts, shortcutFilter, shortcutMessages]);

  useEffect(() => {
    if (!recordingShortcutTarget) {
      return;
    }

    const category = shortcutActionCategory[recordingShortcutTarget.action];
    if (!category) {
      return;
    }

    setCollapsedCategories((current) => {
      if (!current.has(category)) {
        return current;
      }

      const next = new Set(current);
      next.delete(category);
      return next;
    });
    setActiveCategory((current) => (current === 'all' || current === category ? current : 'all'));
  }, [recordingShortcutTarget]);

  useEffect(() => {
    if (shortcutFilter === 'all') {
      return;
    }

    setCollapsedCategories(new Set());
  }, [shortcutFilter]);

  const mouseKeyLabels = useMemo(
    () => ({
      MouseButton3: t(shortcutMouseDisplayKeys.MouseButton3),
      MouseButton4: t(shortcutMouseDisplayKeys.MouseButton4),
      MouseButton5: t(shortcutMouseDisplayKeys.MouseButton5),
    }),
    [t],
  );

  const allExpanded = visibleGroups.every((group) => !collapsedCategories.has(group.category));
  const allCollapsed =
    visibleGroups.length > 0 && visibleGroups.every((group) => collapsedCategories.has(group.category));

  const handleCategoryClick = (category: ShortcutCategory | 'all'): void => {
    if (category !== 'all' && activeCategory === category) {
      setActiveCategory('all');
      return;
    }

    setActiveCategory(category);
    if (category === 'all') {
      return;
    }

    setCollapsedCategories((current) => {
      if (!current.has(category)) {
        return current;
      }

      const next = new Set(current);
      next.delete(category);
      return next;
    });
    window.requestAnimationFrame(() => {
      document.getElementById(`settings-shortcut-group-${category}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  };

  const renderShortcutControl = (
    action: GlobalShortcutAction,
    scope: ShortcutScope,
    binding: LocalShortcutSettings[GlobalShortcutAction] | GlobalShortcutSettings[GlobalShortcutAction],
    isRecording: boolean,
    message: string | null,
  ): JSX.Element => (
    <div className="settings-shortcut-control" role="group" aria-label={t(`settings.shortcuts.scope.${scope}` as TranslationKey)}>
      <span className="settings-shortcut-scope-label">{t(`settings.shortcuts.scope.${scope}` as TranslationKey)}</span>
      <button
        className={`settings-shortcut-key${isRecording ? ' is-recording' : ''}${!binding.accelerator && !isRecording ? ' is-empty' : ''}`}
        type="button"
        aria-label={isRecording ? t('settings.shortcuts.recording') : t('settings.shortcuts.action.record')}
        disabled={disabled}
        title={isRecording ? t('settings.shortcuts.recording') : t('settings.shortcuts.action.record')}
        onClick={() => onRecord({ scope, action })}
      >
        {isRecording
          ? t('settings.shortcuts.recording')
          : formatAcceleratorForDisplay(binding.accelerator, t('settings.shortcuts.empty'), mouseKeyLabels)}
      </button>
      <div className="settings-shortcut-actions">
        <button
          className="settings-icon-button settings-shortcut-clear"
          type="button"
          aria-label={t('settings.shortcuts.action.clear')}
          disabled={disabled || !binding.accelerator}
          title={t('settings.shortcuts.action.clear')}
          onClick={() => onClear(scope, action)}
        >
          <X size={14} />
        </button>
        <ToggleButton
          active={binding.enabled}
          disabled={disabled || !binding.accelerator}
          onClick={() => onToggle(scope, action)}
        />
      </div>
      {message ? <p className="settings-inline-error">{message}</p> : null}
    </div>
  );

  return (
    <div className="settings-shortcut-bindings">
      <SettingSubsectionTitle id="settings-shortcuts-bindings" {...subsection} />
      <div className="settings-shortcut-filter-board">
        <div className="settings-shortcut-toolbar">
          <div className="settings-shortcut-filter-section">
            <span className="settings-shortcut-filter-label">{t('settings.shortcuts.filter.aria')}</span>
            <div className="settings-shortcut-filter" role="group" aria-label={t('settings.shortcuts.filter.aria')}>
              {shortcutFilterOptions.map((option) => (
                <ChipButton
                  active={shortcutFilter === option.filter}
                  key={option.filter}
                  onClick={() => setShortcutFilter(option.filter)}
                >
                  {t(option.labelKey)}
                </ChipButton>
              ))}
            </div>
          </div>
          <div className="settings-shortcut-group-actions">
            <button
              className="settings-action-button"
              type="button"
              disabled={visibleGroups.length === 0 || allExpanded}
              onClick={() => setCollapsedCategories(new Set())}
            >
              {t('settings.shortcuts.group.expandAll')}
            </button>
            <button
              className="settings-action-button"
              type="button"
              disabled={visibleGroups.length === 0 || allCollapsed}
              onClick={() => setCollapsedCategories(new Set(visibleGroups.map((group) => group.category)))}
            >
              {t('settings.shortcuts.group.collapseAll')}
            </button>
          </div>
        </div>
        <div className="settings-shortcut-category-section">
          <span className="settings-shortcut-filter-label">{t('settings.shortcuts.group.jumpAria')}</span>
          <div className="settings-shortcut-categories" role="group" aria-label={t('settings.shortcuts.group.jumpAria')}>
            <ChipButton active={activeCategory === 'all'} onClick={() => handleCategoryClick('all')}>
              {t('settings.shortcuts.group.all')}
            </ChipButton>
            {shortcutCategoryMeta.map((group) => (
              <ChipButton
                active={activeCategory === group.category}
                key={group.category}
                onClick={() => handleCategoryClick(group.category)}
              >
                {t(group.titleKey)}
              </ChipButton>
            ))}
          </div>
        </div>
      </div>
      <div className="settings-shortcut-table">
        <div className="setting-row setting-row--shortcut setting-row--shortcut-header">
          <span>{t('settings.shortcuts.column.function')}</span>
          <span>{t('settings.shortcuts.column.local')}</span>
          <span>{t('settings.shortcuts.column.global')}</span>
        </div>
        {visibleGroups.length === 0 ? (
          <p className="settings-shortcut-empty">{t('settings.shortcuts.filter.empty')}</p>
        ) : null}
        <div className="settings-shortcut-groups">
        {visibleGroups.map((group) => {
          const GroupIcon = group.icon;
          const expanded = !collapsedCategories.has(group.category);
          const enabledCount = group.items.filter(
            (item) => localShortcuts[item.action]?.enabled || globalShortcuts[item.action]?.enabled,
          ).length;
          const meta = t('settings.shortcuts.group.meta', {
            visible: group.items.length,
            enabled: enabledCount,
          });

          return (
            <section
              className="settings-shortcut-group"
              data-category={group.category}
              data-expanded={expanded ? 'true' : 'false'}
              key={group.category}
            >
              <button
                className="settings-shortcut-group-header"
                type="button"
                id={`settings-shortcut-group-${group.category}`}
                aria-controls={`settings-shortcut-group-${group.category}-rows`}
                aria-expanded={expanded}
                onClick={() => setCollapsedCategories((current) => toggleCategory(current, group.category))}
              >
                <ChevronDown className="settings-shortcut-group-chevron" size={16} aria-hidden="true" />
                <span className="settings-shortcut-group-icon" aria-hidden="true">
                  <GroupIcon size={15} />
                </span>
                <span className="settings-shortcut-group-title">{t(group.titleKey)}</span>
                <span className="settings-shortcut-group-meta">{meta}</span>
              </button>
              {expanded ? (
                <div className="settings-shortcut-group-body" id={`settings-shortcut-group-${group.category}-rows`}>
                  {group.items.map((item) => {
                    const localBinding = localShortcuts[item.action];
                    const globalBinding = globalShortcuts[item.action];
                    const isLocalRecording =
                      recordingShortcutTarget?.scope === 'local' && recordingShortcutTarget.action === item.action;
                    const isGlobalRecording =
                      recordingShortcutTarget?.scope === 'global' && recordingShortcutTarget.action === item.action;
                    const localMessage = shortcutMessages[shortcutMessageKey('local', item.action)] ?? null;
                    const globalMessage = shortcutMessages[shortcutMessageKey('global', item.action)] ?? null;
                    const localUnavailable = localShortcutUnavailableActions.has(item.action);

                    return (
                      <SettingRow
                        className="setting-row--shortcut"
                        key={item.action}
                        leadingIcon={shortcutActionIcons[item.action] ?? fallbackShortcutActionIcon}
                        title={t(item.titleKey)}
                        description={t(item.descriptionKey)}
                      >
                        {localUnavailable ? (
                          <div className="settings-shortcut-unavailable" role="group" aria-label={t('settings.shortcuts.scope.local')}>
                            <span className="settings-shortcut-scope-label">{t('settings.shortcuts.scope.local')}</span>
                            <span>{t('settings.shortcuts.localUnavailable')}</span>
                          </div>
                        ) : (
                          renderShortcutControl(item.action, 'local', localBinding, isLocalRecording, localMessage)
                        )}
                        {renderShortcutControl(item.action, 'global', globalBinding, isGlobalRecording, globalMessage)}
                      </SettingRow>
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}
        </div>
      </div>
    </div>
  );
};
