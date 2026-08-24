import { ExternalLink, PackageOpen, RefreshCw, Search, X } from 'lucide-react';
import { useMemo, useRef } from 'react';
import type { Ref } from 'react';
import { workshopBrowsePageSize, type WorkshopBrowseSort } from '../../shared/types/workshop';
import { WorkshopProtocolImage } from './WorkshopProtocolImage';
import { useWorkshopBrowse } from './useWorkshopBrowse';
import { useWorkshopLocale, useWorkshopTranslate } from './workshopI18n';

const sortOptions: WorkshopBrowseSort[] = ['trend', 'votes', 'recent'];

const isWorkshopPreviewProtocolUrl = (value: string | null): value is string =>
  typeof value === 'string' && value.startsWith('echo-workshop://preview/');

type WorkshopBrowsePanelProps = {
  disabled?: boolean;
  searchRef?: Ref<HTMLInputElement>;
  onSubscriptionChanged?: (action: 'subscribe' | 'unsubscribe', title: string) => void;
};

export const WorkshopBrowsePanel = ({
  disabled = false,
  searchRef,
  onSubscriptionChanged,
}: WorkshopBrowsePanelProps): JSX.Element => {
  const t = useWorkshopTranslate();
  const locale = useWorkshopLocale();
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }), [locale]);
  const formatWorkshopUpdatedAt = (unixSeconds: number): string | null => {
    if (!Number.isSafeInteger(unixSeconds) || unixSeconds <= 0) {
      return null;
    }
    const date = new Date(unixSeconds * 1000);
    return Number.isNaN(date.getTime()) ? null : dateFormatter.format(date);
  };
  const localSearchRef = useRef<HTMLInputElement>(null);
  const inputRef = searchRef ?? localSearchRef;
  const {
    page,
    loading,
    busyItemId,
    error,
    query,
    sort,
    pageNumber,
    setQuery,
    setSort,
    setPageNumber,
    refresh,
    runItemAction,
    dismissError,
  } = useWorkshopBrowse();
  const items = page?.available ? page.items : [];
  const total = page?.available ? page.total : 0;
  const hasNext = page?.available === true && pageNumber * workshopBrowsePageSize < total;
  const showPager = page?.available === true && (total > workshopBrowsePageSize || pageNumber > 1);
  const mutationLocked = Boolean(busyItemId) || disabled;
  const sortLabel = (id: WorkshopBrowseSort): string => {
    if (id === 'votes') {
      return t('workshop.browse.sort.votes');
    }
    if (id === 'recent') {
      return t('workshop.browse.sort.recent');
    }
    return t('workshop.browse.sort.trend');
  };

  return (
    <section className="workshop-discover" aria-label={t('workshop.browse.aria')} aria-busy={loading || mutationLocked}>
      <div className="workshop-controls">
        <label className="workshop-search">
          <Search size={16} aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            placeholder={t('workshop.browse.searchPlaceholder')}
            aria-label={t('workshop.browse.searchAria')}
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
            <button className="workshop-search__clear" type="button" aria-label={t('workshop.browse.clear')} onClick={() => setQuery('')}>
              <X size={14} aria-hidden="true" />
            </button>
          ) : null}
        </label>
        <div className="workshop-filters" role="group" aria-label={t('workshop.browse.sortAria')}>
          {sortOptions.map((option) => (
            <button
              key={option}
              className="workshop-filter"
              type="button"
              aria-pressed={sort === option}
              onClick={() => setSort(option)}
            >
              {sortLabel(option)}
            </button>
          ))}
        </div>
        <span className="workshop-controls__count" aria-live="polite">
          {loading
            ? t('workshop.browse.updating')
            : page?.available
              ? t('workshop.browse.count', { count: items.length, total })
              : t('workshop.browse.countEmpty')}
        </span>
        <button
          className="workshop-button workshop-button--compact"
          type="button"
          disabled={mutationLocked || loading}
          data-spin={loading ? 'true' : 'false'}
          onClick={() => void refresh()}
        >
          <RefreshCw size={14} aria-hidden="true" />{t('workshop.browse.refresh')}
        </button>
      </div>

      {error ? (
        <div className="workshop-banner workshop-banner--warning" role="alert">
          <span>{error}</span>
          <button className="workshop-banner__dismiss" type="button" aria-label={t('workshop.browse.dismissError')} onClick={dismissError}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {loading && items.length === 0 ? (
        <div className="workshop-discover__empty" aria-hidden="true">
          <span className="workshop-discover__skeleton" />
          <span className="workshop-discover__skeleton" />
        </div>
      ) : null}

      {!loading && items.length === 0 ? (
        <div className="workshop-discover__empty">
          <PackageOpen size={28} aria-hidden="true" />
          <strong>{page?.available === false ? t('workshop.browse.empty.unavailable.title') : t('workshop.browse.empty.none.title')}</strong>
          <span>
            {page?.available === false
              ? t('workshop.browse.empty.unavailable.copy')
              : t('workshop.browse.empty.none.copy')}
          </span>
        </div>
      ) : null}

      {items.length > 0 ? (
        <ul className="workshop-discover__list">
          {items.map((item) => {
            const previewUrl = isWorkshopPreviewProtocolUrl(item.previewUrl) ? item.previewUrl : null;
            const busy = busyItemId === item.itemId;
            const updatedAt = formatWorkshopUpdatedAt(item.updatedAtUnixSeconds);
            const totalVotes = item.numUpvotes + item.numDownvotes;
            const approval = totalVotes > 0
              ? t('workshop.browse.approval', { percent: Math.round((item.numUpvotes / totalVotes) * 100) })
              : null;
            return (
              <li className="workshop-discover__item" key={item.itemId}>
                <div className="workshop-discover__preview" aria-hidden="true">
                  {previewUrl
                    ? <WorkshopProtocolImage allowedPrefix="echo-workshop://preview/" src={previewUrl} />
                    : <span />}
                </div>
                <div className="workshop-discover__copy">
                  <strong>{item.title}</strong>
                  {item.description ? <p>{item.description}</p> : null}
                  {item.tags.length > 0 ? (
                    <ul className="workshop-row__flags">
                      {item.tags.map((tag) => <li key={tag}>{tag}</li>)}
                    </ul>
                  ) : null}
                  <p className="workshop-discover__meta">
                    <span>#{item.itemId}</span>
                    {item.subscribed ? <strong>{t('workshop.browse.subscribed')}</strong> : null}
                    {approval ? <span>{approval}</span> : <span>{t('workshop.browse.upvotes', { count: item.numUpvotes })}</span>}
                    {item.subscriptionCount !== null ? <span>{t('workshop.browse.subscriptions', { count: item.subscriptionCount })}</span> : null}
                    {updatedAt ? <span>{t('workshop.browse.updated', { date: updatedAt })}</span> : null}
                  </p>
                </div>
                <div className="workshop-row__action-list">
                  <button
                    className={`workshop-button${item.subscribed ? '' : ' workshop-button--primary'}`}
                    type="button"
                    disabled={mutationLocked}
                    aria-busy={busy}
                    onClick={() => {
                      void runItemAction(item.subscribed ? 'unsubscribe' : 'subscribe', item).then((result) => {
                        if (result?.ok) {
                          onSubscriptionChanged?.(item.subscribed ? 'unsubscribe' : 'subscribe', item.title);
                        }
                      });
                    }}
                  >
                    {busy ? t('workshop.action.processing') : item.subscribed ? t('workshop.browse.unsubscribe') : t('workshop.browse.subscribe')}
                  </button>
                  <button
                    className="workshop-button"
                    type="button"
                    disabled={mutationLocked}
                    onClick={() => void runItemAction('open-in-steam', item)}
                  >
                    <ExternalLink size={14} aria-hidden="true" />{t('workshop.browse.openSteam')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {showPager ? (
        <div className="workshop-discover__pager">
          <button
            className="workshop-button"
            type="button"
            disabled={mutationLocked || pageNumber <= 1}
            onClick={() => setPageNumber(Math.max(1, pageNumber - 1))}
          >
            {t('workshop.browse.prev')}
          </button>
          <span>{t('workshop.browse.page', { page: pageNumber })}</span>
          <button
            className="workshop-button"
            type="button"
            disabled={mutationLocked || !hasNext}
            onClick={() => setPageNumber(pageNumber + 1)}
          >
            {t('workshop.browse.next')}
          </button>
        </div>
      ) : null}
    </section>
  );
};
