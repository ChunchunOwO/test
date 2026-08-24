import { useCallback, useEffect, useState } from 'react';
import type {
  WorkshopBrowseItem,
  WorkshopBrowsePage,
  WorkshopBrowseSort,
  WorkshopManagerActionResult,
} from '../../shared/types/workshop';
import { useWorkshopTranslate } from './workshopI18n';

const emptyPage = (
  reason: Extract<WorkshopBrowsePage, { available: false }>['reason'] = 'source-unavailable',
): WorkshopBrowsePage => ({
  available: false,
  reason,
  page: 1,
  total: 0,
  items: [],
});

export const useWorkshopBrowse = () => {
  const t = useWorkshopTranslate();
  const bridge = window.echo?.workshop;
  const [page, setPage] = useState<WorkshopBrowsePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQueryInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sort, setSortValue] = useState<WorkshopBrowseSort>('trend');
  const [pageNumber, setPageNumber] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 280);
    return () => window.clearTimeout(timer);
  }, [query]);

  const load = useCallback(async (
    nextPage: number,
    nextSort: WorkshopBrowseSort,
    nextQuery: string,
  ): Promise<void> => {
    if (!bridge || typeof bridge.browse !== 'function') {
      setPage(emptyPage());
      setError(t('workshop.browse.error.missing'));
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await bridge.browse({
        page: nextPage,
        sort: nextSort,
        ...(nextQuery ? { searchText: nextQuery } : {}),
      });
      setPage(result);
      setError(result.available ? null : (
        result.reason === 'source-unavailable'
          ? t('workshop.browse.error.unavailable')
          : result.reason === 'invalid-request'
            ? t('workshop.browse.error.invalid')
            : t('workshop.browse.error.query')
      ));
    } catch {
      setPage(emptyPage('query-failed'));
      setError(t('workshop.browse.error.read'));
    } finally {
      setLoading(false);
    }
  }, [bridge, t]);

  useEffect(() => {
    void load(pageNumber, sort, debouncedQuery);
  }, [debouncedQuery, load, pageNumber, sort]);

  const runItemAction = useCallback(async (
    action: 'subscribe' | 'unsubscribe' | 'open-in-steam',
    item: WorkshopBrowseItem,
  ): Promise<WorkshopManagerActionResult | null> => {
    if (!bridge || busyItemId) {
      return null;
    }
    setBusyItemId(item.itemId);
    try {
      const request = { sourceId: 'steam', itemId: item.itemId };
      const result = action === 'subscribe'
        ? await bridge.subscribe(request)
        : action === 'unsubscribe'
          ? await bridge.unsubscribe(request)
          : await bridge.openInSteam(request);
      if (!result.ok) {
        setError(action === 'subscribe'
          ? t('workshop.browse.error.subscribe')
          : action === 'unsubscribe'
            ? t('workshop.browse.error.unsubscribe')
            : t('workshop.browse.error.openSteam'));
      } else {
        setError(null);
        if (action !== 'open-in-steam') {
          setPage((current) => current && current.available
            ? {
                ...current,
                items: current.items.map((entry) => entry.itemId === item.itemId
                  ? { ...entry, subscribed: action === 'subscribe' }
                  : entry),
              }
            : current);
        }
      }
      return result;
    } catch {
      setError(action === 'subscribe'
        ? t('workshop.browse.error.subscribeRequest')
        : action === 'unsubscribe'
          ? t('workshop.browse.error.unsubscribeRequest')
          : t('workshop.browse.error.openSteamRequest'));
      return null;
    } finally {
      setBusyItemId(null);
    }
  }, [bridge, busyItemId, t]);

  return {
    page,
    loading,
    busyItemId,
    error,
    query,
    sort,
    pageNumber,
    setQuery: (value: string) => {
      setQueryInput(value);
      setPageNumber(1);
    },
    setSort: (value: WorkshopBrowseSort) => {
      setSortValue(value);
      setPageNumber(1);
    },
    setPageNumber,
    refresh: () => load(pageNumber, sort, debouncedQuery),
    runItemAction,
    dismissError: () => setError(null),
  };
};
