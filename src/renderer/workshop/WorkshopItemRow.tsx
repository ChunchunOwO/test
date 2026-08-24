import { Download, LoaderCircle, Power, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import type { WorkshopContentKind, WorkshopManagerItem } from '../../shared/types/workshop';
import { workshopKindLabelKey, workshopStateLabelKey, useWorkshopTranslate } from './workshopI18n';
import {
  formatWorkshopBytes,
  formatWorkshopDownloadProgress,
  describeWorkshopTheme,
  resolveWorkshopRowActions,
  workshopItemHasIssue,
  workshopItemKey,
  type WorkshopItemAction,
} from './workshopItemModel';

type WorkshopItemRowProps = {
  item: WorkshopManagerItem;
  busyKey: string | null;
  active?: boolean;
  disabled?: boolean;
  onAction: (action: WorkshopItemAction, item: WorkshopManagerItem) => void;
  onFilterKind: (kind: WorkshopContentKind) => void;
};

const WorkshopActionIcon = ({ action, busy }: { action: WorkshopItemAction; busy: boolean }): JSX.Element => {
  if (busy) {
    return <LoaderCircle size={14} aria-hidden="true" />;
  }
  if (action === 'download') {
    return <Download size={14} aria-hidden="true" />;
  }
  if (action === 'ingest') {
    return <RefreshCw size={14} aria-hidden="true" />;
  }
  if (action === 'enable') {
    return <ShieldCheck size={14} aria-hidden="true" />;
  }
  if (action === 'disable') {
    return <Power size={14} aria-hidden="true" />;
  }
  return <Sparkles size={14} aria-hidden="true" />;
};

export const WorkshopItemRow = ({
  item,
  busyKey,
  active = false,
  disabled = false,
  onAction,
  onFilterKind,
}: WorkshopItemRowProps): JSX.Element => {
  const t = useWorkshopTranslate();
  const actions = resolveWorkshopRowActions(item, t);
  const themeDetails = describeWorkshopTheme(item, t);
  const progress = formatWorkshopDownloadProgress(item);
  const title = item.theme?.title ?? item.audioPluginProfile?.title ?? item.contentId ?? `Steam Workshop #${item.itemId}`;
  const kind = item.contentKind;
  const isIssue = workshopItemHasIssue(item);
  const installSize = formatWorkshopBytes(item.subscription?.install?.sizeOnDiskBytes);
  const rowBusy = Boolean(busyKey?.endsWith(`:${item.sourceId}:${item.itemId}`));
  const flags = [
    item.subscription?.subscribed ? t('workshop.row.subscribed') : null,
    item.subscription?.installed ? t('workshop.row.installed') : null,
    installSize,
    item.catalogReady ? t('workshop.row.catalogReady') : null,
    item.subscription?.needsUpdate ? t('workshop.row.hasUpdate') : null,
    item.subscription?.downloadPending ? t('workshop.row.waitDownload') : null,
    progress !== null
      ? t('workshop.row.downloadPercent', { progress })
      : item.subscription?.downloading
        ? t('workshop.row.downloading')
        : null,
  ].filter((flag): flag is string => Boolean(flag));

  return (
    <tr
      className="workshop-row"
      data-row-key={workshopItemKey(item)}
      data-state={item.state}
      data-issue={isIssue ? 'true' : 'false'}
      data-active={active ? 'true' : 'false'}
      aria-busy={rowBusy}
    >
      <td className="workshop-row__kind">
        {kind ? (
          <button
            className="workshop-row__kind-btn"
            type="button"
            onClick={() => onFilterKind(kind)}
          >
            {t(workshopKindLabelKey(kind))}
          </button>
        ) : t('workshop.kind.unknown')}
      </td>
      <td className="workshop-row__content">
        <strong title={title}>{title}</strong>
        {item.theme ? (
          <div className="workshop-row__theme-preview">
            {item.theme.swatches.length > 0 ? (
              <span className="workshop-row__swatches" aria-label={t('workshop.row.swatchesAria')}>
                {item.theme.swatches.map((color) => (
                  <i key={color} style={{ backgroundColor: color }} title={color} />
                ))}
              </span>
            ) : null}
            <span>{themeDetails.join(' · ')}</span>
          </div>
        ) : null}
        {item.theme?.description ? <p className="workshop-row__theme-description">{item.theme.description}</p> : null}
        {item.theme?.uiRuntime ? (
          <p className="workshop-row__note">{t('workshop.row.uiRuntimeNote')}</p>
        ) : null}
        {item.audioPluginProfile ? (
          <div className="workshop-row__theme-preview">
            <span>
              {t('workshop.row.pluginSummary', {
                format: item.audioPluginProfile.format.toUpperCase(),
                role: item.audioPluginProfile.role === 'instrument' ? t('workshop.row.instrument') : t('workshop.row.effect'),
                vendor: item.audioPluginProfile.plugin.vendor,
                name: item.audioPluginProfile.plugin.name,
                presets: item.audioPluginProfile.presetCount,
                parameters: item.audioPluginProfile.parameterCount,
              })}
            </span>
          </div>
        ) : null}
        {item.audioPluginProfile?.description ? <p className="workshop-row__theme-description">{item.audioPluginProfile.description}</p> : null}
        {item.audioPluginProfile ? (
          <p className="workshop-row__note">
            {t('workshop.row.pluginDllNote', { version: item.audioPluginProfile.runtime.minimumVersion })}
          </p>
        ) : null}
        <p>
          <span>{item.sourceId}</span>
          <span>#{item.itemId}</span>
          {item.version ? <span>v{item.version}</span> : null}
        </p>
        {flags.length > 0 ? (
          <ul className="workshop-row__flags">
            {flags.map((flag) => <li key={flag}>{flag}</li>)}
          </ul>
        ) : null}
        {item.errorCode ? <p className="workshop-row__alert">{t('workshop.row.errorCode', { code: item.errorCode })}</p> : null}
        {item.enabled && !item.catalogReady ? (
          <p className="workshop-row__alert">{t('workshop.row.catalogMismatch')}</p>
        ) : null}
        {item.contentKind === 'plugin-package' ? (
          <p className="workshop-row__note">{t('workshop.row.pluginNote')}</p>
        ) : null}
        {progress !== null || item.subscription?.downloading ? (
          <div
            className="workshop-row__meter"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress ?? undefined}
            aria-label={t('workshop.row.downloadProgress')}
          >
            <span style={{ width: `${progress ?? 12}%` }} data-indeterminate={progress === null ? 'true' : 'false'} />
          </div>
        ) : null}
      </td>
      <td className="workshop-row__state">
        <span data-state={item.theme?.active ? 'current-theme' : item.subscription?.downloading ? 'downloading' : item.state}>
          {item.theme?.active
            ? t('workshop.state.currentTheme')
            : item.subscription?.downloading
              ? t('workshop.state.downloading')
              : t(workshopStateLabelKey(item.state))}
        </span>
      </td>
      <td className="workshop-row__actions">
        <div className="workshop-row__action-list">
        {actions.length === 0 ? <span className="workshop-row__idle">{t('workshop.action.none')}</span> : null}
        {actions.map((action) => {
          const actionKey = `${action.action}:${item.sourceId}:${item.itemId}`;
          const busy = busyKey === actionKey;
          return (
            <button
              className={`workshop-button${action.primary ? ' workshop-button--primary' : ''}`}
              key={action.action}
              type="button"
              disabled={disabled || Boolean(busyKey) || item.subscription?.downloading === true}
              aria-busy={busy}
              data-spin={busy ? 'true' : 'false'}
              onClick={() => onAction(action.action, item)}
            >
              <WorkshopActionIcon action={action.action} busy={busy} />
              {busy ? t('workshop.action.processing') : action.label}
            </button>
          );
        })}
        </div>
      </td>
    </tr>
  );
};
