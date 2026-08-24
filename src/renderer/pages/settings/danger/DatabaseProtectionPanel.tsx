import {
  Database,
  FileText,
  FolderOpen,
  Power,
  RotateCw,
  Save,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import type {
  LibraryDatabaseMaintenanceEventInfo,
  LibraryDatabaseProtectionStatus,
} from '../../../../shared/types/library';
import type { TranslationKey } from '../../../i18n/locales';
import {
  formatProtectionTimestamp,
  formatUpdateBytes,
  getDatabaseHealthLabel,
} from '../diagnostics/settingsDiagnosticsFormat';

type Translate = (
  key: TranslationKey,
  options?: Record<string, string | number>,
) => string;

export type DatabaseProtectionBusyAction =
  | 'refresh'
  | 'snapshot'
  | 'restore'
  | 'scrub'
  | 'discard'
  | 'relaunch'
  | 'open'
  | null;

type DatabaseProtectionPanelProps = {
  busy: boolean;
  busyAction: DatabaseProtectionBusyAction;
  dataProtectionDisabled: boolean;
  diagnosticsBusy: boolean;
  error: string | null;
  message: string | null;
  onCreateSnapshot: () => void;
  onDiscardQuarantinedTracks: () => void;
  onExportDiagnostics: () => void;
  onOpenFolder: () => void;
  onPrimaryRecovery: () => void;
  onRefresh: () => void;
  onRelaunchRecovery: () => void;
  status: LibraryDatabaseProtectionStatus | null;
  t: Translate;
};

const DATABASE_EVENT_LABELS: Record<LibraryDatabaseMaintenanceEventInfo['action'], TranslationKey> = {
  'manual-repair': 'settings.danger.database.event.manual-repair',
  'manual-delete': 'settings.danger.database.event.manual-delete',
  'manual-restore': 'settings.danger.database.event.manual-restore',
  'manual-scrub-quarantined': 'settings.danger.database.event.manual-scrub-quarantined',
  'manual-discard-quarantined': 'settings.danger.database.event.manual-discard-quarantined',
  'startup-protected': 'settings.danger.database.event.startup-protected',
  'startup-poisoned': 'settings.danger.database.event.startup-poisoned',
  'startup-auto-repair': 'settings.danger.database.event.startup-auto-repair',
  'scan-health-failed': 'settings.danger.database.event.scan-health-failed',
  'scan-auto-restore': 'settings.danger.database.event.scan-auto-restore',
};

export const DatabaseProtectionPanel = ({
  busy,
  busyAction,
  dataProtectionDisabled,
  diagnosticsBusy,
  error,
  message,
  onCreateSnapshot,
  onDiscardQuarantinedTracks,
  onExportDiagnostics,
  onOpenFolder,
  onPrimaryRecovery,
  onRefresh,
  onRelaunchRecovery,
  status,
  t,
}: DatabaseProtectionPanelProps): JSX.Element => {
  const healthStatus = status?.health.status;
  const latestHealthySnapshot = status?.latestHealthySnapshot ?? null;
  const recommendedAction = status?.recommendedAction ?? 'none';
  const quarantined = recommendedAction === 'scrub-quarantined-database';
  const unrecoverable = recommendedAction === 'rebuild-empty-database';
  const unhealthy = quarantined || Boolean(healthStatus && healthStatus !== 'ok');
  const badgeLabel = quarantined
    ? t('settings.danger.database.badge.quarantined')
    : t(getDatabaseHealthLabel(healthStatus));
  const description = !status
    ? t('settings.danger.database.description.loading')
    : quarantined
      ? t('settings.danger.database.description.quarantined')
      : healthStatus === 'ok'
        ? t('settings.danger.database.description.healthy')
        : unrecoverable
          ? t('settings.danger.database.description.unrecoverable')
          : t('settings.danger.database.description.recoverable');
  const recoverySteps = quarantined
    ? [
        t('settings.danger.database.steps.quarantined.1'),
        t('settings.danger.database.steps.quarantined.2'),
        t('settings.danger.database.steps.quarantined.3'),
      ]
    : unrecoverable
      ? [
          t('settings.danger.database.steps.unrecoverable.1'),
          t('settings.danger.database.steps.unrecoverable.2'),
          t('settings.danger.database.steps.unrecoverable.3'),
        ]
      : [
          t('settings.danger.database.steps.recoverable.1'),
          t('settings.danger.database.steps.recoverable.2'),
          t('settings.danger.database.steps.recoverable.3'),
        ];
  const primaryActionLabel = quarantined
    ? t('settings.danger.database.action.scrub')
    : unrecoverable
      ? t('settings.danger.database.action.rebuild')
      : t('settings.danger.database.action.restore');
  const primaryActionBusyLabel = quarantined
    ? t('settings.danger.database.action.scrubbing')
    : unrecoverable
      ? t('settings.danger.database.action.rebuilding')
      : t('settings.danger.database.action.restoring');
  const primaryActionDisabled =
    busy ||
    Boolean(status?.hasRunningScan) ||
    (quarantined
      ? !status?.canScrubQuarantinedDatabase
      : unrecoverable
        ? !status
        : !latestHealthySnapshot);
  const primaryUnavailableReason = status?.hasRunningScan
    ? null
    : quarantined && !status?.canScrubQuarantinedDatabase
      ? t('settings.danger.database.unavailable.scrub')
      : !quarantined && !unrecoverable && !latestHealthySnapshot
        ? t('settings.danger.database.unavailable.restore')
        : null;
  const pathLabel = status?.databasePath ?? t('settings.danger.database.meta.pending');
  const snapshotValue = latestHealthySnapshot
    ? formatProtectionTimestamp(latestHealthySnapshot.createdAt)
    : t('settings.danger.database.meta.noSnapshot');
  const archiveValue = status?.latestArchive
    ? formatProtectionTimestamp(status.latestArchive.createdAt)
    : t('settings.danger.database.meta.noArchive');
  const latestEvent = status?.maintenanceEvents[0] ?? null;
  const StatusIcon = unhealthy ? ShieldAlert : Database;

  return (
    <div className="settings-database-protection danger-db" data-health={healthStatus ?? 'unknown'}>
      <header className="danger-db__header">
        <span className="danger-db__icon" aria-hidden="true">
          <StatusIcon size={18} />
        </span>
        <div>
          <h3>{t('settings.danger.database.title')}</h3>
          <p>{description}</p>
        </div>
        <span className={`settings-database-health settings-database-health--${healthStatus ?? 'unknown'}`}>
          {badgeLabel}
        </span>
      </header>

      <div className="danger-db__facts">
        <span title={pathLabel}>
          <em>{t('settings.danger.database.meta.current')}</em>
          <strong>{formatUpdateBytes(status?.databaseSizeBytes)}</strong>
        </span>
        <span title={latestHealthySnapshot ? formatUpdateBytes(latestHealthySnapshot.databaseSizeBytes) : undefined}>
          <em>{t('settings.danger.database.meta.snapshot')}</em>
          <strong>{snapshotValue}</strong>
        </span>
        <span title={status?.latestArchive ? formatUpdateBytes(status.latestArchive.databaseSizeBytes) : undefined}>
          <em>{t('settings.danger.database.meta.archive')}</em>
          <strong>{archiveValue}</strong>
        </span>
      </div>

      {unhealthy ? (
        <ol className="danger-db__steps">
          {recoverySteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      ) : null}

      {unrecoverable && status?.unrecoverableReason ? (
        <p className="settings-inline-error danger-db__note">{status.unrecoverableReason}</p>
      ) : null}

      <div className="danger-db__toolbar">
        <div className="danger-db__tools">
          <button
            className="settings-action-button"
            type="button"
            disabled={busyAction === 'refresh'}
            onClick={onRefresh}
          >
            <RotateCw className={busyAction === 'refresh' ? 'spinning-icon' : undefined} size={15} />
            {busyAction === 'refresh'
              ? t('settings.danger.database.action.checking')
              : t('settings.danger.database.action.check')}
          </button>
          <button
            className="settings-action-button"
            type="button"
            disabled={busy || dataProtectionDisabled}
            onClick={onCreateSnapshot}
          >
            <Save size={15} />
            {busyAction === 'snapshot'
              ? t('settings.danger.database.action.creating')
              : t('settings.danger.database.action.create')}
          </button>
          <button
            className="settings-action-button"
            type="button"
            disabled={busyAction === 'open'}
            onClick={onOpenFolder}
          >
            <FolderOpen size={15} />
            {t('settings.danger.database.action.open')}
          </button>
          <button
            className="settings-action-button"
            type="button"
            disabled={diagnosticsBusy}
            onClick={onExportDiagnostics}
          >
            <FileText size={15} />
            {diagnosticsBusy
              ? t('settings.danger.database.action.exporting')
              : t('settings.danger.database.action.export')}
          </button>
        </div>
        <div className="danger-db__recover">
          <button
            className="settings-danger-button"
            type="button"
            disabled={primaryActionDisabled}
            onClick={onPrimaryRecovery}
          >
            <ShieldAlert size={15} />
            {busyAction === 'restore' || busyAction === 'scrub'
              ? primaryActionBusyLabel
              : primaryActionLabel}
          </button>
          {quarantined ? (
            <button
              className="settings-danger-button"
              type="button"
              disabled={busy || status?.hasRunningScan || !status?.canScrubQuarantinedDatabase}
              onClick={onDiscardQuarantinedTracks}
            >
              <Trash2 size={15} />
              {busyAction === 'discard'
                ? t('settings.danger.database.action.discarding')
                : t('settings.danger.database.action.discard')}
            </button>
          ) : null}
          <button
            className="settings-action-button"
            type="button"
            disabled={busy}
            onClick={onRelaunchRecovery}
          >
            <Power size={15} />
            {busyAction === 'relaunch'
              ? t('settings.danger.database.action.relaunching')
              : t('settings.danger.database.action.relaunch')}
          </button>
        </div>
      </div>

      {primaryUnavailableReason ? (
        <p className="settings-inline-note danger-db__note">{primaryUnavailableReason}</p>
      ) : null}
      {error ? <p className="settings-inline-error danger-db__note" role="alert">{error}</p> : null}
      {message ? <p className="settings-inline-note danger-db__note" role="status">{message}</p> : null}
      {status?.hasRunningScan ? (
        <p className="settings-inline-error danger-db__note">{t('settings.danger.database.scanRunning')}</p>
      ) : null}

      {latestEvent ? (
        <p className="danger-db__event">
          {t('settings.danger.database.events.title')}
          {' · '}
          {formatProtectionTimestamp(latestEvent.createdAt)}
          {' · '}
          {t(DATABASE_EVENT_LABELS[latestEvent.action])}
        </p>
      ) : null}
    </div>
  );
};
