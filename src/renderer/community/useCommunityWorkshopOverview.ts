import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  WorkshopBrowseItem,
  WorkshopBrowsePage,
  WorkshopManagerSnapshot,
} from '../../shared/types/workshop';
import { translateFallback, useOptionalI18n } from '../i18n/I18nProvider';

type CommunityWorkshopOverview = {
  snapshot: WorkshopManagerSnapshot | null;
  spotlightItems: WorkshopBrowseItem[];
  spotlightTotal: number;
  loading: boolean;
  refreshing: boolean;
  busyItemId: string | null;
  error: string | null;
};

const initialOverview: CommunityWorkshopOverview = {
  snapshot: null,
  spotlightItems: [],
  spotlightTotal: 0,
  loading: true,
  refreshing: false,
  busyItemId: null,
  error: null,
};

const browseOverview = (page: WorkshopBrowsePage): Pick<CommunityWorkshopOverview, 'spotlightItems' | 'spotlightTotal'> =>
  page.available
    ? { spotlightItems: page.items.slice(0, 3), spotlightTotal: page.total }
    : { spotlightItems: [], spotlightTotal: 0 };

export const useCommunityWorkshopOverview = () => {
  const t = useOptionalI18n()?.t ?? translateFallback;
  const [overview, setOverview] = useState<CommunityWorkshopOverview>(initialOverview);
  const requestSequenceRef = useRef(0);
  const bridge = window.echo?.workshop;

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'refresh'): Promise<void> => {
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    setOverview((current) => ({
      ...current,
      loading: mode === 'initial',
      refreshing: mode === 'refresh',
      error: null,
    }));

    if (!bridge?.getSnapshot || !bridge.browse) {
      setOverview((current) => ({
        ...current,
        loading: false,
        refreshing: false,
        error: t('communityPage.workshop.error.bridge'),
      }));
      return;
    }

    const [snapshotResult, browseResult] = await Promise.allSettled([
      bridge.getSnapshot(),
      bridge.browse({ page: 1, sort: 'trend' }),
    ]);
    if (requestSequenceRef.current !== requestSequence) {
      return;
    }

    const nextSnapshot = snapshotResult.status === 'fulfilled' ? snapshotResult.value : null;
    const nextBrowse = browseResult.status === 'fulfilled' && browseResult.value.available
      ? browseOverview(browseResult.value)
      : null;
    const failedParts = [
      snapshotResult.status === 'rejected' ? t('communityPage.workshop.error.localState') : null,
      browseResult.status === 'rejected' || (browseResult.status === 'fulfilled' && !browseResult.value.available)
        ? t('communityPage.workshop.error.trending')
        : null,
    ].filter(Boolean);

    setOverview((current) => ({
      ...current,
      snapshot: nextSnapshot ?? current.snapshot,
      ...(nextBrowse ?? {
        spotlightItems: current.spotlightItems,
        spotlightTotal: current.spotlightTotal,
      }),
      loading: false,
      refreshing: false,
      error: failedParts.length > 0
        ? t('communityPage.workshop.error.partial', { parts: failedParts.join(t('communityPage.workshop.error.joiner')) })
        : null,
    }));
  }, [bridge, t]);

  useEffect(() => {
    void load('initial');
    return () => {
      requestSequenceRef.current += 1;
    };
  }, [load]);

  const openItemInSteam = useCallback(async (itemId: string): Promise<void> => {
    if (!bridge?.openInSteam || overview.busyItemId) {
      return;
    }
    setOverview((current) => ({ ...current, busyItemId: itemId, error: null }));
    try {
      const result = await bridge.openInSteam({ sourceId: 'steam', itemId });
      setOverview((current) => ({
        ...current,
        error: result.ok ? null : t('communityPage.workshop.error.openSteam'),
      }));
    } catch {
      setOverview((current) => ({ ...current, error: t('communityPage.workshop.error.openSteam') }));
    } finally {
      setOverview((current) => ({ ...current, busyItemId: null }));
    }
  }, [bridge, overview.busyItemId, t]);

  return {
    ...overview,
    refresh: () => load('refresh'),
    openItemInSteam,
  };
};
