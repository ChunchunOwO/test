import {
  ArrowRight,
  CircleAlert,
  ExternalLink,
  PackageCheck,
  RefreshCw,
  Sparkles,
  WifiOff,
} from 'lucide-react';
import { useMemo } from 'react';
import type { WorkshopBrowseItem, WorkshopManagerSnapshot } from '../../shared/types/workshop';
import { translateFallback, useOptionalI18n } from '../i18n/I18nProvider';
import { WorkshopProtocolImage } from '../workshop/WorkshopProtocolImage';
import { navigateToWorkshopPane } from '../workshop/workshopNavigation';
import { useCommunityWorkshopOverview } from './useCommunityWorkshopOverview';

const isWorkshopPreviewUrl = (value: string | null): value is string =>
  typeof value === 'string' && value.startsWith('echo-workshop://preview/');

const readSnapshotMetrics = (snapshot: WorkshopManagerSnapshot | null) => {
  if (!snapshot) {
    return { subscriptions: null, enabled: null, attention: null, available: false };
  }
  const attention = snapshot.items.filter((item) => (
    item.state === 'error' ||
    item.state === 'quarantined' ||
    item.state === 'not-ingested' ||
    item.subscription?.needsUpdate ||
    item.subscription?.downloading ||
    item.subscription?.downloadPending
  )).length;
  return {
    subscriptions: snapshot.source.available ? snapshot.source.items.length : null,
    enabled: snapshot.items.filter((item) => item.enabled).length,
    attention,
    available: snapshot.source.available,
  };
};

const WorkshopSpotlightCard = ({
  item,
  busy,
  disabled,
  onOpen,
}: {
  item: WorkshopBrowseItem;
  busy: boolean;
  disabled: boolean;
  onOpen: (itemId: string) => void;
}): JSX.Element => {
  const t = useOptionalI18n()?.t ?? translateFallback;
  const locale = useOptionalI18n()?.locale ?? 'zh-CN';
  const compactNumberFormatter = useMemo(() => new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }), [locale]);
  const compactCount = (value: number | null): string =>
    value === null ? '—' : compactNumberFormatter.format(Math.max(0, value));
  const previewUrl = isWorkshopPreviewUrl(item.previewUrl) ? item.previewUrl : null;
  const tags = item.tags.slice(0, 2);
  return (
    <article className="community-spotlight-card">
      <div className="community-spotlight-card__preview" aria-hidden="true">
        {previewUrl
          ? <WorkshopProtocolImage allowedPrefix="echo-workshop://preview/" src={previewUrl} />
          : <Sparkles size={25} />}
        {item.subscribed ? <span>{t('communityPage.workshop.subscribedBadge')}</span> : null}
      </div>
      <div className="community-spotlight-card__copy">
        <div className="community-spotlight-card__tags">
          {tags.length > 0 ? tags.map((tag) => <span key={tag}>{tag}</span>) : <span>{t('communityPage.workshop.communityWork')}</span>}
        </div>
        <strong>{item.title}</strong>
        <p>{item.description || t('communityPage.workshop.defaultDescription')}</p>
        <div className="community-spotlight-card__meta">
          <span>{t('communityPage.workshop.upvotes', { count: compactCount(item.numUpvotes) })}</span>
          {item.subscriptionCount !== null ? <span>{t('communityPage.workshop.subscriptions', { count: compactCount(item.subscriptionCount) })}</span> : null}
        </div>
      </div>
      <button
        type="button"
        disabled={disabled}
        aria-busy={busy}
        aria-label={t('communityPage.workshop.viewInSteamAria', { title: item.title })}
        onClick={() => onOpen(item.itemId)}
      >
        {busy ? t('communityPage.workshop.opening') : t('communityPage.workshop.viewInSteam')} <ExternalLink size={13} aria-hidden="true" />
      </button>
    </article>
  );
};

export const CommunityWorkshopOverview = (): JSX.Element => {
  const t = useOptionalI18n()?.t ?? translateFallback;
  const locale = useOptionalI18n()?.locale ?? 'zh-CN';
  const compactNumberFormatter = useMemo(() => new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }), [locale]);
  const compactCount = (value: number | null): string =>
    value === null ? '—' : compactNumberFormatter.format(Math.max(0, value));
  const {
    snapshot,
    spotlightItems,
    spotlightTotal,
    loading,
    refreshing,
    busyItemId,
    error,
    refresh,
    openItemInSteam,
  } = useCommunityWorkshopOverview();
  const metrics = readSnapshotMetrics(snapshot);

  return (
    <section className="community-workshop" aria-labelledby="community-workshop-title" aria-busy={loading || refreshing}>
      <header className="community-workshop__header">
        <div>
          <span>{t('communityPage.workshop.kicker')}</span>
          <h2 id="community-workshop-title">{t('communityPage.workshop.title')}</h2>
          <p>{t('communityPage.workshop.description')}</p>
        </div>
        <div className="community-workshop__actions">
          <button type="button" disabled={loading || refreshing} onClick={() => void refresh()}>
            <RefreshCw size={14} aria-hidden="true" />{refreshing ? t('communityPage.workshop.refreshing') : t('communityPage.workshop.refresh')}
          </button>
          <button className="community-workshop__discover" type="button" onClick={() => navigateToWorkshopPane('discover')}>
            {t('communityPage.workshop.browseAll')} <ArrowRight size={14} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="community-workshop__body">
        <div className="community-workshop__status">
          <div className="community-workshop__source" data-available={metrics.available}>
            {loading ? <RefreshCw size={17} aria-hidden="true" /> : metrics.available ? <PackageCheck size={17} aria-hidden="true" /> : <WifiOff size={17} aria-hidden="true" />}
            <div>
              <span>{t('communityPage.workshop.source')}</span>
              <strong>{loading ? t('communityPage.workshop.connecting') : metrics.available ? t('communityPage.workshop.connected') : t('communityPage.workshop.unavailable')}</strong>
            </div>
          </div>
          <div className="community-workshop__metrics">
            <button type="button" onClick={() => navigateToWorkshopPane('installed')}>
              <span>{t('communityPage.workshop.subscribed')}</span><strong>{compactCount(metrics.subscriptions)}</strong><em>{t('communityPage.workshop.viewContent')}</em>
            </button>
            <button type="button" onClick={() => navigateToWorkshopPane('installed')}>
              <span>{t('communityPage.workshop.enabled')}</span><strong>{compactCount(metrics.enabled)}</strong><em>{t('communityPage.workshop.manageState')}</em>
            </button>
            <button type="button" data-attention={Boolean(metrics.attention)} onClick={() => navigateToWorkshopPane('installed')}>
              <span>{t('communityPage.workshop.attention')}</span><strong>{compactCount(metrics.attention)}</strong><em>{t('communityPage.workshop.checkItems')}</em>
            </button>
          </div>
          <p className="community-workshop__safety">
            <PackageCheck size={15} aria-hidden="true" />{t('communityPage.workshop.safety')}
          </p>
        </div>

        <div className="community-workshop__spotlight">
          <div className="community-workshop__spotlight-title">
            <div>
              <span>{t('communityPage.workshop.spotlight')}</span>
              <strong>{loading ? t('communityPage.workshop.readingTrend') : spotlightTotal > 0 ? t('communityPage.workshop.discoverableCount', { count: compactCount(spotlightTotal) }) : t('communityPage.workshop.trendContent')}</strong>
            </div>
            {error ? <p role="status"><CircleAlert size={14} aria-hidden="true" />{error}</p> : null}
          </div>
          {loading && spotlightItems.length === 0 ? (
            <div className="community-spotlight-skeleton" aria-hidden="true">
              <span /><span /><span />
            </div>
          ) : spotlightItems.length > 0 ? (
            <div className="community-spotlight-grid">
              {spotlightItems.map((item) => (
                <WorkshopSpotlightCard
                  key={item.itemId}
                  item={item}
                  busy={busyItemId === item.itemId}
                  disabled={busyItemId !== null}
                  onOpen={(itemId) => void openItemInSteam(itemId)}
                />
              ))}
            </div>
          ) : (
            <button className="community-workshop__empty" type="button" onClick={() => navigateToWorkshopPane('discover')}>
              <Sparkles size={24} aria-hidden="true" />
              <span><strong>{t('communityPage.workshop.emptyTitle')}</strong><small>{t('communityPage.workshop.emptyHint')}</small></span>
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
