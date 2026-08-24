import {
  AlertTriangle,
  Compass,
  Code2,
  PackageCheck,
  PackageOpen,
  RefreshCw,
  Search,
  ShieldCheck,
  Wrench,
  Workflow,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WorkshopContentKind, WorkshopManagerItem, WorkshopManagerSnapshot } from '../../shared/types/workshop';
import { WorkshopBrowsePanel } from '../workshop/WorkshopBrowsePanel';
import { WorkshopGuideEntry } from '../workshop/WorkshopGuideEntry';
import { WorkshopItemRow } from '../workshop/WorkshopItemRow';
import { WorkshopAuthoringStudio } from '../workshop/WorkshopAuthoringStudio';
import { WorkshopControlCenter } from '../workshop/WorkshopControlCenter';
import { EchoSearchFieldTools } from '../components/common/EchoSearchFieldTools';
import { useWorkshopManager } from '../workshop/useWorkshopManager';
import { consumePendingWorkshopPane } from '../workshop/workshopNavigation';
import {
  workshopKindFilterLabelKey,
  workshopReconcileLabelKey,
  workshopStateFilterLabelKey,
  useWorkshopTranslate,
} from '../workshop/workshopI18n';
import {
  compareWorkshopItems,
  isWorkshopTypingTarget,
  matchesWorkshopQuery,
  matchesWorkshopStateFilter,
  resolveWorkshopRowActions,
  workshopItemKey,
  workshopKindFilters,
  workshopStateFilters,
  type WorkshopItemAction,
  type WorkshopKindFilter,
  type WorkshopStateFilter,
} from '../workshop/workshopItemModel';
import '../styles/workshop-page.css';

const steamSourceLabel = (
  snapshot: WorkshopManagerSnapshot | null,
  t: ReturnType<typeof useWorkshopTranslate>,
): string => {
  if (!snapshot) {
    return t('workshopPage.status.source.reading');
  }
  if (snapshot.source.available) {
    return t('workshopPage.status.source.subscriptions', { count: snapshot.source.items.length });
  }
  return snapshot.source.reason === 'subscription-query-failed'
    ? t('workshopPage.status.source.queryFailed')
    : t('workshopPage.status.source.unavailable');
};

export const WorkshopPage = (): JSX.Element => {
  const t = useWorkshopTranslate();
  const {
    snapshot,
    loading,
    refreshing,
    busyKey,
    error,
    notice,
    refresh,
    reconcile,
    runItemAction,
    announce,
    dismissError,
    dismissNotice,
  } = useWorkshopManager();
  const pageRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const discoverSearchRef = useRef<HTMLInputElement>(null);
  const autoOpenedDiscover = useRef(false);
  const [pane, setPane] = useState<'installed' | 'discover' | 'author' | 'control'>(() => consumePendingWorkshopPane() ?? 'installed');
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<WorkshopKindFilter>('all');
  const [stateFilter, setStateFilter] = useState<WorkshopStateFilter>('all');
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const searchedItems = useMemo(() => {
    return (snapshot?.items ?? [])
      .filter((item) => matchesWorkshopQuery(item, query))
      .sort(compareWorkshopItems);
  }, [query, snapshot]);
  const kindCounts = useMemo(() => {
    const counts: Record<WorkshopKindFilter, number> = {
      all: searchedItems.length,
      theme: 0,
      'lyrics-style': 0,
      'visualizer-preset': 0,
      'dsp-preset': 0,
      'audio-plugin-profile': 0,
      'plugin-package': 0,
    };
    for (const item of searchedItems) {
      if (item.contentKind) {
        counts[item.contentKind] += 1;
      }
    }
    return counts;
  }, [searchedItems]);
  const stateCounts = useMemo(() => {
    const scoped = kindFilter === 'all'
      ? searchedItems
      : searchedItems.filter((item) => item.contentKind === kindFilter);
    return {
      all: scoped.length,
      attention: scoped.filter((item) => matchesWorkshopStateFilter(item, 'attention')).length,
      enabled: scoped.filter((item) => matchesWorkshopStateFilter(item, 'enabled')).length,
      disabled: scoped.filter((item) => matchesWorkshopStateFilter(item, 'disabled')).length,
      issue: scoped.filter((item) => matchesWorkshopStateFilter(item, 'issue')).length,
    } satisfies Record<WorkshopStateFilter, number>;
  }, [kindFilter, searchedItems]);
  const items = useMemo(() => {
    return searchedItems.filter((item) => {
      if (kindFilter !== 'all' && item.contentKind !== kindFilter) {
        return false;
      }
      return matchesWorkshopStateFilter(item, stateFilter);
    });
  }, [kindFilter, searchedItems, stateFilter]);
  const storageHealthy = Boolean(snapshot?.registry.writable && snapshot.catalog.writable);
  const reconcileRunning = snapshot?.reconcile.state === 'running' || busyKey === 'reconcile';
  const repairNeedsAttention = Boolean(snapshot && (
    !storageHealthy || snapshot.reconcile.state === 'error'
  ));
  const mutationLocked = Boolean(busyKey);
  const totalCount = snapshot?.items.length ?? 0;
  const emptyKindOrState = !query.trim() && (kindFilter !== 'all' || stateFilter !== 'all') && searchedItems.length > 0;
  const emptyTitle = query.trim()
    ? t('workshopPage.empty.noMatch.title')
    : emptyKindOrState
      ? t('workshopPage.empty.filter.title')
      : snapshot && !snapshot.source.available
        ? t('workshopPage.empty.steam.title')
        : t('workshopPage.empty.none.title');
  const emptyCopy = query.trim()
    ? t('workshopPage.empty.noMatch.copy')
    : emptyKindOrState
      ? t('workshopPage.empty.filter.copy')
      : snapshot && !snapshot.source.available
        ? t('workshopPage.empty.steam.copy')
        : t('workshopPage.empty.none.copy');
  const clearQuery = useCallback(() => {
    setQuery('');
    searchRef.current?.focus();
  }, []);
  const resetFilters = useCallback(() => {
    setKindFilter('all');
    setStateFilter('all');
  }, []);
  const focusKind = useCallback((kind: WorkshopContentKind) => {
    setKindFilter(kind);
    setStateFilter('all');
  }, []);
  const moveActive = useCallback((delta: number) => {
    setActiveKey((current) => {
      if (items.length === 0) {
        return null;
      }
      const index = current ? items.findIndex((item) => workshopItemKey(item) === current) : -1;
      const nextIndex = index < 0 ? (delta > 0 ? 0 : items.length - 1) : Math.max(0, Math.min(items.length - 1, index + delta));
      return workshopItemKey(items[nextIndex]!);
    });
  }, [items]);
  const runConfirmedItemAction = useCallback((action: WorkshopItemAction, item: WorkshopManagerItem): void => {
    if (
      action === 'use' && item.theme?.uiRuntime &&
      !window.confirm(t('workshopPage.confirm.uiRuntime'))
    ) {
      return;
    }
    void runItemAction(action, item, item.theme?.uiRuntime ? true : false);
  }, [runItemAction, t]);
  const runActivePrimary = useCallback(() => {
    const item = items.find((entry) => workshopItemKey(entry) === activeKey) ?? (items.length === 1 ? items[0] : undefined);
    const primary = item ? resolveWorkshopRowActions(item, t).find((action) => action.primary) : undefined;
    if (!item || !primary || !storageHealthy || reconcileRunning || mutationLocked) {
      return false;
    }
    runConfirmedItemAction(primary.action, item);
    return true;
  }, [activeKey, items, mutationLocked, reconcileRunning, runConfirmedItemAction, storageHealthy, t]);

  useEffect(() => {
    setActiveKey((current) => current && items.some((item) => workshopItemKey(item) === current) ? current : null);
  }, [items]);

  useEffect(() => {
    if (!activeKey) {
      return;
    }
    pageRef.current?.querySelector<HTMLElement>(`[data-row-key="${activeKey}"]`)?.scrollIntoView({
      block: 'nearest',
    });
  }, [activeKey]);

  useEffect(() => {
    if (autoOpenedDiscover.current || loading || !snapshot) {
      return;
    }
    autoOpenedDiscover.current = true;
    if (snapshot.items.length === 0 && snapshot.source.available) {
      setPane('discover');
    }
  }, [loading, snapshot]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const root = pageRef.current;
      if (!root || root.closest('[hidden]') || event.defaultPrevented || event.isComposing) {
        return;
      }
      const key = event.key;
      if (pane === 'author' || pane === 'control') {
        return;
      }
      const focusSearch = (event.ctrlKey || event.metaKey) && !event.altKey && key.toLowerCase() === 'f';
      const slashSearch = key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !isWorkshopTypingTarget(event.target);
      if (focusSearch || slashSearch) {
        event.preventDefault();
        const target = pane === 'discover' ? discoverSearchRef.current : searchRef.current;
        target?.focus();
        target?.select();
        return;
      }
      if (pane !== 'installed' || document.activeElement !== searchRef.current) {
        return;
      }
      if (key === 'ArrowDown') {
        event.preventDefault();
        moveActive(1);
        return;
      }
      if (key === 'ArrowUp') {
        event.preventDefault();
        moveActive(-1);
        return;
      }
      if (key === 'Enter') {
        if (runActivePrimary()) {
          event.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [moveActive, pane, runActivePrimary]);

  return (
    <main className="workshop-page" ref={pageRef}>
      <header className="workshop-masthead">
        <div className="workshop-masthead__copy">
          <h1>{t('workshopPage.title')}</h1>
          <p>{t('workshopPage.description')}</p>
        </div>
        <div className="workshop-masthead__actions">
          <button
            className="workshop-button"
            type="button"
            disabled={loading || refreshing || mutationLocked}
            data-spin={refreshing ? 'true' : 'false'}
            onClick={() => void refresh()}
          >
            <RefreshCw size={15} aria-hidden="true" />{refreshing ? t('workshopPage.refreshing') : t('workshopPage.refresh')}
          </button>
          <button
            className={`workshop-button${repairNeedsAttention ? ' workshop-button--primary' : ''}`}
            type="button"
            disabled={loading || mutationLocked}
            data-spin={reconcileRunning ? 'true' : 'false'}
            title={repairNeedsAttention ? t('workshopPage.repairTitle.attention') : t('workshopPage.repairTitle.ok')}
            onClick={() => void reconcile()}
          >
            <Wrench size={15} aria-hidden="true" />{reconcileRunning ? t('workshopPage.repairing') : t('workshopPage.repair')}
          </button>
        </div>
      </header>

      <div className="workshop-panes" role="tablist" aria-label={t('workshopPage.panes.aria')}>
        <button
          className="workshop-pane"
          type="button"
          role="tab"
          aria-label={t('workshopPage.pane.discover')}
          aria-selected={pane === 'discover'}
          onClick={() => setPane('discover')}
        >
          <Compass size={15} aria-hidden="true" />
          <span>{t('workshopPage.pane.discover')}</span>
        </button>
        <button
          className="workshop-pane"
          type="button"
          role="tab"
          aria-label={t('workshopPage.pane.installed')}
          aria-selected={pane === 'installed'}
          onClick={() => setPane('installed')}
        >
          <PackageCheck size={15} aria-hidden="true" />
          <span>{t('workshopPage.pane.installed')}</span>
          {totalCount > 0 ? <em className="workshop-pane__count">{totalCount}</em> : null}
        </button>
        <button
          className="workshop-pane"
          type="button"
          role="tab"
          aria-label={t('workshopPage.pane.author')}
          aria-selected={pane === 'author'}
          onClick={() => setPane('author')}
        >
          <Code2 size={15} aria-hidden="true" />
          <span>{t('workshopPage.pane.author')}</span>
        </button>
        <button
          className="workshop-pane"
          type="button"
          role="tab"
          aria-label={t('workshopPage.pane.control')}
          aria-selected={pane === 'control'}
          onClick={() => setPane('control')}
        >
          <Workflow size={15} aria-hidden="true" />
          <span>{t('workshopPage.pane.control')}</span>
        </button>
      </div>

      <WorkshopGuideEntry onOpenDiscover={() => setPane('discover')} />

      <section className="workshop-status" aria-label={t('workshopPage.status.aria')}>
        {snapshot && !snapshot.source.available ? (
          <button
            className="workshop-status__cell"
            type="button"
            data-ok="false"
            disabled={loading || refreshing || mutationLocked}
            onClick={() => void refresh()}
          >
            <span>{t('workshopPage.status.steam')}</span>
            <strong>{steamSourceLabel(snapshot, t)}</strong>
            <em>{t('workshopPage.status.retry')}</em>
          </button>
        ) : (
          <div className="workshop-status__cell" data-ok={snapshot?.source.available === true}>
            <span>{t('workshopPage.status.steam')}</span>
            <strong>{steamSourceLabel(snapshot, t)}</strong>
          </div>
        )}
        <div className="workshop-status__cell" data-ok={snapshot?.registry.writable === true}>
          <span>{t('workshopPage.status.registry')}</span>
          <strong>{snapshot?.registry.writable ? t('workshopPage.status.revision', { revision: snapshot.registry.revision }) : t('workshopPage.status.readOnly')}</strong>
        </div>
        <div className="workshop-status__cell" data-ok={snapshot?.catalog.writable === true}>
          <span>{t('workshopPage.status.catalog')}</span>
          <strong>{snapshot?.catalog.writable ? t('workshopPage.status.revision', { revision: snapshot.catalog.revision }) : t('workshopPage.status.readOnly')}</strong>
        </div>
        {snapshot?.reconcile.state === 'error' ? (
          <button
            className="workshop-status__cell"
            type="button"
            data-ok="false"
            disabled={loading || mutationLocked}
            onClick={() => void reconcile()}
          >
            <span>{t('workshopPage.status.repair')}</span>
            <strong>{t(workshopReconcileLabelKey('error'))}</strong>
            <em>{t('workshopPage.status.retry')}</em>
          </button>
        ) : (
          <div className="workshop-status__cell" data-ok={snapshot?.reconcile.state === 'ready'}>
            <span>{t('workshopPage.status.repair')}</span>
            <strong>{snapshot ? t(workshopReconcileLabelKey(snapshot.reconcile.state)) : t('workshopPage.status.waiting')}</strong>
          </div>
        )}
      </section>

      {!storageHealthy && snapshot ? (
        <div className="workshop-banner workshop-banner--warning" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{t('workshopPage.banner.readOnly')}</span>
        </div>
      ) : null}
      {error ? (
        <div className="workshop-banner workshop-banner--warning" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{error}</span>
          <button className="workshop-banner__dismiss" type="button" aria-label={t('workshopPage.banner.dismissError')} onClick={dismissError}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {notice ? (
        <div className="workshop-banner workshop-banner--success" role="status">
          <ShieldCheck size={16} aria-hidden="true" />
          <span>{notice}</span>
          <button className="workshop-banner__dismiss" type="button" aria-label={t('workshopPage.banner.dismissNotice')} onClick={dismissNotice}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {pane === 'author' ? (
        <WorkshopAuthoringStudio />
      ) : pane === 'control' ? (
        <WorkshopControlCenter items={snapshot?.items ?? []} onChanged={() => void refresh()} />
      ) : pane === 'discover' ? (
        <WorkshopBrowsePanel
          disabled={loading || mutationLocked}
          searchRef={discoverSearchRef}
          onSubscriptionChanged={(action, title) => {
            void refresh();
            if (action !== 'subscribe') {
              return;
            }
            announce(t('workshop.notice.subscribeNextAnnounce', { title }));
            setPane('installed');
          }}
        />
      ) : (
        <>
      <div className="workshop-controls">
        <label className="workshop-search echo-search-surface">
          <Search size={16} aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            placeholder={t('workshopPage.search.placeholder')}
            aria-label={t('workshopPage.search.aria')}
            aria-keyshortcuts="/ Control+F"
            aria-controls="workshop-board"
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                if (query) {
                  setQuery('');
                  return;
                }
                event.currentTarget.blur();
              }
            }}
          />
          {query ? (
            <EchoSearchFieldTools
              clearLabel={t('workshopPage.search.clear')}
              count={searchedItems.length}
              onClear={clearQuery}
            />
          ) : null}
        </label>
        <div
          className="workshop-filters"
          role="group"
          aria-label={t('workshopPage.filter.kindAria')}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') {
              return;
            }
            const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
            const index = buttons.indexOf(event.target as HTMLButtonElement);
            if (index < 0) {
              return;
            }
            event.preventDefault();
            const next = buttons[(index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length];
            next?.focus();
            next?.click();
          }}
        >
          {workshopKindFilters.map((filter) => (
            <button
              key={filter.id}
              className="workshop-filter"
              type="button"
              aria-pressed={kindFilter === filter.id}
              onClick={() => setKindFilter(filter.id)}
            >
              {t(workshopKindFilterLabelKey(filter.id))}
              <em>{kindCounts[filter.id]}</em>
            </button>
          ))}
        </div>
        <label className="workshop-state-filter">
          {t('workshopPage.filter.state')}
          <select
            value={stateFilter}
            aria-label={t('workshopPage.filter.stateAria')}
            onChange={(event) => setStateFilter(event.currentTarget.value as WorkshopStateFilter)}
          >
            {workshopStateFilters.map((filter) => (
              <option key={filter.id} value={filter.id}>
                {t(workshopStateFilterLabelKey(filter.id))} {stateCounts[filter.id]}
              </option>
            ))}
          </select>
        </label>
        <span className="workshop-controls__count" aria-live="polite">
          {items.length === totalCount
            ? t('workshopPage.count.items', { count: items.length })
            : t('workshopPage.count.filtered', { count: items.length, total: totalCount })}
        </span>
      </div>

      <section
        id="workshop-board"
        className={`workshop-board${!loading && items.length === 0 ? ' workshop-board--empty' : ''}`}
        aria-label={t('workshopPage.board.aria')}
        aria-busy={loading || refreshing || mutationLocked}
      >
        <table className="workshop-table">
          <thead>
            <tr>
              <th scope="col">{t('workshopPage.table.kind')}</th>
              <th scope="col">{t('workshopPage.table.content')}</th>
              <th scope="col">{t('workshopPage.table.state')}</th>
              <th scope="col">{t('workshopPage.table.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [0, 1, 2].map((index) => (
                <tr className="workshop-skeleton" key={index} aria-hidden="true">
                  <td><span /></td>
                  <td><span /><span /></td>
                  <td><span /></td>
                  <td><span /></td>
                </tr>
              ))
            ) : null}
            {!loading && items.length === 0 ? (
              <tr className="workshop-empty">
                <td colSpan={4}>
                  <PackageOpen size={28} aria-hidden="true" />
                  <strong>{emptyTitle}</strong>
                  <span>{emptyCopy}</span>
                  {emptyKindOrState ? (
                    <button className="workshop-button" type="button" onClick={resetFilters}>{t('workshopPage.empty.viewAll')}</button>
                  ) : !query.trim() ? (
                    <button className="workshop-button workshop-button--primary" type="button" onClick={() => setPane('discover')}>{t('workshopPage.empty.discover')}</button>
                  ) : null}
                </td>
              </tr>
            ) : null}
            {!loading ? items.map((item) => {
              const key = workshopItemKey(item);
              return (
                <WorkshopItemRow
                  key={key}
                  item={item}
                  busyKey={busyKey}
                  active={activeKey === key}
                  disabled={!storageHealthy || reconcileRunning}
                  onAction={runConfirmedItemAction}
                  onFilterKind={focusKind}
                />
              );
            }) : null}
          </tbody>
        </table>
      </section>
        </>
      )}
    </main>
  );
};
